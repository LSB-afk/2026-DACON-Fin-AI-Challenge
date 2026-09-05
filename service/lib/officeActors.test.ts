/**
 * 배우 진실성 — 시각 상태가 실제 실행 상태와 언제나 일치함을 강제한다.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { FLOW } from "./flow.ts";
import type { StepLike } from "./office.ts";
import {
  AGENT_ROLES, agentStates, customerJourney, customerDest,
  docDest, gateOpen, currentStageLabel, cityStats, type ActorCtx,
} from "./officeActors.ts";

const base: ActorCtx = { busy: false, hasResult: false, translateLive: true, approvedAt: null, applyCheckOk: false };

const 완주: StepLike[] = [
  { n: "0단", label: "라우팅", status: "완료" },
  { n: "1단", label: "발화 추출", status: "완료" },
  { n: "2단", label: "판정", status: "완료" },
  { n: "가드", label: "afterJudge", status: "완료" },
  { n: "온톨로지", label: "A-Box 대조", status: "완료" },
  { n: "3단", label: "설명", status: "완료" },
];

test("역할 에이전트 — stable id가 FLOW 전 스테이션 + 상담사·기록을 덮는다", () => {
  const ids = AGENT_ROLES.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const s of FLOW) assert.ok(ids.includes(s.id), `${s.id} 담당 없음`);
  assert.ok(ids.includes("counselor") && ids.includes("records"));
});

test("실행 전 — 모든 에이전트가 idle, 아무도 일하는 척하지 않는다", () => {
  const st = agentStates([], base);
  for (const s of FLOW) assert.equal(st[s.id], "idle", s.id);
  assert.equal(st.counselor, "idle");
  assert.equal(st.records, "idle");
});

test("진실성 — 실행이 직렬이므로 working은 언제나 최대 1명이다", () => {
  // 호출 중(라우팅·추출이 한 POST): working 1명, 나머지는 ready
  const st = agentStates([], { ...base, busy: true });
  const working = Object.values(st).filter((v) => v === "working");
  assert.equal(working.length, 1);
  assert.equal(st.routing, "working");
  assert.equal(st.extract, "ready");
});

test("차단·중단·미연결·완료가 어휘 그대로 옮겨진다", () => {
  const steps: StepLike[] = [
    { n: "0단", label: "라우팅", status: "완료" },
    { n: "1단", label: "발화 추출", status: "차단" },
  ];
  const st = agentStates(steps, { ...base, hasResult: true, translateLive: false });
  assert.equal(st.routing, "completed");
  assert.equal(st.extract, "blocked");
  assert.equal(st.translate, "offline");
});

test("상담사 — 검토거리가 있으면 validating, 승인하면 completed·기록이 움직인다", () => {
  const 검토 = agentStates(완주, { ...base, hasResult: true, applyCheckOk: true });
  assert.equal(검토.counselor, "validating");
  assert.equal(검토.records, "idle");
  const 승인 = agentStates(완주, { ...base, hasResult: true, approvedAt: "2026-08-31 12:00" });
  assert.equal(승인.counselor, "completed");
  assert.equal(승인.records, "working");
});

test("고객 여정 — 대기→접수→처리→승인 대기→결과 수령", () => {
  assert.equal(customerJourney([], base), "consulting");
  assert.equal(customerJourney([], { ...base, busy: true }), "waiting-for-processing");
  assert.equal(customerJourney(완주, { ...base, hasResult: true, applyCheckOk: true }), "waiting-for-approval");
  assert.equal(customerJourney(완주, { ...base, hasResult: true, approvedAt: "t" }), "receiving-result");
  // 값 부족(중단)은 blocked — 보완되면 승인 대기로 회복
  const 중단: StepLike[] = [
    { n: "0단", label: "라우팅", status: "완료" },
    { n: "1단", label: "발화 추출", status: "완료" },
    { n: "2단", label: "판정", status: "중단" },
    { n: "3단", label: "답변", status: "차단" },
  ];
  assert.equal(customerJourney(중단, { ...base, hasResult: true }), "blocked");
  assert.equal(customerJourney(중단, { ...base, hasResult: true, applyCheckOk: true }), "waiting-for-approval");
  // 목적지 이름이 전 상태에 대해 정의된다
  for (const s of ["queued", "consulting", "waiting-for-processing", "waiting-for-approval", "receiving-result", "completed", "blocked"] as const) {
    assert.ok(customerDest(s).length > 0);
  }
});

test("승인 게이트 — 승인 전 잠김·후 열림·해제 시 다시 잠김. 문서도 승인 전 게이트 금지", () => {
  assert.equal(gateOpen(base), false);
  assert.equal(gateOpen({ ...base, approvedAt: "t" }), true);
  assert.equal(gateOpen({ ...base, approvedAt: null }), false);
  // 문서: 처리 끝나도 승인 전에는 창구까지 — 게이트는 승인 후에만
  assert.equal(docDest(완주, { ...base, hasResult: true, applyCheckOk: true }), "counselor");
  assert.equal(docDest(완주, { ...base, hasResult: true, approvedAt: "t" }), "gate");
  assert.equal(docDest([], base), null);
});

test("cityStats — 실행 전에는 전부 0, 진행률도 0", () => {
  const s = cityStats([], base);
  assert.deepEqual(s, {
    total: 9, done: 0, running: 0, waiting: 0, blocked: 0,
    remaining: 0, activeAgents: 0, needsReview: false, progressPct: 0,
  });
});

test("cityStats — 호출 중(busy)에는 running 1, activeAgents 1", () => {
  const s = cityStats([], { ...base, busy: true });
  assert.equal(s.running, 1);
  assert.equal(s.activeAgents, 1);
});

test("cityStats — 완주 + 검토 대기 → done 7, waiting 1, remaining 1, needsReview true", () => {
  const s = cityStats(완주, { ...base, hasResult: true, applyCheckOk: true });
  assert.equal(s.done, 7);
  assert.equal(s.waiting, 1);
  assert.equal(s.remaining, 1);
  assert.equal(s.needsReview, true);
});

test("cityStats — 승인 후 → done 8, remaining 0, progressPct 89", () => {
  const s = cityStats(완주, { ...base, hasResult: true, approvedAt: "2026-08-31 12:00" });
  assert.equal(s.done, 8);
  assert.equal(s.remaining, 0);
  assert.equal(s.progressPct, 89);
});

test("상태 바 라벨 — 단계 이름이 실제 상태에서 나온다", () => {
  const name = (id: string) => FLOW.find((s) => s.id === id)?.이름 ?? id;
  assert.ok(currentStageLabel([], base, name).includes("상담 입력"));
  assert.ok(currentStageLabel([], { ...base, busy: true }, name).includes("0단 라우팅"));
  assert.ok(currentStageLabel(완주, { ...base, hasResult: true, applyCheckOk: true }, name).includes("승인 대기"));
  assert.ok(currentStageLabel(완주, { ...base, hasResult: true, approvedAt: "t" }, name).includes("결과 전달"));
});
