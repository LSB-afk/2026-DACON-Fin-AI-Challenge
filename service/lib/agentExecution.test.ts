import { test } from "node:test";
import assert from "node:assert/strict";
import { AgentRunScope, runAgentRequests, readAgentResponse, type AgentEvent } from "./agentExecution.ts";
import { evaluateAgentInput } from "./agentEvaluation.ts";
import type { ChatResult, Provider } from "./ai/providers.ts";
import { judgeDeparture } from "./rules/departure.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const utt = "베트남 E-9 2023년 9월 1일 입사 2026년 10월 15일 출국 월급 215만원";
const fields = { nationality: "베트남", visa: "E-9", hireDate: "2023-09-01", departureDate: "2026-10-15", monthlyWage: 2150000 };
const scope = { runId: "run-a", inputRevision: 2 };

test("fan-out reports both actual dispatches and independent completion, preserving partial success", async () => {
  const routing = deferred<ChatResult>();
  const extract = deferred<ChatResult>();
  let calls = 0;
  const provider: Provider = { name: "ollama", model: "test", chat: () => calls++ === 0 ? routing.promise : extract.promise };
  const events: AgentEvent[] = [];
  const pending = runAgentRequests(provider, utt, scope, (event) => events.push(event));
  assert.equal(calls, 2);
  assert.deepEqual(events.map((e) => e.type === "request" && [e.stage, e.request.status]), [["routing", "running"], ["extract", "running"]]);
  extract.resolve({ text: JSON.stringify({ nationality: { value: "베트남", evidence: "베트남" } }), usage: { ms: 12 } });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(events.length, 3);
  assert.equal(events[2].type === "request" && events[2].stage, "extract");
  routing.reject(new Error("provider failed"));
  const result = await pending;
  assert.equal(result.router, null);
  assert.equal(result.routerError, "provider failed");
  assert.equal(result.intake?.fields.nationality, "베트남");
  assert.ok(events.every((e) => e.runId === scope.runId && e.inputRevision === 2));
});

test("new run and input revision invalidate every late callback, including finally", async () => {
  const gate = new AgentRunScope();
  const first = gate.start("first", 0);
  const late = deferred<string>();
  let displayed = "";
  let busy = true;
  const pending = late.promise.then((value) => { if (gate.isCurrent(first)) displayed = value; }).finally(() => { if (gate.isCurrent(first)) busy = false; });
  const second = gate.start("second", 0);
  assert.equal(first.signal.aborted, true);
  late.resolve("old result"); await pending;
  assert.equal(displayed, ""); assert.equal(busy, true);
  assert.equal(gate.isCurrent(second), true);
  gate.invalidate();
  assert.equal(gate.isCurrent(second), false);
  assert.equal(second.signal.aborted, true);
});

test("source case remains part of identity even if a caller reuses a run id", () => {
  const gate = new AgentRunScope();
  const source = gate.start("same-run", 0, "S2-03");
  assert.equal(source.caseId, "S2-03");
  assert.equal(gate.isCurrent({ runId: "same-run", inputRevision: 0, caseId: "S2-01" }), false);
  assert.equal(gate.isCurrent({ runId: "same-run", inputRevision: 0, caseId: "S2-03" }), true);
  gate.start("same-run", 0, "S1-04");
  assert.equal(gate.isCurrent(source), false);
});

test("NDJSON parser handles UTF-8 and line splits and rejects truncated or wrong-run streams", async () => {
  const result = { provider: "ollama", model: "test", utterance: utt, router: null, routerError: null, routerRaw: "", routerUsage: null, intake: null, intakeError: null, intakeRaw: "", intakeUsage: null };
  const payload = new TextEncoder().encode(JSON.stringify({ type: "result", ...scope, result }) + "\n");
  const response = new Response(new ReadableStream({ start(c) { for (let i = 0; i < payload.length; i += 3) c.enqueue(payload.slice(i, i + 3)); c.close(); } }), { headers: { "content-type": "application/x-ndjson" } });
  assert.equal((await readAgentResponse(response, scope, () => {})).utterance, utt);
  await assert.rejects(readAgentResponse(new Response("", { headers: { "content-type": "application/x-ndjson" } }), scope, () => {}), /완료 응답/);
  await assert.rejects(readAgentResponse(new Response(JSON.stringify({ type: "result", ...scope, runId: "other", result }), { headers: { "content-type": "application/x-ndjson" } }), scope, () => {}), /실행/);
});

test("current confirmed fields and date drive preview, without inventing a missing visa", () => {
  const missingVisa = evaluateAgentInput({ fields: { ...fields, visa: undefined }, today: "2026-09-05", utterance: utt, skillId: "departure", needsClarify: false });
  assert.equal(missingVisa.canApprove, false);
  assert.equal(missingVisa.steps.find((s) => s.n === "2단")?.status, "중단");
  const valid = evaluateAgentInput({ fields, today: "2026-09-05", utterance: utt, skillId: "departure", needsClarify: false });
  assert.equal(valid.canApprove, true);
  assert.equal(valid.applyCheck?.ok, true);
  const edited = evaluateAgentInput({ fields: { ...fields, nationality: "네팔", monthlyWage: 3000000 }, today: "2026-10-13", utterance: utt, skillId: "departure", needsClarify: false });
  assert.ok(edited.applyCheck?.ok);
  if (edited.applyCheck?.ok) {
    assert.equal(edited.applyCheck.input.nationality, "네팔");
    assert.equal(edited.applyCheck.input.today, "2026-10-13");
    assert.deepEqual(edited.findings, judgeDeparture(edited.applyCheck.input));
  }
  assert.notDeepEqual(edited.findings, valid.findings);
  assert.equal(edited.steps.filter((s) => s.status === "완료").length, 4);
});

test("invalid calendar dates cannot be approved after a manual correction", () => {
  for (const value of ["2026-02-31", "2026-13-01", "bad date"]) {
    const result = evaluateAgentInput({ fields, today: value, utterance: utt, skillId: "departure", needsClarify: false });
    assert.equal(result.canApprove, false);
    assert.equal(result.applyCheck?.ok, false);
  }
});

test("failed request blocks approval, and payslip has no invented fixture findings", () => {
  const failed = evaluateAgentInput({ fields, today: "2026-09-05", utterance: utt, skillId: "departure", needsClarify: false, requestError: "라우팅 실패" });
  assert.equal(failed.canApprove, false);
  assert.equal(failed.findings.length, 0);
  const payslip = evaluateAgentInput({ fields, today: "2026-09-05", utterance: "월급 명세서", skillId: "payslip", needsClarify: false });
  assert.equal(payslip.findings.length, 0);
  assert.equal(payslip.steps[0].status, "중단");
});
