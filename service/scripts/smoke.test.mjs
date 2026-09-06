import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { checkDeployment, withinMonitoringWindow } from "./smoke.mjs";

const SHA = "2fd08aab5eea38e9708406e55c957bae596cd960";
const SCRIPT = fileURLToPath(new URL("./smoke.mjs", import.meta.url));

async function fixture(t, overrides = {}) {
  const requests = [];
  const server = createServer((req, res) => {
    requests.push({ path: req.url, method: req.method, headers: req.headers });
    if (overrides[req.url]) return overrides[req.url](req, res, requests);
    if (req.url === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end("<!doctype html><html><title>페이체크</title><body>페이체크</body></html>");
    }
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify(req.url === "/api/health"
      ? { status: "ok", service: "paycheck", revision: SHA, checkedAt: new Date().toISOString() }
      : { provider: "anthropic", model: "test-configured-model" }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    const closed = once(server, "close");
    server.closeAllConnections();
    server.close();
    await closed;
  });
  return { base: `http://127.0.0.1:${server.address().port}`, requests };
}

function cli(args, env = {}, now, advanceAfterResponse) {
  const command = now ? ["--input-type=module", "--eval", `
    const RealDate = Date;
    let instant = ${JSON.stringify(now)};
    globalThis.Date = class extends RealDate {
      constructor(...args) { super(...(args.length ? args : [instant])); }
      static now() { return new RealDate(instant).getTime(); }
    };
    ${advanceAfterResponse ? `
      const realFetch = globalThis.fetch;
      globalThis.fetch = async (...args) => {
        const response = await realFetch(...args);
        instant = ${JSON.stringify(advanceAfterResponse)};
        return response;
      };
    ` : ""}
    process.argv = [process.execPath, ${JSON.stringify(SCRIPT)}, ...${JSON.stringify(args)}];
    await import(${JSON.stringify(new URL("./smoke.mjs", import.meta.url).href)});
  `] : [SCRIPT, ...args];
  return new Promise((resolve) => {
    execFile(process.execPath, command, {
      env: { ...process.env, EXPECTED_DEPLOY_SHA: "", ...env }, timeout: 35_000,
    }, (error, stdout, stderr) => resolve({ code: error?.code ?? 0, stdout, stderr }));
  });
}

test("CLI rejects missing AI configuration, limits attempts and exits 1", async (t) => {
  const unconfigured = (_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ provider: null }));
  };
  const server = await fixture(t, { "/api/agent": unconfigured, "/api/narrate": unconfigured });
  const result = await cli([server.base]);
  assert.equal(result.code, 1, "HTTP 200 with provider:null must not be healthy");
  assert.equal(server.requests.filter((r) => r.path === "/api/health").length, 3);
});

test("healthy deployment validates the exact release with three uncached GET requests", async (t) => {
  const server = await fixture(t);
  const result = await checkDeployment(server.base, { expectedCommit: SHA });
  assert.deepEqual(Object.keys(result).sort(), ["checkedAt", "durationMs", "failures", "ok", "provider", "revision"]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.failures, []);
  assert.equal(result.revision, SHA);
  assert.equal(result.provider, "anthropic");
  assert.equal(new Date(result.checkedAt).toISOString(), result.checkedAt);
  assert.ok(Number.isFinite(result.durationMs) && result.durationMs >= 0);
  assert.deepEqual(server.requests.map((r) => r.path).sort(), ["/", "/api/agent", "/api/health"]);
  for (const request of server.requests) {
    assert.equal(request.method, "GET");
    assert.match(request.headers["cache-control"], /no-store/);
    assert.match(request.headers.pragma, /no-cache/);
  }
});

function health(overrides = {}, cacheControl = "no-store") {
  return (_req, res) => {
    res.writeHead(200, { "content-type": "application/json", ...(cacheControl ? { "cache-control": cacheControl } : {}) });
    res.end(JSON.stringify({ status: "ok", service: "paycheck", revision: SHA, checkedAt: new Date().toISOString(), ...overrides }));
  };
}

for (const [name, changes] of [
  ["wrong service", { service: "other" }],
  ["unhealthy status", { status: "starting" }],
  ["abbreviated revision", { revision: "2fd08aa" }],
  ["missing revision", { revision: undefined }],
  ["different release", { revision: "a".repeat(40) }],
  ["missing timestamp", { checkedAt: undefined }],
  ["invalid timestamp", { checkedAt: "September 6, 2026" }],
  ["stale timestamp", { checkedAt: new Date(Date.now() - 11 * 60_000).toISOString() }],
  ["future timestamp", { checkedAt: new Date(Date.now() + 2 * 60_000).toISOString() }],
]) {
  test(`health rejects ${name}`, async (t) => {
    const server = await fixture(t, { "/api/health": health(changes) });
    const result = await checkDeployment(server.base, { expectedCommit: SHA });
    assert.equal(result.ok, false);
    assert.ok(result.failures.some((failure) => failure.includes("/api/health")));
  });
}

test("unknown revision is only allowed when no release is expected", async (t) => {
  const server = await fixture(t, { "/api/health": health({ revision: null }) });
  assert.equal((await checkDeployment(server.base)).ok, true);
  assert.equal((await checkDeployment(server.base, { expectedCommit: SHA })).ok, false);
});

for (const cacheControl of [null, "public, max-age=60"]) {
  test(`health without no-store is rejected (${cacheControl ?? "missing"})`, async (t) => {
    const server = await fixture(t, { "/api/health": health({}, cacheControl) });
    assert.equal((await checkDeployment(server.base)).ok, false);
  });
}

test("Render loading HTML with status 200 is not the deployed application", async (t) => {
  const server = await fixture(t, {
    "/": (_req, res) => res.end("<!doctype html><title>Render</title><p>Your service is starting up</p>"),
  });
  const result = await checkDeployment(server.base);
  assert.equal(result.ok, false);
  assert.ok(result.failures.some((failure) => failure.startsWith("GET /:")));
});

test("HTML in the health route is rejected without leaking its body", async (t) => {
  const server = await fixture(t, {
    "/api/health": (_req, res) => res.end("<html>SECRET-private-error</html>"),
  });
  const result = await checkDeployment(server.base);
  assert.equal(result.ok, false);
  assert.equal(JSON.stringify(result).includes("SECRET-private-error"), false);
});

for (const path of ["/api/health", "/", "/api/agent"]) {
  test(`HTTP 500 at ${path} fails without leaking response details`, async (t) => {
    const server = await fixture(t, { [path]: (_req, res) => {
      res.writeHead(500);
      res.end("SECRET-detailed-external-stack-trace");
    } });
    const result = await checkDeployment(server.base);
    assert.equal(result.ok, false);
    assert.match(result.failures.join("\n"), /500/);
    assert.equal(JSON.stringify(result).includes("SECRET"), false);
  });

  test(`redirect at ${path} fails and its destination is never requested`, async (t) => {
    const server = await fixture(t, { [path]: (_req, res) => {
      res.writeHead(302, { location: "/redirected?secret=SECRET" });
      res.end();
    } });
    const result = await checkDeployment(server.base);
    assert.equal(result.ok, false);
    assert.equal(server.requests.some((r) => r.path.startsWith("/redirected")), false);
    assert.equal(JSON.stringify(result).includes("SECRET"), false);
  });

  for (const stage of ["headers", "body"]) {
    test(`timeout includes ${stage} receipt at ${path}`, async (t) => {
      const server = await fixture(t, { [path]: (_req, res) => {
        if (stage === "body") {
          res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
          res.flushHeaders();
          res.write("{");
        }
      } });
      const start = Date.now();
      const result = await checkDeployment(server.base, { timeoutMs: 50 });
      assert.equal(result.ok, false);
      assert.match(result.failures.join("\n"), /timeout/i);
      assert.ok(Date.now() - start < 2000, "body reads must remain inside the timeout");
    });
  }
}

for (const provider of ["unknown-SECRET", "", 7, undefined]) {
  test(`invalid AI provider is rejected (${String(provider)})`, async (t) => {
    const server = await fixture(t, { "/api/agent": (_req, res) => res.end(JSON.stringify({ provider, model: "configured" })) });
    const result = await checkDeployment(server.base);
    assert.equal(result.ok, false);
    assert.equal(result.provider, null);
    assert.equal(JSON.stringify(result).includes("SECRET"), false);
  });
}

for (const model of [null, "", "   ", 8]) {
  test(`configured provider requires a nonempty model (${String(model)})`, async (t) => {
    const server = await fixture(t, { "/api/agent": (_req, res) => res.end(JSON.stringify({ provider: "anthropic", model })) });
    assert.equal((await checkDeployment(server.base)).ok, false);
  });
}

test("Ollama is a recognized configured provider", async (t) => {
  const server = await fixture(t, { "/api/agent": (_req, res) => res.end(JSON.stringify({ provider: "ollama", model: "local-model" })) });
  const result = await checkDeployment(server.base);
  assert.equal(result.ok, true);
  assert.equal(result.provider, "ollama");
});

test("unconfigured AI requires an explicit local option", async (t) => {
  const server = await fixture(t, { "/api/agent": (_req, res) => res.end(JSON.stringify({ provider: null })) });
  assert.equal((await checkDeployment(server.base)).ok, false);
  assert.equal((await checkDeployment(server.base, { requireAi: false })).ok, true);
  const result = await cli([server.base, "--allow-unconfigured-ai"]);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /local|로컬/i);
  assert.equal((await checkDeployment("https://example.invalid", { requireAi: false })).ok, false);
});

test("invalid URL and options fail before sending any network request", async (t) => {
  const server = await fixture(t);
  for (const base of [
    "not a URL", "http://example.invalid", ` ${server.base}`, `${server.base}/api/health`,
    `${server.base}/.`, `${server.base}/%2e`, `${server.base}?token=SECRET`, `${server.base}#SECRET`,
    server.base.replace("//", "//user:SECRET@"), server.base.replace("//", "//@"),
    server.base.replace("http:", "ftp:"), `${server.base}\\`,
  ]) {
    const result = await checkDeployment(base);
    assert.equal(result.ok, false, base);
    assert.match(result.failures.join("\n"), /configuration/i);
    assert.equal(JSON.stringify(result).includes("SECRET"), false);
  }
  for (const options of [{ expectedCommit: "short" }, { expectedCommit: "" }, { timeoutMs: 0 }, { timeoutMs: Infinity }, { requireAi: "false" }]) {
    assert.equal((await checkDeployment(server.base, options)).ok, false);
  }
  assert.deepEqual(server.requests, []);
});

test("CLI configuration errors use exit 2 and do not send requests or leak secrets", async (t) => {
  const server = await fixture(t);
  for (const args of [[], [server.base, "--unknown"], [`${server.base}?secret=SECRET`], [server.base, server.base], ["https://example.invalid", "--allow-unconfigured-ai"]]) {
    const result = await cli(args);
    assert.equal(result.code, 2);
    assert.equal((result.stdout + result.stderr).includes("SECRET"), false);
  }
  assert.equal((await cli([server.base], { EXPECTED_DEPLOY_SHA: "short-SECRET" })).code, 2);
  assert.deepEqual(server.requests, []);
});

test("CLI validates EXPECTED_DEPLOY_SHA and warns when a failed probe recovers", async (t) => {
  let attempts = 0;
  const server = await fixture(t, { "/api/health": (req, res) => {
    attempts += 1;
    if (attempts === 1) {
      res.writeHead(503);
      return res.end("SECRET-temporary-startup-details");
    }
    health()(req, res);
  } });
  const start = Date.now();
  const result = await cli([server.base], { EXPECTED_DEPLOY_SHA: SHA });
  assert.equal(result.code, 0);
  assert.equal(attempts, 2);
  assert.ok(Date.now() - start >= 4900, "retry interval should be five seconds");
  assert.match(result.stdout + result.stderr, /warning.*recover|warning.*복구/i);
  assert.equal((result.stdout + result.stderr).includes("SECRET"), false);
});

test("CLI compares full expected release SHA rather than accepting healthy wrong builds", async (t) => {
  const server = await fixture(t);
  const result = await cli([server.base], { EXPECTED_DEPLOY_SHA: "b".repeat(40) });
  assert.equal(result.code, 1);
  assert.equal(server.requests.filter((r) => r.path === "/api/health").length, 3);
});

test("scheduled window includes its start, excludes its end and never repeats in another year", () => {
  assert.equal(withinMonitoringWindow(new Date("2026-09-05T14:59:59.999Z")), false);
  assert.equal(withinMonitoringWindow(new Date("2026-09-05T15:00:00.000Z")), true);
  assert.equal(withinMonitoringWindow(new Date("2026-09-12T14:59:59.999Z")), true);
  assert.equal(withinMonitoringWindow(new Date("2026-09-12T15:00:00.000Z")), false);
  assert.equal(withinMonitoringWindow(new Date("2027-09-06T00:00:00+09:00")), false);
  assert.equal(withinMonitoringWindow(new Date("invalid")), false);
});

test("out-of-window scheduled CLI explicitly skips and sends no requests", async (t) => {
  const server = await fixture(t);
  const result = await cli([server.base, "--scheduled"], {}, "2027-09-06T00:00:00+09:00");
  assert.equal(result.code, 0);
  assert.match(result.stdout, /SKIPPED/);
  assert.doesNotMatch(result.stdout, /PASS|healthy|정상/);
  assert.deepEqual(server.requests, []);
});

test("scheduled CLI stops retries when the first attempt crosses the monitoring cutoff", async (t) => {
  const server = await fixture(t, {
    "/api/health": health({ checkedAt: "2026-09-12T14:59:59.999Z" }),
    "/api/agent": (_req, res) => res.end(JSON.stringify({ provider: null })),
  });
  const result = await cli([server.base, "--scheduled"], {}, "2026-09-12T14:59:59.999Z", "2026-09-12T15:00:00.000Z");
  assert.equal(server.requests.length, 3, "only the three GETs dispatched before the cutoff may run");
  assert.deepEqual(server.requests.map((r) => r.path).sort(), ["/", "/api/agent", "/api/health"]);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /SKIPPED/);
  assert.doesNotMatch(result.stdout, /PASS|healthy|정상/);
  assert.match(result.stderr, /AI provider is not configured/);
});

test("manual CLI remains available outside the scheduled monitoring window", async (t) => {
  const server = await fixture(t, { "/api/health": health({ checkedAt: "2027-09-06T00:00:00+09:00" }) });
  const result = await cli([server.base], {}, "2027-09-06T00:00:00+09:00");
  assert.equal(result.code, 0);
  assert.match(result.stdout, /PASS/);
  assert.doesNotMatch(result.stdout, /SKIPPED/);
  assert.equal(server.requests.length, 3);
});
