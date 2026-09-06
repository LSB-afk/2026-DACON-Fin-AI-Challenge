import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReceipt } from "./receipt.ts";
import type { Finding } from "./rules/types.ts";

const finding = (patch: Partial<Finding>): Finding => ({
  rule: "S2-1",
  level: "수령가능",
  title: "보험금을 확인합니다",
  basis: "입력된 근거",
  ...patch,
});

test("mixed money keeps confirmed, estimated, and review reference separate", () => {
  const receipt = buildReceipt({
    ran: true,
    source: { caseId: "C-01", runId: "run-7", today: "2026-09-06", description: "현재 입력 설명" },
    findings: [
      finding({ rule: "A1", level: "위법", amount: 120_000 }),
      finding({ rule: "S2-3", amountRange: { min: 300_000, max: 420_000 } }),
      finding({ rule: "S2-4", level: "확인필요", amount: 90_000 }),
    ],
  });

  assert.deepEqual(receipt.money.confirmed, { amount: 120_000, display: "120,000원" });
  assert.deepEqual(receipt.money.estimated, { min: 300_000, max: 420_000, display: "300,000원 ~ 420,000원" });
  assert.deepEqual(receipt.money.reviewReference, { amount: 90_000, display: "90,000원" });
  assert.equal(receipt.groups.included.length, 2);
  assert.equal(receipt.groups.review.length, 1);
  assert.match(receipt.money.notice, /보장하지 않습니다/);
});

test("normal, unavailable, and review findings never become included money", () => {
  const receipt = buildReceipt({
    ran: true,
    findings: [
      finding({ rule: "P1", level: "정상", amount: 700_000 }),
      finding({ rule: "S2-5", level: "수령불가", amount: 800_000 }),
      finding({ rule: "S2-4", level: "확인필요", amount: 50_000 }),
    ],
  });

  assert.equal(receipt.money.confirmed, null);
  assert.equal(receipt.groups.included.length, 0);
  assert.equal(receipt.groups.review[0].amountDisplay, "50,000원");
  assert.equal(receipt.groups.excluded[0].statusLabel, "정상·합산 대상 아님");
  assert.equal(receipt.groups.excluded[0].amountDisplay, null);
  assert.equal(receipt.groups.excluded[1].statusLabel, "수령 불가·합산 대상 아님");
});

test("unrun and executed-empty receipts are distinct", () => {
  assert.equal(buildReceipt({ ran: false, findings: [] }).hasRun, false);
  const executed = buildReceipt({ ran: true, findings: [] });
  assert.equal(executed.hasRun, true);
  assert.equal(executed.hasFindings, false);
  assert.equal(executed.money.confirmed, null);
});

test("explicit zero remains visible while unknown money remains absent", () => {
  const receipt = buildReceipt({
    ran: true,
    findings: [
      finding({ rule: "A0", level: "위법", amount: 0 }),
      finding({ rule: "A?", level: "위법" }),
      finding({ rule: "R0", level: "확인필요", amount: 0 }),
    ],
  });

  assert.deepEqual(receipt.money.confirmed, { amount: 0, display: "0원" });
  assert.deepEqual(receipt.money.reviewReference, { amount: 0, display: "0원" });
  assert.equal(receipt.rows.find((row) => row.finding.rule === "A?")?.amountDisplay, null);
});

test("long source text and findings are projected without mutating inputs", () => {
  const original = finding({
    title: "아주 긴 제목 ".repeat(60),
    amountRange: { min: 1, max: 2 },
    questions: ["확인 질문"],
    deadline: { label: "기한", date: "2026-12-31", daysLeft: 116 },
  });
  const input = [original];
  const receipt = buildReceipt({ ran: true, findings: input, source: { description: "현재 입력 설명 ".repeat(80) } });

  assert.equal(receipt.rows[0].title, original.title);
  assert.notEqual(receipt.rows[0].finding, original);
  assert.deepEqual(input, [original]);
  assert.equal(receipt.source.description, "현재 입력 설명 ".repeat(80));
});

test("source metadata only preserves supplied identifiers and criterion date", () => {
  const receipt = buildReceipt({ ran: true, findings: [], source: { caseId: "C-02", today: "2026-09-06" } });
  assert.deepEqual(receipt.source, { caseId: "C-02", today: "2026-09-06" });
  assert.equal("issuedAt" in receipt.source, false);
});
