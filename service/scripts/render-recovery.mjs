#!/usr/bin/env node
/** Admission control and one bounded retry for the Render availability workflow. */
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { withinMonitoringWindow } from "./smoke.mjs";

const WORKFLOW_NAME = "Render availability";
const WORKFLOW_PATH = ".github/workflows/render-availability.yml";
const FULL_SHA = /^[a-f0-9]{40}$/;
const DEFAULT_SMOKE_SCRIPT = fileURLToPath(new URL("./smoke.mjs", import.meta.url));

function renderOrigin(raw) {
  if (typeof raw !== "string" || !/^https:\/\/[^/?#@\\\s]+\/?$/.test(raw)) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || !url.hostname.endsWith(".onrender.com")) return null;
    if (url.username || url.password || url.port || url.pathname !== "/" || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function evaluateRecovery(event, config, now = new Date()) {
  const run = event?.workflow_run;
  const repository = config?.repository;
  const trusted = config?.eventName === "workflow_run"
    && event?.action === "completed"
    && run?.name === WORKFLOW_NAME
    && run?.path === WORKFLOW_PATH
    && (run?.event === "schedule" || run?.event === "workflow_dispatch")
    && run?.status === "completed"
    && (run?.conclusion === "failure" || run?.conclusion === "timed_out")
    && run?.head_branch === "main"
    && typeof repository === "string"
    && event?.repository?.full_name === repository
    && run?.head_repository?.full_name === repository;
  if (!trusted || !withinMonitoringWindow(now)) return { decision: "skip" };

  if (config?.releaseMode !== "pinned") {
    return { decision: "error", reason: "configuration: recovery requires pinned release mode" };
  }
  const serviceUrl = renderOrigin(config?.serviceUrl);
  if (!serviceUrl) {
    return { decision: "error", reason: "configuration: recovery requires an HTTPS onrender.com root origin" };
  }
  if (typeof config?.expectedCommit !== "string" || !FULL_SHA.test(config.expectedCommit)) {
    return { decision: "error", reason: "configuration: recovery requires a full lowercase deployment SHA" };
  }
  return { decision: "run" };
}

export function runSmokeCheck({
  serviceUrl,
  expectedCommit,
  scheduled = true,
}) {
  const args = [DEFAULT_SMOKE_SCRIPT, serviceUrl];
  if (scheduled) args.push("--scheduled");
  return new Promise((resolve) => {
    execFile(process.execPath, args, {
      env: { EXPECTED_DEPLOY_SHA: expectedCommit, ALLOWED_DEPLOY_SHAS: "" },
      timeout: 90_000,
      maxBuffer: 1024 * 1024,
    }, (error, stdout, stderr) => {
      resolve({ code: Number.isInteger(error?.code) ? error.code : error ? 1 : 0, stdout, stderr });
    });
  });
}

export function classifySmokeResult(result) {
  if (result?.code !== 0) return "failed";
  return String(result.stdout ?? "").split(/\r?\n/).some((line) => line.startsWith("SKIPPED:"))
    ? "skipped"
    : "passed";
}

export async function main({ environment = process.env, now = new Date(), runCheck = runSmokeCheck, reporter = console } = {}) {
  let event;
  try {
    event = JSON.parse(await readFile(environment.GITHUB_EVENT_PATH, "utf8"));
  } catch {
    reporter.error("configuration: recovery event payload is unavailable or invalid");
    return 2;
  }
  const config = {
    eventName: environment.GITHUB_EVENT_NAME,
    repository: environment.GITHUB_REPOSITORY,
    serviceUrl: environment.RENDER_SERVICE_URL,
    expectedCommit: environment.EXPECTED_DEPLOY_SHA,
    releaseMode: environment.RELEASE_MODE,
  };
  const assessment = evaluateRecovery(event, config, now);
  if (assessment.decision === "skip") {
    reporter.log("SKIPPED: recovery admission or monitoring window did not match");
    return 0;
  }
  if (assessment.decision === "error") {
    reporter.error(assessment.reason);
    return 2;
  }

  reporter.log("RECOVERY: running one bounded read-only deployment check");
  const result = await runCheck({
    serviceUrl: config.serviceUrl,
    expectedCommit: config.expectedCommit,
  });
  const kind = classifySmokeResult(result);
  if (kind === "passed") reporter.log("PASS: bounded recovery check completed");
  else if (kind === "skipped") reporter.log("SKIPPED: recovery child reached the monitoring window cutoff");
  else reporter.error("FAIL: bounded recovery check did not pass");
  return result.code;
}

function isMain() {
  try { return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); }
  catch { return false; }
}

if (isMain()) {
  try { process.exitCode = await main(); }
  catch { console.error("FAIL: recovery check could not complete"); process.exitCode = 1; }
}
