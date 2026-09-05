/**
 * 모든 스킬이 공유하는 타입.
 *
 * 스킬이 늘어도 이 파일은 거의 바뀌지 않는다. 그래서 결과 화면·다국어 설명·
 * 금액 집계·검증 콘솔이 스킬 수와 무관하게 그대로 재사용된다.
 */

export type Level =
  // S1 급여명세서 — 규범 대조
  | "위법"
  | "확인필요"
  | "정상"
  // S2 출국 정산 — 청구 판정
  | "기한임박"
  | "수령가능"
  | "수령불가";

/** 화면·정렬용 심각도. 낮을수록 위로 올라간다. */
export const 심각도순: Record<Level, number> = {
  기한임박: 0,
  위법: 1,
  수령가능: 2,
  확인필요: 3,
  수령불가: 4,
  정상: 5,
};

export type Deadline = {
  label: string;
  /** ISO date (YYYY-MM-DD) */
  date: string;
  /** 음수면 이미 지났다 */
  daysLeft: number;
};

export type Finding = {
  /** 룰 번호 (A1, S2-3 ...) — 화면·문서·테스트가 이걸로 서로를 참조한다 */
  rule: string;
  level: Level;
  /** 무엇이 문제/무엇을 받는가 (한국어 원문. 3단이 모국어로 옮긴다) */
  title: string;
  /** 되찾을 수 있는 금액 또는 받을 예상 금액 */
  amount?: number;
  /**
   * 금액이 추정이면 범위를 함께 준다.
   * S2는 "앞으로 받을 돈"을 말하므로 확정값처럼 제시하면 안 된다.
   */
  amountRange?: { min: number; max: number };
  /** 계산 과정. 사업주·기관에 그대로 보여줄 수 있어야 한다 */
  formula?: string;
  /** 근거 조문 */
  basis: string;
  /** 확인필요일 때 사용자에게 돌려주는 질문 */
  questions?: string[];
  /** 기한이 있는 판정 */
  deadline?: Deadline;
  /**
   * 이 판정이 속한 청구 갈래. 돈을 말하는 판정만 갖는다.
   *
   * 갈래가 왜 필요한가: 출국 정산에서 보험(시효 3년)과 국민연금(시효 5년)은 시한이 다르다.
   * 보험이 죽어도 연금은 살아 있을 수 있고 **그건 모순이 아니라 사실이다.**
   * 갈래 없이 "청구 불가"를 전역으로 선언하면 멀쩡한 연금 판정까지 거짓말로 몰린다.
   */
  track?: string;
  /**
   * 내 갈래에서 더 이상 청구할 것이 없다는 선언.
   *
   * 세우면 **같은 갈래의** 다른 룰이 돈을 약속할 수 없다 — 가드레일 G8 이 막는다.
   * 문자열을 뒤져 "시효" 같은 낱말을 찾는 방식은 문구를 고치는 순간 조용히 풀린다.
   * 그래서 뜻을 필드로 들고 다닌다.
   */
  blocksClaims?: boolean;
};

export type LineItem = { label: string; amount: number };

/** 판정 배열을 심각도 순으로 정렬한다. */
export const sortFindings = (fs: Finding[]): Finding[] =>
  [...fs].sort((a, b) => 심각도순[a.level] - 심각도순[b.level]);

/**
 * 되찾거나 받을 수 있는 금액의 단순 합계. "정상"과 "수령불가"는 세지 않는다.
 *
 * ⚠️ 화면 합계에는 쓰지 마라 — 확정과 추정을 한 숫자로 섞는다. 화면·답변·원장은
 * 아래 moneyTotals 를 쓴다. 이 함수가 남아 있는 이유는 온톨로지 T-Box 의
 * codeSource 가 이 심볼을 실재 증명으로 가리키고 있어서다.
 */
export const recoverableTotal = (fs: Finding[]): number =>
  fs
    .filter((f) => f.level !== "정상" && f.level !== "수령불가")
    .reduce((a, f) => a + (f.amount ?? 0), 0);

/**
 * 금액 3분류 합계 — 확정·추정·확인필요를 절대 한 숫자로 합치지 않는다.
 *
 * 사고 유형: 위법 공제 환급(확정 산식)과 보험 예상액(기관 확인 전 추정)과
 * 퇴직금 차액(사업장 확인 필요)을 "확인된 금액 1,417만원"으로 합쳐 말하면,
 * 사용자는 1,417만원을 기대하고 기관은 다른 숫자를 준다. 기대가 무너지는 자리가
 * 정확히 이 제품이 지키려는 자리다.
 *
 *   확정   — 산식으로 정해지는 돈: 이미 떼인 차액, 본인이 납부한 원금.
 *            amountRange 가 없는 amount (범위가 필요 없을 만큼 확실한 것만 여기 온다)
 *   추정   — 기관 확인 후 정해질 돈: amountRange 로만 말한다 (G3 가 강제)
 *   확인필요참고 — 확인필요 판정에 붙은 참고 금액. 총액 어디에도 넣지 않고
 *            "따로 확인" 항목으로만 보여준다 (S2-4 퇴직금 차액이 여기다 —
 *            S2-1 범위와 겹칠 수 있어 합산하면 이중 계상이 된다)
 */
export type MoneyTotals = {
  확정: number;
  추정: { min: number; max: number } | null;
  확인필요참고: number;
};

export function moneyTotals(fs: Finding[]): MoneyTotals {
  let 확정 = 0;
  let min = 0;
  let max = 0;
  let 참고 = 0;
  let has추정 = false;
  for (const f of fs) {
    if (f.level === "정상" || f.level === "수령불가") continue;
    if (f.level === "확인필요") {
      참고 += f.amount ?? 0;
      continue;
    }
    if (f.amountRange) {
      has추정 = true;
      min += f.amountRange.min;
      max += f.amountRange.max;
    } else if (f.amount !== undefined) {
      확정 += f.amount;
    }
  }
  return { 확정, 추정: has추정 ? { min, max } : null, 확인필요참고: 참고 };
}
