#!/usr/bin/env node
/** Read-only deployment verification. No AI inference, response bodies or external errors are logged. */
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const FULL_SHA = /^[a-f\d]{40}$/i;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const WINDOW_START = Date.parse("2026-09-06T00:00:00+09:00");
const WINDOW_END = Date.parse("2026-09-13T00:00:00+09:00");

export function withinMonitoringWindow(now = new Date()) {
  const instant = new Date(now).getTime();
  return Number.isFinite(instant) && instant >= WINDOW_START && instant < WINDOW_END;
}

function deploymentOrigin(base) {
  // Check the original spelling too: URL normalizes /. and encoded dot paths to /.
  if (typeof base !== "string" || !/^https?:\/\/[^/?#@\\\s]+\/?$/.test(base)) return null;
  try {
    const url = new URL(base);
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/") return null;
    const local = url.hostname === "localhost" || url.hostname === "[::1]" || /^127(?:\.\d{1,3}){3}$/.test(url.hostname);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) return null;
    return { origin: url.origin, local };
  } catch {
    return null;
  }
}

async function readEndpoint(origin, path, timeoutMs) {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const response = await fetch(new URL(path, origin), {
      method: "GET", cache: "no-store", redirect: "manual", signal: controller.signal,
      headers: { "cache-control": "no-store", pragma: "no-cache" },
    });
    if (response.status !== 200) {
      await response.body?.cancel();
      return { error: `GET ${path}: HTTP ${response.status}` };
    }
    const text = await response.text(); // Keep the deadline active until the whole body arrives.
    return { text, cacheControl: response.headers.get("cache-control") };
  } catch {
    return { error: `GET ${path}: ${timedOut ? "timeout" : "request failed"}` };
  } finally {
    clearTimeout(timeout);
  }
}

function parseObject(text) {
  try {
    const value = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

/** A single bounded probe; retries and logging belong only to the CLI. */
export async function checkDeployment(base, { expectedCommit, allowedCommits, requireAi = true, timeoutMs = 15_000 } = {}) {
  const started = performance.now();
  const failures = [];
  let revision = null;
  let provider = null;
  const report = () => ({ ok: failures.length === 0, failures, revision, provider, checkedAt: new Date().toISOString(), durationMs: Math.round(performance.now() - started) });
  const target = deploymentOrigin(base);
  if (!target) failures.push("configuration: URL must be an HTTPS root origin or local loopback HTTP origin, without credentials, query or fragment");
  if (expectedCommit !== undefined && (typeof expectedCommit !== "string" || !FULL_SHA.test(expectedCommit))) failures.push("configuration: expected commit must be a full 40-character SHA");
  if (allowedCommits !== undefined && (!Array.isArray(allowedCommits) || allowedCommits.length === 0 || !allowedCommits.every((sha) => typeof sha === "string" && FULL_SHA.test(sha)))) failures.push("configuration: allowed commits must be a nonempty list of full 40-character SHAs");
  if (allowedCommits !== undefined && expectedCommit !== undefined) failures.push("configuration: choose rolling history or an exact commit, not both");
  if (typeof requireAi !== "boolean") failures.push("configuration: requireAi must be a boolean");
  if (requireAi === false && !target?.local) failures.push("configuration: unconfigured AI is allowed only for explicit local checks");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647) failures.push("configuration: timeout must be a positive supported integer in milliseconds");
  if (failures.length) return report();

  const [health, home, agent] = await Promise.all([
    readEndpoint(target.origin, "/api/health", timeoutMs),
    readEndpoint(target.origin, "/", timeoutMs),
    readEndpoint(target.origin, "/api/agent", timeoutMs),
  ]);
  if (health.error) failures.push(health.error);
  else {
    if (!health.cacheControl?.split(",").some((directive) => directive.trim().toLowerCase() === "no-store")) failures.push("GET /api/health: Cache-Control must contain no-store");
    const value = parseObject(health.text);
    if (!value || value.status !== "ok" || value.service !== "paycheck") failures.push("GET /api/health: invalid service health response");
    if (value?.revision !== null && (typeof value?.revision !== "string" || !FULL_SHA.test(value.revision))) failures.push("GET /api/health: revision must be a full SHA or null");
    else revision = value.revision?.toLowerCase() ?? null;
    if (expectedCommit !== undefined && revision !== expectedCommit.toLowerCase()) failures.push("GET /api/health: deployed revision does not match expected commit");
    if (allowedCommits !== undefined && !allowedCommits.some((sha) => sha.toLowerCase() === revision)) failures.push("GET /api/health: deployed revision is not in the allowed main history");
    const timestamp = typeof value?.checkedAt === "string" && ISO_TIMESTAMP.test(value.checkedAt) ? Date.parse(value.checkedAt) : NaN;
    if (!Number.isFinite(timestamp)) failures.push("GET /api/health: checkedAt must be an ISO timestamp");
    else {
      const age = Date.now() - timestamp;
      if (age >= 10 * 60_000) failures.push("GET /api/health: stale health timestamp");
      if (age < -60_000) failures.push("GET /api/health: health timestamp is too far in the future");
    }
  }
  if (home.error) failures.push(home.error);
  else if (!home.text.includes("페이체크")) failures.push("GET /: application page identity is missing");
  if (agent.error) failures.push(agent.error);
  else {
    const value = parseObject(agent.text);
    if (value?.provider === null) {
      if (requireAi) failures.push("GET /api/agent: AI provider is not configured");
    } else if (value?.provider !== "anthropic" && value?.provider !== "ollama") failures.push("GET /api/agent: invalid AI provider");
    else {
      provider = value.provider;
      if (typeof value.model !== "string" || !value.model.trim()) failures.push("GET /api/agent: configured AI model is missing");
    }
  }
  return report();
}

async function main(args) {
  const options = new Set();
  let base;
  for (const arg of args) {
    if (arg === "--scheduled" || arg === "--allow-unconfigured-ai" || arg === "--rolling-release") {
      if (options.has(arg)) { console.error("configuration: duplicate option"); return 2; }
      options.add(arg);
    } else if (arg.startsWith("--") || base !== undefined) {
      console.error("configuration: unsupported option or multiple URLs");
      return 2;
    } else base = arg;
  }
  if (options.has("--scheduled") && !withinMonitoringWindow()) {
    console.log("SKIPPED: outside the 2026-09-06 through 2026-09-12 Asia/Seoul monitoring window");
    return 0;
  }
  if (!base) { console.error("configuration: usage: node scripts/smoke.mjs <URL> [--scheduled] [--allow-unconfigured-ai] [--rolling-release]"); return 2; }
  const requireAi = !options.has("--allow-unconfigured-ai");
  // Explicit rolling mode keeps the frozen pin available for a later manual freeze.
  // The caller supplies trusted main history; a healthy ancestor is valid during builds.
  const rolling = options.has("--rolling-release");
  const release = rolling
    ? { allowedCommits: (process.env.ALLOWED_DEPLOY_SHAS || "").split(",") }
    : { expectedCommit: process.env.EXPECTED_DEPLOY_SHA || undefined };
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    if (options.has("--scheduled") && !withinMonitoringWindow()) {
      console.log("SKIPPED: monitoring window ended before the next attempt; no further checks were sent");
      return 0;
    }
    const result = await checkDeployment(base, { ...release, requireAi });
    if (result.failures.some((failure) => failure.startsWith("configuration:"))) {
      for (const failure of result.failures) console.error(failure);
      return 2;
    }
    if (result.ok) {
      if (attempt > 1) console.warn(`WARNING: deployment recovered after ${attempt - 1} failed probe(s)`);
      if (!requireAi) console.log("WARNING: local check explicitly allows unconfigured AI");
      if (rolling) console.log("NOTE: rolling check accepts main history during builds; deployment freshness is not verified");
      console.log(`PASS: ${result.checkedAt} revision=${result.revision ?? "unknown"} provider=${result.provider ?? "not-configured"} duration=${result.durationMs}ms`);
      return 0;
    }
    for (const failure of result.failures) console.error(`FAIL attempt ${attempt}/3: ${failure}`);
    if (attempt < 3) {
      console.warn("WARNING: retrying deployment check in 5 seconds");
      await delay(5_000);
    }
  }
  return 1;
}

function isMain() {
  try { return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); }
  catch { return false; }
}

if (isMain()) {
  try { process.exitCode = await main(process.argv.slice(2)); }
  catch { console.error("FAIL: deployment checker could not complete"); process.exitCode = 1; }
}
