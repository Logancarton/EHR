# Clinical Bond Roadmap — work still to be done

Last reorganized: 2026-09-26. Completed work, with its evidence, lives in [ROADMAP_COMPLETED.md](ROADMAP_COMPLETED.md).

## How this file works

This file holds **only unfinished work**: the current milestone, the ordered queue, open defects and follow-ups, and the gates that still apply. It is the only ordered work queue in the repository.

**When something is finished, update both files in the same commit that finishes it:**

1. **Record it in [ROADMAP_COMPLETED.md](ROADMAP_COMPLETED.md)**, newest entry at the top of its completion log: slice ID, date, starting and resulting SHA, what changed, checks actually run and their results, and any named gaps left behind.
2. **Remove it from this file.** Delete its row from the ordered queue and its section below. Do not leave completed sections here "for reference".
3. **Carry leftovers forward.** Any gap, deferral or defect the finished work named becomes an item under *Open defects and follow-ups* here, or joins the queue.
4. **Update *Next up*** so the next agent knows where to start.

Only move work that is verified complete under the *Shared completion and visual verification rules* below. Partially finished work stays here with its current state stated plainly. For product intent see [PRODUCT_VISION.md](PRODUCT_VISION.md), for implemented boundaries [ARCHITECTURE.md](ARCHITECTURE.md), for decisions [DECISIONS.md](DECISIONS.md). Implementation truth comes from current code on `main` plus the newest intentional decisions; vision requirements are targets, not proof of completion. Real PHI remains prohibited until the production-readiness gate is intentionally satisfied.

## Next up

1. **SHELL-OWN-1 acceptance (owner override, D-117)** — Ownership migration is implemented; close the standing browser gate before certifying completion. See the bounded evidence below.
2. **P9/P10/P11, P12** — Financial truth, portability, production gates; full synthetic clinic day toward the D-107 funding prototype.

The owner may reprioritize at any time; an owner instruction outranks this list.

### SHELL-OWN-1 — D-117 ownership migration, acceptance pending

2026-10-03, starting `main` SHA `444145e72519f8a72d3cc3f5bf1d60e89faae4e7`. Requirements: VIS-03, TOOL-01/03, TAB-05, PAT-08/10. The slice changes workspace presentation and communication draft ownership, not clinical persistence, reasoning, permissions or vendor readiness.

Implemented: right-only contextual pin normalization with empty legacy `left` compatibility fields; one canonical Communication launcher and `messages` alias; Patient/Team/External scope over existing stores; patient/thread and staff-recipient draft retention through chart changes and expand/redock; cancellation of stale inbox/conversation reads; Results Queue and Document Inbox names over existing practice records. The root no longer mounts `TeamCollaborationDock`; dashboard messaging opens the selected staff recipient in Communication, while its scheduling controls remain. Legacy chart/detached message sections share the patient draft stores as compatibility paths. The primary Overview/Encounter modes and workspace launcher remain intact.

External transports remain disconnected. Email/fax/community fields are explicitly local drafts, not delivery. Authenticated-user-scoped session drafts restore safely; older unscoped communication sessions remain untouched and quarantined because their creator cannot be established. Existing global navigation events and preference hydration remain coupled to companion opening; compatibility aliases must remain until saved clients migrate.

Acceptance is incomplete. An unchanged snapshot of the starting SHA reproduced ASRS, billing containment, calendar interval/custom-hours, capture-tour and care-completion failures before its full run was stopped (10 passed, 6 failed, 1 interrupted, 272 not run). A separate unchanged-baseline resize run failed both widths with Labs +29 px and Calculator +67 px overflow. These are evidence of standing failures, not a full baseline certification or a waiver. Do not move this slice to ROADMAP_COMPLETED until the required gate is resolved. Focused migration evidence and final checks are recorded with the implementation commit.

Local verification: `npm run check` passed (lint/typecheck and 581 unit/service tests); `npm run build` passed. Fifty distinct affected browser scenarios passed across focused runs of shell ownership, Communication, lifecycle, patient-record companions, Team retirement, launcher, prototype containment, draft target, module tabs and all-tool expand/redock. Two old test preconditions were corrected without removing behavioral assertions: search the full roster instead of assuming an unopened patient is in the five recent rows, and explicitly enter Patient scope instead of expecting chart navigation to override restored Team scope. No narrow-width overflow assertion was weakened. A broader affected run still failed the two baseline resize cases. The complete browser gate has not passed. Published CI is a separate authority and must be checked before closure.

Settled synthetic patient/Communication visual evidence was inspected at [1440×900](../output/playwright/d117-shell-1440-1x.png), [1280×800](../output/playwright/d117-shell-1280-1x.png), [1024px](../output/playwright/d117-shell-1024-1x.png) and [200% zoom](../output/playwright/d117-shell-1440-2x.png). Narrow/zoomed presentations use scroll and panel dismissal; no blanket font reduction or shell redesign was introduced.

## Current milestone — funding prototype (D-107)

Owner plan, decided 2026-09-26: build a fully formed, functional prototype of the EHR loop on synthetic data to pitch for funding. **Agents spend no money** — no paid vendors, services, subscriptions, APIs or hosted models without Logan's explicit approval. Paid integrations (DrFirst, EPCS, clearinghouse, production storage/hosting, hosted AI) are built up to their adapter boundary and stay clearly disconnected until funding connects them. AI features are added in the final weeks before the pitch; keep the AI seams intact until then. The production-readiness gate follows funding. Follow this plan rather than re-arguing it; report concrete risks. See [D-107](decisions/D-107.md).

## EHR-first scope firewall — highest execution priority

**Current build target: finish the psychiatric EHR before expanding the broader platform.**

The long-term Clinical Bond vision remains intact, but new product-domain expansion is deferred until the core EHR loop is complete (the D-107 funding prototype first, then production readiness after funding). The active execution loop is:

`Intake -> schedule -> patient chart -> encounter -> note/scribe -> medications/prescribing -> labs/results -> communication -> billing -> follow-up`

Prioritize gaps in that loop, clinical safety, permissions/audit/provenance, reliability, production infrastructure, and the external integrations required to make the loop real. DrFirst/prescribing, controlled-substance/EPCS capability, and clearinghouse transport belong in this path when vendor integration becomes the blocking dependency.

**Scope firewall:** do not start new standalone Analysis, Branding/Growth, HR, Personal/Shared Storage, marketing, or general business-platform slices merely because they appear in the long-term vision. Preserve and repair existing functionality when needed, but defer expansion unless it directly unblocks the EHR loop, security/compliance, production readiness, or a required integration. A new owner instruction may explicitly override this firewall.

This section outranks broader-suite expansion language below when choosing the next roadmap slice.

## Product-scope directive — D-106

Direction confirmed 2026-09-26. Clinical Bond is now explicitly a whole-practice healthcare workspace with the EHR as its authoritative clinical core. Long-term product domains are **Intake**, **Provider / Clinical Home**, **Billing**, **Analysis**, **Branding / Growth**, **HR**, and **Personal + Shared Storage**.

This is a product-direction amendment, **not** evidence that the seven domains are implemented and not permission for a wholesale shell rewrite. Preserve the completed shell migration, existing patient-workspace architecture, companion lifecycle, authoritative domain owners, safety boundaries and working routes. Introduce broader suite capabilities in bounded additive slices with parity and state preservation before retiring any existing access path.

Provider / Clinical Home is the future cross-patient operating center for communication, prescribing, results, notes, telehealth, AI-assisted scribing, analysis, patient homework/teaching, and reviewed billing/coding recommendations. It coordinates existing owners rather than duplicating them. Billing evolves toward claim lifecycle/outlier analysis only when authoritative data and a clearinghouse adapter exist. Analysis is projection, not truth. HR is now a first-class product domain although its current companion implementation remains valid. Personal + Shared Storage requires explicit private/shared authority boundaries.

Planned external integration domains are DrFirst prescribing, appropriate controlled-substance/EPCS capability, and a healthcare clearinghouse. Until configured and evidenced, transport remains refused or explicitly unavailable.

See [D-106](decisions/D-106.md) and PRODUCT_VISION `SUITE-01…08`.


## UI invariants — still binding

The owner-directed shell migration (UI-1 through UI-9) is complete and recorded in ROADMAP_COMPLETED. These rules still govern any further UI work.


- No permanent left navigation rail is part of the target. Home and the always-available `+` on the workspace tab strip are the recovery/open paths for major workspaces.
- The `+` control becomes **Open workspace**, not only **Open a patient chart**. It opens or focuses major workspaces without creating duplicate singleton tabs.
- The completed migration's Home catalog currently reflects **Clinical**, **Billing**, and **Brand**. Under D-106 this is an implemented stage, not the final product taxonomy: Intake, Provider / Clinical Home, Billing, Analysis, Branding / Growth, HR, and Personal + Shared Storage are the long-term domains. HR's current companion remains valid; future suite exposure must be additive and proven.
- Existing Clinical workspaces (Calendar, Patients, Intake, Documents and patient charts) remain valid building blocks. Provider / Clinical Home will coordinate them and other authorized workflows rather than replace their authoritative owners. Website and Social Media consolidate under Branding / Growth.
- Companion/canvas tools include AI, Communication, Tasks, Assessments, compact Calendar, document/form review, Staff/HR, Scratchpad, and Calculators as their implementations mature.
- Companion presentation follows one lifecycle: **minimized/icon -> docked right panel -> expanded main canvas -> redocked -> minimized**, preserving drafts, selected item/tool, patient or recipient binding, filters, scroll, and return path.
- Existing navigation remains available during migration. Each old top-bar entry is retired only after its replacement path is behaviorally verified, keyboard reachable, and covered by focused browser tests.
- Reuse the existing workspace navigation controller, persistent tab ownership, tool registry, and companion state lifecycle. Do not introduce a second router, duplicate workspace store, or parallel tool truth.

## Ordered execution plan — remaining

This is the only ordered delivery queue. The owner can explicitly override scope. Otherwise take the next eligible slice; do not treat all work here as one giant change. Finish and report a bounded slice before taking another. A slice may use several coherent commits, but it is not complete until its acceptance gate is satisfied.

| Order / ID | Deliverable | Dependency / exit condition | Current state |
| --- | --- | --- | --- |
| P9/P10/P11, P12 | Financial truth, portability, production gates; full synthetic clinic day | External/PHI gates remain binding; broad AI expansion follows P12 | Partial / deferred as described below |

CB-0 through CB-5a, and the later CB-0a and CB-0b baseline repairs, are verified complete. The owner-directed shell migration ran UI-1 through UI-8 in order and **all eight are done**. CB-6, the companion lifecycle gate, is verified complete (2026-09-27). CB-7, the manual encounter loop and recovery matrix gate, is verified complete (2026-09-27). P6, operational queue resolution and truthful message composer/triage, is verified complete (2026-09-27). Remaining P7 work may proceed toward the D-107 prototype without bypassing the production/PHI gates.

## Open defects and follow-ups

- **CI review gate failed (2026-10-06):** [run 37515293293](https://github.com/Logancarton/EHR/actions/runs/37515293293) on `3220831` reported 64 failed / 282 passed in browser verification. REVIEW-RECOVERY-GATE-1 repaired the eight recovery cases locally; clinical-context/live cases still need migration from retired primary section tabs. Logs also confirm billing containment expects fee setup on the workflow page. These are identified causes for those cases, not attribution for all 64. Keep remaining failures open and repair each behavioral gate without weakening clinical assertions. Unit/build and focused recovery/date checks passed locally; full CI is not certified.

- **Review repairs remaining limits (REVIEW-IMPROVE-1 / D-125, 2026-10-06):** The thirteen review questions are addressed by the verified repairs in ROADMAP_COMPLETED. Chart recap is a bounded, sourced record projection, not full longitudinal synthesis. Medication-versus-lab intent validation is lexical containment, not semantic certainty. The searchable medication catalog remains limited to 11 prototype entries. The working cart is patient-bound local drafts, not encounter-attributed authorized order history. Existing databases retain the old synthetic task/allergy seed values; no clinical rows were silently rewritten. Legacy communication components remain imported/tested with empty inbox fixtures; archived examples are non-authoritative. Full browser/CI/P12 and cross-browser certification remain open.
- **RECOVERY-1 follow-up:** recovered prescribing/signing/date/companion workflows are locally verified; evidence is in ROADMAP_COMPLETED. Full browser/CI and SHELL-OWN-1/P12 certification remain open. The integrated 50-case run had two setup failures (connection reset and restoration navigation timeout), both passing unchanged on focused rerun; their environmental cause is not established. Per-spec/file browser data isolation is the next bounded reliability repair before the full synthetic clinic day.
- **Clinical date migration remains partial:** the shared date helper and migrated chart/history/monitoring surfaces plus Intake follow-up/outreach/note displays use the practice clock (REVIEW-INTAKE-DATE-1), but direct locale formatting elsewhere and UTC-day calculations in coverage/practice queues still need audit. Organization-specific timezone configuration is not implemented. Preserve date-only and floating-wall-clock semantics when migrating remaining callers. *(RECOVERY-1 / D-049.)*

- **Patient record tools (PAT-RAIL-1 / D-116):** legacy saved sections and detached-pane navigation remain supported. Clinical AI/assessment keep their existing foreground gates. Local unstaged lab forms end on tool close. Full browser-suite/P12 certification and cross-browser testing remain open; the shared synthetic browser database can accumulate prior test edits. No new vendor transport was enabled.

- **Live Encounter follow-up (ENC-LIVE-2):** ENC-LIVE-1 provides the deterministic capture/review foundation, typed guidance and evidence-backed coverage. Semantic live generation, adaptive domain relevance, sensitive-interpretation suggestions, richer motor observation detail, and production ambient transport remain deferred. The current renderer quotes evidence, corrections require an explicit section, and independent panes rely on revision conflicts rather than a capture lease. Replace the live renderer through the existing scribe boundary with guidance precedence and evidence-provenance validation before claiming semantic psychiatric scribing.

Leftovers named by completed work. Evidence for each is in [ROADMAP_COMPLETED.md](ROADMAP_COMPLETED.md) under the slice named.

- **Encounter cockpit follow-up (ENC-CTX-2):** ENC-CTX-1 establishes deterministic context in the existing rail. Next, compare authoritative medication versions for exact additions, discontinuations and dose changes; current snapshots only establish update date and present status. Same-day changes need an authoritative encounter-time cutoff before they can be included. Controlled prior-plan insertion, in-Encounter vitals/measure recording and individual result review remain deferred; existing chart review paths are retained. Monitoring and snapshot reads are independent projections, and cross-browser updates require focus/manual refresh.

- **Overview safety-plan status has no authoritative read contract.** PAT-OV-2 removed inferred “Active on file”/“Low risk” claims and links to source documents. A future dedicated status must come from a reviewed, patient-bound source with date/provenance; absence of assessment flags cannot establish it. *(PAT-OV-2; PAT-OV-5 exposes dated C-SSRS and safety-history records but does not supply a clinician risk formulation or reviewed safety-plan contract.)*
- **Overview order completion is not a fulfillment contract.** PAT-OV-5 identifies lab orders without a linked final observation and displays exact recorded order status. A single linked result cannot establish that every panel analyte is complete/reviewed. Do not promote this projection to a complete/pending fulfillment assertion without the owning lab-order contract.

- **Browser tests share one mutable database.** Any spec can write into the practice every later spec reads; `synthetic-visit` is intermittent under full-suite load. Isolating the database per spec or per file is the next bounded repair. *(Validation history; CB-0b / D-091.)* On 2026-09-26 a full run in the cloud workspace (preinstalled Chromium, icon font unreachable) had 22 failures common to `bc31d56` and CB-6c: `dashboard-preview` ×8, `ui-system` ×5, `patient-administration` ×3, `workspace-module-tabs` ×2, and one each in `capture-ui-tour`, `care-completion`, `tool-navigation` and `workspace-ergonomics`. Most time out at sign-in with the workspace still "restoring". They are not attributed one by one yet.
- **Standing browser failures last recorded 2026-09-25 (BILL-WF-1 run, 200 passed / 8 failed):** `workspace-module-tabs` ×2 (click the top-bar "Intake" removed by UI-8), `ui-system` "Workspace layout" (Preferences copy changed by MON-1), `companion-ai` patient-switch target label, and `tool-navigation` CB-3 (duplicate "Jordan Reed" week-view rows). Seen again 2026-09-27 during CB-6, failing identically on the unchanged baseline: `workspace-layering` "the note region isolates its own chrome" (Review & Sign opens no `.modal-backdrop` for Maya Chen's encounter in the shared database). Also failing identically on `867293f` (2026-09-27): `synthetic-visit` (an expected element is not found) and `capture-ui-tour`. `synthetic-visit` is CB-7's baseline visit path, so CB-7 starts by diagnosing it. Each is attributed as not caused by the slice that observed it; none is repaired. UI-8 was verified per spec, not by a full-suite run.
- **Validation pending:** PAT-OV-1, MON-1, PAT-HDR-1 and PAT-HDR-2 are recorded as "implemented, validation pending" with push CI as the authority. Confirm CI and record the result.
- **Prescribing queue cannot yet be exercised.** Two prerequisite slices, neither authorized yet: (1) a product surface for enabling an integration (`IntegrationConfigurationService` has no API route or UI); (2) the adapter must declare it cannot transmit, and the health projection must surface that, so the queue never shows "Integration ready" for the placeholder. Until then the detail pane, patient-context gate, retry and evidence forms stay unexercised. *(UI-7d / D-092 / D-093.)*
- **Duplicate creates are only stopped in the browser.** CB-6e stops a second press while a task, note or message save is in flight, but two tabs, or a network retry of a request that did succeed, can still create a duplicate. Needs a client-generated idempotency key the create routes honour. Messages matters most, because it reaches a patient. *(Found in CB-6e.)*
- **Companion pop-out is not supported.** CB-6's "supported detach" is expand/redock only; no companion tool can be torn off into its own window. Add a pop-out only if a clinician workflow needs one. Calendar's expand opens the full Calendar workspace rather than an expanded canvas, by design. *(Named at CB-6 closure.)*
- **Escape outside the layer stack.** CB-6f put the companion, modules, the Open-workspace launcher, the add-tool menu and the omnibox/home AI cards on one Escape stack in `app/lib/use-dismissible.ts`. About thirty other components (calendar editors, schedule modals, dashboard windows, care-completion dialogs, encounter menus) still add their own Escape listeners. Most sit inside `role="dialog"`, which the stack already defers to. Any that do not can still act on the same press as a stack layer; move them to `useDismissible` or `markEscapeHandled` as they are touched. *(Carried from CB-6f.)*
- **AGENTS.md HR rule contradicts D-106.** AGENTS.md's drift rules still say HR "is not a Home or major `+` app", while D-106 amended that rule and the launcher lists HR. The agent could not edit AGENTS.md (permission refused), so the owner should reconcile the wording. *(REVIEW-FIX-1.)*
- **Sign-in persona labels are inconsistent** ("Prototype provider" beside "Taylor · Provider"). The browser suite matches these names exactly (`signInDevelopmentUser`), so renaming them needs the specs updated in the same change. *(REVIEW-FIX-1.)*
- **Recovery after replacing the synthetic database:** REVIEW-RECOVERY-1 now reports an unconfirmed/missing server draft immediately and retains local text plus the old conflict token. Automatically recreating or rebasing that note is deferred: it needs an explicit clinical recovery action and an authority decision, rather than silently discarding the revision guard. Failed reads without a cached server revision and dirty recovery reconciliation remain follow-up review coverage.
- **The global inbox omits intake-contact threads** (`getAllThreads` joins `patients`). An intake conversation is reached from the Intake canvas until promotion. Add it to the inbox only if the owner wants one practice-wide inbox. *(MSG-INTAKE-1 / D-112.)*
- **Intake crowded queue labels:** at 1024px with a selected detail pane, a long synthetic prospect name and the prospective badge can crowd the completion count and extend past the queue card. Review wrapping through the existing card layout, preserving name and readiness information. *(REVIEW-INTAKE-DATE-1 screenshots.)*
- **The Intake detail pane covers the companion rail.** With a queue item open, the rail was not reachable until the detail closed. *(MSG-INTAKE-1.)*
- **Clicking a prospect's name on the Intake queue creates a chart** (after the duplicate check) with no confirmation step. This is deliberate in `openSubjectChart`, but chart creation is durable, so consider a confirm. *(MSG-INTAKE-1.)*
- **Note:** the ambient scribe is two scripted demonstration scenarios, and the deterministic reference matcher's proposals are labelled "AI extracted" although no model is involved; a coverage member ID cannot be edited in place. *(NOTE-READY-1 / BILL-1.)* Under D-107, AI features are added in the final weeks before the pitch.
- **Front desk reading patient-chart message threads:** today front desk staff (`role: staff`, no `read_clinical`) may initiate a patient-chart message thread but cannot read incoming patient replies per D-051. Decision pending on whether to allow front desk to read non-clinical administrative threads or route patient replies to an administrative queue. *(TEAM-SCOPE-1.)*
- **Clinical assistant patient messaging permissions:** today clinical assistants (`role: clinical_assistant`) carry `read_clinical` but lack `send_message`, so Compose and Send are disabled in the UI. Decision pending on whether clinical assistants should be granted delegated messaging authority to send/reply to patients. *(TEAM-SCOPE-1.)*

## Shared completion and visual verification rules

- **Baseline and evidence:** record starting/resulting SHA, affected requirement/slice IDs, exact checks and outcomes, and unresolved blockers. Runtime slices require `npm run check`, `npm run build`, and affected browser behavior; CB-0/CB-7 run the complete browser gate. Inspect CI for the published commit and distinguish pending/skipped/failed from passed.
- **Visual matrix:** review 1440x900 and 1280x800; check 1024px width and 200% zoom for reachable navigation, controls and readable content. Include Home, a patient pane, and relevant companion/overlay states. Use synthetic data at empty, typical and crowded volumes. Preserve visible labels, focus, keyboard alternatives and non-color status cues. Keep screenshot evidence for the changed flows using the repository test-artifact conventions.
- **No loss inventory:** every removed block/control must have its unique information/action mapped to a retained reachable location. Minimalism is not smaller fonts, more hidden critical state, or deleted functionality.
- **Verification depth:** source scans supplement behavior tests; they do not prove grounding, readable contrast, state retention or authoritative delivery. Test the UI entry point as well as the owning service where risk requires it.
- **Status vocabulary:** `Not started` -> `In progress` -> `Blocked` or `Verified complete`. Code merged with a failing required gate remains incomplete. When closing a slice, add completion SHA, test/CI evidence, visual evidence where relevant, and the remaining scope. Archive long implementation diaries; retain this contract and a compact result.
- **Publication:** work directly on current `main` unless the owner requests otherwise. Fetch again, integrate concurrent changes, and never force-push. Do not mark a runtime slice complete in a documentation-only commit.

## Phase work and gates retained

### P5 — Finish and certify the AI-independent encounter loop

Status: **Verified complete — certified by CB-7 (2026-09-27)**

The core encounter mechanics and browser recovery matrix are certified: appointment-bound opening, autosave/revision protection, immutable signing/reference freeze, deterministic/manual coding support, authoritative signed-history reads, append-only corrections, and the complete browser recovery matrix (patient switch, detach/redock, refresh, close/reopen, failed save/retry, late response, revision conflict, and signing while save is pending). Verified without AI dependency.

### P6 — Finish operational queues and related-object workflows

Status: **Verified complete (2026-09-27)**

Audit and resolution of the operational queues (Inbox/Messages, Tasks, Results, Prescribing operations) under the unified pattern:
`queue item -> source object -> patient context -> related evidence -> authorized action -> authoritative resolution -> return path`

Resolved items:
- Companion and global inbox row clicks navigate to chart with targeted thread focus and live event dispatch (`ehr-select-message-thread`).
- Replaced dead-end "＋ Compose" toast button with an accessible, modal-backed thread composer executing authoritative `create_message_thread` gateway action with audit logging.
- Labelled Ambient AI triage truthfully as a D-107 prototype sample scenario rather than live AI model inference.
- Added direct follow-up clinical task creation (`+ Task`) to abnormal and critical lab results in `GlobalLabsWorkspace.tsx` with due-date selection.
- Added quick due-date assignment selector ("Today", "Tomorrow", "1 week", "No due date") in `PracticeTaskQueue.tsx`.

## Deferred feature expansion

Variable Calendar density, new drag/drop or resize scheduling, broad chart routing changes, icon-only system tabs, and major model/agent expansion are not part of the CB cleanup sequence. Calendar density/snapping may be scoped later with an explicit geometry contract covering crowded slots, time positioning, creation/drop/resize increments, accessibility and regression tests; preserve the existing quarter-hour implementation in the meantime. Icon-only system tabs are not the accepted default.

Continue P6/P7 and the P9/P10/P11 foundations through their phase gates after the ordered corrections and P5 certification. P12 remains a full synthetic day-in-the-clinic acceptance gate; major hosted-model expansion follows it rather than compensating for incomplete direct workflows.

## Dependencies and gates

- P5 recovery certification depends on authoritative encounter persistence already in place; it does not depend on external vendors.
- P6 internal workflows should be correct before external communications/lab transports are connected.
- P7 patient self-service requires a distinct patient identity/access model; clinician/staff session authority is not reusable for that purpose.
- P8 external integrations proceed only with contracted/official interfaces, explicit access, and testable authenticity/correlation requirements.
- P9 live claim/remittance/denial/balance work requires a selected clearinghouse/payment authority and must not infer payer success or money from absence.
- P10 import treats external records as evidence until reviewed/reconciled into authoritative internal truth.
- P11 production infrastructure and security review are blocking before real PHI.
- P12 is the product-level acceptance gate before major hosted-model/agent expansion.

## Deferred or externally blocked

- **DrFirst live prescribing/EPCS:** deferred by D-037 until contract/onboarding/interface details exist. D-028 remains the selected planned vendor decision.
- **Live lab, communications, reminders, eligibility/payment, and clearinghouse transports:** blocked until a real provider/vendor and verified interface are selected.
- **Hosted-model reference extraction / broad agentic expansion:** defer until the manual authoritative workflows and P12 acceptance path justify it.

## Roadmap maintenance rules

- This file holds unfinished work only. Finished work moves to [ROADMAP_COMPLETED.md](ROADMAP_COMPLETED.md) in the same commit that finishes it, following *How this file works* above.
- Older delivery evidence and superseded queue snapshots remain in [the roadmap archive](archive/roadmap/ROADMAP-through-2026-09-19.md). Never delete useful rationale solely to shorten a file; move it.
- Use stable IDs such as P5-B, P7-F, DB-10, RL-A and D-072 instead of brittle numbered-section references.
- Do not duplicate the active queue in AGENTS, ARCHITECTURE, HANDOFF or ADR bodies.
- When an architectural or product decision changes, update the ADR index and record; when implementation status changes, update this file and ROADMAP_COMPLETED.
- For docs-only changes, validate links, structure and the diff, and report application tests and builds as not run.
