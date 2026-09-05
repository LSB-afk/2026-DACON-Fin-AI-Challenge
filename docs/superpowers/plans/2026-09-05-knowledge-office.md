# Knowledge workspace and living office

> Execution plan. Owner: root. Status: verified complete. User explicitly requested implementation and autonomous progress. Preserve all existing dirty changes. No commits, pushes, production actions or new dependencies.

## Result and boundaries

Transform the sparse ontology into a synchronized, content-rich exploration workspace and explain the existing isometric office through live guidance, meaningful navigation, department signage and naturally moving characters. Keep legal/financial rules, evidence, human approval, request identity and actual processing state unchanged. New ontology concepts must name actual implemented contracts, not invented business rules. Ambient activity must be visibly distinct from AI work.

## Design contract

- Preserve the existing white / cool-floor / ink / blue / wood / sage palette and Korean Pretendard typography in DESIGN.md.
- Desktop knowledge layout: searchable concept hierarchy (left), graph and selected concept context (center), incoming/outgoing relations, typed properties and code evidence (right). Local/global graph switch, one/two-hop exploration, filters and keyboard-accessible selection. No fake A-Box when no run exists.
- Add meaningful execution, approval, revision, evidence and translation concepts only where backed by current code. Every class/property reference and hierarchy remains valid. Existing eight semantic roots stay stable unless concrete evidence requires a change.
- Office: compact live summary explains current activity, reason for waiting and next actionable control; a dependency view reflects routing/extraction concurrency; a short tour explains departments without starting AI work; camera presets focus real building groups; meaningful support rooms are discoverable through signage and a directory.
- Motion: existing low-poly people gain directional walking and subtle working gestures. Deterministic, staggered office-life destinations use the existing walkable geometry. Real work takes precedence. A visible movement toggle, reduced-motion and document visibility disable ambient updates. Business state never depends on animation completion.
- Mobile: stacked ontology panes and office guide controls remain usable at 390×844 without horizontal page overflow or covering approval actions.

## Shared interfaces and ownership

### Task A — ontology data and pure exploration

Owned: `service/lib/ontology/schema.ts`, `schema.test.ts`, new `explorer.ts`, `explorer.test.ts`. May extend `abox.ts` / tests only after notifying root. No app edits.

- [x] Add real code-backed runtime/control concepts and meaningful relations/properties.
- [x] Publish small pure explorer API for search, neighborhoods, directed relations, applicable properties and axioms. Coordinate exact names/types with Task B before implementation.
- [x] RED then GREEN tests for search Korean/ID/text, incoming vs outgoing, depth and domain inheritance, valid references, real codeSource, no empty-graph substitution.
- [x] Preserve known limitations (e.g. unmaterialized causal links) honestly; do not create unsupported financial assertions.

### Task B — ontology UI

Owned: `service/app/_graph.tsx`, new `_ontology.tsx`, ontology-only imports and `OntologyView` section in `_views.tsx`. No page or other view changes.

- [x] Coordinate API with Task A; existing `OntologyView({abox})` caller stays compatible.
- [x] Implement tripane explorer with synchronized concept selection, search/tree, local/global graph, relation direction and detail/evidence.
- [x] Replace duplicate long static ontology sections with purposeful tabs or panels. Distinguish T-Box definitions and A-Box actual results, with explicit empty state.
- [x] Include keyboard controls and narrow-layout behavior. Do not claim new runtime instances if caller only supplies an existing recorded judgment.
- [x] Validate scoped lint/typecheck and browser behavior; include stable accessible labels/test IDs for root QA.

### Task C — people motion

Owned: `service/app/_officeCanvas.tsx`, new `service/lib/officeMotion.ts` and tests. No `_office.tsx` or world edits without coordination.

- [x] Add optional `ambientMotion?: boolean` prop (default false for backward compatibility); Task D explicitly enables it with UI toggle.
- [x] Pure deterministic motion planner/ticker with safe paths, activity destinations, directional walking and working gestures; per-person positions remain telemetry source for picking and following.
- [x] Preserve all existing canvas datasets and actual document/customer behavior. Add activity telemetry if useful, explicitly separated from business statuses.
- [x] RED/GREEN: path walkability, interruption by actual work, pause/reduced/hidden behavior, no state mutation, stable time-based movement.
- [x] Cache/cap rendering where needed; background work stops on hidden tabs.

### Task D — office guidance and interaction

Owned: `service/app/_office.tsx`, new `service/lib/officeGuide.ts` and tests. No canvas edits.

- [x] Build pure truthful current/next explanation from existing steps and ActorCtx; test idle, parallel work, missing input, failure, approval pending, applied completion and skipped translation.
- [x] Add guide/tour, dependency overview, department/system labels and practical camera presets, room-linked navigation buttons.
- [x] Add visible ambient movement toggle default on, pass `ambientMotion` to canvas; explain visual-only movement and respect reduced motion.
- [x] Keep original selectors, dynamic position hit-testing/following, approval controls and mobile accessibility intact.

### Task E — integration and browser evidence (root)

Owned: `DESIGN.md`, this plan, page integration if needed, QA scripts and screenshots, final cross-lane fixes coordinated with owners.

- [x] Inspect actual A-Box source and expose truthful context; avoid stale/other-case claims. Reuse actual execution evidence where available without creating fake findings.
- [x] Capture baseline and final screenshots; record visual verdict each iteration under `.omx/state/knowledge-office/ralph-progress.json` (visual-verdict skill unavailable, equivalent rubric recorded directly).
- [x] Add browser coverage for ontology search/selection/neighborhood/relation navigation/empty A-Box/mobile; office guidance/tour/presets/toggle; agent displacement and safe paths, hidden/reduced motion, real execution transitions.
- [x] Adapt previous static-frame test to explicitly pause ambient motion. Run previous execution regression script and unit/typecheck/lint/verify/scan/build, document real-provider limitations.
- [x] Independent final review, resolve concrete findings, open verified local server for user.

## Test and stop contract

Start new pure behaviors with failing tests; make them pass before integration. App interaction behavior is proved in the real browser using controlled browser-only provider fixtures where needed. Do not perform billable/live calls just for animation QA. Stop only when implemented features and targeted regressions pass, visual evidence is reviewed, and any unverified external-provider behavior is clearly documented. No goal runtime is activated by this plan.

## Coordination rulings

- Native independent bounded agents are authorized by the user's AGENTS contract; no OMX team runtime is needed.
- Shared dirty workspace is intentional: no isolated clean worktree that drops the user's previous implementation, and no automatic commits. Ownership prevents concurrent overlapping edits.
- Brainstorm/design approval pauses are superseded by the user's explicit request to start work autonomously; decisions are documented here and in DESIGN.md.
- Updated request explicitly replaces fixed staff with optional office-life motion; original correctness, pause, hidden-tab and reduced-motion contracts remain.

## Evidence log

- Baseline: previous implementation reports 343 unit and 22 controlled-browser checks. These are historical only; this task requires fresh verification.
- Research: official Obsidian graph, explorer, properties and backlink docs retrieved 2026-09-05. Inspiration is navigation/content structure, not the product branding.
- Final: 99 classes, 48 object relations, 38 data properties. 437/437 unit tests, 31/31 controlled browser scenarios, typecheck, ESLint, production build, golden/contrast verification and diff checks pass. Scan reports no errors and the existing uncommitted environment-file warning.
- Independent semantic review resolved live/synthetic provenance wording, inherited object relations, current-case/run/revision selection, payslip monitor handoff and separate manual-edit revision identity. Browser regression covers these paths.
- Visual passes recorded through iteration 4. Compact graphs disclose labels on selection/focus; office guidance and ambient activity remain distinct from real AI processing.
- Geometry diagnostics use raw floor coordinates plus inverse-projection agreement to avoid IEEE-754 doorway-boundary false positives; no collision rule was relaxed. Final samples: 71 document/customer samples and 300 staff positions on walkable floor; paused/hidden frames 0.
- Local server returned HTTP 200 and was opened at http://localhost:3000. No new live provider run, commit, push, deployment or dependency addition. Detailed evidence: service/screenshots/knowledge-office/README.md and report.json.
