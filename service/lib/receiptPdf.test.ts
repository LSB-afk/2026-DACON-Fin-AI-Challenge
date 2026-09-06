import assert from "node:assert/strict";
import { test } from "node:test";
import { createReceiptPdf, createRasterPdf, createReceiptPdfJobGuard, downloadReceiptPdf, paginateReceipt, receiptPdfFilename, receiptPdfPageHeight } from "./receiptPdf.ts";

const longRow = {
  finding: { rule: "LONG", level: "위법", title: "매우 긴 항목", basis: "테스트 근거" },
  id: "long-row",
  group: "included",
  status: "위법",
  statusLabel: "위법",
  title: "나".repeat(800),
  amountDisplay: "1,200,000원",
  detail: ["가".repeat(2_000)],
} as const;

const receipt = {
  hasRun: true,
  hasFindings: true,
  source: { caseId: "CASE-17", runId: "run-9", today: "2026-09-06", description: "급여 정산 확인" },
  money: {
    confirmed: { amount: 1200000, display: "1,200,000원" },
    estimated: { min: 50000, max: 100000, display: "50,000원 - 100,000원" },
    reviewReference: null,
    notice: "추정 금액은 확정 금액과 합산하지 않습니다.",
  },
  rows: [longRow],
  groups: { included: [longRow], review: [], excluded: [] },
  notices: ["근거를 확인한 뒤 결정하세요."],
} as const;

test("paginateReceipt preserves every character of a long unbroken finding across continuation pages", () => {
  const pages = paginateReceipt(receipt);
  const body = pages.flatMap((page) => page.lines).filter((line) => line.kind === "body").map((line) => line.text).join("");

  assert.ok(pages.length > 1, "long findings must create continuation pages instead of clipping");
  assert.ok(body.includes("가".repeat(2_000)), "no part of an unbroken finding may be silently dropped");
  assert.ok(pages.flatMap((page) => page.lines).filter((line) => line.kind === "rowTitle").map((line) => line.text).join("").includes("나".repeat(800)), "long titles must also survive pagination");
  assert.deepEqual(
    pages.map((page) => page.footer),
    pages.map((_, index) => `쪽 ${index + 1} / ${pages.length}`),
    "every page must have an accurate page number footer",
  );
});

test("paginateReceipt keeps screen group labels, rule provenance, and displayed amounts in separate columns", () => {
  const lines = paginateReceipt(receipt).flatMap((page) => page.lines);
  assert.ok(lines.some((line) => line.text === "포함한 판정"));
  assert.ok(lines.some((line) => line.text === "규칙 LONG"));
  assert.deepEqual(lines.find((line) => line.text === "확정 계산값")?.amount, "1,200,000원");
  assert.deepEqual(lines.find((line) => line.text === "판정 금액")?.amount, "1,200,000원");
});

test("paginateReceipt reserves real vertical room for stacked, prominent summary values", () => {
  const pages = paginateReceipt(receipt);
  const summary = pages.flatMap((page) => page.lines).find((line) => line.text === "확정 계산값");
  assert.equal(summary?.kind, "summaryMoney");
  assert.equal(summary?.summaryTone, "primary");
  assert.ok(pages.every((page) => receiptPdfPageHeight(page) <= 1_830), "a page must not be packed past its canvas content area");
});

test("createRasterPdf writes binary offsets that point at each object and declares every raster page", () => {
  const bytes = createRasterPdf([Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]), Uint8Array.from([0xff, 0xd8, 0xff, 0xd9])], 10, 10);
  const text = new TextDecoder("latin1").decode(bytes);

  assert.ok(text.startsWith("%PDF-1.4"));
  assert.match(text, /\/Count 2\b/);
  assert.match(text, /\/Subtype \/Image/g);
  const startXref = Number(text.match(/startxref\n(\d+)/)?.[1]);
  assert.equal(text.slice(startXref, startXref + 5), "xref\n", "startxref must point to the xref table byte offset");
  const xrefEntries = [...text.matchAll(/\n(\d{10}) 00000 n /g)].map((match) => Number(match[1]));
  assert.ok(xrefEntries.length >= 8);
  for (const offset of xrefEntries) assert.match(text.slice(offset, offset + 20), /^\d+ 0 obj\n/);
});

test("createReceiptPdf stops before drawing if the browser cannot confirm the Korean font", async () => {
  await assert.rejects(() => createReceiptPdf(receipt, {} as Document), /글꼴/);
});

test("downloadReceiptPdf releases a Blob URL and exposes a browser download failure", () => {
  let revoked = "";
  const blockedDocument = {
    createElement: () => ({ style: {}, click() {}, remove() {} }),
    body: { append: () => { throw new Error("download blocked"); } },
  } as unknown as Document;
  const urlApi = { createObjectURL: () => "blob:receipt", revokeObjectURL: (value: string) => { revoked = value; } };

  assert.throws(() => downloadReceiptPdf(new Blob(["pdf"]), "CASE-17-2026-09-06.pdf", blockedDocument, urlApi), /download blocked/);
  assert.equal(revoked, "blob:receipt");
});

test("receiptPdfFilename retains only the document type, sanitized case ID, and criterion date", () => {
  assert.equal(receiptPdfFilename({ ...receipt, source: { caseId: "C/01?", today: "2026-09-06" } }), "paycheck-receipt-C-01-2026-09-06.pdf");
});

test("receipt PDF job guard rejects a pending completion after leaving the artifacts view", () => {
  const guard = createReceiptPdfJobGuard();
  const pending = guard.begin();
  guard.invalidate();
  assert.equal(guard.isCurrent(pending), false);
});
