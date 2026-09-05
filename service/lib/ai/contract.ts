/**
 * 3단 번역 계약 — 어떤 모델이 오든 이 계약을 통과해야 화면에 나간다.
 *
 * 제공자(Anthropic·Ollama)는 갈아끼울 수 있지만 이 파일은 제공자를 모른다.
 * 모델에게 주는 형식(pack), 모델이 돌려준 것을 여는 형식(unpack), 그리고
 * **숫자 보존 검증** — 전부 순수 함수라 네트워크 없이 테스트로 못박는다.
 *
 * 왜 숫자 보존이 계약의 핵심인가: 3단의 규율은 "설명이 숫자를 고치면 판정 위조"다.
 * 프롬프트로 부탁하는 것은 규율이 아니다 — 8B 로컬 모델은 부탁을 잊는다.
 * 그래서 원문의 모든 숫자(금액·날짜·D-일수·조문 번호)가 번역문에 그대로 있는지
 * 코드가 대조하고, 하나라도 어긋나면 던진다. 부르는 쪽은 한국어 원문으로 폴백한다.
 * 이 검증기가 있어서 로컬 소형 모델도 안전하게 쓸 수 있다 — 틀리면 안 나가니까.
 */

import type { Answer } from "../narrate.ts";

/** 번역 대상 언어. 픽스처 국적(베트남·네팔·캄보디아)과 EPS 상위 송출국에서 골랐다 */
export const 언어들 = [
  { code: "vi", label: "Tiếng Việt", name: "베트남어" },
  { code: "ne", label: "नेपाली", name: "네팔어" },
  { code: "km", label: "ភាសាខ្មែរ", name: "크메르어" },
  { code: "en", label: "English", name: "영어" },
] as const;

export type LangCode = (typeof 언어들)[number]["code"];

/**
 * 답변을 번호 붙은 줄 목록으로 편다.
 *
 * JSON 왕복이 아니라 줄 왕복인 이유: 소형 모델은 JSON 괄호를 곧잘 깨뜨리는데,
 * "n| 문장" 형식은 깨뜨릴 구조가 줄번호뿐이다. 줄번호가 어긋나면 unpack 이 던지고,
 * 던지면 원문 폴백이다 — 조용히 섞이는 길이 없다.
 */
export function pack(a: Answer): string[] {
  return [
    a.headline,
    ...a.blocks.flatMap((b) => b.lines),
    ...a.todo,
    ...a.notices,
  ];
}

export const 프롬프트 = (langName: string, lines: string[]) =>
  `아래 번호 붙은 한국어 문장들을 ${langName}로 번역하라.\n` +
  `규칙:\n` +
  `1. 금액·날짜·D-숫자·조문 번호(§)·룰 코드(S2-1 같은 것)는 한 글자도 바꾸지 말고 그대로 둔다. 숫자를 현지 표기로 바꾸지 마라.\n` +
  `2. 출력은 입력과 같은 "번호| 번역문" 형식만. 줄을 더하거나 빼지 마라. 설명·인사 금지.\n\n` +
  lines.map((l, i) => `${i + 1}| ${l}`).join("\n");

/**
 * 모델 출력 → 줄 목록. 형식이 조금이라도 어긋나면 던진다.
 * 관대한 파서는 여기서 금지다 — 어긋난 출력을 살리려는 순간 어디가 몇 번 줄인지의
 * 보증이 사라지고, 숫자 검증이 엉뚱한 줄을 대조하게 된다.
 */
export function unpack(raw: string, expect: number): string[] {
  const out = new Map<number, string>();
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*(\d+)\s*\|\s?(.*)$/);
    if (!m) continue; // 모델이 앞뒤에 붙인 잡담 줄은 번호가 없어 걸러진다
    const n = Number(m[1]);
    if (out.has(n)) throw new Error(`줄 ${n} 이 두 번 왔다`);
    out.set(n, m[2].trim());
  }
  const lines: string[] = [];
  for (let i = 1; i <= expect; i++) {
    const l = out.get(i);
    if (l === undefined || l === "") throw new Error(`줄 ${i} 이 비었거나 없다`);
    lines.push(l);
  }
  if (out.size !== expect)
    throw new Error(`줄 수가 다르다 — 기대 ${expect}, 받음 ${out.size}`);
  return lines;
}

/**
 * 숫자 보존 검증. 줄마다 원문의 숫자 덩어리 다중집합과 번역문의 것을 대조한다.
 *
 * 정규화: 숫자 사이의 쉼표·마침표·공백만 지운다 ("14,171,621" = "14171621").
 * 날짜의 하이픈은 지우지 않는다 — "2026-10-08"은 세 덩어리(2026·10·08)로 남고,
 * 모델이 "8일"로 줄이면 08 덩어리가 사라져 잡힌다. 엄격해서 생기는 오탐은
 * 폴백(한국어 원문)이라 사용자에게 해가 없다. 반대 방향의 미탐이 해다.
 */
export function 숫자보존위반(원문: string[], 번역: string[]): string[] {
  const 덩어리 = (s: string) =>
    (s.replace(/(\d)[,.\s](?=\d)/g, "$1").match(/\d+/g) ?? []).sort();
  const 위반: string[] = [];
  for (let i = 0; i < 원문.length; i++) {
    const a = 덩어리(원문[i]);
    const b = 덩어리(번역[i] ?? "");
    if (a.join("·") !== b.join("·"))
      위반.push(
        `줄 ${i + 1}: 원문 숫자 [${a.join(", ")}] ≠ 번역 숫자 [${b.join(", ")}]`,
      );
  }
  return 위반;
}

/** 번역된 줄들을 원래 Answer 구조에 도로 끼운다. pack 과 같은 순서다 */
export function rebuild(a: Answer, t: string[]): Answer {
  let i = 0;
  const take = () => t[i++];
  return {
    headline: take(),
    blocks: a.blocks.map((b) => ({
      ...b,
      lines: b.lines.map(() => take()),
    })),
    todo: a.todo.map(() => take()),
    notices: a.notices.map(() => take()),
  };
}
