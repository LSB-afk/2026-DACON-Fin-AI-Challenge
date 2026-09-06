/** Organization is a view of registered capabilities and observed execution, not a scheduler. */
import { FLOW, type FlowActor, type FlowTab, type FlowView } from "./flow.ts";
import { skills, type SkillId } from "./skills.ts";
import type { LiveOntologySnapshot } from "./ontology/live.ts";

export type OrgCapability = {
  id: string;
  title: string;
  departmentId: string | null;
  actor: FlowActor;
  summary: string;
  input: string[];
  output: string[];
  constraints: string[];
  source: string[];
  target: { view: FlowView; tab?: FlowTab; label: string };
  skillId?: SkillId;
  serviceId: string;
};

export const ORGANIZATION_DEPARTMENTS: readonly { id: string; title: string; description: string; icon: string }[] = [
  { id: "intake", title: "상담 분석", description: "상담 접수 · 검사 선택 · 근거 추출", icon: "funnel" },
  { id: "decision", title: "금융 판정", description: "급여명세서와 출국 정산 규칙 실행", icon: "calc" },
  { id: "assurance", title: "검증·통제", description: "가드레일 검사 · 온톨로지 대조", icon: "shield" },
  { id: "response", title: "답변·기록", description: "한국어 답변 · 번역 · 상담 기록", icon: "speech" },
];

const flowDetails: Record<string, Pick<OrgCapability, "departmentId" | "input" | "output" | "source">> = {
  input: { departmentId: "intake", input: ["근로자가 입력한 상담 발화"], output: ["현재 상담에 접수한 발화와 실행 식별자"],
    source: ["app/_agent-core.ts:run", "lib/ai/guard.ts:guardUtterance"] },
  routing: { departmentId: "intake", input: ["상담 발화", "등록된 스킬과 키워드"], output: ["검사 후보", "원문에서 확인한 선택 근거", "추가 확인 필요 여부"],
    source: ["lib/skills.ts:routeByKeyword", "lib/ai/agent.ts:validateRouter", "lib/agentExecution.ts:runAgentRequests"] },
  extract: { departmentId: "intake", input: ["상담 발화", "스킬별 필요 입력 항목"], output: ["추출한 확인값", "원문 근거", "누락 항목 질문과 제외한 추출값"],
    source: ["lib/ai/agent.ts:validateIntake", "lib/agentExecution.ts:runAgentRequests"] },
  judge: { departmentId: "decision", input: ["선택한 검사", "현재 확인값과 기준일"], output: ["규칙별 판정", "금액·기한·법령 근거"],
    source: ["lib/agentEvaluation.ts:evaluateAgentInput", "lib/rules/payslip.ts:judgePayslip", "lib/rules/departure.ts:judgeDeparture"] },
  guard: { departmentId: "assurance", input: ["규칙별 판정", "스킬의 단정 수준과 필수 고지"], output: ["가드레일 통과 또는 위반 사유"],
    source: ["lib/harness/guardrails.ts:checkAllGuardrails"] },
  ontology: { departmentId: "assurance", input: ["현재 판정의 개체와 관계", "온톨로지 클래스·속성 정의"], output: ["개체·관계 대조 결과", "위반 항목"],
    source: ["lib/ontology/abox.ts:buildRunABox", "lib/ontology/abox.ts:validateABox"] },
  narrate: { departmentId: "response", input: ["검증한 판정 결과", "필수 고지"], output: ["한국어 답변", "다음 행동과 확인 항목"],
    source: ["lib/narrate.ts:narrate"] },
  translate: { departmentId: "response", input: ["한국어 답변", "선택한 언어"], output: ["금액·날짜 보존을 검증한 번역", "번역 실패 시 한국어 원문"],
    source: ["app/page.tsx:translationRequests", "lib/ai/contract.ts:숫자보존위반"] },
};

const flowCapabilities: OrgCapability[] = FLOW.map((step) => ({
  id: step.id, title: step.이름, actor: step.행위자, summary: step.하는일,
  ...flowDetails[step.id], constraints: [step.실패하면], serviceId: `service:${step.id}`,
  target: { view: step.보는곳.view, ...(step.보는곳.tab ? { tab: step.보는곳.tab } : {}), label: step.보는곳.라벨 },
}));

const skillCapabilities: OrgCapability[] = skills.map((skill) => ({
  id: skill.id, title: skill.name, departmentId: "decision", actor: "코드", skillId: skill.id,
  summary: `등록된 ${skill.ruleCatalog.length}개 규칙으로 ${skill.name} 결과를 계산합니다.`,
  input: skill.requiredInputs.map((field) => field.label),
  output: ["규칙별 판정과 근거", skill.id === "payslip" ? "지급·공제 항목의 이상 여부와 확인 질문" : "수령 가능 여부·예상 금액·기한과 확인 질문"],
  constraints: ["입력으로 확인할 수 없는 내용은 추가 확인을 요청합니다.", ...(skill.notCovered ?? [])],
  source: ["lib/skills.ts:skills", skill.id === "payslip" ? "lib/rules/payslip.ts:judgePayslip" : "lib/rules/departure.ts:judgeDeparture"],
  serviceId: `service:skill:${skill.id}`, target: { view: "skills", label: `${skill.name} 스킬` },
}));

export const ORGANIZATION_CAPABILITIES: readonly OrgCapability[] = [
  ...flowCapabilities.slice(0, 4), ...skillCapabilities, ...flowCapabilities.slice(4),
  {
    id: "record", title: "상담 기록", departmentId: "response", actor: "코드",
    summary: "결과 적용 후 상담 기록 완료를 표시하고, 승인한 상담을 파일로 내려받을 수 있습니다.",
    input: ["적용한 상담 결과", "상담사가 승인한 확인값과 승인 시각"],
    output: ["현재 세션의 상담 기록 완료 상태", "상담 기록 파일"],
    constraints: ["현재 세션의 기록은 새로고침 후 유지되지 않습니다.", "기록 파일 내려받기는 상담사 승인 후 가능합니다."],
    source: ["app/_agent-core.ts:markApplied", "app/_agent-core.ts:downloadRecord", "lib/consult.ts:buildConsultRecord"],
    serviceId: "service:record", target: { view: "agent-run", label: "상담 기록" },
  },
  {
    id: "approval", title: "상담사 승인", departmentId: null, actor: "사람",
    summary: "상담사가 현재 확인값과 검증한 판정 결과를 검토하고 승인합니다.",
    input: ["현재 확인값", "검증한 판정과 한국어 답변"], output: ["상담사의 승인 시각"],
    constraints: ["현재 입력의 검증을 통과하고 답변이 준비돼야 승인할 수 있습니다.", "입력을 수정하면 이전 승인은 해제됩니다."],
    source: ["app/_agent-core.ts:approve", "lib/agentEvaluation.ts:evaluateAgentInput"],
    serviceId: "service:approval", target: { view: "agent-run", label: "상담사 승인" },
  },
  {
    id: "application", title: "결과 적용", departmentId: null, actor: "코드",
    summary: "현재 상담의 확인값을 판정 화면으로 전달하고 실제 적용 상태를 연결합니다.",
    input: ["현재 실행의 적용 가능한 확인값", "출국 정산 결과의 상담사 승인"], output: ["판정 화면에 전달할 입력값", "현재 실행의 결과 적용 상태"],
    constraints: ["출국 정산은 상담사가 승인해야 결과를 적용할 수 있습니다.", "급여명세서는 지급·공제 항목을 직접 확인하는 입력 화면으로 이어집니다."],
    source: ["app/_agent-core.ts:applyPayload", "app/_agent-core.ts:markApplied"],
    serviceId: "service:application", target: { view: "agent-run", label: "결과 적용" },
  },
];

export type OrgProcessStageKind = "standard" | "parallel" | "verification" | "answer" | "endpoint";
export type OrgProcessStage = {
  id: string;
  title: string;
  description: string;
  output: string;
  capabilityIds: readonly string[];
  branchCapabilityIds?: readonly string[];
  kind: OrgProcessStageKind;
};
export type OrgProcessEdge = { from: string; to: string; kind: "required" | "optional" };

function namedOutput(id: string, index = 0) {
  const capability = ORGANIZATION_CAPABILITIES.find((item) => item.id === id);
  if (!capability) throw new Error(`Unknown organization capability: ${id}`);
  return capability.output[index] ?? capability.output[0];
}

/** Actual execution relationships for the organization view; this does not schedule capabilities. */
export const ORGANIZATION_PROCESS_STAGES: readonly OrgProcessStage[] = [
  { id: "input", title: "상담 접수", description: "상담 발화를 현재 실행으로 접수합니다.", output: namedOutput("input"), capabilityIds: ["input"], kind: "standard" },
  { id: "agent-requests", title: "AI 요청 · 동시에", description: "라우팅과 값 추출은 서로 기다리지 않는 두 요청입니다.", output: "검사 후보와 추출한 확인값", capabilityIds: ["routing", "extract"], kind: "parallel" },
  { id: "judge", title: "결정 코드", description: "AI가 아닌 등록된 규칙 코드가 같은 입력을 같은 결과로 판정합니다.", output: namedOutput("judge"), capabilityIds: ["judge"], kind: "standard" },
  { id: "verification", title: "검증", description: "가드레일 검사와 온톨로지 대조로 판정과 용어를 확인합니다.", output: `${namedOutput("guard")} · ${namedOutput("ontology")}`, capabilityIds: ["guard", "ontology"], kind: "verification" },
  { id: "answer", title: "한국어 답변", description: "검증한 판정으로 다음 행동을 안내하는 한국어 답변을 만듭니다.", output: namedOutput("narrate"), capabilityIds: ["narrate"], branchCapabilityIds: ["translate"], kind: "answer" },
  { id: "endpoint", title: "승인 후 적용·기록", description: "상담사의 실제 승인이 결과 적용을 열고, 적용한 상담의 기록을 남깁니다.", output: namedOutput("record"), capabilityIds: ["approval", "application", "record"], kind: "endpoint" },
];

/** Routing and extraction are parallel request boundaries; optional translation never gates approval. */
export const ORGANIZATION_PROCESS_EDGES: readonly OrgProcessEdge[] = [
  { from: "input", to: "routing", kind: "required" },
  { from: "input", to: "extract", kind: "required" },
  { from: "routing", to: "judge", kind: "required" },
  { from: "extract", to: "judge", kind: "required" },
  { from: "judge", to: "guard", kind: "required" },
  { from: "guard", to: "ontology", kind: "required" },
  { from: "ontology", to: "narrate", kind: "required" },
  { from: "narrate", to: "translate", kind: "optional" },
  { from: "narrate", to: "approval", kind: "required" },
  { from: "approval", to: "application", kind: "required" },
  { from: "application", to: "record", kind: "required" },
];
export type OrgStatus = "ready" | "running" | "completed" | "blocked" | "offline" | "review";
export type OrgCapabilityState = { status: OrgStatus; label: string; detail: string; ms?: number };

const statusLabels: Record<OrgStatus, string> = {
  ready: "준비", running: "진행 중", completed: "완료", blocked: "차단", offline: "미연결", review: "검토 대기",
};

export function capabilityState(capability: OrgCapability, snapshot: LiveOntologySnapshot,
  availability: { agent: boolean; translation: boolean }, canApprove = false): OrgCapabilityState {
  const service = snapshot.nodes.find((node) => node.kind === "service" && node.id === capability.serviceId);
  if (service?.status && service.status !== "available") {
    const observed = snapshot.events.findLast((event) => event.parentId === service.id && event.status === service.status);
    const ms = observed?.values?.ms;
    return { status: service.status, label: statusLabels[service.status], detail: observed?.detail ?? service.detail,
      ...(typeof ms === "number" && Number.isFinite(ms) && ms >= 0 ? { ms } : {}) };
  }
  // Monitor answers belong to their own edited inputs and cannot inherit agent approval readiness.
  if (capability.id === "approval" && canApprove && snapshot.nodes.some((node) =>
    node.kind === "individual" && node.parentId === "service:narrate" && node.conceptId === "evidence.answer"
      && node.status === "completed" && node.codeSource === "app/_agent-core.ts:finalAnswer")) {
    return { status: "review", label: statusLabels.review, detail: "현재 확인값과 판정 답변을 상담사가 검토할 수 있습니다." };
  }
  if (capability.actor === "모델" && !(capability.id === "translate" ? availability.translation : availability.agent)) {
    return { status: "offline", label: statusLabels.offline, detail: "모델 제공자가 연결되지 않았습니다." };
  }
  return { status: "ready", label: statusLabels.ready, detail: "현재 실행 기록이 없습니다." };
}

export function summarizeOrgStates(states: readonly OrgCapabilityState[]): { running: number; completed: number; blocked: number; review: number } {
  const summary = { running: 0, completed: 0, blocked: 0, review: 0 };
  for (const { status } of states) {
    if (status === "running" || status === "completed" || status === "blocked" || status === "review") summary[status] += 1;
  }
  return summary;
}
