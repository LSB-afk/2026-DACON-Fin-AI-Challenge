import type { ABox, ABoxCheckResult } from "./abox.ts";

type Snapshot = { graph: ABox; check: ABoxCheckResult } | null;
type AgentSource = {
  caseId: string | null; runId: string | null; inputRevision: number;
  busy: boolean; hasResult: boolean; skillId: string | null; ontology: Snapshot;
};

/** Select current evidence, never a fallback to an unrelated/stale successful run. */
export function selectOntologySource({ caseId, agent, monitor, monitorRevision, linkedRunId, linkedRevision }: {
  caseId: string; agent: AgentSource; monitor: Snapshot; monitorRevision: number;
  linkedRunId: string | null; linkedRevision: number | null;
}): { abox: Snapshot; source: { kind: "monitor" | "agent"; label: string; description: string } } {
  const inspectingAgent = agent.caseId === caseId && (!!agent.runId || agent.hasResult);
  if (!inspectingAgent) return {
    abox: monitor,
    source: { kind: "monitor", label: `판정 화면 결과 · ${caseId} · 입력 v${monitorRevision + 1}`, description: monitor ? "판정 화면의 현재 입력과 결과를 보여 주는 스냅샷입니다. AI 상담을 실행하면 그 실행의 확인값을 우선 표시합니다." : "아직 판정 결과가 없습니다. 개념 사전을 둘러보거나 AI 상담을 시작하세요." },
  };
  const identity = `${caseId} · 실행 ${agent.runId?.slice(0, 12) ?? "식별자 없음"} · 입력 v${agent.inputRevision + 1}`;
  const appliedPayslip = !agent.busy && agent.hasResult && agent.skillId === "payslip"
    && !!agent.runId && linkedRunId === agent.runId && linkedRevision === agent.inputRevision
    && monitor?.graph.skill === "payslip";
  if (appliedPayslip) return {
    abox: monitor,
    source: { kind: "monitor", label: `명세서 판정 · ${identity.replace(" · 입력 v", " · 상담 입력 v")} · 명세서 v${monitorRevision + 1}`, description: "AI 상담에서 넘겨받아 판정한 명세서의 현재 스냅샷입니다. 지급·공제 항목을 편집하면 명세서 버전과 결과가 함께 바뀝니다. 모델이 명세서를 추정한 결과가 아닙니다." },
  };
  return {
    abox: agent.busy ? null : agent.ontology,
    source: { kind: "agent", label: `AI 상담 ${identity}`, description: agent.busy ? "현재 요청이 진행 중입니다. 확인값의 판정이 준비되면 실제 실행 항목이 표시됩니다." : agent.ontology ? "AI 상담 화면과 동일한 확인값·원문·판정 결과의 현재 스냅샷입니다. 승인 여부와는 별도로 용어를 대조합니다." : agent.skillId === "payslip" ? "명세서 입력 화면에서 지급·공제 항목을 확인하고 판정하면 실제 결과가 연결됩니다." : "현재 실행에서 판정 그래프가 준비되지 않았습니다. 누락 정보나 실행 오류를 먼저 확인하세요." },
  };
}
