/**
 * 2단: 판정.
 *
 * 순수 함수다. 외부 호출도 LLM도 없다. 같은 입력이면 항상 같은 출력이 나온다.
 * 요율과 산식은 constants-2026.ts에서만 가져온다 — 여기에 숫자를 직접 쓰지 않는다.
 *
 * 판정 수준의 의미:
 *   위법     — 계산으로 참·거짓이 갈리고 반례가 없다. 확정 표현을 써도 되는 것만.
 *   확인필요 — 추가 정보가 있어야 판정된다. 사용자에게 질문을 돌려준다.
 *   정상     — 기준과 일치한다.
 *
 * 오탐의 대가는 근로자가 치른다(E-9은 사업장 변경 횟수가 제한된다).
 * 애매하면 "위법"이 아니라 "확인필요"로 내린다.
 */

import {
  기준2026 as C,
  공제항목패턴,
  최저임금_산입제외패턴,
  기본급패턴,
} from "./constants-2026.ts";

import { 기준소득월액, 기준소득월액_구간 } from "./constants-departure.ts";

import { sortFindings, type Finding, type LineItem } from "./types.ts";

export type WorkplaceSize = "5인이상" | "5인미만" | "모름";

export type Payslip = {
  /** 지급 항목 */
  earnings: LineItem[];
  /** 공제 항목 */
  deductions: LineItem[];
  hours?: {
    /** 소정근로시간. 없으면 월 209시간으로 본다 */
    scheduled?: number;
    overtime?: number;
    night?: number;
    holiday?: number;
  };
  /** 상시 근로자 수. 5인 미만이면 가산수당 규정이 적용되지 않는다 */
  workplaceSize?: WorkplaceSize;
  /** 귀속 연월 (YYYY-MM). 국민연금 상·하한이 매년 7월 바뀌므로 A2가 쓴다 */
  period?: string;
};

const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;

const find = (items: LineItem[], pattern: RegExp) =>
  items.find((i) => pattern.test(i.label));

const sum = (items: LineItem[]) => items.reduce((a, b) => a + b.amount, 0);

/** 요율 대조가 허용오차 안에 드는가 */
const withinTolerance = (actual: number, expected: number) => {
  if (expected === 0) return actual === 0;
  return Math.abs(actual - expected) / expected <= C.요율_허용오차;
};

/** 통상시급. 기본급이 없으면 지급 총액에서 가산수당을 뺀 값으로 근사한다 */
export function 통상시급(p: Payslip): number {
  const 소정 = p.hours?.scheduled ?? C.월_소정근로시간;
  if (소정 <= 0) return 0;
  const 기본급 = find(p.earnings, 기본급패턴);
  if (기본급) return 기본급.amount / 소정;
  const 산입 = p.earnings.filter((e) => !최저임금_산입제외패턴.test(e.label));
  return sum(산입) / 소정;
}

/* ─────────────────────────── Tier A: 결정적 판정 ─────────────────────────── */

/**
 * A1. 산재보험료를 근로자에게서 공제했는가.
 *
 * 산재보험료는 사업주가 전액 부담한다. 근로자 공제란에 있으면 금액이 얼마든,
 * 사업장 규모가 얼마든, 계약이 어떻든 위법이다. 반례가 없어 오탐이 나올 수 없다.
 */
export function checkSanjae(p: Payslip): Finding[] {
  const item = find(p.deductions, 공제항목패턴.산재보험);
  if (!item || item.amount <= 0) return [];
  return [
    {
      rule: "A1",
      level: "위법",
      title: "산재보험료가 급여에서 공제되었습니다",
      amount: item.amount,
      formula: `근로자 부담 기준 ${won(C.산재보험_근로자)} / 실제 공제 ${won(item.amount)}`,
      basis: "산업재해보상보험법 — 산재보험료는 사업주가 전액 부담",
    },
  ];
}

/**
 * A2~A5. 4대보험 요율 대조.
 *
 * 함정: 4대보험의 기준은 "보수월액"인데 이건 전년도 신고값이라 이번 달 지급액과 다르다.
 * 이번 달 총지급액을 기준으로 나누면 잔업이 있는 달마다 전부 불일치로 뜬다.
 *
 * 그래서 총지급액이 아니라 **건강보험료를 기준점(anchor)으로 삼는다.**
 * 건강보험에도 보험료 상·하한은 있다(복지부고시 제2025-222호, 2026년 월 보험료액
 * 상한 918만3,480원·하한 2만160원). 다만 보수월액 약 1.28억/28만원에 해당해
 * E-9 급여 대역에서는 발동하지 않으므로, 역산으로 보수월액을 얻는 기준점으로
 * 안전하다. 나머지 셋은 같은 보수월액에서 나오므로 서로의 비율이 항상 일정하고,
 * 이 비율은 보수월액을 몰라도 검증되므로 오탐이 나오지 않는다.
 * (이전 주석 "상·하한 캡이 없는 단순 정률"은 사실이 아니어서 2026-08-28 교정)
 *
 * 요율이 안 맞아도 "위법"으로 단정하지 않는다. 불일치는 "확인필요"다.
 */
export function checkInsuranceRates(p: Payslip): Finding[] {
  const 건보 = find(p.deductions, 공제항목패턴.건강보험);
  const 총지급 = sum(p.earnings);

  // 기준점이 없으면 대조 자체가 불가능하다. 침묵하는 편이 틀리게 말하는 것보다 낫다.
  if (!건보 || 건보.amount <= 0) return [];

  const 추정보수월액 = 건보.amount / C.건강보험_근로자;
  const findings: Finding[] = [];

  // 기준점 자체가 엉터리인 경우를 거른다 (건강보험료가 통째로 틀린 상황).
  if (총지급 > 0) {
    const 비율 = 추정보수월액 / 총지급;
    if (비율 < 0.5 || 비율 > 1.5) {
      findings.push({
        rule: "A3",
        level: "확인필요",
        title: "건강보험료가 이번 달 급여 수준과 크게 차이 납니다",
        formula: `건강보험료 ${won(건보.amount)} → 추정 보수월액 ${won(추정보수월액)} / 이번 달 지급 ${won(총지급)}`,
        basis: "국민건강보험법 — 2026년 요율 7.19%의 근로자 부담분",
        questions: [
          "회사에 신고된 보수월액(전년도 기준)을 확인해 보세요. 실제 급여와 크게 다르면 정산 대상일 수 있습니다.",
        ],
      });
    }
  }

  // 국민연금만 기준소득월액 상·하한이 있다 (매년 7월 조정 — 기간별 구간표가 출처).
  // 귀속 연월이 없으면 최신 구간을 쓴다: 이 제품이 보는 명세서는 "이번 달" 것이고,
  // 구간 경계의 차이(약 3.5%)는 요율_허용오차 5% 안이라, 과거 명세서가 들어와도
  // 오판정이 아니라 기껏해야 확인필요로 흐른다.
  const { 상한, 하한 } = 기준소득월액(
    p.period ?? 기준소득월액_구간[기준소득월액_구간.length - 1].from,
  );
  const 연금기준 = Math.min(Math.max(추정보수월액, 하한), 상한);

  const 대상 = [
    {
      rule: "A2",
      name: "국민연금",
      item: find(p.deductions, 공제항목패턴.국민연금),
      expected: 연금기준 * C.국민연금_근로자,
      how: `추정 보수월액 ${won(연금기준)} × ${(C.국민연금_근로자 * 100).toFixed(3)}%`,
      basis: "국민연금법 — 2026년 요율 9.5%의 근로자 부담분",
    },
    {
      rule: "A4",
      name: "장기요양보험",
      item: find(p.deductions, 공제항목패턴.장기요양),
      expected: 건보.amount * C.장기요양_대_건강보험료,
      how: `건강보험료 ${won(건보.amount)} × ${(C.장기요양_대_건강보험료 * 100).toFixed(2)}%`,
      basis: "노인장기요양보험법 — 2026년 요율 0.9448%",
    },
    {
      rule: "A5",
      name: "고용보험",
      item: find(p.deductions, 공제항목패턴.고용보험),
      expected: 추정보수월액 * C.고용보험_근로자,
      how: `추정 보수월액 ${won(추정보수월액)} × ${(C.고용보험_근로자 * 100).toFixed(2)}%`,
      basis: "고용보험법 — 실업급여분 근로자 부담",
    },
  ];

  for (const { rule, name, item, expected, how, basis } of 대상) {
    if (!item) continue;
    const ok = withinTolerance(item.amount, expected);
    findings.push({
      rule,
      level: ok ? "정상" : "확인필요",
      title: ok
        ? `${name} 공제액이 기준과 일치합니다`
        : `${name} 공제액이 기준과 다릅니다`,
      amount: ok ? undefined : Math.abs(item.amount - expected),
      formula: `${how} = ${won(expected)} / 실제 공제 ${won(item.amount)}`,
      basis,
      questions: ok
        ? undefined
        : ["이 공제액의 산정 기준을 회사에 확인해 보세요."],
    });
  }

  return findings;
}

/**
 * A6. 최저임금 미달.
 *
 * 연장·야간·휴일 가산수당은 최저임금 산입에서 제외된다.
 */
export function checkMinWage(p: Payslip): Finding[] {
  const 소정 = p.hours?.scheduled ?? C.월_소정근로시간;
  if (소정 <= 0) return [];

  const 산입 = p.earnings.filter((e) => !최저임금_산입제외패턴.test(e.label));
  const 산입액 = sum(산입);
  if (산입액 <= 0) return [];

  const 시급 = 산입액 / 소정;
  if (시급 >= C.최저임금_시급) {
    return [
      {
        rule: "A6",
        level: "정상",
        title: "최저임금 기준을 충족합니다",
        formula: `${won(산입액)} ÷ ${소정}시간 = 시급 ${won(시급)} (기준 ${won(C.최저임금_시급)})`,
        basis: "최저임금법 — 고용노동부 고시 제2025-47호",
      },
    ];
  }

  const 부족 = (C.최저임금_시급 - 시급) * 소정;
  return [
    {
      rule: "A6",
      level: "위법",
      title: "최저임금에 미달합니다",
      amount: 부족,
      formula:
        `${won(산입액)} ÷ ${소정}시간 = 시급 ${won(시급)}\n` +
        `기준 시급 ${won(C.최저임금_시급)} × ${소정}시간 = ${won(C.최저임금_시급 * 소정)}`,
      basis: "최저임금법 — 2026년 시급 10,320원",
    },
  ];
}

/**
 * A7. 연장근로 가산수당.
 *
 * 5인 미만 사업장은 가산수당 규정이 적용되지 않는다.
 * 사업장 규모를 모르면 판정하지 않고 되묻는다. 이 분기를 빠뜨리면 오탐이 난다.
 */
export function checkOvertime(p: Payslip): Finding[] {
  const 연장시간 = p.hours?.overtime ?? 0;
  if (연장시간 <= 0) return [];

  const size = p.workplaceSize ?? "모름";
  if (size === "5인미만") return [];

  const 시급 = 통상시급(p);
  if (시급 <= 0) return [];

  const 기준액 = 시급 * C.연장_가산율 * 연장시간;
  const 실지급 = find(p.earnings, /연장|초과|잔업/)?.amount ?? 0;
  const 부족 = 기준액 - 실지급;

  const formula =
    `연장 ${연장시간}시간 × 통상시급 ${won(시급)} × ${C.연장_가산율} = ${won(기준액)}\n` +
    `실제 지급 ${won(실지급)}`;

  if (부족 <= 0) {
    return [
      {
        rule: "A7",
        level: "정상",
        title: "연장근로 가산수당이 기준을 충족합니다",
        formula,
        basis: "근로기준법 제56조",
      },
    ];
  }

  if (size === "모름") {
    return [
      {
        rule: "A7",
        level: "확인필요",
        title: "연장근로 가산수당이 부족해 보입니다",
        amount: 부족,
        formula,
        basis: "근로기준법 제56조",
        questions: [
          "이 사업장의 상시 근로자가 5명 이상입니까? 5명 미만이면 가산수당 규정이 적용되지 않습니다.",
        ],
      },
    ];
  }

  return [
    {
      rule: "A7",
      level: "위법",
      title: "연장근로 가산수당이 부족합니다",
      amount: 부족,
      formula,
      basis: "근로기준법 제56조 — 연장근로는 통상임금의 50% 이상 가산",
    },
  ];
}

/** A8. 임금명세서 필수 기재사항 누락 */
export function checkRequiredFields(p: Payslip): Finding[] {
  const 누락: string[] = [];
  if (p.earnings.length === 0) 누락.push("임금 구성항목별 금액");
  if (p.deductions.length === 0) 누락.push("공제 항목별 금액");
  const h = p.hours;
  if (!h || (h.overtime === undefined && h.night === undefined)) {
    누락.push("연장·야간·휴일 근로시간 수");
  }
  if (누락.length === 0) return [];
  return [
    {
      rule: "A8",
      level: "확인필요",
      title: `임금명세서에 필수 기재사항이 빠져 있습니다: ${누락.join(", ")}`,
      basis: "근로기준법 제48조 제2항 / 시행령 제27조의2 — 미기재 시 과태료",
      questions: [
        "명세서의 모든 항목을 빠짐없이 입력했는지 확인해 주세요.",
      ],
    },
  ];
}

/* ─────────────────────────── Tier B: 조건부 판정 ─────────────────────────── */

/** B1·B2. 숙식비 공제 — 자국어 서면동의서가 없으면 사전 공제할 수 없다 */
export function checkLodging(p: Payslip): Finding[] {
  const item = find(p.deductions, 공제항목패턴.숙식비);
  if (!item || item.amount <= 0) return [];
  return [
    {
      rule: "B1",
      level: "확인필요",
      title: `숙식비가 급여에서 ${won(item.amount)} 공제되었습니다`,
      amount: item.amount,
      basis:
        "임금 전액지급 원칙(근로기준법 제43조), 대법원 2001다25184 — 사전 공제는 모국어 서면동의 필요",
      questions: [
        "모국어로 작성된 숙식비 공제 동의서에 서명한 적이 있습니까?",
        "근로계약서에 적힌 숙식비 금액도 이 금액과 같습니까?",
        "전기요금·난방비가 이 금액에 포함되어 있습니까? 포함이면 별도 정산 대상입니다.",
      ],
    },
  ];
}

/**
 * B3. 법령·단체협약 근거가 없는 공제.
 *
 * 알려진 항목이 아닌 공제가 있으면 이름이 무엇이든 근거를 요구할 수 있다.
 * 실전에서 가장 자주 걸리는 룰이다.
 */
export function checkUnknownDeduction(p: Payslip): Finding[] {
  const 알려진 = Object.values(공제항목패턴);
  const 미상 = p.deductions.filter(
    (d) => d.amount > 0 && !알려진.some((re) => re.test(d.label)),
  );
  if (미상.length === 0) return [];
  return 미상.map((d) => ({
    rule: "B3",
    level: "확인필요" as const,
    title: `근거를 확인해야 할 공제 항목이 있습니다 — ${d.label} ${won(d.amount)}`,
    amount: d.amount,
    basis:
      "근로기준법 제43조 — 법령 또는 단체협약에 근거가 없는 공제는 임금 전액지급 원칙 위반",
    questions: [
      `"${d.label}" 공제에 동의한 적이 있습니까?`,
      "이 공제의 근거를 회사에 서면으로 요청할 수 있습니다.",
    ],
  }));
}

/** C1. 출국만기보험료를 근로자에게서 공제했는가 (사업주 부담) */
export function checkSeveranceDeduction(p: Payslip): Finding[] {
  const item = find(p.deductions, 공제항목패턴.출국만기보험);
  if (!item || item.amount <= 0) return [];
  return [
    {
      rule: "C1",
      level: "위법",
      title: "출국만기보험료가 급여에서 공제되었습니다",
      amount: item.amount,
      basis:
        "외국인근로자의 고용 등에 관한 법률 — 출국만기보험료는 사용자가 납부",
    },
  ];
}

/* ─────────────────────────────── 룰 목록 ─────────────────────────────── */

/**
 * 전체 룰 목록. 검증 콘솔이 "발동한 룰"뿐 아니라 **침묵한 룰**도 보여주기 위해 쓴다.
 * 심사자가 "이 룰은 왜 안 떴나"를 확인할 수 있어야 한다.
 */
export const ruleCatalog = [
  { rule: "A1", tier: "A", name: "산재보험 공제", note: "예외가 없어 오판이 없는 규칙" },
  { rule: "A2", tier: "A", name: "국민연금 요율" },
  { rule: "A3", tier: "A", name: "건강보험 기준점" },
  { rule: "A4", tier: "A", name: "장기요양 요율" },
  { rule: "A5", tier: "A", name: "고용보험 요율" },
  { rule: "A6", tier: "A", name: "최저임금 미달" },
  { rule: "A7", tier: "A", name: "연장근로 가산", note: "5인 미만 사업장 제외" },
  { rule: "A8", tier: "A", name: "명세서 필수기재" },
  { rule: "B1", tier: "B", name: "숙식비 공제", note: "모국어 동의서 필요" },
  { rule: "B3", tier: "B", name: "근거 없는 공제" },
  { rule: "C1", tier: "C", name: "출국만기보험 공제" },
] as const;

/* ─────────────────────────────── 진입점 ─────────────────────────────── */

/** 명세서 하나를 모든 룰에 통과시킨다. 심각도 순으로 정렬해 돌려준다. */
export function judgePayslip(p: Payslip): Finding[] {
  return sortFindings([
    ...checkSanjae(p),
    ...checkSeveranceDeduction(p),
    ...checkOvertime(p),
    ...checkMinWage(p),
    ...checkInsuranceRates(p),
    ...checkLodging(p),
    ...checkUnknownDeduction(p),
    ...checkRequiredFields(p),
  ]);
}
