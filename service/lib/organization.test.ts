import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FLOW } from "./flow.ts";
import { skills } from "./skills.ts";
import { evaluateAgentInput } from "./agentEvaluation.ts";
import { judgePayslip } from "./rules/payslip.ts";
import { samples } from "./samples.ts";
import { buildRunABox, validateABox } from "./ontology/abox.ts";
import { buildLiveOntology, type LiveOntologyInput, type LiveOntologySnapshot } from "./ontology/live.ts";
import type { AgentResponse } from "./agentExecution.ts";
import { ORGANIZATION_CAPABILITIES, ORGANIZATION_DEPARTMENTS, capabilityState, summarizeOrgStates } from "./organization.ts";

const utterance = "베트남 E-9 근로자입니다. 2023-09-01 입사, 2026-10-15 출국, 월급 215만원입니다.";
const fields = { nationality: "베트남", visa: "E-9", hireDate: "2023-09-01", departureDate: "2026-10-15", monthlyWage: 2_150_000 };
const response: AgentResponse = {
  provider: "test", model: "test-model", utterance,
  router: { skill: "departure", evidence: ["출국"], filteredCount: 0 }, routerError: null, routerRaw: "", routerUsage: null,
  intake: { fields, evidences: { nationality: "베트남", monthlyWage: "215만원" }, questions: [], discarded: [] },
  intakeError: null, intakeRaw: "", intakeUsage: null,
};
const empty: LiveOntologyInput = {
  caseId: "case-1", monitorRevision: 0, abox: null,
  agent: {
    caseId: "case-1", runId: null, inputRevision: 0, utterance, busy: false,
    requests: { routing: { status: "idle" }, extract: { status: "idle" } },
    result: null, error: null, confirmFields: {}, steps: [], finalSkillId: "departure",
    approvedAt: null, application: "idle", recordStatus: "idle", finalAnswer: null,
  },
};
const available = { agent: true, translation: true };
const unavailable = { agent: false, translation: false };
const card = (id: string) => {
  const capability = ORGANIZATION_CAPABILITIES.find((item) => item.id === id);
  assert.ok(capability, `missing organization capability: ${id}`);
  return capability;
};
const state = (id: string, snapshot: LiveOntologySnapshot, connected = available, canApprove = false) =>
  capabilityState(card(id), snapshot, connected, canApprove);
const summary = (snapshot: LiveOntologySnapshot, connected = available, canApprove = false) =>
  summarizeOrgStates(ORGANIZATION_CAPABILITIES.map((capability) => capabilityState(capability, snapshot, connected, canApprove)));

function completed(): LiveOntologyInput {
  const evaluation = evaluateAgentInput({ fields, today: "2026-09-05", utterance, skillId: "departure", needsClarify: false, caseId: "case-1" });
  assert.ok(evaluation.canApprove && evaluation.answer && evaluation.ontology);
  return {
    ...empty, abox: evaluation.ontology,
    agent: { ...empty.agent, runId: "run-1", result: response, confirmFields: fields, steps: evaluation.steps, finalAnswer: evaluation.answer,
      requests: { routing: { status: "completed", ms: 51, detail: "라우팅 근거 검증 완료" }, extract: { status: "completed", ms: 86 } } },
  };
}

test("organization assigns each actual service once and gives each department its own capabilities", () => {
  assert.equal(ORGANIZATION_CAPABILITIES.length, 13);
  assert.equal(new Set(ORGANIZATION_CAPABILITIES.map((capability) => capability.id)).size, 13);
  const snapshot = buildLiveOntology(empty);
  assert.deepEqual(new Set(ORGANIZATION_CAPABILITIES.map((capability) => capability.serviceId)),
    new Set(snapshot.nodes.filter((node) => node.kind === "service").map((node) => node.id)));
  assert.deepEqual(ORGANIZATION_DEPARTMENTS.map((department) => [department.id,
    ORGANIZATION_CAPABILITIES.filter((capability) => capability.departmentId === department.id).map((capability) => capability.id)]), [
    ["intake", ["input", "routing", "extract"]],
    ["decision", ["judge", "payslip", "departure"]],
    ["assurance", ["guard", "ontology"]],
    ["response", ["narrate", "translate", "record"]],
  ]);
  assert.equal(card("approval").departmentId, null);
  assert.equal(card("approval").actor, "사람");
  assert.equal(card("application").departmentId, null);
  assert.equal(card("application").actor, "코드");
});

test("capability details follow real flow and skill registries so navigation and inspection scope cannot drift", () => {
  for (const step of FLOW) {
    const capability = card(step.id);
    assert.equal(capability.title, step.이름);
    assert.equal(capability.actor, step.행위자);
    assert.equal(capability.summary, step.하는일);
    assert.deepEqual(capability.target, { view: step.보는곳.view, ...(step.보는곳.tab ? { tab: step.보는곳.tab } : {}), label: step.보는곳.라벨 });
    assert.ok(capability.constraints.includes(step.실패하면));
  }
  for (const skill of skills) {
    const capability = card(skill.id);
    assert.equal(capability.skillId, skill.id);
    assert.equal(capability.title, skill.name);
    assert.deepEqual(capability.input, skill.requiredInputs.map((field) => field.label));
    assert.ok(capability.summary.includes(String(skill.ruleCatalog.length)));
    for (const limitation of skill.notCovered ?? []) assert.ok(capability.constraints.includes(limitation));
    assert.equal(capability.actor, "코드");
    assert.equal(capability.serviceId, `service:skill:${skill.id}`);
  }
});

test("every capability provides input, output, constraints and a resolvable implementation reference", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  for (const capability of ORGANIZATION_CAPABILITIES) {
    for (const values of [capability.input, capability.output, capability.constraints, capability.source]) {
      assert.ok(values.length > 0 && values.every((value) => value.trim().length > 0), capability.id);
    }
    for (const source of capability.source) {
      const [file, symbol] = source.split(":");
      const text = readFileSync(join(root, file), "utf8");
      assert.ok(symbol && text.includes(symbol), `${capability.id}: unresolved ${source}`);
    }
  }
});

test("idle provider availability never invents work and offline models do not block deterministic services", () => {
  const snapshot = buildLiveOntology(empty);
  for (const capability of ORGANIZATION_CAPABILITIES) {
    assert.equal(capabilityState(capability, snapshot, available).status, "ready");
    assert.equal(capabilityState(capability, snapshot, unavailable).status, capability.actor === "모델" ? "offline" : "ready");
    assert.equal(capabilityState(capability, snapshot, available).ms, undefined);
  }
  assert.deepEqual(summary(snapshot), { running: 0, completed: 0, blocked: 0, review: 0 });
  assert.deepEqual(summary(snapshot, unavailable), { running: 0, completed: 0, blocked: 0, review: 0 });
  assert.equal(state("translate", snapshot, { agent: false, translation: true }).status, "ready");
  assert.equal(state("routing", snapshot, { agent: true, translation: false }).status, "ready");
});

test("two observed provider requests run independently even if availability has since changed", () => {
  const input = { ...empty, agent: { ...empty.agent, runId: "run-1", busy: true } };
  const accepted = buildLiveOntology(input);
  assert.deepEqual(summary(accepted), { running: 0, completed: 1, blocked: 0, review: 0 });
  const snapshot = buildLiveOntology({ ...input, agent: { ...input.agent, requests: {
    routing: { status: "running", detail: "라우팅 응답 대기" }, extract: { status: "running", detail: "추출 응답 대기" },
  } } });
  assert.deepEqual(summary(snapshot, unavailable), { running: 2, completed: 1, blocked: 0, review: 0 });
  assert.equal(state("routing", snapshot, unavailable).detail, "라우팅 응답 대기");
  assert.equal(state("extract", snapshot, unavailable).detail, "추출 응답 대기");
  assert.equal(state("routing", snapshot).ms, undefined);
  assert.equal(state("judge", snapshot).status, "ready");
});

test("a partial request failure preserves the successful request and blocks only observed failed stages", () => {
  const input = completed();
  const snapshot = buildLiveOntology({ ...input, abox: null, agent: {
    ...input.agent, result: { ...response, intake: null, intakeError: "근거 계약 실패" }, finalAnswer: null,
    requests: { routing: { status: "completed", ms: 51 }, extract: { status: "failed", detail: "근거 계약 실패", ms: 95 } },
    steps: [{ n: "2단", label: "판정", status: "차단", detail: "모델 요청을 다시 확인하세요." }, { n: "가드", label: "afterJudge", status: "중단" }],
  } });
  assert.equal(state("routing", snapshot, unavailable).status, "completed");
  assert.equal(state("extract", snapshot, unavailable).status, "blocked");
  assert.equal(state("extract", snapshot).detail, "근거 계약 실패");
  assert.equal(state("extract", snapshot).ms, 95);
  assert.equal(state("judge", snapshot).status, "blocked");
  assert.equal(state("guard", snapshot).status, "ready");
  assert.equal(state("approval", snapshot, available, true).status, "ready");
  assert.deepEqual(summary(snapshot), { running: 0, completed: 2, blocked: 2, review: 0 });
});

test("only finite nonnegative observed timing is shown and the latest matching service event supplies detail", () => {
  const input = completed();
  for (const ms of [0, 51, -1, NaN, Infinity, undefined]) {
    const snapshot = buildLiveOntology({ ...input, agent: { ...input.agent, requests: { ...input.agent.requests, routing: { status: "completed", ms } } } });
    assert.equal(state("routing", snapshot).ms, typeof ms === "number" && Number.isFinite(ms) && ms >= 0 ? ms : undefined);
  }
  const failure = buildLiveOntology({ ...empty, agent: { ...empty.agent, runId: "run-1", error: "응답 연결 종료" } });
  assert.equal(state("input", failure).status, "blocked");
  assert.equal(state("input", failure).detail, "응답 연결 종료");
});

test("approval requires both permission and a current agent answer, then actual approval wins", () => {
  assert.equal(state("approval", buildLiveOntology(empty), available, true).status, "ready");
  const input = completed();
  const snapshot = buildLiveOntology(input);
  assert.equal(state("approval", snapshot).status, "ready");
  assert.equal(state("approval", snapshot, available, true).status, "review");
  assert.equal(summary(snapshot, available, true).review, 1);
  const noAnswer = buildLiveOntology({ ...input, agent: { ...input.agent, finalAnswer: null } });
  assert.equal(state("approval", noAnswer, available, true).status, "ready");
  const monitor = buildLiveOntology({ ...input, monitor: { steps: input.agent.steps, answer: { headline: "수정된 판정 화면 답변" } } });
  assert.equal(state("approval", monitor, available, true).status, "ready");
  const approved = buildLiveOntology({ ...input, agent: { ...input.agent, approvedAt: "2026-09-05 10:00" } });
  assert.equal(state("approval", approved, available, true).status, "completed");
  assert.equal(state("application", approved).status, "ready");
  assert.equal(state("record", approved).status, "ready");
  const applied = buildLiveOntology({ ...input, agent: { ...input.agent, approvedAt: "2026-09-05 10:00", application: "applied", recordStatus: "completed" } });
  assert.equal(state("application", applied).status, "completed");
  assert.equal(state("record", applied).status, "completed");
});

test("skill candidates are never executions and completing one real skill cannot complete the other", () => {
  const input = completed();
  const candidate = buildLiveOntology({ ...input, abox: null, agent: { ...input.agent, steps: [], finalAnswer: null } });
  assert.equal(state("departure", candidate).status, "ready");
  const departure = buildLiveOntology(input);
  assert.equal(state("departure", departure).status, "completed");
  assert.equal(state("payslip", departure).status, "ready");
  const payslip = samples[0].payslip;
  const graph = buildRunABox({ caseId: "case-1", skillId: "payslip", workplaceSize: payslip.workplaceSize, findings: judgePayslip(payslip) });
  const snapshot = buildLiveOntology({ ...empty, abox: { graph, check: validateABox(graph) } });
  assert.equal(state("payslip", snapshot).status, "completed");
  assert.equal(state("departure", snapshot).status, "ready");
  assert.equal(state("routing", snapshot).status, "ready");
  assert.equal(state("payslip", snapshot).ms, undefined);
});

test("translation shows its own observed lifecycle without inventing elapsed time or review", () => {
  const input = completed();
  for (const [status, want] of [["running", "running"], ["completed", "completed"], ["failed", "blocked"], ["rejected", "blocked"]] as const) {
    const snapshot = buildLiveOntology({ ...input, translation: { status, language: "vi", detail: "현재 답변 번역 요청" } });
    assert.equal(state("translate", snapshot, unavailable).status, want);
    assert.equal(state("translate", snapshot).detail, "현재 답변 번역 요청");
    assert.equal(state("translate", snapshot).ms, undefined);
  }
  const skipped = buildLiveOntology({ ...input, translation: { status: "skipped", language: "ko" } });
  assert.equal(state("translate", skipped).status, "ready");
});

test("new cases, runs and input revisions use their selected snapshot without cached completed work", () => {
  const input = completed();
  const first = buildLiveOntology(input);
  assert.equal(state("departure", first).status, "completed");
  for (const next of [
    { ...input, caseId: "case-2", abox: null },
    { ...empty, agent: { ...empty.agent, runId: "run-2", busy: true } },
    { ...empty, agent: { ...empty.agent, runId: "run-1", inputRevision: 1, result: response } },
  ]) {
    const snapshot = buildLiveOntology(next);
    assert.notEqual(snapshot.scopeKey, first.scopeKey);
    assert.equal(state("departure", snapshot).status, "ready");
    assert.equal(state("judge", snapshot).status, "ready");
    assert.equal(state("approval", snapshot, available, true).status, "ready");
    assert.equal(state("routing", snapshot).ms, undefined);
  }
  const before = structuredClone(first);
  summary(first, available, true);
  assert.deepEqual(first, before, "organization projection must not mutate the shared snapshot");
});
