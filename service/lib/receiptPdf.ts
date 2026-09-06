import type { ReceiptModel } from "./receipt";

const A4_WIDTH = 1654;
const A4_HEIGHT = 2339;
const MAX_CONTENT_HEIGHT = 1830;
const encoder = new TextEncoder();

/** Cancels stale async PDF completions when the user changes result or leaves the view. */
export function createReceiptPdfJobGuard() {
  let revision = 0;
  return {
    begin: () => ++revision,
    isCurrent: (job: number) => job === revision,
    invalidate: () => { revision += 1; },
  };
}

export type ReceiptPdfLine = {
  text: string;
  kind: "title" | "section" | "body" | "money" | "summaryMoney" | "notice" | "rowTitle" | "rule";
  indent?: number;
  amount?: string;
  summaryTone?: "primary" | "secondary" | "reference";
};
export type ReceiptPdfPage = { lines: readonly ReceiptPdfLine[]; footer: string };

function wrapped(text: string, width = 44): string[] {
  if (!text) return ["—"];
  const out: string[] = [];
  let rest = text.trim();
  while (rest.length > width) {
    let end = rest.lastIndexOf(" ", width);
    if (end < Math.floor(width / 2)) end = width;
    out.push(rest.slice(0, end));
    rest = rest.slice(end).trimStart();
  }
  if (rest) out.push(rest);
  return out;
}

function lines(text: string, kind: ReceiptPdfLine["kind"] = "body", indent?: number, amount?: string): ReceiptPdfLine[] {
  return wrapped(text).map((part, index) => ({ text: part, kind, indent, ...(index === 0 && amount ? { amount } : {}) }));
}

function summaryLine(text: string, amount: string, summaryTone: NonNullable<ReceiptPdfLine["summaryTone"]>): ReceiptPdfLine {
  return { text, amount, kind: "summaryMoney", summaryTone };
}

function lineHeight(line: ReceiptPdfLine): number {
  if (line.kind === "title") return 68;
  if (line.kind === "section") return 68;
  if (line.kind === "rowTitle") return 58;
  if (line.kind === "summaryMoney") return line.summaryTone === "primary" ? 132 : line.summaryTone === "secondary" ? 106 : 82;
  return 43;
}

/** Canvas-space height reserved by a page's printable content, excluding its static heading/footer. */
export function receiptPdfPageHeight(page: Pick<ReceiptPdfPage, "lines">): number {
  return page.lines.reduce((height, line) => height + lineHeight(line), 0);
}

/** Pure layout, intentionally using ready-to-display ReceiptModel values without recalculating money. */
export function paginateReceipt(receipt: ReceiptModel): ReceiptPdfPage[] {
  const groupBlocks = [
    ["포함한 판정", "확정 계산값 또는 추정 범위가 있을 수 있는 항목", receipt.groups.included],
    ["확인할 항목", "참고 금액은 별도로 확인합니다", receipt.groups.review],
    ["합산하지 않은 항목", "정상 결과와 수령 불가 결과를 구분해 남깁니다", receipt.groups.excluded],
  ] as const;
  const blocks: Array<{ lines: ReceiptPdfLine[]; continuation?: ReceiptPdfLine }> = [
    { lines: lines("판정 결과 영수증", "title") },
    { lines: lines(receipt.source.description ?? "판정 결과") },
    { lines: lines(`판정 기준일 ${receipt.source.today ?? "—"}`) },
    ...(receipt.source.caseId ? [{ lines: lines(`사례 ID ${receipt.source.caseId}`) }] : []),
    ...(receipt.source.runId ? [{ lines: lines(`실행 ID ${receipt.source.runId}`) }] : []),
    { lines: lines("금액 요약", "section") },
    ...(receipt.money.confirmed ? [{ lines: [summaryLine("확정 계산값", receipt.money.confirmed.display, "primary")] }] : []),
    ...(receipt.money.estimated ? [{ lines: [summaryLine("추정 범위", receipt.money.estimated.display, receipt.money.confirmed ? "secondary" : "primary")] }] : []),
    ...(receipt.money.reviewReference ? [{ lines: [summaryLine("확인 필요 참고", receipt.money.reviewReference.display, "reference")] }] : []),
    ...(!receipt.money.confirmed && !receipt.money.estimated && !receipt.money.reviewReference ? [{ lines: lines("표시할 금액이 없습니다.", "notice") }] : []),
    ...(receipt.money.notice ? [{ lines: lines(receipt.money.notice, "notice") }] : []),
    ...(receipt.hasRun
      ? receipt.rows.length
        ? groupBlocks.flatMap(([title, description, rows]) => rows.length === 0 ? [] : [
            { lines: [...lines(title, "section"), ...lines(description, "notice")] },
            ...rows.map((row) => ({
              lines: [
                ...lines(`${row.statusLabel} · ${row.title}`, "rowTitle"),
                ...lines(`규칙 ${row.finding.rule}`, "rule"),
                ...(row.amountDisplay ? lines("판정 금액", "money", 1, row.amountDisplay) : []),
                ...row.detail.flatMap((detail) => lines(detail, "body", 1)),
              ],
              continuation: { text: "계속 · 항목 상세", kind: "rowTitle" as const },
            })),
          ])
        : [{ lines: lines("실행은 완료되었고, 표시할 판정 항목이 없습니다.") }]
      : [{ lines: lines("아직 판정을 실행하지 않았습니다.", "notice") }]),
    ...(receipt.notices.length ? [{ lines: lines("안내", "section") }, ...receipt.notices.map((notice) => ({ lines: lines(notice, "notice") }))] : []),
  ];
  const pages: ReceiptPdfLine[][] = [[]];
  let used = 0;
  for (const block of blocks) {
    const remaining = [...block.lines];
    let isContinuation = false;
    const blockHeight = remaining.reduce((height, item) => height + lineHeight(item), 0);
    if (used > 0 && blockHeight <= MAX_CONTENT_HEIGHT && used + blockHeight > MAX_CONTENT_HEIGHT) { pages.push([]); used = 0; }
    while (remaining.length) {
      if (isContinuation && used === 0 && block.continuation) {
        pages.at(-1)!.push(block.continuation);
        used += lineHeight(block.continuation);
      }
      let added = false;
      while (remaining.length && used + lineHeight(remaining[0]) <= MAX_CONTENT_HEIGHT) {
        const item = remaining.shift()!;
        pages.at(-1)!.push(item);
        used += lineHeight(item);
        added = true;
      }
      if (remaining.length) {
        if (!added && used === 0) throw new Error("Receipt PDF line exceeds the printable page height.");
        pages.push([]);
        used = 0;
        isContinuation = true;
      }
    }
  }
  return pages.map((page, index, all) => ({ lines: page, footer: `쪽 ${index + 1} / ${all.length}` }));
}

function ascii(value: string): Uint8Array { return encoder.encode(value); }
function join(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) { out.set(part, at); at += part.length; }
  return out;
}
function object(id: number, contents: Uint8Array): Uint8Array { return join([ascii(`${id} 0 obj\n`), contents, ascii("\nendobj\n")]); }

/** A minimal PDF 1.4 writer, with exact binary byte offsets in its xref table. */
export function createRasterPdf(jpegs: readonly Uint8Array[], width = A4_WIDTH, height = A4_HEIGHT): Uint8Array {
  if (!jpegs.length) throw new Error("PDF needs at least one page.");
  const pageIds = jpegs.map((_, index) => 3 + index * 3);
  const objects: Uint8Array[] = [
    object(1, ascii("<< /Type /Catalog /Pages 2 0 R >>")),
    object(2, ascii(`<< /Type /Pages /Count ${jpegs.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`)),
  ];
  for (let index = 0; index < jpegs.length; index += 1) {
    const pageId = pageIds[index], imageId = pageId + 1, contentId = pageId + 2;
    const contents = ascii(`q\n595.44 0 0 841.68 0 0 cm\n/Im${index + 1} Do\nQ\n`);
    objects.push(object(pageId, ascii(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.44 841.68] /Resources << /XObject << /Im${index + 1} ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`)));
    objects.push(object(imageId, join([ascii(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegs[index].length} >>\nstream\n`), jpegs[index], ascii("\nendstream")] )));
    objects.push(object(contentId, join([ascii(`<< /Length ${contents.length} >>\nstream\n`), contents, ascii("endstream")] )));
  }
  const header = ascii("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  const offsets: number[] = [0];
  let offset = header.length;
  for (const part of objects) { offsets.push(offset); offset += part.length; }
  const xref = ascii(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((item) => `${String(item).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF\n`);
  return join([header, ...objects, xref]);
}

function jpegBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1];
  if (!base64) throw new Error("Canvas did not produce a JPEG image.");
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

async function loadFonts(documentRef: Document, text: string): Promise<void> {
  if (!documentRef.fonts) throw new Error("이 브라우저에서는 영수증 글꼴을 확인할 수 없습니다.");
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const failed = new Promise<never>((_, reject) => {
    timeout = globalThis.setTimeout(() => reject(new Error("영수증 글꼴을 불러오는 시간이 초과되었습니다. 다시 시도하세요.")), 12_000);
  });
  try {
    await Promise.race([
      Promise.all([
        documentRef.fonts.load('400 28px "Pretendard Variable"', text),
        documentRef.fonts.load('600 30px "Pretendard Variable"', text),
        documentRef.fonts.load('700 52px "Pretendard Variable"', text),
        documentRef.fonts.ready,
      ]),
      failed,
    ]);
  } catch (error) {
    throw error instanceof Error ? error : new Error("영수증 글꼴을 확인할 수 없습니다.");
  } finally {
    if (timeout) globalThis.clearTimeout(timeout);
  }
}

function drawPage(canvas: HTMLCanvasElement, page: ReceiptPdfPage): Uint8Array {
  canvas.width = A4_WIDTH; canvas.height = A4_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("영수증 캔버스를 만들 수 없습니다.");
  context.fillStyle = "#fff"; context.fillRect(0, 0, A4_WIDTH, A4_HEIGHT);
  context.fillStyle = "#17212b"; context.font = '500 29px "Pretendard Variable", Pretendard, sans-serif'; context.fillText("금융 AI 판정 결과", 130, 140);
  context.strokeStyle = "#b7c1ca"; context.lineWidth = 2; context.beginPath(); context.moveTo(130, 170); context.lineTo(A4_WIDTH - 130, 170); context.stroke();
  let y = 245;
  for (const item of page.lines) {
    if (item.kind === "summaryMoney") {
      const amountSize = item.summaryTone === "primary" ? 66 : item.summaryTone === "secondary" ? 50 : 38;
      context.fillStyle = "#536170";
      context.font = '600 27px "Pretendard Variable", Pretendard, sans-serif';
      context.fillText(item.text, 130, y);
      context.fillStyle = item.summaryTone === "reference" ? "#536170" : "#0b5f78";
      context.font = `700 ${amountSize}px "Pretendard Variable", Pretendard, sans-serif`;
      context.textAlign = "right";
      context.fillText(item.amount!, A4_WIDTH - 130, y + amountSize + 12);
      context.textAlign = "left";
      y += lineHeight(item);
      continue;
    }
    context.font = item.kind === "title" ? '700 52px "Pretendard Variable", Pretendard, sans-serif' : item.kind === "section" ? '700 31px "Pretendard Variable", Pretendard, sans-serif' : item.kind === "money" || item.kind === "rowTitle" ? '600 30px "Pretendard Variable", Pretendard, sans-serif' : '400 28px "Pretendard Variable", Pretendard, sans-serif';
    if (item.kind === "section") {
      context.fillStyle = "#edf3f7"; context.fillRect(130, y - 34, A4_WIDTH - 260, 45);
    }
    context.fillStyle = item.kind === "notice" || item.kind === "rule" ? "#5e6670" : "#17212b";
    context.fillText(item.text, 130 + (item.indent ?? 0) * 38, y);
    if (item.amount) {
      context.fillStyle = "#0b5f78";
      context.textAlign = "right";
      context.fillText(item.amount, A4_WIDTH - 130, y);
      context.textAlign = "left";
    }
    y += lineHeight(item);
  }
  context.fillStyle = "#536170"; context.font = "400 24px Pretendard, sans-serif"; context.fillText(page.footer, A4_WIDTH - 270, A4_HEIGHT - 105);
  return jpegBytes(canvas.toDataURL("image/jpeg", 0.94));
}

export async function createReceiptPdf(receipt: ReceiptModel, documentRef: Document = document): Promise<Blob> {
  if (!receipt.hasRun) throw new Error("판정을 실행한 뒤 PDF 영수증을 만들 수 있습니다.");
  const pages = paginateReceipt(receipt);
  await loadFonts(documentRef, pages.flatMap((page) => page.lines).map((line) => `${line.text} ${line.amount ?? ""}`).join("\n"));
  const bytes = createRasterPdf(pages.map((page) => drawPage(documentRef.createElement("canvas"), page)));
  return new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
}

export function receiptPdfFilename(receipt: ReceiptModel): string {
  const safe = (value: string | undefined) => value?.replace(/[^A-Za-z0-9가-힣_-]+/g, "-").replace(/^-+|-+$/g, "");
  const pieces = [safe(receipt.source.caseId), safe(receipt.source.today)].filter((item): item is string => Boolean(item));
  return `paycheck-receipt${pieces.length ? `-${pieces.join("-")}` : ""}.pdf`;
}

export function downloadReceiptPdf(
  blob: Blob,
  filename: string,
  documentRef: Document = document,
  urlApi: Pick<typeof URL, "createObjectURL" | "revokeObjectURL"> = URL,
): void {
  const href = urlApi.createObjectURL(blob), link = documentRef.createElement("a");
  try {
    link.href = href; link.download = filename; link.style.display = "none";
    documentRef.body.append(link); link.click(); link.remove();
    globalThis.setTimeout(() => urlApi.revokeObjectURL(href), 1000);
  } catch (error) {
    link.remove();
    urlApi.revokeObjectURL(href);
    throw error;
  }
}
