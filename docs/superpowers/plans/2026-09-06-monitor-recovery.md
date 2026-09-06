# Judging-window monitor recovery

## Outcome and current evidence

Keep read-only checks of the submitted Render service scheduled through the judging window, and automatically perform one additional bounded check if the primary workflow fails or times out. Do not redeploy the application, change compute/billing, call AI inference, rewrite Git history, or touch submission drafts.

The required interval is 2026-09-07 11:00 through 2026-09-11 23:59 Asia/Seoul. Reuse the existing monitoring buffer: 2026-09-06 00:00 inclusive through 2026-09-13 00:00 exclusive, checked before every attempt.

Before implementation, GitHub reports: public/non-archived repository, default branch `main`, Actions enabled, `Render availability` active, three successful manual runs, no scheduled runs. Existing cron `3-58/5 * 5-12 9 *` is valid; the missing scheduler events have no confirmed root cause. An actual one-minute cron change is a bounded reactivation attempt, not proof of repair. The deployed application and pinned monitor revision remain `d2223595a91633de9d1fc939a688c2a32c7f477c`.

## Implementation boundaries and code rules

Compatibility mode: reuse this repository's Node built-in test/fetch/child-process conventions. No new dependencies or unrelated rule scaffolding. Changes are limited to the two availability workflows, recovery script/tests, the existing package test command if required, and this runbook. Leave `render.yaml`, application UI/API code, release variables and user drafts unchanged.

- Change primary cron to `4-59/5 * 5-12 9 *`; preserve manual dispatch, exact-release checking, read-only permissions and three attempts separated by five seconds.
- Add `Render availability recovery`, triggered only by completion of `Render availability` on trusted `main`; handle `failure` and `timed_out`, not intentional cancellation. No self-trigger, schedule loop, automatic rerun API, deploy hook, or GitHub write permissions.
- Check out trusted `main` with credentials not persisted. Never check out code/artifacts from the triggering run.
- Recovery validates its source workflow identity/path, same repository, main branch, completed terminal status and acceptable failure conclusion before any HTTP requests. It also checks the exact 2026 time window and requires the configured HTTPS Render root origin and full pinned deployment SHA.
- Reuse `smoke.mjs --scheduled` via Node child-process arguments (no shell interpolation) for one bounded recovery batch. Preserve its three checks (health, homepage, provider configuration), retry cap, output redaction and per-attempt cutoff. Recovery failure terminates and is visible in Actions; it must not start another recovery.
- The recovery workflow does not run if no primary workflow was created. Both depend on GitHub Actions; this is not independent monitoring, immediate recovery, or an uptime guarantee.
- Add a default-off, manual-dispatch-only `recovery_drill` input to the primary workflow. A clearly labelled synthetic failure tests the actual recovery event without changing the production service, expected revision or credentials. Follow the drill with an ordinary successful check; distinguish drill failures from real incidents in logs/summaries.

## Required checks before completion

- Unit tests: test recovery admission/configuration, success, finite failure, skipped/out-of-window runs, no requests on rejected events, no secrets in output, and actual GET-only execution against a loopback fixture with no production inference. Observe failures before implementation.
- Existing smoke tests and package tests remain green; lint and typecheck pass. No application code changed; production build is covered by Service CI after publication.
- Parse/lint both workflows with an available local YAML/action validator; inspect permissions, checkout provenance, trigger filtering and timeouts independently.
- Commit only task-owned files using Lore trailers and push main without force after confirming its remote head has not moved.
- Run a manual primary check, inspect recovery trigger behavior without deliberately breaking the production service, and observe real scheduled runs. Report actual `event` values: manual success never counts as scheduled execution evidence.
- Verify public health still identifies the frozen deployed application revision. Leave service Auto-Deploy Off and Blueprint Auto Sync No.

## External evidence and unresolved boundary

- [GitHub schedule](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule): supported cron, default-branch execution, delayed/dropped events, changing cron reactivates inactivity-disabled schedules. No promised repair for an already-active workflow.
- [GitHub workflow_run](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run): completion events and conclusion-based jobs; privileged-workflow trust boundary.
- [GitHub Actions terms](https://docs.github.com/en/site-policy/github-terms/github-terms-for-additional-products-and-features#actions): keep production monitoring lightweight; no infinite runner chains.
- An independent external monitor would mitigate GitHub scheduler outages but needs a separately authorized/connected provider. Do not create accounts, accept terms, spend money or persist personal-machine jobs as an undisclosed substitute.

## Baseline verification

- Existing `node --test scripts/smoke.test.mjs`: 52/52 passed, including bounded three attempts, five-second retry, GET-only checks and exact-year cutoff.
- GitHub manual run [34027117224](https://github.com/LSB-afk/2026-DACON-Fin-AI-Challenge/actions/runs/34027117224) succeeded at 2026-09-06 10:20:11 UTC. This is not a scheduled run.
- Root and GitHub clocks agree (2026-09-06 10:20 UTC); default-main workflow blob matches local HEAD. No clock, branch, disabled-workflow or mismatched-file cause was found.
- Existing `js-yaml` parser loads the current workflows successfully. No new dependency is required.

## Local implementation verification

- Added a failure-only recovery workflow and a small Node admission/child-process wrapper; no GitHub write token, rerun API or deployment hook is used.
- Recovery trusts only the exact primary workflow/path, source `schedule`/`workflow_dispatch`, same repository, `main`, completed failure/time-out and the shared 2026 buffer. Intentional cancellation, malformed configuration and expired windows do not start a probe.
- Primary recovery drills are default-off and manual-only. The summary checks the deliberate failure step's actual outcome, so an earlier real failure is not mislabelled as synthetic.
- The child checker retains its bounded three attempts; a zero-exit `SKIPPED` at the period cutoff remains skipped and is never reported as a successful recovery.
- Executor observed failing tests before implementation. Root independently reran `npm test`: 567/567 passed, including nine new recovery tests; `npm run lint` and `npm run typecheck` passed. Existing module-type warnings remain informational.
- Both updated workflows parse with the installed `js-yaml`; read-only permissions, trusted checkout, trigger filtering and bounded timeouts were reviewed. `git diff --check` passed.
- Independent read-only review approved publication with no critical/important findings. Its sole minor suggestion was addressed by explicitly testing manual-dispatch admission alongside scheduled admission; the expanded test passed.
- Live recovery drill, real scheduled events and remote CI remain publication-time checks. No manual test listed above substitutes for that evidence.
