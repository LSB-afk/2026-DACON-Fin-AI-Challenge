/**
 * 에이전트 사무실 — 평면도의 데이터 절반.
 *
 * 그림(app/_office.tsx)은 장식이 아니라 실제 실행 상태의 렌더다. 그래서
 * 스테이션 목록은 FLOW(단일 출처)에서 파생되고, 상태는 Agent 실행이 이미
 * 계산한 타임라인 단계(steps)에서만 읽는다 — 시뮬레이션 전용 상태는 없다.
 * office.test.ts 가 FLOW와의 1:1 을 강제한다.
 */

import { FLOW, type FlowActor } from "./flow.ts";

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
 * 서류 배달부의 경유 순서 — 동선이 곧 논리다.
 * FLOW에서 그대로 파생하고 office.test.ts가 동일성을 강제한다.
 * 화면(app/_office.tsx)의 걷기 애니메이션 웨이포인트는 이 배열 순서만 따라야 한다.
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
  if (id === "input") return ctx.busy || ctx.hasResult ? "완료" : null;
  if (id === "translate") {
    // 번역은 이 화면이 아니라 답변 탭에서 눌린다 — 여기서는 배선 상태만 말한다
    if (!ctx.translateLive) return ctx.hasResult ? "미연결" : null;
    const narrateDone = steps.some((s) => s.n === "3단" && s.status === "완료");
    return narrateDone ? "대기" : null;
  }
  const hit = steps.find((s) => N_TO_ID[s.n] === id);
  if (hit) return hit.status;
  // 라우팅·추출은 한 POST 에 묶여 있다 — 호출 중에는 둘 다 대기로 그린다
  if (ctx.busy && (id === "routing" || id === "extract")) return "대기";
  return null;
}

/** 스테이션의 타임라인 단계 — 상세 패널이 단계 로그(detail)를 보여줄 때 쓴다 */
export function stationStep(id: string, steps: readonly StepLike[]): StepLike | null {
  return steps.find((s) => N_TO_ID[s.n] === id) ?? null;
}
