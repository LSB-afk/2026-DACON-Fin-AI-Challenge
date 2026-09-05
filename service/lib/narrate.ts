/**
 * 3단 답변 조립 — 판정(Finding[])을 사용자에게 보낼 한국어 답변으로 조립한다.
 *
 * 왜 이게 순수 함수인가: 3단의 일은 둘로 쪼개진다 — **문장 조립**과 **모국어 변환**.
 * 조립은 결정적이어야 한다. 어떤 금액을 말하고 어떤 기한을 앞세우고 어떤 표현을
 * 금지하는지는 제품의 규율이지 모델의 재량이 아니다. 모델(LLM)이 맡을 몫은
 * 이 조립된 한국어를 모국어로 옮기는 것뿐이고, 그때도 금액·날짜·조문은
 * 여기서 준 값 그대로여야 한다 — 설명이 숫자를 고치면 그건 판정 위조다.
 *
 * 그래서 이 파일은 lib/ai/ 를 모른다. 가드레일과 같은 편(판정 이후, 발화 이전)에
 * 서 있고, 가드레일이 막는 것(없는 돈 약속·확정 단정·기한 누락)을 여기서도
 * 구조적으로 만들 수 없게 문장 틀 자체를 그렇게 짰다:
 *   - 수령불가 판정은 금액 문장을 아예 만들지 않는다 (G2와 같은 금지)
 *   - 추정 금액은 항상 "약 … ~ …" 범위로만 말한다 (G3)
 *   - 기한임박은 마감일과 D-일수를 문장 맨 앞에 박는다 (G7)
 *   - 확인필요는 단정 대신 질문을 돌려준다 (G5)
 */

import {
  sortFindings,
  moneyTotals,
  type Finding,
} from "./rules/types.ts";

export type Answer = {
  /** 한 줄 요약 — 메시지 앱의 미리보기 줄에 해당한다 */
  headline: string;
  /** 본문 단락. 심각도 순서 그대로다 */
  blocks: AnswerBlock[];
  /** 다음에 할 일 — 기한 있는 것부터 */
  todo: string[];
  /** 하네스 필수 고지. 조립이 마음대로 빼먹을 수 없게 인자로 강제한다 */
  notices: string[];
};

export type AnswerBlock = {
  rule: string;
  level: Finding["level"];
  lines: string[];
};

const 원 = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;

const 금액문장 = (f: Finding): string | null => {
  // 수령불가·정상은 금액을 입에 올리지 않는다 — G2를 문장 틀에서 강제
  if (f.level === "수령불가" || f.level === "정상") return null;
  if (f.amountRange)
    return `예상 금액은 약 ${원(f.amountRange.min)} ~ ${원(f.amountRange.max)}입니다. 정확한 금액은 지급 기관이 계산합니다.`;
  if (f.amount !== undefined) return `금액은 ${원(f.amount)}입니다.`;
  return null;
};

const 기한문장 = (f: Finding): string | null => {
  if (!f.deadline) return null;
  const d = f.deadline;
  if (d.daysLeft >= 0)
    return `${d.label}은 ${d.date}까지입니다. 오늘부터 ${d.daysLeft}일 남았습니다.`;
  return `${d.label}(${d.date})은 이미 ${-d.daysLeft}일 지났습니다.`;
};

/** 판정 하나 → 사용자에게 보낼 문장들. 수준마다 틀이 다르다 */
function 단락(f: Finding): AnswerBlock {
  const lines: string[] = [];
  switch (f.level) {
    case "기한임박": {
      // G7 — 마감이 문장 맨 앞이다. "서두르세요"만 말하고 끝나는 답변을 틀이 금지한다
      const 기한 = 기한문장(f);
      if (기한) lines.push(`⟨기한⟩ ${기한}`);
      lines.push(`${f.title}. 지금 신청하지 않으면 받지 못할 수 있습니다.`);
      break;
    }
    case "위법":
      lines.push(`${f.title}. 법에서 정한 기준과 다릅니다.`);
      lines.push(`근거는 ${f.basis}입니다. 이 화면을 회사에 보여 주고 바로잡아 달라고 요청할 수 있습니다.`);
      break;
    case "수령가능": {
      lines.push(`${f.title}`);
      const 기한 = 기한문장(f);
      if (기한) lines.push(기한);
      break;
    }
    case "확인필요":
      // G5 — 단정 대신 질문. "확인이 필요합니다"로 끝나 사용자가 막히는 답을 틀이 금지한다
      lines.push(`${f.title}. 아직 단정하지 않았습니다. 아래 질문에 답해 주시면 결과가 정해집니다.`);
      for (const q of f.questions ?? []) lines.push(`· ${q}`);
      break;
    case "수령불가":
      lines.push(`${f.title}. 이 항목은 받을 수 없습니다. 기대하지 않으시도록 미리 알려 드립니다.`);
      break;
    case "정상":
      lines.push(`${f.title}. 문제가 없습니다.`);
      break;
  }
  const 금액 = 금액문장(f);
  if (금액) lines.push(금액);
  if (f.level !== "위법") lines.push(`근거: ${f.basis}`);
  return { rule: f.rule, level: f.level, lines };
}

/**
 * 판정 전체 → 답변 하나.
 *
 * notices 를 인자로 받는 이유: 하네스 manifest 의 필수 고지는 답변마다 반드시
 * 나가야 한다. 기본값을 주면 부르는 쪽이 빼먹어도 조용히 통과한다 — 그래서 기본값이 없다.
 */
export function narrate(findings: Finding[], notices: string[]): Answer {
  if (findings.length === 0)
    return {
      headline: "확인할 항목이 없습니다.",
      blocks: [],
      todo: [],
      notices,
    };

  const 정렬 = sortFindings(findings);
  const 합계 = moneyTotals(findings);
  const 임박 = 정렬.filter((f) => f.level === "기한임박");

  /*
   * 요약 한 줄 — 가장 급한 것 하나만. 요약에 전부 욱여넣으면 아무것도 급하지 않다.
   * 금액은 확정과 추정을 절대 한 숫자로 합치지 않는다 — 합쳐 말한 1,417만원을
   * 기대한 사람에게 기관이 다른 숫자를 주는 순간, 이 제품이 지키려던 신뢰가 무너진다.
   */
  const 금액문 = [
    합계.확정 > 0 ? `확정 금액 ${원(합계.확정)}` : null,
    합계.추정
      ? `예상 금액 약 ${원(합계.추정.min)} ~ ${원(합계.추정.max)} (기관 확인 후 확정)`
      : null,
  ].filter(Boolean);
  const headline = 임박.length
    ? `마감이 다가온 항목이 ${임박.length}건 있습니다. ${임박[0].deadline ? `가장 빠른 마감은 ${임박[0].deadline.date}입니다.` : ""}`.trim()
    : 금액문.length
      ? `받을 수 있는 돈이 있습니다. ${금액문.join(", ")}. 항목별 설명은 아래에 있습니다.`
      : "서류를 기준과 대조한 결과입니다.";

  // 다음 할 일 — 기한 있는 판정의 행동만. 마감 빠른 순
  const todo = 정렬
    .filter((f) => f.deadline && f.deadline.daysLeft >= 0 && f.level !== "정상")
    .sort((a, b) => a.deadline!.daysLeft - b.deadline!.daysLeft)
    .map((f) => `${f.deadline!.date}까지 ${f.deadline!.label} (${f.rule})`);
  // 확인필요는 기한이 없어도 행동이 있다: 질문에 답하기
  for (const f of 정렬.filter((x) => x.level === "확인필요" && x.questions?.length))
    todo.push(`답 주시면 확정: ${f.questions![0]} (${f.rule})`);

  return { headline, blocks: 정렬.map(단락), todo, notices };
}
