/**
 * Fin:AI 운영 도시 — 에이전트·고객의 시각 상태 모델. 순수 함수만.
 *
 * 진실성 규칙(이 파일의 존재 이유):
 *   - 역할 에이전트는 파이프라인 스테이션의 시각적 담당자다. 실제 LLM이 여러 개
 *     동시에 도는 것처럼 그리지 않는다 — working은 언제나 최대 1명이다(테스트 강제).
 *   - 모든 상태는 기존 타임라인(stationStatus)과 실행 컨텍스트에서만 파생된다.
 *     도시 전용 가짜 타이머·가짜 완료는 없다.
 *   - 고객은 배경 장식이 아니라 상담 케이스(caseId)의 시각 표현이다.
 */

import { OFFICE_ROUTE, stationStatus, type StepLike, type OfficeCtx } from "./office.ts";

export type ActorCtx = OfficeCtx & { approvedAt: string | null; applyCheckOk: boolean };

/* ── 역할 에이전트 ── */

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

export type AgentState =
  | "idle" | "ready" | "working" | "validating"
  | "waiting" | "blocked" | "offline" | "completed";

/**
 * 스테이션별 에이전트 상태 — stationStatus의 재해석 없이 어휘만 옮긴다.
 * 한 POST에 묶인 라우팅·추출이 둘 다 "대기"로 오더라도 working은 경로상
 * 첫 번째 하나뿐이다 — 실제 실행이 직렬이기 때문이다.
 */
export function agentStates(
  steps: readonly StepLike[],
  ctx: ActorCtx,
): Record<string, AgentState> {
  const out: Record<string, AgentState> = {};
  let workingAssigned = false;
  for (const id of OFFICE_ROUTE) {
    const s = stationStatus(id, steps, ctx);
    if (s === "대기") {
      if (!workingAssigned && ctx.busy) {
        out[id] = "working";
        workingAssigned = true;
      } else {
        // 연결돼 있고 차례를 기다리는 자리 (번역 대기 등)
        out[id] = "ready";
      }
    } else if (s === "완료") out[id] = "completed";
    else if (s === "차단") out[id] = "blocked";
    else if (s === "중단") out[id] = "waiting";
    else if (s === "미연결") out[id] = "offline";
    else out[id] = "idle";
  }
  // 상담사: 검토할 것이 있으면 validating, 승인했으면 completed
  out.counselor = ctx.approvedAt
    ? "completed"
    : ctx.hasResult && ctx.applyCheckOk
      ? "validating"
      : ctx.hasResult
        ? "waiting"
        : "idle";
  // 기록 관리: 승인 후에만 일이 생긴다
  out.records = ctx.approvedAt ? "working" : "idle";
  return out;
}

/* ── 도시 전체 집계 (HUD) ── */

export type CityStats = {
  /** FLOW 스테이션 수 + 1(상담사 승인) */
  total: number;
  /** 완료 스테이션 수 (+1 if approvedAt) */
  done: number;
  /** working 에이전트 수 (0 또는 1) */
  running: number;
  /** ready(차례 대기·번역 대기) 수 */
  waiting: number;
  /** 차단+중단 수 */
  blocked: number;
  /** 아직 차례 안 온 스테이션 수 + (승인 전이면 1) — 실행 중일 때만 의미 있다 */
  remaining: number;
  /** working + validating */
  activeAgents: number;
  /** 상담사 검토 대기 또는 중단(입력 보완) 존재 */
  needsReview: boolean;
  /** round(done/total*100) */
  progressPct: number;
};

/**
 * 도시 HUD가 읽는 단일 집계 — agentStates의 재해석일 뿐, 새 상태를 만들지 않는다.
 */
export function cityStats(steps: readonly StepLike[], ctx: ActorCtx): CityStats {
  const states = agentStates(steps, ctx);
  const values = Object.values(states);
  const routeStates = OFFICE_ROUTE.map((id) => states[id]);

  const total = OFFICE_ROUTE.length + 1;
  const completedRoute = routeStates.filter((v) => v === "completed").length;
  const done = completedRoute + (ctx.approvedAt ? 1 : 0);
  const running = values.filter((v) => v === "working").length;
  const waiting = values.filter((v) => v === "ready").length;
  const blocked = values.filter((v) => v === "blocked" || v === "waiting").length;
  const activeAgents = values.filter((v) => v === "working" || v === "validating").length;

  const active = ctx.busy || ctx.hasResult;
  const idleRoute = routeStates.filter((v) => v === "idle" || v === "offline").length;
  const remaining = active ? idleRoute + (ctx.approvedAt ? 0 : 1) : 0;

  const needsReview = (ctx.hasResult && !ctx.approvedAt && ctx.applyCheckOk) || values.includes("waiting");

  return {
    total, done, running, waiting, blocked, remaining, activeAgents, needsReview,
    progressPct: Math.round((done / total) * 100),
  };
}

/* ── 고객 여정 ── */

export type CustomerState =
  | "queued" | "consulting" | "waiting-for-processing"
  | "waiting-for-approval" | "receiving-result" | "completed" | "blocked";

/**
 * 활성 고객(선택된 케이스)의 여정 — 실행 컨텍스트의 순수 함수.
 * 시스템은 한 번에 한 건만 처리한다 — 활성 고객은 언제나 한 명이다.
 */
export function customerJourney(steps: readonly StepLike[], ctx: ActorCtx): CustomerState {
  if (!ctx.busy && !ctx.hasResult) return "consulting";
  if (ctx.busy) return "waiting-for-processing";
  if (ctx.approvedAt) return "receiving-result";
  const 첫비정상 = OFFICE_ROUTE.find((id) => {
    const s = stationStatus(id, steps, ctx);
    return s === "차단" || s === "중단";
  });
  if (첫비정상) {
    const s = stationStatus(첫비정상, steps, ctx);
    // 중단(값 부족)은 상담사가 보완하면 회복 — 보완되면 승인 대기로 넘어간다
    if (s === "차단" || !ctx.applyCheckOk) return "blocked";
  }
  return "waiting-for-approval";
}

/** 여정 상태 → 고객이 향하는 자리 이름 (좌표는 officeWorld가 안다) */
export function customerDest(state: CustomerState): string {
  switch (state) {
    case "queued": return "plaza";
    case "consulting": return "consulting";
    case "waiting-for-processing": return "waitingProcessing";
    case "blocked": return "waitingProcessing"; // 접수 옆에서 되묻기를 기다린다
    case "waiting-for-approval": return "waitingApproval";
    case "receiving-result": return "receivingResult";
    case "completed": return "exited";
  }
}

/* ── 문서(데이터 패킷) ── */

/**
 * 문서의 현재 목적지 — 실행이 어디까지 왔는지의 공간 표현.
 * 승인 전에는 절대 게이트로 가지 않는다(승인 게이트 계약).
 */
export function docDest(steps: readonly StepLike[], ctx: ActorCtx): string | null {
  if (!ctx.busy && !ctx.hasResult) return null; // 아직 문서가 없다
  if (ctx.approvedAt) return "gate";
  if (ctx.busy) {
    const running = OFFICE_ROUTE.find((id) => stationStatus(id, steps, ctx) === "대기");
    return running ?? "routing";
  }
  const 첫비정상 = OFFICE_ROUTE.find((id) => {
    const s = stationStatus(id, steps, ctx);
    return s === "차단" || s === "중단";
  });
  if (첫비정상) {
    const s = stationStatus(첫비정상, steps, ctx);
    if (s === "차단" || !ctx.applyCheckOk) return 첫비정상;
  }
  return "counselor"; // 처리 끝 — 승인 창구 앞에서 대기
}

/** 결과 전달 게이트 — 승인 전 잠김, 승인 후 열림. 승인 해제면 다시 잠긴다 */
export function gateOpen(ctx: ActorCtx): boolean {
  return !!ctx.approvedAt;
}

/** 상태 바·live region용 현재 단계 한 줄 */
export function currentStageLabel(
  steps: readonly StepLike[],
  ctx: ActorCtx,
  stationName: (id: string) => string,
): string {
  if (!ctx.busy && !ctx.hasResult) return "대기 전 — 상담 입력";
  if (ctx.busy) {
    const running = OFFICE_ROUTE.find((id) => stationStatus(id, steps, ctx) === "대기");
    return running ? `진행 중 — ${stationName(running)}` : "진행 중";
  }
  if (ctx.approvedAt) return "승인 완료 — 결과 전달";
  const 첫비정상 = OFFICE_ROUTE.find((id) => {
    const s = stationStatus(id, steps, ctx);
    return s === "차단" || s === "중단";
  });
  if (첫비정상) {
    const s = stationStatus(첫비정상, steps, ctx);
    if (s === "차단") return `차단 — ${stationName(첫비정상)}`;
    if (!ctx.applyCheckOk) return `입력 보완 필요 — ${stationName(첫비정상)}`;
  }
  return "상담사 승인 대기";
}
