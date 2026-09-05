/**
 * 2단(판정) 단위 테스트. AI 없이 돌아간다.
 *
 *   node --test lib/rules.test.ts
 *
 * 여기가 깨지면 제품이 틀린 금액을 말한다. 배포 전 반드시 통과해야 한다.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  judgePayslip,

  checkSanjae,
  checkInsuranceRates,
  checkMinWage,
  checkOvertime,
  checkLodging,
  checkUnknownDeduction,
  통상시급,
  type Payslip,
} from "./payslip.ts";
import { recoverableTotal } from "./types.ts";

/**
 * 기준 픽스처: 베트남 국적 E-9 근로자의 2026년 8월 명세서.
 * 01_전략/02_차별화.md 3절의 출력 예시와 같은 값이다.
 *
 * 심어둔 문제: 산재보험 25,000원 공제 / 연장수당 부족 / 숙식비 400,000원
 */
const 명세서: Payslip = {
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
};

/* ── A1 산재보험: 반례가 없는 유일한 룰 ── */

test("A1 — 산재보험이 공제되면 위법으로 판정한다", () => {
  const [f] = checkSanjae(명세서);
  assert.equal(f.rule, "A1");
  assert.equal(f.level, "위법");
  assert.equal(f.amount, 25_000);
});

test("A1 — 산재보험 공제가 없으면 아무것도 지적하지 않는다", () => {
  const 정상 = {
    ...명세서,
    deductions: 명세서.deductions.filter((d) => d.label !== "산재보험"),
  };
  assert.equal(checkSanjae(정상).length, 0);
});

/* ── A2~A5 4대보험: 오탐이 나오면 안 되는 지점 ── */

test("A2~A5 — 잔업이 있어도 정상 명세서를 불일치로 오탐하지 않는다", () => {
  // 4대보험 기준은 보수월액(전년도)이라 이번 달 총지급액(2,606,880)과 다르다.
  // 총지급액으로 나누는 방식이었다면 여기서 전부 "확인필요"가 떴다.
  const findings = checkInsuranceRates(명세서);
  const 불일치 = findings.filter((f) => f.level !== "정상");
  assert.deepEqual(
    불일치.map((f) => f.rule),
    [],
    `오탐 발생: ${불일치.map((f) => f.title).join(", ")}`,
  );
});

test("A4 — 장기요양보험료가 건강보험료와 어긋나면 확인필요로 올린다", () => {
  const 이상 = {
    ...명세서,
    deductions: 명세서.deductions.map((d) =>
      d.label === "장기요양보험료" ? { ...d, amount: 30_000 } : d,
    ),
  };
  const f = checkInsuranceRates(이상).find((x) => x.rule === "A4");
  assert.equal(f?.level, "확인필요");
});

test("A2~A5 — 요율 불일치는 위법이 아니라 확인필요다", () => {
  const 이상 = {
    ...명세서,
    deductions: 명세서.deductions.map((d) =>
      d.label === "국민연금" ? { ...d, amount: 200_000 } : d,
    ),
  };
  const f = checkInsuranceRates(이상).find((x) => x.rule === "A2");
  assert.equal(f?.level, "확인필요");
  assert.notEqual(f?.level, "위법");
});

test("A3 — 건강보험료가 없으면 대조를 포기한다 (틀리게 말하지 않는다)", () => {
  const 없음 = {
    ...명세서,
    deductions: 명세서.deductions.filter((d) => d.label !== "건강보험"),
  };
  assert.equal(checkInsuranceRates(없음).length, 0);
});

/* ── A6 최저임금 ── */

test("A6 — 가산수당을 뺀 임금으로 최저임금을 계산한다", () => {
  // 기본급 2,156,880 ÷ 209 = 10,320 → 정확히 2026년 최저임금
  const [f] = checkMinWage(명세서);
  assert.equal(f.level, "정상");
});

test("A6 — 미달이면 부족액을 계산한다", () => {
  const 미달 = {
    ...명세서,
    earnings: [{ label: "기본급", amount: 2_000_000 }],
  };
  const [f] = checkMinWage(미달);
  assert.equal(f.level, "위법");
  // (10,320 - 2,000,000/209) × 209 = 2,156,880 - 2,000,000
  assert.equal(Math.round(f.amount!), 156_880);
});

/* ── A7 연장수당: 5인 미만 예외를 빠뜨리면 오탐이 난다 ── */

test("A7 — 통상시급 × 1.5 × 시간과 대조해 부족액을 낸다", () => {
  assert.equal(통상시급(명세서), 10_320);
  const [f] = checkOvertime(명세서);
  assert.equal(f.level, "위법");
  // 30h × 10,320 × 1.5 = 464,400 − 350,000 = 114,400
  assert.equal(f.amount, 114_400);
});

test("A7 — 5인 미만 사업장은 가산수당 규정이 적용되지 않는다", () => {
  const 소규모 = { ...명세서, workplaceSize: "5인미만" as const };
  assert.equal(checkOvertime(소규모).length, 0);
});

test("A7 — 사업장 규모를 모르면 단정하지 않고 되묻는다", () => {
  const 모름 = { ...명세서, workplaceSize: "모름" as const };
  const [f] = checkOvertime(모름);
  assert.equal(f.level, "확인필요");
  assert.ok(f.questions?.[0].includes("5명"));
});

/* ── Tier B ── */

test("B1 — 숙식비 공제는 질문 3개와 함께 확인필요로 낸다", () => {
  const [f] = checkLodging(명세서);
  assert.equal(f.level, "확인필요");
  assert.equal(f.questions?.length, 3);
});

test("B3 — 알려지지 않은 공제 항목은 근거를 묻는다", () => {
  const 이상 = {
    ...명세서,
    deductions: [...명세서.deductions, { label: "기물파손비", amount: 50_000 }],
  };
  const [f] = checkUnknownDeduction(이상);
  assert.equal(f.rule, "B3");
  assert.ok(f.title.includes("기물파손비"));
});

test("B3 — 법정 공제 항목을 미상으로 오인하지 않는다", () => {
  assert.equal(checkUnknownDeduction(명세서).length, 0);
});

/* ── 통합 ── */

test("judge — 위법을 맨 위로 정렬한다", () => {
  const findings = judgePayslip(명세서);
  const levels = findings.map((f) => f.level);
  const 첫정상 = levels.indexOf("정상");
  const 마지막위법 = levels.lastIndexOf("위법");
  assert.ok(마지막위법 < 첫정상 || 첫정상 === -1);
  assert.equal(findings[0].level, "위법");
});

test("recoverableTotal — 정상 판정은 금액에 넣지 않는다", () => {
  const findings = judgePayslip(명세서);
  // 산재 25,000 + 연장 부족 114,400 + 숙식비 400,000(확인 대상)
  assert.equal(recoverableTotal(findings), 539_400);
});

test("결정성 — 같은 명세서를 두 번 판정하면 완전히 같다", () => {
  // 순서·금액·문장 중 하나라도 흔들리면 골든셋 대조가 무의미해진다.
  assert.deepEqual(
    judgePayslip(명세서),
    judgePayslip(명세서),
    "같은 명세서인데 결과가 갈렸다",
  );
  const 모름 = { ...명세서, workplaceSize: "모름" as const };
  assert.deepEqual(
    judgePayslip(모름),
    judgePayslip(모름),
    "되묻기 분기에서 결과가 갈렸다",
  );
});

test("judge — 빈 명세서에도 죽지 않는다", () => {
  const findings = judgePayslip({ earnings: [], deductions: [] });
  assert.ok(Array.isArray(findings));
});

/* ── 고정 샘플 의존 제거 회귀 (2026-08-28) — 입력이 다르면 결과가 달라야 한다 ── */

test("서로 다른 세 명세서 입력은 서로 다른 판정을 낸다", () => {
  const 틀: Payslip = {
    earnings: [{ label: "기본급", amount: 2_156_880 }],
    deductions: [
      { label: "국민연금", amount: 97_060 },
      { label: "건강보험", amount: 77_240 },
    ],
    hours: { scheduled: 209 },
    workplaceSize: "5인이상",
  };
  const 산재끼움: Payslip = {
    ...틀,
    deductions: [...틀.deductions, { label: "산재보험", amount: 21_500 }],
  };
  const 저임금: Payslip = {
    ...틀,
    earnings: [{ label: "기본급", amount: 1_000_000 }],
  };

  const a = judgePayslip(틀);
  const b = judgePayslip(산재끼움);
  const c = judgePayslip(저임금);

  // 산재를 끼우면 A1 위법이 생기고, 빼면 없다 — 입력이 판정을 지배한다
  assert.ok(!a.some((f) => f.rule === "A1"));
  assert.ok(b.some((f) => f.rule === "A1" && f.level === "위법"));
  // 기본급을 반으로 줄이면 최저임금 위반이 생긴다
  assert.ok(c.some((f) => f.rule === "A6" && f.level === "위법"));
  // 세 결과의 룰 집합이 전부 다르다
  const key = (fs: ReturnType<typeof judgePayslip>) =>
    fs.map((f) => `${f.rule}:${f.level}`).sort().join(",");
  assert.notEqual(key(a), key(b));
  assert.notEqual(key(b), key(c));
  assert.notEqual(key(a), key(c));
});
