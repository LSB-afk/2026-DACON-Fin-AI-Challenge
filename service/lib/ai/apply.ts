/**
 * 에이전트 추출값 → 판정 입력 변환 — 기본값 금지 구역.
 *
 * 사고 유형: 발화에서 국적을 못 뽑았는데 케이스 픽스처의 "베트남"이 조용히
 * 채워지면, 네팔 사람이 베트남 기준(연금 수령가능·728만원)의 판정을 받는다.
 * 국적 하나로 700만원이 갈리는 제품에서 기본값은 편의가 아니라 오답 제조기다.
 *
 * 그래서 이 함수는 둘 중 하나만 돌려준다:
 *   ok: true  — 필수 필드가 전부 있어 판정 입력이 완성됨
 *   ok: false — 무엇이 빠졌고 사용자에게 무엇을 물어야 하는지 (되묻기, G5와 같은 문법)
 *
 * 중간은 없다. "일단 기본값으로 돌려보고" 는 이 파일이 금지하는 바로 그것이다.
 */

import type { DepartureInput, Visa } from "../rules/departure.ts";

export type IntakeFields = {
  nationality?: string;
  visa?: string;
  hireDate?: string;
  departureDate?: string;
  monthlyWage?: number;
  workplaceSize?: string;
};

export type ApplyResult =
  | { ok: true; input: DepartureInput }
  | { ok: false; missing: string[]; questions: string[] };

const VISAS: Visa[] = ["E-9", "H-2", "E-8", "기타"];

/** 빠진 필드마다 사용자에게 돌려줄 질문 — 왜 필요한지까지 말해야 답이 온다 */
const 되묻기: Record<string, string> = {
  국적: "국적이 어디신가요? 국적에 따라 국민연금을 돌려받을 수 있는지가 갈립니다.",
  체류자격: "체류자격(비자)이 무엇인가요? E-9·H-2만 출국만기·귀국비용보험 대상입니다.",
  입사일: "언제부터 일을 시작하셨나요? 근속 12개월이 넘어야 출국만기보험을 받습니다.",
  출국일: "언제 출국하실 예정인가요? 마감일이 전부 출국일에서 계산됩니다.",
  "월 평균임금": "월급이 얼마인가요? 받을 금액의 추정 범위를 계산하는 데 필요합니다.",
};

const 날짜형식 = /^\d{4}-\d{2}-\d{2}$/;

export function toDepartureInput(
  f: IntakeFields,
  today: string,
): ApplyResult {
  const missing: string[] = [];
  if (!f.nationality?.trim()) missing.push("국적");
  const visa = f.visa && (VISAS as string[]).includes(f.visa) ? (f.visa as Visa) : null;
  if (!visa) missing.push("체류자격");
  if (!f.hireDate || !날짜형식.test(f.hireDate)) missing.push("입사일");
  if (!f.departureDate || !날짜형식.test(f.departureDate)) missing.push("출국일");
  if (f.monthlyWage === undefined || !Number.isFinite(f.monthlyWage) || f.monthlyWage <= 0)
    missing.push("월 평균임금");

  if (missing.length)
    return { ok: false, missing, questions: missing.map((m) => 되묻기[m]) };

  return {
    ok: true,
    input: {
      nationality: f.nationality!.trim(),
      visa: visa!,
      hireDate: f.hireDate!,
      departureDate: f.departureDate!,
      monthlyWage: f.monthlyWage!,
      today,
    },
  };
}
