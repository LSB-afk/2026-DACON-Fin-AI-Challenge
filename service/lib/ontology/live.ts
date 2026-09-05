/** Current service state projected as a graph. No evaluation, storage or synthetic history. */
import { FLOW } from "../flow.ts";
import { skills } from "../skills.ts";
import { N_TO_ID, type OfficeCtx, type StepLike } from "../office.ts";
import type { AgentRequests, AgentResponse } from "../agentExecution.ts";
import type { IntakeFields } from "../ai/apply.ts";
import type { ABox, ABoxCheckResult } from "./abox.ts";
import { classById, DATA_PROPERTIES, OBJECT_PROPERTIES, type ClassRole } from "./schema.ts";

export type LiveOntologyNode = {
  id: string;
  label: string;
  role: ClassRole;
  kind: "service" | "event" | "individual" | "class";
  status?: "available" | "running" | "completed" | "blocked";
  parentId?: string | null;
  detail: string;
  codeSource: string;
  conceptId?: string;
  values?: Record<string, unknown>;
};

export type LiveOntologySnapshot = {
  scopeKey: string;
  label: string;
  description: string;
  nodes: LiveOntologyNode[];
  edges: { id: string; source: string; target: string; label: string; evidential?: boolean; hierarchy?: boolean; active?: boolean }[];
  /** Current observed stages, in dependency order; this is not a timestamped event log. */
  events: LiveOntologyNode[];
  runningCount: number;
  generatedCount: number;
};

export type LiveOntologyInput = {
  caseId: string;
  monitorRevision: number;
  agent: {
    caseId: string | null; runId: string | null; inputRevision: number; utterance: string;
    busy: boolean; requests: AgentRequests; result: AgentResponse | null; error: string | null;
    confirmFields: IntakeFields; steps: StepLike[]; finalSkillId: string | null;
    approvedAt: string | null; application: "idle" | "applied"; recordStatus: "idle" | "completed";
    finalAnswer: { headline: string } | null;
  };
  /** Already selected by selectOntologySource; the projection does not choose a fallback. */
  abox: { graph: ABox; check: ABoxCheckResult } | null;
  /** Present only when the selected ABox belongs to the current monitor result. */
  monitor?: { steps: StepLike[]; answer: { headline: string } | null };
  translation?: OfficeCtx["translation"];
};

const SERVICE_CONCEPT: Record<string, string> = {
  input: "utterance", routing: "control.execution.request.routing", extract: "control.execution.request.extract",
  judge: "verdict", guard: "control.guard", ontology: "control", narrate: "evidence.answer", translate: "evidence.translation",
  approval: "control.review.approval", application: "control.review.application", record: "control.review.record",
};
const SERVICE_SOURCE: Record<string, string> = {
  input: "app/_agent-core.ts:run", routing: "lib/agentExecution.ts:runAgentRequests", extract: "lib/agentExecution.ts:runAgentRequests",
  judge: "lib/agentEvaluation.ts:evaluateAgentInput", guard: "lib/harness/guardrails.ts:checkAllGuardrails",
  ontology: "lib/ontology/abox.ts:validateABox", narrate: "lib/narrate.ts:narrate", translate: "app/page.tsx:translationRequests",
  approval: "app/_agent-core.ts:approve", application: "app/_agent-core.ts:applyPayload", record: "app/_agent-core.ts:markApplied",
};
const FIELD_CONCEPT: Record<keyof IntakeFields, string> = {
  nationality: "departure.nationality", visa: "departure.visa", hireDate: "departure.tenure",
  departureDate: "departure.tenure", monthlyWage: "departure.wage", workplaceSize: "payslip.size",
};
const FIELD_LABEL = new Map(skills.flatMap((skill) => skill.requiredInputs.map((field) => [field.key, field.label] as const)));
const propertyById = new Map(OBJECT_PROPERTIES.map((property) => [property.id, property]));
const dataLabel = new Map(DATA_PROPERTIES.map((property) => [property.id, property.label]));
const encode = (value: string) => encodeURIComponent(value);
const displayValue = (value: unknown): string => Array.isArray(value) ? value.map(displayValue).join(" · ") : String(value);

export function buildLiveOntology(input: LiveOntologyInput): LiveOntologySnapshot {
  const { caseId, monitorRevision, abox, translation } = input;
  const monitor = abox ? input.monitor : undefined;
  // Acceptance is owned by AgentRunScope/readAgentResponse. A draft keyword match is not a run.
  const agent = input.agent.caseId === caseId && input.agent.runId ? input.agent : null;
  const scopeKey = JSON.stringify([caseId, agent?.runId ?? null, agent?.inputRevision ?? null, monitorRevision]);
  const runtimePrefix = `live:${encode(scopeKey)}`;
  const runtimeId = (key: string) => `${runtimePrefix}:${key}`;
  const nodes: LiveOntologyNode[] = [];
  const edges: LiveOntologySnapshot["edges"] = [];
  const events: LiveOntologyNode[] = [];
  const byId = new Map<string, LiveOntologyNode>();
  const edgeIds = new Set<string>();

  function connect(source: string, target: string, label: string, options: Pick<LiveOntologySnapshot["edges"][number], "evidential" | "hierarchy" | "active"> = {}) {
    if (!byId.has(source) || !byId.has(target)) return;
    const id = JSON.stringify([source, target, label]);
    if (edgeIds.has(id)) return;
    edgeIds.add(id);
    edges.push({ id, source, target, label, ...options });
  }
  function put(node: LiveOntologyNode) {
    if (byId.has(node.id)) return byId.get(node.id)!;
    nodes.push(node);
    byId.set(node.id, node);
    if (node.parentId) connect(node.parentId, node.id, node.kind === "service" ? "제공하는 검사" : "현재 실행에서 생성", { hierarchy: true, active: node.status === "running" });
    return node;
  }
  function event(key: string, service: string, label: string, status: "running" | "completed" | "blocked", detail: string, values?: Record<string, unknown>, conceptId = SERVICE_CONCEPT[service]) {
    const node = put({ id: runtimeId(key), label, role: classById(conceptId)?.role ?? "통제", kind: "event", status,
      parentId: `service:${service}`, detail, codeSource: SERVICE_SOURCE[service], conceptId, values });
    if (!events.includes(node)) events.push(node);
    const owner = byId.get(`service:${service}`);
    if (owner) owner.status = status;
    return node;
  }
  for (const step of FLOW) {
    const conceptId = SERVICE_CONCEPT[step.id];
    put({ id: `service:${step.id}`, label: step.이름, role: classById(conceptId)?.role ?? "통제", kind: "service", status: "available",
      detail: `${step.행위자} · ${step.하는일}`, codeSource: SERVICE_SOURCE[step.id] ?? "lib/flow.ts:FLOW", conceptId });
  }
  for (const skill of skills) {
    put({ id: `service:skill:${skill.id}`, label: skill.name, role: "산출", kind: "service", status: "available", parentId: "service:judge",
      detail: `등록된 검사 · ${skill.ruleCatalog.length}개 규칙 · 필요 입력: ${skill.requiredInputs.map((field) => field.label).join(", ")}`,
      codeSource: "lib/skills.ts:skills", conceptId: skill.id });
  }
  for (const [id, label, detail] of [
    ["approval", "상담사 승인", "상담사가 현재 확인값과 판정 결과를 승인합니다."],
    ["application", "결과 적용", "현재 실행의 확인값을 판정 화면에 적용합니다."],
    ["record", "상담 기록", "실제 결과 적용 후 상담 기록 완료 상태를 표시합니다."],
  ]) put({ id: `service:${id}`, label, role: "통제", kind: "service", status: "available", detail, codeSource: SERVICE_SOURCE[id], conceptId: SERVICE_CONCEPT[id] });

  // Declared service dependencies. Routing and extraction are independent provider requests.
  for (const [source, target, label] of [
    ["input", "routing", "발화를 전달"], ["input", "extract", "발화를 전달"],
    ["routing", "judge", "검사 선택을 전달"], ["extract", "judge", "확인값을 전달"],
    ["judge", "guard", "판정을 검사"], ["judge", "ontology", "실행 개체를 대조"],
    ["guard", "narrate", "검증한 판정"], ["ontology", "narrate", "용어 대조 결과"],
    ["narrate", "translate", "답변을 번역"], ["narrate", "approval", "검토할 답변"],
    ["approval", "application", "승인값을 적용"], ["application", "record", "상담 결과를 기록"],
  ]) connect(`service:${source}`, `service:${target}`, label);

  const result = agent && !agent.busy && agent.result?.utterance.trim() === agent.utterance.trim() ? agent.result : null;
  const currentAnswer = monitor ? monitor.answer : result && !result.routerError && !result.intakeError ? agent?.finalAnswer : null;
  if (agent) {
    const accepted = event("accepted", "input", "상담 입력 접수", "completed", "현재 상담 실행에 접수한 발화입니다.",
      { caseId, runId: agent.runId, inputRevision: agent.inputRevision, utterance: agent.utterance }, "control.execution.identity");
    for (const stage of ["routing", "extract"] as const) {
      const request = agent.requests[stage];
      if (request.status === "idle") continue;
      const status = request.status === "failed" ? "blocked" : request.status;
      const step = event(`request:${stage}`, stage, `${stage === "routing" ? "라우팅" : "추출"} 요청`, status,
        request.detail ?? (status === "running" ? "제공자 요청의 응답을 기다립니다." : status === "completed" ? "응답과 근거 계약을 검증했습니다." : "요청이 실패했습니다."),
        { status: request.status, ...(request.ms === undefined ? {} : { ms: request.ms }) });
      connect(accepted.id, step.id, "관측한 요청");
    }
    if (agent.error) event("error", "input", "상담 실행 오류", "blocked", agent.error, undefined, "control.execution.event");

    if (result) {
      if (result.router && !result.routerError) {
        const routed = put({ id: runtimeId("routing-result"), label: `AI 선택 · ${skills.find((skill) => skill.id === result.router!.skill)?.name ?? result.router.skill}`,
          role: "입력", kind: "individual", status: "completed", parentId: "service:routing", conceptId: "utterance.candidate",
          detail: "검증된 AI 라우팅 후보입니다. 실제 검사 선택은 현재 상담의 키워드 판단을 따릅니다.", codeSource: "lib/ai/agent.ts:validateRouter",
          values: { skill: result.router.skill, evidence: [...result.router.evidence] } });
        connect(runtimeId("request:routing"), routed.id, "검증된 응답");
      }
      if (agent.finalSkillId) {
        const candidate = put({ id: runtimeId("keyword-candidate"), label: `키워드 후보 · ${skills.find((skill) => skill.id === agent.finalSkillId)?.name ?? agent.finalSkillId}`,
          role: "입력", kind: "individual", status: "completed", parentId: "service:routing", conceptId: "utterance.candidate",
          detail: "현재 키워드 라우터의 우선 후보입니다. 단일 검사 확정 여부는 판정 단계가 확인합니다.", codeSource: "lib/skills.ts:routeByKeyword", values: { skill: agent.finalSkillId } });
        connect(accepted.id, candidate.id, "키워드 판단");
        connect(candidate.id, `service:skill:${agent.finalSkillId}`, "키워드 후보 검사");
      }
      if (result.intake && !result.intakeError) {
        for (const key of Object.keys(FIELD_CONCEPT) as (keyof IntakeFields)[]) {
          const value = agent.confirmFields[key];
          if (value === undefined || value === "" || (typeof value === "number" && !Number.isFinite(value))) continue;
          const corrected = value !== result.intake.fields[key];
          const field = put({ id: runtimeId(`field:${key}`), label: `${FIELD_LABEL.get(key) ?? key} · ${displayValue(value)}`, role: "입력", kind: "individual", status: "completed",
            parentId: "service:extract", conceptId: FIELD_CONCEPT[key], codeSource: "app/_agent-core.ts:confirmFields",
            detail: monitor ? "연결된 AI 상담의 확인값입니다. 현재 판정 화면의 입력은 판정 개체에서 확인할 수 있습니다."
              : corrected ? "상담사가 수정한 현재 확인값입니다. 이 값이 현재 판정에 사용됩니다." : "현재 상담 화면의 확인값입니다.", values: { field: key, value } });
          connect(runtimeId("request:extract"), field.id, corrected ? "추출 후 확인·수정" : "검증된 추출값");
          const quote = result.intake.evidences[key];
          if (quote) {
            const evidence = put({ id: runtimeId(`evidence:${key}`), label: `원문 근거 · ${FIELD_LABEL.get(key) ?? key}`, role: "입력", kind: "individual", status: "completed",
              parentId: "service:extract", conceptId: "evidence.input.accepted", codeSource: "lib/ai/agent.ts:validateIntake",
              detail: corrected ? "수정 전 추출값이 인용한 원문입니다. 현재 수정값의 증거를 뜻하지 않습니다." : "원문과 대조해 통과한 추출 근거입니다.", values: { field: key, quote } });
            connect(evidence.id, field.id, corrected ? "수정 전 추출 근거" : "원문으로 확인", { evidential: true });
          }
        }
        result.intake.questions.forEach((question, index) => put({ id: runtimeId(`question:${index}`), label: "추가 확인 질문", role: "입력", kind: "individual", status: "blocked",
          parentId: "service:extract", conceptId: "utterance.clarify", codeSource: "lib/ai/agent.ts:validateIntake", detail: question, values: { question } }));
        result.intake.discarded.forEach((discarded, index) => put({ id: runtimeId(`discarded:${index}`), label: `제외한 추출 · ${FIELD_LABEL.get(discarded.field) ?? discarded.field}`,
          role: "통제", kind: "individual", status: "blocked", parentId: "service:extract", conceptId: "evidence.input.discarded", codeSource: "lib/ai/agent.ts:validateIntake",
          detail: discarded.reason, values: { ...discarded } }));
      }
    }
  }

  // Monitor routing/entry rows do not represent provider requests. Keep only downstream facts.
  const downstream = new Map<string, StepLike>();
  for (const step of monitor?.steps ?? (result ? agent?.steps ?? [] : [])) {
    const service = N_TO_ID[step.n];
    if (!service || service === "routing" || service === "extract") continue;
    if (service === "guard" && downstream.get(service)?.label === "afterJudge" && step.label !== "afterJudge") continue;
    downstream.set(service, step);
  }
  for (const flow of FLOW) {
    const step = downstream.get(flow.id);
    if (!step) continue;
    // Downstream "중단" rows are waiting placeholders, not completed/failed executions.
    if (step.status !== "완료" && step.status !== "차단" && !(flow.id === "judge" && step.status === "중단")) continue;
    const observed = event(`step:${flow.id}`, flow.id, flow.이름, step.status === "완료" ? "completed" : "blocked",
      step.detail ?? step.label, { status: step.status, ...(step.ms === undefined ? {} : { ms: step.ms }) });
    if (monitor) observed.codeSource = "app/page.tsx:steps";
  }
  if (currentAnswer) {
    const answer = put({ id: runtimeId("answer"), label: "현재 한국어 답변", role: "산출", kind: "individual", status: "completed", parentId: "service:narrate",
      conceptId: "evidence.answer", codeSource: monitor ? "app/page.tsx:answer" : "app/_agent-core.ts:finalAnswer",
      detail: currentAnswer.headline, values: { headline: currentAnswer.headline } });
    connect(runtimeId("step:narrate"), answer.id, "조립한 답변");
    // An agent approval belongs to its own accepted answer, not a subsequently edited monitor.
    if (!monitor && agent?.approvedAt) {
      const approved = event("approval", "approval", "상담사 승인 완료", "completed", "현재 확인값과 판정 결과를 상담사가 승인했습니다.", { approvedAt: agent.approvedAt });
      connect(answer.id, approved.id, "상담사가 승인");
      if (agent.application === "applied") {
        const applied = event("application", "application", "결과 적용 완료", "completed", "현재 실행의 승인값이 판정 화면에 적용됐습니다.", { application: agent.application });
        connect(approved.id, applied.id, "승인값을 적용");
        if (agent.recordStatus === "completed") {
          const recorded = event("record", "record", "상담 기록 완료", "completed", "결과 적용 후 상담 기록이 완료됐습니다.", { recordStatus: agent.recordStatus });
          connect(applied.id, recorded.id, "상담 결과를 기록");
        }
      }
    }
  }

  if (abox) {
    const skillOwner = abox.graph.skill ? `service:skill:${abox.graph.skill}` : "service:judge";
    const check = byId.get(runtimeId("step:ontology")) ?? event("abox-check", "ontology", "현재 실행 개체 대조", abox.check.violations.length ? "blocked" : "completed",
      abox.check.violations.length ? abox.check.violations.join(" / ") : "선택된 현재 판정의 개체와 관계를 용어 사전과 대조했습니다.",
      { individuals: abox.check.counts.individuals, links: abox.check.counts.links, violations: [...abox.check.violations] });
    const skillNode = byId.get(skillOwner);
    if (skillNode) skillNode.status = "completed";
    const aboxId = (id: string) => runtimeId(`abox:${encode(id)}`);
    for (const individual of abox.graph.individuals) {
      const concept = classById(individual.class);
      const values = individual.values ? { ...individual.values } : undefined;
      const summary = Object.entries(values ?? {}).map(([key, value]) => `${dataLabel.get(key) ?? key}: ${displayValue(value)}`).join(" · ");
      const owner = individual.class === "utterance" || individual.class === "utterance.case" ? "service:input"
        : individual.class === "utterance.candidate" ? "service:routing" : skillOwner;
      put({ id: aboxId(individual.id), label: concept?.label ?? individual.class, role: concept?.role ?? "산출", kind: "individual", status: "completed", parentId: owner,
        conceptId: individual.class, codeSource: concept?.codeSource ?? "lib/ontology/abox.ts:buildRunABox", detail: summary || concept?.note || individual.id, values });
    }
    for (const individual of abox.graph.individuals) {
      for (const link of individual.links ?? []) {
        const property = propertyById.get(link.p);
        connect(aboxId(individual.id), aboxId(link.target), property?.label ?? link.p, { evidential: property?.evidential });
      }
    }
    connect(skillOwner, check.id, "현재 판정을 대조");
  }
  if ((currentAnswer || abox) && translation &&
      translation.language !== "ko" && translation.status !== "idle" && translation.status !== "skipped") {
    const status = translation.status === "failed" || translation.status === "rejected" ? "blocked" : translation.status;
    const translated = event("translation", "translate", `답변 번역${translation.language ? ` · ${translation.language}` : ""}`, status,
      translation.detail ?? (status === "running" ? "현재 답변의 번역 요청을 처리하고 있습니다." : status === "completed" ? "현재 답변의 번역과 숫자 보존 검증을 마쳤습니다." : "번역을 내보내지 못해 한국어 원문을 유지합니다."),
      { status: translation.status, ...(translation.language ? { language: translation.language } : {}) }, `evidence.translation.${translation.status}`);
    connect(runtimeId("answer"), translated.id, "현재 답변을 번역");
  }

  for (const edge of edges) {
    if (edge.source.startsWith("service:") && edge.target.startsWith("service:")) edge.active = byId.get(edge.target)?.status === "running";
  }
  return {
    scopeKey,
    label: monitor ? `${abox?.graph.skill === "payslip" ? "명세서 판정" : "판정 화면"} · ${caseId} · 입력 v${monitorRevision + 1}${agent ? ` · 연결 상담 실행 ${agent.runId?.slice(0, 12)} · 상담 입력 v${agent.inputRevision + 1}` : ""}`
      : agent ? `AI 상담 · ${caseId} · 실행 ${agent.runId?.slice(0, 12)} · 입력 v${agent.inputRevision + 1}`
      : abox ? `판정 화면 · ${caseId} · 입력 v${monitorRevision + 1}` : "서비스 연결 지도",
    description: monitor ? `현재 판정 화면의 실제 단계와 답변을 보여 줍니다.${agent ? " 연결된 AI 상담의 요청과 추출 근거를 함께 표시합니다." : " AI 요청을 실행한 기록은 포함하지 않습니다."}`
      : agent ? "현재 상담의 실제 요청 상태, 확인값과 판정 결과입니다. 새 실행이나 입력 수정은 해당 범위의 그래프로 바뀝니다."
      : abox ? "현재 판정 화면에서 선택된 개체와 관계입니다. AI 요청을 실행한 기록은 포함하지 않습니다."
        : "등록된 서비스와 연결을 보여 줍니다. 상담이나 판정을 실행하면 관측한 단계와 결과가 연결됩니다.",
    nodes, edges, events,
    runningCount: events.filter((node) => node.status === "running").length,
    generatedCount: nodes.filter((node) => node.kind !== "service" && node.kind !== "class").length,
  };
}
