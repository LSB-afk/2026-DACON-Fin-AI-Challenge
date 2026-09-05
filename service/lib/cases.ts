/**
 * 상담 큐 픽스처.
 *
 * 실제 사용자 데이터가 아니라 전부 합성이다. 개인정보가 없으므로 심사자가
 * 계정·업로드 없이 큐를 눌러 전 과정을 재현할 수 있다.
 *
 * X-01은 일부러 라우팅에 실패하는 발화다. 에이전트가 추측하지 않고 되묻는지를
 * 보여주려면 실패 케이스가 큐 안에 있어야 한다.
 */

import type { WorkplaceSize } from "./rules/payslip.ts";
import type { DepartureInput } from "./rules/departure.ts";

export type CaseKind = "payslip" | "departure" | "unrouted";

export type Case = {
  id: string;
  badge: string;
  /** 사용자가 실제로 하는 말 */
  utterance: string;
  /** 큐 카드에 보이는 요약 */
  summary: string;
  kind: CaseKind;
  /** 이 케이스가 무엇을 증명하는가 — 심사자용 */
  demonstrates: string;
  payslipSampleId?: string;
  workplaceSize?: WorkplaceSize;
  departure?: Omit<DepartureInput, "today">;
};

export const cases: Case[] = [
  {
    id: "S2-01",
    badge: "기한 임박",
    utterance: "다음 달에 고향에 돌아가요",
    summary:
      "출국 때 받을 돈 세 가지(출국만기보험, 귀국비용보험, 국민연금)를 계산하고 각각의 마감일을 알려 줍니다.",
    kind: "departure",
    demonstrates:
      "'돌아간다'는 말 한마디에서 출국 7일 전 청구 마감을 찾아냅니다. 사용자가 미처 모르는 마감을 먼저 알려 줍니다.",
    departure: {
      nationality: "베트남",
      visa: "E-9",
      hireDate: "2023-10-15",
      /*
       * 출국일은 심사 주간(2026-09-07~11) 뒤에 둔다.
       * 원래 2026-09-01 이었는데, 기본 기준일은 실제 오늘이라 심사 주간에 열면
       * 첫 화면부터 "마감 지남"이 떴다 — 시연의 첫인상이 실패 케이스가 되는 배치다.
       * 기한 경계·시효는 시나리오 큐가 기준일을 옮겨서 보여준다. 여기는 기본
       * 화면이 심사 기간 내내 «수령가능 + D-30 안팎»으로 안정되게 두는 자리다.
       */
      departureDate: "2026-10-15",
      monthlyWage: 2_150_000,
    },
  },
  {
    id: "S1-01",
    badge: "산재 공제",
    utterance: "월급에서 뭘 자꾸 떼가는데 이게 맞나요",
    summary:
      "급여명세서를 2026년 법정 기준과 대조합니다. 산재보험 공제와 연장수당 부족을 지적합니다.",
    kind: "payslip",
    demonstrates:
      "산재보험료는 회사가 전부 내는 돈이라, 급여에서 떼었다면 예외 없이 위법입니다.",
    payslipSampleId: "02",
    workplaceSize: "5인이상",
  },
  {
    id: "S2-02",
    badge: "국적 분기",
    utterance: "네팔 사람인데 출국할 때 연금을 받을 수 있나요",
    summary:
      "국적에 따라 국민연금 납부 여부가 갈립니다. 적용제외국은 받을 돈이 없습니다.",
    kind: "departure",
    demonstrates:
      "없는 돈을 있다고 말하지 않습니다. 명단에 없는 국적이면 금액 대신 국민연금공단(1355)에 확인하라는 안내가 나갑니다.",
    departure: {
      nationality: "네팔",
      visa: "E-9",
      hireDate: "2023-10-15",
      // S2-01 과 같은 이유로 심사 주간 뒤의 날짜다
      departureDate: "2026-10-15",
      monthlyWage: 2_150_000,
    },
  },
  {
    id: "S1-02",
    badge: "최저임금",
    utterance: "다른 사람보다 월급이 적은 것 같아요",
    summary:
      "가산수당을 뺀 임금으로 시급을 환산해 2026년 최저임금 10,320원과 대조합니다.",
    kind: "payslip",
    demonstrates:
      "근거 없는 공제 항목(기물파손비)은 이름이 무엇이든 근거를 요구할 수 있습니다.",
    payslipSampleId: "03",
    workplaceSize: "5인이상",
  },
  {
    id: "S2-03",
    badge: "시효 확인",
    utterance: "작년에 출국했는데 퇴직금을 못 받았어요",
    summary: "이미 출국한 경우 남은 청구 시효를 계산합니다. 3년이 지나면 보험금이 한국산업인력공단으로 넘어갑니다.",
    kind: "departure",
    demonstrates:
      "출국한 뒤에는 해외에서 영사 확인을 받아야 해서 절차가 훨씬 어려워집니다. 그래서 남은 날짜를 먼저 보여 줍니다.",
    departure: {
      nationality: "캄보디아",
      visa: "E-9",
      hireDate: "2022-03-01",
      departureDate: "2025-06-15",
      monthlyWage: 2_060_000,
    },
  },
  {
    id: "X-01",
    badge: "라우팅 실패",
    utterance: "은행에서 계좌를 안 만들어줘요",
    summary:
      "어느 검사에도 해당하지 않는 말입니다. AI는 추측하지 않고 다시 묻습니다.",
    kind: "unrouted",
    demonstrates:
      "계좌 문제는 아직 검사 항목이 없습니다. 없는 기능을 있는 것처럼 보이지 않게 하는 것도 이 서비스의 원칙입니다.",
  },
];

export const getCase = (id: string) => cases.find((c) => c.id === id)!;
