import { test } from "node:test";
import assert from "node:assert/strict";
import { officeBrief, OFFICE_TOUR, OFFICE_FLOW_GROUPS, OFFICE_VIEWS } from "./officeGuide.ts";
import { BUILDINGS } from "./officeWorld.ts";
import { FLOW } from "./flow.ts";
import type { ActorCtx } from "./officeActors.ts";
import type { StepLike } from "./office.ts";

const base: ActorCtx = { busy: false, hasResult: false, translateLive: true, approvedAt: null, applyCheckOk: false };
const done: StepLike[] = [
  { n: "0단", label: "라우팅", status: "완료" }, { n: "1단", label: "추출", status: "완료" },
  { n: "2단", label: "판정", status: "완료" }, { n: "가드", label: "검사", status: "완료" },
  { n: "온톨로지", label: "대조", status: "완료" }, { n: "3단", label: "답변", status: "완료" },
];
const ready: ActorCtx = { ...base, hasResult: true, applyCheckOk: true, translation: { status: "skipped", language: "ko" } };

test("idle guide invites input without claiming an execution", () => {
  const brief = officeBrief([], base);
  assert.equal(brief.phase, "idle");
  assert.equal(brief.action.target, "input");
  assert.match(brief.title, /상담/);
  assert.match(brief.reason, /아직.*실행/);
});
test("guide names actual parallel requests and their join dependency", () => {
  const brief = officeBrief([], { ...base, busy: true, requests: { routing: { status: "running" }, extract: { status: "running" } } });
  assert.equal(brief.phase, "running");
  assert.match(brief.title, /분류.*추출/);
  assert.match(brief.reason, /두.*결과.*판정/);
  assert.equal(brief.action.target, "current");
});
test("guide distinguishes one remaining request from initial request acceptance", () => {
  const brief = officeBrief([], { ...base, busy: true, requests: { routing: { status: "completed" }, extract: { status: "running" } } });
  assert.match(brief.title, /정보.*추출/);
  assert.doesNotMatch(brief.title, /분류/);
  const accepted = officeBrief([], { ...base, busy: true, requests: { routing: { status: "idle" }, extract: { status: "idle" } } });
  assert.match(accepted.title, /접수/);
  assert.match(accepted.reason, /아직.*요청/);
});
test("supplement guide repeats the actual missing-field question", () => {
  const brief = officeBrief([{ n: "2단", label: "판정", status: "중단", detail: "체류자격을 확인해 주세요." }], { ...base, hasResult: true });
  assert.equal(brief.phase, "supplement");
  assert.match(brief.reason, /체류자격/);
  assert.match(brief.next, /보완한 입력 버전/);
  assert.equal(brief.action.target, "review");
});
test("request failure is not disguised as a missing-input problem", () => {
  const brief = officeBrief([], { ...base, runId: "failed", requests: { routing: { status: "failed", detail: "연결 실패" }, extract: { status: "completed" } } });
  assert.equal(brief.phase, "blocked");
  assert.match(brief.reason, /연결 실패/);
  assert.equal(brief.action.target, "stage");
  assert.equal(brief.action.station, "routing");
});
test("unconnected steps explain setup rather than inviting impossible approval", () => {
  const brief = officeBrief([{ n: "0단", label: "분류", status: "미연결" }], { ...base, hasResult: true });
  assert.equal(brief.phase, "blocked");
  assert.match(brief.title, /연결/);
  assert.equal(brief.action.target, "stage");
  assert.equal(brief.action.station, "routing");
});
test("review, approved-but-unapplied, and recorded completion have distinct actions", () => {
  assert.equal(officeBrief(done, ready).phase, "review");
  const approved = { ...ready, approvedAt: "2026-09-05" };
  assert.equal(officeBrief(done, approved).phase, "approved");
  assert.match(officeBrief(done, approved).reason, /적용.*별개/);
  assert.equal(officeBrief(done, { ...approved, application: "applied", recordStatus: "completed" }).phase, "complete");
});
test("translation failure keeps original-answer recovery and skipped translation is not pending", () => {
  const rejected = officeBrief(done, { ...ready, translation: { status: "rejected", language: "vi", detail: "숫자 보존 실패" } });
  assert.equal(rejected.phase, "blocked");
  assert.match(rejected.reason, /한국어 원문/);
  assert.equal(rejected.action.target, "translate");
  assert.equal(officeBrief(done, ready).phase, "review");
});
test("guide computation is pure and cannot advance business state", () => {
  const ctx = structuredClone(ready), snapshot = structuredClone(ctx);
  for (let i = 0; i < 100; i++) officeBrief(done, ctx);
  assert.deepEqual(ctx, snapshot);
});
test("tour and camera views target real rooms; content names actual purposes", () => {
  assert.ok(OFFICE_TOUR.length >= 5);
  for (const stop of OFFICE_TOUR) {
    assert.ok(BUILDINGS.some((b) => b.id === stop.room), stop.room);
    assert.ok(stop.body.length >= 40);
  }
  for (const view of OFFICE_VIEWS) for (const room of view.rooms) assert.ok(BUILDINGS.some((b) => b.id === room), room);
});
test("flow grouping contains each real stage once and keeps the true parallel branch together", () => {
  const ids = OFFICE_FLOW_GROUPS.flatMap((group) => group.stations);
  assert.equal(new Set(ids).size, ids.length);
  for (const step of FLOW) assert.ok(ids.includes(step.id));
  assert.ok(OFFICE_FLOW_GROUPS.some((group) => group.stations.includes("routing") && group.stations.includes("extract") && group.parallel));
  assert.ok(OFFICE_FLOW_GROUPS.some((group) => group.stations.includes("translate") && group.optional));
});
