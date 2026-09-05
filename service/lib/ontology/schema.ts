/**
 * T-Box — 이 서비스가 다루는 개념의 계층·관계·제약.
 *
 * 왜 흐름도가 아닌가: 흐름도는 순서만 말한다. "무엇이 무엇과 절대 함께일 수 없는지"를
 * 그림 어디에도 적을 수 없다. 이 파일의 절반은 Axiom, 즉 제약이다.
 *
 * 이 파일이 막는 것: 화면과 문서가 코드에 없는 개념을 말하는 것.
 * 막지 못하면: 심사자가 "이 클래스는 어느 코드냐"고 물었을 때 답이 없고,
 *             한 번 지어낸 개념은 다음 사람이 진짜로 믿고 그 위에 쌓는다.
 * 장치: 모든 클래스와 관계가 `파일:심볼`을 들고 있고, schema.test.ts가 그 파일을
 *       readFileSync로 열어 심볼이 있는지 대조한다. 지어내면 테스트가 잡는다.
 *
 * 알려진 한계:
 *   - T-Box 만으로는 증명이 안 된다. 실행 하나를 개체로 푸는 A-Box(abox.ts)와
 *     그 대조 검사(validateABox)가 이 어휘가 실제 판정을 말해 준다는 것을 확인한다.
 *   - codeSource는 심볼이 그 파일에 있는지만 본다. 심볼이 실제로 그 뜻인지는 사람이 읽어야 한다.
 */

export type ClassId = string;
export type PropertyId = string;

/**
 * 색·자리 역할. 색만으로 구분하지 않으므로 보조 단서다.
 * 앞 3묶음이 입력, 가운데 3묶음이 산출, 뒤 2묶음이 제약과 통제다.
 */
export type ClassRole = "입력" | "산출" | "제약" | "통제";

export interface OntologyClass {
  id: ClassId;
  /** 화면에 보이는 이름. 쉬운 말. 20자 이하 */
  label: string;
  /** null이면 최상위 */
  parent: ClassId | null;
  role: ClassRole;
  layer: 1 | 2 | 3 | 4 | 5;
  /** ★ '파일:심볼' — 실재해야 한다. 테스트가 파일을 연다 */
  codeSource: string;
  /** 전문 설명. 라벨은 쉽게, 어려운 말과 사고 기록은 여기로 */
  note: string;
}

export interface ObjectProperty {
  id: PropertyId;
  /** 선 위 라벨 상자에 들어가는 관계 이름 */
  label: string;
  domain: ClassId;
  range: ClassId;
  codeSource: string;
  /** 실행 흐름이 아니라 근거 인용이면 true — 화면이 점선으로 그린다 */
  evidential?: boolean;
}

export interface DataProperty {
  id: PropertyId;
  label: string;
  domain: ClassId;
  datatype: string;
  /** 이 값의 범위를 정한 규칙. 있으면 단순 값이 아니라 제약이다 */
  clause?: string;
}

export interface Axiom {
  kind: "disjointWith" | "equivalentClass" | "functional";
  left: ClassId;
  /** functional이면 속성 id */
  right: ClassId;
  /** ★ 추상 설명이 아니라 '이 제약이 막는 사고' */
  why: string;
  /** ★ 실제로 강제하는 파일. 없으면 null. 정직성 장치 */
  enforcedBy: string | null;
}

/* ─────────────────────────────── 클래스 ─────────────────────────────── */

/**
 * 최상위 8묶음. 순서를 바꾸지 마라 — 화면이 이 순서를 그대로 좌→우로 쓴다.
 *   1~3 들어온 것 · 4~6 만든 것 · 7~8 검사하고 멈추는 것
 */
export const CLASSES: OntologyClass[] = [
  /* ── 1. 들어온 것: 상담 발화 ── */
  {
    id: "utterance",
    label: "상담 발화",
    parent: null,
    role: "입력",
    layer: 1,
    codeSource: "lib/skills.ts:routeByKeyword",
    note: "사용자가 실제로 하는 말입니다. 이 말을 보고 어느 검사로 보낼지 정합니다. 하나로 단정하지 않고 후보를 점수 순으로 모두 남깁니다. 애매한 말을 억지로 한쪽에 넣으면 엉뚱한 질문을 하게 되기 때문입니다.",
  },
  {
    id: "utterance.keyword",
    label: "발화 키워드",
    parent: "utterance",
    role: "입력",
    layer: 2,
    codeSource: "lib/skills.ts:SkillMeta('triggers')",
    note: "스킬마다 붙은 방아쇠 단어. '떼', '못 받' 같은 조각까지 넣은 이유는 사용자가 '최저임금'이라는 말을 모른 채 '월급이 이상해요'라고만 말하기 때문이다.",
  },
  {
    id: "utterance.candidate",
    label: "고른 스킬 후보",
    parent: "utterance",
    role: "입력",
    layer: 2,
    codeSource: "lib/skills.ts:RouteResult",
    note: "점수와 함께 어떤 단어가 걸렸는지도 들고 다닌다. 근거를 못 보여주는 라우팅은 심사자가 검증할 수 없다.",
  },
  {
    id: "utterance.clarify",
    label: "되묻기",
    parent: "utterance",
    role: "입력",
    layer: 2,
    codeSource: "lib/skills.ts:needsClarification",
    note: "후보가 없거나 1·2위 점수가 같으면 되묻는다. 되묻기를 뺐을 때 '고향에 돌아가는데 월급이 이상해요' 같은 말이 한쪽으로 끌려가 엉뚱한 질문지를 받았다.",
  },
  {
    id: "utterance.case",
    label: "상담 사례",
    parent: "utterance",
    role: "입력",
    layer: 2,
    codeSource: "lib/cases.ts:cases",
    note: "전부 합성 데이터다. 실제 상담 기록을 넣으면 개인정보가 저장소에 들어간다. 라우팅에 일부러 실패하는 사례를 하나 남겨 둔 이유는, 실패 케이스가 큐 안에 없으면 되묻는 동작을 아무도 못 보기 때문이다.",
  },

  /* ── 2. 들어온 것: 급여명세서 ── */
  {
    id: "payslip",
    label: "급여명세서",
    parent: null,
    role: "입력",
    layer: 1,
    codeSource: "lib/rules/payslip.ts:Payslip",
    note: "지급 항목, 공제 항목, 근로시간, 사업장 규모 네 부분으로 이루어집니다. 사진이 아니라 이미 정리된 값이 들어온다고 봅니다.",
  },
  {
    id: "payslip.earning",
    label: "지급 항목",
    parent: "payslip",
    role: "입력",
    layer: 2,
    codeSource: "lib/rules/payslip.ts:Payslip('earnings')",
    note: "연장·야간·휴일 가산수당은 최저임금 산입에서 빠진다. 이걸 빼지 않고 총지급액을 시간으로 나누면 잔업을 많이 한 달일수록 최저임금을 넘긴 것처럼 보여 미달을 놓친다.",
  },
  {
    id: "payslip.deduction",
    label: "공제 항목",
    parent: "payslip",
    role: "입력",
    layer: 2,
    codeSource: "lib/rules/payslip.ts:Payslip('deductions')",
    note: "이름 표기가 회사마다 달라 정규식으로 흡수한다. 알려진 패턴에 하나도 안 걸리는 공제가 실전에서 가장 자주 나온다.",
  },
  {
    id: "payslip.deduction.sanjae",
    label: "산재보험 공제",
    parent: "payslip.deduction",
    role: "입력",
    layer: 3,
    codeSource: "lib/rules/constants-2026.ts:공제항목패턴('산재보험')",
    note: "산재보험료는 사업주가 전액 부담한다. 근로자 공제란에 있으면 금액이 얼마든 사업장 규모가 얼마든 위법이다. 반례가 없어 오탐이 나올 수 없는 유일한 자리다.",
  },
  {
    id: "payslip.deduction.social",
    label: "사회보험 공제",
    parent: "payslip.deduction",
    role: "입력",
    layer: 3,
    codeSource: "lib/rules/payslip.ts:checkInsuranceRates",
    note: "4대보험의 기준은 이번 달 지급액이 아니라 전년도에 신고한 보수월액이다. 이번 달 총지급액으로 요율을 나눠 보던 때는 잔업이 있는 달마다 네 항목이 전부 불일치로 떴다.",
  },
  {
    id: "payslip.deduction.social.health",
    label: "건강보험료",
    parent: "payslip.deduction.social",
    role: "입력",
    layer: 4,
    codeSource: "lib/rules/constants-2026.ts:공제항목패턴('건강보험')",
    note: "건강보험은 상·하한 캡이 없는 단순 정률이라 보수월액을 역산할 수 있다. 그래서 이 항목을 기준점으로 삼고 나머지 셋을 서로의 비율로 검증한다. 기준점이 없으면 대조를 아예 하지 않는다 — 침묵하는 편이 틀리게 말하는 것보다 낫다.",
  },
  {
    id: "payslip.deduction.lodging",
    label: "숙식비 공제",
    parent: "payslip.deduction",
    role: "입력",
    layer: 3,
    codeSource: "lib/rules/constants-2026.ts:공제항목패턴('숙식비')",
    note: "모국어 서면동의서가 없으면 사전 공제가 안 된다. 그런데 동의서가 있었는지는 명세서만 봐서는 모른다. 그래서 금액을 지적하되 확정하지 않고 질문 세 개를 돌려준다.",
  },
  {
    id: "payslip.deduction.unknown",
    label: "근거 없는 공제",
    parent: "payslip.deduction",
    role: "입력",
    layer: 3,
    codeSource: "lib/rules/payslip.ts:checkUnknownDeduction",
    note: "알려진 패턴 어디에도 안 걸리는 공제. 이름이 무엇이든 근거를 서면으로 요구할 수 있다.",
  },
  {
    id: "payslip.hours",
    label: "근로시간",
    parent: "payslip",
    role: "입력",
    layer: 2,
    codeSource: "lib/rules/payslip.ts:Payslip('hours')",
    note: "소정근로시간이 없으면 월 209시간으로 본다. 연장·야간 시간이 아예 없으면 명세서 필수 기재사항이 빠진 것이라 별도로 지적한다.",
  },
  {
    id: "payslip.size",
    label: "사업장 규모",
    parent: "payslip",
    role: "입력",
    layer: 2,
    codeSource: "lib/rules/payslip.ts:WorkplaceSize",
    note: "5인 미만 사업장은 연장 가산수당 규정이 적용되지 않는다. 명세서에는 이 값이 안 적혀 있어 사용자에게 직접 묻는다.",
  },
  {
    id: "payslip.size.unknown",
    label: "규모 모름",
    parent: "payslip.size",
    role: "입력",
    layer: 3,
    codeSource: "lib/rules/payslip.ts:WorkplaceSize('모름')",
    note: "규모를 모르면 연장수당 부족을 위법으로 내리지 않고 되묻는다. 이 분기를 빼면 5인 미만 사업장 근로자에게 없는 권리를 있다고 말하게 되고, 오탐의 대가는 사업장 변경 횟수가 제한된 E-9 근로자가 치른다.",
  },

  /* ── 3. 들어온 것: 출국 조건 ── */
  {
    id: "departure",
    label: "출국 조건",
    parent: null,
    role: "입력",
    layer: 1,
    codeSource: "lib/rules/departure.ts:DepartureInput",
    note: "국적, 체류자격, 입사일, 출국일, 월평균임금입니다. 월평균임금은 급여명세서 검사에서 계산한 값을 그대로 쓸 수 있습니다.",
  },
  {
    id: "departure.visa",
    label: "체류자격",
    parent: "departure",
    role: "입력",
    layer: 2,
    codeSource: "lib/rules/departure.ts:Visa",
    note: "출국만기보험과 귀국비용보험은 체류자격으로 대상이 갈린다. 대상이 아니면 판정을 만들지 않는다.",
  },
  {
    id: "departure.visa.insured",
    label: "보험 대상 자격",
    parent: "departure.visa",
    role: "입력",
    layer: 3,
    codeSource: "lib/rules/departure.ts:Visa('E-9')",
    note: "고용허가제로 들어온 자격. 반환일시금 수급권이 국민연금법 특례로 이미 보장돼 있어, 판정할 것은 자격이 아니라 '애초에 냈는가'뿐이다.",
  },
  {
    id: "departure.nationality",
    label: "국적",
    parent: "departure",
    role: "입력",
    layer: 2,
    codeSource: "lib/rules/departure.ts:연금납부여부",
    note: "출국 정산에서 가장 크게 갈리는 분기. 같은 근속·같은 임금이어도 국적 하나로 받을 돈이 수백만 원 달라진다.",
  },
  {
    id: "departure.nationality.excluded",
    label: "연금 적용제외국",
    parent: "departure.nationality",
    role: "입력",
    layer: 3,
    codeSource: "lib/rules/constants-departure.ts:국민연금_사업장_적용제외국",
    note: "여기 있으면 애초에 납부한 적이 없어 반환일시금도 없다. 금액을 붙이지 않는다.",
  },
  {
    id: "departure.nationality.treaty",
    label: "협정 면제국",
    parent: "departure.nationality",
    role: "입력",
    layer: 3,
    codeSource: "lib/rules/constants-departure.ts:국민연금_협정면제_E9",
    note: "사회보장협정으로 보험료가 면제되는 국가. 공단 원본에 'E-9은 가입증명서 제출 없이 면제'로 적힌 것만 넣었다.",
  },
  {
    id: "departure.nationality.paid",
    label: "연금 납부 확인국",
    parent: "departure.nationality",
    role: "입력",
    layer: 3,
    codeSource: "lib/rules/constants-departure.ts:국민연금_납부_확인국",
    note: "2차 출처를 믿고 '베트남은 국민연금 미가입'이라고 쓸 뻔했다. 공단 원본 PDF가 그 서술을 뒤집었다. 그대로 나갔으면 한 사람당 700만 원짜리 오답이었다.",
  },
  {
    id: "departure.nationality.unlisted",
    label: "명단 밖 국적",
    parent: "departure.nationality",
    role: "입력",
    layer: 3,
    codeSource: "lib/rules/departure.ts:연금상태('미확인')",
    note: "세 명단 어디에도 없으면 단정하지 않고 국민연금공단 1355로 보낸다. 명단이 134개국을 다 덮지 못한다는 사실을 화면에 그대로 드러낸다.",
  },
  {
    id: "departure.tenure",
    label: "근속 기간",
    parent: "departure",
    role: "입력",
    layer: 2,
    codeSource: "lib/rules/departure.ts:monthsBetween",
    note: "근속 1년 미만이면 출국만기보험 일시금이 사업주에게 귀속된다. 이 분기가 없으면 못 받는 사람에게 돈을 약속하게 된다. 일자가 모자라면 한 달 빼서 센다.",
  },
  {
    id: "departure.today",
    label: "기준일",
    parent: "departure",
    role: "입력",
    layer: 2,
    codeSource: "lib/rules/departure.ts:DepartureInput('today')",
    note: "판정 함수가 시각을 스스로 읽지 않고 주입받는다. 안 그러면 같은 입력이 어제와 오늘 다른 D-day를 내고, 회귀 판정이 불가능해진다.",
  },

  /* ── 4. 만든 것: 판정 ── */
  {
    id: "verdict",
    label: "판정",
    parent: null,
    role: "산출",
    layer: 1,
    codeSource: "lib/rules/types.ts:Finding",
    note: "이 서비스가 만드는 결과는 모두 이 한 가지 형태입니다. 검사 항목이 늘어도 화면, 다국어 설명, 금액 합계, 검증 화면을 그대로 다시 씁니다.",
  },
  {
    id: "verdict.level",
    label: "판정 수준",
    parent: "verdict",
    role: "산출",
    layer: 2,
    codeSource: "lib/rules/types.ts:Level",
    note: "여섯 가지가 전부다. 타입에는 있는데 화면 표에 없는 값이 하나라도 생기면, 그 수준의 판정만 아무 표시 없이 조용히 빠진다.",
  },
  {
    id: "verdict.level.illegal",
    label: "위법",
    parent: "verdict.level",
    role: "산출",
    layer: 3,
    codeSource: "lib/harness/guardrails.ts:LEVEL_MEANING('위법')",
    note: "계산으로 참·거짓이 갈리고 반례가 없을 때만 붙인다. 확정 표현을 써도 되는 유일한 수준이다.",
  },
  {
    id: "verdict.level.check",
    label: "확인필요",
    parent: "verdict.level",
    role: "산출",
    layer: 3,
    codeSource: "lib/harness/guardrails.ts:LEVEL_MEANING('확인필요')",
    note: "추가 정보가 있어야 판정된다. 질문을 안 돌려주면 사용자는 무엇을 확인해야 할지 모른 채 막힌다. '확인이 필요합니다'로 끝나는 것은 판정이 아니다.",
  },
  {
    id: "verdict.level.ok",
    label: "정상",
    parent: "verdict.level",
    role: "산출",
    layer: 3,
    codeSource: "lib/harness/guardrails.ts:LEVEL_MEANING('정상')",
    note: "기준과 일치한다. 색을 주지 않는다. 문제가 없다는 사실도 화면에 남겨야 사용자가 '검사를 했다'는 것을 안다.",
  },
  {
    id: "verdict.level.urgent",
    label: "기한임박",
    parent: "verdict.level",
    role: "산출",
    layer: 3,
    codeSource: "lib/harness/guardrails.ts:LEVEL_MEANING('기한임박')",
    note: "목록 맨 위로 올라간다. 급하다고만 말하고 언제까지인지 안 알려주면 아무 소용이 없어서, 날짜를 반드시 함께 낸다.",
  },
  {
    id: "verdict.level.claimable",
    label: "수령가능",
    parent: "verdict.level",
    role: "산출",
    layer: 3,
    codeSource: "lib/harness/guardrails.ts:LEVEL_MEANING('수령가능')",
    note: "청구할 수 있는 돈이 있다. 앞으로 받을 돈이라 확정값처럼 내면 안 되고 범위로 낸다.",
  },
  {
    id: "verdict.level.none",
    label: "수령불가",
    parent: "verdict.level",
    role: "산출",
    layer: 3,
    codeSource: "lib/harness/guardrails.ts:LEVEL_MEANING('수령불가')",
    note: "받을 것이 없다. 금액을 붙이지 않고 총액에도 넣지 않는다. 없는 돈이 총액에 섞이면 사용자는 못 받을 돈을 세고 공항에 간다.",
  },
  {
    id: "verdict.payslip",
    label: "급여 판정",
    parent: "verdict",
    role: "산출",
    layer: 2,
    codeSource: "lib/rules/payslip.ts:judgePayslip",
    note: "이미 떼인 돈을 말한다. 순수 함수라 같은 명세서면 항상 같은 판정이 나온다.",
  },
  {
    id: "verdict.payslip.sanjae",
    label: "산재 공제 판정",
    parent: "verdict.payslip",
    role: "산출",
    layer: 3,
    codeSource: "lib/rules/payslip.ts:checkSanjae",
    note: "반례가 없어 오탐이 0인 유일한 룰. 다른 룰이 애매할 때 이 룰이 기준선 노릇을 한다.",
  },
  {
    id: "verdict.payslip.minwage",
    label: "최저임금 판정",
    parent: "verdict.payslip",
    role: "산출",
    layer: 3,
    codeSource: "lib/rules/payslip.ts:checkMinWage",
    note: "가산수당을 뺀 금액만 시간으로 나눈다. 미달이면 부족분을 원 단위로 낸다.",
  },
  {
    id: "verdict.payslip.overtime",
    label: "연장수당 판정",
    parent: "verdict.payslip",
    role: "산출",
    layer: 3,
    codeSource: "lib/rules/payslip.ts:checkOvertime",
    note: "사업장 규모를 모르면 위법이 아니라 확인필요로 내린다. 5인 미만이면 애초에 가산수당 규정이 적용되지 않기 때문이다.",
  },
  {
    id: "verdict.departure",
    label: "출국 판정",
    parent: "verdict",
    role: "산출",
    layer: 2,
    codeSource: "lib/rules/departure.ts:judgeDeparture",
    note: "앞으로 받을 돈을 말한다. 부풀리면 기대를 만들고, 못 받으면 신뢰가 무너진다. 그래서 위법 같은 확정 표현을 쓰지 않는다.",
  },
  {
    id: "verdict.departure.severance",
    label: "출국만기보험 판정",
    parent: "verdict.departure",
    role: "산출",
    layer: 3,
    codeSource: "lib/rules/departure.ts:checkSeveranceInsurance",
    note: "사업주가 매월 납입한 돈. 근속 1년 미만이면 사업주에게 귀속되므로 금액 없이 수령불가로 내린다.",
  },
  {
    id: "verdict.departure.returncost",
    label: "귀국비용보험 판정",
    parent: "verdict.departure",
    role: "산출",
    layer: 3,
    codeSource: "lib/rules/departure.ts:checkReturnCostInsurance",
    note: "근로자 본인이 입국 3개월 안에 낸 돈이다. 사업주가 낸 것으로 아는 사람이 많아 아예 안 찾아가는 경우가 있다.",
  },
  {
    id: "verdict.departure.pension",
    label: "연금 반환 판정",
    parent: "verdict.departure",
    role: "산출",
    layer: 3,
    codeSource: "lib/rules/departure.ts:checkPensionRefund",
    note: "본인 부담분과 사업주 부담분을 모두 돌려받는다. 이자는 월별 단리라 평균 경과기간으로 근사하며, 정확한 금액은 개인 납부이력이 있어야 나온다.",
  },

  /* ── 5. 만든 것: 금액과 기한 ── */
  {
    id: "money",
    label: "금액과 기한",
    parent: null,
    role: "산출",
    layer: 1,
    codeSource: "lib/rules/types.ts:recoverableTotal",
    note: "합계를 낼 때 정상과 수령불가 판정은 세지 않습니다. 이 둘을 빼지 않으면 받을 수 없는 돈이 합계에 섞입니다.",
  },
  {
    id: "money.amount",
    label: "확정 금액",
    parent: "money",
    role: "산출",
    layer: 2,
    codeSource: "lib/rules/types.ts:Finding('amount')",
    note: "기준값과의 차이라 계산으로 확정되는 값. 급여명세서 쪽 금액이 여기에 해당한다.",
  },
  {
    id: "money.range",
    label: "추정 금액 범위",
    parent: "money",
    role: "산출",
    layer: 2,
    codeSource: "lib/rules/types.ts:Finding('amountRange')",
    note: "출국 정산은 임금·근속으로 계산한 추정값이다. 적립분과 법정 퇴직금이 다르므로 둘을 최소·최대로 함께 보여준다.",
  },
  {
    id: "money.deadline",
    label: "기한",
    parent: "money",
    role: "산출",
    layer: 2,
    codeSource: "lib/rules/types.ts:Deadline",
    note: "남은 날이 음수면 이미 지난 것이다. 지난 기한도 지우지 않고 그대로 보여준다 — 지나갔다는 것도 정보다.",
  },
  {
    id: "money.deadline.claim",
    label: "보험 청구 마감",
    parent: "money.deadline",
    role: "산출",
    layer: 3,
    codeSource: "lib/rules/constants-departure.ts:기한('보험청구_출국전_일')",
    note: "출국 7일 전. 법정 기한이 아니라 실무 절차인데, 이걸 놓치면 출국 후 절차가 훨씬 복잡해진다. 사용자는 자기가 무엇을 놓치는지 모른다.",
  },
  {
    id: "money.deadline.expiry",
    label: "소멸시효",
    parent: "money.deadline",
    role: "산출",
    layer: 3,
    codeSource: "lib/rules/constants-departure.ts:기한('보험_소멸시효_년')",
    note: "보험금은 3년, 국민연금은 국외이주 사유로 5년. 3년이 지나면 한국산업인력공단 휴면보험금으로 넘어가지만 사라지지는 않는다.",
  },

  /* ── 6. 만든 것: 근거 인용 ── */
  {
    id: "evidence",
    label: "근거 인용",
    parent: null,
    role: "산출",
    layer: 1,
    codeSource: "lib/standards.ts:standards",
    note: "판정이 대조하는 문서 목록입니다. 문서마다 어디까지 확인했는지 함께 보여 주려고 둡니다.",
  },
  {
    id: "evidence.clause",
    label: "근거 조문",
    parent: "evidence",
    role: "산출",
    layer: 2,
    codeSource: "lib/rules/types.ts:Finding('basis')",
    note: "조문이 비어 있는 판정은 내보내지 않는다. 사용자가 사업주 앞에서 들이밀 것이 없으면 판정은 아무 힘이 없다.",
  },
  {
    id: "evidence.state",
    label: "검증 상태",
    parent: "evidence",
    role: "산출",
    layer: 2,
    codeSource: "lib/standards.ts:VerifyState",
    note: "원본확인·2차출처·판례 세 가지. 어디까지 확인했는지를 화면에 그대로 띄운다.",
  },
  {
    id: "evidence.state.primary",
    label: "원본으로 확인함",
    parent: "evidence.state",
    role: "산출",
    layer: 3,
    codeSource: "lib/standards.ts:VerifyState('원본확인')",
    note: "법령·고시·공단 원문을 직접 읽고 상수를 확정한 것. 현재 10건 중 1건뿐이라는 사실도 숨기지 않는다.",
  },
  {
    id: "evidence.state.secondary",
    label: "2차 출처",
    parent: "evidence.state",
    role: "산출",
    layer: 3,
    codeSource: "lib/standards.ts:VerifyState('2차출처')",
    note: "언론·요약을 근거로 넣은 것. 숨기면 부채가 되고 띄워두면 할 일 목록이 된다. 실제로 이 표시를 따라가 원본을 읽고서야 700만 원짜리 오답을 잡았다.",
  },

  /* ── 7. 검사하고 멈추는 것: 법정 제약 ── */
  {
    id: "statute",
    label: "법정 제약",
    parent: null,
    role: "제약",
    layer: 1,
    codeSource: "lib/rules/constants-2026.ts:기준2026",
    note: "판정 코드는 숫자를 직접 쓰지 않고 여기 있는 기준값만 읽습니다. 1년에 한 번 여기만 고치면 됩니다. 반대로 여기가 틀리면 서비스 전체가 틀린 금액을 말하게 됩니다.",
  },
  {
    id: "statute.minwage",
    label: "최저임금 기준",
    parent: "statute",
    role: "제약",
    layer: 2,
    codeSource: "lib/rules/constants-2026.ts:기준2026('최저임금_시급')",
    note: "고용노동부 고시로 매년 바뀐다. 월 환산은 주 40시간에 유급주휴 8시간을 더한 209시간을 쓴다.",
  },
  {
    id: "statute.rate",
    label: "보험 요율",
    parent: "statute",
    role: "제약",
    layer: 2,
    codeSource: "lib/rules/constants-2026.ts:기준2026('건강보험_근로자')",
    note: "요율은 총액 기준과 근로자 부담분이 다르다. 둘을 섞으면 공제액이 두 배로 계산되므로 상수 이름에 부담 주체를 적어 둔다.",
  },
  {
    id: "statute.rate.tolerance",
    label: "요율 허용오차",
    parent: "statute.rate",
    role: "제약",
    layer: 3,
    codeSource: "lib/rules/constants-2026.ts:기준2026('요율_허용오차')",
    note: "보수월액이 전년도 신고 기준이라 이번 달 금액과 어긋난다. 이 오차를 넘어도 위법이 아니라 확인필요로 내린다 — 여기서 단정하면 정상 명세서가 위법으로 뜬다.",
  },
  {
    id: "statute.departure",
    label: "출국 정산 기준값",
    parent: "statute",
    role: "제약",
    layer: 2,
    codeSource: "lib/rules/constants-departure.ts:출국만기보험_납입률",
    note: "사업주가 매월 넣는 비율. 이 적립분이 법정 퇴직금보다 적으면 차액은 보험사가 아니라 사업주에게 따로 청구해야 한다.",
  },
  {
    id: "statute.departure.pension",
    label: "연금 요율표",
    parent: "statute.departure",
    role: "제약",
    layer: 3,
    codeSource: "lib/rules/constants-departure.ts:국민연금_요율_연도별",
    note: "2026년부터 2033년까지 매년 0.5%p씩 오른다. 근속 기간을 연도별로 훑어야 하며, 한 요율로 뭉뚱그리면 여러 해 일한 사람의 금액이 어긋난다.",
  },

  /* ── 8. 검사하고 멈추는 것: 가드레일과 훅 ── */
  {
    id: "control",
    label: "가드레일과 훅",
    parent: null,
    role: "통제",
    layer: 1,
    codeSource: "lib/harness/core.ts:Manifest",
    note: "지켜야 할 규칙을 문서가 아니라 실행되는 코드로 강제하는 자리입니다. 규칙 묶음마다 어떤 자동 점검이 반드시 있어야 하는지도 여기에 적혀 있습니다.",
  },
  {
    id: "control.guard",
    label: "가드레일",
    parent: "control",
    role: "통제",
    layer: 2,
    codeSource: "lib/harness/guardrails.ts:checkAllGuardrails",
    note: "판정이 사용자에게 나가기 전 마지막 관문. 일곱 개를 전수로 돌리고 걸린 것을 전부 모아서 돌려준다 — 첫 위반에서 멈추면 고치고 돌리기를 반복하게 된다.",
  },
  {
    id: "control.guard.assertion",
    label: "확정 표현 제한",
    parent: "control.guard",
    role: "통제",
    layer: 3,
    codeSource: "lib/harness/guardrails.ts:guardAssertionLevel",
    note: "'위법입니다'를 위법 수준이 아닌 판정이 쓰는 것을 막는다. 막지 못하면 사용자가 근거 없이 다투러 갔다가 그대로 돌아온다.",
  },
  {
    id: "control.guard.money",
    label: "수령불가 금액 금지",
    parent: "control.guard",
    role: "통제",
    layer: 3,
    codeSource: "lib/harness/guardrails.ts:guardNoMoneyOnUnavailable",
    note: "받을 수 없다고 말하면서 금액을 붙이는 것을 막는다. 근속 1년 미만이나 연금 미가입국이면 금액 자체가 존재하지 않는다.",
  },
  {
    id: "control.guard.range",
    label: "추정에 범위 강제",
    parent: "control.guard",
    role: "통제",
    layer: 3,
    codeSource: "lib/harness/guardrails.ts:guardEstimateHasRange",
    note: "추정 룰 목록에 든 룰이 금액을 확정값 하나로 내는 것을 막는다. 목록에 오타가 나면 이 가드가 조용히 꺼지므로, 하네스 자체검증이 목록의 룰 번호가 카탈로그에 실재하는지 따로 본다.",
  },
  {
    id: "control.hook",
    label: "실행 훅",
    parent: "control",
    role: "통제",
    layer: 2,
    codeSource: "lib/harness/core.ts:runHooks",
    note: "판정 전·후·설명 전 세 지점에서 돈다. 로그에 시각 대신 순번을 쓰는 이유는, 시각을 넣으면 같은 입력에 다른 로그가 남아 심사자가 두 번 눌렀을 때 결과가 달라 보이기 때문이다.",
  },
  {
    id: "control.selftest",
    label: "자체 검증",
    parent: "control",
    role: "통제",
    layer: 2,
    codeSource: "lib/harness/core.ts:runSelfTest",
    note: "하네스가 계약대로 구성됐는지만 본다. 판정 내용은 가드레일이 맡는다. 실동작 에이전트가 하나도 없는 하네스를 등록하는 것도 여기서 걸린다.",
  },
];

/* ─────────────────────────────── 관계 ─────────────────────────────── */

export const OBJECT_PROPERTIES: ObjectProperty[] = [
  {
    id: "p.routes",
    label: "스킬을 고른다",
    domain: "utterance",
    range: "utterance.candidate",
    codeSource: "lib/skills.ts:routeByKeyword",
  },
  {
    id: "p.asks-back",
    label: "애매하면 되묻는다",
    domain: "utterance.candidate",
    range: "utterance.clarify",
    codeSource: "lib/skills.ts:needsClarification",
  },
  {
    id: "p.case-utters",
    label: "사례가 말을 준다",
    domain: "utterance.case",
    range: "utterance",
    codeSource: "lib/cases.ts:Case('utterance')",
  },
  {
    id: "p.judge-payslip",
    label: "명세서를 판정한다",
    domain: "payslip",
    range: "verdict.payslip",
    codeSource: "lib/rules/payslip.ts:judgePayslip",
  },
  {
    id: "p.judge-departure",
    label: "출국 조건을 판정한다",
    domain: "departure",
    range: "verdict.departure",
    codeSource: "lib/rules/departure.ts:judgeDeparture",
  },
  {
    id: "p.find-sanjae",
    label: "산재 공제를 찾는다",
    domain: "payslip",
    range: "verdict.payslip.sanjae",
    codeSource: "lib/rules/payslip.ts:checkSanjae",
  },
  {
    id: "p.find-minwage",
    label: "최저임금을 대조한다",
    domain: "payslip",
    range: "verdict.payslip.minwage",
    codeSource: "lib/rules/payslip.ts:checkMinWage",
  },
  {
    id: "p.find-overtime",
    label: "연장수당을 대조한다",
    domain: "payslip",
    range: "verdict.payslip.overtime",
    codeSource: "lib/rules/payslip.ts:checkOvertime",
  },
  {
    // range를 '연장수당 판정'으로 좁히지 않는다. checkOvertime은 규모를 모를 때
    // 확인필요를 내지만, 다른 룰도 같은 수준을 낸다. 코드가 하나로 다루는 것을
    // 온톨로지만 쪼개면 온톨로지가 코드보다 정밀한 척하게 된다.
    id: "p.size-downgrades",
    label: "모르면 확인필요로 내린다",
    domain: "payslip.size.unknown",
    range: "verdict.level.check",
    codeSource: "lib/rules/payslip.ts:checkOvertime('모름')",
  },
  {
    id: "p.anchor-rate",
    label: "기준점으로 역산한다",
    domain: "payslip.deduction.social.health",
    range: "statute.rate",
    codeSource: "lib/rules/payslip.ts:checkInsuranceRates('추정보수월액')",
  },
  {
    id: "p.nationality-branches",
    label: "국적이 갈래를 정한다",
    domain: "departure.nationality",
    range: "verdict.departure.pension",
    codeSource: "lib/rules/departure.ts:연금납부여부",
  },
  {
    id: "p.unlisted-asks",
    label: "명단에 없으면 되묻는다",
    domain: "departure.nationality.unlisted",
    range: "verdict.level.check",
    codeSource: "lib/rules/departure.ts:checkPensionRefund('미확인')",
  },
  {
    id: "p.tenure-blocks",
    label: "1년 미만이면 막는다",
    domain: "departure.tenure",
    range: "verdict.level.none",
    codeSource: "lib/rules/departure.ts:checkSeveranceInsurance('수령불가')",
  },
  {
    id: "p.today-fixes",
    label: "기준일이 D-day를 정한다",
    domain: "departure.today",
    range: "money.deadline",
    codeSource: "lib/rules/departure.ts:오늘",
  },
  {
    id: "p.has-level",
    label: "수준을 붙인다",
    domain: "verdict",
    range: "verdict.level",
    codeSource: "lib/rules/types.ts:Finding('level')",
  },
  {
    id: "p.has-amount",
    label: "금액을 낸다",
    domain: "verdict",
    range: "money.amount",
    codeSource: "lib/rules/types.ts:recoverableTotal",
  },
  {
    id: "p.has-range",
    label: "추정이면 범위로 낸다",
    domain: "verdict.departure",
    range: "money.range",
    codeSource: "lib/rules/departure.ts:Finding('amountRange')",
  },
  {
    id: "p.has-deadline",
    label: "기한을 붙인다",
    domain: "verdict",
    range: "money.deadline",
    codeSource: "lib/rules/types.ts:Finding('deadline')",
  },
  {
    id: "p.cites",
    label: "조문을 인용한다",
    domain: "verdict",
    range: "evidence.clause",
    codeSource: "lib/rules/types.ts:Finding('basis')",
    evidential: true,
  },
  {
    id: "p.shows-state",
    label: "검증 상태를 밝힌다",
    domain: "evidence",
    range: "evidence.state",
    codeSource: "lib/standards.ts:Standard('state')",
    evidential: true,
  },
  {
    id: "p.statute-fixes",
    label: "기준값이 판정을 정한다",
    domain: "statute",
    range: "verdict",
    codeSource: "lib/rules/payslip.ts:기준2026",
    evidential: true,
  },
  {
    id: "p.guards",
    label: "판정을 검사한다",
    domain: "control.guard",
    range: "verdict",
    codeSource: "lib/harness/guardrails.ts:checkAllGuardrails",
  },
  {
    id: "p.hook-runs-guard",
    label: "훅이 가드를 부른다",
    domain: "control.hook",
    range: "control.guard",
    codeSource: "lib/harness/registry.ts:guardrailHook",
  },
  {
    id: "p.guard-blocks-money",
    label: "없는 돈을 막는다",
    domain: "control.guard.money",
    range: "money.amount",
    codeSource: "lib/harness/guardrails.ts:guardNoMoneyOnUnavailable",
  },
  {
    id: "p.guard-needs-range",
    label: "범위를 요구한다",
    domain: "control.guard.range",
    range: "money.range",
    codeSource: "lib/harness/guardrails.ts:guardEstimateHasRange",
  },
  {
    id: "p.guard-limits-word",
    label: "확정 표현을 가둔다",
    domain: "control.guard.assertion",
    range: "verdict.level.illegal",
    codeSource: "lib/harness/guardrails.ts:guardAssertionLevel",
  },
  {
    id: "p.selftest-checks",
    label: "하네스 구성을 본다",
    domain: "control.selftest",
    range: "control",
    codeSource: "lib/harness/core.ts:runSelfTest",
  },
];

export const DATA_PROPERTIES: DataProperty[] = [
  {
    id: "d.rule",
    label: "룰 번호",
    domain: "verdict",
    datatype: "string",
    clause: "급여 11개(A1~A8·B1·B3·C1) + 출국 5개(S2-1~S2-5). 화면·문서·테스트가 이 번호로 서로를 참조한다.",
  },
  {
    id: "d.level",
    label: "판정 수준",
    domain: "verdict",
    datatype: "Level",
    clause: "여섯 가지만 허용. 심각도 정렬표에 없는 값이 들어오면 정렬 순서가 undefined가 된다.",
  },
  {
    id: "d.questions",
    label: "되묻는 질문",
    domain: "verdict",
    datatype: "string[]",
    clause: "확인필요 판정이면 1개 이상. 가드레일 G5가 검사한다.",
  },
  {
    id: "d.amount",
    label: "금액(원)",
    domain: "money.amount",
    datatype: "number",
    clause: "수령불가 판정에는 붙일 수 없다. 가드레일 G2가 검사한다.",
  },
  {
    id: "d.range-min",
    label: "최소 예상액(원)",
    domain: "money.range",
    datatype: "number",
    clause: "적립분과 법정 퇴직금 중 작은 쪽.",
  },
  {
    id: "d.range-max",
    label: "최대 예상액(원)",
    domain: "money.range",
    datatype: "number",
    clause: "적립분과 법정 퇴직금 중 큰 쪽. 재직 중 임금이 올랐으면 더 커진다.",
  },
  {
    id: "d.days-left",
    label: "남은 날",
    domain: "money.deadline",
    datatype: "number",
    clause: "음수면 이미 지났다. 지난 기한도 화면에서 지우지 않는다.",
  },
  {
    id: "d.min-tenure",
    label: "최소 근속(개월)",
    domain: "departure.tenure",
    datatype: "number",
    clause: "외국인고용법 §13 — 12개월 미만이면 일시금이 사업주에게 귀속된다.",
  },
  {
    id: "d.workplace-size",
    label: "상시 근로자 수",
    domain: "payslip.size",
    datatype: "5인이상 | 5인미만 | 모름",
    clause: "근로기준법 §56 — 5인 미만은 가산수당 적용 제외.",
  },
  {
    id: "d.min-wage",
    label: "최저 시급(원)",
    domain: "statute.minwage",
    datatype: "number",
    clause: "고용노동부 고시 제2025-47호 — 2026년 10,320원.",
  },
  {
    id: "d.health-rate",
    label: "건강보험 요율",
    domain: "statute.rate",
    datatype: "number",
    clause: "국민건강보험법 — 2026년 7.19% 중 근로자 부담분.",
  },
  {
    id: "d.tolerance",
    label: "허용오차",
    domain: "statute.rate.tolerance",
    datatype: "number",
    clause: "이 값을 넘어도 위법이 아니라 확인필요로 내린다.",
  },
  {
    id: "d.verify-state",
    label: "검증 상태",
    domain: "evidence.state",
    datatype: "원본확인 | 2차출처 | 판례",
    clause: "2차출처가 몇 건 남았는지를 화면 통계에 그대로 노출한다.",
  },
];

/* ─────────────────────────────── 제약 ─────────────────────────────── */

/**
 * enforcedBy가 null인 것은 "적어는 놨지만 아직 아무도 검사하지 않는" 제약이다.
 * 지우지 마라. 전부 채워 넣고 100%를 주장하려면 schema.test.ts의
 * "null이 최소 1개" 테스트를 지워야 하고, 그 diff는 리뷰에서 보인다.
 */
export const AXIOMS: Axiom[] = [
  {
    kind: "disjointWith",
    left: "verdict.level.none",
    right: "money.amount",
    why: "받을 수 없다고 하면서 금액을 붙이면 그 금액이 합계에 섞입니다. 사용자는 받지 못할 돈을 기대한 채 출국하게 됩니다.",
    enforcedBy: "lib/harness/guardrails.ts:guardNoMoneyOnUnavailable",
  },
  {
    kind: "disjointWith",
    left: "verdict.level.check",
    right: "verdict.level.illegal",
    why: "확인필요 판정에 '위법'이라는 단정이 섞이면, 사용자가 회사와 다투러 갔다가 근거 없이 돌아오게 됩니다. E-9 비자는 사업장을 바꿀 수 있는 횟수가 정해져 있어 그 한 번의 대가가 큽니다.",
    enforcedBy: "lib/harness/guardrails.ts:guardAssertionLevel",
  },
  {
    kind: "disjointWith",
    left: "payslip.deduction.sanjae",
    right: "verdict.level.ok",
    why: "산재보험료가 급여에서 공제됐는데 정상으로 넘어가면, 예외 없이 확실하게 잡을 수 있는 유일한 위법을 놓치게 됩니다.",
    enforcedBy: "lib/rules/payslip.ts:checkSanjae",
  },
  {
    kind: "disjointWith",
    left: "payslip.size.unknown",
    right: "verdict.level.illegal",
    why: "사업장 규모를 모르는데 연장수당 부족을 위법으로 단정하면, 5인 미만 사업장 근로자에게 없는 권리가 있다고 말하게 됩니다. 잘못된 판정의 대가는 근로자가 치릅니다.",
    enforcedBy: "lib/rules/payslip.ts:checkOvertime",
  },
  {
    kind: "disjointWith",
    left: "departure.nationality.excluded",
    right: "money.range",
    why: "국민연금에 가입한 적이 없는 국적에 반환일시금 금액을 보여 주면, 있지도 않은 돈을 약속하는 셈입니다.",
    enforcedBy: "lib/rules/departure.ts:checkPensionRefund",
  },
  {
    kind: "functional",
    left: "verdict",
    right: "d.level",
    why: "판정 하나에 수준이 둘이면 정렬이 흐트러져 기한임박이 목록 아래로 내려갑니다. 가장 급한 줄이 보이지 않으면 이 화면을 만든 의미가 없습니다.",
    enforcedBy: "lib/rules/types.ts:sortFindings",
  },
  {
    // 2026-08-26 강제 시작 — 그 전까지는 아무도 이 명단들을 대조하지 않았다.
    // 두 명단이 겹치면 연금납부여부가 적용제외를 먼저 보므로 '미가입'이 조용히 이긴다.
    // 겹침을 잡는 검사가 상수 자리에 생겼다. 명단을 손으로 고치다 한 국가를 양쪽에
    // 넣으면 departure.test.ts 와 verify-golden.mjs 가 CI 를 멈춘다.
    kind: "disjointWith",
    left: "departure.nationality.paid",
    right: "departure.nationality.excluded",
    why: "요약 자료만 믿고 베트남을 국민연금 적용제외국에 넣을 뻔했습니다. 공단 원문을 확인해 바로잡았습니다. 그대로 나갔다면 한 사람당 수백만 원이 틀린 안내였습니다.",
    enforcedBy: "lib/rules/constants-departure.ts:연금명단_교차검사",
  },
  {
    // ★ 정직성 — 이 규율은 문서에만 있고 코드가 강제하지 않는다.
    // 가드레일 G1은 확정 표현을 '판정 수준'으로만 가른다. 그 판정이 쓴 상수가
    // 원본 확인된 것인지 2차 출처인지는 보지 않는다. 상수가 틀렸을 때
    // 사용자는 틀린 근거를 들고 사업주 앞에 선다.
    kind: "disjointWith",
    left: "evidence.state.secondary",
    right: "verdict.level.illegal",
    why: "원문으로 확인하지 않은 기준값으로 위법을 단정했다가 그 값이 틀리면, 사용자는 우리가 준 근거를 들고 갔다가 지게 됩니다. 근거 문서 가운데 원문 확인이 끝나지 않은 것이 아직 남아 있습니다.",
    enforcedBy: null,
  },
];

/* ─────────────────────────────── 조회 도우미 ─────────────────────────────── */

export const classById = (id: ClassId): OntologyClass | undefined =>
  CLASSES.find((c) => c.id === id);

/** 최상위까지의 조상 사슬. 화면과 A-Box의 domain/range 검사가 함께 쓴다 */
export function ancestors(id: ClassId): ClassId[] {
  const chain: ClassId[] = [];
  let cur = classById(id)?.parent ?? null;
  // 순환이 있으면 여기서 무한루프가 난다. 순환 없음은 schema.test.ts가 못 박는다.
  while (cur) {
    chain.push(cur);
    cur = classById(cur)?.parent ?? null;
  }
  return chain;
}

/** 몇 개 중 몇 개가 실제로 검사되는가 — 화면이 `7/8` 형태로 그대로 쓴다 */
export const enforcedRatio = () => ({
  enforced: AXIOMS.filter((a) => a.enforcedBy !== null).length,
  total: AXIOMS.length,
});
