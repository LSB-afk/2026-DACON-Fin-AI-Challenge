"use client";

/**
 * Agent 실행 — Fin:AI 운영 도시 + 운영 패널.
 *
 * 두 모드(명세 2절):
 *   패널 열림 — 좌측 오버레이 드로어(발화 입력·타임라인·승인). 뒤의 도시는 살아 있다.
 *   패널 닫힘 — 도시가 헤더 아래 전체를 차지. 얇은 상태 바가 현재 고객·단계·승인 유지.
 *
 * 상태 기계는 _agent-core 한 벌(채팅 드로어와 공유) 그대로 — 판정·승인 계약 무접촉.
 * 모바일(<1024px)은 기존 스택 레이아웃 + 칩 도시로 강등된다.
 */

import { useEffect, useRef, useState } from "react";
import { 예시발화, type AgentLoop, type ApplyPayload, type IntakeFields } from "./_agent-core";
import { AgentOffice } from "./_office";
import { currentStageLabel, gateOpen } from "@/lib/officeActors";
import { N_TO_ID } from "@/lib/office";
import { FLOW } from "@/lib/flow";
import { cases } from "@/lib/cases";
import type { Step } from "./_tabs";
import { Icon, Pill, SectionHead, Sentences, useNarrow, navLabel } from "./_ui";

/** 사무실 스테이션 id → 타임라인 단계 번호 (스크롤 이동용) */
const STATION_TO_N: Record<string, string> = {
  routing: "0단",
  extract: "1단",
  judge: "2단",
  guard: "가드",
  ontology: "온톨로지",
  narrate: "3단",
  translate: "3단",
};

const stationName = (id: string) => FLOW.find((s) => s.id === id)?.이름 ?? id;

export function AgentRunView({
  loop,
  caseId,
  onApply,
  onSelectCase,
  onNavigate,
}: {
  loop: AgentLoop;
  /** 활성 고객이 연결된 익명 케이스 id (도시의 고객 표현) */
  caseId?: string;
  onApply: (p: ApplyPayload) => void;
  /** 도시의 대기 고객 클릭 → 그 상담으로 전환 */
  onSelectCase?: (id: string) => void;
  onNavigate?: (view: string, tab?: string) => void;
}) {
  const {
    utterance, setUtterance, todayInput, setTodayInput,
    busy, provider, result, error,
    steps, finalSkillId, needsClarify,
    confirmFields, applyCheck, canApply, approvedAt, setApprovedAt,
    run, editField, approve, downloadRecord, applyPayload,
  } = loop;

  const narrow = useNarrow(1024);
  const live = !!provider?.provider;

  /* ── 운영 패널 — 첫 진입은 열림, 세션 기억 ── */
  const [panelOpen, setPanelOpen] = useState(true);
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      try {
        const v = sessionStorage.getItem("fin-ops-panel");
        if (v === "closed") setPanelOpen(false);
      } catch {}
    });
    return () => cancelAnimationFrame(id);
  }, []);
  function togglePanel(next: boolean) {
    setPanelOpen(next);
    try { sessionStorage.setItem("fin-ops-panel", next ? "open" : "closed"); } catch {}
  }

  /* 닫은 뒤 키보드 초점을 토글 버튼으로 복원 — 포인터 닫기(외부 클릭)는 초점을 훔치지 않는다 */
  const toggleBtnRef = useRef<HTMLButtonElement>(null);
  function closePanel(restoreFocus: boolean) {
    togglePanel(false);
    if (restoreFocus) requestAnimationFrame(() => toggleBtnRef.current?.focus());
  }

  /* 페이전트 원터치(승인 안내)가 패널을 열 수 있는 문 */
  useEffect(() => {
    const onOpen = () => setPanelOpen(true);
    window.addEventListener("paygent-open-ops", onOpen);
    return () => window.removeEventListener("paygent-open-ops", onOpen);
  }, []);

  /* ESC — 패널부터 닫는다 (페이지 전역 ESC보다 먼저, capture) */
  useEffect(() => {
    if (!panelOpen || narrow) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // 같은 노드(window)의 다른 리스너까지 막는다 — 페이지 전역 ESC와의 경쟁 차단
        e.stopImmediatePropagation();
        e.stopPropagation();
        closePanel(true);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- closePanel은 안정 setter만 쓴다
  }, [panelOpen, narrow]);

  /* 패널이 열리면 입력으로 초점 이동 */
  const panelRef = useRef<HTMLDivElement>(null);
  const utterRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (panelOpen && !narrow) utterRef.current?.focus({ preventScroll: true });
  }, [panelOpen, narrow]);

  /* 타임라인 → 지도 요청 (n 증가 = 새 요청) */
  const [mapFocus, setMapFocus] = useState<{ id: string; n: number } | null>(null);

  function runAndWatch() {
    if (!utterance.trim()) {
      run(); // run이 "발화를 입력하세요" 오류를 표시한다 — 검증 실패면 패널을 닫지 않는다
      return;
    }
    run();
    if (!narrow) closePanel(false); // 실행하면 도시의 흐름을 보여준다 — 되돌아오는 길은 상태 바
  }

  function apply() {
    const p = applyPayload();
    if (p) onApply(p);
  }

  function scrollToStage(stationId: string) {
    if (stationId === "input" || stationId === "counselor") {
      setPanelOpen(true);
      const target = stationId === "input" ? "agent-utterance" : "approval-panel";
      let tries = 0;
      const seek = () => {
        const el = document.getElementById(target) ?? document.getElementById("agent-timeline");
        if (el) el.scrollIntoView({ block: "center" });
        else if (++tries < 30) requestAnimationFrame(seek);
      };
      requestAnimationFrame(seek);
      return;
    }
    setPanelOpen(true);
    const n = STATION_TO_N[stationId];
    let tries = 0;
    const seek = () => {
      const el = (n ? document.querySelector(`[data-stage="${n}"]`) : null) ?? document.getElementById("agent-timeline");
      if (el) el.scrollIntoView({ block: "center" });
      else if (++tries < 30) requestAnimationFrame(seek);
    };
    requestAnimationFrame(seek);
  }

  const actorCtx = { busy, hasResult: !!result, translateLive: live, approvedAt, applyCheckOk: applyCheck?.ok ?? false };
  const stageLabel = currentStageLabel(steps, actorCtx, stationName);
  const needsInput = !!result && !busy && applyCheck !== null && !applyCheck.ok;

  /* ── 공유 섹션들 — 드로어(와이드)와 스택(모바일)이 같은 내용을 쓴다 ── */
  const inputSection = (
    <div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Pill tone={live ? "ok" : "warn"}>{live ? `연결됨 ${provider?.provider}:${provider?.model}` : "AI 미연결 (OLLAMA_URL 또는 ANTHROPIC_API_KEY 설정 필요)"}</Pill>
        {live && <span className="text-[var(--muted)]">같은 입력이면 같은 답 · 금액과 날짜 보존 확인</span>}
      </div>
      <p className="mt-3 rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-2xs leading-relaxed text-[var(--muted)]">
        <strong className="text-[var(--ink)]">입력 처리 안내</strong> 여기에 적은 문장은
        어느 검사로 보낼지 정하고 값을 뽑기 위해 AI 서비스(배포: Anthropic API, 로컬: Ollama)로 보내집니다.
        서버는 입력을 저장하지 않지만, 외부 서비스의 처리 방식은 그 서비스의 약관을 따릅니다.
        주민등록번호, 외국인등록번호, 계좌번호, 전화번호는 적지 마세요.
        적더라도 보내기 전에 서버가 막습니다. (분당 20회 제한)
      </p>
      <label className="mt-4 block text-2xs font-semibold text-[var(--muted)]">상담 내용 (아무 문장이나 자유롭게)</label>
      <textarea
        id="agent-utterance"
        ref={utterRef}
        value={utterance}
        onChange={(e) => setUtterance(e.target.value)}
        rows={3}
        placeholder="예: 베트남 사람인데 2023년 9월 1일에 입사해서 2026년 10월 15일에 출국해요 월급은 215만원이에요"
        className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5 text-sm"
      />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {예시발화.map((ex) => (
          <button
            key={ex}
            onClick={() => setUtterance(ex)}
            className="rounded-full border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1 text-2xs font-medium hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            {ex}
          </button>
        ))}
      </div>
      <div className="mt-3">
        <label className="block text-2xs font-semibold text-[var(--muted)]">기준일</label>
        <input
          type="date"
          value={todayInput}
          onChange={(e) => setTodayInput(e.target.value)}
          className="mt-1 w-full max-w-xs rounded-md border border-[var(--line)] bg-[var(--panel)] px-2 py-1.5 text-sm"
        />
        <p className="mt-1 text-2xs text-[var(--muted-soft)]">날짜를 바꾸면 마감 계산이 달라집니다.</p>
      </div>
      <button
        onClick={runAndWatch}
        disabled={busy}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--accent)] py-3 text-sm font-semibold text-white hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-60 motion-press"
      >
        {busy && <span className="motion-spin" aria-hidden />}
        {busy ? "AI 상담 실행 중…" : "AI 상담 실행하기"}
      </button>
      {error && <p className="mt-2 rounded-md border border-[var(--warning)] bg-[var(--warning-soft)] px-3 py-2 text-xs text-[var(--warning-ink)]">{error}</p>}
      <p className="mt-3 text-center text-2xs leading-relaxed text-[var(--muted-soft)]">
        <span className="block">AI 단계가 막혀도 판정 결과 보기의 입력 패널에서 같은 값을 직접 넣어 판정할 수 있습니다.</span>
        <span className="block">AI는 돕기만 하고, 결정은 코드가 합니다.</span>
      </p>
    </div>
  );

  const timelineSection = (
    <div className="mt-6">
      <h3 className="text-sm font-bold">단계 타임라인</h3>
      <p className="mt-1 text-2xs text-[var(--muted)]">검사 고르기, 값 뽑기, 판정, 가드레일, 용어 대조, 답변 순서로 진행합니다. 실패한 단계에는 이유가 함께 표시됩니다.</p>
      {steps.length === 0 ? (
        <div className="mt-3 rounded-lg border border-dashed border-[var(--line)] bg-[var(--surface)] px-6 py-10 text-center text-sm text-[var(--muted)]">
          AI 상담을 실행하면 단계가 차례로 채워집니다.
        </div>
      ) : (
        <ol id="agent-timeline" className="mt-3 overflow-hidden rounded-lg border border-[var(--line)]">
          {steps.map((s: Step, i: number) => {
            const isRunning = s.status === "대기";
            return (
              <li
                key={`${s.n}-${i}`}
                data-stage={s.n}
                className={`flex gap-4 border-b border-[var(--line-soft)] px-4 py-3 last:border-0 motion-stage ${isRunning ? "motion-stage--pulse" : ""}`}
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <span className="w-12 shrink-0 font-mono text-xs font-bold text-[var(--accent)]">{s.n}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{s.label}</span>
                    <Pill tone={s.status === "완료" ? "ok" : s.status === "차단" ? "warn" : "muted"}>{s.status}</Pill>
                    {/* 타임라인 → 지도 양방향 — 그 단계의 건물을 선택·중앙 이동 */}
                    {!narrow && N_TO_ID[s.n] && (
                      <button
                        onClick={() => setMapFocus((cur) => ({ id: N_TO_ID[s.n], n: (cur?.n ?? 0) + 1 }))}
                        className="ml-auto shrink-0 rounded-md border border-[var(--line)] px-2 py-0.5 text-2xs font-bold text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                      >
                        지도에서 보기
                      </button>
                    )}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{s.detail}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );

  const approvalSection = result && !busy && (
    <div className="mt-6">
      {finalSkillId === "departure" && !needsClarify && !result.routerError && (
        <div id="approval-panel" className="mb-3 rounded-lg border-2 border-[var(--line-strong)] bg-[var(--panel)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-bold">상담사 확인 · 승인</h4>
            {approvedAt ? (
              <Pill tone="ok">승인됨 {approvedAt}</Pill>
            ) : (
              <Pill tone="muted">승인 전 (판정으로 넘어가지 않음)</Pill>
            )}
          </div>
          <p className="mt-1 text-2xs leading-relaxed text-[var(--muted)]">
            AI가 뽑은 값은 초안입니다. 원문 근거와 비교해 틀리면 바로 고치세요.
            승인해야 판정과 상담 기록으로 넘어갑니다. 값을 고치면 승인이 풀립니다.
          </p>
          <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
            {(
              [
                { key: "nationality", name: "국적", type: "text" },
                { key: "visa", name: "체류자격", type: "visa" },
                { key: "hireDate", name: "입사일", type: "date" },
                { key: "departureDate", name: "출국일", type: "date" },
                { key: "monthlyWage", name: "월 평균임금 (원)", type: "number" },
              ] as const
            ).map(({ key, name, type }) => {
              const ev = result.intake?.evidences[key as keyof IntakeFields];
              const raw = confirmFields[key as keyof IntakeFields];
              return (
                <div key={key}>
                  <label className="block text-2xs font-semibold text-[var(--muted)]">{name}</label>
                  {type === "visa" ? (
                    <select
                      value={String(raw ?? "")}
                      disabled={!!approvedAt}
                      onChange={(e) => editField(key, e.target.value)}
                      className="mt-0.5 w-full rounded-md border border-[var(--line)] bg-[var(--panel)] px-2 py-1.5 text-sm disabled:opacity-70"
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
                      className="mt-0.5 w-full rounded-md border border-[var(--line)] bg-[var(--panel)] px-2 py-1.5 text-sm disabled:opacity-70"
                    />
                  )}
                  <p className="mt-0.5 truncate text-2xs text-[var(--muted-soft)]">
                    {ev ? <>근거 &ldquo;{ev}&rdquo;</> : "뽑지 못했습니다. 직접 입력하세요"}
                  </p>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {!approvedAt ? (
              <button
                onClick={approve}
                disabled={!applyCheck?.ok}
                className="rounded-lg border-2 border-[var(--accent)] bg-[var(--accent-tint)] px-4 py-2 text-sm font-bold text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white disabled:cursor-not-allowed disabled:opacity-50 motion-press"
              >
                값을 확인했습니다. 승인
              </button>
            ) : (
              <>
                <button
                  onClick={() => setApprovedAt(null)}
                  className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm font-semibold hover:border-[var(--accent)] hover:text-[var(--accent)] motion-press"
                >
                  수정 재개 (승인 해제)
                </button>
                <button
                  onClick={downloadRecord}
                  className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm font-semibold hover:border-[var(--accent)] hover:text-[var(--accent)] motion-press"
                >
                  상담 기록 다운로드 (.md)
                </button>
              </>
            )}
          </div>
          {!approvedAt && !applyCheck?.ok && (
            <p className="mt-1.5 text-2xs text-[var(--muted-soft)]">
              필수 값이 모두 있어야 승인할 수 있습니다. 아래 질문에 답해 주세요.
            </p>
          )}
          {approvedAt && (
            <p className="mt-1.5 text-2xs text-[var(--muted-soft)]">
              승인된 값은 잠깁니다. 기록에는 추출값·수정 여부·승인 시각이 함께 남습니다.
              서버에 저장되지 않으므로 기록은 파일로 보관하세요.
            </p>
          )}
        </div>
      )}
      {canApply && (
        <button
          onClick={apply}
          className="w-full rounded-lg border-2 border-[var(--accent)] bg-[var(--accent-tint)] py-3 text-sm font-bold text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white motion-press"
        >
          {finalSkillId === "payslip" ? "명세서 입력으로 이동 ▶" : "이 값으로 판정 보기 ▶"}
        </button>
      )}
      {!needsClarify && applyCheck && !applyCheck.ok && (
        <div className="rounded-lg border border-[var(--warning)] bg-[var(--warning-soft)] px-4 py-3">
          <p className="text-sm font-bold text-[var(--warning-ink)]">
            {applyCheck.missing.join(" · ")} 값이 없어 판정으로 넘어가지 않습니다
          </p>
          <p className="mt-0.5 text-2xs text-[var(--warning-ink)]">
            빠진 값을 임의로 채우지 않습니다. 국적 하나로 받을 돈이 크게 달라지기 때문입니다.
          </p>
          <ul className="mt-2 list-inside list-disc text-xs leading-relaxed text-[var(--warning-ink)]">
            {applyCheck.questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-[var(--muted)]">
            답을 문장에 담아 다시 실행하거나, 위 상담사 확인 패널에서 바로 입력하세요.
          </p>
        </div>
      )}
      {needsClarify && <p className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--muted)]">어느 검사로 보낼지 정하기 어렵습니다. 예시처럼 급여 문제인지 출국 정산인지 분명히 말해 주세요.</p>}
      {result.router && <details className="mt-2"><summary className="cursor-pointer text-xs font-semibold">AI 원본 응답 (개발자용)</summary><pre className="mt-1 whitespace-pre-wrap rounded border border-[var(--line)] bg-[var(--surface)] p-2 text-2xs">{result.routerRaw.slice(0, 800)}</pre><pre className="mt-1 whitespace-pre-wrap rounded border border-[var(--line)] bg-[var(--surface)] p-2 text-2xs">{result.intakeRaw.slice(0, 800)}</pre></details>}
    </div>
  );

  /* ── 모바일 — 기존 스택 + 칩 도시 (기능 유지) ── */
  if (narrow) {
    return (
      <div className="px-4 py-6">
        <SectionHead en="AGENT RUN" ko={navLabel("agent-run")} />
        <Sentences
          className="mt-1.5 text-sm leading-relaxed text-[var(--muted)]"
          text="자유롭게 쓴 문장은 AI가 읽고 정리합니다. 판정, 검사, 용어 대조, 답변 작성은 언제나 같은 답을 내는 코드가 합니다."
        />
        <div className="mt-4 border-b-2 border-[var(--line-strong)]" />
        <div className="mt-4">{inputSection}</div>
        {timelineSection}
        {approvalSection}
        <div className="mt-6 border-t-2 border-[var(--line-strong)] pt-3">
          <h3 className="text-base font-bold tracking-tight">Fin:AI 운영 도시</h3>
          <AgentOffice
            steps={steps}
            busy={busy}
            hasResult={!!result}
            translateLive={live}
            approvedAt={approvedAt}
            applyCheckOk={applyCheck?.ok ?? false}
            onStationClick={scrollToStage}
            onNavigate={onNavigate}
          />
        </div>
      </div>
    );
  }

  /* ── 데스크톱 — 전체 화면 도시 + 오버레이 운영 패널 ── */
  const caseInfo = caseId
    ? (() => {
        const c = cases.find((x) => x.id === caseId);
        return c ? { id: c.id, badge: c.badge, kind: c.kind } : { id: caseId, badge: "상담", kind: "unknown" };
      })()
    : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 얇은 상태 바 — 패널이 닫혀도 현재 고객·연결·단계·승인이 보인다 */}
      <div className="flex flex-wrap items-center gap-2 border-b-2 border-[var(--line-strong)] px-4 py-2.5">
        <div className="min-w-0">
          <span className="eyebrow">FIN:AI OPERATIONS CITY</span>
          <h2 className="text-base font-bold leading-tight tracking-tight">{navLabel("agent-run")} · 운영 도시</h2>
        </div>
        <div className="mx-2 h-8 w-px bg-[var(--line)]" aria-hidden />
        {caseInfo && <Pill tone="accent">{caseInfo.id} · {caseInfo.badge}</Pill>}
        <Pill tone={live ? "ok" : "warn"}>{live ? `${provider?.provider}:${provider?.model}` : "AI 미연결"}</Pill>
        <Pill tone={needsInput ? "warn" : "muted"}>{stageLabel}</Pill>
        <Pill tone={approvedAt ? "ok" : "muted"}>{approvedAt ? "승인 완료 · 결과 게이트 열림" : gateOpen(actorCtx) ? "결과 게이트 열림" : "결과 게이트 잠김"}</Pill>
        <div className="ml-auto flex items-center gap-2">
          {needsInput && !panelOpen && (
            <button
              onClick={() => togglePanel(true)}
              className="rounded-md border border-[var(--warning)] bg-[var(--warning-soft)] px-2.5 py-1.5 text-xs font-bold text-[var(--warning-ink)] motion-press"
            >
              입력 보완 필요 · 상담 입력 열기
            </button>
          )}
          <button
            ref={toggleBtnRef}
            onClick={() => togglePanel(!panelOpen)}
            aria-expanded={panelOpen}
            aria-controls="ops-panel"
            className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-bold motion-press ${panelOpen ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--accent)] bg-[var(--accent-tint)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white"}`}
          >
            <Icon name={panelOpen ? "block" : "agent"} cls="h-3.5 w-3.5" />
            {panelOpen ? "운영 패널 닫기" : "상담 입력 열기"}
          </button>
        </div>
      </div>

      {/* 도시 + 오버레이 패널 */}
      <div
        className="relative min-h-0 flex-1"
        onPointerDownCapture={(e) => {
          /* 패널 외부(도시) 클릭 → 패널 닫기. 포인터 사용자라 초점은 훔치지 않는다 */
          if (panelOpen && !(e.target as HTMLElement).closest("#ops-panel")) closePanel(false);
        }}
      >
        <AgentOffice
          fill
          steps={steps}
          busy={busy}
          hasResult={!!result}
          translateLive={live}
          approvedAt={approvedAt}
          applyCheckOk={applyCheck?.ok ?? false}
          onStationClick={scrollToStage}
          caseInfo={caseInfo}
          queue={cases.filter((c) => c.id !== caseId).map((c) => ({ id: c.id, badge: c.badge, kind: c.kind }))}
          onSelectCase={onSelectCase}
          onOpenPanel={() => togglePanel(true)}
          onNavigate={onNavigate}
          focusRequest={mapFocus}
        />

        {panelOpen && (
          <div
            id="ops-panel"
            ref={panelRef}
            role="region"
            aria-label="운영 패널 (상담 입력, 진행 단계, 승인)"
            className="absolute inset-y-0 left-0 z-30 overflow-y-auto border-r-2 border-[var(--line-strong)] bg-[var(--panel)]/97 px-5 py-4 shadow-[var(--shadow-2)] motion-fade"
            style={{ width: "clamp(420px, 38vw, 720px)", backdropFilter: "blur(2px)" }}
          >
            <div className="flex items-center justify-between">
              <span className="eyebrow">OPERATIONS PANEL</span>
              <button
                onClick={() => closePanel(true)}
                aria-label="운영 패널 닫기"
                className="grid h-7 w-7 place-items-center rounded-md border border-[var(--line)] text-[var(--muted)] hover:bg-[var(--surface)]"
              >
                ✕
              </button>
            </div>
            {inputSection}
            {timelineSection}
            {approvalSection}
          </div>
        )}
      </div>
    </div>
  );
}
