/**
 * 에이전트 사무실 — 평면도의 데이터 절반.
 *
 * 그림(app/_office.tsx)은 장식이 아니라 실제 실행 상태의 렌더다. 그래서
 * 스테이션 목록은 FLOW(단일 출처)에서 파생되고, 상태는 Agent 실행이 이미
 * 계산한 타임라인 단계(steps)에서만 읽는다 — 시뮬레이션 전용 상태는 없다.
 * office.test.ts 가 FLOW와의 1:1 을 강제한다.
 */

import { FLOW, type FlowActor } from "./flow.ts";
import type { AgentRequests } from "./agentExecution.ts";

export type OfficeStation = {
  id: string;
  이름: string;
  행위자: FlowActor;
  /** 한 줄 설명 — FLOW의 하는일 그대로 */
  하는일: string;
  /** 실패 시 무엇을 보는가 — FLOW의 실패하면 그대로 (상세 패널용) */
  실패하면: string;
};

/** 타임라인 단계의 구조적 최소형 — app 타입을 lib이 import 하지 않기 위한 복제 */
export type StepLike = {
  n: string;
  label: string;
  status: "완료" | "대기" | "미연결" | "중단" | "차단";
  /** 단계 로그 한 줄 — 있으면 상세 패널이 그대로 보여준다 */
  detail?: string;
  /** 모델 호출 소요 ms — 있을 때만 상세 패널에 표시 */
  ms?: number;
};

/** 스테이션 = FLOW 그대로. 순서도 이름도 여기서 새로 정하지 않는다. */
export const OFFICE_STATIONS: readonly OfficeStation[] = FLOW.map((s) => ({
  id: s.id,
  이름: s.이름,
  행위자: s.행위자,
  하는일: s.하는일,
  실패하면: s.실패하면,
}));

/**
 * Stable workflow identifiers for lookup and aggregation. This is not a spatial path.
 * Departments and document transfers use actual dependency and corridor connections.
 */
export const OFFICE_ROUTE: readonly string[] = FLOW.map((s) => s.id);

/** 타임라인 n → FLOW id. Agent 실행의 steps 는 단계 번호로 말한다. */
export const N_TO_ID: Record<string, string> = {
  "0단": "routing",
  "1단": "extract",
  "2단": "judge",
  가드: "guard",
  온톨로지: "ontology",
  "3단": "narrate",
};

export type OfficeCtx = {
  /** 모델 호출이 날아가 있는 동안 — 라우팅·추출이 한 요청에 묶여 있다 */
  busy: boolean;
  /** 실행 결과가 도착했는가 */
  hasResult: boolean;
  /** 3단 번역 제공자 연결 여부 (번역은 답변 탭에서 실행된다) */
  translateLive: boolean;
  runId?: string | null;
  inputRevision?: number;
  requests?: AgentRequests;
  translation?: {
    status: "idle" | "running" | "completed" | "failed" | "rejected" | "skipped";
    language?: string;
    detail?: string;
  };
};

/**
 * 스테이션 하나의 상태. null = 아직 차례가 오지 않았다(그리지 않는 게 정직).
 * 상태 어휘는 타임라인과 같다 — 같은 사실을 두 낱말로 말하지 않는다.
 */
export function stationStatus(
  id: string,
  steps: readonly StepLike[],
  ctx: OfficeCtx,
): StepLike["status"] | null {
  if (id === "input") return ctx.busy || ctx.hasResult || ctx.runId ? "완료" : null;
  if (id === "translate") {
    const translation = ctx.translation;
    // Availability never implies an active translation. Korean/optional idle work is omitted.
    if (!translation || translation.status === "skipped" || translation.language === "ko") return null;
    if (translation.status === "running") return "대기";
    if (translation.status === "completed") return "완료";
    if (translation.status === "failed" || translation.status === "rejected") return "차단";
    if (!ctx.translateLive && ctx.hasResult && translation.language) return "미연결";
    return null;
  }
  if ((id === "routing" || id === "extract") && ctx.requests) {
    const request = ctx.requests[id];
    if (request.status === "running") return "대기";
    if (request.status === "completed") return "완료";
    if (request.status === "failed") return "차단";
    return null;
  }
  const hit = steps.find((s) => N_TO_ID[s.n] === id);
  if (hit) return hit.status;
  // 라우팅·추출은 한 POST 에 묶여 있다 — 호출 중에는 둘 다 대기로 그린다
  if (ctx.busy && (id === "routing" || id === "extract")) return "대기";
  if (departmentWaitReason(id, steps, ctx)) return "대기";
  return null;
}

const DEPARTMENT_PREREQUISITES: Readonly<Record<string, readonly string[]>> = {
  judge: ["routing", "extract"],
  guard: ["judge"],
  ontology: ["judge"],
  narrate: ["guard", "ontology"],
};

/** Waiting is a dependency fact, not a fabricated running request. Completed work wins. */
export function departmentWaitReason(id: string, steps: readonly StepLike[], ctx: OfficeCtx): string | null {
  if ((!ctx.busy && !ctx.hasResult) || steps.some((step) => N_TO_ID[step.n] === id)) return null;
  const prerequisites = DEPARTMENT_PREREQUISITES[id];
  if (!prerequisites) return null;
  const pending = prerequisites.filter((prerequisite) => stationStatus(prerequisite, steps, ctx) !== "완료");
  const names = (pending.length ? pending : prerequisites)
    .map((prerequisite) => OFFICE_STATIONS.find((station) => station.id === prerequisite)?.이름 ?? prerequisite)
    .join(" · ");
  return pending.length ? names + " 결과를 기다립니다." : names + " 응답을 받았습니다. 현재 확인값으로 처리할 준비를 기다립니다.";
}

/** 스테이션의 타임라인 단계 — 상세 패널이 단계 로그(detail)를 보여줄 때 쓴다 */
export function stationStep(id: string, steps: readonly StepLike[], ctx?: OfficeCtx): StepLike | null {
  const actual = steps.find((s) => N_TO_ID[s.n] === id);
  if (actual) return actual;
  const detail = ctx ? departmentWaitReason(id, steps, ctx) : null;
  if (!detail) return null;
  return {
    n: Object.keys(N_TO_ID).find((n) => N_TO_ID[n] === id) ?? id,
    label: OFFICE_STATIONS.find((station) => station.id === id)?.이름 ?? id,
    status: "대기", detail,
  };
}
