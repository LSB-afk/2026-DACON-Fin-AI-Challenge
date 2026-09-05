# White, live service ontology

2026-09-05. This handoff supersedes the dark renderer in `../ontology-3d/`.

## Delivered

- The ontology opens on a white service execution map. Existing T-Box (99 concepts) and A-Box inspection remain separate tabs.
- Thirteen service definitions come from the actual FLOW/skill registry plus existing approval, application and record actions. Availability is explicitly different from execution.
- The input form runs the same consultation hook used by the office and drawer. Accepted input, observed routing/extraction requests, confirmed values, quoted evidence, current judgments and answers become linked nodes.
- Only observed requests receive moving edge particles. Gentle ambient node movement is visual only; new nodes settle near their service while existing coordinates remain stable. Camera rotation is optional. Pause, reduced-motion and hidden-document states suspend unnecessary drawing.
- Search, generated-item list, selected values, directed neighbors and code provenance explain the graph. Dense labels are culled without removing selectable nodes or their text alternatives. Mobile retains the input, controls and inspector.
- Case/run/input revisions scope runtime nodes. Edited or superseded input cannot reuse old results. Linked payslip judgments, Korean answers and translations use the same selected source. Rejudgment cannot upgrade an unapplied consultation revision; an actual synchronized monitor-field edit can update its handoff version.

## Verification

- Unit tests: 477 passed, including 17 live-projection and 14 incremental-motion tests.
- TypeScript, ESLint, production build and `git diff --check`: passed.
- Golden verification: 32/32; A-Box checks: 28 executions; token contrast: 33/33.
- Static scan: 0 errors, 1 existing untracked `.env.local` warning; secret values were not read or printed. Scanner self-test passed.
- Browser acceptance: 43/43 passed. See `report.json` for viewport data and frame samples. The suite covers white canvas, real streamed request boundaries, growing nodes, stable service anchors, natural-motion pause/reduced/hidden behavior, current-value replacement, linked monitor translation, synchronized field edits, unapplied-revision isolation, and previous office/graph keyboard, touch and dialog behavior.
- Local service responded HTTP 200 at `http://localhost:3000`.

## Screenshots

- `live-1440-completed.png`: desktop graph, execution input and selected evidence.
- `live-1440-completed-graph.png`: white graph after a completed consultation.
- `live-390-completed.png`: mobile stacked interface.
- `live-390-completed-graph.png`: mobile graph with collision-aware labels.
- `live-monitor-translation.png`: linked payslip judgment and actual translation state.

## Boundaries

Browser tests use controlled provider responses through the real streaming UI path; they do not establish external model inference accuracy. The runtime graph is a current in-memory projection, not a durable timestamped history. Refreshing does not retain its nodes. Financial rules were not expanded or reimplemented. No dependencies, commits, pushes or production deployment were added. Earlier unrelated worktree changes were preserved.

Implementation: `app/_ontologyLive.tsx`, `_graph.tsx`, `_graphMotion.ts`, `_ontology.tsx`, `_views.tsx`, `page.tsx`; `lib/ontology/live.ts`, `motion3d.ts`, `source.ts` and regression tests. `DESIGN.md` records the white, service-centered design contract.
