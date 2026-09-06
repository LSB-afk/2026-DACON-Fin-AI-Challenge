import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as recovery from "./render-recovery.mjs";

const { evaluateRecovery, runSmokeCheck } = recovery;

const SHA = "d2223595a91633de9d1fc939a688c2a32c7f477c";
const REPOSITORY = "owner/paycheck";

function workflowRun(overrides = {}) {
  return {
    action: "completed",
    repository: { full_name: REPOSITORY },
    workflow_run: {
      name: "Render availability",
      path: ".github/workflows/render-availability.yml",
      event: "schedule",
      status: "completed",
      conclusion: "failure",
      head_branch: "main",
      head_repository: { full_name: REPOSITORY },
      ...overrides,
    },
  };
}

function config(overrides = {}) {
  return {
    eventName: "workflow_run",
    repository: REPOSITORY,
    serviceUrl: "https://paycheck.onrender.com",
    expectedCommit: SHA,
    releaseMode: "pinned",
    ...overrides,
  };
}

test("admits a failed or timed-out trusted primary run during the monitoring window", () => {
  for (const event of ["schedule", "workflow_dispatch"]) {
    for (const conclusion of ["failure", "timed_out"]) {
      assert.deepEqual(
        evaluateRecovery(workflowRun({ event, conclusion }), config(), new Date("2026-09-07T11:00:00+09:00")),
        { decision: "run" },
      );
    }
  }
});

test("skips untrusted, nonfailed, incomplete and out-of-window workflow runs", () => {
  const cases = [
    ["wrong workflow", { name: "Other workflow" }, new Date("2026-09-07T11:00:00+09:00")],
    ["wrong path", { path: ".github/workflows/other.yml" }, new Date("2026-09-07T11:00:00+09:00")],
    ["wrong source event", { event: "push" }, new Date("2026-09-07T11:00:00+09:00")],
    ["fork", { head_repository: { full_name: "attacker/fork" } }, new Date("2026-09-07T11:00:00+09:00")],
    ["branch", { head_branch: "feature" }, new Date("2026-09-07T11:00:00+09:00")],
    ["incomplete", { status: "in_progress" }, new Date("2026-09-07T11:00:00+09:00")],
    ["cancelled", { conclusion: "cancelled" }, new Date("2026-09-07T11:00:00+09:00")],
    ["success", { conclusion: "success" }, new Date("2026-09-07T11:00:00+09:00")],
    ["outside window", {}, new Date("2026-09-13T00:00:00+09:00")],
  ];
  for (const [name, override, now] of cases) {
    assert.equal(evaluateRecovery(workflowRun(override), config(), now).decision, "skip", name);
  }
  const wrongRepository = workflowRun();
  wrongRepository.repository.full_name = "attacker/fork";
  assert.equal(evaluateRecovery(wrongRepository, config(), new Date("2026-09-07T11:00:00+09:00")).decision, "skip");
  const wrongAction = workflowRun();
  wrongAction.action = "requested";
  assert.equal(evaluateRecovery(wrongAction, config(), new Date("2026-09-07T11:00:00+09:00")).decision, "skip");
  assert.equal(evaluateRecovery(workflowRun(), config({ eventName: "schedule" }), new Date("2026-09-07T11:00:00+09:00")).decision, "skip");
});

test("rejects unsafe service configuration without reflecting its values", () => {
  const invalid = [
    { serviceUrl: "http://paycheck.onrender.com" },
    { serviceUrl: "https://paycheck.onrender.com/path?token=SECRET" },
    { serviceUrl: "https://user:SECRET@paycheck.onrender.com" },
    { serviceUrl: "https://onrender.com" },
    { expectedCommit: "short-SECRET" },
    { releaseMode: "rolling" },
  ];
  for (const overrides of invalid) {
    const result = evaluateRecovery(workflowRun(), config(overrides), new Date("2026-09-07T11:00:00+09:00"));
    assert.equal(result.decision, "error");
    assert.equal(JSON.stringify(result).includes("SECRET"), false);
  }
});

async function fixture(t, overrides = {}) {
  const requests = [];
  const server = createServer((req, res) => {
    requests.push({ method: req.method, path: req.url });
    if (overrides[req.url]) return overrides[req.url](req, res);
    if (req.url === "/") {
      res.writeHead(200, { "content-type": "text/html" });
      return res.end("<!doctype html><title>페이체크</title><body>페이체크</body>");
    }
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify(req.url === "/api/health"
      ? { status: "ok", service: "paycheck", revision: SHA, checkedAt: new Date().toISOString() }
      : { provider: "anthropic", model: "configured-model" }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    const closed = once(server, "close");
    server.closeAllConnections();
    server.close();
    await closed;
  });
  return { url: `http://127.0.0.1:${server.address().port}`, requests };
}

async function eventFile(t, contents) {
  const directory = await mkdtemp(join(tmpdir(), "render-recovery-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "event.json");
  await writeFile(path, contents);
  return path;
}

async function runMain(t, event, overrides, now, runCheck, reporter) {
  const path = await eventFile(t, typeof event === "string" ? event : JSON.stringify(event));
  const values = config(overrides);
  return recovery.main({
    environment: {
      GITHUB_EVENT_PATH: path,
      GITHUB_EVENT_NAME: values.eventName,
      GITHUB_REPOSITORY: values.repository,
      RENDER_SERVICE_URL: values.serviceUrl,
      EXPECTED_DEPLOY_SHA: values.expectedCommit,
      RELEASE_MODE: values.releaseMode,
    },
    now,
    runCheck,
    reporter,
  });
}

test("orchestration rejects malformed configuration before invoking its child boundary", async (t) => {
  const server = await fixture(t);
  const invokeLocalChild = () => runSmokeCheck({ serviceUrl: server.url, expectedCommit: SHA, scheduled: false });
  assert.equal(await runMain(t, "not-json-SECRET", {}, new Date("2026-09-07T11:00:00+09:00"), invokeLocalChild), 2);
  assert.equal(await runMain(t, workflowRun(), { serviceUrl: `${server.url}?token=SECRET` }, new Date("2026-09-07T11:00:00+09:00"), invokeLocalChild), 2);
  assert.deepEqual(server.requests, []);
});

test("orchestration skips wrong event types and next-year runs without invoking its child boundary", async (t) => {
  const server = await fixture(t);
  const invokeLocalChild = () => runSmokeCheck({ serviceUrl: server.url, expectedCommit: SHA, scheduled: false });
  assert.equal(await runMain(t, workflowRun(), { eventName: "schedule" }, new Date("2026-09-07T11:00:00+09:00"), invokeLocalChild), 0);
  assert.equal(await runMain(t, workflowRun(), {}, new Date("2027-09-07T11:00:00+09:00"), invokeLocalChild), 0);
  assert.deepEqual(server.requests, []);
});

test("admitted orchestration executes exactly one child batch", async (t) => {
  const server = await fixture(t);
  const result = await runMain(
    t,
    workflowRun(),
    {},
    new Date("2026-09-07T11:00:00+09:00"),
    () => runSmokeCheck({ serviceUrl: server.url, expectedCommit: SHA, scheduled: false }),
  );
  assert.equal(result, 0);
  assert.equal(server.requests.length, 3);
});

test("a child window cutoff remains skipped instead of becoming a recovery pass", async (t) => {
  assert.equal(recovery.classifySmokeResult({ code: 0, stdout: "SKIPPED: monitoring window ended\n", stderr: "" }), "skipped");
  assert.equal(recovery.classifySmokeResult({ code: 0, stdout: "PASS: healthy\n", stderr: "" }), "passed");
  assert.equal(recovery.classifySmokeResult({ code: 1, stdout: "", stderr: "FAIL\n" }), "failed");
  const messages = [];
  const reporter = {
    log: (message) => messages.push(message),
    error: (message) => messages.push(message),
  };
  const code = await runMain(
    t,
    workflowRun(),
    {},
    new Date("2026-09-07T11:00:00+09:00"),
    async () => ({ code: 0, stdout: "SKIPPED: monitoring window ended\n", stderr: "" }),
    reporter,
  );
  assert.equal(code, 0);
  assert.equal(messages.some((message) => message.startsWith("PASS:")), false);
  assert.equal(messages.at(-1), "SKIPPED: recovery child reached the monitoring window cutoff");
});

test("lower smoke boundary runs the existing checker as GET-only child process", async (t) => {
  const server = await fixture(t);
  const result = await runSmokeCheck({
    serviceUrl: server.url,
    expectedCommit: SHA,
    scheduled: false,
  });
  assert.equal(result.code, 0);
  assert.match(result.stdout, /PASS/);
  assert.deepEqual(server.requests.map(({ method, path }) => `${method} ${path}`).sort(), [
    "GET /", "GET /api/agent", "GET /api/health",
  ]);
});

test("lower smoke boundary reports a finite child failure without leaking response bodies", async (t) => {
  const server = await fixture(t, {
    "/api/health": (_req, res) => {
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      res.end("SECRET-invalid-health-body");
    },
  });
  const result = await runSmokeCheck({
    serviceUrl: server.url,
    expectedCommit: SHA,
    scheduled: false,
  });
  assert.equal(result.code, 1);
  assert.equal((result.stdout + result.stderr).includes("SECRET"), false);
  assert.equal(server.requests.filter(({ path }) => path === "/api/health").length, 3);
});
