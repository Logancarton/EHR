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

1. **CB-6** — finish the companion lifecycle gate (in progress).
2. **CB-7** — certify the complete manual encounter loop (P5), the clinical certification gate.
3. Then P6/P7 and the rest of the loop toward the D-107 funding prototype.

The owner may reprioritize at any time; an owner instruction outranks this list.

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
| CB-6 | Consistent companion containers | Draft/context lifecycle survives dock/expand/pop-out | In progress — AI viewport repair verified; broader lifecycle gate pending |
| CB-7 | Certify the complete manual encounter loop (P5) | Recovery matrix and synthetic reopen/amendment path pass | Not started — baseline unblocked |
| P6, P7 | Queue resolution and remaining intake/forms | Continue the phase gates below after CB-7, or bounded independent work explicitly scoped | Existing foundations; gates open |
| P9/P10/P11, P12 | Financial truth, portability, production gates; full synthetic clinic day | External/PHI gates remain binding; broad AI expansion follows P12 | Partial / deferred as described below |

CB-0 through CB-5a, and the later CB-0a and CB-0b baseline repairs, are verified complete. The owner-directed shell migration ran UI-1 through UI-8 in order and **all eight are done**. CB-6 remains the companion lifecycle acceptance contract and is exercised through UI-3/UI-4 rather than skipped; CB-7 remains the next clinical certification gate after the bounded shell migration or when the owner explicitly reprioritizes it. Bounded P6/P7 work may proceed when explicitly scoped, but it must not bypass P5/CB-7 or the production/PHI gates.

### CB-6 — Normalize companion presentation and lifecycle

Status: **In progress — AI viewport repair verified; broader lifecycle gate pending**

**2026-09-20 owner-requested screen-fit repair (baseline `dcee02d`):** The AI panel used an unstyled container class and relative 100%-height positioning, consuming a full-width workspace row. Restored the existing `.companion-panel` geometry and measured chrome offset, with a scrollable body and anchored context header/composer. Calendar retains its full height and independent time-grid scrolling; the rail, Close control and input remain reachable. This advances NAV-01/NAV-02, VIS-07 and RIGHT-05 without changing clinical state or the companion controller.

- **Browser evidence:** four viewport cases (1440×900, 1280×800, 1024×768, and 720×450 as the 200%-zoom equivalent) plus the existing AI planner/context-isolation test passed, **5/5**. Tests exercise actual wheel scrolling, unchanged calendar height, complete input/Close visibility, draft retention during scrolling, and closing the overlay. Reinstating the old component made the new 1440×900 regression fail: opening AI consumed 490.89px of calendar height. Screenshots were visually inspected under `test-results/screen-fit-evidence/` (ignored artifacts).
- **Validation:** production build, typecheck and lint passed (existing lint warnings remain); final Node suite **394/394**. This runtime blocked the `tsx` CLI's IPC socket, so the same suite ran with `node --import tsx --test tests/*.test.ts`. The browser CDN was unavailable; local verification used Chromium 153 and a locally supplied Material Symbols font through a temporary test harness, with no runtime dependencies or harness committed. CI retains the repository's normal browser configuration.
- **Observed baseline risks:** an initial unit run intermittently failed the existing weight-change assertion (vitals group by timestamp); its focused recheck and final full suite passed. A run overlapping browser verification also hit the generated `next-env.d.ts` hygiene check; restoring that generated file and running sequentially passed. Neither clinical logic nor assertions were changed for this presentation repair.
- **Still pending:** complete CB-6 lifecycle certification across other tools, expand/pop-out/redock, persistence failures and draft/context continuity. This repair does not certify all of CB-6.

**2026-09-25 CB-6b owner-directed companion review ([D-102](decisions/D-102.md), baseline `b6a3733`):** fixes the owner's review items 1, 2, 4, 5 and 6, plus item 3's hover-only labels (the owner declined persistent labels, grouping, and the Customize-rail menu).

- **Safety:** the PHQ-9 opened with nine hard-coded answers keyed 0–8 against questions 1–9, so it rendered as a complete 10/27 score for every patient and Save to Chart would record it. Scales now start blank, are keyed per patient and instrument, and show "N of M answered" with Insert and Save disabled until complete.
- **Layout:** above 1080px the chart shrinks to make room for the panel; at 1080px and below it floats. Checked at 1366×800 with Calculators open: Review & Sign, Visit readiness, and Orders / More / Open encounter all stay visible. Checked at 1000×760: the panel is an overlay.
- **Frame:** every companion surface (AI, parked AI, Scratchpad, Tasks, Calculators, Prescribing, Labs, HR, Calendar, Messages, Communication) render through `CompanionPanelFrame`. Communication's six channels and staff chips wrap instead of scrolling behind visible scrollbars. Labs shows the patient in one identity line (plus the picker) instead of four places. Prescribing's Refresh and empty-state text now use the shared styles. Calculators and Scratchpad can expand.
- **Scratchpad:** notes show their patient or "Practice note — no patient" and are filtered to the open chart.
- **Dashboard:** Outstanding Work is a compact one-row-per-item list with the action at the right. Side-by-side half-width windows end on the same line. Vital-sign readings in the lab queue read "Vital-sign reading to acknowledge".
- **Validation:** typecheck and lint pass (existing warnings remain). Production build passes. Node suite passes except `repository-hygiene`'s `next-env.d.ts` check, which fails only because a concurrently running browser-suite server had already rewritten that file in the working tree. Twenty affected browser spec files (111 tests) were run; after one fix (the scale switcher's `role="tab"` hid it from `getByRole("button")`), everything passes except the following. `companion-ai` (expects the AI panel to retarget on a tab switch, which contradicts D-098 parking) and `ui-system` "layout controls inside Preferences" (expects old copy) fail identically on untouched `b6a3733`. `visit-readiness` failed once inside a long run and passed alone on a fresh database, so it is order-dependent state, not this change.
- **Remaining gaps:** the lab queue still counts vital-sign readings in the Labs badge and filter, because the seed stores them as laboratory observations; the correct fix is to seed them as `vital-signs`. Existing dev databases keep untagged seed notes. CB-6 lifecycle certification (pop-out, persistence failure, refresh continuity) is still pending.

**2026-09-25 STORE-1 owner-directed storage hardening ([D-103](decisions/D-103.md), baseline `ac630d2`):** closes the gaps CB-6b left open.

- **Vitals vs labs:** the three seeded office blood pressures are vitals now (new seed plus migration `2026-09-25-001`, converted in place with provenance). `add_observation` refuses vital signs and unknown categories, and the API validates its payload strictly. The Labs section has *Record result* and *Record vitals*, and a vital sign typed into the lab form is redirected to the vitals form. The vitals form now closes on Escape and returns focus to whatever opened it.
- **Found and fixed:** the chart snapshot's 100-row cap shared rows with vitals (up to seven rows per entry), so Maya Chen's Labs section showed "No prior lab results" on the dev database. Snapshot `observations` now exclude vitals. Care-completion's result-review rule compared against `"lab"` while storage writes `"laboratory"`, so it never fired for real results.
- **Scratch notes:** moved from `tasks` to `scratch_notes` (migration `2026-09-25-002`) with an author and a practice. They were previously served to every user of every practice. Authors are taken from audit events, and the seed memos are tagged to Maya Chen. Notes show a real timestamp.
- **Validation:** typecheck and lint pass (existing warnings only). Production build passes. Node suite 477 of 478; the one failure is `repository-hygiene`'s `next-env.d.ts` check, caused by another session's browser-suite server rewriting that file. New `tests/observation-and-scratch-storage.test.ts` (6 tests) covers the category rules, the legacy upgrade of both migrations, fresh seeding, author privacy, snapshot separation under 20 vitals, and the care-completion spelling. Browser: 79 of 79 across ten affected specs, plus the new `lab-result-entry.spec.ts`. Checked in the running app: the dev database migrated on reload, Maya's BMP and TSH are back in Labs, the Labs badge went from 14 to 11, and the scratch memos show Maya Chen.
- **Remaining gaps:** the omnibox's local answers and the medication truth panel still read fixtures (now `fixtureMonitoringEvidence`). There is no edit or entered-in-error path for a hand-entered result yet.

**2026-09-25 NOTE-SAFE-1 owner-directed review fixes ([D-104](decisions/D-104.md), baseline `fdabb4f`):** fixes what a review of the Gemini dossier screenshots found in the running app.

- **Safety (verified in the running app):** every new note opened with a normal MSE that said "no … suicidal ideation" and quoted the patient. It was autosaved and marked *Safety & Suicidality Assessed — done* on an empty Risk Assessment. New notes now start blank, and **Insert normal exam** fills blank rows only when clicked. Safety closes only when the Risk Assessment is written. Unsigned drafts lose the old default on load, and migration `2026-09-25-003` clears it at the source with provenance; signed notes are untouched. The chief complaint starts blank.
- **Safety flags:** the Overview and the note share `currentSafetyFlags` (latest administration per instrument). Maya's superseded March item-9 flag no longer shows as unresolved. A current flag is the note's first item and "Next gap" until the Risk Assessment is written. If safety history cannot be read, the panel says so.
- **Timing:** the first reference read for a not-yet-saved draft returned 404 and showed "Linked records could not be refreshed". A 404 is now "not yet applicable", and the read re-runs on the first acknowledged save. Seen in the running app: 404 → 200 with no warning.
- **Dates:** added `toCalendarDate`, `formatCalendarDate` and `formatDateWithAge`. Overview cards show date and age ("Aug 12, 2026 · 6 wk ago"). The timeline sorts on calendar dates; it used to string-sort "Sep 24, 2026" against "2026-09-25". Care-completion and monitoring details no longer print raw ISO timestamps. *Next visit* ignores past-dated bookings; it had shown a Sep 22 visit on Sep 25.
- **Counts:** dashboard queue chips counted only the 8-item priority sample ("Labs (5)" beside a rail badge of 11). The chips now count the whole queue, a category chip lists all of its items, and the priority view says "8 of N shown". The dashboard and the rail badge share `groupUnacknowledgedLabsByOrder`, and the badge reads "lab orders to review".
- **Schedule:** a booked visit more than 10 minutes past its start with no check-in counts as **Late**, not Upcoming. There is a Late chip, and the briefing says who is late.
- **Billing:** drafts no longer default to CPT 99214 / "Moderate Complexity". Template badges read "Usually 99214 · MDM decides". The readiness item no longer promises a code.
- **Labs companion:** no test or indication is preselected. Staging needs both, and the catalog no longer says the metabolic panel is "required annually" for every patient.
- **Found during verification:** `EncounterRepository.getByPatient` ran `ORDER BY date` on display dates ("Sep 25, 2026"), which sorts alphabetically, so Maya's *Last visit* read May 19 instead of Aug 12. It now sorts by calendar date. The billing metric note was clipped mid-word by the global single-line `.metric-sub`. The capture script took 05 and 05b from the same view and left a stale query in the omnibox for every screenshot.
- **Validation:** `npm run check` passes (488/488; lint has no errors, and the touched files have the same warning counts as `fdabb4f`). `npm run build` passes. New `tests/note-safety-defaults.test.ts` (10 tests) covers the blank note, the keyword-proof safety goal, the legacy scrub, the normal-exam insert, current flags, flag-first readiness, unreadable safety history, date formatting, the migration and encounter ordering. The full browser suite ran 201 passed and 6 failed. The same 6 fail on untouched `fdabb4f`: `care-completion` ×3 (fixture appointment POST rejected), `companion-ai` and `ui-system` (already recorded under CB-6b), and `workspace-module-tabs` ×2. On a fresh `test-results/browser-ehr.db`, `care-completion`, `synthetic-visit`, `asrs-assessment` and `tool-navigation` pass alone, so part of the suite depends on accumulated state; CI has failed on every recent push to `main`. Dossier screenshots were recaptured on a fresh database and each caption re-checked against its image. Checked in the running app on the review database: the Maya note (including the migration clearing a legacy draft), Overview, dashboard and Labs companion.
- **Remaining gaps:** clearing browser storage starts a second same-day draft instead of resuming the server draft; this is existing behavior, seen during verification. Safety has no structured risk record yet. A scenario-sourced chief complaint on an existing draft is kept.

**Requirements:** RIGHT-01 through RIGHT-05, PAT-04, SAVE-06, WIN-09, TRUST-02.

**Inspect:** `app/components/DynamicSidebar.tsx`, `app/lib/use-companion-rail-controller.ts`, `app/lib/use-companion-working-data.ts`, `app/components/team/TeamCollaborationDock.tsx`, companion panels, existing floating-window/navigation controllers, and semantic stacking tokens.

- Reuse the existing companion controller and container to provide consistent header, title/context, close, expand and supported pop-out/redock behavior. Keep full workspaces for larger jobs; unify presentation without merging unrelated domain state.
- Keep the right icon rail and underlying primary controls reachable. Implement responsive width/overflow using existing geometry ownership rather than ad hoc z-index increases.
- Preserve draft text, explicit patient/recipient target, scroll, selected tool and return path through container changes. State belongs to existing feature lifecycles, not a duplicate wrapper store.
- Apply CB-2 readiness and preview containment identically in docked and full views. Merely changing active patient must not retarget a pending message/order/proposal.

**Verify:** schedule, AI, scratchpad, tasks, assessments and communication tools; open/close, tool switch, expand, supported detach/redock, Escape/focus return, patient change, resize, refresh and failed persistence. Reuse `calendar-companion-panel`, `rail-personalization`, `workspace-layering`, and window-lifecycle browser coverage.

**Accept:** consistent presentation and state continuity with no obscured rail, wrong-target action, lost draft, or new navigation owner. **Exclude:** generic window-manager rewrite or imposing one mandatory layout on every user.

### CB-7 — Close P5 with an end-to-end manual encounter gate

Status: **Not started — browser baseline unblocked; follows CB-6**

**Requirements:** TAB-03, WIN-09, PAT-01/06, RIGHT-04, SAVE-01 through SAVE-08; existing encounter/legal-record ADRs.

**Inspect/reuse:** existing encounter save/signing/revision controllers, `tests/encounter-save-lifecycle.test.ts`, `tests/encounter-draft-revision.test.ts`, `tests/signed-encounter-integrity.test.ts`, `tests/browser/synthetic-visit.spec.ts`, `tests/browser/workspace-reliability.spec.ts`, and window lifecycle coverage.

Run one synthetic appointment through open -> document -> autosave -> review/coding -> explicit sign -> reopen signed history -> append amendment. Verify appointment/patient/encounter identity throughout and that signed snapshots remain immutable. AI must not be required to complete any step.

Complete a browser recovery matrix for patient switch, detach/redock, refresh, close/reopen, failed save/retry, late response, revision conflict, and signing while save is pending. Verify visible unsaved/saving/saved/failed/signed states and that no unconfirmed save is reported as durable. Fix only demonstrated gaps; do not rebuild existing encounter mechanisms.

**Accept:** the P5 exit gate below passes with reproducible evidence and no lost work, wrong-patient writes, or mutation of signed content. Remaining external prescribing/lab/communications work stays explicitly separate from the local encounter result.

## Open defects and follow-ups

Leftovers named by completed work. Evidence for each is in [ROADMAP_COMPLETED.md](ROADMAP_COMPLETED.md) under the slice named.

- **Browser tests share one mutable database.** Any spec can write into the practice every later spec reads; `synthetic-visit` is intermittent under full-suite load. Isolating the database per spec or per file is the next bounded repair. *(Validation history; CB-0b / D-091.)*
- **Standing browser failures last recorded 2026-09-25 (BILL-WF-1 run, 200 passed / 8 failed):** `workspace-module-tabs` ×2 (click the top-bar "Intake" removed by UI-8), `ui-system` "Workspace layout" (Preferences copy changed by MON-1), `companion-ai` patient-switch target label, and `tool-navigation` CB-3 (duplicate "Jordan Reed" week-view rows). Each is attributed as not caused by the slice that observed it; none is repaired. UI-8 was verified per spec, not by a full-suite run.
- **Validation pending:** PAT-OV-1, MON-1, PAT-HDR-1 and PAT-HDR-2 are recorded as "implemented, validation pending" with push CI as the authority. Confirm CI and record the result.
- **Prescribing queue cannot yet be exercised.** Two prerequisite slices, neither authorized yet: (1) a product surface for enabling an integration (`IntegrationConfigurationService` has no API route or UI); (2) the adapter must declare it cannot transmit, and the health projection must surface that, so the queue never shows "Integration ready" for the placeholder. Until then the detail pane, patient-context gate, retry and evidence forms stay unexercised. *(UI-7d / D-092 / D-093.)*
- **Escape arbitration between layered surfaces.** One Escape press can both redock an expanded companion and close a module underneath. Needs one shared "topmost layer answers first" rule in `app/lib/use-dismissible.ts`. *(Deferred from UI-7b.)*
- **`TeamCollaborationDock` consolidation** into the Communication companion, with the dashboard/Team decomposition. *(Deferred from UI-5.)*
- **Billing:** the Workflow view has not yet replaced either Charges table; a missing diagnosis on an already-signed encounter has no in-product fix except voiding. *(BILL-WF-1 / D-105.)*
- **Note:** the ambient scribe is two scripted demonstration scenarios, and the deterministic reference matcher's proposals are labelled "AI extracted" although no model is involved; a coverage member ID cannot be edited in place. *(NOTE-READY-1 / BILL-1.)* Under D-107, AI features are added in the final weeks before the pitch.

## Shared completion and visual verification rules

- **Baseline and evidence:** record starting/resulting SHA, affected requirement/slice IDs, exact checks and outcomes, and unresolved blockers. Runtime slices require `npm run check`, `npm run build`, and affected browser behavior; CB-0/CB-7 run the complete browser gate. Inspect CI for the published commit and distinguish pending/skipped/failed from passed.
- **Visual matrix:** review 1440x900 and 1280x800; check 1024px width and 200% zoom for reachable navigation, controls and readable content. Include Home, a patient pane, and relevant companion/overlay states. Use synthetic data at empty, typical and crowded volumes. Preserve visible labels, focus, keyboard alternatives and non-color status cues. Keep screenshot evidence for the changed flows using the repository test-artifact conventions.
- **No loss inventory:** every removed block/control must have its unique information/action mapped to a retained reachable location. Minimalism is not smaller fonts, more hidden critical state, or deleted functionality.
- **Verification depth:** source scans supplement behavior tests; they do not prove grounding, readable contrast, state retention or authoritative delivery. Test the UI entry point as well as the owning service where risk requires it.
- **Status vocabulary:** `Not started` -> `In progress` -> `Blocked` or `Verified complete`. Code merged with a failing required gate remains incomplete. When closing a slice, add completion SHA, test/CI evidence, visual evidence where relevant, and the remaining scope. Archive long implementation diaries; retain this contract and a compact result.
- **Publication:** work directly on current `main` unless the owner requests otherwise. Fetch again, integrate concurrent changes, and never force-push. Do not mark a runtime slice complete in a documentation-only commit.

## Phase work and gates retained

### P5 — Finish and certify the AI-independent encounter loop

Status: **Active phase; next certification is CB-7**

The core encounter mechanics already exist: appointment-bound opening, autosave/revision protection, immutable signing/reference freeze, deterministic/manual coding support, authoritative signed-history reads, and append-only corrections.

The remaining work is to audit and close the P5 exit gate rather than rebuild those foundations:

- verify the direct documentation UX against P5-B;
- complete the browser recovery matrix for patient switching, detach/redock, refresh, close/reopen, failed save/retry, late response, revision conflict, and signing while save is pending;
- verify visible unsaved/saving/saved/failed/signed states;
- run the full synthetic no-AI encounter path through reopen and amendment.

Exit gate: a synthetic psychiatric encounter can be started, documented, recovered, reviewed, signed, reopened, and amended without AI and without losing patient context.

### P6 — Finish operational queues and related-object workflows

Status: **Existing foundations; follow the ordered plan, with explicitly scoped independent work allowed**

Audit the existing inbox/messages, tasks, results, document workflow, prescribing operations, and shared queue shells against one pattern:

`queue item -> source object -> patient context -> related evidence -> authorized action -> authoritative resolution -> return path`

Do not create duplicate dashboards or a second clinical/workflow truth system. Care Completion and Dashboard windows are projections over the owning records, not replacements for the queues.

Exit gate: clinician/staff users can work the major operational queues to resolution without dead ends or fabricated empty/success states.

### P7 — Complete forms, consents, assessments, and patient-facing intake

Status: **Active / foundation implemented**

D-073 through D-078 materially advanced staff-facing Intake. The remaining P7 work is now narrower and more explicit:

- versioned editable form-definition lifecycle and practice-facing form configuration;
- stronger initial-intake content using the general form model;
- assessment launch/completion/review integration with Intake;
- legally appropriate signature/capture workflow and versioned practice-authored consent content;
- distinct patient-facing authentication/authorization and self-service boundary;
- vendor-backed eligibility/payment adapters only when selected;
- binary/object-backed document capture and review; OCR/extraction only as reviewed evidence, never silent truth;
- practice-configurable readiness requirements and reminder/escalation behavior.

P7-F patient authority is a hard boundary: do not expose clinician APIs to patients by hiding controls.

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
- **Patient portal/self-service:** not blocked on a vendor, but blocked on designing and implementing its separate patient authority boundary.

## Roadmap maintenance rules

- This file holds unfinished work only. Finished work moves to [ROADMAP_COMPLETED.md](ROADMAP_COMPLETED.md) in the same commit that finishes it, following *How this file works* above.
- Older delivery evidence and superseded queue snapshots remain in [the roadmap archive](archive/roadmap/ROADMAP-through-2026-09-19.md). Never delete useful rationale solely to shorten a file; move it.
- Use stable IDs such as P5-B, P7-F, DB-10, RL-A and D-072 instead of brittle numbered-section references.
- Do not duplicate the active queue in AGENTS, ARCHITECTURE, HANDOFF or ADR bodies.
- When an architectural or product decision changes, update the ADR index and record; when implementation status changes, update this file and ROADMAP_COMPLETED.
- For docs-only changes, validate links, structure and the diff, and report application tests and builds as not run.
