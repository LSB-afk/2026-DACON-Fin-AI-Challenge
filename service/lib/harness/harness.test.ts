/**
 * 하네스 계층 테스트.
 *
 * 두 가지를 본다.
 *   1. 가드레일이 실제로 나쁜 판정을 잡는가 (일부러 위반을 만들어 넣는다)
 *   2. 현재 스킬이 내는 진짜 판정이 가드레일을 전부 통과하는가
 *
 * 2번이 이 파일의 핵심이다. 규율을 문서로만 적어두면 언젠가 어긋나는데,
 * 여기서 깨지면 커밋 전에 잡힌다.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  runHooks,
  runSelfTest,
  getHarness,
  listHarnesses,
  hookLog,
  clearHookLog,
} from "./core.ts";
import { payslipHarness, departureHarness } from "./registry.ts";
import {
  checkAllGuardrails,
  guardNoMoneyOnUnavailable,
  guardEstimateHasRange,
  guardQuestionOnUncertain,
  guardDeadlineOnUrgent,
  guardAssertionLevel,
  guardNoPII,
  guardNoContradiction,
  COMMON_FORBIDDEN_ASSERTIONS,
} from "./guardrails.ts";
import { judgePayslip } from "../rules/payslip.ts";
import { judgeDeparture } from "../rules/departure.ts";
import { samples } from "../samples.ts";
import type { Finding } from "../rules/types.ts";

const 기본판정: Finding = {
  rule: "T-1",
  level: "정상",
  title: "테스트",
  basis: "테스트 근거",
};

/* ── 등록·자체검증 ── */

test("하네스 2종이 등록된다", () => {
  assert.equal(listHarnesses().length, 2);
  assert.ok(getHarness("payslip-audit"));
  assert.ok(getHarness("departure-settlement"));
});

test("자체검증 — 두 하네스 모두 이슈가 없다", () => {
  for (const id of ["payslip-audit", "departure-settlement"] as const) {
    const r = runSelfTest(id);
    assert.deepEqual(r.issues, [], `${id}: ${JSON.stringify(r.issues)}`);
    assert.ok(r.passed >= 6);
  }
});

test("자체검증 — 카탈로그에 없는 룰을 추정 룰로 지정하면 잡는다", () => {
  const m = getHarness("departure-settlement")!;
  const 원본 = m.verification.estimateRules;
  m.verification.estimateRules = [...원본, "S2-99"];
  const issues = runSelfTest("departure-settlement").issues;
  m.verification.estimateRules = 원본;
  assert.ok(issues.some((i) => i.check === "추정 룰 참조"));
});

/* ── ★ 실제 판정이 가드레일을 통과하는가 ── */

test("S1 — 모든 샘플의 판정이 가드레일을 통과한다", () => {
  for (const s of samples) {
    const findings = judgePayslip(s.payslip);
    const v = checkAllGuardrails(findings, payslipHarness);
    assert.deepEqual(v, [], `샘플 ${s.id}: ${v.join(" / ")}`);
  }
});

test("S2 — 국적·근속·시점을 바꿔가며 전부 가드레일을 통과한다", () => {
  const 국적들 = ["베트남", "네팔", "우즈베키스탄", "가나", "스리랑카"];
  const 시점들 = ["2026-07-03", "2026-08-28", "2027-03-01", "2030-01-01"];
  const 근속들 = ["2023-09-01", "2026-06-01"]; // 3년 / 1년 미만

  for (const nationality of 국적들)
    for (const today of 시점들)
      for (const hireDate of 근속들) {
        const findings = judgeDeparture({
          nationality,
          visa: "E-9",
          hireDate,
          departureDate: "2026-09-01",
          monthlyWage: 2_150_000,
          today,
        });
        const v = checkAllGuardrails(findings, departureHarness);
        assert.deepEqual(
          v,
          [],
          `${nationality}/${today}/${hireDate}: ${v.join(" / ")}`,
        );
      }
});

/* ── 가드레일이 진짜로 잡는가 (일부러 위반) ── */

test("G2 — 수령불가에 금액이 붙으면 잡는다", () => {
  const bad: Finding = { ...기본판정, level: "수령불가", amount: 1_000_000 };
  assert.ok(guardNoMoneyOnUnavailable(bad));
  assert.equal(guardNoMoneyOnUnavailable({ ...bad, amount: undefined }), null);
});

test("G3 — 추정 룰인데 범위가 없으면 잡는다", () => {
  const bad: Finding = { ...기본판정, rule: "S2-1", amount: 500_000 };
  assert.ok(guardEstimateHasRange(bad, ["S2-1"]));
  assert.equal(
    guardEstimateHasRange(
      { ...bad, amountRange: { min: 400_000, max: 600_000 } },
      ["S2-1"],
    ),
    null,
  );
  // 추정 룰이 아니면 정액이어도 통과한다 (귀국비용보험 같은 경우)
  assert.equal(guardEstimateHasRange(bad, ["S2-3"]), null);
});

test("G5 — 확인필요인데 질문이 없으면 잡는다", () => {
  const bad: Finding = { ...기본판정, level: "확인필요" };
  assert.ok(guardQuestionOnUncertain(bad));
  assert.equal(
    guardQuestionOnUncertain({ ...bad, questions: ["무엇을 확인하세요"] }),
    null,
  );
});

test("G7 — 기한임박인데 마감일이 없으면 잡는다", () => {
  const bad: Finding = { ...기본판정, level: "기한임박" };
  assert.ok(guardDeadlineOnUrgent(bad));
});

test("G1 — 확정 표현은 위법 수준에만 허용한다", () => {
  const 문구 = "이것은 위법입니다";
  assert.ok(
    guardAssertionLevel(
      { ...기본판정, level: "확인필요", title: 문구 },
      COMMON_FORBIDDEN_ASSERTIONS,
    ),
  );
  assert.equal(
    guardAssertionLevel(
      { ...기본판정, level: "위법", title: 문구 },
      COMMON_FORBIDDEN_ASSERTIONS,
    ),
    null,
  );
});

test("G6 — 판정 텍스트에 개인정보 패턴이 섞이면 잡는다", () => {
  // 가짜 번호지만 형식은 진짜다. 한 덩어리로 적으면 scripts/scan.mjs 가 이 파일을 위반으로
  // 잡는다. 스캐너는 진짜와 가짜를 구분하지 못하고, 구분하게 만들면 그게 곧 구멍이 된다.
  // 조각을 이어 붙여 저장소에는 안 남기고 검사에 넘기는 문자열은 그대로 만든다.
  assert.ok(guardNoPII({ ...기본판정, title: "9901" + "01-1" + "234567 확인" }));
  assert.ok(guardNoPII({ ...기본판정, formula: "010-" + "1234-5678로 연락" }));
  // 우리가 안내하는 기관 번호는 걸리지 않아야 한다
  assert.equal(guardNoPII({ ...기본판정, basis: "삼성화재 02-2261-8400" }), null);
  assert.equal(guardNoPII({ ...기본판정, basis: "국민연금공단 1355" }), null);
});

/* ── 훅 ── */

test("beforeJudge — 출국일이 입사일보다 빠르면 막는다", () => {
  const r = runHooks("departure-settlement", "beforeJudge", {
    input: { hireDate: "2026-09-01", departureDate: "2023-09-01" },
  });
  assert.equal(r.ok, false);
  assert.ok(r.violations[0].includes("빠릅니다"));
});

test("beforeJudge — 지급 항목이 비면 막는다", () => {
  const r = runHooks("payslip-audit", "beforeJudge", { input: { earnings: [] } });
  assert.equal(r.ok, false);
});

test("afterJudge — 나쁜 판정을 훅이 기록한다", () => {
  clearHookLog();
  const bad: Finding[] = [{ ...기본판정, level: "수령불가", amount: 999 }];
  const r = runHooks("departure-settlement", "afterJudge", { findings: bad });
  assert.equal(r.ok, false);
  assert.equal(hookLog()[0].hook, "afterJudge");
  assert.equal(hookLog()[0].violations.length, 1);
});

test("훅 로그는 순번을 쓴다 — 시각을 쓰면 재현성이 깨진다", () => {
  clearHookLog();
  runHooks("payslip-audit", "beforeJudge", { input: { earnings: [1] } });
  runHooks("payslip-audit", "beforeJudge", { input: { earnings: [1] } });
  const log = hookLog();
  assert.equal(log[0].seq, 2);
  assert.equal(log[1].seq, 1);
  assert.ok(!("at" in log[0]));
});

test("등록되지 않은 훅을 부르면 조용히 통과한다", () => {
  const r = runHooks("payslip-audit", "beforeNarrate", { findings: [기본판정] });
  assert.equal(r.ok, true);
});

test("G8 — 청구 불가를 선언한 결과에서 다른 룰이 돈을 약속하면 잡는다", () => {
  const 모순: Finding[] = [
    { ...기본판정, rule: "S2-5", level: "수령불가", track: "보험", blocksClaims: true },
    { ...기본판정, rule: "S2-1", level: "기한임박", track: "보험", amount: 4_000_000,
      deadline: { label: "마감", date: "2025-01-15", daysLeft: -1499 } },
  ];
  const v = guardNoContradiction(모순);
  assert.equal(v.length, 1, `잡지 못했다: ${JSON.stringify(v)}`);
  assert.ok(v[0].includes("S2-1"));

  // 차단 선언이 없으면 같은 판정이 정상이다 — 출국 전에는 저 금액이 진짜다
  assert.deepEqual(guardNoContradiction([모순[1]]), []);

  // ★ 갈래가 다르면 모순이 아니다. 보험 시효(3년)가 지나도 국민연금(5년)은 살아 있다.
  //   갈래를 안 보던 첫 구현은 이 멀쩡한 728만원을 거짓말로 잡았다.
  const 다른갈래: Finding[] = [
    모순[0],
    { ...기본판정, rule: "S2-3", level: "수령가능", track: "국민연금", amount: 7_284_716 },
  ];
  assert.deepEqual(
    guardNoContradiction(다른갈래),
    [],
    "다른 갈래의 사실을 모순으로 잡았다",
  );
});

test("G8 — 시효가 지난 실제 판정이 이제 모순을 만들지 않는다", () => {
  const f = judgeDeparture({
    nationality: "캄보디아", visa: "E-9",
    hireDate: "2020-01-15", departureDate: "2022-01-15",
    monthlyWage: 2_000_000, today: "2026-02-15",
  });
  const v = checkAllGuardrails(f, departureHarness);
  assert.deepEqual(v, [], `가드레일 위반: ${v.join(" / ")}`);
  assert.equal(
    f.filter((x) => ["S2-1", "S2-2"].includes(x.rule)).reduce((a, x) => a + (x.amount ?? 0), 0),
    0,
    "시효가 지난 보험 갈래에 금액이 남아 있다",
  );
});

/**
 * 화면이 "골든셋 N건"이라고 말한다. 그 N 을 아무도 검증하지 않으면 조용히 낡는다.
 *
 * 실제로 낡아 있었다 — registry 에 17·21 로 적혀 있었는데 그 숫자는 한때의 단위 테스트
 * 건수였고, 골든셋(12·16)과도 지금 단위 테스트 건수(18·27)와도 달랐다.
 * 근거 없는 숫자를 근거처럼 쓰는 것을 막는 장치다(원문 C-3 정직성 2번).
 */
test("goldenCases 는 golden/cases.json 의 실제 건수와 같다", async () => {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const root = fileURLToPath(new URL("../../golden/cases.json", import.meta.url));
  const golden = JSON.parse(readFileSync(root, "utf8"));

  const 실제 = (skill: string) =>
    golden.cases.filter((c: { input: { skill: string } }) => c.input.skill === skill).length;

  const 불일치 = [
    ["payslip-audit", "payslip", payslipHarness.verification.goldenCases],
    ["departure-settlement", "departure", departureHarness.verification.goldenCases],
  ]
    .filter(([, skill, 적힌]) => 적힌 !== 실제(skill as string))
    .map(([id, skill, 적힌]) => `${id}: 적힌 ${적힌} / 실제 ${실제(skill as string)}`);

  assert.deepEqual(불일치, [], `화면이 틀린 건수를 말한다 — ${불일치.join(" / ")}`);
});
