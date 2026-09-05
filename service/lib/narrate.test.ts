/**
 * 답변 조립 검증 — 가드레일이 판정에 거는 금지를 문장 틀도 지키는지 잰다.
 * 조립이 뚫리면 가드레일은 통과했는데 사용자 문장에서 사고가 나는 길이 생긴다.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { narrate } from "./narrate.ts";
import { moneyTotals } from "./rules/types.ts";
import type { Finding } from "./rules/types.ts";

const 고지 = ["이 결과는 법률 자문이 아닙니다."];

const 수령불가: Finding = {
  rule: "S2-1",
  level: "수령불가",
  title: "출국만기보험 — 근속 12개월 미만",
  basis: "외국인고용법 §13",
  track: "보험",
  blocksClaims: true,
};

const 기한임박: Finding = {
  rule: "S2-2",
  level: "기한임박",
  title: "귀국비용보험 일괄 신청",
  amount: 400_000,
  basis: "외국인고용법 §13",
  deadline: { label: "청구 마감", date: "2026-10-08", daysLeft: 1 },
  track: "보험",
};

const 확인필요: Finding = {
  rule: "A7",
  level: "확인필요",
  title: "연장수당 가산 여부",
  basis: "근로기준법 §56",
  questions: ["사업장의 상시 근로자 수가 5인 이상인가요?"],
};

const 추정: Finding = {
  rule: "S2-3",
  level: "수령가능",
  title: "국민연금 반환일시금",
  amount: 7_280_000,
  amountRange: { min: 7_000_000, max: 7_500_000 },
  basis: "국민연금법 §126",
  track: "국민연금",
};

test("수령불가는 금액 문장을 만들지 않는다 (G2와 같은 금지)", () => {
  const a = narrate([수령불가], 고지);
  const 전문 = a.blocks.flatMap((b) => b.lines).join(" ");
  assert.ok(!/원/.test(전문.replace(/§/g, "")), `금액이 새어 나왔다: ${전문}`);
  assert.match(전문, /받을 수 없습니다/);
});

test("기한임박은 마감일과 남은 일수가 첫 줄에 온다 (G7)", () => {
  const a = narrate([기한임박], 고지);
  const 첫줄 = a.blocks[0].lines[0];
  assert.match(첫줄, /2026-10-08/);
  assert.match(첫줄, /1일 남았습니다/);
  assert.match(a.headline, /2026-10-08/);
});

test("확인필요는 단정 대신 질문을 돌려준다 (G5)", () => {
  const a = narrate([확인필요], 고지);
  const 전문 = a.blocks[0].lines.join(" ");
  assert.match(전문, /단정하지 않았습니다/);
  assert.match(전문, /5인 이상인가요/);
  assert.ok(a.todo.some((t) => t.includes("답 주시면")), "할 일에 질문이 없다");
});

test("추정 금액은 범위로만 말한다 (G3)", () => {
  const a = narrate([추정], 고지);
  const 전문 = a.blocks[0].lines.join(" ");
  assert.match(전문, /약 7,000,000원 ~ 7,500,000원/);
  assert.ok(!전문.includes("7,280,000원"), "점추정이 그대로 나갔다");
});

test("정렬은 심각도순이고 필수 고지는 항상 실린다", () => {
  const a = narrate([수령불가, 추정, 확인필요, 기한임박], 고지);
  assert.deepEqual(
    a.blocks.map((b) => b.level),
    ["기한임박", "수령가능", "확인필요", "수령불가"],
  );
  assert.deepEqual(a.notices, 고지);
});

test("같은 입력이면 같은 답변 — 시각을 읽지 않는다", () => {
  const 한번 = narrate([기한임박, 확인필요], 고지);
  const 두번 = narrate([기한임박, 확인필요], 고지);
  assert.deepEqual(한번, 두번);
});

test("판정이 없으면 없는 대로 말한다", () => {
  const a = narrate([], 고지);
  assert.match(a.headline, /없습니다/);
  assert.equal(a.blocks.length, 0);
});

/* ── 금액 3분류 (2026-08-28) — 확정·추정·확인필요를 절대 한 숫자로 합치지 않는다 ── */

test("headline은 확정과 추정을 분리해 말하고, 합산 숫자를 만들지 않는다", () => {
  const 확정건: Finding = {
    rule: "S2-2", level: "수령가능", title: "귀국비용보험",
    amount: 400_000, basis: "외국인고용법 §15", track: "보험",
  };
  const a = narrate([확정건, 추정], 고지);
  assert.match(a.headline, /확정 금액 400,000원/);
  assert.match(a.headline, /약 7,000,000원 ~ 7,500,000원/);
  // 합산액(7,400,000 / 7,900,000 / 7,680,000류)이 어디에도 없어야 한다
  assert.ok(!/7,68|7,40|7,90/.test(a.headline), `합산이 새어 나왔다: ${a.headline}`);
});

test("확인필요 참고 금액은 어느 합계에도 들어가지 않는다 (moneyTotals)", () => {
  const 차액: Finding = {
    rule: "S2-4", level: "확인필요", title: "퇴직금 차액",
    amount: 1_000_000, basis: "외국인고용법 §13②",
  };
  const t = moneyTotals([차액, 추정]);
  assert.equal(t.확정, 0);
  assert.deepEqual(t.추정, { min: 7_000_000, max: 7_500_000 });
  assert.equal(t.확인필요참고, 1_000_000); // 따로 표시될 뿐, 확정·추정 어디에도 없다
});

test("수령불가·정상은 어떤 합계에도 잡히지 않는다", () => {
  const t = moneyTotals([수령불가]);
  assert.deepEqual(t, { 확정: 0, 추정: null, 확인필요참고: 0 });
});
