/**
 * 심사자용 샘플 명세서.
 *
 * 실제 급여명세서를 쓰지 않는다. 전부 합성 데이터라 개인정보가 없다.
 * 심사자는 파일 업로드 없이 이 샘플로 전체 흐름을 확인할 수 있다.
 */

import type { Payslip } from "./rules/payslip.ts";

export type Sample = {
  id: string;
  title: string;
  /** 이 샘플에 심어둔 문제 — 심사자가 기대 결과를 미리 알 수 있게 한다 */
  expects: string;
  payslip: Payslip;
};

export const samples: Sample[] = [
  {
    id: "01",
    title: "문제가 없는 명세서",
    expects: "전 항목 정상",
    payslip: {
      earnings: [
        { label: "기본급", amount: 2_156_880 },
        { label: "연장근로수당", amount: 464_400 },
      ],
      deductions: [
        { label: "국민연금", amount: 102_300 },
        { label: "건강보험", amount: 77_450 },
        { label: "장기요양보험료", amount: 10_180 },
        { label: "고용보험", amount: 19_390 },
      ],
      hours: { scheduled: 209, overtime: 30 },
      workplaceSize: "5인이상",
    },
  },
  {
    id: "02",
    title: "산재보험 공제 + 연장수당 부족",
    expects: "산재보험 25,000원 위법 / 연장수당 114,400원 부족",
    payslip: {
      earnings: [
        { label: "기본급", amount: 2_156_880 },
        { label: "연장근로수당", amount: 350_000 },
        { label: "야간근로수당", amount: 100_000 },
      ],
      deductions: [
        { label: "국민연금", amount: 102_300 },
        { label: "건강보험", amount: 77_450 },
        { label: "장기요양보험료", amount: 10_180 },
        { label: "고용보험", amount: 19_390 },
        { label: "산재보험", amount: 25_000 },
        { label: "숙식비", amount: 400_000 },
      ],
      hours: { scheduled: 209, overtime: 30, night: 10 },
      workplaceSize: "5인이상",
    },
  },
  {
    id: "03",
    title: "최저임금 미달 + 근거 없는 공제",
    expects: "최저임금 156,880원 미달 / 기물파손비 50,000원 근거 확인",
    payslip: {
      earnings: [{ label: "기본급", amount: 2_000_000 }],
      deductions: [
        { label: "국민연금", amount: 95_000 },
        { label: "건강보험", amount: 71_900 },
        { label: "장기요양보험료", amount: 9_448 },
        { label: "고용보험", amount: 18_000 },
        { label: "기물파손비", amount: 50_000 },
      ],
      hours: { scheduled: 209, overtime: 0 },
      workplaceSize: "5인이상",
    },
  },
];

export const getSample = (id: string) => samples.find((s) => s.id === id);
