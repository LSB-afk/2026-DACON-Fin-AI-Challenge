# Safe GitHub integration — 2026-09-05

This verification supersedes the pre-integration reports for the combined source tree.

## History and preserved work

- GitHub `main` was rebuilt as `b8d952b` → `04e3359`. The tree at `b8d952b` exactly matches the old local head `84bcad9`.
- Local work was first committed as `7e2caf3` on the local-only `backup/2026-09-05-local-work` branch. Only that commit's changes were applied onto `04e3359`; the old unrelated history was not pushed.
- Remote entrance, speech-bubble and user-owned consultation queue changes remain. `_ui.tsx`, `_user.tsx`, `globals.css` and `lib/cases.ts` match `04e3359` exactly.
- The `page.tsx` conflict combines real U-01 submissions with case/run/revision isolation and live ontology. Same-ID resubmission invalidates old agent results. Applying an agent result activates the selected consultation before either departure or payslip handoff.
- No force push, dependency addition or financial-rule modification. `.env.local` remains ignored and untracked; its contents were not included in the commit.

## Fresh verification

- Unit tests: 477/477 passed.
- TypeScript, ESLint, production build and staged whitespace checks: passed.
- Golden cases: 32/32; A-Box validation: 28 executions; contrast: 33/33.
- Scanner: zero errors, only the existing ignored `.env.local` warning; scanner self-test passed all nine rules. Root design/plan documents also passed scanning.
- Browser acceptance: **45/45 passed**, no browser runtime errors. `report.json` is the final run against the newly built production server on `http://localhost:3002`.
- New integration scenarios cover an initially empty queue, actual user values reaching U-01, same-ID resubmission rejecting a late agent response, and a visible departure result from a fresh session. Existing payslip scenarios cover both workplace-size branches.
- The missing selected-consultation state was reproduced against current source on port 3001 before correction; see `../github-integration-red/report.json`. The initial port-3000 process served an older build and is not evidence for this integration.
- An independent focused review found no remaining integration blockers after the selected-consultation correction.

The final report's test statuses are authoritative. `failure-*.png` files retain intermediate test/debug captures; their existence does not indicate a failed final run. Browser providers are controlled fixtures through the actual streaming UI, not evidence of external model inference accuracy. No production deployment was performed.
