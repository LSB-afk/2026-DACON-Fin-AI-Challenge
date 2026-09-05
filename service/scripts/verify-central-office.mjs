#!/usr/bin/env node
/**
 * Central-office browser acceptance. No live inference or production mutations.
 * The browser-only fetch fixture exposes a genuinely incremental ReadableStream;
 * each request boundary is released by the test after observing the preceding UI.
 * Backend provider/NDJSON/number-preservation contracts have separate unit/API tests.
 * Run: node scripts/verify-central-office.mjs
 * Optional: BASE_URL, PLAYWRIGHT_DIR, BROWSER_CHANNEL, TEST_FILTER, OUTPUT_DIR.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isWalkable } from "../lib/officeWorld.ts";
import { unproject } from "../lib/officeProjection.ts";

const require = createRequire(import.meta.url);
function resolvePlaywright() {
  const candidates = [process.env.PLAYWRIGHT_DIR, "playwright"].filter(Boolean);
  for (const base of [resolve(homedir(), ".npm/_npx"), "/tmp/pc-npm-cache/_npx", "/usr/local/lib/node_modules", "/opt/homebrew/lib/node_modules"]) {
    try {
      for (const entry of readdirSync(base)) candidates.push(resolve(base, entry, "node_modules/playwright"));
      candidates.push(resolve(base, "playwright"));
    } catch { /* An absent optional installation location is expected. */ }
  }
  for (const candidate of candidates) {
    try { return require(candidate); } catch { /* Try the next existing installation. */ }
  }
  throw new Error("Playwright is unavailable. Set PLAYWRIGHT_DIR to its installed package directory.");
}
const { chromium } = resolvePlaywright();
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = resolve(process.env.OUTPUT_DIR ?? resolve(dirname(fileURLToPath(import.meta.url)), "../screenshots/central-office"));
const FILTER = process.env.TEST_FILTER ? new RegExp(process.env.TEST_FILTER) : null;
const VIEWPORTS = [{ width: 1440, height: 900 }, { width: 1920, height: 1080 }, { width: 390, height: 844 }];
const UTTERANCE = "베트남 사람이고 E-9 비자입니다. 2023년 9월 1일 입사했고 2026년 10월 15일 고향으로 귀국·출국해요. 국민연금을 정산하고 싶고 월급은 215만원입니다.";
const FIELDS = { nationality: "베트남", visa: "E-9", hireDate: "2023-09-01", departureDate: "2026-10-15", monthlyWage: 2150000 };
const evidence = { nationality: "베트남", visa: "E-9", hireDate: "2023년 9월 1일", departureDate: "2026년 10월 15일", monthlyWage: "215만원" };
const report = { startedAt: new Date().toISOString(), baseURL: BASE, mode: "Controlled browser-only provider fixtures; NOT live inference", browser: null, tests: [], screenshots: [], measurements: {}, coverageLimits: ["Controlled responses prove UI behavior; they do not independently prove provider inference or backend translation validation.", "Frame samples measure this browser and viewport only; they are not a universal FPS guarantee."] };

function resultFor({ fields = FIELDS, routerError = null, intakeError = null, utterance = UTTERANCE } = {}) {
  return { provider: "ollama", model: "browser-fixture", utterance, router: routerError ? null : { skill: "departure", evidence: ["출국"], filteredCount: 0 }, routerError, routerRaw: "controlled routing fixture", intake: intakeError ? null : { fields, evidences: evidence, questions: [], discarded: [] }, intakeError, intakeRaw: "controlled extraction fixture", routerUsage: { ms: 24 }, intakeUsage: { ms: 51 } };
}

/** A test-only transport. It intentionally ignores abort to exercise stale-result guards. */
function installFixture({ offline }) {
  const nativeFetch = window.fetch.bind(window);
  const encoder = new TextEncoder();
  const fixture = window.__officeFixture = {
    agents: [], translations: [], offline, failNext: false, canvasFrames: 0, ontologyFrames: 0,
    emit(index, event) {
      const job = this.agents[index];
      if (!job || job.closed) throw new Error("Unknown/closed agent fixture " + index);
      job.controller.enqueue(encoder.encode(JSON.stringify({ ...event, runId: job.body.runId, inputRevision: job.body.inputRevision }) + "\n"));
    },
    complete(index, result) {
      this.emit(index, { type: "result", result });
      this.agents[index].controller.close();
      this.agents[index].closed = true;
    },
    translate(index, response, status = 200) {
      const job = this.translations[index];
      if (!job) throw new Error("Unknown translation fixture " + index);
      job.resolve(new Response(JSON.stringify(response), { status, headers: { "content-type": "application/json" } }));
    },
  };
  const clearRect = CanvasRenderingContext2D.prototype.clearRect;
  CanvasRenderingContext2D.prototype.clearRect = function (...args) {
    if (this.canvas.closest('[data-testid="office-map"]')) fixture.canvasFrames += 1;
    if (this.canvas.closest('[data-testid="ontology-graph"]')) fixture.ontologyFrames += 1;
    return Reflect.apply(clearRect, this, args);
  };
  window.fetch = async (input, options = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url, window.location.href);
    const method = (options.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (url.pathname === "/api/agent" || url.pathname === "/api/narrate") {
      if (method === "GET") return new Response(JSON.stringify({ provider: fixture.offline ? null : "ollama", model: "browser-fixture" }), { headers: { "content-type": "application/json" } });
      if (fixture.failNext) { fixture.failNext = false; throw new TypeError("Failed to fetch — controlled network failure"); }
      if (fixture.offline) return new Response(JSON.stringify({ error: "AI 제공자 미연결 — controlled fixture" }), { status: 503, headers: { "content-type": "application/json" } });
      const body = JSON.parse(options.body);
      if (url.pathname === "/api/narrate") return new Promise((resolve) => fixture.translations.push({ body, resolve }));
      let controller;
      const stream = new ReadableStream({ start(value) { controller = value; } });
      fixture.agents.push({ body, controller, closed: false });
      return new Response(stream, { headers: { "content-type": "application/x-ndjson" } });
    }
    return nativeFetch(input, options);
  };
}

async function textIncludes(locator, value) {
  await locator.filter({ hasText: value }).first().waitFor({ state: "visible" });
}
async function equalText(locator, value) {
  await locator.waitFor({ state: "visible" });
  await locator.page().waitForFunction(({ selector, value }) => document.querySelector(selector)?.textContent?.trim() === value, { selector: `[data-testid="${await locator.getAttribute("data-testid")}"]`, value });
}
const button = (page, name) => page.getByRole("button", { name, exact: true });
async function openOps(page) {
  if (await page.locator("#agent-utterance").isVisible()) return;
  await button(page, "상담 입력 열기").click();
  await page.locator("#agent-utterance").waitFor({ state: "visible" });
}
async function closeOps(page) {
  if (await page.locator("#ops-panel").isVisible()) await page.locator('#ops-panel button[aria-label="운영 패널 닫기"]').click();
}
async function openOntology(page, { live = false } = {}) {
  await closeOps(page);
  await button(page, "사무실 둘러보기").click();
  const tour = page.getByTestId("office-tour");
  await tour.getByRole("button", { name: "가이드 4: 용어와 제약으로 검증", exact: true }).click();
  await tour.getByRole("button", { name: "관련 기능 열기 ↗", exact: true }).click();
  await page.getByTestId("ontology-workspace").waitFor({ state: "visible" });
  const coach = button(page, "알겠어요");
  if (await coach.isVisible()) await coach.click();
  if (!live) await page.getByTestId("ontology-mode-tbox").click();
}
async function returnOffice(page) {
  const nav = button(page, "AI 상담 진행");
  if (await nav.isVisible()) await nav.click();
  else if (await page.getByTitle("AI 상담 진행 (Agent 실행)", { exact: true }).isVisible()) await page.getByTitle("AI 상담 진행 (Agent 실행)", { exact: true }).click();
  else { await page.getByRole("button", { name: /급여 판정/ }).click(); await nav.click(); }
  await page.getByTestId("office-map").waitFor({ state: "visible" });
}
async function stage(page, text) {
  const desktop = page.getByTestId("office-stage");
  await textIncludes(await desktop.count() ? desktop : page.getByTestId("office-mobile").getByRole("status"), text);
}
async function progress(page, percent) {
  if (await page.getByTestId("office-progress").count()) await equalText(page.getByTestId("office-progress"), `${percent}%`);
  else await textIncludes(page.getByTestId("office-mobile"), `진행 ${percent}%`);
}
async function running(page, count) {
  if (await page.getByTestId("office-running").count()) await equalText(page.getByTestId("office-running"), String(count));
  else await textIncludes(page.getByTestId("office-mobile"), `작업 중 ${count}`);
}
async function screenshot(page, name, { fullPage = false } = {}) {
  await page.screenshot({ path: resolve(OUT, name + ".png"), fullPage, animations: "disabled" });
  report.screenshots.push(name + ".png");
}
async function start(page, utterance = UTTERANCE) {
  await openOps(page);
  await page.locator("#agent-utterance").fill(utterance);
  await page.locator("#agent-today").fill("2026-09-05");
  const index = await page.evaluate(() => window.__officeFixture.agents.length);
  await button(page, "AI 상담 실행하기").click();
  await page.waitForFunction((index) => window.__officeFixture.agents.length > index, index);
  return index;
}
async function emit(page, index, stage, status, detail) {
  await page.evaluate(({ index, stage, status, detail }) => window.__officeFixture.emit(index, { type: "request", stage, request: { status, detail: detail ?? `controlled ${stage} ${status}`, ms: status === "completed" ? 24 : undefined } }), { index, stage, status, detail });
}
async function complete(page, index, options) {
  await page.evaluate(({ index, result }) => window.__officeFixture.complete(index, result), { index, result: resultFor(options) });
  await openOps(page);
  await page.locator("#approval-panel").waitFor({ state: "visible" });
}
async function finishNormal(page, options) {
  const index = await start(page);
  await emit(page, index, "routing", "running");
  await emit(page, index, "extract", "running");
  await complete(page, index, options);
  return index;
}
async function translateStart(page, name = "English") {
  await openOps(page);
  const index = await page.evaluate(() => window.__officeFixture.translations.length);
  await page.locator("#agent-answer").getByRole("button", { name, exact: true }).click();
  await page.waitForFunction((index) => window.__officeFixture.translations.length > index, index);
  await textIncludes(page.locator("#agent-answer").getByRole("status"), "번역 요청 중");
  return index;
}
async function translateFinish(page, index, { error, prefix = "Verified English fixture — " } = {}) {
  await page.evaluate(({ index, error, prefix }) => {
    const f = window.__officeFixture;
    if (error) f.translate(index, { error, provider: "ollama", model: "browser-fixture" }, 502);
    else { const answer = structuredClone(f.translations[index].body.answer); answer.headline = prefix + answer.headline; f.translate(index, { answer, provider: "ollama", model: "browser-fixture" }); }
  }, { index, error, prefix });
}

let browser;
async function scenario(name, fn, { viewport = VIEWPORTS[0], reducedMotion = "no-preference", offline = false, touch = false } = {}) {
  if (FILTER && !FILTER.test(name)) return;
  const item = { name, viewport, reducedMotion, status: "running", errors: [], startedAt: new Date().toISOString() };
  report.tests.push(item);
  const context = await browser.newContext({ viewport, reducedMotion, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch });
  await context.addInitScript(installFixture, { offline });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on("pageerror", (error) => item.errors.push({ type: "pageerror", message: error.message }));
  page.on("console", (message) => { if (message.type() === "error") item.errors.push({ type: "console", message: message.text() }); });
  try {
    // Wait for client hydration before interacting with server-rendered controls.
    await page.goto(BASE, { waitUntil: "networkidle" });
    await button(page, "바로 콘솔로").click();
    const nav = button(page, "AI 상담 진행");
    await Promise.any([nav.waitFor({ state: "visible" }), page.getByTitle("AI 상담 진행 (Agent 실행)", { exact: true }).waitFor({ state: "visible" })]);
    if (!(await nav.isVisible())) {
      await page.getByTitle("AI 상담 진행 (Agent 실행)", { exact: true }).click();
    } else {
      await nav.click();
    }
    await page.getByTestId("office-map").waitFor({ state: "visible" });
    await page.getByTestId("office-map").locator("canvas").waitFor({ state: "visible" });
    await page.evaluate(() => document.fonts.ready);
    await fn(page, item);
    assert.equal(item.errors.length, 0, `Browser runtime errors: ${JSON.stringify(item.errors)}`);
    item.status = "passed";
    console.log(`PASS ${name}`);
  } catch (error) {
    item.status = "failed";
    item.failure = error.stack;
    console.error(`FAIL ${name}: ${error.message}`);
    try { await screenshot(page, `failure-${name.replace(/[^a-z0-9-]/gi, "-")}`); } catch (captureError) { item.captureError = captureError.message; }
  } finally {
    item.finishedAt = new Date().toISOString();
    await context.close();
    await writeFile(resolve(OUT, "report.json"), JSON.stringify(report, null, 2) + "\n");
  }
}

async function main() {
  await mkdir(OUT, { recursive: true });
  browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL ?? "chrome" });
  report.browser = browser.version();
  await scenario("integration-empty-queue-and-user-resubmission", async (page) => {
    await button(page, "판정 결과 보기").click();
    await page.getByText("판정할 상담이 아직 없습니다", { exact: true }).waitFor({ state: "visible" });
    assert.equal(await page.locator('aside button[aria-current="page"]').count(), 0);
    await button(page, "내 급여 확인하기로 이동 →").click();
    await page.locator("#user-first-field").selectOption("네팔");
    await page.getByLabel("월급 (평균)", { exact: true }).fill("3250000");
    await button(page, "받을 돈 확인하기").click();
    await button(page, "판정 결과 보기로 이동 →").click();
    const selected = page.locator('aside button[aria-current="page"]');
    assert.equal(await selected.count(), 1);
    await textIncludes(selected, "U-01");
    assert.equal(await page.getByLabel(/^국적/).inputValue(), "네팔");
    assert.equal(await page.getByLabel("월 평균임금 · S1에서 승계 가능").inputValue(), "3250000");
    await returnOffice(page);
    const pending = await start(page);
    await closeOps(page);
    await button(page, "내 급여 확인하기").click();
    await page.getByLabel("월급 (평균)", { exact: true }).fill("2750000");
    await button(page, "받을 돈 확인하기").click();
    await button(page, "판정 결과 보기로 이동 →").click();
    assert.equal(await selected.count(), 1);
    assert.equal(await page.getByLabel("월 평균임금 · S1에서 승계 가능").inputValue(), "2750000");
    await returnOffice(page);
    await page.evaluate(({ index, result }) => window.__officeFixture.complete(index, result), { index: pending, result: resultFor() });
    await openOps(page);
    assert.equal(await page.locator("#approval-panel").count(), 0);
    await progress(page, 0);
  });
  await scenario("integration-fresh-departure-apply-visible", async (page) => {
    await finishNormal(page);
    await button(page, "값을 확인했습니다. 승인").click();
    await button(page, "승인한 결과 적용 · 상담 완료").click();
    await progress(page, 100);
    await openOps(page);
    await button(page, "판정 결과 자세히 보기").click();
    assert.equal(await page.getByRole("heading", { level: 1 }).innerText(), UTTERANCE);
    assert.equal(await page.getByText("판정할 상담이 아직 없습니다", { exact: true }).count(), 0);
    assert.equal(await page.locator('aside button[aria-current="page"]').count(), 1);
    assert.equal(await page.getByLabel("월 평균임금 · S1에서 승계 가능").inputValue(), "2150000");
  });
  for (const viewport of VIEWPORTS) {
    const size = `${viewport.width}x${viewport.height}`;
    await scenario(`lifecycle-${size}`, async (page) => {
      await running(page, 0); await progress(page, 0);
      await screenshot(page, `${size}-overview`);
      const index = await start(page);
      await emit(page, index, "routing", "running");
      await emit(page, index, "extract", "running");
      await running(page, 2);
      await stage(page, "추출");
      if (viewport.width < 1024) await page.getByTestId("office-mobile").scrollIntoViewIfNeeded();
      await screenshot(page, `${size}-running`);
      await emit(page, index, "routing", "completed");
      await running(page, 1);
      await openOps(page);
      await textIncludes(page.locator('[data-stage="0단"]'), "완료");
      await textIncludes(page.locator('[data-stage="1단"]'), "controlled extract running");
      await emit(page, index, "extract", "completed");
      await complete(page, index);
      await running(page, 0);
      assert.equal(await button(page, "값을 확인했습니다. 승인").isEnabled(), true);
      await textIncludes(page.locator("#agent-answer").getByRole("status"), "번역 불필요");
      await closeOps(page);
      if (viewport.width < 1024) await page.locator("#approval-panel").scrollIntoViewIfNeeded();
      await screenshot(page, `${size}-approval`);
      await openOps(page);
      await button(page, "값을 확인했습니다. 승인").click();
      assert.equal(await page.locator("#agent-field-monthlyWage").isDisabled(), true);
      await button(page, "승인한 결과 적용 · 상담 완료").click();
      await progress(page, 100); await running(page, 0); await stage(page, "완료");
      if (viewport.width < 1024) await page.getByTestId("office-mobile").scrollIntoViewIfNeeded();
      await screenshot(page, `${size}-completed`);
      await openOps(page);
      await textIncludes(page.locator("#approval-panel").locator("..").locator("p"), "결과 적용 · 상담 기록 완료");
    }, { viewport });
  }

  await scenario("partial-request-failure", async (page) => {
    const index = await start(page);
    await emit(page, index, "routing", "running"); await emit(page, index, "extract", "running");
    await emit(page, index, "routing", "completed"); await emit(page, index, "extract", "failed", "controlled extract timeout");
    await complete(page, index, { intakeError: "controlled extract timeout" });
    await textIncludes(page.locator('[data-stage="0단"]'), "완료");
    await textIncludes(page.locator('[data-stage="1단"]'), "controlled extract timeout");
    assert.equal(await button(page, "값을 확인했습니다. 승인").isEnabled(), false);
    await running(page, 0);
    assert.notEqual(await page.getByTestId("office-progress").innerText(), "100%");
  });
  await scenario("missing-input-repair-approval-and-revision", async (page) => {
    const missingVisa = { ...FIELDS }; delete missingVisa.visa;
    await finishNormal(page, { fields: missingVisa });
    assert.equal(await button(page, "값을 확인했습니다. 승인").isEnabled(), false);
    await textIncludes(page.locator('[data-stage="2단"]'), "체류자격");
    await page.waitForFunction(() => JSON.parse(document.querySelector('[data-testid="office-map"] canvas').dataset.transfers).some((transfer) => transfer.from === "judge" && transfer.to === "input" && transfer.label.includes("체류자격")));
    await page.locator("#agent-field-visa").selectOption("E-9");
    await textIncludes(page.locator('[data-stage="2단"]'), "완료");
    await page.waitForFunction(() => {
      const transfers = JSON.parse(document.querySelector('[data-testid="office-map"] canvas').dataset.transfers);
      return !transfers.some((transfer) => transfer.to === "input") && transfers.some((transfer) => transfer.to === "counselor");
    });
    await button(page, "값을 확인했습니다. 승인").click();
    assert.equal(await page.locator("#agent-field-monthlyWage").isDisabled(), true);
    await button(page, "수정 재개 (승인 해제)").click();
    await page.locator("#agent-field-monthlyWage").fill("3150000");
    assert.equal(await button(page, "승인한 결과 적용 · 상담 완료").count(), 0);
    await page.locator("#agent-today").fill("2026-09-06");
    await textIncludes(page.locator('[data-stage="2단"]'), "기준일 2026-09-06");
    await button(page, "값을 확인했습니다. 승인").click();
    await button(page, "승인한 결과 적용 · 상담 완료").click();
    await progress(page, 100);
    await openOps(page);
    assert.equal(await page.locator("#agent-field-monthlyWage").inputValue(), "3150000");
    await page.locator("#agent-today").fill("2026-09-07");
    await button(page, "값을 확인했습니다. 승인").waitFor({ state: "visible" });
    assert.notEqual(await page.getByTestId("office-progress").innerText(), "100%");
  });
  await scenario("translation-success-failure-and-number-rejection", async (page) => {
    await finishNormal(page);
    let index = await translateStart(page);
    await translateFinish(page, index);
    await textIncludes(page.locator("#agent-answer").getByRole("status"), "번역과 숫자 보존 검증 완료");
    await page.locator("#agent-answer summary").click();
    await textIncludes(page.locator("#agent-answer"), "Verified English fixture");
    await page.locator("#agent-answer").getByRole("button", { name: "한국어 원문", exact: true }).click();
    assert.equal(await page.locator("#agent-answer").getByText("Verified English fixture", { exact: false }).count(), 0);
    index = await translateStart(page);
    await translateFinish(page, index, { error: "controlled translation network failure" });
    await textIncludes(page.locator("#agent-answer").getByRole("status"), "번역 요청 실패 · 한국어 원문 유지");
    index = await translateStart(page, "Tiếng Việt");
    await translateFinish(page, index, { error: "숫자 보존 위반: 원문 숫자와 번역 숫자가 다릅니다" });
    await textIncludes(page.locator("#agent-answer").getByRole("status"), "번역 검증 실패 · 한국어 원문 유지");
    await page.locator("#agent-answer").getByRole("button", { name: "한국어 원문", exact: true }).click();
    await textIncludes(page.locator("#agent-answer").getByRole("status"), "번역 불필요");
  });
  await scenario("translation-late-response-language-and-input-isolation", async (page) => {
    await finishNormal(page);
    let index = await translateStart(page);
    await page.locator("#agent-answer").getByRole("button", { name: "한국어 원문", exact: true }).click();
    await translateFinish(page, index, { prefix: "STALE LANGUAGE RESULT — " });
    await textIncludes(page.locator("#agent-answer").getByRole("status"), "번역 불필요");
    assert.equal(await page.locator("#agent-answer").innerText().then((text) => text.includes("STALE LANGUAGE")), false);
    index = await translateStart(page);
    await page.locator("#agent-field-monthlyWage").fill("3100000");
    await translateFinish(page, index, { prefix: "STALE INPUT RESULT — " });
    await textIncludes(page.locator("#agent-answer").getByRole("status"), "번역 불필요");
    assert.equal(await page.locator("#agent-answer").innerText().then((text) => text.includes("STALE INPUT")), false);
  });
  await scenario("late-agent-result-after-edit-and-rerun", async (page) => {
    const first = await start(page);
    await emit(page, first, "routing", "running"); await emit(page, first, "extract", "running");
    await openOps(page);
    await page.locator("#agent-utterance").fill(UTTERANCE + " 이번 상담입니다.");
    await running(page, 0);
    const second = await start(page, UTTERANCE + " 이번 상담입니다.");
    await emit(page, second, "routing", "running"); await emit(page, second, "extract", "running");
    await page.evaluate(({ first, result }) => window.__officeFixture.complete(first, result), { first, result: resultFor({ fields: { ...FIELDS, nationality: "네팔", monthlyWage: 9900000 } }) });
    await running(page, 2);
    await openOps(page); assert.equal(await page.locator("#approval-panel").count(), 0);
    await complete(page, second);
    assert.equal(await page.locator("#agent-field-nationality").inputValue(), "베트남");
    assert.equal(await page.locator("#agent-field-monthlyWage").inputValue(), "2150000");
  });
  await scenario("explicit-cancel-ignores-late-response", async (page) => {
    const index = await start(page);
    await emit(page, index, "routing", "running"); await emit(page, index, "extract", "running");
    await running(page, 2);
    await button(page, "실행 취소").click();
    await running(page, 0); await progress(page, 0);
    await page.evaluate(({ index, result }) => window.__officeFixture.complete(index, result), { index, result: resultFor() });
    await openOps(page);
    assert.equal(await page.locator("#approval-panel").count(), 0);
    assert.equal(await button(page, "AI 상담 실행하기").isEnabled(), true);
    await progress(page, 0);
  });
  await scenario("late-agent-result-after-case-switch", async (page) => {
    const index = await start(page);
    await emit(page, index, "routing", "running"); await emit(page, index, "extract", "running");
    await button(page, "공간 찾기").click();
    await page.getByRole("region", { name: "사무실 공간 목록", exact: true }).getByRole("button", { name: /대기 상담 S2-02/ }).click();
    await button(page, "이 상담 열기").click();
    await running(page, 0); await progress(page, 0);
    await page.evaluate(({ index, result }) => window.__officeFixture.complete(index, result), { index, result: resultFor() });
    await openOps(page); assert.equal(await page.locator("#approval-panel").count(), 0);
    await progress(page, 0);
  });
  await scenario("source-case-preserved-through-apply-and-reselection", async (page) => {
    async function selectCase(id) {
      await closeOps(page);
      await button(page, "공간 찾기").click();
      await page.getByRole("region", { name: "사무실 공간 목록", exact: true }).getByRole("button", { name: new RegExp("대기 상담 " + id) }).click();
      await button(page, "이 상담 열기").click();
    }
    await selectCase("S2-02");
    await finishNormal(page);
    await page.locator("#agent-field-monthlyWage").fill("3250000");
    await page.locator("#agent-today").fill("2026-09-08");
    await button(page, "값을 확인했습니다. 승인").click();
    await button(page, "승인한 결과 적용 · 상담 완료").click();
    await progress(page, 100);
    await textIncludes(page.locator("body"), "S2-02 · 국적 분기");
    await openOps(page); await button(page, "판정 결과 자세히 보기").click();
    assert.equal(await page.getByRole("heading", { level: 1 }).innerText(), UTTERANCE);
    const properties = page.getByLabel("기준일 (today)");
    if (!(await properties.isVisible())) await page.getByRole("button", { name: /속성 패널/ }).click();
    assert.equal(await properties.inputValue(), "2026-09-08");
    assert.equal(await page.getByLabel("월 평균임금 · S1에서 승계 가능").inputValue(), "3250000");
    await button(page, "AI 상담 진행").click();
    await selectCase("S2-01"); await selectCase("S2-02");
    await progress(page, 0); await openOps(page);
    assert.equal(await page.locator("#approval-panel").count(), 0);
  });
  for (const size of ["5인미만", "모름"]) await scenario(`payslip-handoff-preserves-${size === "모름" ? "unknown" : "small"}-workplace`, async (page) => {
    const utterance = "급여명세서에서 산재보험을 공제하는데 맞나요";
    const index = await start(page, utterance);
    const response = resultFor({ utterance, fields: { workplaceSize: size } });
    response.router.skill = "payslip";
    await page.evaluate(({ index, response }) => window.__officeFixture.complete(index, response), { index, response });
    await openOps(page);
    await button(page, "명세서 입력으로 이동 ▶").waitFor({ state: "visible" });
    await page.locator("#agent-today").fill("2026-09-09");
    await button(page, "명세서 입력으로 이동 ▶").click();
    assert.equal(await page.getByRole("heading", { level: 1 }).innerText(), utterance);
    assert.equal(await page.getByLabel("기준일 (today)").inputValue(), "2026-09-09");
    assert.equal(await page.getByLabel("상시 근로자 수 · A7 분기").inputValue(), size);
    await textIncludes(page.locator("main"), "S2-01");
    await textIncludes(page.locator("main"), "대기 중");
    assert.equal(await page.getByText("판정 완료", { exact: true }).count(), 0);
  });
  await scenario("offline-provider-is-actionable", async (page) => {
    await openOps(page);
    await textIncludes(page.locator("#ops-panel"), "AI 미연결");
    await button(page, "AI 상담 실행하기").click();
    await textIncludes(page.getByRole("alert"), "AI 제공자 미연결");
    await running(page, 0);
    await button(page, "입력 확인 · 다시 실행").click();
    assert.equal(await button(page, "AI 상담 실행하기").isEnabled(), true);
  }, { offline: true });
  await scenario("network-failure-can-retry", async (page) => {
    await openOps(page);
    await page.evaluate(() => { window.__officeFixture.failNext = true; });
    await button(page, "AI 상담 실행하기").click();
    await textIncludes(page.getByRole("alert"), "controlled network failure");
    await running(page, 0);
    await finishNormal(page);
    assert.equal(await button(page, "값을 확인했습니다. 승인").isEnabled(), true);
  });
  await scenario("mobile-network-failure-can-retry", async (page) => {
    await page.evaluate(() => { window.__officeFixture.failNext = true; });
    await button(page, "AI 상담 실행하기").click();
    await textIncludes(page.getByRole("alert"), "controlled network failure");
    await running(page, 0);
    await finishNormal(page);
    assert.equal(await button(page, "값을 확인했습니다. 승인").isEnabled(), true);
  }, { viewport: VIEWPORTS[2] });
  await scenario("geometry-controls-selection-tracking-and-keyboard", async (page) => {
    const map = page.getByTestId("office-map");
    const miniView = page.getByRole("img", { name: "사무실 미니맵", exact: true }).locator('rect[pointer-events="none"]');
    const width = () => miniView.getAttribute("width").then(Number);
    const initial = await width();
    await button(page, "사무실 확대").click();
    await page.waitForFunction((initial) => Number(document.querySelector('svg[aria-label="사무실 미니맵"] rect[pointer-events="none"]')?.getAttribute("width")) < initial, initial);
    await button(page, "사무실 축소").click(); assert.ok(Math.abs(await width() - initial) < 1);
    await button(page, "중앙 로비").click(); assert.ok(await width() < initial);
    await button(page, "전체 보기").click(); assert.ok(Math.abs(await width() - initial) < 1);
    await button(page, "공간 찾기").click();
    const directory = page.getByRole("region", { name: "사무실 공간 목록", exact: true });
    assert.ok(await directory.getByRole("button").count() >= 24, "Expanded office should expose at least 24 spaces/staff entries");
    await directory.getByRole("button", { name: /업무 배분|라우팅 관제/ }).first().click();
    await page.getByRole("region", { name: /상세$/ }).waitFor({ state: "visible" });
    await button(page, "공간 상세 닫기").click();
    await button(page, "전체 보기").click();
    const label = map.locator("button[data-room]").first();
    const labelName = await label.getAttribute("aria-label");
    await label.click();
    await page.getByRole("region", { name: labelName.replace(" 공간 보기", " 상세"), exact: true }).waitFor({ state: "visible" });
    await button(page, "공간 상세 닫기").click();
    await map.focus(); await page.keyboard.press("+"); assert.ok(await width() < initial);
    const beforePan = await miniView.getAttribute("x");
    await page.keyboard.press("ArrowRight"); assert.notEqual(await miniView.getAttribute("x"), beforePan);
    await page.keyboard.press("0"); assert.ok(Math.abs(await width() - initial) < 1);
    await page.getByTestId("office-minimap-target").click({ position: { x: 65, y: 42 } }); assert.ok(await width() < initial);
    await page.getByTestId("office-minimap-target").focus(); await page.keyboard.press("Enter");
    const index = await start(page); await emit(page, index, "routing", "running"); await emit(page, index, "extract", "running");
    await button(page, "현재 업무").click();
    await button(page, "문서 따라가기").click();
    await button(page, "문서 추적 해제").waitFor({ state: "visible" });
    const bounds = await map.boundingBox();
    await page.mouse.move(bounds.x + bounds.width * .55, bounds.y + bounds.height * .65);
    await page.mouse.down(); await page.mouse.move(bounds.x + bounds.width * .55 + 65, bounds.y + bounds.height * .65 + 30, { steps: 8 }); await page.mouse.up();
    await button(page, "문서 따라가기").waitFor({ state: "visible" });
    await screenshot(page, "geometry-interaction");
  });
  await scenario("reduced-motion-retains-execution-and-approval", async (page) => {
    assert.equal(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches), true);
    await finishNormal(page);
    const durations = await page.locator(".motion-stage").evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).animationDuration));
    assert.ok(durations.length > 0);
    assert.ok(durations.every((duration) => parseFloat(duration) * (duration.endsWith("ms") ? 1 : 1000) < 1), `Motion durations: ${durations}`);
    await button(page, "값을 확인했습니다. 승인").click();
    await button(page, "승인한 결과 적용 · 상담 완료").click();
    await progress(page, 100); await running(page, 0);
    await screenshot(page, "reduced-motion-completed");
  }, { reducedMotion: "reduce" });
  await scenario("projected-customer-agent-and-document-picking", async (page) => {
    const map = page.getByTestId("office-map");
    async function clickPosition(kind, id) {
      const point = await map.evaluate((element, { kind, id }) => {
        const camera = JSON.parse(element.dataset.camera);
        const positions = JSON.parse(element.querySelector("canvas").dataset.positions);
        const point = kind === "customer" ? positions.customer : positions[kind][id];
        if (!point) throw new Error(`Missing rendered ${kind} ${id}`);
        const rect = element.getBoundingClientRect();
        return { x: rect.x + point.x * camera.scale + camera.tx, y: rect.y + point.y * camera.scale + camera.ty - 10 };
      }, { kind, id });
      await page.mouse.click(point.x, point.y);
    }
    await clickPosition("customer");
    await page.getByRole("region", { name: "상담 중 고객 상세", exact: true }).waitFor({ state: "visible" });
    const beforeCustomerFollow = await map.getAttribute("data-camera");
    await button(page, "따라가기").click();
    await page.waitForFunction((before) => document.querySelector('[data-testid="office-map"]').dataset.camera !== before, beforeCustomerFollow);
    await textIncludes(map, "고객 따라가는 중");
    await button(page, "공간 상세 닫기").click();
    await button(page, "전체 보기").click();
    await clickPosition("agents", "routing");
    await page.getByRole("region", { name: "라우팅 에이전트 상세", exact: true }).waitFor({ state: "visible" });
    const beforeAgentFollow = await map.getAttribute("data-camera");
    await button(page, "따라가기").click();
    await page.waitForFunction((before) => document.querySelector('[data-testid="office-map"]').dataset.camera !== before, beforeAgentFollow);
    await textIncludes(map, "라우팅 에이전트 따라가는 중");
    await button(page, "공간 상세 닫기").click();
    await button(page, "전체 보기").click();
    const index = await start(page); await emit(page, index, "routing", "running"); await emit(page, index, "extract", "running");
    await running(page, 2);
    await page.waitForFunction(() => JSON.parse(document.querySelector('[data-testid="office-map"] canvas').dataset.positions).docs.routing);
    await clickPosition("docs", "routing");
    const detail = page.getByRole("region", { name: "업무 전달 문서 상세", exact: true });
    await detail.waitFor({ state: "visible" });
    await textIncludes(detail, "보낸 부서"); await textIncludes(detail, "받는 부서");
    await textIncludes(detail, "업무 분류 요청");
    const beforeDocFollow = await map.getAttribute("data-camera");
    await button(page, "이 문서 따라가기").click();
    await page.waitForFunction((before) => document.querySelector('[data-testid="office-map"]').dataset.camera !== before, beforeDocFollow);
    await textIncludes(map, "업무 문서 따라가는 중");
    await screenshot(page, "document-inspection-follow");
    await button(page, "공간 상세 닫기").click();
    await map.focus(); await page.keyboard.press("ArrowLeft");
    await textIncludes(map, "문서를 따라 부서의 업무가 이어집니다");
    // Keyboard-accessible document selection reaches the same semantic detail.
    await page.getByLabel("업무 전달 문서 선택").selectOption("extract");
    await textIncludes(detail, "상담 정보 확인");
  }, { reducedMotion: "reduce" });
  await scenario("moving-packets-follow-walkable-corridors", async (page) => {
    const index = await start(page); await emit(page, index, "routing", "running"); await emit(page, index, "extract", "running");
    await running(page, 2);
    const samples = await page.evaluate(async () => {
      const output = [], canvas = document.querySelector('[data-testid="office-map"] canvas');
      const begin = performance.now();
      while (performance.now() - begin < 2200) {
        output.push({ projected: JSON.parse(canvas.dataset.positions), floor: JSON.parse(canvas.dataset.floorPositions) });
        await new Promise((resolve) => setTimeout(resolve, 30));
      }
      return output;
    });
    assert.ok(samples.length > 10);
    const visits = new Set();
    for (const sample of samples) for (const [id, point] of Object.entries({ customer: sample.projected.customer, ...sample.projected.docs })) {
      const floor = id === "customer" ? sample.floor.customer : sample.floor.docs[id];
      const inverse = unproject(point.x, point.y);
      assert.ok(Math.hypot(floor.x - inverse.x, floor.y - inverse.y) < 1e-8, `${id} render position diverges from actual floor position`);
      visits.add(`${id}:${floor.x.toFixed(1)},${floor.y.toFixed(1)}`);
      assert.ok(isWalkable(floor.x, floor.y), `${id} entered blocked geometry at ${JSON.stringify(floor)}`);
    }
    assert.ok(visits.size > 20, `Only ${visits.size} unique movement positions observed`);
    report.measurements.pathMotion = { samples: samples.length, uniquePositions: visits.size, allWithinWalkableFloor: true };
    await running(page, 2);
  });
  await scenario("hidden-visibility-suspends-and-resumes-rendering", async (page) => {
    const index = await start(page); await emit(page, index, "routing", "running"); await emit(page, index, "extract", "running");
    await running(page, 2);
    const background = await page.context().newPage();
    await background.bringToFront();
    const nativeHidden = await page.evaluate(() => document.hidden);
    const evidence = await page.evaluate(async (nativeHidden) => {
      const canvas = document.querySelector('[data-testid="office-map"] canvas');
      if (!nativeHidden) {
        // Headless Chrome can keep all tabs visible. Explicit lifecycle fixture in that case.
        Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
        document.dispatchEvent(new Event("visibilitychange"));
      }
      const before = Number(canvas.dataset.drawCount);
      await new Promise((resolve) => setTimeout(resolve, 600));
      const after = Number(canvas.dataset.drawCount);
      if (!nativeHidden) { delete document.hidden; document.dispatchEvent(new Event("visibilitychange")); }
      return { mode: nativeHidden ? "native background-tab visibility" : "headless document.hidden + visibilitychange fixture", hiddenFrames: after - before, before, after };
    }, nativeHidden);
    await background.close(); await page.bringToFront();
    assert.equal(evidence.hiddenFrames, 0);
    await page.waitForFunction((after) => Number(document.querySelector('[data-testid="office-map"] canvas').dataset.drawCount) > after, evidence.after);
    report.measurements.hiddenOffice = { ...evidence, resumedRendering: true };
  });
  await scenario("static-render-and-interaction-measurements", async (page) => {
    // Staff life is now explicitly enabled by default; measure an explicitly paused office.
    const toggle = page.getByTestId("office-motion-toggle");
    if (await toggle.getAttribute("aria-pressed") === "true") await toggle.click();
    // Observation windows are measurements, not fabricated execution timing.
    const sample = await page.evaluate(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      const canvas = document.querySelector('[data-testid="office-map"] canvas');
      const before = Number(canvas.dataset.drawCount);
      const begin = performance.now();
      await new Promise((resolve) => setTimeout(resolve, 700));
      return { frames: Number(canvas.dataset.drawCount) - before, milliseconds: performance.now() - begin, averageDrawMs: Number(canvas.dataset.averageDrawMs) };
    });
    report.measurements.staticOffice = sample;
    assert.ok(sample.frames <= 2, `Idle office rendered ${sample.frames} frames in ${sample.milliseconds}ms`);
    const map = page.getByTestId("office-map");
    const bounds = await map.boundingBox();
    await page.evaluate(() => {
      window.__officeFrameSample = { start: performance.now(), times: [] };
      const frame = (time) => { window.__officeFrameSample.times.push(time); if (time - window.__officeFrameSample.start < 1300) requestAnimationFrame(frame); };
      requestAnimationFrame(frame);
    });
    for (let i = 0; i < 4; i += 1) { await button(page, "사무실 확대").click(); await button(page, "사무실 축소").click(); }
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height * .75); await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width / 2 + 150, bounds.y + bounds.height * .75 - 40, { steps: 18 }); await page.mouse.up();
    await page.waitForFunction(() => performance.now() - window.__officeFrameSample.start >= 1400);
    report.measurements.interaction = await page.evaluate(() => {
      const times = window.__officeFrameSample.times;
      const intervals = times.slice(1).map((time, i) => time - times[i]).sort((a, b) => a - b);
      return { viewport: { width: innerWidth, height: innerHeight }, sampledFrames: times.length, elapsedMs: times.at(-1) - times[0], meanFrameIntervalMs: intervals.reduce((sum, value) => sum + value, 0) / intervals.length, p95FrameIntervalMs: intervals[Math.floor(intervals.length * .95)], maximumFrameIntervalMs: intervals.at(-1), environment: navigator.userAgent };
    });
    assert.ok(report.measurements.interaction.sampledFrames > 3, "Frame sample must contain measurable intervals");
  });
  for (const viewport of [VIEWPORTS[0], VIEWPORTS[2]]) await scenario(`knowledge-live-growth-${viewport.width}`, async (page) => {
    await openOntology(page, { live: true });
    const live = page.getByTestId("ontology-live");
    await live.waitFor({ state: "visible" });
    const graph = live.getByTestId("ontology-graph");
    assert.equal(await graph.evaluate((element) => getComputedStyle(element).backgroundColor), "rgb(255, 255, 255)");
    assert.equal(await live.getByTestId("ontology-live-event").count(), 0, "Available services must not masquerade as executed nodes");
    assert.ok(await graph.locator('[data-node-kind="service"]').count() >= 10);
    const serviceAnchors = await graph.locator('[data-node-kind="service"]').evaluateAll((nodes) => Object.fromEntries(nodes.map((node) => [node.dataset.nodeId, [parseFloat(node.style.left), parseFloat(node.style.top)]])));
    await live.getByLabel("상담 내용").fill(UTTERANCE);
    await live.getByLabel("기준일").fill("2026-09-05");
    await live.getByRole("button", { name: "상담 실행", exact: true }).click();
    await page.waitForFunction(() => window.__officeFixture.agents.length === 1);
    const acceptedCount = await live.getByTestId("ontology-live-event").count();
    assert.ok(acceptedCount > 0);
    assert.equal(await graph.locator('[data-node-status="running"]').count(), 0, "Acceptance is not a dispatched request");
    await emit(page, 0, "routing", "running");
    await emit(page, 0, "extract", "running");
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="ontology-live"] [data-node-status="running"]').length >= 2);
    assert.ok(await live.getByTestId("ontology-live-event").count() > acceptedCount);
    await screenshot(page, `live-${viewport.width}-running`);
    await graph.screenshot({ path: resolve(OUT, `live-${viewport.width}-running-graph.png`) });
    await page.evaluate((result) => window.__officeFixture.complete(0, result), resultFor());
    await page.waitForFunction(() => Number(document.querySelector('[data-testid="ontology-live"]')?.dataset.generated) > 12);
    assert.equal(await graph.locator('[data-node-status="running"]').count(), 0);
    await textIncludes(live, "2150000");
    await textIncludes(live, "베트남");
    await page.waitForFunction(() => document.querySelector('[data-testid="ontology-graph"]')?.dataset.settling === "false");
    const survivingAnchors = await graph.locator('[data-node-kind="service"]').evaluateAll((nodes) => Object.fromEntries(nodes.map((node) => [node.dataset.nodeId, [parseFloat(node.style.left), parseFloat(node.style.top)]])));
    for (const [id, point] of Object.entries(serviceAnchors)) assert.ok(Math.hypot(point[0] - survivingAnchors[id][0], point[1] - survivingAnchors[id][1]) < 9, "Existing service anchors must not be rearranged when a result arrives");
    await screenshot(page, `live-${viewport.width}-completed`, { fullPage: viewport.width < 520 });
    await graph.screenshot({ path: resolve(OUT, `live-${viewport.width}-completed-graph.png`) });
    const completedCount = Number(await live.getAttribute("data-generated"));
    await live.getByLabel("상담 내용").fill("새로운 상담입니다. 출국 정산을 알려주세요.");
    await page.waitForFunction(() => document.querySelector('[data-testid="ontology-live"]')?.dataset.generated === "0");
    assert.equal(await live.getByTestId("ontology-live-event").count(), 0, "Edited input removes prior execution facts immediately");
    assert.ok(completedCount > 12);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  }, { viewport });

  for (const reducedMotion of ["no-preference", "reduce"]) await scenario(`knowledge-live-motion-${reducedMotion}`, async (page) => {
    await openOntology(page, { live: true });
    const graph = page.getByTestId("ontology-graph");
    await graph.scrollIntoViewIfNeeded();
    await page.mouse.move(0, 0);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const sample = await page.evaluate(async () => {
      const graph = document.querySelector('[data-testid="ontology-graph"]');
      const node = graph.querySelector('[data-node-id="service:input"]');
      const before = node.style.cssText, camera = graph.dataset.camera, frames = window.__officeFixture.ontologyFrames;
      await new Promise((resolve) => setTimeout(resolve, 360));
      return { before, after: node.style.cssText, camera, cameraAfter: graph.dataset.camera, frames: window.__officeFixture.ontologyFrames - frames };
    });
    assert.equal(sample.camera, sample.cameraAfter, "Natural node motion must not spin the camera");
    if (reducedMotion === "reduce") {
      assert.equal(sample.before, sample.after);
      assert.equal(sample.frames, 0);
      assert.ok(await graph.getByRole("button", { name: "자연스러운 움직임 멈추기", exact: true }).isDisabled());
    } else {
      assert.notEqual(sample.before, sample.after);
      assert.ok(sample.frames > 0 && sample.frames <= 14, "Motion render loop is bounded near 30 fps");
      await graph.getByRole("button", { name: "자연스러운 움직임 멈추기", exact: true }).click();
      await page.mouse.move(0, 0);
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const stopped = await page.evaluate(async () => {
        const before = window.__officeFixture.ontologyFrames;
        await new Promise((resolve) => setTimeout(resolve, 220));
        return window.__officeFixture.ontologyFrames - before;
      });
      assert.equal(stopped, 0);
      await graph.getByRole("button", { name: "자연스러운 움직임 켜기", exact: true }).click();
      const hidden = await page.evaluate(async () => {
        Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
        document.dispatchEvent(new Event("visibilitychange"));
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const before = window.__officeFixture.ontologyFrames;
        await new Promise((resolve) => setTimeout(resolve, 220));
        const frames = window.__officeFixture.ontologyFrames - before;
        delete document.hidden; document.dispatchEvent(new Event("visibilitychange"));
        return frames;
      });
      assert.equal(hidden, 0);
    }
    report.measurements[`liveMotion-${reducedMotion}`] = sample;
  }, { reducedMotion });

  for (const viewport of [VIEWPORTS[0], VIEWPORTS[2]]) await scenario(`knowledge-3d-network-${viewport.width}`, async (page) => {
    await openOntology(page);
    const graph = page.getByTestId("ontology-graph");
    assert.equal(await graph.getAttribute("data-graph-scope"), "global", "Open the full real network, not a five-node diagram");
    const canvas = graph.locator("canvas");
    await canvas.waitFor({ state: "visible" });
    assert.ok(await graph.getByTestId("ontology-graph-node").count() >= 99);
    await graph.scrollIntoViewIfNeeded();
    const before = await graph.getAttribute("data-camera");
    const depths = await graph.getByTestId("ontology-graph-node").evaluateAll((items) => Object.fromEntries(items.map((item) => [item.dataset.nodeId, item.dataset.depth])));
    assert.ok(new Set(Object.values(depths)).size > 90, "Actual nodes must occupy distinct 3D depths");
    const selectionBeforeDrag = await graph.locator('[aria-pressed="true"][data-node-id]').getAttribute("data-node-id");
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + box.width * .4, box.y + box.height * .45);
    await page.mouse.down(); await page.mouse.move(box.x + box.width * .65, box.y + box.height * .65, { steps: 12 }); await page.mouse.up();
    assert.notEqual(await graph.getAttribute("data-camera"), before);
    const depthsAfter = await graph.getByTestId("ontology-graph-node").evaluateAll((items) => Object.fromEntries(items.map((item) => [item.dataset.nodeId, item.dataset.depth])));
    assert.ok(Object.keys(depths).filter((id) => depths[id] !== depthsAfter[id]).length > 90, "Rotation must change projected node depth, not merely CSS transform the canvas");
    assert.equal(await graph.locator('[aria-pressed="true"][data-node-id]').getAttribute("data-node-id"), selectionBeforeDrag, "Dragging must not select a crossed node");
    const keyboardTarget = graph.locator('[data-testid="ontology-graph-node"][aria-pressed="false"]').first();
    const keyboardTargetId = await keyboardTarget.getAttribute("data-node-id");
    await keyboardTarget.focus(); await page.keyboard.press("Enter");
    assert.equal(await graph.locator('[aria-pressed="true"][data-node-id]').getAttribute("data-node-id"), keyboardTargetId, "A previous drag must not suppress keyboard activation");
    const rotated = await graph.getAttribute("data-camera");
    await graph.getByRole("button", { name: "그래프 확대", exact: true }).click();
    assert.notEqual(await graph.getAttribute("data-camera"), rotated);
    await graph.getByRole("button", { name: "시점 초기화", exact: true }).click();
    assert.equal(await graph.getAttribute("data-camera"), before);
    await graph.getByRole("button", { name: "그래프 크게 보기", exact: true }).click();
    assert.equal(await graph.getAttribute("data-expanded"), "true");
    const expandedBounds = await graph.boundingBox();
    assert.ok(expandedBounds.x <= 20 && expandedBounds.y >= 0 && expandedBounds.y <= 20 && expandedBounds.width >= viewport.width - 40 && expandedBounds.height >= viewport.height - 40, `Expanded graph must use the viewport, got ${JSON.stringify(expandedBounds)}`);
    await page.waitForFunction(() => {
      const canvas = document.querySelector('[data-testid="ontology-graph"] canvas');
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(devicePixelRatio, 2);
      return Math.abs(canvas.width - rect.width * dpr) < 2 && Math.abs(canvas.height - rect.height * dpr) < 2;
    });
    await screenshot(page, `network-3d-${viewport.width}-expanded`);
    await page.keyboard.press("Escape");
    assert.equal(await graph.getAttribute("data-expanded"), "false");
    await graph.scrollIntoViewIfNeeded();
    const pick = await graph.getByTestId("ontology-graph-node").evaluateAll((items) => {
      for (const item of items) {
        if (item.getAttribute("aria-pressed") === "true") continue;
        const rect = item.getBoundingClientRect();
        const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
        if (document.elementFromPoint(x, y)?.closest('[data-node-id]') === item) return { id: item.dataset.nodeId, x, y };
      }
    });
    assert.ok(pick, "A visible projected node should be pickable after leaving expanded mode");
    await page.mouse.click(pick.x, pick.y);
    assert.equal(await graph.locator('[aria-pressed="true"][data-node-id]').getAttribute("data-node-id"), pick.id);
    await page.getByTestId("ontology-search").fill("departure.nationality");
    await page.getByTestId("ontology-search-result").first().click();
    const selected = graph.locator('[data-testid="ontology-graph-node"][aria-pressed="true"]');
    assert.ok((await selected.getAttribute("data-node-id")).startsWith("departure.nationality"));
    await selected.focus(); await page.keyboard.press("ArrowRight");
    await textIncludes(page.getByTestId("ontology-class-inspector"), "코드 근거");
    await graph.scrollIntoViewIfNeeded();
    await screenshot(page, `network-3d-${viewport.width}-workspace`);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await graph.getByRole("button", { name: "자동 회전", exact: true }).click();
    const spinning = await graph.getAttribute("data-camera");
    await page.waitForFunction((value) => document.querySelector('[data-testid="ontology-graph"]')?.getAttribute("data-camera") !== value, spinning);
    await graph.getByRole("button", { name: "회전 멈추기", exact: true }).click();
  }, { viewport });

  await scenario("knowledge-3d-touch-drag", async (page) => {
    await openOntology(page);
    const graph = page.getByTestId("ontology-graph");
    await graph.scrollIntoViewIfNeeded();
    const selected = graph.locator('[aria-pressed="true"][data-node-id]');
    const selectedId = await selected.getAttribute("data-node-id");
    const rect = await selected.boundingBox();
    const cdp = await page.context().newCDPSession(page);
    const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    let prior = await graph.getAttribute("data-camera");
    for (let index = 1; index <= 5; index += 1) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + index * 12, y: y + index * 5 }] });
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const current = await graph.getAttribute("data-camera");
      assert.notEqual(current, prior, `Touch drag must continue after node-to-stage pointer capture, move ${index}`);
      prior = current;
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    assert.equal(await selected.getAttribute("data-node-id"), selectedId);
    await cdp.detach();
  }, { viewport: VIEWPORTS[2], touch: true });

  await scenario("knowledge-3d-reduced-motion-and-idle", async (page) => {
    await openOntology(page);
    const graph = page.getByTestId("ontology-graph");
    await graph.scrollIntoViewIfNeeded();
    assert.equal(await graph.getByRole("button", { name: "자동 회전", exact: true }).isDisabled(), true);
    await textIncludes(graph, "동작 줄이기 적용");
    const before = await graph.getAttribute("data-camera");
    await graph.getByRole("button", { name: "그래프 확대", exact: true }).click();
    assert.notEqual(await graph.getAttribute("data-camera"), before, "Reduced motion retains intentional controls");
    await page.mouse.move(0, 0);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const evidence = await page.evaluate(async () => {
      const before = window.__officeFixture.ontologyFrames;
      await new Promise((resolve) => setTimeout(resolve, 220));
      return { idleFrames: window.__officeFixture.ontologyFrames - before };
    });
    assert.equal(evidence.idleFrames, 0, "Idle graph must not keep repainting");
    report.measurements.ontologyReducedMotion = evidence;
  }, { reducedMotion: "reduce" });

  await scenario("knowledge-3d-hidden-visibility-and-dialog-focus", async (page) => {
    await openOntology(page);
    const graph = page.getByTestId("ontology-graph");
    await graph.scrollIntoViewIfNeeded();
    await graph.getByRole("button", { name: "자동 회전", exact: true }).click();
    const evidence = await page.evaluate(async () => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
      document.dispatchEvent(new Event("visibilitychange"));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const before = window.__officeFixture.ontologyFrames;
      const camera = document.querySelector('[data-testid="ontology-graph"]').dataset.camera;
      await new Promise((resolve) => setTimeout(resolve, 220));
      const result = { hiddenFrames: window.__officeFixture.ontologyFrames - before, camera, cameraAfter: document.querySelector('[data-testid="ontology-graph"]').dataset.camera, mode: "Headless document.hidden + visibilitychange fixture" };
      delete document.hidden; document.dispatchEvent(new Event("visibilitychange"));
      return result;
    });
    assert.equal(evidence.hiddenFrames, 0);
    assert.equal(evidence.camera, evidence.cameraAfter);
    await page.waitForFunction((camera) => document.querySelector('[data-testid="ontology-graph"]').dataset.camera !== camera, evidence.camera);
    await graph.getByRole("button", { name: "회전 멈추기", exact: true }).click();
    report.measurements.ontologyHidden = evidence;
    await graph.getByRole("button", { name: "그래프 크게 보기", exact: true }).click();
    const shrink = graph.getByRole("button", { name: "그래프 축소", exact: true });
    for (let index = 0; index < 8 && !(await shrink.isDisabled()); index += 1) await shrink.click();
    assert.ok(await shrink.isDisabled());
    await page.keyboard.press("Shift+Tab");
    assert.ok(await graph.evaluate((element) => element.contains(document.activeElement)), "Reaching a disabled zoom limit must not break the dialog focus trap");
    for (let index = 0; index < 12; index += 1) {
      await page.keyboard.press("Tab");
      assert.ok(await graph.evaluate((element) => element.contains(document.activeElement)), "Expanded dialog must retain keyboard focus");
    }
    await page.keyboard.press("Escape");
    assert.equal(await graph.getByRole("button", { name: "그래프 크게 보기", exact: true }).evaluate((element) => document.activeElement === element), true, "Closing expanded mode restores focus to its trigger");
  });

  for (const viewport of VIEWPORTS) await scenario(`knowledge-workspace-${viewport.width}x${viewport.height}`, async (page) => {
    await openOntology(page);
    const workspace = page.getByTestId("ontology-workspace");
    assert.equal(await button(page, "다음 행동 실행").isVisible(), false, "Ontology context must not be covered by an unrelated monitor quest bubble");
    await workspace.scrollIntoViewIfNeeded();
    assert.equal(await page.getByTestId("ontology-panel-tbox").count(), 1);
    const classes = await page.getByTestId("ontology-tree-item").count();
    assert.ok(classes > 0);
    await page.getByTestId("ontology-search").fill("상담 실행");
    const result = page.getByTestId("ontology-search-result").filter({ hasText: "상담 실행" }).first();
    await result.click();
    const currentNode = page.locator('[data-testid="ontology-graph-node"][aria-pressed="true"]');
    const currentId = await currentNode.getAttribute("data-node-id");
    assert.ok(currentId);
    await textIncludes(page.getByTestId("ontology-class-inspector"), "코드 근거");
    await page.getByTestId("ontology-scope-local").click();
    const firstCount = await page.getByTestId("ontology-graph-node").count();
    await page.getByTestId("ontology-depth-2").click();
    assert.ok(await page.getByTestId("ontology-graph-node").count() >= firstCount);
    await page.getByTestId("ontology-scope-global").click();
    const globalCount = await page.getByTestId("ontology-graph-node").count();
    assert.ok(globalCount >= 85);
    await page.locator('[data-testid="ontology-role-filter"][data-role="입력"]').click();
    assert.ok(await page.getByTestId("ontology-graph-node").count() < globalCount);
    await page.locator('[data-testid="ontology-role-filter"][data-role="입력"]').click();
    await page.getByTestId("ontology-search").fill("no-such-concept-98765");
    await textIncludes(page.getByTestId("ontology-taxonomy"), "검색어와 맞는 개념이 없습니다");
    await page.getByTestId("ontology-search").fill("");
    await page.getByTestId("ontology-scope-local").click();
    await page.getByTestId("ontology-depth-1").click();
    await page.getByTestId("ontology-graph").scrollIntoViewIfNeeded();
    if (viewport.width < 520) {
      await page.waitForFunction(() => document.querySelector('[data-testid="ontology-graph"]')?.getAttribute("data-compact") === "true");
      assert.equal(await page.getByTestId("ontology-graph-edge-label").count(), 0);
      const labels = await page.getByTestId("ontology-graph-node-label").evaluateAll((items) => items.filter((item) => getComputedStyle(item).opacity !== "0" && getComputedStyle(item).display !== "none").length);
      assert.ok(labels <= 2, `Compact labels should remain selected/focused only, received ${labels}`);
    }
    await screenshot(page, `knowledge-${viewport.width}-concepts`, { fullPage: viewport.width < 1024 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert.ok(overflow <= 1, `Page overflow ${overflow}px`);
    await page.getByTestId("ontology-mode-abox").click();
    assert.equal(await page.getByTestId("ontology-graph-node").count(), 0);
    await page.getByTestId("ontology-graph-empty").waitFor({ state: "visible" });
    await textIncludes(page.getByTestId("ontology-source"), "아직 판정 결과가 없습니다");
    await screenshot(page, `knowledge-${viewport.width}-empty`, { fullPage: viewport.width < 1024 });
    if (viewport.width < 520) {
      await page.setViewportSize(VIEWPORTS[1]);
      await page.getByTestId("ontology-mode-tbox").click();
      await page.waitForFunction(() => document.querySelector('[data-testid="ontology-graph"]')?.getAttribute("data-compact") === "false");
    }
  }, { viewport });

  await scenario("knowledge-live-monitor-translation-source", async (page) => {
    const utterance = "급여명세서에서 산재보험을 공제하는데 맞나요";
    const index = await start(page, utterance);
    const response = resultFor({ utterance, fields: { workplaceSize: "5인미만" } });
    response.router.skill = "payslip";
    await page.evaluate(({ index, response }) => window.__officeFixture.complete(index, response), { index, response });
    await openOps(page);
    await button(page, "명세서 입력으로 이동 ▶").click();
    await page.getByRole("button", { name: /판정 실행하기/ }).click();
    await button(page, "답변").click();
    await button(page, "English").click();
    await page.waitForFunction(() => window.__officeFixture.translations.length === 1);
    await translateFinish(page, 0);
    await textIncludes(page.locator("main"), "Verified English fixture");
    const ontology = button(page, "용어·관계 사전 (온톨로지)");
    if (!await ontology.isVisible()) await page.getByRole("button", { name: /법령·검증/ }).click();
    await ontology.click();
    const live = page.getByTestId("ontology-live");
    await live.waitFor({ state: "visible" });
    assert.equal(await live.locator('[data-node-id="service:judge"]').getAttribute("data-node-status"), "completed");
    assert.equal(await live.locator('[data-node-id="service:translate"]').getAttribute("data-node-status"), "completed");
    await textIncludes(live, "현재 한국어 답변");
    await screenshot(page, "live-monitor-translation");
  });

  await scenario("knowledge-live-monitor-shared-field-edit", async (page) => {
    const utterance = "급여명세서에서 산재보험을 공제하는데 맞나요";
    const index = await start(page, utterance);
    const response = resultFor({ utterance, fields: { workplaceSize: "5인미만" } });
    response.router.skill = "payslip";
    await page.evaluate(({ index, response }) => window.__officeFixture.complete(index, response), { index, response });
    await openOps(page);
    await button(page, "명세서 입력으로 이동 ▶").click();
    await page.getByRole("button", { name: /판정 실행하기/ }).click();
    await page.getByLabel("상시 근로자 수 · A7 분기").selectOption("5인이상");
    await page.getByLabel("기준일 (today)").fill("2026-09-24");
    await page.getByRole("button", { name: /판정 실행하기/ }).click();
    await returnOffice(page); await openOntology(page);
    await page.getByTestId("ontology-mode-abox").click();
    await textIncludes(page.getByTestId("ontology-source"), "명세서 판정");
    await page.getByTestId("ontology-search").fill("5인이상");
    await page.getByTestId("ontology-individual-item").first().click();
    await textIncludes(page.getByTestId("ontology-individual-inspector"), "5인이상");
  });

  await scenario("knowledge-live-unapplied-revision-isolation", async (page) => {
    const utterance = "급여명세서에서 산재보험을 공제하는데 맞나요";
    const index = await start(page, utterance);
    const response = resultFor({ utterance, fields: { workplaceSize: "5인미만" } });
    response.router.skill = "payslip";
    await page.evaluate(({ index, response }) => window.__officeFixture.complete(index, response), { index, response });
    await openOps(page);
    await button(page, "명세서 입력으로 이동 ▶").click();
    await page.getByRole("button", { name: /판정 실행하기/ }).click();
    await returnOffice(page); await openOps(page);
    await page.locator("#agent-today").fill("2026-09-22");
    await closeOps(page);
    await button(page, "판정 결과 보기").click();
    await page.getByRole("button", { name: /판정 실행하기/ }).click();
    await returnOffice(page); await openOntology(page);
    await page.getByTestId("ontology-mode-abox").click();
    await page.getByTestId("ontology-graph-empty").waitFor({ state: "visible" });
    await textIncludes(page.getByTestId("ontology-source"), "AI 상담");
  });

  await scenario("knowledge-payslip-handoff-judgment-source", async (page) => {
    const utterance = "급여명세서에서 산재보험을 공제하는데 맞나요";
    const index = await start(page, utterance);
    const response = resultFor({ utterance, fields: { workplaceSize: "5인미만" } });
    response.router.skill = "payslip";
    await page.evaluate(({ index, response }) => window.__officeFixture.complete(index, response), { index, response });
    await openOps(page);
    await button(page, "명세서 입력으로 이동 ▶").click();
    await page.getByRole("button", { name: /판정 실행하기/ }).click();
    await returnOffice(page); await openOntology(page);
    await page.getByTestId("ontology-mode-abox").click();
    await textIncludes(page.getByTestId("ontology-source"), "명세서 판정");
    assert.ok(await page.getByTestId("ontology-individual-item").count() > 10);
    await page.getByTestId("ontology-search").fill("5인미만");
    await page.getByTestId("ontology-individual-item").first().click();
    await textIncludes(page.getByTestId("ontology-individual-inspector"), "5인미만");
    await screenshot(page, "knowledge-payslip-handoff");
    const originalSource = await page.getByTestId("ontology-source").innerText();
    await button(page, "판정 결과 보기").click();
    await page.getByLabel("소정근로(시간)", { exact: true }).fill("180");
    await returnOffice(page); await openOntology(page);
    await textIncludes(page.getByTestId("ontology-source"), "명세서 판정");
    const editedSource = await page.getByTestId("ontology-source").innerText();
    assert.notEqual(editedSource.match(/명세서 v\d+/)?.[0], originalSource.match(/명세서 v\d+/)?.[0]);
    assert.equal(editedSource.match(/상담 입력 v\d+/)?.[0], originalSource.match(/상담 입력 v\d+/)?.[0]);
    await returnOffice(page); await start(page, utterance);
    await openOntology(page); await page.getByTestId("ontology-mode-abox").click();
    await page.getByTestId("ontology-graph-empty").waitFor({ state: "visible" });
    await textIncludes(page.getByTestId("ontology-source"), "진행 중");
    assert.equal(await page.getByTestId("ontology-individual-item").count(), 0);
  });

  await scenario("knowledge-current-run-values-and-revision", async (page) => {
    await finishNormal(page);
    await openOntology(page);
    await textIncludes(page.getByTestId("ontology-source"), "AI 상담 S2-01");
    await page.getByTestId("ontology-mode-abox").click();
    assert.ok(!(await page.getByTestId("ontology-individual-inspector").innerText()).includes("전부 합성 데이터"));
    assert.ok(await page.getByTestId("ontology-individual-item").count() > 10);
    await page.getByTestId("ontology-search").fill("2150000");
    await page.getByTestId("ontology-individual-item").first().click();
    await textIncludes(page.getByTestId("ontology-individual-inspector"), "2150000");
    await screenshot(page, "knowledge-current-accepted-value");
    const before = await page.getByTestId("ontology-source").innerText();
    await returnOffice(page); await openOps(page);
    await page.locator("#agent-field-monthlyWage").fill("3250000");
    await openOntology(page);
    assert.notEqual(await page.getByTestId("ontology-source").innerText(), before);
    await page.getByTestId("ontology-mode-abox").click();
    await page.getByTestId("ontology-search").fill("3250000");
    await page.getByTestId("ontology-individual-item").first().click();
    await textIncludes(page.getByTestId("ontology-individual-inspector"), "3250000");
    await page.getByTestId("ontology-search").fill("2150000");
    assert.equal(await page.getByTestId("ontology-individual-item").count(), 0);
    await returnOffice(page); await openOps(page);
    await page.locator("#agent-field-visa").selectOption("");
    await openOntology(page); await page.getByTestId("ontology-mode-abox").click();
    await page.getByTestId("ontology-graph-empty").waitFor({ state: "visible" });
    assert.equal(await page.getByTestId("ontology-individual-item").count(), 0);
    await textIncludes(page.getByTestId("ontology-source"), "누락 정보");
    await returnOffice(page); await finishNormal(page);
    await openOntology(page);
    const runIds = await page.evaluate(() => window.__officeFixture.agents.map((job) => job.body.runId.slice(0, 12)));
    const after = await page.getByTestId("ontology-source").innerText();
    assert.ok(after.includes(runIds[1]));
    assert.ok(!after.includes(runIds[0]));
  });

  await scenario("knowledge-directed-relations-and-keyboard", async (page) => {
    await openOntology(page);
    const inspect = page.getByTestId("ontology-class-inspector");
    const outgoing = inspect.locator("section").filter({ has: page.getByRole("heading", { name: "나가는 관계", exact: true }) });
    const first = outgoing.getByRole("button").first();
    await first.click();
    assert.equal(await page.locator('[data-testid="ontology-graph-node"][aria-pressed="true"]').getAttribute("data-node-id"), "utterance.candidate");
    const node = page.locator('[data-testid="ontology-graph-node"][aria-pressed="true"]');
    await node.focus(); await page.keyboard.press("ArrowRight");
    assert.notEqual(await page.locator('[data-testid="ontology-graph-node"][aria-pressed="true"]').getAttribute("data-node-id"), "utterance.candidate");
    await page.getByTestId("ontology-search").fill("departure.nationality.paid");
    await page.getByTestId("ontology-search-result").first().click();
    await textIncludes(inspect, "상위 개념");
    await textIncludes(inspect, "국적이 갈래를 정한다");
    assert.equal(await page.locator('[data-testid="ontology-graph-node"][data-node-id="departure.nationality"]').count(), 1);
    await inspect.getByRole("button", { name: "상위 정의 확인: 국적", exact: true }).click();
    assert.equal(await page.locator('[data-testid="ontology-graph-node"][aria-pressed="true"]').getAttribute("data-node-id"), "departure.nationality");
  });

  await scenario("knowledge-office-guide-tour-and-perspectives", async (page) => {
    const map = page.getByTestId("office-map");
    assert.equal(await page.getByTestId("office-brief").getAttribute("data-phase"), "idle");
    await button(page, "업무 흐름").click();
    await textIncludes(page.getByTestId("office-flow"), "동시 요청");
    await textIncludes(page.getByTestId("office-flow"), "한국어 선택 시 생략");
    await button(page, "업무 흐름 닫기").click();
    const original = await map.getAttribute("data-camera");
    await page.getByLabel("사무실 시점", { exact: true }).selectOption("knowledge");
    assert.notEqual(await map.getAttribute("data-camera"), original);
    await page.getByLabel("사무실 시점", { exact: true }).selectOption("all");
    await button(page, "사무실 둘러보기").click();
    await textIncludes(page.getByTestId("office-tour"), "모든 상담은 중앙에서");
    await page.getByTestId("office-tour").getByRole("button", { name: "다음", exact: true }).click();
    await textIncludes(page.getByTestId("office-tour"), "AI가 읽고, 근거를 확인");
    await screenshot(page, "office-tour-department");
    assert.equal(await page.evaluate(() => window.__officeFixture.agents.length), 0);
    await button(page, "사무실 가이드 닫기").click();
    await page.getByTestId("office-next-action").click();
    await page.locator("#agent-utterance").waitFor({ state: "visible" });
    const index = await start(page); await emit(page, index, "routing", "running"); await emit(page, index, "extract", "running");
    await textIncludes(page.getByTestId("office-brief"), "업무 분류와 정보 추출");
    await emit(page, index, "routing", "completed"); await emit(page, index, "extract", "failed", "근거 확인 실패");
    await complete(page, index, { intakeError: "근거 확인 실패" });
    await closeOps(page); await page.getByTestId("office-next-action").click();
    await textIncludes(page.locator('[data-stage="1단"]'), "근거 확인 실패");
  });

  await scenario("knowledge-mobile-guidance-actions", async (page) => {
    await page.getByTestId("office-next-action").click();
    const inputVisible = await page.locator("#agent-utterance").evaluate((el) => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; });
    assert.equal(inputVisible, true);
    await button(page, "모든 부서").click();
    await page.getByTestId("office-mobile").getByRole("button", { name: /중앙 안내 공간/ }).click();
    const detail = page.getByRole("region", { name: "중앙 안내 공간 상세", exact: true });
    await detail.getByRole("button", { name: "상담 입력 열기", exact: true }).click();
    await page.waitForFunction(() => { const r = document.getElementById("agent-utterance").getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; });
    await screenshot(page, "office-mobile-guidance", { fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 1);
  }, { viewport: VIEWPORTS[2] });

  await scenario("knowledge-natural-staff-motion-and-pause", async (page) => {
    const canvas = page.getByTestId("office-map").locator("canvas");
    const before = JSON.parse(await canvas.getAttribute("data-positions")).agents;
    await page.waitForFunction((before) => {
      const canvas = document.querySelector('[data-testid="office-map"] canvas');
      const positions = JSON.parse(canvas.dataset.positions).agents;
      return Object.keys(before).filter((id) => Math.hypot(positions[id].x - before[id].x, positions[id].y - before[id].y) > 16).length >= 2;
    }, before, { timeout: 12000 });
    const samples = await page.evaluate(async () => {
      const output = [], canvas = document.querySelector('[data-testid="office-map"] canvas'), start = performance.now();
      while (performance.now() - start < 1200) { output.push({ positions: JSON.parse(canvas.dataset.floorPositions).agents, activities: JSON.parse(canvas.dataset.activities), draw: Number(canvas.dataset.drawCount) }); await new Promise((r) => setTimeout(r, 40)); }
      return output;
    });
    let visits = 0;
    for (const sample of samples) for (const point of Object.values(sample.positions)) { assert.ok(isWalkable(point.x, point.y), JSON.stringify(point)); visits++; }
    assert.ok(samples.some((s) => Object.values(s.activities).some((a) => a.ambient && a.kind === "walking")));
    await running(page, 0); await progress(page, 0);
    assert.equal(await page.evaluate(() => window.__officeFixture.agents.length), 0);
    report.measurements.staffMotion = { samples: samples.length, safePositions: visits, frames: samples.at(-1).draw - samples[0].draw, averageDrawMs: Number(await canvas.getAttribute("data-average-draw-ms")), businessRequests: 0 };
    await screenshot(page, "office-living-staff");
    await page.getByTestId("office-motion-toggle").click();
    await page.waitForFunction(() => document.querySelector('[data-testid="office-motion-toggle"]').getAttribute("aria-pressed") === "false");
    const paused = await page.evaluate(async () => {
      await new Promise((r) => setTimeout(r, 200));
      const canvas = document.querySelector('[data-testid="office-map"] canvas'), before = canvas.dataset.positions, count = Number(canvas.dataset.drawCount);
      await new Promise((r) => setTimeout(r, 650));
      return { stable: before === canvas.dataset.positions, frames: Number(canvas.dataset.drawCount) - count };
    });
    assert.equal(paused.stable, true); assert.equal(paused.frames, 0);
    report.measurements.staffPause = paused;
  });

  report.finishedAt = new Date().toISOString();
  report.summary = { passed: report.tests.filter((test) => test.status === "passed").length, failed: report.tests.filter((test) => test.status === "failed").length };
  await writeFile(resolve(OUT, "report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report.summary));
  if (report.summary.failed) process.exitCode = 1;
}
try { await main(); } finally { await browser?.close(); }
