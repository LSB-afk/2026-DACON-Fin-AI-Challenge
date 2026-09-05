"use client";

/** One consultation loop owns request identity, accepted input, approval and application. */
import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { routeByKeyword } from "@/lib/skills";
import { buildConsultRecord } from "@/lib/consult";
import { evaluateAgentInput } from "@/lib/agentEvaluation";
import { AgentRunScope, emptyAgentRequests, readAgentResponse, type AgentResponse } from "@/lib/agentExecution";
import type { IntakeFields } from "@/lib/ai/apply";
import type { Step } from "./_tabs";

export type { AgentResponse, IntakeFields };
export type AgentProvider = { provider: "anthropic" | "ollama" | null; model?: string } | null;
export type ApplyPayload = {
  label: string; caseId: string; today?: string; nationality?: string;
  visa?: "E-9" | "H-2" | "E-8" | "기타"; hireDate?: string; departureDate?: string;
  wage?: number; size?: "5인이상" | "5인미만" | "모름";
};
export type ModelCallSink = (
  calls: { stage: string; ok: boolean; note?: string; ms?: number; inTok?: number; outTok?: number }[],
  meta: { provider: string; model: string },
) => void;
export const 예시발화 = [
  "다음 달에 고향에 돌아가요",
  "베트남 사람인데 2023년 9월 1일에 입사해서 2026년 10월 15일에 출국해요 월급은 215만원이에요",
  "월급에서 산재보험을 떼가는데 맞나요",
  "은행에서 계좌를 안 만들어줘요",
  "네팔 사람인데 연금을 받을 수 있나요",
];

export function useAgentLoop({ today, onModelCalls, initialCaseId }: { today: string; onModelCalls?: ModelCallSink; initialCaseId?: string }) {
  const [scope] = useState(() => new AgentRunScope());
  const [utterance, setUtteranceRaw] = useState(예시발화[1]);
  const [todayInput, setTodayInputRaw] = useState(today);
  const [caseId, setCaseId] = useState<string | null>(initialCaseId ?? null);
  const [runId, setRunId] = useState<string | null>(null);
  const [inputRevision, setInputRevision] = useState(0);
  const [requests, setRequests] = useState(emptyAgentRequests);
  const [busy, setBusy] = useState(false);
  const [provider, setProvider] = useState<AgentProvider>(null);
  const [result, setResult] = useState<AgentResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [edited, setEdited] = useState<IntakeFields | null>(null);
  const [approvedAt, setApprovedAtRaw] = useState<string | null>(null);
  const [application, setApplication] = useState<"idle" | "applied">("idle");
  const [recordStatus, setRecordStatus] = useState<"idle" | "completed">("idle");
  const [recordDownloaded, setRecordDownloaded] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/agent", { signal: controller.signal })
      .then((r) => r.json()).then((value) => { if (!controller.signal.aborted) setProvider(value); })
      .catch(() => { if (!controller.signal.aborted) setProvider({ provider: null }); });
    return () => { controller.abort(); scope.invalidate(); };
  }, [scope]);

  function setApprovedAt(value: string | null) {
    scope.bumpGeneration();
    setApprovedAtRaw(value);
    setApplication("idle");
    setRecordStatus("idle");
    setRecordDownloaded(false);
  }

  function invalidate(clearResult: boolean) {
    scope.invalidate();
    setInputRevision((value) => value + 1);
    setBusy(false);
    setApprovedAt(null);
    if (clearResult) {
      setResult(null);
      setEdited(null);
      setRequests(emptyAgentRequests());
      setRunId(null);
      setError(null);
    }
  }

  function setUtterance(value: string) {
    if (value === utterance) return;
    invalidate(true);
    setUtteranceRaw(value);
  }
  function setTodayInput(value: string) {
    if (!value || value === todayInput) return;
    invalidate(busy);
    setTodayInputRaw(value);
  }
  // Prop changes synchronize once. Applying the already-visible date preserves its approval.
  const syncToday = useEffectEvent(() => { if (today !== todayInput) setTodayInput(today); });
  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) syncToday(); });
    return () => { active = false; };
  }, [today]);

  function resetCase(value: string) {
    if (value === caseId) return;
    invalidate(true);
    setCaseId(value);
  }
  function cancel() { invalidate(true); }

  const keywordRoutes = useMemo(() => routeByKeyword(utterance), [utterance]);
  const finalSkillId = keywordRoutes[0]?.skill.id ?? null;
  const needsClarify = keywordRoutes.length === 0 || (keywordRoutes.length > 1 && keywordRoutes[0].score === keywordRoutes[1].score);
  const confirmFields = useMemo<IntakeFields>(() => edited ?? result?.intake?.fields ?? {}, [edited, result]);
  const evaluation = useMemo(() => evaluateAgentInput({
    fields: confirmFields, today: todayInput, utterance: result?.utterance ?? utterance, skillId: finalSkillId, needsClarify,
    caseId: caseId ?? undefined,
    requestError: result?.routerError ?? result?.intakeError,
  }), [confirmFields, todayInput, utterance, finalSkillId, needsClarify, result, caseId]);
  const applyCheck = result ? evaluation.applyCheck : null;
  const finalAnswer = result && !busy ? evaluation.answer : null;
  const canApprove = !!result && !busy && evaluation.canApprove;
  const canApply = !!result && !busy && !needsClarify && !result.routerError && !result.intakeError
    && (finalSkillId === "payslip" || (canApprove && !!approvedAt));
  const generation = scope.generation;

  async function run() {
    if (!utterance.trim()) { setError("상담 내용을 입력하세요."); return; }
    const token = scope.start(crypto.randomUUID(), inputRevision, caseId ?? undefined);
    setRunId(token.runId);
    setBusy(true); setError(null); setResult(null); setEdited(null);
    setApprovedAt(null); setRequests(emptyAgentRequests());
    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/x-ndjson" },
        body: JSON.stringify({ utterance: utterance.trim(), today: todayInput, runId: token.runId, inputRevision: token.inputRevision, caseId: token.caseId }),
        signal: token.signal,
      });
      const res = await readAgentResponse(response, token, (event) => {
        if (!scope.isCurrent(token)) return;
        if (event.type === "request") setRequests((previous) => ({ ...previous, [event.stage]: event.request }));
      });
      if (!scope.isCurrent(token)) return;
      setResult(res);
      setRequests({
        routing: { status: res.routerError ? "failed" : "completed", detail: res.routerError ?? "라우팅 응답 검증 완료", ms: res.routerUsage?.ms },
        extract: { status: res.intakeError ? "failed" : "completed", detail: res.intakeError ?? "추출 응답 검증 완료", ms: res.intakeUsage?.ms },
      });
      onModelCalls?.([
        { stage: "0단 LLM 라우팅", ok: !res.routerError, note: res.routerError ?? undefined, ...(res.routerUsage ?? {}) },
        { stage: "1단 값 뽑기", ok: !res.intakeError, note: res.intakeError ?? undefined, ...(res.intakeUsage ?? {}) },
      ], { provider: res.provider, model: res.model });
    } catch (failure) {
      if (!scope.isCurrent(token)) return;
      const detail = failure instanceof Error ? failure.message : String(failure);
      setError(detail);
      setRequests((previous) => ({
        routing: previous.routing.status === "completed" ? previous.routing : { status: "failed", detail },
        extract: previous.extract.status === "completed" ? previous.extract : { status: "failed", detail },
      }));
    } finally {
      if (scope.isCurrent(token)) setBusy(false);
    }
  }

  const steps: Step[] = [];
  if (runId || result || busy) {
    for (const [stage, n, label] of [["routing", "0단", "라우팅"], ["extract", "1단", "값 뽑기"]] as const) {
      const request = requests[stage];
      let detail = request.detail ?? (busy ? "요청 접수를 기다립니다." : "실행 전입니다.");
      if (result && stage === "routing" && !result.routerError) {
        const kw = finalSkillId ?? "none";
        detail = "키워드 판단: " + kw + " / AI 판단: " + (result.router?.skill ?? "없음") + ". "
          + (kw === result.router?.skill ? "둘이 같습니다." : "둘이 달라 키워드 판단을 따릅니다.")
          + " 근거: " + (result.router?.evidence.join(", ") || "없음")
          + (result.router?.filteredCount ? " · 원문에 없는 근거 " + result.router.filteredCount + "건 제외" : "");
      }
      if (result && stage === "extract" && !result.intakeError) {
        detail = (edited ? "상담사 확인값: " : "추출값: ") + (Object.entries(confirmFields).filter(([, value]) => value !== undefined).map(([key, value]) => key + "=" + value).join(" · ") || "추출값이 없습니다.");
        const evidence = Object.entries(result.intake?.evidences ?? {}).map(([key, value]) => key + "←" + value).join(" · ");
        if (evidence) detail += " | 원문 근거: " + evidence;
        if (result.intake?.discarded.length) detail += " · 제외: " + result.intake.discarded.map((d) => d.field + "(" + d.reason + ")").join(" / ");
      }
      steps.push({ n, label, status: request.status === "failed" ? "차단" : request.status === "completed" ? "완료" : "대기", detail, ms: request.ms });
    }
    if (result) steps.push(...evaluation.steps.map((step) => ({ ...step, detail: step.detail ?? "" })));
  }

  function editField(key: keyof IntakeFields, value: string | number | undefined) {
    invalidate(false);
    setEdited({ ...confirmFields, [key]: value === "" ? undefined : value });
  }
  function approve() {
    if (!canApprove) return;
    setApprovedAt(new Date().toLocaleString("sv-SE").slice(0, 16));
  }
  function applyPayload(): ApplyPayload | null {
    if (!canApply || !result) return null;
    if (finalSkillId === "payslip") return {
      label: "명세서 입력으로 이동", caseId: caseId ?? runId ?? "agent-run", today: todayInput,
      size: (confirmFields.workplaceSize as "5인이상" | "5인미만" | "모름") ?? "모름",
    };
    if (!applyCheck?.ok) return null;
    const value = applyCheck.input;
    return { label: "상담사 승인값 적용", caseId: caseId ?? runId ?? "agent-run", today: value.today, nationality: value.nationality, visa: value.visa, hireDate: value.hireDate, departureDate: value.departureDate, wage: value.monthlyWage };
  }
  function markApplied() {
    if (!canApply || !approvedAt || generation !== scope.generation) return;
    setApplication("applied");
    // The caller invokes this after the real result/session audit has been committed.
    setRecordStatus("completed");
  }
  function downloadRecord() {
    if (!canApprove || !approvedAt || !result || !finalAnswer) return;
    const fields: { name: string; key: keyof IntakeFields }[] = [
      { name: "국적", key: "nationality" }, { name: "체류자격", key: "visa" },
      { name: "입사일", key: "hireDate" }, { name: "출국일", key: "departureDate" },
      { name: "월 평균임금", key: "monthlyWage" },
    ];
    const md = buildConsultRecord({
      today: todayInput, approvedAt, provider: result.provider, model: result.model, utterance: result.utterance,
      fields: fields.map(({ name, key }) => ({
        name, extracted: result.intake?.fields[key] === undefined ? undefined : String(result.intake.fields[key]),
        evidence: result.intake?.evidences[key], final: String(confirmFields[key] ?? ""),
      })),
      findings: evaluation.findings, answer: finalAnswer,
    });
    const url = URL.createObjectURL(new Blob([md], { type: "text/markdown;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = "페이체크_상담기록_" + todayInput + ".md"; a.click(); URL.revokeObjectURL(url);
    setRecordDownloaded(true);
  }

  return {
    utterance, setUtterance, todayInput, setTodayInput, busy, provider, result, error,
    keywordRoutes, steps, finalSkillId, needsClarify, confirmFields, applyCheck, canApply, canApprove,
    edited, approvedAt, setApprovedAt, run, editField, approve, downloadRecord, applyPayload,
    caseId, runId, inputRevision, requests, application, recordStatus, recordDownloaded, markApplied, resetCase, cancel, finalAnswer,
    ontology: result && !busy ? evaluation.ontology : null,
  };
}
export type AgentLoop = ReturnType<typeof useAgentLoop>;
