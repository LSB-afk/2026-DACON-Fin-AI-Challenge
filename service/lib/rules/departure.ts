/**
 * S2 출국 정산 — 2단 판정.
 *
 * 순수 함수다. `today`를 **필수로** 주입받으므로 시간까지 결정론적이다.
 * 이 파일 어디에서도 시계를 읽지 않는다. 아래 `addDays` 의 `new Date` 하나만 남아 있고
 * 그 자리에 왜 결정성을 깨지 않는지 적어 두었다.
 *
 * S1과 다른 점: S1은 "이미 떼인 돈"을 말하지만 S2는 "앞으로 받을 돈"을 말한다.
 * 부풀리면 기대를 만들고, 못 받으면 신뢰가 무너진다. 그래서
 *   - 금액은 전부 범위(amountRange)로 낸다
 *   - "위법" 같은 확정 표현을 쓰지 않는다
 *   - 국적 명단에 없으면 단정하지 않고 1355로 보낸다
 */

import {
  기준소득월액,
  귀국비용보험_제1군,
  귀국비용보험_제3군,
  귀국비용보험_금액,
  국민연금_사업장_적용제외국,
  국민연금_협정면제_E9,
  국민연금_납부_확인국,
  국민연금_요율_연도별,
  반환일시금_이자율,
  출국만기보험_납입률,
  기한,
  연락처,
} from "./constants-departure.ts";
import { sortFindings, type Finding } from "./types.ts";

export type Visa = "E-9" | "H-2" | "E-8" | "기타";

export type DepartureInput = {
  /** 국가명 (한국어) */
  nationality: string;
  visa: Visa;
  /** 입사일 YYYY-MM-DD */
  hireDate: string;
  /** 출국(예정)일 YYYY-MM-DD */
  departureDate: string;
  /** 월 평균임금. S1이 급여명세서에서 계산한 값을 넘겨받을 수 있다 */
  monthlyWage: number;
  /**
   * 기준일 YYYY-MM-DD. **필수다.** 호출부가 반드시 정한다.
   *
   * 예전에는 없으면 실제 오늘을 읽었다. 주입을 잊은 호출부가 조용히 비결정적이 되고,
   * 어제 통과한 골든셋이 오늘 다른 D-day를 내도 아무도 눈치채지 못한다.
   */
  today: string;
};

const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;

/**
 * 기준일을 꺼낸다. 판정 함수는 여기 말고 어디서도 시각을 얻지 않는다.
 *
 * 값이 없거나 형태가 틀리면 던진다. 조용히 넘기면 `Date.parse` 가 NaN 을 내고
 * D-day·기한임박 분기가 전부 NaN 이 되는데, 화면에는 "NaN일 남음"으로 흘러가고
 * 테스트도 잡지 못한다. 타입이 막아 주는 것은 TypeScript 호출부뿐이다 —
 * 골든셋(golden/cases.json)과 scripts/verify-golden.mjs 는 타입 검사를 거치지 않으므로
 * 이 검사가 그쪽의 유일한 방어선이다.
 */
const 오늘 = (i: DepartureInput) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.today) || Number.isNaN(Date.parse(i.today)))
    throw new Error(
      `기준일(today)이 YYYY-MM-DD 형식으로 필요합니다. 받은 값: ${JSON.stringify(i.today)} — ` +
        `판정은 시각을 스스로 읽지 않습니다.`,
    );
  return i.today;
};

/**
 * ISO 날짜에 일수를 더한다.
 *
 * 여기 `new Date` 는 시계를 읽지 않는다. 인자로 받은 epoch 밀리초를 ISO 문자열로
 * 되돌릴 뿐이라 같은 입력이면 언제 돌려도 같은 값이 나온다.
 * 결정성 금지 목록(`grep "new Date("`)에 걸리는 이 파일의 유일한 자리이고 이 주석이 그 정당화다.
 * 지우거나 흩뜨리지 마라 — 호출 자리마다 흩어져 있으면 다음 사람이 grep 결과 네 줄을 보고
 * 위반으로 오해해 고친다.
 *
 * 한계: UTC 고정 산술이다. 달력 규칙이 아니라 정확히 n×86400초를 옮긴다.
 * 일 단위 기한(출국 7일 전 등)에만 쓴다 — 년 단위 시효는 아래 addYears 가 맡는다.
 */
const addDays = (iso: string, days: number) =>
  new Date(Date.parse(iso) + days * 86_400_000).toISOString().slice(0, 10);

/**
 * 년을 달력 기준으로 더한다. 시효는 "n년 뒤 같은 날"이지 n×365일이 아니다.
 *
 * 교정 — 2026-08-28: 소멸시효를 `addDays(날짜, 년×365)` 로 계산해 윤년을 지날 때마다
 * 하루씩 앞당겨 말하고 있었다(3년 시효에 윤년 1회 → 사용자에게 하루 이른 마감 안내).
 * 이르게 말한 쪽이라 돈을 잃게 하진 않았지만, 기한을 말하는 제품이 기한을 틀리면 끝이다.
 * 2/29 출발이 평년에 떨어지면 2/28 로 내린다 — 있는 날짜 중 가장 이른 쪽(보수적).
 * Date 를 쓰지 않는 순수 산술이다(이 파일의 new Date 는 addDays 하나로 유지).
 */
const 윤년 = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const addYears = (iso: string, years: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  const ny = y + years;
  const 말일 = [31, 윤년(ny) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  const nd = Math.min(d, 말일);
  return `${ny}-${String(m).padStart(2, "0")}-${String(nd).padStart(2, "0")}`;
};

/** `Date.parse` 는 문자열만 읽는다. 현재 시각이 개입하지 않는다 */
const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

/** 만 개월 수. 일자가 모자라면 한 달 빼서 센다 */
export function monthsBetween(from: string, to: string): number {
  const [ay, am, ad] = from.split("-").map(Number);
  const [by, bm, bd] = to.split("-").map(Number);
  let m = (by - ay) * 12 + (bm - am);
  if (bd < ad) m -= 1;
  return Math.max(0, m);
}

/** 출국만기보험·귀국비용보험 대상 체류자격인가 */
const 보험대상 = (v: Visa) => v === "E-9" || v === "H-2";

/**
 * 보험 두 갈래(S2-1·S2-2)가 지금 어느 국면에 있는가.
 *
 * 이 함수가 없던 때의 사고 — 2026-08-26, 골든셋 D03:
 * S2-5 가 "소멸시효가 지났습니다(수령불가)" 라고 말하는데 같은 결과에서
 * S2-1 이 "청구할 수 있습니다 · 4,000,000원 · 기한임박 D-1499" 로 함께 떴다.
 * 총액에 450만원이 들어갔다. 못 받는 돈을 받을 수 있다고 말한 것이다.
 * 각 룰이 시효를 따로 계산했고 아무도 서로를 보지 않았다.
 *
 * 그래서 국면 판정을 한 곳으로 모은다. S2-1·S2-2·S2-4 가 전부 이 값을 쓴다.
 */
type 청구국면 =
  | { phase: "출국전"; date: string; daysLeft: number }
  | { phase: "출국후"; date: string; daysLeft: number }
  | { phase: "시효초과"; date: string; daysLeft: number };

function 보험청구국면(i: DepartureInput): 청구국면 {
  const 청구마감 = addDays(i.departureDate, -기한.보험청구_출국전_일);
  const 마감까지 = daysBetween(오늘(i), 청구마감);
  if (마감까지 >= 0)
    return { phase: "출국전", date: 청구마감, daysLeft: 마감까지 };

  // 출국 뒤에도 시효 안이면 청구는 살아 있다. 다만 마감이 바뀐다 —
  // 지난 '출국 7일 전'이 아니라 소멸시효일이 남은 기한이다.
  const 시효 = addYears(i.departureDate, 기한.보험_소멸시효_년);
  const 시효까지 = daysBetween(오늘(i), 시효);
  return 시효까지 >= 0
    ? { phase: "출국후", date: 시효, daysLeft: 시효까지 }
    : { phase: "시효초과", date: 시효, daysLeft: 시효까지 };
}

/**
 * 청구 갈래. 보험(시효 3년)과 국민연금(시효 5년)은 시한이 다르다 —
 * 보험이 죽어도 연금은 살아 있을 수 있고 그건 모순이 아니라 사실이다.
 * 가드레일 G8 이 이 값으로 갈래를 나눠 본다.
 */
const 갈래 = { 보험: "보험", 연금: "국민연금" } as const;

/** 시효가 지난 보험 갈래의 공통 판정 — 금액을 붙이지 않는다 */
function 시효초과판정(rule: string, 이름: string, 국면: 청구국면): Finding {
  return {
    rule,
    level: "수령불가",
    track: 갈래.보험,
    title: `${이름}의 소멸시효가 지났습니다`,
    formula:
      `시효 만료 ${국면.date} · ${-국면.daysLeft}일 경과\n` +
      `보험금은 한국산업인력공단으로 이전되었습니다`,
    basis: "외국인고용법 §13④ — 3년 내 미청구 시 한국산업인력공단 이전",
    blocksClaims: true,
    questions: [
      "휴면보험금은 한국산업인력공단에서 조회·청구할 수 있습니다. 금액이 남아 있는지 먼저 확인하세요.",
    ],
  };
}

/* ─────────────────────── 국적 판정 (S2의 핵심 분기) ─────────────────────── */

export type 연금상태 = "납부함" | "미가입" | "협정면제" | "미확인";

/**
 * 국민연금을 납부했는가.
 *
 * 반환일시금 수급 자격은 국민연금법 §126④2호로 E-9에게 이미 보장된다.
 * 따라서 판정할 것은 자격이 아니라 "애초에 냈는가"뿐이다.
 */
export function 연금납부여부(nationality: string, visa: Visa): 연금상태 {
  if (국민연금_협정면제_E9.includes(nationality) && visa === "E-9")
    return "협정면제";
  if (국민연금_사업장_적용제외국.includes(nationality)) return "미가입";
  if (국민연금_납부_확인국.includes(nationality)) return "납부함";
  return "미확인";
}

/** 근속 기간을 연도별 요율로 훑어 납부 원금을 구한다 */
export function 연금납부원금(
  hireDate: string,
  departureDate: string,
  monthlyWage: number,
): number {
  const 개월 = monthsBetween(hireDate, departureDate);
  const 시작연도 = Number(hireDate.slice(0, 4));
  const 시작월 = Number(hireDate.slice(5, 7));
  const 요율목록 = Object.keys(국민연금_요율_연도별).map(Number);
  const 최소 = Math.min(...요율목록);
  const 최대 = Math.max(...요율목록);

  let 합 = 0;
  for (let i = 0; i < 개월; i++) {
    const 연도 = 시작연도 + Math.floor((시작월 - 1 + i) / 12);
    const 월 = ((시작월 - 1 + i) % 12) + 1;
    const 클램프 = Math.min(Math.max(연도, 최소), 최대);
    // 보험료는 실제 월급이 아니라 기준소득월액(상·하한 클램프)에 매겨진다.
    // 클램프 없이는 고임금 입력에서 납부한 적 없는 원금을 약속하게 된다.
    const { 상한, 하한 } = 기준소득월액(`${연도}-${String(월).padStart(2, "0")}`);
    const 기준소득 = Math.min(Math.max(monthlyWage, 하한), 상한);
    합 += 기준소득 * 국민연금_요율_연도별[클램프];
  }
  return 합;
}

/* ──────────────────────────────── 판정 ──────────────────────────────── */

/** S2-1 출국만기보험 (퇴직금) — 사업주 부담 */
export function checkSeveranceInsurance(i: DepartureInput): Finding[] {
  if (!보험대상(i.visa)) return [];

  const 개월 = monthsBetween(i.hireDate, i.departureDate);
  const 남은일 = daysBetween(오늘(i), i.departureDate);

  if (개월 < 기한.출국만기보험_최소근속_개월) {
    return [
      {
        rule: "S2-1",
        track: 갈래.보험,
        level: "수령불가",
        title: "근속 1년 미만이라 출국만기보험 일시금을 받을 수 없습니다",
        formula: `근속 ${개월}개월 (기준 ${기한.출국만기보험_최소근속_개월}개월)`,
        basis:
          "외국인근로자의 고용 등에 관한 법률 §13 — 근속 1년 미만이면 일시금은 사업주에게 귀속",
      },
    ];
  }

  const 국면 = 보험청구국면(i);
  if (국면.phase === "시효초과")
    return [시효초과판정("S2-1", "출국만기보험(퇴직금)", 국면)];

  const 적립분 = i.monthlyWage * 출국만기보험_납입률 * 개월;
  const 법정퇴직금 = i.monthlyWage * (개월 / 12);
  const 출국전 = 국면.phase === "출국전";

  return [
    {
      rule: "S2-1",
      track: 갈래.보험,
      // 기한임박은 "마감이 가깝다"는 뜻이다. 지난 마감을 임박이라 부르면
      // 화면에 D-1499 같은 음수가 카운트다운처럼 찍힌다.
      level: 국면.daysLeft <= 14 ? "기한임박" : "수령가능",
      title: 출국전
        ? "출국만기보험(퇴직금)을 청구할 수 있습니다"
        : "출국만기보험(퇴직금)이 아직 남아 있습니다 — 해외에서 청구해야 합니다",
      amount: Math.round(법정퇴직금),
      amountRange: {
        min: Math.round(Math.min(적립분, 법정퇴직금)),
        max: Math.round(Math.max(적립분, 법정퇴직금)),
      },
      formula:
        `근속 ${개월}개월 × 월 ${won(i.monthlyWage)}\n` +
        `적립분(8.3%) ${won(적립분)} / 법정 퇴직금 ${won(법정퇴직금)}\n` +
        (출국전
          ? `출국 ${남은일}일 전 · 지급은 출국 후 ${기한.보험지급_출국후_일}일 이내`
          : `출국 ${-남은일}일 경과 · 시효 ${국면.date}까지 ${국면.daysLeft}일 남음`),
      basis: "외국인고용법 §13① — 사용자가 매월 납입, §13③ 출국 후 14일 내 지급",
      deadline: {
        /*
         * 세 기한은 성격이 다르다 — 섞으면 실무 마감이 법정 기한처럼 읽힌다:
         *   출국 7일 전  = 보험사 사전신청 실무 기한 (법정 아님)
         *   출국 후 14일 = 법정 지급 시기 (§13③ — formula 에 표기)
         *   3년         = 청구권 소멸시효 (§13④ — 이걸 넘기면 진짜 못 받는다)
         */
        label: 출국전 ? "사전신청 마감 (보험사 실무 · 법정기한 아님)" : "청구권 소멸시효 (3년)",
        date: 국면.date,
        daysLeft: 국면.daysLeft,
      },
      questions: 출국전
        ? [
            `청구: ${연락처.보험사}`,
            "7일 전 마감은 보험사 실무 기한입니다. 놓쳐도 청구권은 3년 시효까지 살아 있습니다 — 다만 절차가 어려워집니다.",
          ]
        : [
            `해외에서 청구하려면 서류 영사확인이 필요합니다. ${연락처.보험사}`,
          ],
    },
  ];
}

/** S2-2 귀국비용보험 — ★ 근로자 본인이 낸 돈 */
export function checkReturnCostInsurance(i: DepartureInput): Finding[] {
  if (!보험대상(i.visa)) return [];

  const 금액 = 귀국비용보험_제1군.includes(i.nationality)
    ? 귀국비용보험_금액.제1군
    : 귀국비용보험_제3군.includes(i.nationality)
      ? 귀국비용보험_금액.제3군
      : 귀국비용보험_금액.제2군;

  const 국면 = 보험청구국면(i);
  if (국면.phase === "시효초과")
    return [시효초과판정("S2-2", "귀국비용보험", 국면)];

  const 출국전 = 국면.phase === "출국전";

  return [
    {
      rule: "S2-2",
      track: 갈래.보험,
      level: 국면.daysLeft <= 14 ? "기한임박" : "수령가능",
      title: 출국전
        ? "귀국비용보험을 청구할 수 있습니다 — 본인이 납부한 돈입니다"
        : "귀국비용보험이 아직 남아 있습니다 — 본인이 납부한 돈입니다",
      amount: 금액,
      formula:
        `${i.nationality} 기준 ${won(금액)}\n` +
        `입국 후 3개월 내에 근로자 본인이 납부한 보험입니다 (사업주 부담 아님)\n` +
        (출국전
          ? `출국 당일 공항에서도 수령할 수 있습니다`
          : `시효 ${국면.date}까지 ${국면.daysLeft}일 남음`),
      basis: "외국인고용법 §15 — 귀국비용보험은 외국인근로자 본인이 가입·납부",
      deadline: {
        label: 출국전 ? "사전신청 마감 (보험사 실무 · 법정기한 아님)" : "청구권 소멸시효 (3년)",
        date: 국면.date,
        daysLeft: 국면.daysLeft,
      },
      questions: [
        `출국만기보험과 함께 일괄 신청할 수 있습니다 (${연락처.보험사})`,
      ],
    },
  ];
}

/** S2-3 국민연금 반환일시금 — 국적이 분기를 결정한다 */
export function checkPensionRefund(i: DepartureInput): Finding[] {
  const 상태 = 연금납부여부(i.nationality, i.visa);

  if (상태 === "미가입") {
    return [
      {
        rule: "S2-3",
        track: 갈래.연금,
        level: "수령불가",
        title: `${i.nationality} 국적은 국민연금 사업장 가입 대상이 아닙니다`,
        formula: "납부한 보험료가 없으므로 반환일시금도 발생하지 않습니다",
        basis:
          "국민연금법 §126① 상호주의 — 공단 「외국 연금제도 조사 내용」 사업장 적용제외국",
      },
    ];
  }

  if (상태 === "협정면제") {
    return [
      {
        rule: "S2-3",
        track: 갈래.연금,
        level: "수령불가",
        title: `${i.nationality} E-9은 사회보장협정으로 보험료가 면제됩니다`,
        formula: "협정 가입증명서 제출 없이 면제되므로 납부액이 없습니다",
        basis: "한-우즈베키스탄 사회보장협정 (2006-05-01 발효)",
      },
    ];
  }

  if (상태 === "미확인") {
    return [
      {
        rule: "S2-3",
        track: 갈래.연금,
        level: "확인필요",
        title: `${i.nationality} 국적의 국민연금 가입 여부를 확인해야 합니다`,
        basis: "국민연금법 §126 — 국가별 적용 여부는 상호주의·협정에 따라 다름",
        questions: [
          `${연락처.국민연금}에 국적과 체류자격을 알려주고 가입 여부를 확인하세요.`,
          "급여명세서 공제란에 '국민연금'이 있었다면 납부한 것입니다.",
        ],
      },
    ];
  }

  const 개월 = monthsBetween(i.hireDate, i.departureDate);
  const 원금 = 연금납부원금(i.hireDate, i.departureDate, i.monthlyWage);
  // 이자는 월별 단리 누적이다. 평균 경과기간(근속의 절반)으로 근사한다.
  const 이자 = 원금 * 반환일시금_이자율 * (개월 / 12 / 2);
  const 시효 = addYears(i.departureDate, 기한.연금_소멸시효_년);

  return [
    {
      rule: "S2-3",
      track: 갈래.연금,
      level: "수령가능",
      title: "국민연금 반환일시금을 청구할 수 있습니다",
      amount: Math.round(원금 + 이자),
      amountRange: { min: Math.round(원금), max: Math.round(원금 + 이자) },
      formula:
        `근속 ${개월}개월 · 본인 + 사업주 부담분을 모두 돌려받습니다\n` +
        `원금 약 ${won(원금)} + 이자 약 ${won(이자)}\n` +
        `${연락처.공항수령}에서 출국 당일 수령 가능`,
      basis:
        "국민연금법 §126④2호 — 고용허가제 외국인근로자는 본국 상호주의와 무관하게 수급",
      deadline: {
        label: "청구권 소멸시효 (국외이주 사유 5년)",
        date: 시효,
        daysLeft: daysBetween(오늘(i), 시효),
      },
      questions: [
        `정확한 금액은 개인 납부이력이 있어야 계산됩니다. ${연락처.국민연금}`,
        연락처.공항수령_조건,
      ],
    },
  ];
}

/** S2-4 퇴직금 차액 — 적립분이 법정 퇴직금보다 적을 때 */
export function checkSeveranceGap(i: DepartureInput): Finding[] {
  if (!보험대상(i.visa)) return [];
  const 개월 = monthsBetween(i.hireDate, i.departureDate);
  if (개월 < 기한.출국만기보험_최소근속_개월) return [];
  // 본체(S2-1)가 시효로 사라졌는데 차액만 남으면, 없는 원금의 차액을 청구하라는 말이 된다.
  // 퇴직금 청구권 자체의 시효(3년)도 같은 날 끝난다.
  if (보험청구국면(i).phase === "시효초과") return [];

  const 적립분 = i.monthlyWage * 출국만기보험_납입률 * 개월;
  const 법정퇴직금 = i.monthlyWage * (개월 / 12);
  const 차액 = 법정퇴직금 - 적립분;
  if (차액 <= 0) return [];

  return [
    {
      rule: "S2-4",
      track: 갈래.보험,
      level: "확인필요",
      title: "출국만기보험금이 법정 퇴직금보다 적을 수 있습니다",
      amount: Math.round(차액),
      formula:
        `법정 퇴직금 ${won(법정퇴직금)} − 적립분 ${won(적립분)} = ${won(차액)}\n` +
        `재직 중 임금이 올랐다면 차액은 더 커집니다 (퇴직금은 퇴직 전 3개월 평균임금 기준)`,
      basis:
        "외국인고용법 §13② — 일시금이 퇴직금보다 적으면 사용자가 차액을 지급",
      questions: [
        "차액은 보험사가 아니라 사업주에게 따로 청구해야 합니다.",
        "보험사에 일시금 금액의 서면 확인을 요청할 수 있습니다.",
      ],
    },
  ];
}

/**
 * S2-5 이미 출국한 경우 — 절차가 어려워졌다는 알림.
 *
 * 시효를 넘긴 경우는 여기서 말하지 않는다. S2-1·S2-2 가 각자 자기 갈래를 두고
 * 「소멸시효가 지났습니다」로 내려앉기 때문에, 여기서 또 말하면 같은 화면에 같은 문장이
 * 세 번 뜬다. 룰은 자기가 판정하는 대상에 대해서만 말해야 한다.
 */
export function checkExpiry(i: DepartureInput): Finding[] {
  const 경과 = daysBetween(i.departureDate, 오늘(i));
  if (경과 <= 0) return [];

  const 국면 = 보험청구국면(i);
  if (국면.phase === "시효초과") return [];

  return [
    {
      rule: "S2-5",
      track: 갈래.보험,
      level: "기한임박",
      title: "이미 출국했지만 아직 청구할 수 있습니다",
      formula:
        `출국 ${경과}일 경과 · 보험 시효까지 ${국면.daysLeft}일 남음\n` +
        `출국 뒤에는 난이도가 올라갑니다 — 외국 발급 공문서는 영사확인, 사문서는 공증과 영사확인이 필요합니다`,
      basis: "외국인고용법 §13④ — 3년 내 미청구 시 한국산업인력공단 이전",
      deadline: {
        label: "보험 소멸시효",
        date: 국면.date,
        daysLeft: 국면.daysLeft,
      },
      questions: [
        `해외에서 청구하려면 서류 영사확인이 필요합니다. ${연락처.보험사}`,
      ],
    },
  ];
}

/* ─────────────────────────────── 룰 목록 ─────────────────────────────── */

export const departureRuleCatalog = [
  { rule: "S2-1", tier: "S2", name: "출국만기보험", note: "사업주 부담 · 1년 미만 제외" },
  { rule: "S2-2", tier: "S2", name: "귀국비용보험", note: "본인이 낸 돈" },
  { rule: "S2-3", tier: "S2", name: "국민연금 반환일시금", note: "국적에 따라 갈림" },
  { rule: "S2-4", tier: "S2", name: "퇴직금 차액", note: "사업주에게 별도 청구" },
  { rule: "S2-5", tier: "S2", name: "출국 후 시효", note: "3년" },
] as const;

/* ─────────────────────────────── 진입점 ─────────────────────────────── */

export function judgeDeparture(i: DepartureInput): Finding[] {
  return sortFindings([
    ...checkExpiry(i),
    ...checkSeveranceInsurance(i),
    ...checkReturnCostInsurance(i),
    ...checkPensionRefund(i),
    ...checkSeveranceGap(i),
  ]);
}
