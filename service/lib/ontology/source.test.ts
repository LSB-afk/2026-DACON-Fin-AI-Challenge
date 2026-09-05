import { test } from "node:test";
import assert from "node:assert/strict";
import { selectOntologySource } from "./source.ts";
import { buildRunABox, validateABox } from "./abox.ts";

const graph = buildRunABox({ caseId: "case-1", skillId: "payslip", findings: [] });
const monitor = { graph, check: validateABox(graph) };
const agent = { caseId: "case-1", runId: "run-first", inputRevision: 2, busy: false, hasResult: true, skillId: "payslip", ontology: null };
const base = { caseId: "case-1", agent, monitor, monitorRevision: 0, linkedRunId: "run-first", linkedRevision: 2 };

test("completed payslip handoff selects its monitor graph with explicit source", () => {
  const selected = selectOntologySource(base);
  assert.equal(selected.abox, monitor);
  assert.equal(selected.source.kind, "monitor");
  assert.match(selected.source.label, /명세서 판정/);
  assert.match(selected.source.label, /run-first/);
});
test("new, edited, busy and unlinked agent runs cannot expose stale monitor graphs", () => {
  for (const current of [{ ...agent, runId: "run-second" }, { ...agent, inputRevision: 3 }, { ...agent, busy: true }, { ...agent, skillId: "departure" }]) {
    assert.equal(selectOntologySource({ ...base, agent: current }).abox, null);
    assert.equal(selectOntologySource({ ...base, agent: current }).source.kind, "agent");
  }
  assert.equal(selectOntologySource({ ...base, linkedRunId: null }).abox, null);
});
test("same-case reruns and revisions have distinguishable source identities", () => {
  const first = selectOntologySource({ ...base, agent: { ...agent, skillId: "departure" } });
  const second = selectOntologySource({ ...base, agent: { ...agent, runId: "run-second", inputRevision: 3 } });
  assert.notEqual(first.source.label, second.source.label);
  assert.match(first.source.label, /입력 v3/);
  assert.match(second.source.label, /입력 v4/);
});
test("no matching agent context uses monitor results without claiming agent execution", () => {
  const selected = selectOntologySource({ ...base, agent: { ...agent, caseId: "other" } });
  assert.equal(selected.abox, monitor);
  assert.match(selected.source.label, /판정 화면/);
});
test("payslip edits have their own version without relabeling the originating AI request", () => {
  const before = selectOntologySource(base);
  const after = selectOntologySource({ ...base, monitorRevision: 1 });
  assert.notEqual(before.source.label, after.source.label);
  assert.match(after.source.label, /상담 입력 v3/);
  assert.match(after.source.label, /명세서 v2/);
  assert.match(after.source.description, /현재 스냅샷/);
});
