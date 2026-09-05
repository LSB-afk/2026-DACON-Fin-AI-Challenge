/**
 * 상담 기록 검증 — 사람 승인 흔적과 금액 분리가 문서에 남는지 잰다.
 * 마지막 테스트가 핵심이다: 같은 입력이면 같은 문서 — 시계가 섞여 들면 깨진다.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildConsultRecord, type ConsultRecordInput } from "./consult.ts";

const 입력: ConsultRecordInput = {
  today: "2026-08-28",
  approvedAt: "2026-08-28 21:10",
  provider: "ollama",
  model: "gemma4:latest",
  utterance: "베트남 사람인데 다음 달에 출국해요",
  fields: [
    { name: "국적", extracted: "네팔", evidence: "네팔 사람", final: "베트남" },
    { name: "체류자격", final: "E-9" },
    { name: "출국일", extracted: "2026-10-15", evidence: "10월 15일에 출국", final: "2026-10-15" },
  ],
  findings: [
    {
      rule: "S2-2",
      track: "귀국비용보험",
      level: "수령가능",
      title: "귀국비용보험을 돌려받을 수 있습니다",
      amount: 400_000,
      basis: "외국인고용법 §15",
      deadline: { label: "청구권 소멸시효 (3년)", date: "2029-10-15", daysLeft: 1144 },
    },
    {
      rule: "S2-3",
      track: "국민연금",
      level: "수령가능",
      title: "국민연금 반환일시금을 청구할 수 있습니다",
      amount: 7_000_000,
      amountRange: { min: 6_800_000, max: 7_000_000 },
      basis: "국민연금법 §126④",
    },
    {
      rule: "S2-4",
      track: "출국만기보험",
      level: "확인필요",
      title: "퇴직금 차액을 확인하세요",
      amount: 500_000,
      basis: "근로자퇴직급여 보장법",
      questions: ["사업장에 퇴직금 산정서를 요청하세요."],
    },
  ],
  answer: {
    headline: "받을 수 있는 돈이 있습니다 — 확정 금액 40만원",
    blocks: [{ rule: "S2-2", level: "수령가능", lines: ["귀국비용보험 40만원을 돌려받습니다."] }],
    todo: ["출국 30일 전 고용센터에 출국예정신고를 하세요."],
    notices: ["이 결과는 법률 자문이 아닙니다."],
  },
};

test("승인 시각·기준일·모델이 머리에 남는다", () => {
  const md = buildConsultRecord(입력);
  assert.ok(md.includes("상담사 확인·승인: 2026-08-28 21:10"));
  assert.ok(md.includes("판정 기준일: 2026-08-28"));
  assert.ok(md.includes("ollama:gemma4:latest"));
});

test("모델이 한 일과 사람이 한 일이 구분된다 — 수정·직접입력 표기", () => {
  const md = buildConsultRecord(입력);
  assert.ok(md.includes("| 국적 | 네팔 | \"네팔 사람\" | 베트남 (상담사 수정) |"));
  assert.ok(md.includes("| 체류자격 | — | — | E-9 (상담사 입력) |"));
  // 추출 그대로 승인된 값에는 꼬리표가 없다
  assert.ok(md.includes("| 출국일 | 2026-10-15 | \"10월 15일에 출국\" | 2026-10-15 |"));
});

test("금액은 확정·추정·참고로 분리되고 합산되지 않는다", () => {
  const md = buildConsultRecord(입력);
  assert.ok(md.includes("확정: 400,000원"));
  assert.ok(md.includes("추정: 6,800,000원 ~ 7,000,000원"));
  assert.ok(md.includes("참고 금액: 500,000원 (총액에 포함하지 않음)"));
  // 셋을 합친 7,900,000 은 어디에도 없어야 한다
  assert.ok(!md.includes("7,900,000"));
});

test("기한과 근거 조문이 판정마다 붙는다", () => {
  const md = buildConsultRecord(입력);
  assert.ok(md.includes("기한: 청구권 소멸시효 (3년) — 2029-10-15 (D-1144)"));
  assert.ok(md.includes("근거: 국민연금법 §126④"));
});

test("같은 입력이면 같은 문서다 — 시계 없음", () => {
  assert.equal(buildConsultRecord(입력), buildConsultRecord(입력));
});
