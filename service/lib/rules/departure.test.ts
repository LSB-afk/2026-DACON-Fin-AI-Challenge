/**
 * S2 출국 정산 단위 테스트.
 *
 * `today`를 항상 주입한다. 시간을 주입하지 않으면 내일 이 테스트가 깨진다.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  judgeDeparture,
  연금납부여부,
  연금납부원금,
  monthsBetween,
  checkSeveranceInsurance,
  checkReturnCostInsurance,
  checkPensionRefund,
  checkSeveranceGap,
  checkExpiry,
  type DepartureInput,
} from "./departure.ts";
import { 연금명단_교차검사 } from "./constants-departure.ts";
import { recoverableTotal } from "./types.ts";

/** 베트남 E-9, 3년 근속, 출국 60일 전 */
const 기본: DepartureInput = {
  nationality: "베트남",
  visa: "E-9",
  hireDate: "2023-09-01",
  departureDate: "2026-09-01",
  monthlyWage: 2_150_000,
  today: "2026-07-03",
};

/* ── 날짜 계산 ── */

test("monthsBetween — 일자가 모자라면 한 달 빼고 센다", () => {
  assert.equal(monthsBetween("2023-09-01", "2026-09-01"), 36);
  assert.equal(monthsBetween("2023-09-15", "2024-09-14"), 11);
  assert.equal(monthsBetween("2026-01-01", "2025-01-01"), 0);
});

/* ── ★ 국적 분기: S2의 핵심 ── */

test("국적 — 베트남은 2022년부터 사업장 당연적용이라 납부한다", () => {
  // 2차 출처는 "가입 불가"라고 했다. 공단 원본이 뒤집었다.
  assert.equal(연금납부여부("베트남", "E-9"), "납부함");
  assert.equal(연금납부여부("캄보디아", "E-9"), "납부함");
  assert.equal(연금납부여부("몽골", "E-9"), "납부함");
});

test("국적 — 적용제외 21개국은 미가입", () => {
  for (const n of ["네팔", "미얀마", "방글라데시", "파키스탄", "동티모르"])
    assert.equal(연금납부여부(n, "E-9"), "미가입", n);
});

test("국적 — 우즈베키스탄 E-9만 협정으로 면제된다", () => {
  assert.equal(연금납부여부("우즈베키스탄", "E-9"), "협정면제");
  // E-9이 아니면 협정 면제 특례가 적용되지 않는다
  assert.notEqual(연금납부여부("우즈베키스탄", "기타"), "협정면제");
});

test("국적 — 세 명단은 서로 겹치지 않는다 (온톨로지 공리: paid disjointWith excluded)", () => {
  // 연금납부여부는 분기를 순서대로 훑는다. 명단이 겹치면 앞의 갈래가 조용히 이기고,
  // 700만 원짜리 오답이 부활해도 아무도 못 본다. 겹침은 즉시 CI 를 멈춘다.
  assert.deepEqual(연금명단_교차검사(), []);
});

test("국적 — 명단에 없으면 단정하지 않고 확인필요로 낸다", () => {
  assert.equal(연금납부여부("가나", "E-9"), "미확인");
  const [f] = checkPensionRefund({ ...기본, nationality: "가나" });
  assert.equal(f.level, "확인필요");
  assert.ok(f.questions?.[0].includes("1355"));
});

test("S2-3 — 미가입국에는 없는 돈을 약속하지 않는다", () => {
  const [f] = checkPensionRefund({ ...기본, nationality: "네팔" });
  assert.equal(f.level, "수령불가");
  assert.equal(f.amount, undefined);
});

/* ── 금액 ── */

test("연금납부원금 — 연도별 요율을 적용한다", () => {
  // 2023-09 ~ 2026-09: 2023~2025는 9%, 2026-01부터 9.5%
  const 원금 = 연금납부원금("2023-09-01", "2026-09-01", 2_150_000);
  const 균일9 = 2_150_000 * 0.09 * 36;
  assert.ok(원금 > 균일9, "2026년 인상분이 반영돼야 한다");
  assert.ok(원금 < 2_150_000 * 0.095 * 36);
});

test("S2-1 — 금액을 범위로 낸다 (확정값으로 말하지 않는다)", () => {
  const [f] = checkSeveranceInsurance(기본);
  assert.equal(f.level, "수령가능");
  assert.ok(f.amountRange, "amountRange가 있어야 한다");
  assert.ok(f.amountRange!.min <= f.amountRange!.max);
});

test("S2-2 — 국가군별 금액이 갈린다", () => {
  const 베트남 = checkReturnCostInsurance(기본)[0];
  const 스리랑카 = checkReturnCostInsurance({ ...기본, nationality: "스리랑카" })[0];
  const 몽골 = checkReturnCostInsurance({ ...기본, nationality: "몽골" })[0];
  assert.equal(베트남.amount, 400_000);
  assert.equal(스리랑카.amount, 600_000);
  assert.equal(몽골.amount, 500_000);
});

test("S2-2 — 본인이 낸 돈임을 반드시 말한다", () => {
  const [f] = checkReturnCostInsurance(기본);
  assert.ok(f.title.includes("본인이 납부"));
});

/* ── 근속 1년 미만: 없는 돈을 약속하면 안 되는 지점 ── */

test("S2-1 — 근속 1년 미만이면 사업주 귀속이라 수령불가", () => {
  const 짧게 = { ...기본, hireDate: "2026-01-01" };
  const [f] = checkSeveranceInsurance(짧게);
  assert.equal(f.level, "수령불가");
  assert.equal(f.amount, undefined);
});

test("S2-4 — 근속 1년 미만이면 차액도 계산하지 않는다", () => {
  assert.equal(checkSeveranceGap({ ...기본, hireDate: "2026-01-01" }).length, 0);
});

/* ── 기한 ── */

test("S2-1 — 청구 마감은 출국 7일 전이다", () => {
  const [f] = checkSeveranceInsurance(기본);
  assert.equal(f.deadline?.date, "2026-08-25"); // 09-01 − 7일
});

test("S2-1 — 마감 14일 이내면 기한임박으로 올린다", () => {
  const 임박 = { ...기본, today: "2026-08-20" };
  const [f] = checkSeveranceInsurance(임박);
  assert.equal(f.level, "기한임박");
});

test("S2-5 — 이미 출국했어도 3년 내면 청구 가능하다", () => {
  const 출국후 = { ...기본, today: "2027-03-01" };
  const [f] = checkExpiry(출국후);
  assert.equal(f.level, "기한임박");
  assert.ok(f.deadline!.daysLeft > 0);
});

/**
 * 계약이 바뀐 자리 — 2026-08-26.
 *
 * 전에는 S2-5 가 시효 초과를 혼자 선언하고, S2-1·S2-2 는 그걸 모른 채
 * "청구할 수 있습니다 · 450만원" 을 함께 냈다. 시효를 아는 룰과 돈을 말하는 룰이 달랐다.
 * 이제 각 갈래가 자기 시효를 알고 스스로 내려앉는다. S2-5 는 자기 몫이 없어져 침묵한다 —
 * 같은 문장을 세 번 띄우지 않기 위해서다.
 */
test("S2-5 — 3년이 지나면 침묵하고, 각 갈래가 스스로 수령불가를 말한다", () => {
  const 시효초과 = { ...기본, today: "2030-01-01" };
  assert.deepEqual(checkExpiry(시효초과), [], "S2-5 가 아직 말하고 있다");

  const f = judgeDeparture(시효초과);
  for (const rule of ["S2-1", "S2-2"]) {
    const x = f.find((y) => y.rule === rule);
    assert.equal(x?.level, "수령불가", `${rule} 이 수령불가가 아니다`);
    assert.equal(x?.blocksClaims, true, `${rule} 이 청구 차단을 선언하지 않는다`);
  }
});

test("S2-5 — 출국 전이면 시효 경고를 내지 않는다", () => {
  assert.equal(checkExpiry(기본).length, 0);
});

/* ── 체류자격 ── */

test("E-8(계절근로)은 출국만기·귀국비용 대상이 아니다", () => {
  const e8 = { ...기본, visa: "E-8" as const };
  assert.equal(checkSeveranceInsurance(e8).length, 0);
  assert.equal(checkReturnCostInsurance(e8).length, 0);
  // 국민연금 판정은 체류자격과 무관하게 유지된다
  assert.equal(checkPensionRefund(e8).length, 1);
});

/* ── 통합 ── */

test("judgeDeparture — 기한임박을 맨 위로 올린다", () => {
  const 임박 = { ...기본, today: "2026-08-20" };
  assert.equal(judgeDeparture(임박)[0].level, "기한임박");
});

test("총액 — 수령불가는 합계에 넣지 않는다", () => {
  const 네팔 = { ...기본, nationality: "네팔" };
  const findings = judgeDeparture(네팔);
  const 연금 = findings.find((f) => f.rule === "S2-3")!;
  assert.equal(연금.level, "수령불가");
  // 국민연금 0원이 총액에 섞여 들어가지 않는지
  assert.ok(recoverableTotal(findings) > 0);
  assert.ok(recoverableTotal(findings) < 10_000_000);
});

/* ── 결정성 계약 ── */

test("결정성 — 같은 입력을 두 번 돌리면 완전히 같다", () => {
  // 판정이 시각을 스스로 읽으면 여기가 아니라 몇 달 뒤 회귀 판정에서 터진다.
  const 입력들 = [
    기본,
    { ...기본, today: "2026-08-20" }, // 기한임박 분기
    { ...기본, today: "2027-03-01" }, // 출국 후 분기
    { ...기본, nationality: "네팔" }, // 수령불가 분기
  ];
  for (const i of 입력들)
    assert.deepEqual(
      judgeDeparture(i),
      judgeDeparture(i),
      `${i.nationality}/${i.today}: 같은 입력인데 결과가 갈렸다`,
    );
});

test("기준일을 주입하지 않으면 조용히 넘어가지 않고 던진다", () => {
  // 타입은 TypeScript 호출부만 막는다. 골든셋 JSON 과 verify-golden.mjs 는
  // 타입 검사를 거치지 않으므로 런타임 검사가 그쪽의 유일한 방어선이다.
  const 빠뜨림 = (today: unknown) =>
    judgeDeparture({ ...기본, today } as DepartureInput);
  assert.throws(() => 빠뜨림(undefined), /today/, "미주입이 통과했다");
  assert.throws(() => 빠뜨림(""), /today/, "빈 문자열이 통과했다");
  assert.throws(() => 빠뜨림("2026/07/03"), /today/, "슬래시 형식이 통과했다");
  assert.throws(() => 빠뜨림("2026-13-45"), /today/, "없는 날짜가 통과했다");
});

test("베트남과 네팔의 총액이 국민연금만큼 갈린다", () => {
  const 베트남 = recoverableTotal(judgeDeparture(기본));
  const 네팔 = recoverableTotal(
    judgeDeparture({ ...기본, nationality: "네팔" }),
  );
  assert.ok(베트남 > 네팔, "베트남이 국민연금만큼 더 많아야 한다");
  assert.ok(베트남 - 네팔 > 5_000_000, "차이가 500만원을 넘어야 한다");
});

/* ── 룰 사이 모순 (골든셋이 찾아낸 결함) ── */

/**
 * 결함 기록 — 2026-08-26, 골든셋 D03 이 드러냈다.
 *
 * 출국 후 3년이 지나 보험금이 한국산업인력공단으로 넘어간 입력에서
 * S2-5 는 "소멸시효가 지났습니다(수령불가)" 라고 말하는데, 같은 결과 안에서
 * S2-1 이 "출국만기보험을 청구할 수 있습니다 · 4,000,000원 · 기한임박 D-1499",
 * S2-2 가 "귀국비용보험을 청구할 수 있습니다 · 500,000원" 으로 함께 떴다.
 * 총액에 450만원이 들어갔다. **못 받는 돈을 받을 수 있다고 말한 것이다.**
 *
 * 가드레일 G2(수령불가에 금액 금지)가 이걸 못 잡은 이유: G2 는 판정 하나 안만 본다.
 * 룰과 룰 사이의 모순은 그때까지 아무 검사도 하지 않았다.
 */
const 시효초과: DepartureInput = {
  nationality: "캄보디아",
  visa: "E-9",
  hireDate: "2020-01-15",
  departureDate: "2022-01-15",
  monthlyWage: 2_000_000,
  today: "2026-02-15", // 출국 4년 경과 — 보험 시효 3년을 넘겼다
};

test("시효 초과 — 보험 두 갈래가 돈을 약속하지 않는다", () => {
  const f = judgeDeparture(시효초과);
  const 위반 = f
    .filter((x) => ["S2-1", "S2-2"].includes(x.rule))
    .filter((x) => x.amount !== undefined || x.amountRange !== undefined)
    .map((x) => `${x.rule}(${x.level}) 에 금액 ${x.amount}`);
  assert.deepEqual(위반, [], `시효가 지났는데 금액을 약속한다: ${위반.join(" / ")}`);
});

test("시효 초과 — 총액이 0이다", () => {
  const f = judgeDeparture(시효초과);
  const 연금 = f.find((x) => x.rule === "S2-3");
  // 국민연금은 시효가 5년이라 아직 살아 있을 수 있다. 보험 두 갈래만 0이어야 한다.
  const 보험총액 = f
    .filter((x) => ["S2-1", "S2-2", "S2-4"].includes(x.rule))
    .reduce((a, x) => a + (x.amount ?? 0), 0);
  assert.equal(보험총액, 0, `보험 총액이 ${보험총액} 이다`);
  assert.ok(연금, "국민연금 판정은 그대로 나와야 한다");
});

test("기한임박은 마감이 지나지 않았을 때만 쓴다", () => {
  const f = judgeDeparture(시효초과);
  const 거짓임박 = f
    .filter((x) => x.level === "기한임박")
    .filter((x) => (x.deadline?.daysLeft ?? 0) < 0)
    .map((x) => `${x.rule} D${x.deadline!.daysLeft}`);
  assert.deepEqual(거짓임박, [], `지난 마감을 임박이라 부른다: ${거짓임박.join(", ")}`);
});

test("출국 후 · 시효 이내 — 청구는 되지만 남은 기한은 시효일이다", () => {
  const 시효이내 = { ...시효초과, today: "2023-06-15" }; // 출국 1년 5개월 경과
  const s1 = judgeDeparture(시효이내).find((x) => x.rule === "S2-1")!;
  assert.notEqual(s1.level, "수령불가", "시효 안인데 못 받는다고 한다");
  assert.ok((s1.deadline?.daysLeft ?? -1) > 0, "남은 기한이 음수다");
});

/* ── 소멸시효 달력 계산 (2026-08-28 교정 회귀) ── */

test("소멸시효는 달력 기준 — 윤년을 지나도 'n년 뒤 같은 날'이다", () => {
  // 2025-06-15 + 3년 사이에 2028-02-29(윤일)가 있다. 365×3 산술이면 2028-06-14로
  // 하루 이르게 말한다 — 그 하루가 이 교정이 잡는 전부다.
  const fs = judgeDeparture({
    nationality: "캄보디아", visa: "E-9",
    hireDate: "2022-03-01", departureDate: "2025-06-15",
    monthlyWage: 2_000_000, today: "2026-01-01",
  });
  const s21 = fs.find((f) => f.rule === "S2-1")!;
  assert.equal(s21.deadline!.date, "2028-06-15");
});

test("2/29 출국 + 3년이 평년에 떨어지면 2/28로 내린다 (보수적)", () => {
  const fs = judgeDeparture({
    nationality: "베트남", visa: "E-9",
    hireDate: "2020-01-01", departureDate: "2024-02-29",
    monthlyWage: 2_000_000, today: "2025-01-01",
  });
  const s21 = fs.find((f) => f.rule === "S2-1")!;
  assert.equal(s21.deadline!.date, "2027-02-28");
});

test("연금 시효 5년도 달력 기준이다", () => {
  const fs = judgeDeparture({
    nationality: "베트남", visa: "E-9",
    hireDate: "2022-03-01", departureDate: "2025-06-15",
    monthlyWage: 2_000_000, today: "2026-01-01",
  });
  const s23 = fs.find((f) => f.rule === "S2-3")!;
  assert.equal(s23.deadline!.date, "2030-06-15");
});

test("연금 원금은 기준소득월액 상한에서 잘린다 — 고임금 과대 약속 방지", () => {
  // 월 700만원 > 상한(637만~659만). 클램프가 없으면 원금이 상한 기준보다 커진다.
  const 고임금 = 연금납부원금("2025-10-15", "2026-10-15", 7_000_000);
  const 상한기준 = 연금납부원금("2025-10-15", "2026-10-15", 6_370_000);
  assert.ok(고임금 <= 연금납부원금("2025-10-15", "2026-10-15", 6_590_000) + 1);
  assert.ok(고임금 >= 상한기준 - 1, "상한 구간(637→659) 사이 값이어야 한다");
  // 1000만원을 넣어도 같은 값 — 상한 위에서는 임금이 원금을 못 키운다
  assert.equal(고임금, 연금납부원금("2025-10-15", "2026-10-15", 10_000_000));
});
