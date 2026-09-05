/**
 * 번역 계약 검증 — 모델이 실제로 저지르는 실수를 픽스처로 재현한다.
 * 네트워크 없음: 계약은 순수 함수라 제공자 없이 전부 검증된다.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { pack, unpack, 숫자보존위반, rebuild, 프롬프트 } from "./contract.ts";
import type { Answer } from "../narrate.ts";

const 답변: Answer = {
  headline: "확인된 금액이 약 14,171,621원 있습니다.",
  blocks: [
    {
      rule: "S2-2",
      level: "기한임박",
      lines: [
        "⟨기한⟩ 청구 마감은 2026-10-08 까지, 오늘부터 42일 남았습니다.",
        "해당 금액은 400,000원 입니다.",
      ],
    },
  ],
  todo: ["2026-10-08 까지 — 청구 마감 (S2-2)"],
  notices: ["이 결과는 법률 자문이 아닙니다."],
};

test("pack → rebuild 왕복은 구조를 지킨다", () => {
  const lines = pack(답변);
  assert.equal(lines.length, 5);
  const 재조립 = rebuild(답변, lines);
  assert.deepEqual(재조립, 답변);
});

test("unpack — 정상 출력과 앞뒤 잡담 줄", () => {
  const raw =
    "Sure, here is the translation:\n1| A\n2| B\n3| C\n4| D\n5| E\n(done)";
  assert.deepEqual(unpack(raw, 5), ["A", "B", "C", "D", "E"]);
});

test("unpack — 줄이 빠지면 던진다", () => {
  assert.throws(() => unpack("1| A\n3| C", 3), /줄 2/);
});

test("unpack — 줄이 비면 던진다", () => {
  assert.throws(() => unpack("1| A\n2|\n3| C", 3), /줄 2/);
});

test("unpack — 같은 줄이 두 번 오면 던진다", () => {
  assert.throws(() => unpack("1| A\n1| A2\n2| B", 2), /두 번/);
});

test("숫자보존 — 그대로면 통과, 쉼표 표기 차이도 통과", () => {
  const 원문 = ["약 14,171,621원 입니다", "마감 2026-10-08 · D-42"];
  const 정상 = ["Khoảng 14,171,621 won", "Hạn 2026-10-08 · D-42"];
  const 쉼표없이 = ["Khoảng 14171621 won", "Hạn 2026-10-08 · D-42"];
  assert.deepEqual(숫자보존위반(원문, 정상), []);
  assert.deepEqual(숫자보존위반(원문, 쉼표없이), []);
});

test("숫자보존 — 금액이 바뀌면 잡는다 (판정 위조 차단)", () => {
  const 위반 = 숫자보존위반(
    ["예상 금액은 약 7,062,750원 입니다"],
    ["Dự kiến khoảng 7,062,570 won"], // 자릿수 뒤바뀜 — 실제 소형 모델 사고 유형
  );
  assert.equal(위반.length, 1);
  assert.match(위반[0], /7062750/);
});

test("숫자보존 — 날짜를 현지식으로 줄이면 잡는다", () => {
  const 위반 = 숫자보존위반(
    ["마감은 2026-10-08 입니다"],
    ["Hạn chót là ngày 8 tháng 10 năm 2026"], // 08 → 8
  );
  assert.equal(위반.length, 1);
});

test("숫자보존 — 숫자를 슬쩍 더하면 잡는다", () => {
  const 위반 = 숫자보존위반(["신청하세요"], ["3일 안에 신청하세요"]);
  assert.equal(위반.length, 1);
});

test("프롬프트에는 줄번호 형식과 숫자 금지 규칙이 실린다", () => {
  const p = 프롬프트("베트남어", ["가", "나"]);
  assert.match(p, /1\| 가/);
  assert.match(p, /2\| 나/);
  assert.match(p, /바꾸지 마/);
});
