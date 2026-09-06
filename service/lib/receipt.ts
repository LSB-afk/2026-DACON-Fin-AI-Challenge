import { moneyTotals, type Finding } from "./rules/types.ts";

/** Existing run metadata only. This model deliberately has no issue timestamp. */
export type ReceiptSourceMeta = Readonly<{
  caseId?: string;
  runId?: string;
  /** The user-selected judgement criterion date (YYYY-MM-DD). */
  today?: string;
  /** Current accepted input description, not a stale case fixture summary. */
  description?: string;
}>;

export type ReceiptMoneySummary = Readonly<{
  confirmed: Readonly<{ amount: number; display: string }> | null;
  estimated: Readonly<{ min: number; max: number; display: string }> | null;
  reviewReference: Readonly<{ amount: number; display: string }> | null;
  notice: string;
}>;

export type ReceiptRowGroup = "included" | "review" | "excluded";

export type ReceiptRow = Readonly<{
  id: string;
  group: ReceiptRowGroup;
  status: Finding["level"];
  statusLabel: string;
  title: string;
  amountDisplay: string | null;
  detail: readonly string[];
  /** Immutable provenance copy. Consumers never infer a second monetary result. */
  finding: Readonly<Finding>;
}>;

export type ReceiptModel = Readonly<{
  hasRun: boolean;
  hasFindings: boolean;
  source: ReceiptSourceMeta;
  money: ReceiptMoneySummary;
  rows: readonly ReceiptRow[];
  groups: Readonly<{
    included: readonly ReceiptRow[];
    review: readonly ReceiptRow[];
    excluded: readonly ReceiptRow[];
  }>;
  notices: readonly string[];
}>;

export type BuildReceiptInput = Readonly<{
  ran: boolean;
  findings: readonly Finding[];
  source?: ReceiptSourceMeta;
}>;

const won = (amount: number) => `${amount.toLocaleString("ko-KR")}원`;

const activeMoney = (finding: Finding) =>
  finding.level !== "정상" && finding.level !== "수령불가" && finding.level !== "확인필요";

const groupFor = (finding: Finding): ReceiptRowGroup =>
  finding.level === "확인필요" ? "review" : finding.level === "정상" || finding.level === "수령불가" ? "excluded" : "included";

const statusLabel = (finding: Finding) => {
  switch (finding.level) {
    case "정상":
      return "정상·합산 대상 아님";
    case "수령불가":
      return "수령 불가·합산 대상 아님";
    case "확인필요":
      return "확인 필요·참고 금액";
    case "기한임박":
      return "기한 임박";
    case "수령가능":
      return "수령 가능";
    case "위법":
      return "위법";
  }
};

const cloneFinding = (finding: Finding): Finding => {
  const cloned: Finding = {
    ...finding,
    amountRange: finding.amountRange ? { ...finding.amountRange } : undefined,
    questions: finding.questions ? [...finding.questions] : undefined,
    deadline: finding.deadline ? { ...finding.deadline } : undefined,
  };
  if (cloned.amountRange) Object.freeze(cloned.amountRange);
  if (cloned.questions) Object.freeze(cloned.questions);
  if (cloned.deadline) Object.freeze(cloned.deadline);
  return Object.freeze(cloned);
};

const sourceOf = (source?: ReceiptSourceMeta): ReceiptSourceMeta =>
  Object.freeze({
    ...(source?.caseId ? { caseId: source.caseId } : {}),
    ...(source?.runId ? { runId: source.runId } : {}),
    ...(source?.today ? { today: source.today } : {}),
    ...(source?.description ? { description: source.description } : {}),
  });

const detailOf = (finding: Finding) =>
  Object.freeze([
    ...(finding.formula ? [`계산: ${finding.formula}`] : []),
    ...(finding.basis ? [`근거: ${finding.basis}`] : []),
    ...(finding.deadline
      ? [`${finding.deadline.label}: ${finding.deadline.date} (D${finding.deadline.daysLeft >= 0 ? "-" : "+"}${Math.abs(finding.deadline.daysLeft)})`]
      : []),
    ...(finding.questions ?? []).map((question) => `확인: ${question}`),
  ]);

const amountDisplayOf = (finding: Finding) => {
  // A normal payroll line is not denied money, and an unavailable claim is not a
  // payable line. Keeping their incidental source amounts off the receipt avoids
  // suggesting either a rejection amount or a payment promise.
  if (finding.level === "정상" || finding.level === "수령불가") return null;
  if (finding.amountRange) return `${won(finding.amountRange.min)} ~ ${won(finding.amountRange.max)}`;
  return finding.amount === undefined ? null : won(finding.amount);
};

/**
 * Projects current rule findings into the one receipt contract used by screen and PDF.
 * `moneyTotals` remains the only monetary arithmetic; this function decides only whether
 * an explicit zero should be shown instead of being mistaken for an unknown amount.
 */
export function buildReceipt(input: BuildReceiptInput): ReceiptModel {
  const totals = moneyTotals([...input.findings]);
  const hasConfirmed = input.findings.some((finding) => activeMoney(finding) && !finding.amountRange && finding.amount !== undefined);
  const hasEstimated = input.findings.some((finding) => activeMoney(finding) && !!finding.amountRange);
  const hasReviewReference = input.findings.some((finding) => finding.level === "확인필요" && finding.amount !== undefined);

  const rows = Object.freeze(input.findings.map((finding, index): ReceiptRow => {
    const provenance = cloneFinding(finding);
    return Object.freeze({
      id: `${finding.rule}-${index}`,
      group: groupFor(finding),
      status: finding.level,
      statusLabel: statusLabel(finding),
      title: finding.title,
      amountDisplay: amountDisplayOf(finding),
      detail: detailOf(finding),
      finding: provenance,
    });
  }));
  const groups = Object.freeze({
    included: Object.freeze(rows.filter((row) => row.group === "included")),
    review: Object.freeze(rows.filter((row) => row.group === "review")),
    excluded: Object.freeze(rows.filter((row) => row.group === "excluded")),
  });
  const notices = Object.freeze([
    "확정 금액은 현재 입력값으로 계산한 결과이며 실제 지급을 보장하지 않습니다.",
    ...(hasReviewReference ? ["확인 필요 참고 금액은 다른 금액과 겹칠 수 있어 합계에 포함하지 않았습니다."] : []),
  ]);

  return Object.freeze({
    hasRun: input.ran,
    hasFindings: input.ran && rows.length > 0,
    source: sourceOf(input.source),
    money: Object.freeze({
      confirmed: hasConfirmed ? Object.freeze({ amount: totals.확정, display: won(totals.확정) }) : null,
      estimated: hasEstimated && totals.추정
        ? Object.freeze({ min: totals.추정.min, max: totals.추정.max, display: `${won(totals.추정.min)} ~ ${won(totals.추정.max)}` })
        : null,
      reviewReference: hasReviewReference ? Object.freeze({ amount: totals.확인필요참고, display: won(totals.확인필요참고) }) : null,
      notice: notices[0],
    }),
    rows,
    groups,
    notices,
  });
}
