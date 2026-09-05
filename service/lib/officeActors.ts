/** Staff, customer and document states derive only from observed requests and accepted results. */
import { OFFICE_ROUTE, N_TO_ID, stationStatus, type StepLike, type OfficeCtx } from "./office.ts";
export type ActorCtx = OfficeCtx & {
  approvedAt: string | null;
  applyCheckOk: boolean;
  application?: "idle" | "applied";
  recordStatus?: "idle" | "completed";
};

export type AgentRole = {
  /** stable id — 스테이션 id와 1:1 (counselor·records는 흐름 밖 상근) */
  id: string;
  role: string;
  name: string;
  /** 파생 스테이션. null이면 흐름 밖 상근 자리 */
  station: string | null;
  /** 역할 배지 색 — 캐릭터 전체를 칠하지 않고 배지·장비에만 쓴다 */
  badge: string;
};

export const AGENT_ROLES: readonly AgentRole[] = [
  { id: "input", role: "접수", name: "접수 에이전트", station: "input", badge: "#006EDA" },
  { id: "routing", role: "라우팅", name: "라우팅 에이전트", station: "routing", badge: "#006EDA" },
  { id: "extract", role: "추출", name: "정보 추출 에이전트", station: "extract", badge: "#006EDA" },
  { id: "judge", role: "판정", name: "판정 서버 운영", station: "judge", badge: "#147D72" },
  { id: "guard", role: "준법감시", name: "준법감시 에이전트", station: "guard", badge: "#147D72" },
  { id: "ontology", role: "온톨로지", name: "온톨로지 분석", station: "ontology", badge: "#147D72" },
  { id: "narrate", role: "답변 조립", name: "답변 조립 에이전트", station: "narrate", badge: "#147D72" },
  { id: "translate", role: "번역", name: "번역 에이전트", station: "translate", badge: "#006EDA" },
  { id: "counselor", role: "상담사", name: "상담사 (사람)", station: null, badge: "#B7791F" },
  { id: "records", role: "기록", name: "기록 관리", station: null, badge: "#91A7C0" },
] as const;

export type AgentState = "idle" | "ready" | "working" | "validating" | "waiting" | "blocked" | "offline" | "completed";

export function agentStates(steps: readonly StepLike[], ctx: ActorCtx): Record<string, AgentState> {
  const out: Record<string, AgentState> = {};
  for (const id of OFFICE_ROUTE) {
    const status = stationStatus(id, steps, ctx);
    if (status === "대기") {
      const observed = id === "translate" ? ctx.translation?.status === "running"
        : id === "routing" || id === "extract" ? ctx.requests ? ctx.requests[id].status === "running" : ctx.busy : false;
      out[id] = observed ? "working" : "ready";
    } else if (status === "완료") out[id] = "completed";
    else if (status === "차단") out[id] = "blocked";
    else if (status === "중단") out[id] = "waiting";
    else if (status === "미연결") out[id] = "offline";
    else out[id] = "idle";
  }
  out.counselor = ctx.approvedAt ? "completed"
    : ctx.hasResult && ctx.applyCheckOk ? "validating"
    : ctx.hasResult ? "waiting" : "idle";
  out.records = ctx.application === "applied" && ctx.recordStatus === "completed" ? "completed"
    : ctx.approvedAt ? "ready" : "idle";
  return out;
}

export type CityStats = {
  total: number; done: number; running: number; waiting: number; blocked: number;
  remaining: number; activeAgents: number; needsReview: boolean; progressPct: number;
};

function translationRequired(ctx: ActorCtx) {
  const t = ctx.translation;
  return !!t && t.status !== "skipped" && t.language !== "ko" && (t.status !== "idle" || !!t.language);
}
function active(ctx: ActorCtx) {
  return ctx.busy || ctx.hasResult || !!ctx.runId || Object.values(ctx.requests ?? {}).some((r) => r.status !== "idle");
}
function requiredRoute(ctx: ActorCtx) {
  return OFFICE_ROUTE.filter((id) => id !== "translate" || translationRequired(ctx));
}
export function cityStats(steps: readonly StepLike[], ctx: ActorCtx): CityStats {
  const states = agentStates(steps, ctx);
  // Required work includes approval and actual application/session record. Optional translation
  // joins the denominator only when selected; downloading a local copy is never mandatory.
  const required = [...requiredRoute(ctx), "counselor", "records"];
  const done = required.filter((id) => states[id] === "completed").length;
  const values = Object.values(states);
  const running = values.filter((state) => state === "working").length;
  return {
    total: required.length, done, running,
    waiting: values.filter((state) => state === "ready").length,
    blocked: values.filter((state) => state === "blocked" || state === "waiting" || state === "offline").length,
    remaining: active(ctx) ? required.length - done : 0,
    activeAgents: running + values.filter((state) => state === "validating").length,
    needsReview: (ctx.hasResult && !ctx.approvedAt && ctx.applyCheckOk) || values.some((state) => state === "waiting" || state === "blocked"),
    progressPct: Math.round(done / required.length * 100),
  };
}

export type CustomerState = "queued" | "consulting" | "waiting-for-processing" | "waiting-for-approval" | "receiving-result" | "completed" | "blocked";
export function customerJourney(steps: readonly StepLike[], ctx: ActorCtx): CustomerState {
  if (!active(ctx)) return "consulting";
  const states = agentStates(steps, ctx);
  if (Object.values(states).includes("blocked")) return "blocked";
  if (ctx.busy || ctx.translation?.status === "running") return "waiting-for-processing";
  if (cityStats(steps, ctx).progressPct === 100) return "completed";
  if (ctx.approvedAt) return "receiving-result";
  if (!ctx.applyCheckOk) return "blocked";
  return "waiting-for-approval";
}
/** Customers stay in the consultation hub; officeWorld locates the semantic seats. */
export function customerDest(state: CustomerState): string {
  switch (state) {
    case "queued": return "plaza";
    case "consulting": return "consulting";
    case "waiting-for-processing": return "waitingProcessing";
    case "blocked": return "waitingProcessing";
    case "waiting-for-approval": return "waitingApproval";
    case "receiving-result": return "receivingResult";
    case "completed": return "exited";
  }
}

export function docDest(steps: readonly StepLike[], ctx: ActorCtx): string | null {
  if (!active(ctx)) return null;
  if (ctx.application === "applied") return "records";
  if (ctx.approvedAt) return "gate";
  const states = agentStates(steps, ctx);
  const working = requiredRoute(ctx).find((id) => states[id] === "working");
  if (working) return working;
  if (documentTransfers(steps, ctx).some((transfer) => transfer.to === "input")) return "input";
  const blocked = requiredRoute(ctx).find((id) => states[id] === "blocked" || states[id] === "waiting");
  if (blocked) return blocked;
  if (ctx.busy) return "input";
  return "counselor";
}

export type DocumentTransfer = { id: string; from: string; to: string; label: string };
/** Independent requests have independent packets. Completed transfer animation never means running. */
export function documentTransfers(steps: readonly StepLike[], ctx: ActorCtx): DocumentTransfer[] {
  const states = agentStates(steps, ctx);
  const transfers: DocumentTransfer[] = [];
  for (const id of ["routing", "extract"] as const) {
    if (states[id] === "working") transfers.push({ id: (ctx.runId ?? "run") + ":" + id, from: "input", to: id, label: id === "routing" ? "업무 분류 요청" : "상담 정보 확인" });
  }
  if (states.translate === "working") transfers.push({ id: (ctx.runId ?? "run") + ":translate", from: "narrate", to: "translate", label: "검증된 답변 번역" });
  if (!transfers.length && ctx.hasResult && !ctx.busy && !ctx.approvedAt && !ctx.applyCheckOk && !Object.values(states).includes("blocked")) {
    // A stopped input-dependent stage asks the central consultation desk for missing values.
    // Hard request/contract failures stay at their failed department and are not relabeled.
    const stopped = steps.find((step) => step.status === "중단" && ["extract", "judge"].includes(N_TO_ID[step.n]));
    if (stopped) transfers.push({
      id: (ctx.runId ?? "run") + ":supplement:" + (ctx.inputRevision ?? 0) + ":" + N_TO_ID[stopped.n],
      from: N_TO_ID[stopped.n], to: "input",
      label: "입력 보완 요청 · " + (stopped.detail?.trim() || stopped.label + " 입력 확인이 필요합니다."),
    });
  }
  if (!transfers.length && ctx.hasResult && !ctx.approvedAt && ctx.applyCheckOk) transfers.push({ id: (ctx.runId ?? "run") + ":review", from: "narrate", to: "counselor", label: "결과 검토 요청" });
  return transfers;
}

export function gateOpen(ctx: ActorCtx): boolean { return !!ctx.approvedAt; }
export function currentStageLabel(steps: readonly StepLike[], ctx: ActorCtx, stationName: (id: string) => string): string {
  if (!active(ctx)) return "대기 전 — 상담 입력";
  const states = agentStates(steps, ctx);
  const working = OFFICE_ROUTE.filter((id) => states[id] === "working");
  if (working.length) return "요청 진행 중 — " + working.map(stationName).join(" · ");
  const failed = OFFICE_ROUTE.find((id) => states[id] === "blocked");
  if (failed) return (failed === "translate" ? "번역 확인 필요 — " : "차단 — ") + stationName(failed);
  if (ctx.busy) return "상담 요청 접수 중";
  if (cityStats(steps, ctx).progressPct === 100) return "상담 완료 — 결과 적용·기록 완료";
  if (ctx.approvedAt) return "승인 완료 — 결과 전달 대기";
  if (!ctx.applyCheckOk) return "입력 보완 필요 — 상담 정보 확인";
  return "상담사 승인 대기";
}
