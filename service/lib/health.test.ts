import assert from "node:assert/strict";
import { test } from "node:test";
import { GET } from "../app/api/health/route.ts";

test("health reports only liveness and the running revision without calling AI", async (t) => {
  const previous = process.env.RENDER_GIT_COMMIT;
  const previousKey = process.env.ANTHROPIC_API_KEY;
  t.after(() => {
    if (previous === undefined) delete process.env.RENDER_GIT_COMMIT;
    else process.env.RENDER_GIT_COMMIT = previous;
    if (previousKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = previousKey;
  });
  process.env.RENDER_GIT_COMMIT = "abcdef0123456789abcdef0123456789abcdef01";
  process.env.ANTHROPIC_API_KEY = "test-value";
  const network = t.mock.method(globalThis, "fetch", () => {
    throw new Error("A liveness probe must never call an external service");
  });
  const before = Date.now();
  const response = GET();
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match(response.headers.get("content-type") ?? "", /application\/json/);
  assert.deepEqual(Object.keys(body).sort(), ["checkedAt", "revision", "service", "status"]);
  assert.equal(body.status, "ok");
  assert.equal(body.service, "paycheck");
  assert.equal(body.revision, "abcdef0123456789abcdef0123456789abcdef01");
  assert.ok(Date.parse(body.checkedAt) >= before && Date.parse(body.checkedAt) <= Date.now());
  assert.equal(network.mock.callCount(), 0);
});

test("health reads the runtime revision rather than a cached build value", async (t) => {
  const previous = process.env.RENDER_GIT_COMMIT;
  t.after(() => {
    if (previous === undefined) delete process.env.RENDER_GIT_COMMIT;
    else process.env.RENDER_GIT_COMMIT = previous;
  });
  process.env.RENDER_GIT_COMMIT = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  assert.equal((await GET().json()).revision, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  process.env.RENDER_GIT_COMMIT = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  assert.equal((await GET().json()).revision, "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
});

test("health remains live without deployment metadata and never echoes malformed environment data", async (t) => {
  const previous = process.env.RENDER_GIT_COMMIT;
  t.after(() => {
    if (previous === undefined) delete process.env.RENDER_GIT_COMMIT;
    else process.env.RENDER_GIT_COMMIT = previous;
  });
  delete process.env.RENDER_GIT_COMMIT;
  assert.equal((await GET().json()).revision, null);
  process.env.RENDER_GIT_COMMIT = "not-a-public-commit";
  const response = GET();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).revision, null);
});
