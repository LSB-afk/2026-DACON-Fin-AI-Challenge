/** One accepted input drives the timeline, answer, approval and application payload. */
import { toDepartureInput, type IntakeFields, type ApplyResult } from "./ai/apply.ts";
import { judgeDeparture } from "./rules/departure.ts";
import { checkAllGuardrails, GUARDRAIL_CATALOG } from "./harness/guardrails.ts";
import "./harness/registry.ts";
import { harnessBySkill } from "./harness/core.ts";
import { buildRunABox, validateABox, type ABox, type ABoxCheckResult } from "./ontology/abox.ts";
import { narrate, type Answer } from "./narrate.ts";
import { routeByKeyword, skills } from "./skills.ts";
import type { StepLike } from "./office.ts";

type Evaluation = { steps: StepLike[]; applyCheck: ApplyResult | null; findings: ReturnType<typeof judgeDeparture>; answer: Answer | null; canApprove: boolean; ontology: { graph: ABox; check: ABoxCheckResult } | null };
export function evaluateAgentInput({ fields, today, utterance, skillId, needsClarify, requestError, caseId }: {
  fields: IntakeFields; today: string; utterance: string; skillId: string | null; needsClarify: boolean; requestError?: string | null; caseId?: string;
}): Evaluation {
  const out: Evaluation = { steps: [], applyCheck: skillId === "departure" ? toDepartureInput(fields, today) : null, findings: [], answer: null, canApprove: false, ontology: null };
  if (out.applyCheck?.ok) {
    const input = out.applyCheck.input;
    const invalidDates = [["기준일", input.today], ["입사일", input.hireDate], ["출국일", input.departureDate]]
      .filter(([, value]) => !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)
      .map(([name]) => name);
    if (invalidDates.length) out.applyCheck = { ok: false, missing: invalidDates, questions: invalidDates.map((name) => name + "을 실제 달력에 있는 날짜로 확인하세요.") };
  }
  const stop = (detail: string, blocked = false) => {
    out.steps.push({ n: "2단", label: "판정", status: blocked ? "차단" : "중단", detail });
    out.steps.push({ n: "가드", label: "afterJudge", status: "중단", detail: "판정 결과를 기다립니다." });
    out.steps.push({ n: "온톨로지", label: "A-Box 대조", status: "중단", detail: "판정 결과를 기다립니다." });
    out.steps.push({ n: "3단", label: "답변", status: "중단", detail: "입력과 판정이 준비되면 답변을 만듭니다." });
    return out;
  };
  if (requestError) return stop(`모델 요청을 다시 확인하세요: ${requestError}`, true);
  if (!skillId || needsClarify) return stop("검사를 하나로 정할 수 없습니다. 상담 내용을 보완해 다시 실행하세요.");
  if (skillId === "payslip") return stop("실제 급여명세서 입력이 필요합니다. 명세서 입력 화면에서 지급·공제 항목을 확인하세요.");
  if (!out.applyCheck?.ok) return stop(out.applyCheck && !out.applyCheck.ok ? out.applyCheck.questions.join(" / ") : "필수 입력이 부족합니다.");
  try {
    const input = out.applyCheck.input;
    out.findings = judgeDeparture(input);
    const harness = harnessBySkill("departure");
    if (!harness) return stop("판정 하네스를 불러오지 못했습니다.", true);
    const guard = checkAllGuardrails(out.findings, harness);
    const graph = buildRunABox({
      caseId: caseId ?? "agent-run", utterance,
      routes: routeByKeyword(utterance).map((r) => ({ skill: r.skill.name, score: r.score, matched: r.matched })),
      skillId: "departure", departure: input, findings: out.findings,
    });
    const check = validateABox(graph);
    out.ontology = { graph, check };
    const abox = check.violations;
    out.steps.push({ n: "2단", label: "판정", status: "완료", detail: `현재 확인값으로 규칙 ${skills.find((s) => s.id === skillId)?.ruleCatalog.length ?? 0}개를 검사해 ${out.findings.length}건의 결과를 냈습니다. 기준일 ${today}.` });
    out.steps.push({ n: "가드", label: "afterJudge", status: guard.length ? "차단" : "완료", detail: guard.length ? guard.join(" / ") : `가드레일 ${GUARDRAIL_CATALOG.length}종을 모두 통과했습니다.` });
    out.steps.push({ n: "온톨로지", label: "A-Box 대조", status: abox.length ? "차단" : "완료", detail: abox.length ? abox.join(" / ") : "현재 확인값과 판정이 용어 사전과 일치합니다." });
    if (!guard.length && !abox.length) {
      out.answer = narrate(out.findings, harness.rules.requiredNotices);
      out.canApprove = true;
    }
    out.steps.push({ n: "3단", label: "설명", status: out.answer ? "완료" : "중단", detail: out.answer?.headline ?? "검증을 통과한 판정 결과를 기다립니다." });
  } catch (error) {
    return stop(`판정 계산 차단: ${error instanceof Error ? error.message : String(error)}`, true);
  }
  return out;
}
