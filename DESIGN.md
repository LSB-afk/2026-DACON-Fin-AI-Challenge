# Design

## Source of truth
- Status: Active
- Last refreshed: 2026-09-06
- Primary product surfaces: 페이체크 AI 상담 진행 / 중앙 사무실, ontology knowledge workspace, shared consultation drawer and results.
- Evidence reviewed: user Goal attachment and both screenshots; service/app/_office.tsx, _officeCanvas.tsx, _agent.tsx, _agent-core.ts, page.tsx; service/lib/office*.ts; globals.css; .omc/plans/city-25d-plan.md.
- This brief supersedes the old fixed 80×45, x-monotone street map and single-working-agent assumptions. Business rules, evidence and approval boundaries remain authoritative.

## Brand
- Personality: clear, calm, capable Korean financial service; a real office made visible.
- Trust signals: observed execution, source evidence, human approval, explicit failure and recovery.
- Avoid: invented business activity, neon, ornamental dashboards, illegible pixel text, uniform repeated boxes.

## Product goals
- Goals: a spacious central consultation hub surrounded by distinct departments; consistent isometric space; understandable real work handoffs; a connected ontology explorer with definitions, directed relations, properties and verifiable code evidence.
- Non-goals: new financial products, changing legal rules, production deployment, dependencies or external messaging.
- Success signals: central start, actual concurrent requests visible, edited-input consistency, completion reaches 100% only for completed required work, readable 1440/1920/mobile views.

## Personas and jobs
- Primary personas: 상담사, 금융 AI 시연 관람자, 상담 진행을 확인하는 사용자.
- User jobs: start a consultation, see current work and blockers, inspect evidence, correct and approve results.
- Context: desktop demonstration and interactive operation; mobile retains every essential consultation action.

## Information architecture
- AI role organization revision (2026-09-06): navigation and title remain `AI 역할 조직도`. Replace the oversized authority hierarchy with an actual processing overview and four department detail groups. Show input → concurrent routing/extraction → deterministic judgment → verification → Korean answer → human approval → application/record. Translation is an optional branch from the Korean answer, not a condition of judgment or approval. Only routing/extraction are described as concurrent requests. Use only current service roles; a second human compliance approver, external RM/jeonse products, invented queues and uptime are out of scope.
- Settlement receipt revision (2026-09-06): current judgment data is the sole source for the receipt screen and PDF. Read outcome first, then item amounts, non-totalled/review items and expandable grounds. Preserve `moneyTotals`: calculation-based amounts, estimated ranges and review reference amounts must not be combined. Do not call a code calculation a guaranteed payment. Explicit zero, absent amount, excluded/normal status and an unexecuted consultation are distinct states. Show only available case/run identifiers and the actual judgment reference date; do not fabricate an issuance time. Header input descriptions must reflect edited current inputs, not a stale sample summary.
- Artifacts: retain the existing JSON payload and download. Add a direct browser-local A4 receipt PDF download, loading/failure/retry states and a readable receipt preview. Reuse the shared receipt model and amount formatting; support Korean, long content and multiple pages without clipping totals. No consultation data is uploaded. If a dependency-free raster PDF is used, clearly disclose that its text cannot be selected; the HTML receipt and JSON remain the accessible/data alternatives.
- Organization cards are individual capabilities, not independent fictional agents. Each opens a detail panel with actor, input, output, constraints, implementation source and relevant action. Two registered financial skills retain separate input/rule/scope sections in the skill catalog. Organization-to-skill navigation selects the intended skill; starting a consultation fills an example only and never dispatches a request without the user's run action.
- Organization status uses the same case/run/input-scoped live projection as ontology. Availability must not look like execution. Only observed requests show running/elapsed data; approval readiness must come from the current actual answer and approval gate. Header counts summarize actual card statuses, not fake workload.
- Primary navigation: retain existing service navigation and stable FLOW identifiers.
- Core routes/screens: agent-run office; operation panel with input, timeline and approval; ontology explorer; existing support screens.
- Ontology composition: left searchable taxonomy, center local/global graph and selected concept, right definition / properties / incoming and outgoing links / constraints. All panes share one selection. Mobile uses accessible stacked panels rather than a squeezed desktop layout.
- Ontology live revision (2026-09-05, newest user correction): white background is required. Default to a service execution map with named service hubs derived from FLOW/skills and actual observed runtime nodes; retain T-Box/A-Box as explicit inspection tabs. Consultation acceptance, routing/extraction request events, confirmed values, real judgments/evidence, translation and human approval/record signals add their own typed nodes. Catalog availability is not execution. New nodes grow near related hubs, surviving nodes keep stable xyz coordinates, and short eased settling replaces full-layout jumps. Directed motion is limited to observed running edges; never animate invented progress. Separate current case/run/input revision, clear stale runtime nodes, keep raw inputs in existing in-memory lifetime only.
- Office guidance: persistent current-work / next-action explanation, department directory, purpose-based camera presets, optional guided tour and truthful dependency overview.
- Hierarchy: office and central hub → current activity/status → selected department detail → operational input panel.

## Design principles
- Space describes departmental relationships, never forces execution order.
- Business states come from the same run and input revision. Animation is presentation only.
- Quiet UI surrounds a detailed architectural scene; each facility has a recognizable purpose.
- Tradeoffs: genuine isometric geometry with Canvas 2D preserves the current dependency stack and readable HTML labels.

## Visual language
- Organization chart: white canvas, restrained navy emphasis on deterministic judgment and final outcome, existing blue accent (#006EDA), pale surface (#F6F9FD), ink (#101A2B) and muted (#46556D). Existing Pretendard and common control tokens remain authoritative. Capability cards name actor, task and output rather than only displaying counts. Connectors in the processing overview describe actual dependencies; department grouping does not imply execution order. Four department columns when content width allows; two on tablet, one on mobile. Details remain a keyboard-accessible modal side panel. No new ambient animation.
- Receipt: familiar document structure, tabular right-aligned amounts, restrained rules and spacing, a prominent honest amount summary and grouped line items. Status always includes text and an icon, not just color. Details stay expandable on screen; the A4 PDF includes concise evidence and all line items. Mobile preserves label/amount association without horizontal overflow.
- Color: white #FFFFFF, cool floor #EAF0F5, ink #101A2B, brand blue #006EDA, warm wood #B89067, sage #7D9C88. Semantic text uses existing CSS tokens.
- Typography: existing Pretendard/system Korean face. Labels stay screen-aligned, at least 12px; progressive detail follows zoom and selection.
- Layout: single contiguous open office, central reception/dispatch atrium, 6–8 department neighborhoods, approximately 24 work/support spaces with realistic doors and corridors.
- Concept: knowledge/analysis at back; extraction and routing around central reception; decisions/compliance around the sides; response, approval and records connected toward the front.
- Shape/elevation: coherent orthographic isometric projection, floor slab, wall thickness, low front walls, tall rear walls, solid furniture and consistent contact shadows.
- Motion: retain the supplied low-poly character style. Staff walk along connected doors/corridors to purposeful office destinations and perform restrained desk gestures. Actual work interrupts ambient activity and takes priority. Clearly label ambient movement as visual only; it never creates requests or changes progress. Real request documents follow safe paths; customers remain in the central consultation area. Manual pan cancels tracking. This supersedes the previous fixed-staff requirement at the user's request.
- Imagery: procedural architectural geometry and low-poly people. No raster labels or reference-image branding.

## Components
- Reuse: existing controls, tokens, Pill, input/timeline/approval sections and view navigation.
- Changed: office world/path data, projection, renderer, HTML labels/hit targets, minimap, HUD, inspector.
- States: idle, requested, running, waiting, blocked, offline, completed; real approval, translation and applied-record state.
- Ownership: lib owns layout and pure state; canvas draws props; React connects controls and accessible content.

## Accessibility
- Target: readable controls with existing contrast checks, semantic buttons and text equivalents.
- Keyboard: focusable map, arrows pan, +/- zoom, 0 fit, Home central hub; Escape closes selection/panels.
- Readability: no state conveyed by color alone. Labels never follow isometric text skew.
- Screen readers: map description and status live region; selectable controls and detail panels.
- Motion: prefers-reduced-motion uses immediate positioning and no ambient animation.

## Responsive behavior
- Verify 1440×900, 1920×1080, 390×844.
- Desktop: full remaining viewport; restrained HUD and compact controls, optional operational drawer.
- Mobile: compact overview plus accessible department/state list and consultation/approval controls.
- Touch: explicit zoom controls and selectable content; do not depend on hover.

## Interaction states
- Loading: only dispatched requests are marked in progress, including independent routing/extraction requests.
- Empty: central customer/reception and clearly identified office-life animation, no fictitious AI work or document. Ontology distinguishes concept definitions from actual executed instances and explains an empty execution graph.
- Error: show network, provider, partial-result, evidence and missing-input states distinctly.
- Success: same accepted inputs drive preview, approval and application; records and customer reach completion.
- Disabled: explain unavailable approval and unavailable support actions.
- Slow/offline: show observed request state; no invented provider-internal progress.

## Content voice
- Plain Korean. Prefer 상담, 사무실, 부서, 검토, 결과 over implementation terms in primary labels.
- Current work explains what is happening and what action is needed; details hold technical evidence.
- Never label provider availability as a translation in progress.

## Implementation constraints
- Next 16.3.1 / React 19 / Canvas 2D / Tailwind; no new runtime dependencies.
- UI colors reuse globals.css tokens; scene materials can define an appropriate architectural palette.
- 3D network tokens: white #FFFFFF, surface #F5F8FC, subtle slate edge #A2B2C3, input blue #1676C8, output teal #238B73, constraint ochre #A67A23, control violet #7667B1. Modest perspective, service labels and restrained rings orient the user. Node size/depth vary without changing semantic role. Plain screen-aligned Pretendard labels and accessible parallel controls remain outside Canvas; selected details always explain service, actual status and source.
- Common world↔projection↔screen helpers govern drawing, picking, labels, minimap and tracking.
- Collision paths use actual connected walkable floor and door openings, independent from FLOW.
- Hidden tabs suspend animation. Paused/reduced-motion scenes stop repainting after real movements settle. Ambient movement is time-based, capped and explicitly switchable; cache unchanged architectural layers where useful.
- Test expectations: state regression tests; path/projection invariants; typecheck/test/lint/verify/scan/build; actual browser interactions and screenshots.

## Open questions
- None blocking. Latest user reference #2 is the current office to preserve and enrich; reference #3 defines the existing character to animate, not a request for new raster art.
- Obsidian inspiration: coordinated hierarchy, graph, properties and directed backlinks; do not copy branding or claim its implementation. Official references: https://obsidian.md/help/plugins/graph and https://obsidian.md/help/plugins/backlinks.
- Actual provider telemetry only describes dispatched requests; internal inference concurrency is unknown.
- Validation handoff: service/screenshots/knowledge-office/README.md records this extension, current-snapshot/source boundaries, mobile graph behavior, office motion, screenshots and fresh verification. service/screenshots/central-office/README.md remains the historical previous-task report, not proof of a fresh provider run.
- Latest ontology renderer handoff: service/screenshots/ontology-3d/README.md supersedes the earlier SVG/ring graph description only. Its screenshot evidence and browser tests cover genuine 3D rotation, portal expansion, touch capture, focus restoration and motion preferences; the prior business/source contracts remain unchanged.
- Current white/live handoff: service/screenshots/ontology-live/README.md supersedes the dark renderer above. Actual service execution grows a current graph; dictionary and execution inspection remain available. In-memory lifetime and provider-fixture limitations are explicit.
- Organization handoff: service/screenshots/organization/README.md records the prior hierarchy, thirteen actual capabilities versus two registered financial skills, current-result navigation and historical validation. Its hierarchy and evidence are not proof of the 2026-09-06 receipt/process revision. The skill catalog keeps the compact companion dock.
- Receipt/process references: GOV.UK confirmation pages (https://design-system.service.gov.uk/patterns/confirmation-pages/) inform outcome/reference/next-action order; GOV.UK summary lists (https://design-system.service.gov.uk/components/summary-list/) inform paired labels and values; USWDS process lists (https://designsystem.digital.gov/components/process-list/) inform compact, readable processing stages; W3C PROV-O (https://www.w3.org/TR/prov-o/) informs the distinction between actors, activities and outputs. These principles are adapted to existing service data and brand, not copied as new financial content.
