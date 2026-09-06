# Render Free availability implementation plan

> **For agentic workers:** Execute task-by-task with `superpowers:executing-plans`; independent official-document research and final review may run in native subagents.

**Goal:** Prepare the latest pushed service for Render Free deployment and bounded five-minute GitHub availability checks.

**Architecture:** A non-cached liveness endpoint identifies the running Render commit without calling AI. A reusable smoke checker validates liveness, the actual homepage, and provider configuration. GitHub schedules it against an explicitly configured public URL and frozen release SHA; Render never auto-deploys during judging.

**Tech Stack:** Existing Next.js 16.3.1, Node 24.11.1, Node built-in test/fetch, Render Blueprint, GitHub Actions. No new application dependencies.

**Spec:** The user's approved 2026-09-06 chat design: Render Free + five-minute GitHub requests, latest pushed GitHub version, safe preservation of local work. Required access: 2026-09-07 11:00 through 2026-09-11 23:59 Asia/Seoul. Operations buffer ends 2026-09-13 00:00 Asia/Seoul.

## Global constraints

- Start at `origin/main`, verified `2fd08aab5eea38e9708406e55c957bae596cd960`; never include the user's untracked submission drafts.
- No paid resources, force push, secrets in git/logs, local Ollama dependency in Render, or AI inference in monitoring.
- HTTP 200 alone, configured AI alone, and periodic checks are not proof of continuous availability or end-to-end AI success.
- Missing Render authentication blocks actual service creation, not safe local preparation and GitHub publication.

## Task 1: Observable, inexpensive service checks

**Files:** `service/app/api/health/route.ts`, `service/lib/health.test.ts`, `service/scripts/smoke.mjs`, `service/scripts/smoke.test.mjs`, `service/package.json`.

**Interfaces:** `GET /api/health` returns `{status:"ok", service:"paycheck", revision:string|null, checkedAt:string}` with `Cache-Control: no-store`. `checkDeployment(base, {expectedCommit, requireAi, timeoutMs})` returns an explicit success/failure report and makes GET requests only.

- [x] Write tests that reject stale/wrong revision, sleeping/loading-page responses, missing AI configuration, redirects, and timeout; use a real loopback HTTP server.
- [x] Verify tests fail against missing health endpoint and existing permissive smoke behavior: `node --test lib/health.test.ts scripts/smoke.test.mjs`.
- [x] Implement the health response and checker; only explicit local smoke flag may allow unconfigured AI. Never log response bodies or secret environment values.
- [x] Integrate script tests in `npm test`; verify health payload contains only allowlisted fields and calls no network.

## Task 2: Free deployment and scheduled verification

**Files:** `render.yaml`, `.github/workflows/render-availability.yml`, `.github/workflows/service-ci.yml`, `00_제출/배포_체크리스트.md`.

**Interfaces:** repository variables `RENDER_SERVICE_URL` and `RENDER_EXPECTED_COMMIT` activate the configured monitor. Render supplies `RENDER_GIT_COMMIT`. Secret AI key and account-supported model are entered privately in Render.

- [x] Set `plan: free`, `rootDir: service`, Node 24.11.1, `healthCheckPath: /api/health`, `autoDeployTrigger: "off"`; build with `npm ci && npm run build`, start with `npm run start -- --hostname 0.0.0.0 --port "$PORT"`.
- [x] Schedule at minutes `3-58/5`, avoid concurrent monitors, bound time/retries, restrict permissions to contents read, require deployment URL and full SHA. No redeploys or commits from the monitor.
- [x] Limit scheduled probes to the judging/buffer window with a year-aware UTC guard; manual dispatch remains available. Missing configuration is reported as not configured, never healthy.
- [x] Add Linux CI running the existing lint/test/verification/scan/build checks plus monitoring tests and a built-server loopback HTTP smoke.
- [x] Document login/secret boundaries, dashboard creation, release-SHA verification, Actions notification setup, independent external monitoring gap, free limits, and rollback without rewriting git history.

## Task 3: Verify and publish the prepared release

- [x] Run baseline and changed tests, lint, typecheck, golden checks, security scan, production build, and actual loopback HTTP smoke with Render-style port/commit environment.
- [x] Independently review the deployment/monitor diff and resolve blocking findings.
- [ ] Commit only task-owned files using Lore trailers; fetch remote again, fast-forward integrate, push without force, verify GitHub HEAD and Linux CI.
- [ ] If Render authentication exists, create only the requested free service, privately configure provider, deploy the published SHA, validate public URL, activate monitor variables, and manually dispatch a check.
- [ ] If authentication is absent, stop at that exact boundary and report prepared vs activated state. Do not invent a deployment URL or claim uptime monitoring is active.

## Implementation evidence and deployment boundary

- Clean baseline: 488 tests passed on isolated `origin/main` checkout; existing Node module-type warnings remain informational.
- Clean checkout exposed `LayoutProps` missing before type generation. `typecheck` now runs the documented `next typegen && tsc --noEmit` sequence; subsequent typecheck/build passed.
- Health response tests: 3 passed. Actual production HTTP: homepage 200, health 200/no-store/expected Render-style revision. Local smoke explicitly allowed an unconfigured AI provider; this is not an AI readiness claim.
- Monitoring tests: 46 real HTTP/CLI regressions, including missing AI, old/wrong releases, timeouts and year boundaries. Review found a retry crossing the buffer cutoff; a failing 9-request reproduction became a passing 3-request test after per-attempt window checks.
- Final local suite 537/537, lint/typecheck/build passed; golden verification 32/32, contrast 33/33, secret scans 0 errors. Independent final review approved with no remaining findings. Publication/remote CI verification belongs to the commit/run record.
- Render authentication and a public deployed URL are not available in this session. Service creation, private API-key/model setup, public end-to-end AI smoke, monitor-variable activation, actual scheduled runs and external notification delivery remain unverified external steps.
