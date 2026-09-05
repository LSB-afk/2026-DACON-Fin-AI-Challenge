import { test } from "node:test";
import assert from "node:assert/strict";
import { createTranslationRequests, translationFailureStatus } from "./translationLifecycle.ts";

test("a late translation cannot replace a newer language even if transport ignores abort", async () => {
  const requests = createTranslationRequests();
  const old = requests.begin("case-A/run-1/rev-1/answer-A");
  let release!: () => void;
  let visible = "original";
  const late = new Promise<void>((resolve) => { release = resolve; }).then(() => {
    if (requests.isCurrent(old)) visible = "Vietnamese";
  });
  const current = requests.begin("case-A/run-1/rev-1/answer-A");
  if (requests.isCurrent(current)) visible = "English";
  release();
  await late;
  assert.equal(visible, "English");
  assert.equal(old.controller.signal.aborted, true);
});

test("answer edits, case/run changes and original-language selection invalidate pending callbacks", () => {
  const requests = createTranslationRequests();
  for (const scope of ["A/1/1/answer", "A/1/2/edited", "A/2/0/new-run", "B/1/0/new-case"]) {
    const token = requests.begin(scope);
    requests.cancel();
    assert.equal(requests.isCurrent(token), false);
    assert.equal(token.controller.signal.aborted, true);
  }
});

test("a late finally callback cannot clear a newer request's busy state", () => {
  const requests = createTranslationRequests();
  const old = requests.begin("answer");
  const current = requests.begin("answer");
  let busy = true;
  if (requests.isCurrent(old)) busy = false;
  assert.equal(busy, true);
  assert.equal(requests.isCurrent(current), true);
});

test("contract failure is distinct from service or network failure", () => {
  assert.equal(translationFailureStatus("숫자 보존 위반 1건 — 2,150,000"), "rejected");
  assert.equal(translationFailureStatus("줄 3 이 두 번 왔다"), "rejected");
  assert.equal(translationFailureStatus("fetch failed"), "failed");
  assert.equal(translationFailureStatus("번역 제공자가 없습니다"), "failed");
});
