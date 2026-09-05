/**
 * 스킬 레지스트리 + 결정론적 라우터.
 *
 * 0단(라우팅)은 원래 LLM이 한다. 여기 있는 키워드 라우터는 두 가지 역할이다.
 *   1. API 키 없이 에이전트 루프 전체를 돌려보는 하네스
 *   2. 프로덕션에서 LLM 라우팅이 실패했을 때의 폴백
 *
 * 즉 임시방편이 아니라 계속 남는다. LLM 라우터가 붙어도 이건 기준선(baseline)이 된다.
 *
 * ※ 이 파일은 lib/ai/를 import하지 않는다 (02_제품/03_개발_파이프라인.md 2절).
 */

import { ruleCatalog } from "./rules/payslip.ts";
import { departureRuleCatalog } from "./rules/departure.ts";

export type SkillId = "payslip" | "departure";

export type InputSpec = {
  key: string;
  label: string;
  type: "text" | "number" | "date" | "select";
  options?: readonly string[];
  /** 다른 스킬이 이미 알아낸 값을 물려받을 수 있는가 */
  inheritable?: boolean;
};

export type SkillMeta = {
  id: SkillId;
  name: string;
  /** 사용자가 이렇게 말하면 이 스킬이다 */
  triggers: string[];
  /** 부족하면 0단이 되묻는다 */
  requiredInputs: InputSpec[];
  /**
   * 검사하지 **않는** 것 — 법정 필수기재사항 중 이 입력으로는 판정할 수 없는 항목.
   * 적지 않으면 "명세서를 검사한다"는 말이 전수 검사처럼 팔린다.
   */
  notCovered?: readonly string[];
  ruleCatalog: readonly { rule: string; name: string }[];
  /** 하네스용 예시 발화 */
  examples: string[];
};

const 국적옵션 = [
  "베트남", "캄보디아", "인도네시아", "스리랑카", "태국", "필리핀",
  "중국", "몽골", "라오스", "키르기스스탄",
  "네팔", "미얀마", "방글라데시", "파키스탄", "동티모르",
  "우즈베키스탄", "가나",
] as const;

export const skills: SkillMeta[] = [
  {
    id: "payslip",
    name: "급여명세서 대조",
    triggers: [
      "월급", "급여", "명세서", "임금", "공제", "최저임금",
      "연장", "잔업", "야간", "숙식", "기숙사", "산재",
      "떼", "못 받", "안 줘", "이상해", "적게",
      "payslip", "salary", "wage",
    ],
    requiredInputs: [
      { key: "payslip", label: "급여명세서 값 (직접 입력. 사진 인식은 준비 중)", type: "text" },
      {
        key: "workplaceSize",
        label: "상시 근로자 수",
        type: "select",
        options: ["5인이상", "5인미만", "모름"],
      },
    ],
    notCovered: [
      "근로자 이름과 생년월일 기재 여부. 개인정보라 입력받지 않습니다.",
      "임금 지급일 기재 여부",
      "임금 총액 표기와 실지급액 일치 여부",
      "항목별 계산방법 기재 여부 (근기법 영 §27의2)",
      "최저임금 계산에 상여금과 복리후생비를 넣을지 여부. 입력만으로는 알 수 없어 확인필요로만 안내합니다.",
      "어떤 수당이 통상임금에 들어가는지. 근로계약서 없이는 판정할 수 없습니다.",
    ],
    ruleCatalog,
    examples: [
      "월급이 이상해요",
      "명세서에서 뭘 자꾸 떼가요",
      "잔업을 했는데 수당이 적어요",
    ],
  },
  {
    id: "departure",
    name: "출국 정산",
    triggers: [
      "출국", "귀국", "돌아가", "고향", "나가", "떠나", "비자 끝",
      "퇴직금", "출국만기", "귀국비용", "국민연금", "반환일시금", "연금",
      "만기", "계약 끝",
      "leave", "return", "departure", "pension",
    ],
    requiredInputs: [
      { key: "nationality", label: "국적", type: "select", options: 국적옵션 },
      {
        key: "visa",
        label: "체류자격",
        type: "select",
        options: ["E-9", "H-2", "E-8", "기타"],
      },
      { key: "hireDate", label: "입사일", type: "date" },
      { key: "departureDate", label: "출국(예정)일", type: "date" },
      {
        key: "monthlyWage",
        label: "월 평균임금",
        type: "number",
        inheritable: true, // S1이 급여명세서에서 계산한 값을 물려받는다
      },
    ],
    ruleCatalog: departureRuleCatalog,
    examples: [
      "다음 달에 고향에 돌아가요",
      "비자가 곧 끝나는데 받을 돈이 있나요",
      "퇴직금을 어떻게 받나요",
      "작년에 출국했는데 연금을 못 받았어요",
    ],
  },
];

export const getSkill = (id: SkillId) => skills.find((s) => s.id === id)!;

export type RouteResult = {
  skill: SkillMeta;
  score: number;
  /** 왜 이 스킬로 갔는가 — 하네스가 근거를 보여주려면 필요하다 */
  matched: string[];
};

/**
 * 발화에서 스킬을 고른다. 점수 순으로 전부 돌려준다.
 *
 * 한 스킬로 단정하지 않고 후보를 나열하는 이유: 애매한 발화를 억지로 하나에
 * 밀어넣으면 엉뚱한 질문을 하게 된다. 점수가 비슷하면 사용자에게 되묻는다.
 */
export function routeByKeyword(utterance: string): RouteResult[] {
  const u = utterance.toLowerCase();
  return skills
    .map((skill) => {
      const matched = skill.triggers.filter((t) => u.includes(t.toLowerCase()));
      return { skill, score: matched.length, matched };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
}

/** 후보가 없거나 1·2위 점수가 같으면 되물어야 한다 */
export function needsClarification(results: RouteResult[]): boolean {
  if (results.length === 0) return true;
  if (results.length === 1) return false;
  return results[0].score === results[1].score;
}
