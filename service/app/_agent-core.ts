"use client";

/**
 * Agent 실행 상태 기계 — 화면 둘(Agent 실행 뷰 · 플로팅 채팅 드로어)이 공유한다.
 *
 * 왜 훅인가: 채팅 드로어를 만들며 실행·추출·수정·승인·원장 기록 로직을 복제하면
 * 두 진입점이 서로 다른 규칙(기본값 금지·승인 게이트)을 갖게 되는 순간이 온다.
 * 상태 기계는 한 벌이고, 화면은 그것을 다르게 그릴 뿐이다.
 *
 * 인스턴스는 페이지(Console)가 하나만 만든다 — 드로어에서 시작한 상담을
 * Agent 실행 화면에서 이어볼 수 있어야 하기 때문이다(같은 대화, 같은 승인 상태).
 */

import { useEffect, useMemo, useState } from "react";
import { routeByKeyword } from "@/lib/skills";
import { judgeDeparture } from "@/lib/rules/departure";
import { judgePayslip } from "@/lib/rules/payslip";
import { samples } from "@/lib/samples";
import { checkAllGuardrails, GUARDRAIL_CATALOG } from "@/lib/harness/guardrails";
import { toDepartureInput } from "@/lib/ai/apply";
import { buildConsultRecord } from "@/lib/consult";
import "@/lib/harness/registry";
import { harnessBySkill } from "@/lib/harness/core";
import { buildRunABox, validateABox } from "@/lib/ontology/abox";
import { narrate } from "@/lib/narrate";
import { skills } from "@/lib/skills";
import type { Step } from "./_tabs";

export type AgentProvider = { provider: "anthropic" | "ollama" | null; model?: string } | null;

export type IntakeFields = {
  nationality?: string;
  visa?: string;
  hireDate?: string;
  departureDate?: string;
  monthlyWage?: number;
  workplaceSize?: string;
};

export type AgentResponse = {
  provider: string;
  model: string;
  utterance: string;
  router: { skill: string; evidence: string[]; filteredCount: number } | null;
  routerError: string | null;
  routerRaw: string;
  intake: {
    fields: IntakeFields;
    evidences: Partial<Record<keyof IntakeFields, string>>;
    questions: string[];
    discarded: { field: string; reason: string }[];
  } | null;
  intakeError: string | null;
  intakeRaw: string;
  routerUsage: { ms: number; inTok?: number; outTok?: number } | null;
  intakeUsage: { ms: number; inTok?: number; outTok?: number } | null;
};

/** 판정 화면으로 넘길 값 — 상담사 승인을 거친 것만 여기로 나온다 */
export type ApplyPayload = {
  label: string;
  caseId: string;
  today?: string;
  nationality?: string;
  visa?: "E-9" | "H-2" | "E-8" | "기타";
  hireDate?: string;
  departureDate?: string;
  wage?: number;
  size?: "5인이상" | "5인미만" | "모름";
};

export type ModelCallSink = (
  calls: { stage: string; ok: boolean; note?: string; ms?: number; inTok?: number; outTok?: number }[],
  meta: { provider: string; model: string },
) => void;

export const 예시발화 = [
  "다음 달에 고향에 돌아가요",
  "베트남 사람인데 2023년 9월 1일에 입사해서 2026년 10월 15일에 출국해요 월급은 215만원이에요",
  "월급에서 산재보험을 떼가는데 맞나요",
  "은행에서 계좌를 안 만들어줘요",
  "네팔 사람인데 연금을 받을 수 있나요",
];

export function useAgentLoop({
  today,
  onModelCalls,
}: {
  today: string;
  /** 모델 호출을 감사 원장으로 올린다 — 페이지가 세션 원장을 갖는다 */
  onModelCalls?: ModelCallSink;
}) {
  const [utterance, setUtterance] = useState(예시발화[1]);
  const [todayInput, setTodayInputRaw] = useState(today);
  const [busy, setBusy] = useState(false);
  const [provider, setProvider] = useState<AgentProvider>(null);
  const [result, setResult] = useState<AgentResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  /*
   * 상담사 확인·승인 (2026-08-28) — AI 추출은 초안이다. 사람이 값을 확인·수정하고
   * 승인해야 판정·기록으로 넘어간다(부작용 경계). edited 가 null 이면 추출값을
   * 그대로 보여주고, 한 글자라도 고치면 edited 가 진실이 된다. 수정은 승인을 푼다.
   */
  const [edited, setEdited] = useState<IntakeFields | null>(null);
  const [approvedAt, setApprovedAt] = useState<string | null>(null);

  // 부모의 기준일이 바뀌면 따라간다 — 렌더 중 조정 패턴(이펙트 동기 setState 금지)
  const [prevToday, setPrevToday] = useState(today);
  if (prevToday !== today) {
    setPrevToday(today);
    setTodayInputRaw(today);
  }
  // 새 실행 결과가 오면 수정·승인을 백지로 — 이전 상담의 승인이 새 발화에 붙으면 안 된다
  const [prevResult, setPrevResult] = useState<AgentResponse | null>(result);
  if (prevResult !== result) {
    setPrevResult(result);
    setEdited(null);
    setApprovedAt(null);
  }

  useEffect(() => {
    fetch("/api/agent")
      .then((r) => r.json())
      .then(setProvider)
      .catch(() => setProvider({ provider: null }));
  }, []);

  const keywordRoutes = useMemo(() => routeByKeyword(utterance), [utterance]);

  function setTodayInput(v: string) {
    if (!v) return;
    setTodayInputRaw(v);
    setApprovedAt(null); // 기준일이 바뀌면 기한 판정이 바뀐다 — 승인도 다시
  }

  async function run() {
    if (!utterance.trim()) {
      setError("상담 내용을 입력하세요.");
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await fetch("/api/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ utterance: utterance.trim(), today: todayInput }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      const res = j as AgentResponse;
      setResult(res);
      // 호출 2건(라우팅·추출)을 원장에 — 계약에 걸린 호출도 이유와 함께 적는다
      onModelCalls?.(
        [
          {
            stage: "0단 LLM 라우팅",
            ok: !res.routerError,
            note: res.routerError ?? undefined,
            ...(res.routerUsage ?? {}),
          },
          {
            stage: "1단 값 뽑기",
            ok: !res.intakeError,
            note: res.intakeError ?? undefined,
            ...(res.intakeUsage ?? {}),
          },
        ],
        { provider: res.provider, model: res.model },
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  // ── 타임라인 단계 ──
  const steps: Step[] = useMemo(() => {
    if (!result && !busy) return [];
    const s: Step[] = [];

    // 0단 라우팅: 키워드 vs LLM 비교
    if (busy && !result) {
      s.push({ n: "0단", label: "라우팅", status: "대기", detail: "AI가 어느 검사로 보낼지 정하고 있습니다…" });
      return s;
    }
    if (result) {
      const kwTop = keywordRoutes[0]?.skill.id ?? "none";
      const kwScore = keywordRoutes[0]?.score ?? 0;
      const kwMatched = keywordRoutes[0]?.matched.join(", ") ?? "없음";
      const llmSkill = result.router?.skill ?? null;
      const llmEv = result.router?.evidence.join(", ") || "없음";
      const mismatch = kwTop !== (llmSkill ?? "none");
      const llmBlocked = !!result.routerError;

      s.push({
        n: "0단",
        label: "라우팅",
        status: llmBlocked ? "차단" : "완료",
        ms: result.routerUsage?.ms,
        detail: llmBlocked
          ? `AI 라우터 차단: ${result.routerError}`
          : `키워드 판단: ${kwTop} (${kwScore}점, 걸린 단어: ${kwMatched}) / AI 판단: ${llmSkill} (근거: ${llmEv}). ${mismatch ? "둘이 달라 키워드 판단을 따릅니다." : "둘이 같습니다."}${result.router?.filteredCount ? ` 원문에 없는 근거 ${result.router.filteredCount}건은 버렸습니다.` : ""}`,
      });

      // 1단 추출
      if (result.intakeError) {
        s.push({
          n: "1단",
          label: "값 뽑기",
          status: "차단",
          ms: result.intakeUsage?.ms,
          detail: `값 뽑기 차단: ${result.intakeError}`,
        });
      } else if (result.intake) {
        const f = result.intake.fields;
        const keys = Object.keys(f) as (keyof IntakeFields)[];
        const picked = keys.length ? keys.map((k) => `${k}=${String(f[k])}`).join(" · ") : "뽑은 값 없음";
        const evList = Object.entries(result.intake.evidences).map(([k, v]) => `${k}←"${v}"`).join(" · ");
        const discarded = result.intake.discarded.length
          ? ` · 버려진 값 ${result.intake.discarded.length}건: ${result.intake.discarded.map((d) => `${d.field}(${d.reason.slice(0, 30)})`).join(" / ")}`
          : "";
        const qs = result.intake.questions.length ? ` · 다시 물을 질문 ${result.intake.questions.length}건` : "";
        s.push({
          n: "1단",
          label: "값 뽑기",
          status: keys.length ? "완료" : "차단",
          ms: result.intakeUsage?.ms,
          detail: `뽑은 값: ${picked}${evList ? ` | 근거 ${evList}` : ""}${discarded}${qs}`,
        });
      } else {
        s.push({ n: "1단", label: "값 뽑기", status: "차단", detail: "뽑은 값이 없습니다." });
      }

      // 2단부터는 기존 경로 재사용 — 추출된 값으로 판정 시도
      const finalSkill = keywordRoutes[0]?.skill.id ?? null;
      // 키워드 라우팅이 없거나 동점이면 중단 (needsClarification)
      const needsClarify = keywordRoutes.length === 0 || (keywordRoutes.length > 1 && keywordRoutes[0].score === keywordRoutes[1].score);
      if (!finalSkill || needsClarify) {
        s.push({
          n: "2단",
          label: "판정",
          status: "중단",
          detail: finalSkill ? "두 검사의 점수가 같아 어느 쪽인지 정할 수 없습니다. 추측하지 않고 다시 묻습니다." : "해당하는 검사가 없습니다. 추측하지 않고 다시 묻습니다.",
        });
        s.push({ n: "가드", label: "afterJudge", status: "중단", detail: "판정이 없어 가드레일을 실행하지 않습니다." });
        s.push({ n: "3단", label: "답변", status: "차단", detail: "판정이 없어 답변을 만들지 않습니다. 다시 묻는 문장을 확인하세요." });
        return s;
      }

      const hasRequiredForDeparture =
        finalSkill === "departure" &&
        result.intake?.fields.nationality &&
        result.intake?.fields.hireDate &&
        result.intake?.fields.departureDate &&
        result.intake?.fields.monthlyWage;

      if (finalSkill === "departure" && !hasRequiredForDeparture) {
        const qs = result.intake?.questions.join(" / ") ?? "필수 값 부족";
        s.push({
          n: "2단",
          label: "판정",
          status: "중단",
          detail: `필수 입력이 부족해 판정하지 않습니다: ${qs}. 값을 지어내지 않고 다시 묻습니다.`,
        });
        s.push({ n: "가드", label: "afterJudge", status: "중단", detail: "판정이 없어 가드레일을 실행하지 않습니다." });
        s.push({ n: "3단", label: "답변", status: "차단", detail: `다시 묻는 질문: ${qs}` });
        return s;
      }

      // 실제 판정 계산
      let findings: ReturnType<typeof judgeDeparture> = [];
      let guardViolations: string[] = [];
      let aboxViolations: string[] = [];
      let answerHeadline = "";
      try {
        if (finalSkill === "departure") {
          const f = result.intake!.fields;
          const depInput = {
            nationality: f.nationality!,
            visa: (f.visa ?? "E-9") as "E-9" | "H-2" | "E-8" | "기타",
            hireDate: f.hireDate!,
            departureDate: f.departureDate!,
            monthlyWage: f.monthlyWage!,
            today: todayInput,
          };
          findings = judgeDeparture(depInput);
        } else if (finalSkill === "payslip") {
          const size = (result.intake?.fields.workplaceSize ?? "5인이상") as "5인이상" | "5인미만" | "모름";
          const sample = samples.find((x) => x.id === "02")!;
          findings = judgePayslip({ ...sample.payslip, workplaceSize: size });
        }
        const harness = harnessBySkill(finalSkill as "payslip" | "departure");
        if (harness && findings.length) guardViolations = checkAllGuardrails(findings, harness);
        // 온톨로지 대조
        if (findings.length) {
          const g = buildRunABox({
            caseId: "agent-run",
            utterance,
            routes: keywordRoutes.map((r) => ({ skill: r.skill.name, score: r.score, matched: r.matched })),
            skillId: finalSkill as "payslip" | "departure",
            departure:
              finalSkill === "departure"
                ? {
                    nationality: result.intake?.fields.nationality ?? "베트남",
                    visa: (result.intake?.fields.visa ?? "E-9") as "E-9" | "H-2" | "E-8" | "기타",
                    hireDate: result.intake?.fields.hireDate ?? "2023-09-01",
                    departureDate: result.intake?.fields.departureDate ?? "2026-09-01",
                    monthlyWage: result.intake?.fields.monthlyWage ?? 2150000,
                    today: todayInput,
                  }
                : undefined,
            workplaceSize: finalSkill === "payslip" ? (result.intake?.fields.workplaceSize as "5인이상" | "5인미만" | "모름") : undefined,
            findings,
          });
          aboxViolations = validateABox(g).violations;
        }
        const harness2 = harnessBySkill(finalSkill as "payslip" | "departure");
        if (harness2) {
          const ans = narrate(findings, harness2.rules.requiredNotices);
          answerHeadline = ans.headline;
        }
      } catch (e) {
        s.push({
          n: "2단",
          label: "판정",
          status: "차단",
          detail: `판정 계산 차단: ${e instanceof Error ? e.message : String(e)}`,
        });
        return s;
      }

      s.push({
        n: "2단",
        label: "판정",
        status: "완료",
        detail: `규칙 ${skills.find((x) => x.id === finalSkill)?.ruleCatalog.length ?? "?"}개를 검사해 ${findings.length}건의 결과를 냈습니다. 같은 입력이면 항상 같은 결과가 나옵니다.`,
      });
      s.push({
        n: "가드",
        label: "afterJudge",
        status: guardViolations.length ? "차단" : "완료",
        detail: guardViolations.length
          ? `가드레일 위반 ${guardViolations.length}건: ${guardViolations.join(" / ")}`
          : `가드레일 ${GUARDRAIL_CATALOG.length}종을 모두 통과했습니다: ${GUARDRAIL_CATALOG.map((g) => g.name).join(" · ")}.`,
      });
      s.push({
        n: "온톨로지",
        label: "A-Box 대조",
        status: aboxViolations.length ? "차단" : "완료",
        detail: aboxViolations.length ? `용어 사전 대조 실패: ${aboxViolations.join(" / ")}` : "용어 사전과 어긋난 곳이 없습니다.",
      });
      s.push({
        n: "3단",
        label: "설명",
        status: "완료",
        detail: answerHeadline || "한국어 답변을 만들었습니다. 번역은 답변 탭에서 할 수 있습니다.",
      });
    }
    return s;
  }, [result, busy, keywordRoutes, utterance, todayInput]);

  const finalSkillId = keywordRoutes[0]?.skill.id ?? null;
  const needsClarify = keywordRoutes.length === 0 || (keywordRoutes.length > 1 && keywordRoutes[0].score === keywordRoutes[1].score);

  /*
   * 기본값 금지 게이트 (2026-08-28) — 예전에는 추출이 비운 필드를 S2-01 픽스처의
   * 기본값(베트남·2023-10-15…)이 조용히 채웠다. 네팔 사람이 베트남 기준 판정을
   * 받는 길이었다. 이제 toDepartureInput 이 완전할 때만 ok 를 주고,
   * 빠진 필드는 이유 붙은 되묻기로 돌아간다. 중간은 없다.
   */
  const confirmFields: IntakeFields = edited ?? result?.intake?.fields ?? {};
  const applyCheck =
    result && finalSkillId === "departure"
      ? toDepartureInput(confirmFields, todayInput)
      : null;
  const canApply =
    !!result &&
    !busy &&
    !needsClarify &&
    !result.routerError &&
    (finalSkillId === "payslip" || ((applyCheck?.ok ?? false) && !!approvedAt));

  /** 판정 화면으로 넘길 값 — 승인 게이트를 통과했을 때만 나온다 */
  function applyPayload(): ApplyPayload | null {
    if (!canApply || !result || !finalSkillId) return null;
    // payslip — 추출할 명세서 값 자체가 발화에 없다. 픽스처를 기본값으로 쓰지 않고
    // 실행 모니터의 명세서 입력으로 보낸다(그곳 값은 사용자가 직접 고친다).
    if (finalSkillId === "payslip") {
      return {
        label: "명세서 입력으로 이동",
        caseId: "S1-01",
        size: (result.intake?.fields.workplaceSize as "5인이상" | "5인미만" | "모름") ?? "모름",
        today: todayInput,
      };
    }
    if (!applyCheck?.ok) return null;
    const v = applyCheck.input;
    return {
      label: "상담사 승인값 적용",
      caseId: "S2-01", // 화면 틀(케이스 카드)만 빌린다 — 아래에서 모든 판정 입력을 덮어쓴다
      today: v.today,
      nationality: v.nationality,
      visa: v.visa,
      hireDate: v.hireDate,
      departureDate: v.departureDate,
      wage: v.monthlyWage,
    };
  }

  function editField(k: keyof IntakeFields, v: string | number | undefined) {
    setEdited({ ...confirmFields, [k]: v === "" ? undefined : v });
    setApprovedAt(null); // 수정하면 승인이 풀린다 — 승인은 항상 지금 보이는 값에 대한 것
  }

  function approve() {
    if (!applyCheck?.ok) return;
    // 사람 행동의 시각 기록 — 판정·렌더에는 쓰지 않으므로 결정성 규칙(같은 입력
    // 같은 판정)을 깨지 않는다. sv-SE 로케일이 "YYYY-MM-DD HH:mm" 꼴을 준다.
    setApprovedAt(new Date().toLocaleString("sv-SE").slice(0, 16));
  }

  /** 상담 기록 다운로드 — 승인된 값으로 판정을 다시 계산해 문서로 내린다 (저장소 없음) */
  function downloadRecord() {
    if (!applyCheck?.ok || !approvedAt || !result) return;
    const findings = judgeDeparture(applyCheck.input);
    const harness = harnessBySkill("departure");
    const answer = narrate(findings, harness?.rules.requiredNotices ?? []);
    const 항목: { name: string; key: keyof IntakeFields }[] = [
      { name: "국적", key: "nationality" },
      { name: "체류자격", key: "visa" },
      { name: "입사일", key: "hireDate" },
      { name: "출국일", key: "departureDate" },
      { name: "월 평균임금", key: "monthlyWage" },
    ];
    const md = buildConsultRecord({
      today: todayInput,
      approvedAt,
      provider: result.provider,
      model: result.model,
      utterance: result.utterance,
      fields: 항목.map(({ name, key }) => ({
        name,
        extracted:
          result.intake?.fields[key] === undefined ? undefined : String(result.intake.fields[key]),
        evidence: result.intake?.evidences[key],
        final: String(confirmFields[key] ?? ""),
      })),
      findings,
      answer,
    });
    const url = URL.createObjectURL(new Blob([md], { type: "text/markdown;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `페이체크_상담기록_${todayInput}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return {
    utterance, setUtterance,
    todayInput, setTodayInput,
    busy, provider, result, error,
    keywordRoutes, steps,
    finalSkillId, needsClarify,
    confirmFields, applyCheck, canApply,
    edited, approvedAt, setApprovedAt,
    run, editField, approve, downloadRecord, applyPayload,
  };
}

export type AgentLoop = ReturnType<typeof useAgentLoop>;
