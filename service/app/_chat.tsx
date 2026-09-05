"use client";

/**
 * 플로팅 Agent 채팅 드로어 — 어느 화면에서든 우하단 버튼으로 연다.
 *
 * 로직은 한 줄도 새로 만들지 않는다: 상태 기계는 페이지가 든 useAgentLoop
 * 한 벌이고(Agent 실행 화면과 같은 인스턴스 — 같은 대화, 같은 승인 상태),
 * 이 파일은 그것을 대화 모양으로 그릴 뿐이다. 승인 게이트·기본값 금지·PII
 * 차단·원장 기록 전부 같은 경로를 지난다.
 */

import { useEffect, useRef } from "react";
import type { AgentLoop, ApplyPayload, IntakeFields } from "./_agent-core";
import { Icon, Pill } from "./_ui";
import type { Step } from "./_tabs";

/** 대화 말풍선 — role 이 곧 정렬·면 색이다 */
const 말풍선 = {
  user: "ml-8 rounded-[var(--radius-card)] rounded-tr-md border border-[var(--accent-tint-line)] bg-[var(--accent-tint)]",
  agent: "mr-8 rounded-[var(--radius-card)] rounded-tl-md border border-[var(--line)] bg-[var(--surface)]",
};

const 필드칸 =
  "mt-0.5 w-full rounded-md border border-[var(--line)] bg-[var(--panel)] px-2 py-1.5 text-sm disabled:opacity-70";

export function AgentChatDrawer({
  loop,
  onClose,
  onOpenFull,
  onApply,
}: {
  loop: AgentLoop;
  onClose: () => void;
  /** "Agent 실행 화면에서 자세히" — 같은 인스턴스라 대화가 그대로 이어진다 */
  onOpenFull: () => void;
  onApply: (p: ApplyPayload) => void;
}) {
  const {
    utterance, setUtterance, todayInput, setTodayInput,
    busy, provider, result, error, steps,
    finalSkillId, needsClarify, confirmFields, applyCheck, canApply,
    approvedAt, setApprovedAt, run, editField, approve, downloadRecord, applyPayload,
  } = loop;

  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  /* 열리면 입력창으로 초점 이동 + Tab 을 드로어 안에 가둔다 (dialog 최소 규약) */
  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const live = !!provider?.provider;

  function applyAndClose() {
    const p = applyPayload();
    if (p) onApply(p);
  }

  return (
    <>
      {/* 뒤판 — 눌러도 닫힌다 */}
      <button
        aria-label="Agent 채팅 닫기"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-[var(--ink)]/25"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Agent 채팅"
        className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col rounded-t-2xl border border-[var(--line)] bg-[var(--panel)] shadow-[var(--shadow-2)] min-[640px]:inset-x-auto min-[640px]:inset-y-0 min-[640px]:bottom-auto min-[640px]:right-0 min-[640px]:h-screen min-[640px]:max-h-none min-[640px]:w-[440px] min-[640px]:rounded-none min-[640px]:border-y-0 min-[640px]:border-r-0 motion-fade"
      >
        {/* 머리 */}
        <div className="flex items-center justify-between gap-2 border-b-2 border-[var(--line-strong)] px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <Icon name="agent" cls="text-[var(--accent)]" />
            <span className="font-bold">Agent 채팅</span>
            <Pill tone={live ? "ok" : "warn"}>{live ? `${provider?.provider}:${provider?.model}` : "미연결"}</Pill>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              onClick={onOpenFull}
              className="rounded-md border border-[var(--line)] px-2.5 py-1 text-2xs font-semibold text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              전체 화면 ▶
            </button>
            <button
              onClick={onClose}
              aria-label="닫기"
              className="grid h-7 w-7 place-items-center rounded-md border border-[var(--line)] text-[var(--muted)] hover:bg-[var(--surface)]"
            >
              ✕
            </button>
          </div>
        </div>

        {/* 대화 본문 */}
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          <p className="text-2xs leading-relaxed text-[var(--muted-soft)]">
            발화는 라우팅·추출을 위해 설정된 모델 제공자로 전송됩니다(서버 저장 없음).
            주민·외국인등록번호, 계좌번호, 전화번호는 입력하지 마세요 — 전송 전에 차단됩니다.
          </p>

          {!result && !busy && (
            <div className={`px-4 py-3 text-sm leading-relaxed ${말풍선.agent}`}>
              무엇을 도와드릴까요? 출국 정산이나 급여명세서 상황을 한 문장으로
              말씀해 주세요. 판정은 코드가, 라우팅·추출은 모델이 합니다.
            </div>
          )}

          {(result || busy) && (
            <div className={`px-4 py-3 text-sm leading-relaxed ${말풍선.user}`}>
              {result?.utterance ?? utterance}
            </div>
          )}

          {busy && (
            <div className={`px-4 py-3 text-sm ${말풍선.agent} motion-shimmer`}>
              실행 중 — 라우팅·추출을 기다리고 있습니다…
            </div>
          )}
          {error && !busy && (
            <div className="rounded-md border border-[var(--warning)] bg-[var(--warning-soft)] px-3 py-2 text-xs text-[var(--warning-ink)]">{error}</div>
          )}

          {/* 단계 진행 — 타임라인과 같은 steps, 압축 렌더 */}
          {steps.length > 0 && !busy && (
            <div className={`px-4 py-3 ${말풍선.agent}`}>
              <p className="text-2xs font-bold text-[var(--muted)]">실행 단계</p>
              <ul className="mt-1.5 space-y-1">
                {steps.map((s: Step, i: number) => (
                  <li key={`${s.n}-${i}`} className="flex items-center gap-2 text-xs">
                    <span className="w-11 shrink-0 font-mono font-bold text-[var(--accent)]">{s.n}</span>
                    <span className="font-semibold">{s.label}</span>
                    <Pill tone={s.status === "완료" ? "ok" : s.status === "차단" ? "warn" : "muted"}>{s.status}</Pill>
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-2xs text-[var(--muted-soft)]">단계별 상세는 [전체 화면 ▶]에서 — 같은 대화가 그대로 이어집니다.</p>
            </div>
          )}

          {/* 되묻기 + 상담사 확인·승인 — Agent 실행 화면과 같은 게이트 */}
          {result && !busy && finalSkillId === "departure" && !needsClarify && !result.routerError && (
            <div className={`px-4 py-3 ${말풍선.agent}`}>
              {applyCheck && !applyCheck.ok && (
                <>
                  <p className="text-sm font-bold text-[var(--warning-ink)]">
                    {applyCheck.missing.join(" · ")}이(가) 더 필요합니다
                  </p>
                  <ul className="mt-1 list-inside list-disc text-xs leading-relaxed text-[var(--warning-ink)]">
                    {applyCheck.questions.map((q) => (
                      <li key={q}>{q}</li>
                    ))}
                  </ul>
                </>
              )}
              <p className="mt-2 text-2xs leading-relaxed text-[var(--muted)]">
                {approvedAt
                  ? `상담사 승인됨 ${approvedAt} — 값이 잠겼습니다.`
                  : "모델 추출값은 초안입니다. 확인·수정 후 승인해야 판정으로 넘어갑니다."}
              </p>
              <div className="mt-2 space-y-2">
                {(
                  [
                    { key: "nationality", name: "국적", type: "text" },
                    { key: "visa", name: "체류자격", type: "visa" },
                    { key: "hireDate", name: "입사일", type: "date" },
                    { key: "departureDate", name: "출국일", type: "date" },
                    { key: "monthlyWage", name: "월 평균임금 (원)", type: "number" },
                  ] as const
                ).map(({ key, name, type }) => {
                  const raw = confirmFields[key as keyof IntakeFields];
                  return (
                    <label key={key} className="block text-2xs font-semibold text-[var(--muted)]">
                      {name}
                      {type === "visa" ? (
                        <select
                          value={String(raw ?? "")}
                          disabled={!!approvedAt}
                          onChange={(e) => editField(key, e.target.value)}
                          className={필드칸}
                        >
                          <option value="">선택 안 됨</option>
                          {["E-9", "H-2", "E-8", "기타"].map((v) => (
                            <option key={v} value={v}>{v}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type={type}
                          value={String(raw ?? "")}
                          disabled={!!approvedAt}
                          onChange={(e) =>
                            editField(
                              key,
                              type === "number"
                                ? e.target.value === "" ? undefined : Number(e.target.value)
                                : e.target.value,
                            )
                          }
                          className={필드칸}
                        />
                      )}
                    </label>
                  );
                })}
              </div>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {!approvedAt ? (
                  <button
                    onClick={approve}
                    disabled={!applyCheck?.ok}
                    className="rounded-lg border-2 border-[var(--accent)] bg-[var(--accent-tint)] px-3 py-1.5 text-xs font-bold text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white disabled:cursor-not-allowed disabled:opacity-50 motion-press"
                  >
                    값을 확인했습니다 — 승인
                  </button>
                ) : (
                  <>
                    <button
                      onClick={applyAndClose}
                      disabled={!canApply}
                      className="rounded-lg border-2 border-[var(--accent)] bg-[var(--accent-tint)] px-3 py-1.5 text-xs font-bold text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white disabled:opacity-50 motion-press"
                    >
                      이 값으로 판정 보기 ▶
                    </button>
                    <button
                      onClick={downloadRecord}
                      className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-semibold hover:border-[var(--accent)] hover:text-[var(--accent)] motion-press"
                    >
                      상담 기록 (.md)
                    </button>
                    <button
                      onClick={() => setApprovedAt(null)}
                      className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-semibold hover:border-[var(--accent)] hover:text-[var(--accent)] motion-press"
                    >
                      수정 재개
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {result && !busy && finalSkillId === "payslip" && canApply && (
            <div className={`px-4 py-3 ${말풍선.agent}`}>
              <p className="text-sm leading-relaxed">
                급여명세서 상담입니다 — 명세서 값은 발화에 없으므로 입력 폼으로 안내합니다.
              </p>
              <button
                onClick={applyAndClose}
                className="mt-2 rounded-lg border-2 border-[var(--accent)] bg-[var(--accent-tint)] px-3 py-1.5 text-xs font-bold text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white motion-press"
              >
                명세서 입력으로 이동 ▶
              </button>
            </div>
          )}

          {result && !busy && needsClarify && (
            <div className={`px-4 py-3 text-sm leading-relaxed ${말풍선.agent}`}>
              라우팅이 애매합니다 — 급여나 출국 중 한 가지를 분명히 말해 주세요.
            </div>
          )}
        </div>

        {/* 입력 */}
        <div className="border-t border-[var(--line)] px-4 py-3">
          <textarea
            ref={inputRef}
            value={utterance}
            onChange={(e) => setUtterance(e.target.value)}
            rows={2}
            placeholder="예: 네팔 사람인데 연금을 받을 수 있나요"
            className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm"
          />
          <div className="mt-2 flex items-center gap-2">
            <input
              type="date"
              value={todayInput}
              onChange={(e) => setTodayInput(e.target.value)}
              aria-label="기준일"
              className="rounded-md border border-[var(--line)] bg-[var(--panel)] px-2 py-1.5 text-xs"
            />
            <button
              onClick={run}
              disabled={busy}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[var(--accent)] py-2 text-sm font-semibold text-white hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-60 motion-press"
            >
              {busy && <span className="motion-spin" aria-hidden />}
              {busy ? "실행 중…" : "에이전트 실행"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
