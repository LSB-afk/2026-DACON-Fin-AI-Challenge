"use client";

import { useEffect, useRef, useState } from "react";
import type { ReceiptModel } from "@/lib/receipt";
import { createReceiptPdf, createReceiptPdfJobGuard, downloadReceiptPdf, receiptPdfFilename } from "@/lib/receiptPdf";
import { ReceiptView } from "./_receipt";
import type { RunEntry } from "./_views";
import { EmptyBox, Pill, SectionHead, Sentences } from "./_ui";
import styles from "./_artifacts.module.css";

export function ArtifactsView({ runs, latestJson, receipt }: { runs: RunEntry[]; latestJson: string; receipt: ReceiptModel }) {
  const [copied, setCopied] = useState(false);
  const [pdfResult, setPdfResult] = useState<{ receipt: ReceiptModel; state: "busy" | "done" | "error"; error: string | null } | null>(null);
  const job = useRef(createReceiptPdfJobGuard());
  const latestReceipt = useRef(receipt);
  useEffect(() => {
    const guard = job.current;
    latestReceipt.current = receipt;
    return () => { guard.invalidate(); };
  }, [receipt]);
  const pdfState = pdfResult?.receipt === receipt ? pdfResult.state : "idle";
  const pdfError = pdfResult?.receipt === receipt ? pdfResult.error : null;

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(latestJson);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const makePdf = async () => {
    if (!receipt.hasRun || pdfState === "busy") return;
    const currentJob = job.current.begin();
    setPdfResult({ receipt, state: "busy", error: null });
    try {
      const blob = await createReceiptPdf(receipt);
      if (!job.current.isCurrent(currentJob) || latestReceipt.current !== receipt) return;
      downloadReceiptPdf(blob, receiptPdfFilename(receipt));
      if (job.current.isCurrent(currentJob) && latestReceipt.current === receipt) setPdfResult({ receipt, state: "done", error: null });
    } catch (error) {
      if (!job.current.isCurrent(currentJob) || latestReceipt.current !== receipt) return;
      setPdfResult({ receipt, state: "error", error: error instanceof Error ? error.message : "PDF 영수증을 만들지 못했습니다. 다시 시도하세요." });
    }
  };

  return (
    <div className="px-4 py-6 min-[1024px]:px-8">
      <SectionHead en="ARTIFACTS" ko="결과 파일 내려받기" right={<Pill>{receipt.hasRun ? "최근 실행 기준" : "실행 전"}</Pill>} />
      <Sentences className="mt-1.5 max-w-5xl text-sm leading-relaxed text-[var(--muted)]" text="현재 화면의 판정 모델을 한 장씩 A4 PDF로 만들어 내려받습니다. 계산값·추정 범위·확인할 금액을 구분하며, JSON 원본도 그대로 보관합니다." />
      <div className="mt-4 border-b-2 border-[var(--line-strong)]" />

      <section className={styles.actionPanel} aria-label="PDF 영수증 내려받기">
        <div>
          <p className={styles.eyebrow}>PDF 영수증</p>
          <h2>인쇄 가능한 A4 판정 내역</h2>
          <p>현재 판정의 날짜와 사례 ID만 파일명에 사용합니다. 실행 ID나 발급 시각은 새로 만들지 않습니다.</p>
        </div>
        <button className={styles.pdfButton} onClick={makePdf} disabled={!receipt.hasRun || pdfState === "busy"}>
          {pdfState === "busy" ? "PDF 만드는 중…" : pdfState === "done" ? "PDF 다시 내려받기" : "PDF 영수증 내려받기"}
        </button>
      </section>
      <p className={styles.status} role="status" aria-live="polite">
        {!receipt.hasRun ? "판정을 실행하면 현재 결과를 PDF 영수증으로 내려받을 수 있습니다." : pdfState === "busy" ? "글꼴을 확인하고 A4 페이지를 만들고 있습니다." : pdfState === "done" ? "PDF 영수증을 내려받았습니다." : "PDF는 브라우저에서 이 결과만 사용해 만듭니다."}
      </p>
      {pdfError && <p className={styles.error} role="alert">{pdfError} <button onClick={makePdf}>다시 시도</button></p>}
      <p className={styles.limitation}>PDF는 한글 모양을 보존하기 위해 페이지를 고해상도 이미지로 담습니다. 따라서 PDF 안의 글자는 선택하거나 검색할 수 없습니다.</p>

      <section className={styles.preview} aria-label="영수증 미리보기">
        <div className={styles.previewHead}><div><p className={styles.eyebrow}>화면 미리보기</p><h2>PDF에 담길 현재 판정</h2></div><span>{receipt.hasFindings ? `${receipt.rows.length}개 항목` : receipt.hasRun ? "항목 없음" : "실행 대기"}</span></div>
        {receipt.hasRun ? <ReceiptView receipt={receipt} /> : <EmptyBox>판정을 실행하면 현재 결과의 요약과 항목이 이곳에 표시됩니다.</EmptyBox>}
      </section>

      <details className={styles.json}>
        <summary>판정 JSON 원본</summary>
        <p>아래 복사와 파일 내려받기는 현재 JSON 문자열을 바꾸지 않고 그대로 사용합니다.</p>
        <div className={styles.jsonActions}>
          <button onClick={copyJson}>{copied ? "복사됨" : "판정 JSON 복사"}</button>
          <a href={`data:application/json;charset=utf-8,${encodeURIComponent(latestJson)}`} download="paycheck-findings.json">파일로 내려받기</a>
        </div>
        <pre>{latestJson}</pre>
      </details>
      {runs.length > 0 && <p className={styles.ledgerNote}>이 세션에 저장된 실행 기록은 {runs.length}건입니다. PDF에는 현재 화면의 최신 판정만 담깁니다.</p>}
    </div>
  );
}
