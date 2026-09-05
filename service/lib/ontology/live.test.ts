import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLiveOntology, type LiveOntologyInput, type LiveOntologySnapshot } from "./live.ts";
import type { AgentResponse } from "../agentExecution.ts";
import { FLOW } from "../flow.ts";
import { skills } from "../skills.ts";
import { evaluateAgentInput } from "../agentEvaluation.ts";
import { buildRunABox, validateABox } from "./abox.ts";
import type { StepLike } from "../office.ts";

const utterance = "베트남 E-9 근로자입니다. 2023-09-01 입사, 2026-10-15 출국, 월급 215만원입니다.";
const fields = { nationality: "베트남", visa: "E-9", hireDate: "2023-09-01", departureDate: "2026-10-15", monthlyWage: 2_150_000 };
const response: AgentResponse = {
  provider: "test", model: "test-model", utterance,
  router: { skill: "departure", evidence: ["출국"], filteredCount: 0 }, routerError: null,
  routerRaw: "RAW_ROUTER_MUST_NOT_APPEAR", routerUsage: null,
  intake: { fields, evidences: { nationality: "베트남", monthlyWage: "215만원" }, questions: [], discarded: [] },
  intakeError: null, intakeRaw: "RAW_INTAKE_MUST_NOT_APPEAR", intakeUsage: null,
};
const empty: LiveOntologyInput = {
  caseId: "case-1", monitorRevision: 0, abox: null,
  agent: {
    caseId: "case-1", runId: null, inputRevision: 0, utterance,
    busy: false, requests: { routing: { status: "idle" }, extract: { status: "idle" } },
    result: null, error: null, confirmFields: {}, steps: [], finalSkillId: "departure",
    approvedAt: null, application: "idle", recordStatus: "idle", finalAnswer: null,
  },
};
function completed(): LiveOntologyInput {
  const evaluated = evaluateAgentInput({ fields, today: "2026-09-05", utterance, skillId: "departure", needsClarify: false, caseId: "case-1" });
  return {
    ...empty, abox: evaluated.ontology,
    agent: { ...empty.agent, runId: "run-1", result: response, confirmFields: fields, steps: evaluated.steps, finalAnswer: evaluated.answer,
      requests: { routing: { status: "completed", ms: 51 }, extract: { status: "completed", ms: 86 } } },
  };
}
function validateGraph(graph: LiveOntologySnapshot) {
  assert.equal(new Set(graph.nodes.map((node) => node.id)).size, graph.nodes.length);
  assert.equal(new Set(graph.edges.map((edge) => edge.id)).size, graph.edges.length);
  const ids = new Set(graph.nodes.map((node) => node.id));
  graph.edges.forEach((edge) => { assert.ok(ids.has(edge.source)); assert.ok(ids.has(edge.target)); });
  graph.nodes.filter((node) => node.parentId).forEach((node) => assert.ok(ids.has(node.parentId!)));
}

test("unexecuted input exposes the service catalog without invented work or results", () => {
  const graph = buildLiveOntology(empty);
  assert.deepEqual(graph.events, []);
  assert.equal(graph.generatedCount, 0);
  assert.equal(graph.runningCount, 0);
  assert.ok(graph.nodes.every((node) => node.kind === "service" && node.status === "available"));
  for (const step of FLOW) assert.equal(graph.nodes.find((node) => node.id === `service:${step.id}`)?.label, step.이름);
  for (const skill of skills) assert.equal(graph.nodes.find((node) => node.id === `service:skill:${skill.id}`)?.label, skill.name);
  assert.ok(graph.nodes.every((node) => node.detail && node.codeSource));
  validateGraph(graph);
});

test("run acceptance and observed requests add independently without fabricating intermediate stages", () => {
  const accepted: LiveOntologyInput = { ...empty, agent: { ...empty.agent, runId: "run-1", busy: true } };
  const first = buildLiveOntology(accepted);
  assert.equal(first.events.length, 1);
  assert.equal(first.events[0].parentId, "service:input");
  assert.equal(first.runningCount, 0);
  assert.equal(buildLiveOntology(completed()).events[0].id, first.events[0].id, "accepted input keeps its identity when results arrive");
  const routing = buildLiveOntology({ ...accepted, agent: { ...accepted.agent, requests: { routing: { status: "running" }, extract: { status: "idle" } } } });
  assert.equal(routing.events.length, 2);
  assert.equal(routing.runningCount, 1);
  assert.equal(routing.nodes.find((node) => node.id === "service:routing")?.status, "running");
  assert.ok(!routing.events.some((node) => node.parentId === "service:extract"));
  const parallel = buildLiveOntology({ ...accepted, agent: { ...accepted.agent, requests: { routing: { status: "completed" }, extract: { status: "running" } } } });
  assert.equal(parallel.events.length, 3);
  assert.equal(parallel.runningCount, 1);
  assert.ok(!parallel.events.some((node) => node.parentId === "service:judge"));
  assert.ok(!parallel.edges.some((edge) => edge.source === "service:routing" && edge.target === "service:extract"));
  validateGraph(parallel);
});

test("accepted results expose confirmed data, validated evidence and the existing evaluation only", () => {
  const input = completed();
  const before = structuredClone(input);
  const graph = buildLiveOntology(input);
  assert.deepEqual(input, before, "projection must not mutate the accepted run");
  assert.equal(graph.nodes.find((node) => node.values?.field === "monthlyWage" && "value" in node.values)?.values?.value, 2_150_000);
  assert.ok(graph.nodes.some((node) => node.values?.quote === "215만원"));
  assert.ok(graph.events.some((node) => node.parentId === "service:judge" && node.status === "completed"));
  assert.equal(graph.events.filter((node) => node.parentId === "service:ontology").length, 1, "one accepted validation is not two executions");
  assert.ok(graph.nodes.some((node) => node.conceptId === "money.range"));
  assert.ok(!JSON.stringify(graph).includes("RAW_"));
  assert.ok(!graph.events.some((node) => ["service:approval", "service:application", "service:record", "service:translate"].includes(node.parentId ?? "")));
  assert.deepEqual(buildLiveOntology(input), graph);
  validateGraph(graph);
});

test("partial request failure preserves success but cannot invent valid fields, judgments or approval", () => {
  const input = completed();
  const graph = buildLiveOntology({ ...input, abox: null, agent: {
    ...input.agent, result: { ...response, intakeError: "근거 계약 실패", intake: null }, confirmFields: {}, finalAnswer: null,
    requests: { routing: { status: "completed" }, extract: { status: "failed", detail: "근거 계약 실패" } },
    steps: [{ n: "2단", label: "판정", status: "차단", detail: "모델 요청을 다시 확인하세요." }, { n: "가드", label: "afterJudge", status: "중단" }],
  } });
  assert.ok(graph.events.some((node) => node.parentId === "service:routing" && node.status === "completed"));
  assert.ok(graph.events.some((node) => node.parentId === "service:extract" && node.status === "blocked"));
  assert.ok(graph.events.some((node) => node.parentId === "service:judge" && node.status === "blocked"));
  assert.ok(!graph.events.some((node) => node.parentId === "service:guard"));
  assert.ok(!graph.nodes.some((node) => node.values?.field || node.kind === "individual" && node.conceptId?.startsWith("verdict")));
  validateGraph(graph);
});

test("AI and keyword disagreement does not attribute the keyword candidate to the model", () => {
  const input = completed();
  const graph = buildLiveOntology({ ...input, agent: { ...input.agent, result: { ...response, router: { skill: "payslip", evidence: ["월급"], filteredCount: 0 } } } });
  const modelCandidate = graph.nodes.find((node) => node.label.startsWith("AI 선택"))!;
  const keywordCandidate = graph.nodes.find((node) => node.label.startsWith("키워드 후보"))!;
  assert.ok(keywordCandidate);
  assert.ok(graph.edges.some((edge) => edge.source === keywordCandidate.id && edge.target === "service:skill:departure"));
  assert.ok(!graph.edges.some((edge) => edge.source === modelCandidate.id && edge.target === "service:skill:departure"));
});

test("missing confirmed inputs retain the actual question and judge stop without fabricated downstream work", () => {
  const input = completed();
  const evaluated = evaluateAgentInput({ fields: { nationality: "베트남" }, today: "2026-09-05", utterance, skillId: "departure", needsClarify: false, caseId: "case-1" });
  const graph = buildLiveOntology({ ...input, abox: evaluated.ontology, agent: { ...input.agent, confirmFields: { nationality: "베트남" },
    result: { ...response, intake: { fields: { nationality: "베트남" }, evidences: { nationality: "베트남" }, questions: ["체류자격이 무엇인가요?"], discarded: [] } },
    steps: evaluated.steps, finalAnswer: evaluated.answer } });
  assert.ok(graph.nodes.some((node) => node.values?.question === "체류자격이 무엇인가요?"));
  assert.ok(graph.events.some((node) => node.parentId === "service:judge" && node.status === "blocked"));
  assert.ok(!graph.events.some((node) => ["service:guard", "service:ontology", "service:narrate"].includes(node.parentId ?? "")));
  assert.ok(!graph.nodes.some((node) => node.values?.["d.amount"] || node.values?.["d.range-max"]));
});

test("a failed run without a result never promotes cached fields, approval or completed steps", () => {
  const input = completed();
  const graph = buildLiveOntology({ ...input, abox: null, agent: { ...input.agent, result: null, error: "응답 연결 종료", approvedAt: "2026-09-05 10:00", application: "applied", recordStatus: "completed" } });
  assert.ok(!graph.nodes.some((node) => node.values?.field || node.kind === "individual" && node.conceptId?.startsWith("verdict")));
  assert.ok(!graph.events.some((node) => ["service:approval", "service:application", "service:record", "service:judge", "service:narrate"].includes(node.parentId ?? "")));
  assert.ok(graph.events.some((node) => node.status === "blocked"));
});

test("a correction replaces the current value and identifies evidence as belonging to the earlier extraction", () => {
  const input = completed();
  const graph = buildLiveOntology({ ...input, abox: null, agent: { ...input.agent, inputRevision: 1, confirmFields: { ...fields, monthlyWage: 3_200_000 } } });
  const wage = graph.nodes.find((node) => node.values?.field === "monthlyWage" && "value" in node.values)!;
  assert.equal(wage.values?.value, 3_200_000);
  assert.match(wage.detail, /수정/);
  const evidence = graph.nodes.find((node) => node.values?.quote === "215만원")!;
  assert.ok(evidence);
  assert.ok(graph.edges.some((edge) => edge.source === evidence.id && edge.target === wage.id && edge.label.includes("수정 전")));
  assert.ok(!graph.nodes.some((node) => node.values?.field === "monthlyWage" && node.values?.value === 2_150_000));
});

test("case changes, same-case reruns and input revisions isolate generated identities", () => {
  const input = completed();
  const first = buildLiveOntology(input);
  const other = buildLiveOntology({ ...input, caseId: "case-2", abox: null });
  assert.equal(other.generatedCount, 0);
  assert.deepEqual(other.events, []);
  for (const agent of [{ ...input.agent, runId: "run-2" }, { ...input.agent, inputRevision: 1 }]) {
    const next = buildLiveOntology({ ...input, agent });
    assert.notEqual(next.scopeKey, first.scopeKey);
    const generated = new Set(first.nodes.filter((node) => node.kind !== "service").map((node) => node.id));
    assert.ok(next.nodes.filter((node) => node.kind !== "service").every((node) => !generated.has(node.id)));
  }
  const rerunning = buildLiveOntology({ ...empty, agent: { ...empty.agent, runId: "run-2", busy: true } });
  assert.equal(rerunning.events.length, 1);
  assert.ok(!rerunning.nodes.some((node) => node.kind === "individual" && node.conceptId?.startsWith("verdict")));
});

test("monitor ABox data can appear without inventing model execution, and uses its own revision", () => {
  const graph = buildRunABox({ caseId: "case-1", skillId: "payslip", workplaceSize: "모름", findings: [{ rule: "A1", level: "정상", title: "공제 확인", basis: "테스트 근거" }] });
  const input = { ...empty, abox: { graph, check: validateABox(graph) } };
  const projected = buildLiveOntology(input);
  assert.match(projected.label, /판정 화면/);
  assert.ok(projected.nodes.some((node) => node.conceptId === "payslip.size.unknown"));
  assert.ok(!projected.events.some((node) => ["service:input", "service:routing", "service:extract"].includes(node.parentId ?? "")));
  assert.notEqual(buildLiveOntology({ ...input, monitorRevision: 1 }).scopeKey, projected.scopeKey);
  const size = projected.nodes.find((node) => node.conceptId === "payslip.size.unknown")!;
  assert.equal(size.values?.["d.workplace-size"], "모름");
  validateGraph(projected);
});

test("only real selected ABox links become evidence relations", () => {
  const input = completed();
  const graph = buildLiveOntology(input);
  const a = graph.nodes.find((node) => node.conceptId === "departure.nationality.paid")!;
  const b = graph.nodes.find((node) => node.values?.["d.rule"] === "S2-3")!;
  assert.ok(graph.edges.some((edge) => edge.source === a.id && edge.target === b.id));
  assert.ok(!graph.edges.some((edge) => edge.source === b.id && edge.target === a.id));
});

test("optional approval, apply, recording and translation appear only after their actual signals", () => {
  const input = completed();
  const approved = buildLiveOntology({ ...input, agent: { ...input.agent, approvedAt: "2026-09-05 10:00" } });
  assert.ok(approved.events.some((node) => node.parentId === "service:approval"));
  assert.ok(!approved.events.some((node) => node.parentId === "service:application" || node.parentId === "service:record"));
  const applied = buildLiveOntology({ ...input, agent: { ...input.agent, approvedAt: "2026-09-05 10:00", application: "applied", recordStatus: "completed" } });
  assert.ok(applied.events.some((node) => node.parentId === "service:application"));
  assert.ok(applied.events.some((node) => node.parentId === "service:record"));
  for (const status of ["idle", "skipped"] as const) {
    assert.ok(!buildLiveOntology({ ...input, translation: { status, language: "ko" } }).events.some((node) => node.parentId === "service:translate"));
  }
  for (const [status, expected] of [["running", "running"], ["completed", "completed"], ["failed", "blocked"], ["rejected", "blocked"]] as const) {
    const translated = buildLiveOntology({ ...input, translation: { status, language: "vi", detail: "현재 답변 번역" } });
    assert.equal(translated.events.find((node) => node.parentId === "service:translate")?.status, expected);
    validateGraph(translated);
  }
});

const monitorSteps: StepLike[] = [
  { n: "0단", label: "키워드", status: "완료", detail: "모니터의 키워드 라우팅" },
  { n: "1단", label: "입력", status: "완료", detail: "명세서 직접 입력" },
  { n: "가드", label: "beforeJudge", status: "완료", detail: "판정 전 확인" },
  { n: "2단", label: "판정", status: "완료", detail: "입력한 명세서 판정 완료" },
  { n: "가드", label: "afterJudge", status: "차단", detail: "실제 판정 후 가드레일 위반" },
  { n: "온톨로지", label: "A-Box 대조", status: "완료", detail: "실제 명세서 개체 대조 완료" },
  { n: "3단", label: "답변", status: "완료", detail: "현재 명세서 한국어 답변" },
];
function payslipHandoff(): LiveOntologyInput {
  const graph = buildRunABox({ caseId: "case-1", skillId: "payslip", workplaceSize: "모름", findings: [{ rule: "A1", level: "정상", title: "공제 확인", basis: "테스트 근거" }] });
  const input = completed();
  return { ...input, abox: { graph, check: validateABox(graph) }, agent: { ...input.agent, finalSkillId: "payslip", finalAnswer: null,
    steps: [{ n: "2단", label: "판정", status: "중단", detail: "실제 급여명세서 입력이 필요합니다." }],
    result: { ...response, router: { skill: "payslip", evidence: ["월급"], filteredCount: 0 } },
  } };
}

test("linked payslip uses the selected monitor stages and answer while retaining observed agent requests", () => {
  const graph = buildLiveOntology({ ...payslipHandoff(), monitor: { steps: monitorSteps, answer: { headline: "현재 명세서 한국어 답변" } } });
  assert.match(graph.label, /명세서 판정|판정 화면/);
  assert.match(graph.label, /run-1/);
  assert.equal(graph.events.find((node) => node.parentId === "service:judge")?.status, "completed");
  assert.equal(graph.events.find((node) => node.parentId === "service:narrate")?.status, "completed");
  assert.equal(graph.nodes.find((node) => node.id === "service:judge")?.status, "completed");
  assert.ok(graph.nodes.some((node) => node.values?.headline === "현재 명세서 한국어 답변"));
  assert.ok(graph.nodes.some((node) => node.values?.quote === "215만원"));
  assert.equal(graph.events.filter((node) => node.parentId === "service:routing").length, 1);
  assert.equal(graph.events.filter((node) => node.parentId === "service:extract").length, 1);
  assert.equal(graph.events.find((node) => node.parentId === "service:extract")?.values?.ms, 86);
  assert.equal(graph.events.filter((node) => node.parentId === "service:ontology").length, 1);
  assert.ok(!graph.events.some((node) => node.detail.includes("급여명세서 입력이 필요")));
  validateGraph(graph);
});

test("the final afterJudge observation overrides the earlier guard result without duplicate events", () => {
  const graph = buildLiveOntology({ ...payslipHandoff(), monitor: { steps: monitorSteps, answer: { headline: "현재 명세서 한국어 답변" } } });
  const guard = graph.events.filter((node) => node.parentId === "service:guard");
  assert.equal(guard.length, 1);
  assert.equal(guard[0].status, "blocked");
  assert.equal(guard[0].detail, "실제 판정 후 가드레일 위반");
  assert.equal(graph.nodes.find((node) => node.id === "service:guard")?.status, "blocked");
  assert.ok(graph.events.findIndex((node) => node.parentId === "service:judge") < graph.events.indexOf(guard[0]));
});

test("without selected monitor execution the payslip handoff remains blocked", () => {
  const graph = buildLiveOntology(payslipHandoff());
  assert.equal(graph.events.find((node) => node.parentId === "service:judge")?.status, "blocked");
  assert.ok(!graph.nodes.some((node) => node.values?.headline));
});

test("monitor-only runs expose actual judgment and narration but never manufacture provider calls", () => {
  const input = payslipHandoff();
  const graph = buildLiveOntology({ ...input, agent: empty.agent, monitor: { steps: monitorSteps, answer: { headline: "모니터 답변" } } });
  assert.equal(graph.events.find((node) => node.parentId === "service:judge")?.status, "completed");
  assert.equal(graph.events.find((node) => node.parentId === "service:narrate")?.status, "completed");
  assert.ok(graph.nodes.some((node) => node.values?.headline === "모니터 답변"));
  assert.ok(!graph.events.some((node) => ["service:input", "service:routing", "service:extract"].includes(node.parentId ?? "")));
  assert.equal(graph.nodes.find((node) => node.id === "service:routing")?.status, "available");
  assert.equal(graph.nodes.find((node) => node.id === "service:extract")?.status, "available");
  validateGraph(graph);
});

test("monitor answers never inherit approval from a different agent answer", () => {
  const input = completed();
  const graph = buildLiveOntology({ ...input, agent: { ...input.agent, approvedAt: "2026-09-05 10:00", application: "applied", recordStatus: "completed" },
    monitor: { steps: monitorSteps, answer: { headline: "수정 후 모니터 답변" } } });
  assert.ok(graph.nodes.some((node) => node.values?.headline === "수정 후 모니터 답변"));
  assert.ok(!graph.nodes.some((node) => node.values?.headline === input.agent.finalAnswer?.headline));
  assert.ok(!graph.events.some((node) => ["service:approval", "service:application", "service:record"].includes(node.parentId ?? "")));
});
