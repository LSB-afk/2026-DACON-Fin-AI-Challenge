"use client";

/**
 * Agent 실행 — 중앙 운영 사무실 + 상담 패널.
 *
 * 사무실이 주 화면이며 입력·기록·승인은 필요할 때 여는 패널에 둔다.
 * 데스크톱과 모바일은 같은 실행 상태, 답변과 승인 조건을 읽는다.
 */

import { useEffect, useRef, useState } from "react";
import { 예시발화, type AgentLoop, type ApplyPayload, type IntakeFields } from "./_agent-core";
import { AgentOffice } from "./_office";
import { currentStageLabel, gateOpen, type ActorCtx } from "@/lib/officeActors";
import { N_TO_ID, type OfficeCtx } from "@/lib/office";
import { 언어들 } from "@/lib/ai/contract";
import { FLOW } from "@/lib/flow";
import { cases } from "@/lib/cases";
import type { Step, TranslateState } from "./_tabs";
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
  translation,
  translateState,
  onTranslate,
}: {
  loop: AgentLoop;
  /** 활성 고객이 연결된 익명 케이스 id */
  caseId?: string;
  onApply: (p: ApplyPayload) => void;
  /** 대기 고객 선택 → 해당 상담으로 전환 */
  onSelectCase?: (id: string) => void;
  onNavigate?: (view: string, tab?: string) => void;
  translation?: OfficeCtx["translation"];
  translateState?: TranslateState;
  onTranslate?: (language: TranslateState["lang"]) => void;
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

  /* 첫 진입은 중앙 사무실을 보여주며 상담 입력은 명시적으로 연다. */
  const [panelOpen, setPanelOpen] = useState(false);
  function togglePanel(next: boolean) {
    setPanelOpen(next);
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
    if (!narrow) closePanel(false);
  }

  function apply() {
    const p = applyPayload();
    if (p) {
      onApply(p);
      if (!narrow) closePanel(false);
    }
  }

  function scrollToStage(stationId: string) {
    if (stationId === "translate") {
      setPanelOpen(true);
      requestAnimationFrame(() => (document.getElementById("agent-answer") ?? document.querySelector('[data-stage="3단"]') ?? document.getElementById("agent-timeline") ?? document.getElementById("agent-utterance"))?.scrollIntoView({ block: "center" }));
      return;
    }
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

  const actorCtx: ActorCtx = {
    busy, hasResult: !!result, translateLive: !!translateState?.provider?.provider, approvedAt, applyCheckOk: loop.canApprove,
    requests: loop.requests, runId: loop.runId, inputRevision: loop.inputRevision,
    application: loop.application, recordStatus: loop.recordStatus, translation,
  };
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
      <label htmlFor="agent-utterance" className="mt-4 block text-2xs font-semibold text-[var(--muted)]">상담 내용 (아무 문장이나 자유롭게)</label>
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
        <label htmlFor="agent-today" className="block text-2xs font-semibold text-[var(--muted)]">기준일</label>
        <input
          id="agent-today"
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
      {busy && <button onClick={loop.cancel} className="mt-2 w-full rounded-lg border border-[var(--line)] py-2 text-sm font-semibold">실행 취소</button>}
      {error && <p role="alert" className="mt-2 rounded-md border border-[var(--warning)] bg-[var(--warning-soft)] px-3 py-2 text-xs text-[var(--warning-ink)]">{error}</p>}
      <p className="mt-3 text-center text-2xs leading-relaxed text-[var(--muted-soft)]">
        <span className="block">AI 단계가 막혀도 판정 결과 보기의 입력 패널에서 같은 값을 직접 넣어 판정할 수 있습니다.</span>
        <span className="block">AI는 돕기만 하고, 결정은 코드가 합니다.</span>
      </p>
    </div>
  );

  const timelineSection = (
    <div className="mt-6">
      <h3 className="text-sm font-bold">업무 실행 기록</h3>
      <p className="mt-1 text-2xs text-[var(--muted)]">업무 분류와 정보 추출을 함께 요청합니다. 필요한 결과가 준비되면 판정·검토·답변 작성으로 이어집니다. 요청별 완료와 실패를 따로 확인할 수 있습니다.</p>
      {steps.length === 0 ? (
        <div className="mt-3 rounded-lg border border-dashed border-[var(--line)] bg-[var(--surface)] px-6 py-10 text-center text-sm text-[var(--muted)]">
          중앙 로비에서 상담을 시작하면 부서별 처리 기록이 표시됩니다.
        </div>
      ) : (
        <ol id="agent-timeline" className="mt-3 overflow-hidden rounded-lg border border-[var(--line)]">
          {steps.map((s: Step, i: number) => {
            const isRunning = (s.n === "0단" && loop.requests.routing.status === "running") || (s.n === "1단" && loop.requests.extract.status === "running");
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
              <Pill tone="muted">승인 전 · 결과 적용 대기</Pill>
            )}
          </div>
          <p className="mt-1 text-2xs leading-relaxed text-[var(--muted)]">
            AI가 뽑은 값은 초안입니다. 원문 근거와 비교해 틀리면 바로 고치세요.
            현재 입력으로 계산한 결과를 검토한 뒤 승인하면 결과를 적용할 수 있습니다. 값을 고치면 승인이 풀립니다.
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
                  <label htmlFor={`agent-field-${key}`} className="block text-2xs font-semibold text-[var(--muted)]">{name}</label>
                  {type === "visa" ? (
                    <select
                      id={`agent-field-${key}`}
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
                      id={`agent-field-${key}`}
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
                disabled={!loop.canApprove}
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
      {canApply && loop.application !== "applied" && (
        <button
          onClick={apply}
          className="w-full rounded-lg border-2 border-[var(--accent)] bg-[var(--accent-tint)] py-3 text-sm font-bold text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white motion-press"
        >
          {finalSkillId === "payslip" ? "명세서 입력으로 이동 ▶" : "승인한 결과 적용 · 상담 완료"}
        </button>
      )}
      {loop.application === "applied" && <p className="rounded-lg border border-[var(--good)] bg-[var(--good-soft)] px-3 py-2 text-sm font-semibold text-[var(--good-ink)]">결과 적용 · 상담 기록 완료</p>}
      {loop.application === "applied" && onNavigate && <button onClick={() => onNavigate("monitor", "findings")} className="mt-2 w-full rounded-lg border border-[var(--line)] px-3 py-2 text-sm font-semibold">판정 결과 자세히 보기</button>}
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

  const answerSection = loop.finalAnswer && !busy && (
    <section id="agent-answer" className="mt-5 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3">
      <h3 className="text-sm font-bold">답변 확인 · 번역</h3>
      <p className="mt-1 text-2xs text-[var(--muted)]">현재 확인한 입력으로 만든 답변입니다. 번역할 때도 금액과 날짜를 그대로 보존합니다.</p>
      {translateState && onTranslate && <div className="mt-3 flex flex-wrap gap-1.5" aria-label="답변 언어">
        {[{ code: "ko" as const, label: "한국어 원문" }, ...언어들].map((language) => <button
          key={language.code}
          aria-pressed={translateState.lang === language.code}
          disabled={language.code !== "ko" && !translateState.provider?.provider}
          onClick={() => onTranslate(language.code)}
          className={`rounded-full border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50 ${translateState.lang === language.code ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--line)] bg-[var(--panel)]"}`}
        >{language.label}</button>)}
      </div>}
      <p role="status" className="mt-2 text-xs leading-relaxed text-[var(--muted)]">{translation?.detail ?? "한국어 답변 준비 완료"}</p>
      {translateState && !translateState.provider?.provider && <p className="mt-1 text-2xs text-[var(--muted)]">번역 서비스 미연결 · 한국어 원문을 사용할 수 있습니다.</p>}
      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-semibold">답변 내용 펼치기</summary>
        {(() => {
          const answer = translateState?.done && translateState.done.lang === translateState.lang ? translateState.done.answer : loop.finalAnswer;
          return answer && <div className="mt-2 space-y-2 text-xs leading-relaxed">
            <p className="font-bold">{answer.headline}</p>
            {answer.blocks.map((block, i) => <p key={`${block.rule}-${i}`}>{block.lines.join(" ")}</p>)}
            {answer.todo.map((text, i) => <p key={`todo-${i}`}>{text}</p>)}
            {answer.notices.map((text, i) => <p key={`notice-${i}`} className="text-[var(--muted)]">{text}</p>)}
          </div>;
        })()}
      </details>
    </section>
  );

  const caseInfo = caseId
    ? (() => {
        const c = cases.find((x) => x.id === caseId);
        return c ? { id: c.id, badge: c.badge, kind: c.kind } : { id: caseId, badge: "상담", kind: "unknown" };
      })()
    : undefined;

  /* 모바일 — 사무실 요약과 실행·승인 기능 */
  if (narrow) {
    return (
      <div className="px-4 py-6">
        <SectionHead en="AGENT RUN" ko={navLabel("agent-run")} />
        <Sentences
          className="mt-1.5 text-sm leading-relaxed text-[var(--muted)]"
          text="자유롭게 쓴 문장은 AI가 읽고 정리합니다. 판정, 검사, 용어 대조, 답변 작성은 언제나 같은 답을 내는 코드가 합니다."
        />
        <div className="mt-4 border-b-2 border-[var(--line-strong)]" />
        <div className="mt-4">
          <h3 className="text-base font-bold tracking-tight">Fin:AI 운영 사무실</h3>
          <AgentOffice
            runtime={actorCtx}
            caseInfo={caseInfo}
            queue={cases.filter((c) => c.id !== caseId).map((c) => ({ id: c.id, badge: c.badge, kind: c.kind }))}
            onSelectCase={onSelectCase}
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
        <div className="mt-4">{inputSection}</div>
        {timelineSection}
        {approvalSection}
        {answerSection}
      </div>
    );
  }

  /* 데스크톱 — 전체 사무실과 운영 패널 */
  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 얇은 상태 바 — 패널이 닫혀도 현재 고객·연결·단계·승인이 보인다 */}
      <div className="flex flex-wrap items-center gap-2 border-b-2 border-[var(--line-strong)] px-4 py-2.5">
        <div className="min-w-0">
          <span className="eyebrow">FIN:AI OPERATIONS OFFICE</span>
          <h2 className="text-base font-bold leading-tight tracking-tight">{navLabel("agent-run")} · 운영 사무실</h2>
        </div>
        <div className="mx-2 h-8 w-px bg-[var(--line)]" aria-hidden />
        {caseInfo && <Pill tone="accent">{caseInfo.id} · {caseInfo.badge}</Pill>}
        <Pill tone={live ? "ok" : "warn"}>{live ? `${provider?.provider}:${provider?.model}` : "AI 미연결"}</Pill>
        <Pill tone={needsInput ? "warn" : "muted"}>{stageLabel}</Pill>
        <Pill tone={gateOpen(actorCtx) ? "ok" : "muted"}>{loop.application === "applied" ? "결과 적용 · 기록 완료" : approvedAt ? "승인 완료 · 결과 적용 대기" : "상담사 검토 전"}</Pill>
        <div className="ml-auto flex items-center gap-2">
          {busy && <button onClick={loop.cancel} className="rounded-md border border-[var(--line)] px-2.5 py-1.5 text-xs font-bold">실행 취소</button>}
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

      {error && !panelOpen && <div role="alert" className="flex items-center justify-between gap-3 border-b border-[var(--warning)] bg-[var(--warning-soft)] px-4 py-2 text-xs text-[var(--warning-ink)]">
        <span>{error}</span>
        <button onClick={() => togglePanel(true)} className="shrink-0 rounded border border-[var(--warning)] px-2 py-1 font-bold">입력 확인 · 다시 실행</button>
      </div>}

      {/* 사무실 + 운영 패널 */}
      <div
        className="relative min-h-0 flex-1"
        onPointerDownCapture={(e) => {
          /* 패널 외부 클릭은 초점을 이동하지 않고 패널을 닫는다. */
          if (panelOpen && !(e.target as HTMLElement).closest("#ops-panel")) closePanel(false);
        }}
      >
        <AgentOffice
          runtime={actorCtx}
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
            {answerSection}
          </div>
        )}
      </div>
    </div>
  );
}
