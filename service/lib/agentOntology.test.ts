import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateAgentInput } from "./agentEvaluation.ts";

const input = {
  fields: { nationality: "베트남", visa: "E-9", hireDate: "2023-09-01", departureDate: "2026-10-15", monthlyWage: 2150000 },
  today: "2026-09-05", utterance: "베트남 E-9 근로자입니다. 출국합니다.",
  skillId: "departure", needsClarify: false, caseId: "current-consultation",
};
test("ontology exposes the same current-input graph that the evaluation validated", () => {
  const evaluated = evaluateAgentInput(input);
  assert.ok(evaluated.ontology);
  assert.equal(evaluated.ontology.graph.runId, input.caseId);
  assert.deepEqual(evaluated.ontology.check.violations, []);
  assert.equal(evaluated.steps.find((s) => s.n === "온톨로지")?.status, "완료");
  assert.ok(evaluated.ontology.graph.individuals.some((i) => Object.values(i.values ?? {}).includes(input.utterance)));
});
test("missing, failed and payroll-handoff evaluations never reuse a previous graph", () => {
  assert.ok(evaluateAgentInput(input).ontology);
  assert.equal(evaluateAgentInput({ ...input, fields: { ...input.fields, visa: undefined } }).ontology, null);
  assert.equal(evaluateAgentInput({ ...input, requestError: "근거 계약 실패" }).ontology, null);
  assert.equal(evaluateAgentInput({ ...input, skillId: "payslip" }).ontology, null);
});
test("edits and customer changes generate graph values from that exact context", () => {
  const next = evaluateAgentInput({ ...input, caseId: "next-customer", utterance: "수정한 발화", fields: { ...input.fields, monthlyWage: 3200000 } });
  assert.ok(next.ontology);
  assert.equal(next.ontology.graph.runId, "next-customer");
  const values = next.ontology.graph.individuals.flatMap((i) => Object.values(i.values ?? {}));
  assert.ok(values.includes("수정한 발화"));
  assert.ok(values.includes(3200000));
  assert.ok(!values.includes(2150000));
});
