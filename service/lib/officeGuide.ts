/** Read-only explanations and navigation. No timer, request, or business-state mutation. */
import { OFFICE_STATIONS, N_TO_ID, type StepLike } from "./office.ts";
import { agentStates, cityStats, type ActorCtx } from "./officeActors.ts";
import type { FlowView } from "./flow.ts";

export type OfficeAction = "input" | "current" | "review" | "translate" | "result" | "stage";
export type OfficeBrief = {
  phase: "idle" | "running" | "supplement" | "blocked" | "review" | "approved" | "complete";
  title: string;
  reason: string;
  next: string;
  action: { label: string; target: OfficeAction; station?: string };
};
const name = (id: string) => OFFICE_STATIONS.find((s) => s.id === id)?.이름 ?? id;

export function officeBrief(steps: readonly StepLike[], ctx: ActorCtx): OfficeBrief {
  const states = agentStates(steps, ctx);
  const working = Object.keys(states).filter((id) => states[id] === "working");
  const failed = Object.keys(states).find((id) => states[id] === "blocked" || states[id] === "offline");
  if (working.length) {
    const parallel = working.includes("routing") && working.includes("extract");
    const translated = working.includes("translate");
    return {
      phase: "running",
      title: parallel ? "업무 분류와 정보 추출을 함께 진행하고 있어요" : translated ? "확인한 답변을 번역하고 있어요" : working.includes("extract") ? "상담 원문에서 정보를 추출하고 있어요" : "담당 부서가 요청을 처리하고 있어요",
      reason: failed ? `${name(failed)}에서 확인할 문제가 있습니다. 다른 부서의 요청은 아직 진행 중입니다.` : parallel ? "두 요청의 결과가 모이면 필수 입력을 확인하고 코드로 판정합니다." : translated ? "금액과 날짜가 원문과 같은지 검증한 뒤 번역을 표시합니다." : `${working.map(name).join(" · ")}의 실제 응답을 기다립니다. 이동 속도는 처리 시간을 뜻하지 않습니다.`,
      next: translated ? "번역 검증이 실패하면 한국어 원문을 유지합니다." : "빠진 정보가 있으면 중앙 상담으로 돌아와 보완합니다.",
      action: { label: "진행 중인 부서 보기", target: "current" },
    };
  }
  if (failed) {
    const step = steps.find((s) => N_TO_ID[s.n] === failed);
    const request = failed === "routing" || failed === "extract" ? ctx.requests?.[failed] : undefined;
    const translation = failed === "translate";
    return {
      phase: "blocked",
      title: states[failed] === "offline" ? "AI 서비스 연결을 확인해 주세요" : translation ? "번역 결과를 확인해야 해요" : `${name(failed)}에서 처리를 멈췄어요`,
      reason: translation ? `${ctx.translation?.detail ?? "번역을 내보낼 수 없습니다."} 한국어 원문은 그대로 사용할 수 있습니다.` : step?.detail || request?.detail || "요청 또는 검증이 완료되지 않았습니다. 오류를 확인하고 필요한 입력이나 연결을 점검해 주세요.",
      next: translation ? "답변에서 원문을 확인하거나 번역을 다시 요청하세요." : "오류가 해결되기 전에는 결과를 승인하지 않습니다.",
      action: { label: translation ? "원문 · 번역 확인" : "멈춘 단계 확인", target: translation ? "translate" : "stage", station: failed },
    };
  }
  if (ctx.busy) return { phase: "running", title: "상담 요청을 접수하고 있어요", reason: "아직 부서의 처리 요청이 확인되지 않았습니다.", next: "실제 요청이 시작되면 해당 부서에 표시됩니다.", action: { label: "현재 업무 보기", target: "current" } };
  if (cityStats(steps, ctx).progressPct === 100) return { phase: "complete", title: "결과 적용과 상담 기록을 마쳤어요", reason: "현재 확인·승인한 입력을 기준으로 결과가 적용되었습니다.", next: "판정 근거와 답변을 확인하거나 상담 기록을 보관하세요.", action: { label: "적용한 결과 보기", target: "result" } };
  if (ctx.approvedAt) return { phase: "approved", title: "승인한 결과를 전달할 차례예요", reason: "상담사 승인은 완료되었습니다. 결과 적용은 승인과 별개의 행동입니다.", next: "승인 패널에서 결과를 적용하거나 필요한 입력 화면으로 이동하세요.", action: { label: "결과 전달 확인", target: "review" } };
  if (ctx.hasResult && !ctx.applyCheckOk) {
    const stopped = steps.find((step) => step.status === "중단");
    return { phase: "supplement", title: "상담 정보를 더 확인해야 해요", reason: stopped?.detail || "필수 값이나 상담 업무를 확정하지 못했습니다. 빈 값을 임의로 채우지 않습니다.", next: "상담사 확인 패널에서 보완한 입력 버전을 기준으로 다시 판정합니다.", action: { label: "누락 정보 보완", target: "review" } };
  }
  if (ctx.hasResult) return { phase: "review", title: "상담사의 확인과 승인을 기다려요", reason: "AI가 추출한 값과 원문 근거, 코드가 만든 판정을 함께 검토해 주세요.", next: "값을 수정하면 다시 판정하며, 이전 승인은 해제됩니다.", action: { label: "확인 · 승인 패널", target: "review" } };
  return { phase: "idle", title: "중앙 상담에서 이야기를 시작해요", reason: "아직 AI 실행 전입니다. 상담을 보내면 분류와 정보 추출 부서에 함께 전달됩니다.", next: "상담 입력 → 두 요청 결과 확인 → 코드 검증 → 사람의 승인 · 적용", action: { label: "상담 시작하기", target: "input" } };
}

/** These groups describe dependencies, not spatial order or invented simultaneous requests. */
export const OFFICE_FLOW_GROUPS: readonly { label: string; stations: string[]; parallel?: boolean; optional?: boolean; note: string }[] = [
  { label: "접수", stations: ["input"], note: "사람이 상담을 입력" },
  { label: "동시 요청", stations: ["routing", "extract"], parallel: true, note: "두 결과가 모여야 다음 확인" },
  { label: "코드 판정 · 검증", stations: ["judge", "guard", "ontology", "narrate"], note: "판정 → 가드·용어 대조 → 답변" },
  { label: "필요한 언어만", stations: ["translate"], optional: true, note: "한국어 선택 시 생략" },
  { label: "사람의 결정", stations: ["counselor", "records"], note: "승인과 결과 적용은 별개" },
];

export const OFFICE_VIEWS: readonly { id: string; label: string; rooms: string[] }[] = [
  { id: "all", label: "전체 사무실", rooms: [] },
  { id: "intake", label: "접수 · 데이터", rooms: ["reception", "routing", "extraction"] },
  { id: "knowledge", label: "판정 · 지식", rooms: ["ontology", "guardrail", "judgment"] },
  { id: "approval", label: "답변 · 승인", rooms: ["answer", "bank", "dispatch"] },
];

export const OFFICE_TOUR: readonly { title: string; room: string; body: string; system: string; view: FlowView; station?: string }[] = [
  { title: "모든 상담은 중앙에서", room: "reception", body: "고객은 중앙 상담 허브에 머뭅니다. 입력한 문장은 업무 분류와 정보 추출 부서에 동시에 전달되며, 원문에 없는 값은 추측해서 채우지 않습니다.", system: "상담 입력 · 고객 대기열", view: "agent-run", station: "input" },
  { title: "AI가 읽고, 근거를 확인", room: "extraction", body: "분류 담당자는 어느 검사로 보낼지 정하고 추출 담당자는 국적·날짜·금액과 원문 근거를 찾습니다. 둘의 결과가 모여야 판정 조건을 확인할 수 있습니다.", system: "라우팅 · 추출 · evidence 계약", view: "agent-run", station: "extract" },
  { title: "금융 판정은 코드가", room: "judgment", body: "판정실은 확인된 입력에 규칙을 적용합니다. 필수 값이 빠지면 보완을 요청합니다. 캐릭터나 문서가 도착했다고 계산이 완료되는 것은 아닙니다.", system: "규칙 검사 · 결정 근거", view: "skills" },
  { title: "용어와 제약으로 검증", room: "ontology", body: "지식 그래프는 어떤 개념이 어떤 관계로 이어지는지 보여 줍니다. 실제 실행 항목은 개념 사전과 대조하고, 준법감시실의 가드레일은 결과의 안전성을 별도로 검사합니다.", system: "온톨로지 · 가드레일 · 법령", view: "ontology" },
  { title: "답변과 번역을 구분", room: "answer", body: "확인된 판정으로 한국어 답변을 조립합니다. 다른 언어를 선택한 경우에만 번역을 요청하고 금액·날짜를 검증합니다. 숫자가 달라지면 원문을 유지합니다.", system: "답변 조립 · 숫자 보존 번역", view: "agent-run", station: "translate" },
  { title: "마지막 결정은 상담사", room: "bank", body: "상담사는 추출값과 근거를 확인하고 승인합니다. 승인 이후에도 결과 적용은 직접 해야 합니다. 수정하면 승인이 해제되고, 적용이 끝나야 기록 완료로 표시됩니다.", system: "사람의 승인 · 결과 적용 · 기록", view: "approvals" },
];
