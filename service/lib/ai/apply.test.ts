/**
 * 기본값 금지 검증 — 추출이 비운 자리를 픽스처가 조용히 채우는 길이 없는지 잰다.
 * 마지막 테스트가 이 파일의 존재 이유다: 추출값이 실제 판정 함수까지 흐른다.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { toDepartureInput } from "./apply.ts";
import { judgeDeparture } from "../rules/departure.ts";

const 완전 = {
  nationality: "베트남",
  visa: "E-9",
  hireDate: "2023-10-15",
  departureDate: "2026-10-15",
  monthlyWage: 2_150_000,
};

test("필수 필드가 전부 있으면 판정 입력이 완성된다", () => {
  const r = toDepartureInput(완전, "2026-08-28");
  assert.ok(r.ok);
  assert.deepEqual(r.input, { ...완전, today: "2026-08-28" });
});

test("국적이 없으면 기본값 대신 되묻는다", () => {
  const r = toDepartureInput({ ...완전, nationality: undefined }, "2026-08-28");
  assert.ok(!r.ok);
  assert.ok(r.missing.includes("국적"));
  assert.ok(r.questions.some((q) => q.includes("국민연금")), "왜 묻는지 없이 묻는다");
});

test("비자가 목록 밖 값이면(F-2 등) 체류자격을 묻는다", () => {
  const r = toDepartureInput({ ...완전, visa: "F-2" }, "2026-08-28");
  assert.ok(!r.ok);
  assert.ok(r.missing.includes("체류자격"));
});

test("날짜 형식이 깨지면 그 날짜를 묻는다 — 조용히 파싱하지 않는다", () => {
  const r = toDepartureInput({ ...완전, departureDate: "10월 15일" }, "2026-08-28");
  assert.ok(!r.ok);
  assert.ok(r.missing.includes("출국일"));
});

test("임금이 0 이하·비수치면 묻는다", () => {
  const r = toDepartureInput({ ...완전, monthlyWage: 0 }, "2026-08-28");
  assert.ok(!r.ok);
  assert.ok(r.missing.includes("월 평균임금"));
});

test("빠진 것이 여럿이면 전부 모아 한 번에 묻는다", () => {
  const r = toDepartureInput({}, "2026-08-28");
  assert.ok(!r.ok);
  assert.equal(r.missing.length, 5);
  assert.equal(r.questions.length, 5);
});

test("통합 — 추출값이 판정 함수에 그대로 흐르고, 국적이 결과를 바꾼다", () => {
  const 베트남 = toDepartureInput(완전, "2026-08-28");
  const 네팔 = toDepartureInput({ ...완전, nationality: "네팔" }, "2026-08-28");
  assert.ok(베트남.ok && 네팔.ok);

  const f베트남 = judgeDeparture(베트남.input);
  const f네팔 = judgeDeparture(네팔.input);

  // 같은 조건, 국적만 다름 — 연금 판정이 갈려야 한다. 갈리지 않으면
  // 어딘가에서 기본값이 국적을 덮었다는 뜻이다.
  const 연금베트남 = f베트남.find((f) => f.rule === "S2-3")!;
  const 연금네팔 = f네팔.find((f) => f.rule === "S2-3")!;
  assert.equal(연금베트남.level, "수령가능");
  assert.equal(연금네팔.level, "수령불가");
  assert.equal(연금네팔.amount, undefined);
});
