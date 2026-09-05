/**
 * 판정이 대조하는 근거 문서 레지스트리.
 *
 * 하네스 우측 패널이 이걸 그대로 보여준다. 목적은 장식이 아니라 **검증 상태의 노출**이다.
 *   원본확인 — 1차 출처(법령·고시·공단 원문)를 직접 읽고 상수를 확정했다
 *   2차출처 — 언론·요약을 근거로 넣었다. 기획서 확정 전에 원본으로 올려야 한다
 *   판례    — 대법원 판결
 *
 * 2차출처가 남아 있다는 사실을 화면에 그대로 띄운다. 숨기면 그게 부채가 되고,
 * 띄워두면 그게 할 일 목록이 된다. 실제로 국민연금 국가 명단은 원본을 읽고서야
 * 1인당 700만원짜리 오답을 잡았다.
 */

import type { SkillId } from "./skills.ts";

export type VerifyState = "원본확인" | "2차출처" | "판례";

export type Standard = {
  /** 조문 식별자 */
  code: string;
  title: string;
  /** 제정·시행·고시일 */
  issued: string;
  /** 이 판정이 쓰는 범위 */
  scope: string;
  /** 현재 구현이 어디까지인가 */
  note: string;
  state: VerifyState;
  /** 최신 개정·확인 이력 */
  history?: string;
  /** 1차 출처 URL — 확인한 그 주소. 없는 항목은 아직 원문 열람 경로를 못 찾은 것 */
  sourceUrl?: string;
  /** 원문(또는 교차 출처)을 마지막으로 확인한 날 */
  verifiedAt?: string;
  skills: SkillId[];
};

export const standards: Standard[] = [
  {
    code: "국민연금공단 「외국 연금제도 조사 내용」",
    title: "국가별 국민연금 적용 여부 (134개국)",
    issued: "2025-12-01 기준",
    scope: "사업장 적용제외국 21개국 · 협정 유형별 발효 현황",
    note: "원본 PDF를 직접 확인해 기준값에 반영했습니다. 베트남(2022-01-01부터)과 캄보디아(2023-03-29부터)의 사업장 당연적용을 이 문서로 확정했습니다.",
    state: "원본확인",
    history: "요약 자료의 '베트남 가입 불가' 서술을 이 문서로 바로잡았습니다 (2026-08-20)",
    skills: ["departure"],
  },
  {
    code: "국민연금법 §126④2호",
    title: "외국인에 대한 반환일시금 특례",
    issued: "2007년 개정 신설",
    scope: "고용허가제 외국인근로자의 반환일시금 수급권",
    note: "E-9은 본국의 제도와 관계없이 받을 수 있습니다. 그래서 판정할 것은 자격이 아니라 '보험료를 냈는가'뿐입니다.",
    state: "2차출처",
    history: "법령 원문 대조 필요",
    skills: ["departure"],
  },
  {
    code: "외국인고용법 §13",
    title: "출국만기보험·신탁",
    issued: "2014-01-28 개정",
    scope: "①매월 납입 ②퇴직금 차액 ③출국 후 14일 내 지급 ④시효 3년",
    note: "청구 기한(출국 7일 전)은 실무 절차이고, 법에 정한 기한은 지급 시기 14일입니다. 근속 1년 미만이면 사업주에게 귀속된다는 부분은 시행령 확인을 기다리고 있습니다.",
    state: "2차출처",
    history:
      "2026-08-28 위키문헌과 easylaw에서 교차 확인했습니다. 출국 후 14일 지급(2014-01-28 개정)과 3년 시효 뒤 1개월 안에 한국산업인력공단 이전은 판정 수치와 일치합니다. law.go.kr 조문 화면은 자동으로 읽을 수 없어 원문 직접 대조는 사람이 확인해야 합니다.",
    sourceUrl: "https://www.law.go.kr/법령/외국인근로자의고용등에관한법률",
    verifiedAt: "2026-08-28",
    skills: ["departure"],
  },
  {
    code: "국민연금법 §115",
    title: "급여 청구권의 소멸시효",
    issued: "2018-01 개정",
    scope: "국외이주 사유 5년 (지급연령 도달만 10년)",
    note: "제116조의 재기산 특례(60세가 되면 다시 청구)는 아직 반영하지 않았습니다. 지금은 5년만 계산합니다.",
    state: "2차출처",
    skills: ["departure"],
  },
  {
    code: "산업재해보상보험법",
    title: "산재보험료 부담 주체",
    issued: "—",
    scope: "사업주 전액 부담",
    note: "급여에서 공제됐다면 금액, 사업장 규모, 계약 내용과 관계없이 위법입니다. 예외가 없어 잘못 판정할 수 없는 유일한 규칙(A1)입니다.",
    state: "2차출처",
    skills: ["payslip"],
  },
  {
    code: "근로기준법 §56",
    title: "연장·야간·휴일 근로 가산",
    issued: "—",
    scope: "통상임금 50% 이상 가산 (휴일 8시간 초과 100%)",
    note: "5인 미만 사업장에는 적용되지 않습니다. 상시 근로자 수를 모르면 판정하지 않고 다시 묻습니다(A7).",
    state: "2차출처",
    skills: ["payslip"],
  },
  {
    code: "근로기준법 §48② · 영 §27의2",
    title: "임금명세서 교부 의무",
    issued: "2021-11-19 시행",
    scope: "구성항목별 금액·계산방법·공제 내역 등 6개 필수 기재사항",
    note: "명세서를 한국어로만 써도 법에 어긋나지 않습니다. 이 서비스가 필요한 이유입니다.",
    state: "2차출처",
    skills: ["payslip"],
  },
  {
    code: "고용노동부 고시 제2025-47호",
    title: "2026년 적용 최저임금",
    issued: "2025-08-05 고시 · 적용 2026-01-01~12-31",
    scope: "시급 10,320원 · 월 209시간 2,156,880원",
    note: "최저임금위원회 결정 현황 표에서 시급, 고시일, 적용 기간을 직접 확인했습니다. 상여금과 복리후생비를 넣을지는 따로 확인을 기다리고 있습니다.",
    state: "원본확인",
    history: "2026-08-28 minimumwage.go.kr 결정 현황에서 10,320원을 확인했습니다. 기준값과 일치합니다",
    sourceUrl: "https://www.minimumwage.go.kr/minWage/policy/decisionMain.do",
    verifiedAt: "2026-08-28",
    skills: ["payslip"],
  },
  {
    code: "국민연금공단 2026년 기준소득월액 조정 안내",
    title: "기준소득월액 상·하한 (보험료 산정 기반)",
    issued: "2026-07-01~2027-06-30 적용",
    scope: "상한 6,590,000원 · 하한 410,000원 (직전 구간 637만/40만)",
    note: "반환일시금 원금을 계산할 때 이 상한과 하한을 적용합니다. 이 제한이 없던 동안에는 월급이 높은 입력에서 금액을 부풀릴 위험이 있었습니다 (2026-08-28 수정).",
    state: "원본확인",
    sourceUrl: "https://www.nps.or.kr/pnsgdnc/newgdnc/getOHAE0001M1.do?pstId=ZZ202600000000000147",
    verifiedAt: "2026-08-28",
    skills: ["departure"],
  },
  {
    code: "대법원 2001다25184",
    title: "임금 전액지급 원칙과 사전 공제",
    issued: "판례",
    scope: "숙식비 사전 공제는 근로자의 자유로운 의사에 기한 동의 필요",
    note: "모국어로 쓴 서면 동의서가 없으면 미리 공제할 수 없습니다. B1 규칙이 단정하지 않고 질문 세 개를 돌려주는 근거입니다.",
    state: "판례",
    skills: ["payslip"],
  },
  {
    code: "한국산업인력공단 귀국비용보험",
    title: "국가군별 납부액",
    issued: "—",
    scope: "제1군 40만 · 제2군 50만 · 제3군(스리랑카) 60만",
    note: "근로자 본인이 입국 3개월 안에 냅니다. 제2군 국가 목록은 원문 확인을 기다리고 있습니다.",
    state: "2차출처",
    history: "2024-12-16 청구 절차가 바뀌었습니다. 내용 확인이 필요합니다",
    skills: ["departure"],
  },
];

export const standardsFor = (skill: SkillId) =>
  standards.filter((s) => s.skills.includes(skill));

export const verifyCounts = () => ({
  원본확인: standards.filter((s) => s.state === "원본확인").length,
  판례: standards.filter((s) => s.state === "판례").length,
  "2차출처": standards.filter((s) => s.state === "2차출처").length,
});
