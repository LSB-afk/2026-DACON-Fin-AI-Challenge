/**
 * 상담 기록 조립 — 순수 함수.
 *
 * D 채널(상담사 콘솔)의 산출물이다. 서버에 저장소가 없으므로(개인정보 정책 1절)
 * 기록은 파일로 내려받아 센터 대장·후속 상담에 쓴다. 새로고침하면 사라지는
 * 세션 메모리를 "저장된다"고 말하지 않기 위한 정직한 경로다.
 *
 * 부작용 경계: AI 추출은 초안이고, 이 기록에는 사람이 승인한 최종값과
 * 승인 시각이 남는다. 수정된 필드는 수정으로 표기한다 — 모델이 한 일과
 * 사람이 한 일을 한 장에서 구분할 수 있어야 감사가 된다.
 */

import type { Finding } from "./rules/types.ts";
import { moneyTotals } from "./rules/types.ts";
import type { Answer } from "./narrate.ts";
import { 연락처 } from "./rules/constants-departure.ts";

export type ConsultField = {
  /** 항목 이름 (국적, 체류자격 …) */
  name: string;
  /** 모델이 추출한 값. 못 뽑았으면 undefined */
  extracted?: string;
  /** 추출 근거 스팬 (발화 원문의 부분 문자열) */
  evidence?: string;
  /** 상담사가 확인·승인한 최종값 */
  final: string;
};

export type ConsultRecordInput = {
  /** 판정 기준일 (YYYY-MM-DD) */
  today: string;
  /** 상담사 승인 시각 — 호출자가 넣는다. 이 파일은 시계를 갖지 않는다 */
  approvedAt: string;
  provider: string;
  model: string;
  utterance: string;
  fields: ConsultField[];
  findings: Finding[];
  answer: Answer;
};

const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;

/** 상담 기록 전문을 마크다운으로 돌려준다. 같은 입력이면 같은 문서다. */
export function buildConsultRecord(x: ConsultRecordInput): string {
  const L: string[] = [];
  L.push("# 페이체크 상담 기록");
  L.push("");
  L.push(`- 판정 기준일: ${x.today}`);
  L.push(`- 상담사 확인·승인: ${x.approvedAt}`);
  L.push(`- 모델: ${x.provider}:${x.model} — 라우팅·추출만. 금액·기한 판정은 결정적 코드가 했다`);
  L.push("");
  L.push("이 기록은 법률 자문이 아니라 서류 대조 결과입니다. 추정 금액은 기관 확인 후 확정됩니다.");
  L.push("");

  L.push("## 발화 원문");
  L.push(`> ${x.utterance}`);
  L.push("");

  L.push("## 확인·승인된 값 (AI 추출은 초안 — 사람이 승인한 값만 판정에 쓰였다)");
  L.push("| 항목 | 모델 추출 | 근거 스팬 | 최종값 |");
  L.push("|---|---|---|---|");
  for (const f of x.fields) {
    const 수정 = f.extracted !== undefined && f.extracted !== f.final;
    const 최종 = 수정 ? `${f.final} (상담사 수정)` : f.extracted === undefined ? `${f.final} (상담사 입력)` : f.final;
    L.push(`| ${f.name} | ${f.extracted ?? "—"} | ${f.evidence ? `"${f.evidence}"` : "—"} | ${최종} |`);
  }
  L.push("");

  L.push(`## 판정 결과 (${x.findings.length}건)`);
  for (const f of x.findings) {
    L.push(`- [${f.level}] ${f.rule} — ${f.title}`);
    if (f.amountRange) L.push(`  - 예상 범위: ${won(f.amountRange.min)} ~ ${won(f.amountRange.max)} (기관 확인 후 확정)`);
    else if (f.amount !== undefined) L.push(`  - 금액: ${won(f.amount)}`);
    if (f.formula) for (const line of f.formula.split("\n")) L.push(`  - 산식: ${line}`);
    if (f.deadline) {
      const d = f.deadline;
      L.push(`  - 기한: ${d.label} — ${d.date} (${d.daysLeft >= 0 ? `D-${d.daysLeft}` : `${-d.daysLeft}일 지남`})`);
    }
    L.push(`  - 근거: ${f.basis}`);
    if (f.questions) for (const q of f.questions) L.push(`  - 확인할 것: ${q}`);
  }
  L.push("");

  const t = moneyTotals(x.findings);
  L.push("## 금액 합계 — 확정·추정을 합산하지 않는다");
  L.push(`- 확정: ${won(t.확정)}`);
  L.push(t.추정 ? `- 추정: ${won(t.추정.min)} ~ ${won(t.추정.max)} (기관 확인 후 확정)` : "- 추정: 없음");
  L.push(`- 따로 확인할 참고 금액: ${won(t.확인필요참고)} (총액에 포함하지 않음)`);
  L.push("");

  L.push("## 안내문 (한국어 원문 — 모국어 번역은 화면에서 숫자 보존 검증 후 전달)");
  L.push(x.answer.headline);
  for (const b of x.answer.blocks) for (const line of b.lines) L.push(`- ${line}`);
  if (x.answer.todo.length) {
    L.push("");
    L.push("다음 행동:");
    for (const t of x.answer.todo) L.push(`1. ${t}`);
  }
  for (const n of x.answer.notices) L.push(`> ${n}`);
  L.push("");

  L.push("## 연락처");
  L.push(`- 보험(출국만기·귀국비용): ${연락처.보험사}`);
  L.push(`- 국민연금: ${연락처.국민연금}`);
  L.push(`- 공항 수령: ${연락처.공항수령}`);
  L.push(`- ${연락처.공항수령_조건}`);
  L.push("");
  return L.join("\n");
}
