"use client";

import type { ReceiptModel, ReceiptRow } from "@/lib/receipt";
import styles from "./_receipt.module.css";

const iconFor = (status: ReceiptRow["status"]) => {
  if (status === "정상") return <path d="m5 12 4 4L19 6" />;
  if (status === "수령불가") return <path d="M6 6l12 12M18 6 6 18" />;
  if (status === "확인필요" || status === "위법") return <><circle cx="12" cy="12" r="8" /><path d="M12 8v5M12 16h.01" /></>;
  if (status === "기한임박") return <><circle cx="12" cy="12" r="8" /><path d="M12 8v5l3 2" /></>;
  return <><circle cx="12" cy="12" r="8" /><path d="m8.5 12 2.3 2.3 4.7-5" /></>;
};

function ReceiptStatus({ row }: { row: ReceiptRow }) {
  return (
    <span className={`${styles.status} ${styles[`status${row.status}`] ?? ""}`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {iconFor(row.status)}
      </svg>
      {row.statusLabel}
    </span>
  );
}

function ReceiptRows({ rows }: { rows: readonly ReceiptRow[] }) {
  return (
    <div className={styles.rows}>
      {rows.map((row) => (
        <article key={row.id} className={styles.row}>
          <div className={styles.rowMain}>
            <ReceiptStatus row={row} />
            <p className={styles.rowTitle}>{row.title}</p>
            <p className={styles.rule}>{row.finding.rule}</p>
          </div>
          {row.amountDisplay && <strong className={styles.rowAmount}>{row.amountDisplay}</strong>}
          {row.detail.length > 0 && (
            <details className={styles.detail}>
              <summary>근거와 확인 내용</summary>
              <ul>{row.detail.map((line) => <li key={line}>{line}</li>)}</ul>
            </details>
          )}
        </article>
      ))}
    </div>
  );
}

function Group({ title, description, rows }: { title: string; description: string; rows: readonly ReceiptRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section className={styles.group} aria-label={title}>
      <div className={styles.groupHead}>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      <ReceiptRows rows={rows} />
    </section>
  );
}

/** A calm receipt projection. All calculation and status grouping arrive in ReceiptModel. */
export function ReceiptView({ receipt, compactHeader = false }: { receipt: ReceiptModel; compactHeader?: boolean }) {
  if (!receipt.hasRun) return null;
  if (!receipt.hasFindings) {
    return <p className={styles.empty}>현재 입력으로 표시할 판정 항목이 없습니다.</p>;
  }
  const { source, money } = receipt;
  return (
    <section className={styles.receipt} aria-label="판정 영수증">
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>판정 결과</p>
          <h2>현재 입력 기준 판정 내역</h2>
          {!compactHeader && source.description && <p className={styles.description}>{source.description}</p>}
        </div>
        <dl className={styles.meta}>
          {source.today && <div><dt>판정 기준일</dt><dd>{source.today}</dd></div>}
          {source.caseId && <div><dt>사례 ID</dt><dd>{source.caseId}</dd></div>}
          {source.runId && <div><dt>실행 ID</dt><dd>{source.runId}</dd></div>}
        </dl>
      </header>

      <section className={styles.summary} aria-label="금액 요약">
        <div className={styles.summaryIntro}>
          <p>금액 요약</p>
          <span>서로 다른 성격의 금액은 합치지 않습니다.</span>
        </div>
        {money.confirmed || money.estimated || money.reviewReference ? (
          <dl>
            {money.confirmed && <div><dt>확정 계산값</dt><dd>{money.confirmed.display}</dd></div>}
            {money.estimated && <div><dt>추정 범위</dt><dd>{money.estimated.display}</dd></div>}
            {money.reviewReference && <div className={styles.reference}><dt>확인 필요 참고</dt><dd>{money.reviewReference.display}</dd></div>}
          </dl>
        ) : (
          <p className={styles.summaryEmpty}>현재 판정에서 합산할 수령 금액이 없습니다.</p>
        )}
        <p className={styles.notice}>{money.notice}</p>
        {money.reviewReference && <p className={styles.referenceNote}>확인 필요 참고 금액은 다른 금액과 겹칠 수 있어 합계에 넣지 않았습니다.</p>}
      </section>

      <Group title="포함한 판정" description="확정 계산값 또는 추정 범위가 있을 수 있는 항목" rows={receipt.groups.included} />
      <Group title="확인할 항목" description="참고 금액은 별도로 확인합니다" rows={receipt.groups.review} />
      <Group title="합산하지 않은 항목" description="정상 결과와 수령 불가 결과를 구분해 남깁니다" rows={receipt.groups.excluded} />
    </section>
  );
}
