import { test } from "node:test";
import assert from "node:assert/strict";
import { TUTORIAL, tutorialStep } from "./tutorial.ts";

test("튜토리얼 — 다섯 장, id 중복 없음, 순서 고정", () => {
  assert.equal(TUTORIAL.length, 5);
  assert.deepEqual(TUTORIAL.map((s) => s.id), ["what", "how", "read", "trust", "around"]);
});

test("튜토리얼 — 모든 장에 제목·대사·요점이 비지 않는다, 장당 요점 4개 이하", () => {
  for (const s of TUTORIAL) {
    for (const k of ["eyebrow", "title", "bubble", "lead"] as const)
      assert.ok(s[k].trim().length > 0, `${s.id}.${k} 비어 있음`);
    assert.ok(s.points.length >= 1 && s.points.length <= 4, `${s.id} 요점 수 ${s.points.length}`);
    for (const p of s.points) {
      assert.ok(p.head.trim() && p.body.trim(), `${s.id} 요점 비어 있음`);
      assert.ok(p.body.length <= 80, `${s.id} 요점이 너무 길다(${p.body.length}자): ${p.body}`);
    }
  }
});

test("튜토리얼 — 손으로 적은 숫자 없음 (룰 개수·가드레일 번호는 카탈로그에서 읽는다)", () => {
  for (const s of TUTORIAL) {
    const text = [s.title, s.lead, ...s.points.map((p) => p.head + p.body)].join(" ");
    assert.ok(!/G\d|\d+개 룰|룰 \d+/.test(text), `${s.id} 에 손으로 적은 개수가 있다`);
  }
});

test("tutorialStep — 범위 밖은 양 끝으로", () => {
  assert.equal(tutorialStep(-3).id, "what");
  assert.equal(tutorialStep(99).id, "around");
  assert.equal(tutorialStep(2).id, "read");
});
