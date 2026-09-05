/**
 * 가드레일 — 판정 결과가 사용자에게 나가기 전에 통과해야 하는 검사.
 *
 * 이 서비스의 최대 위험은 틀린 계산이 아니라 **오탐의 대가를 근로자가 치른다는 것**이다.
 * E-9은 사업장 변경 횟수가 제한되고, 없는 돈을 약속하면 기대가 무너진다.
 * 그래서 규율을 문서가 아니라 실행되는 코드로 강제한다.
 *
 * 각 가드는 위반 문자열 또는 null을 돌려준다. 하나라도 걸리면 afterJudge 훅이 기록한다.
 */

import type { Finding } from "../rules/types.ts";
import type { AssertionRule, Manifest } from "./core.ts";

/** 개인정보 원문 패턴. 우리는 애초에 추출하지 않지만, 새는지 검사한다. */
const PII_PATTERNS: AssertionRule[] = [
  { label: "주민등록번호", re: /\d{6}-?[1-4]\d{6}/ },
  { label: "외국인등록번호", re: /\d{6}-[5-8]\d{6}/ },
  { label: "전화번호", re: /01[016789]-\d{3,4}-\d{4}/ },
  { label: "계좌형 숫자열", re: /\d{11,}/ },
  { label: "여권번호", re: /\b[A-Za-z]\d{8}\b/ },
];

/** 판정 하나에서 사용자에게 보이는 모든 텍스트 */
const textOf = (f: Finding) =>
  [f.title, f.formula, f.basis, ...(f.questions ?? [])].filter(Boolean).join(" ");

/**
 * G1. 확정 표현은 "위법" 수준에만 허용한다.
 *
 * 위법은 반례가 없는 룰에만 붙는다. 확인필요·수령가능에 단정 표현이 섞이면
 * 사용자가 다투러 갔다가 근거 없이 돌아온다.
 */
export function guardAssertionLevel(f: Finding, rules: AssertionRule[]): string | null {
  if (f.level === "위법") return null;
  const hit = rules.filter((r) => r.re.test(textOf(f)));
  return hit.length
    ? `${f.rule}: ${f.level} 판정에 확정 표현 사용 (${hit.map((h) => h.label).join(", ")})`
    : null;
}

/**
 * G2. 수령불가에 금액을 붙이지 않는다.
 *
 * 없는 돈을 총액에 섞으면 그게 곧 거짓말이다. 근속 1년 미만이거나
 * 국민연금 미가입국이면 금액 자체가 존재하지 않는다.
 */
export function guardNoMoneyOnUnavailable(f: Finding): string | null {
  if (f.level !== "수령불가") return null;
  if (f.amount === undefined && f.amountRange === undefined) return null;
  return `${f.rule}: 수령불가 판정에 금액이 붙어 있습니다 (없는 돈을 약속하면 안 됩니다)`;
}

/**
 * G3. 추정 금액은 범위를 동반해야 한다.
 *
 * S2는 "앞으로 받을 돈"을 말한다. 확정값으로 제시하면 기대를 만들고,
 * 실제 수령액이 다르면 신뢰가 무너진다.
 */
export function guardEstimateHasRange(
  f: Finding,
  estimateRules: string[],
): string | null {
  if (!estimateRules.includes(f.rule)) return null;
  if (f.amount === undefined) return null;
  return f.amountRange
    ? null
    : `${f.rule}: 추정 금액인데 범위(amountRange)가 없습니다`;
}

/** G4. 근거 조문 없는 판정은 내보내지 않는다. */
export function guardHasBasis(f: Finding): string | null {
  return f.basis && f.basis.trim().length > 0
    ? null
    : `${f.rule}: 근거 조문이 비어 있습니다`;
}

/**
 * G5. 확인필요는 질문을 동반해야 한다.
 *
 * 되묻지 않으면 사용자는 무엇을 확인해야 할지 모른 채 막힌다.
 * "확인이 필요합니다"로 끝나는 판정은 판정이 아니다.
 */
export function guardQuestionOnUncertain(f: Finding): string | null {
  if (f.level !== "확인필요") return null;
  return f.questions?.length
    ? null
    : `${f.rule}: 확인필요 판정에 사용자가 확인할 질문이 없습니다`;
}

/** G6. 판정 텍스트에 개인정보 원문이 섞이면 차단한다. */
export function guardNoPII(f: Finding): string | null {
  const hit = PII_PATTERNS.filter((p) => p.re.test(textOf(f)));
  return hit.length
    ? `${f.rule}: 개인정보 의심 패턴 (${hit.map((h) => h.label).join(", ")})`
    : null;
}

/**
 * G7. 기한임박은 반드시 기한을 들고 있어야 한다.
 *
 * 급하다고만 말하고 언제까지인지 안 알려주면 아무 소용이 없다.
 */
export function guardDeadlineOnUrgent(f: Finding): string | null {
  if (f.level !== "기한임박") return null;
  return f.deadline
    ? null
    : `${f.rule}: 기한임박 판정에 마감일(deadline)이 없습니다`;
}

/**
 * G8. 룰 사이 모순 금지 — 한 판정이 "더 못 받는다"고 하면 다른 룰이 돈을 약속할 수 없다.
 *
 * 이 가드가 없던 때의 사고 — 2026-08-26, 골든셋 D03 이 드러냈다:
 * 출국 4년이 지나 보험금이 한국산업인력공단으로 넘어간 입력에서
 * S2-5 는 "소멸시효가 지났습니다(수령불가)" 라고 말하는데, 같은 결과 안에서
 * S2-1 이 "청구할 수 있습니다 · 4,000,000원 · 기한임박 D-1499",
 * S2-2 가 "청구할 수 있습니다 · 500,000원" 으로 함께 떴다. 총액 450만원.
 *
 * G2(수령불가에 금액 금지)가 이걸 못 잡은 이유는 단순하다 — **G2 는 판정 하나 안만 본다.**
 * 룰 일곱 개가 각자 옳아도 모아 놓으면 거짓말이 될 수 있다. 그 자리를 이 가드가 맡는다.
 *
 * ★ 갈래(track) 안에서만 본다. 처음 구현했을 때 갈래를 안 봤더니
 * "보험 시효 3년이 지났으니 국민연금 728만원도 거짓말이다"로 잡았다 — 연금 시효는 5년이라
 * 그 판정이 옳았다. **모순을 잡겠다고 사실을 지우면 그게 더 큰 손해다.**
 * 그래서 blocksClaims 는 자기 track 만 막는다.
 *
 * 막지 못하는 것: track 이 없는 판정끼리의 모순. S1(급여명세서)은 돈을 "받을 것"이 아니라
 * "이미 떼인 것"으로 말해서 갈래 개념이 없다. 거기 모순이 생기면 이 가드는 침묵한다.
 */
export function guardNoContradiction(findings: Finding[]): string[] {
  const 차단 = findings.filter((f) => f.blocksClaims && f.track);
  if (차단.length === 0) return [];

  return 차단.flatMap((b) =>
    findings
      .filter((f) => f.track === b.track && f.rule !== b.rule)
      .filter((f) => (f.amount ?? 0) > 0 || f.amountRange !== undefined)
      .filter((f) => f.level === "수령가능" || f.level === "기한임박")
      .map(
        (f) =>
          `${f.rule}: 같은 «${b.track}» 갈래의 ${b.rule} 이 청구 불가를 선언했는데 ` +
          `${f.level} 로 ${f.amount?.toLocaleString("ko-KR")}원을 약속합니다`,
      ),
  );
}

/* ─────────────────────────────── 전수 검사 ─────────────────────────────── */

/** 판정 배열 전체를 모든 가드레일에 통과시킨다. afterJudge 훅이 이걸 부른다. */
export function checkAllGuardrails(
  findings: Finding[],
  manifest: Manifest,
): string[] {
  const { forbiddenAssertions } = manifest.rules;
  const { estimateRules } = manifest.verification;

  return [
    // 판정 하나씩 보는 가드
    ...findings.flatMap((f) =>
      [
        guardAssertionLevel(f, forbiddenAssertions),
        guardNoMoneyOnUnavailable(f),
        guardEstimateHasRange(f, estimateRules),
        guardHasBasis(f),
        guardQuestionOnUncertain(f),
        guardNoPII(f),
        guardDeadlineOnUrgent(f),
      ].filter((v): v is string => v !== null),
    ),
    // 판정들을 한꺼번에 보는 가드 — 각자 옳아도 모으면 거짓말일 수 있다
    ...guardNoContradiction(findings),
  ];
}

/**
 * 가드레일 설명 — 「판정 방식 설명」 화면이 이걸 그대로 보여준다.
 * blocks 는 사용자가 읽는 문장이다(2026-09-02 평문화). 명사구·개발자 말투 금지 —
 * "무엇을 못 하게 하는지"를 한 문장으로.
 */
export const GUARDRAIL_CATALOG = [
  { id: "G1", name: "확정 표현 수준 제한", blocks: "'확인필요' 판정이 '위법입니다'처럼 단정하는 말을 쓰지 못하게 합니다." },
  { id: "G2", name: "수령불가에 금액 금지", blocks: "받을 수 없는 돈이 합계에 섞이지 않게 합니다." },
  { id: "G3", name: "추정에 범위 강제", blocks: "앞으로 받을 돈은 확정된 금액처럼 보여주지 않고 범위로만 보여줍니다." },
  { id: "G4", name: "근거 조문 필수", blocks: "근거가 되는 법 조문이 없는 지적은 내보내지 않습니다." },
  { id: "G5", name: "확인필요에 질문 필수", blocks: "'확인이 필요합니다'로만 끝나지 않도록, 무엇을 확인할지 질문을 붙입니다." },
  { id: "G6", name: "개인정보 패턴 차단", blocks: "주민번호·전화번호 같은 신원 정보가 판정 문장에 들어가지 않게 합니다." },
  { id: "G7", name: "기한임박에 마감일 필수", blocks: "급하다고만 하지 않고 마감일을 반드시 함께 보여줍니다." },
  { id: "G8", name: "룰 사이 모순 금지", blocks: "시효가 지났다고 하면서 같은 화면에서 돈을 약속하는 모순을 막습니다." },
] as const;

/** 판정 수준의 뜻 — 「판정 방식 설명」이 그대로 보여준다. 사용자가 읽는 문장이다 */
export const LEVEL_MEANING = [
  { level: "위법", meaning: "계산만으로 맞고 틀림이 분명하게 갈리는 경우입니다. 여섯 수준 가운데 '위반입니다'처럼 단정하는 표현을 쓸 수 있는 유일한 수준입니다." },
  { level: "기한임박", meaning: "마감일이 가까운 경우입니다. 언제까지인지 날짜를 반드시 함께 보여줍니다." },
  { level: "수령가능", meaning: "청구하면 받을 수 있는 돈이 있는 경우입니다. 금액이 아직 확정되지 않았으면 '약 얼마에서 얼마'처럼 범위로 보여줍니다." },
  { level: "확인필요", meaning: "정보가 더 있어야 판정할 수 있는 경우입니다. 무엇을 확인해야 하는지 질문으로 알려드립니다." },
  { level: "수령불가", meaning: "받을 돈이 없는 경우입니다. 금액을 표시하지 않고 합계에도 넣지 않습니다." },
  { level: "정상", meaning: "법 기준과 맞는 경우입니다. 문제가 없으므로 색을 입히지 않습니다." },
] as const;

/** 공통 금지 표현 — 하네스가 가져다 쓴다 */
export const COMMON_FORBIDDEN_ASSERTIONS: AssertionRule[] = [
  { label: "위법 단정", re: /위법입니다|불법입니다|명백한 위반/ },
  { label: "확실성 단정", re: /반드시 받을 수 있|틀림없이|100%|확실히 받/ },
  { label: "법률 자문투", re: /소송하세요|고소하세요|승소할 수 있/ },
];
