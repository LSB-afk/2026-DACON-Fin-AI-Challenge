#!/usr/bin/env node
/**
 * 토큰 대비 검사기.
 *
 * app/globals.css 의 hex 를 읽어, **화면에서 실제로 겹치는 조합**의 대비비를 잰다.
 * 조합은 아래 표에 손으로 적는다 — 토큰을 전부 곱하면 60쌍이 넘는데 그중 대부분은
 * 화면에서 만나지 않는다. 만나지 않는 쌍이 미달로 나오면 사람이 그 경고를 무시하기
 * 시작하고, 그때부터 이 검사는 장식이 된다. 그래서 각 줄에 `쓰이는 곳`(파일:줄)을
 * 함께 적는다. 그 자리가 없어졌으면 줄을 지워라.
 *
 * 기준: 본문 글자 4.5:1 (WCAG 2.2 AA 1.4.3), 비텍스트 3:1 (1.4.11).
 * 큰 글자 3:1 예외는 쓰지 않는다 — 나중에 글자 크기를 줄이면 조용히 미달이 된다.
 *
 * 검사하지 않는 것: --line / --line-soft / --accent-tint-line 같은 약한 경계.
 * 이것들은 카드를 묶어 보이게 하는 장식이고, 그 자리의 뜻은 전부 글자가 지고 있다.
 * 3:1 을 걸면 회색 선이 전부 진해져서 화면이 표처럼 보인다.
 *
 * 의존성 없음. `node scripts/contrast.mjs`.
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const CSS = join(dirname(fileURLToPath(import.meta.url)), "..", "app", "globals.css");

/** :root 의 `--이름: #rrggbb;` 만 거둔다. 3자리 축약형은 쓰지 않기로 했으므로 잡히지 않고,
 *  잡히지 않으면 아래 조합표에서 "모르는 토큰" 으로 죽는다. 조용히 넘어가지 않는다. */
function readTokens(path) {
  const out = new Map();
  const re = /--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g;
  for (const m of readFileSync(path, "utf8").matchAll(re)) out.set(m[1], m[2].toLowerCase());
  return out;
}

/** WCAG 2.x 상대 휘도 */
function luminance(hex) {
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = ch.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function ratio(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/**
 * [앞색, 뒷색, 종류, 쓰이는 곳]
 * 종류 text = 4.5:1 / ui = 3:1. 색은 토큰 이름이거나 hex(흰 글자처럼 토큰이 아닌 것).
 */
const PAIRS = [
  // ── 글자 (4.5:1) ──
  ["ink", "bg", "text", "본문 전체 — globals.css body"],
  ["ink", "surface", "text", "표 소계 머리행 — _tabs.tsx:49"],
  ["ink", "accent-tint", "text", "합계 카드 금액 — _tabs.tsx:163"],
  ["ink", "good-soft", "text", "정상 판정 카드 제목 — _ui.tsx:505"],
  ["ink", "warning-soft", "text", "확인필요 카드 제목 — _ui.tsx:500"],
  ["ink", "bad-soft", "text", "위법 카드 제목 — _ui.tsx:495"],
  ["muted", "bg", "text", "설명 문단 — _views.tsx:51"],
  ["muted", "surface", "text", "중립 알약 글자 — _ui.tsx:53"],
  ["muted", "accent-tint", "text", "합계 카드 라벨 — _tabs.tsx:164"],
  ["muted", "warning-soft", "text", "판정 카드 근거 줄 — _ui.tsx:541"],
  ["muted", "bad-soft", "text", "판정 카드 근거 줄 — _ui.tsx:541"],
  ["muted-soft", "bg", "text", "룰 코드·eyebrow — _tabs.tsx:118"],
  ["accent", "bg", "text", "발동/통과 표시 — _tabs.tsx:199"],
  ["accent-ink", "accent-tint", "text", "선택된 내비 행·강조 알약 — _ui.tsx:231"],
  ["#ffffff", "accent", "text", "기본 버튼·활성 탭 글자 — _ui.tsx:112"],
  ["#ffffff", "accent-hover", "text", "그 버튼의 hover — _views.tsx:167"],
  ["good-ink", "good-soft", "text", "정상 카드 보조 글자 — _ui.tsx:505"],
  ["warning-ink", "warning-soft", "text", "가드레일 경고 목록 — _tabs.tsx:314"],
  ["warning-ink", "bg", "text", "표 안 '차단 N' — _views.tsx:101"],
  ["bad-ink", "bad-soft", "text", "위법 카드 보조 글자 — _ui.tsx:495"],
  ["violet-ink", "violet-soft", "text", "상담 사례 배지 '산재 공제' — _ui.tsx Pill violet"],
  ["teal-ink", "teal-soft", "text", "상담 사례 배지 '최저임금' — _ui.tsx Pill teal"],

  // ── 비텍스트 (3:1) ──
  ["accent", "bg", "ui", "기본 버튼 면과 페이지 면의 경계 — _ui.tsx:429"],
  ["good", "bg", "ui", "정상 카드 테두리"],
  ["warning", "bg", "ui", "확인필요 카드 테두리 — _ui.tsx:500"],
  ["bad", "bg", "ui", "위법 카드 테두리 — _ui.tsx:495"],
  ["good", "good-soft", "ui", "정상 카드 안 상태 마커"],
  ["warning", "warning-soft", "ui", "확인필요 ▲ · 기한임박 ◆ 도형 표식 — _ui.tsx 표시"],
  ["bad", "bad-soft", "ui", "위법 ■ 도형 표식 — _ui.tsx 표시"],
  ["accent", "accent-tint", "ui", "수령가능 ● 도형 표식 — _ui.tsx 표시"],
  ["focus", "bg", "ui", "초점 링 — globals.css :focus-visible"],
  ["focus", "surface", "ui", "hover 면 위 초점 링 — _ui.tsx:233"],
  ["focus", "accent-tint", "ui", "선택된 행 위 초점 링 — _ui.tsx:231"],
];

const tokens = readTokens(CSS);
const hexOf = (v) => {
  if (v.startsWith("#")) return v.toLowerCase();
  const hex = tokens.get(v);
  if (!hex) throw new Error(`globals.css 에 --${v} 가 없거나 6자리 hex 가 아니다`);
  return hex;
};

const rows = PAIRS.map(([fg, bg, kind, where]) => {
  const need = kind === "text" ? 4.5 : 3;
  const got = ratio(hexOf(fg), hexOf(bg));
  return { fg, bg, kind, where, need, got, ok: got >= need };
});

const fail = rows.filter((r) => !r.ok);
const w = Math.max(...rows.map((r) => `${r.fg} on ${r.bg}`.length));

console.log(`토큰 대비 검사 — ${CSS}\n`);
for (const r of rows) {
  const pair = `${r.fg} on ${r.bg}`.padEnd(w);
  const got = r.got.toFixed(2).padStart(5);
  console.log(
    `${r.ok ? "통과" : "미달"}  ${pair}  ${got}:1 (${r.kind === "text" ? "글자 4.5" : "비텍스트 3.0"})  ${r.where}`,
  );
}
console.log(`\n실측: ${rows.length - fail.length}/${rows.length} 통과`);

/*
 * 위 조합표는 토큰 이름으로만 적혀 있다. 그래서 화면이 tailwind 팔레트 색
 * (bg-amber-50, text-gray-500 …)을 직접 쓰면 그 자리는 애초에 검사 대상에 들어오지
 * 못하고, 대비가 미달이어도 30/30 통과가 그대로 찍힌다 — 검사기가 조용해지는 방식이다.
 * 실제로 그런 자리가 있었다: _views.tsx 의 amber 4자리는 조합표 어디에도 없었다.
 * 그래서 대비 계산과 같은 걸음에 팔레트 색 사용을 함께 막는다.
 *
 * 잡지 못하는 것: 인라인 style 의 hex, 문자열을 이어 붙여 만든 클래스 이름,
 * app/ 밖 파일. text-white 처럼 팔레트 밖 이름도 통과한다(조합표에 hex 로 올려 뒀다).
 */
const PALETTE =
  /\b(?:bg|text|border|ring|from|to|via|fill|stroke|divide|outline|shadow|decoration|accent|caret|placeholder)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/g;

const APP = join(dirname(fileURLToPath(import.meta.url)), "..", "app");
const hardcoded = [];
for (const f of readdirSync(APP)) {
  if (!/\.(tsx|ts|css)$/.test(f)) continue;
  readFileSync(join(APP, f), "utf8")
    .split("\n")
    .forEach((line, i) => {
      for (const m of line.matchAll(PALETTE)) hardcoded.push(`app/${f}:${i + 1} ${m[0]}`);
    });
}
console.log(
  hardcoded.length === 0
    ? "실측: app/ 안 tailwind 팔레트 색 0곳"
    : `\ntailwind 팔레트 색 ${hardcoded.length}곳 — var(--토큰) 으로 바꿔라:\n  ${hardcoded.join("\n  ")}`,
);

if (fail.length) {
  console.log(`미달 ${fail.length}건 — 토큰 값을 고쳐라. 조합표를 지워서 맞추지 마라.`);
}
if (fail.length || hardcoded.length) process.exit(1);
