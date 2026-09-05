import { test } from "node:test";
import assert from "node:assert/strict";
import {
  needsTranslation,
  decodeEntities,
  pickEngine,
  cacheGet,
  cacheSet,
  cacheReset,
  chunk,
} from "./uiTranslate.ts";

test("needsTranslation — 한글이 든 줄만", () => {
  assert.equal(needsTranslation("판정 결과 보기"), true);
  assert.equal(needsTranslation("SC-01 · 2,150,000"), false);
  assert.equal(needsTranslation("Go to home screen"), false);
  assert.equal(needsTranslation("ㅋㅋ"), true);
});

test("decodeEntities — Google 이 흘리는 엔티티만 되돌린다", () => {
  assert.equal(decodeEntities("A &amp; B &#39;c&#39; &quot;d&quot;"), `A & B 'c' "d"`);
  assert.equal(decodeEntities("그대로"), "그대로");
});

test("pickEngine — 환경변수 우선순위: google > llm > mymemory > off", () => {
  assert.equal(pickEngine({ GOOGLE_TRANSLATE_API_KEY: "k", ANTHROPIC_API_KEY: "a" })?.name, "google");
  assert.equal(pickEngine({ ANTHROPIC_API_KEY: "a" })?.name, "llm");
  assert.equal(pickEngine({ OLLAMA_URL: "http://localhost:11434" })?.name, "llm");
  assert.equal(pickEngine({})?.name, "mymemory");
  assert.equal(pickEngine({ UI_TRANSLATE_FALLBACK: "off" }), null);
});

test("서버 캐시 — 언어별로 나뉘고 상한을 넘으면 오래된 것부터 버린다", () => {
  cacheReset();
  cacheSet("en", "안녕", "Hello");
  assert.equal(cacheGet("en", "안녕"), "Hello");
  assert.equal(cacheGet("vi", "안녕"), undefined);
  for (let i = 0; i < 5_100; i++) cacheSet("en", `문장 ${i}`, `s${i}`);
  assert.equal(cacheGet("en", "안녕"), undefined, "가장 오래된 항목이 밀려났다");
  assert.equal(cacheGet("en", "문장 5099"), "s5099");
  cacheReset();
});

test("chunk", () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunk([], 3), []);
});
