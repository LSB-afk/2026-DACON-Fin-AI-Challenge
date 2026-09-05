import { test } from "node:test";
import assert from "node:assert/strict";
import { UI_LANGS, ENTRANCE_TEXT, entranceText, isUiLang, fill, mtCode } from "./uiLang.ts";

// ── 언어 수 — 스무 개. 늘리려면 이 숫자를 같이 고쳐라 (엔진이 그 코드를 아는지도 확인) ──
test("표시 언어 — 한국어 포함 20개, 코드 중복 없음, 한국어가 첫째", () => {
  assert.equal(UI_LANGS.length, 20);
  assert.equal(new Set(UI_LANGS.map((l) => l.code)).size, 20);
  assert.equal(UI_LANGS[0].code, "ko");
});

// ── 손번역 계약 — 손번역이 있는 언어는 키 전부를 비지 않게 채운다 ──
test("입장 손번역 — 있는 언어는 키 전부, 빈 문자열 없음, {n} 자리 보존", () => {
  const keys = Object.keys(ENTRANCE_TEXT.ko).sort();
  const 손번역 = Object.keys(ENTRANCE_TEXT);
  assert.ok(손번역.length >= 10, "손번역 언어는 최소 10개");
  for (const code of 손번역) {
    assert.ok(isUiLang(code), `${code} 는 UI_LANGS 에 없다`);
    const t = ENTRANCE_TEXT[code as keyof typeof ENTRANCE_TEXT]!;
    assert.deepEqual(Object.keys(t).sort(), keys, `${code} 키가 한국어와 다르다`);
    for (const k of keys) {
      const v = (t as unknown as Record<string, string>)[k];
      assert.equal(typeof v, "string");
      assert.ok(v.trim().length > 0, `${code}.${k} 비어 있음`);
    }
    assert.ok(t.more.includes("{n}"), `${code}.more 에 {n} 자리가 없다`);
  }
});

test("손번역 없는 언어는 한국어로 폴백", () => {
  assert.equal(entranceText("mn"), ENTRANCE_TEXT.ko);
  assert.equal(entranceText("en"), ENTRANCE_TEXT.en);
});

test("isUiLang / fill / mtCode", () => {
  assert.equal(isUiLang("vi"), true);
  assert.equal(isUiLang("fr"), false);
  assert.equal(isUiLang(""), false);
  assert.equal(fill("다른 화면 {n}개 보기", 13), "다른 화면 13개 보기");
  assert.equal(mtCode("zh"), "zh-CN");
  assert.equal(mtCode("vi"), "vi");
});

// ── [확인] 단추 — 언어마다 그 언어의 단어. 손번역이 없는 언어도 이것만은 있어야 한다 ──
test("언어 선택 [확인] — 20개 언어 전부 비지 않은 그 언어 단어, 한국어는 '확인'", () => {
  for (const l of UI_LANGS) assert.ok(l.confirm.trim().length > 0, `${l.code}.confirm 비어 있음`);
  assert.equal(UI_LANGS[0].confirm, "확인");
  assert.equal(UI_LANGS.find((l) => l.code === "en")!.confirm, "Confirm");
});
