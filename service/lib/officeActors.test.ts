import { test } from "node:test";
import assert from "node:assert/strict";
import { FLOW } from "./flow.ts";
import type { StepLike } from "./office.ts";
import { departmentWaitReason, stationStep } from "./office.ts";
import { AGENT_ROLES, agentStates, customerJourney, customerDest, docDest, gateOpen, currentStageLabel, cityStats, documentTransfers, type ActorCtx } from "./officeActors.ts";
import { evaluateAgentInput } from "./agentEvaluation.ts";

const base: ActorCtx = { busy: false, hasResult: false, translateLive: true, approvedAt: null, applyCheckOk: false };
const done: StepLike[] = [
  { n: "0단", label: "라우팅", status: "완료" }, { n: "1단", label: "발화 추출", status: "완료" },
  { n: "2단", label: "판정", status: "완료" }, { n: "가드", label: "afterJudge", status: "완료" },
  { n: "온톨로지", label: "A-Box 대조", status: "완료" }, { n: "3단", label: "설명", status: "완료" },
];
const ready: ActorCtx = { ...base, hasResult: true, applyCheckOk: true, translation: { status: "skipped", language: "ko" } };
const approved: ActorCtx = { ...ready, approvedAt: "2026-09-05 12:00" };
const complete: ActorCtx = { ...approved, application: "applied", recordStatus: "completed" };

test("roles cover stable FLOW ids plus actual counselor and record keeper", () => {
  const ids = AGENT_ROLES.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const s of FLOW) assert.ok(ids.includes(s.id));
  assert.ok(ids.includes("counselor") && ids.includes("records"));
});
test("idle is idle, including connected-but-unused translation", () => {
  assert.ok(Object.values(agentStates([], base)).every((v) => v === "idle"));
  assert.deepEqual(cityStats([], base), { total: 9, done: 0, running: 0, waiting: 0, blocked: 0, remaining: 0, activeAgents: 0, needsReview: false, progressPct: 0 });
});
test("two observed requests work concurrently; only remaining request works after independent completion", () => {
  const ctx: ActorCtx = { ...base, busy: true, requests: { routing: { status: "running" }, extract: { status: "running" } } };
  assert.equal(agentStates([], ctx).routing, "working");
  assert.equal(agentStates([], ctx).extract, "working");
  assert.equal(cityStats([], ctx).running, 2);
  assert.deepEqual(documentTransfers([], ctx).map((t) => [t.from, t.to]), [["input", "routing"], ["input", "extract"]]);
  const next: ActorCtx = { ...ctx, requests: { routing: { status: "completed" }, extract: { status: "running" } } };
  assert.equal(agentStates([], next).routing, "completed");
  assert.equal(cityStats([], next).running, 1);
  assert.equal(docDest([], next), "extract");
});
test("request acceptance without provider dispatch does not fabricate active staff", () => {
  const ctx: ActorCtx = { ...base, busy: true, requests: { routing: { status: "idle" }, extract: { status: "idle" } } };
  assert.equal(cityStats([], ctx).running, 0);
});
test("dependent departments wait on named prerequisites without inflating running count", () => {
  const ctx: ActorCtx = { ...base, busy: true, requests: { routing: { status: "completed" }, extract: { status: "running" } } };
  const states = agentStates([], ctx);
  for (const id of ["judge", "guard", "ontology", "narrate"]) {
    assert.equal(states[id], "ready", id);
    assert.equal(stationStep(id, [], ctx)?.status, "대기");
    assert.ok(departmentWaitReason(id, [], ctx));
  }
  assert.match(departmentWaitReason("judge", [], ctx) ?? "", /추출/);
  assert.doesNotMatch(departmentWaitReason("judge", [], ctx) ?? "", /라우팅/);
  assert.match(departmentWaitReason("guard", [], ctx) ?? "", /판정/);
  assert.match(departmentWaitReason("ontology", [], ctx) ?? "", /판정/);
  assert.match(departmentWaitReason("narrate", [], ctx) ?? "", /가드레일.*온톨로지/);
  assert.equal(cityStats([], ctx).running, 1);
  assert.equal(cityStats([], ctx).waiting, 4);
  assert.equal(departmentWaitReason("judge", [], base), null);
  assert.equal(departmentWaitReason("judge", done, ready), null);
  assert.equal(stationStep("judge", done, ready)?.status, "완료");
});
test("partial request failure preserves successful work and shows blockage after network failure", () => {
  const ctx: ActorCtx = { ...base, runId: "a", requests: { routing: { status: "failed" }, extract: { status: "completed" } } };
  assert.equal(agentStates([], ctx).routing, "blocked");
  assert.equal(agentStates([], ctx).extract, "completed");
  assert.equal(customerJourney([], ctx), "blocked");
  assert.match(currentStageLabel([], ctx, (s) => s), /차단/);
});
test("approval, application and recorded completion are distinct; no permanent busy recorder", () => {
  assert.equal(agentStates(done, ready).counselor, "validating");
  assert.equal(agentStates(done, approved).records, "ready");
  assert.equal(cityStats(done, approved).progressPct, 89);
  assert.equal(customerJourney(done, approved), "receiving-result");
  assert.equal(agentStates(done, complete).records, "completed");
  assert.equal(cityStats(done, complete).progressPct, 100);
  assert.equal(cityStats(done, complete).remaining, 0);
  assert.equal(customerJourney(done, complete), "completed");
  assert.equal(docDest(done, complete), "records");
  assert.match(currentStageLabel(done, complete, (s) => s), /상담 완료/);
});
test("translation is optional until selected; actual running, failed, numeric rejected and success remain distinct", () => {
  assert.equal(cityStats(done, complete).total, 9);
  const translating: ActorCtx = { ...complete, translation: { status: "running", language: "vi" } };
  assert.equal(cityStats(done, translating).total, 10);
  assert.equal(cityStats(done, translating).progressPct, 90);
  assert.equal(agentStates(done, translating).translate, "working");
  assert.equal(customerJourney(done, translating), "waiting-for-processing");
  for (const status of ["failed", "rejected"] as const) {
    const ctx: ActorCtx = { ...complete, translation: { status, language: "vi" } };
    assert.equal(agentStates(done, ctx).translate, "blocked");
    assert.equal(customerJourney(done, ctx), "blocked");
    assert.equal(cityStats(done, ctx).progressPct, 90);
  }
  assert.equal(cityStats(done, { ...complete, translation: { status: "completed", language: "vi" } }).progressPct, 100);
  assert.equal(agentStates(done, { ...complete, translateLive: false }).translate, "idle");
  assert.equal(agentStates(done, { ...complete, translateLive: false, translation: { status: "idle", language: "vi" } }).translate, "offline");
});
test("input supplementation and approval invalidation return to the correct state", () => {
  const missing: StepLike[] = [{ n: "2단", label: "판정", status: "중단" }];
  assert.equal(customerJourney(missing, { ...base, hasResult: true }), "blocked");
  assert.equal(customerJourney(done, ready), "waiting-for-approval");
  assert.equal(gateOpen(approved), true);
  assert.equal(gateOpen(ready), false);
  assert.equal(docDest(done, ready), "counselor");
  assert.equal(docDest(done, approved), "gate");
  assert.equal(docDest([], base), null);
  assert.equal(cityStats(done, ready).done, 7);
  assert.equal(cityStats(done, ready).remaining, 2);
  for (const state of ["queued", "consulting", "waiting-for-processing", "waiting-for-approval", "receiving-result", "completed", "blocked"] as const) assert.ok(customerDest(state));
});

test("missing visa returns a concrete judge-to-consultation packet and repaired input retires it", () => {
  const fields = { nationality: "베트남", hireDate: "2023-09-01", departureDate: "2026-10-15", monthlyWage: 2150000 };
  const input = { fields, today: "2026-09-05", utterance: "베트남 사람인데 출국해요", skillId: "departure", needsClarify: false };
  const missing = evaluateAgentInput(input);
  const ctx: ActorCtx = { ...base, runId: "missing-visa", inputRevision: 0, hasResult: true, requests: { routing: { status: "completed" }, extract: { status: "completed" } }, applyCheckOk: missing.canApprove };
  const missingSteps = [...done.slice(0, 2), ...missing.steps];
  const packets = documentTransfers(missingSteps, ctx);
  assert.equal(packets.length, 1);
  assert.equal(packets[0].from, "judge");
  assert.equal(packets[0].to, "input");
  assert.match(packets[0].label, /입력 보완.*체류자격/);
  assert.equal(docDest(missingSteps, ctx), "input");
  assert.equal(cityStats(missingSteps, ctx).running, 0);

  const repaired = evaluateAgentInput({ ...input, fields: { ...fields, visa: "E-9" } });
  assert.equal(repaired.canApprove, true);
  const repairedSteps = [...done.slice(0, 2), ...repaired.steps];
  const repairedCtx = { ...ctx, inputRevision: 1, applyCheckOk: repaired.canApprove };
  assert.equal(documentTransfers(repairedSteps, repairedCtx).some((packet) => packet.to === "input"), false);
  assert.equal(documentTransfers(repairedSteps, repairedCtx).some((packet) => packet.id === packets[0].id), false);
  assert.equal(docDest(repairedSteps, repairedCtx), "counselor");
});

test("explicit incomplete extraction can ask for input, but hard failures never become supplementation", () => {
  const incomplete: StepLike[] = [{ n: "1단", label: "추출", status: "중단", detail: "국적을 확인해 주세요." }];
  const ctx: ActorCtx = { ...base, hasResult: true };
  assert.deepEqual(documentTransfers(incomplete, ctx).map((packet) => [packet.from, packet.to]), [["extract", "input"]]);
  assert.match(documentTransfers(incomplete, ctx)[0].label, /국적/);
  const failed: StepLike[] = [{ n: "1단", label: "추출", status: "차단", detail: "근거 검증 실패" }, { n: "2단", label: "판정", status: "중단", detail: "추출 결과를 기다립니다." }];
  assert.equal(documentTransfers(failed, ctx).length, 0);
  assert.equal(docDest(failed, ctx), "extract");
  assert.equal(customerJourney(failed, ctx), "blocked");
});
