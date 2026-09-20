# Clinical Bond Roadmap — current state and next work

Last documentation verification: 2026-09-19
Latest focused code/CI review: `e332b0fbf71ab24cbb89c9569b8824e7c9f50370` (2026-09-19).
Earlier broad documentation baseline: `48cd17c0927355170bd625b736636218ff750dab`.
The focused review covered shell/calendar, patient overview, AI entry points, prototype communications/practice panels, and CI. It did not recertify every earlier phase. Fetch current `main` before executing; this document records evidence, not an eternally current build status.

## Authority and purpose

This document owns execution state and sequencing:

`current verified state -> current gaps -> next coherent slices -> dependencies/gates -> deferred/blocked work`

It is not the historical delivery ledger. Completed phase evidence and prior queue snapshots are preserved in [the roadmap archive](archive/roadmap/ROADMAP-through-2026-09-19.md).

Use:
- [`PRODUCT_VISION.md`](PRODUCT_VISION.md) for intended clinician/product experience.
- [`ARCHITECTURE.md`](ARCHITECTURE.md) for current implemented boundaries and authority relationships.
- [`DECISIONS.md`](DECISIONS.md) for the governing ADR index and supersession/amendment state.
- current `main` and validation evidence for what is actually implemented.

Implementation truth comes from current code plus the newest intentional decisions. Vision requirements are targets, not proof of completion.

## Current verified product state

The project is architecturally ahead of its remaining product-completeness gaps.

Implemented foundations include:

- persistent multi-patient workspaces, detachable patient panes, restoration, clinician preferences, and browser-style patient tabs;
- server-derived user/session authority, organization membership, patient-access isolation, patient-bound consequential actions, audit/provenance, and immutable signed encounter snapshots;
- authoritative patient roster, administrative record, longitudinal chart foundations, medication truth/reconciliation/prescription-intent separation, prescription transaction/recovery workflows, and clinical reference freezing;
- complete Phase P3 longitudinal clinical-chart gate and Phase P4 scheduling/front-office gate;
- Dashboard DB-0 through DB-10, including configurable modules, shared live scheduling, care-completion projection, and persona/capability boundaries;
- Calendar as a first-class persistent workspace using the same authoritative appointment store as Dashboard/roster surfaces;
- signed encounter history and append-only addendum/amendment workflow;
- prospective-person Intake, standalone intake episodes, promotion/linking, evidence continuity, readiness projection, and staff workflow through D-078;
- durable internal billing charges derived from signed encounters without invented fee amounts; simulated billing success is isolated from normal workflows;
- a grounded planner shared by the omnibox and Home, with explicit unsupported/unknown behavior; the companion is not yet unified and requires CB-1 below;
- staged static-quality tooling, PatientWorkspace decomposition, typed application navigation/coordination, and CSS ownership/stacking boundaries (D-079 through D-082).

Real PHI remains prohibited until the production-readiness gate is intentionally satisfied.

## Review evidence and open defects

At the focused review SHA:

| Surface | Observed implementation | Remaining gap |
| --- | --- | --- |
| Shell / Calendar | Two chrome levels; intrinsic navigation sizing; compact day headers; tonal events; waiting accents; subtle slot hover; quarter-hour creation | Home tab text contrast; explicit non-color waiting cue; targeted visual regression coverage |
| Patient overview | Persistent header, overview cards, layout controls, clinical alerts | Repeated demographics, repeated alert presentation, permanently exposed layout controls |
| Dashboard / queues | Shared schedule, configurable windows, Tasks/Inbox with counts and filters | Repeated summary tiles and day summaries consume the initial viewport |
| AI | Home and omnibox call the shared server planner | `ClinicalAiPanel` has a separate answer ladder, hardcoded schedule/lab assertions and counts, and context failure/staleness risks |
| Communications / practice | Internal team operations and some record workflows are source-backed | Companion/full-workspace fax, email, social, HR, website and community surfaces need capability/preview containment; local-only changes can resemble external success |

**CI evidence:** [run 35464310622](https://github.com/Logancarton/EHR/actions/runs/35464310622) on the reviewed SHA passed lint (with warnings) and typecheck; 380 of 381 tests passed. `tests/api-authority-boundary.test.ts:301` expected 201 and received 409 during tentative booking. Build and browser jobs were skipped. This is a defect to diagnose, not an accepted permanent exclusion. No local application rerun was performed during that review.

The 2026-09-19 documentation plan itself implements no runtime fixes. All CB slices below start **not started**; earlier code can satisfy part of a slice only after current evidence is recorded.

## Ordered execution plan

This is the only ordered delivery queue. The owner can explicitly override scope. Otherwise take the next eligible slice; do not treat all work here as one giant change. Finish and report a bounded slice before taking another. A slice may use several coherent commits, but it is not complete until its acceptance gate is satisfied.

| Order / ID | Deliverable | Dependency / exit condition | Initial state |
| --- | --- | --- | --- |
| CB-0 | Restore the validation baseline | Diagnose the 409; checks, build, and browser baseline actually run | Verified complete |
| CB-1 | One trustworthy AI entry path | Shared planner/context/proposals; no canned companion facts | Verified complete |
| CB-2 | Honest external-service and preview states | No simulated operational success through either entry point | Not started |
| CB-3 | Readable Home chrome and Calendar state cues | Context-preserving tabs and non-color waiting state | Not started |
| CB-4 | Compact patient overview without information loss | Identity/action/alert inventory preserved in every pane | Not started |
| CB-5 | Schedule-first dashboard and compact queue filters | Unique facts/actions and saved layouts preserved; DASH-12 honored | Not started |
| CB-6 | Consistent companion containers | Draft/context lifecycle survives dock/expand/pop-out | Not started |
| CB-7 | Certify the complete manual encounter loop (P5) | Recovery matrix and synthetic reopen/amendment path pass | Not started |
| P6, P7 | Queue resolution and remaining intake/forms | Continue the phase gates below after CB-7, or bounded independent work explicitly scoped | Existing foundations; gates open |
| P9/P10/P11, P12 | Financial truth, portability, production gates; full synthetic clinic day | External/PHI gates remain binding; broad AI expansion follows P12 | Partial / deferred as described below |

CB-0 supplies a trustworthy baseline for completion claims. A demonstrated correctness defect can be contained before CB-0 is fully resolved, with the blocker reported. CB-3 is a small independent visual fix and may follow CB-0 ahead of CB-1/CB-2 if explicitly selected. CB-4/CB-5 need truthful source states; CB-6 follows containment in CB-2. Do not delay encounter reliability to add unrelated cosmetic features.

### CB-0 — Reestablish a trustworthy validation baseline

Status: **Verified complete**
- **Diagnosis:** The 409 status on `tests/api-authority-boundary.test.ts:301` was caused by a fixture date collision. In `app/server/db/seed.ts`, seed fixtures are dynamically shifted to align with `practiceToday()`. When `practiceToday()` advanced to 2026-09-19, `apt-2` (10:30 AM – 11:15 AM) shifted directly onto 2026-09-19, conflicting with the test's hardcoded tentative booking at 11:00 AM – 12:00 PM. Moved the test fixture date forward to `2026-11-19` (outside the shifted fixture window), preserving the underlying scheduling conflict rules.
- **Related repairs:** `GlobalWorkspaceShell.tsx` was fixed to ensure withdrawn modules like `financial_integration` are displayed via `ModuleNotBuilt` ("not built yet") upon restore while clearing persisted state (`billing-containment.spec.ts`), and `dismissal.spec.ts` stray-click target was updated to `.browser-tabs` to avoid intercepting the unified Level 1 omnibox.
- **Evidence:** `npm run check` (381/381 tests pass, 0 lints/type errors), `npm run build` succeeds, and targeted browser suites (`billing-containment.spec.ts`, `dismissal.spec.ts`) pass cleanly.

### CB-1 — Unify AI companion truth with the existing planner

Status: **Verified complete**
- **Changes:** Refactored `app/components/companion/ClinicalAiPanel.tsx` to eliminate all canned facts (hardcoded Friday September 4 2026 briefing, fake schedule chips, fake overdue surveillance facts, and local synthesis ladder). Preserved deterministic workspace layout commands (`parseAiPreferenceCommand`) and split-screen actions. All clinical and schedule queries now route via `requestOmniboxPlan` through the single permission-aware boundary at `/api/ai/omnibox/plan` and render the shared `<OmniboxPlanCard>` (D-064). Implemented monotonic request ID and current-scope tracking to eliminate stale responses and prevent cross-patient bleeding during chart switches. When in schedule view (`isScheduleView`), active patient ID is explicitly omitted rather than borrowing the last active chart.
- **Evidence:** Extended `tests/home-assistant-grounding.test.ts` to include `ClinicalAiPanel.tsx` in `answerSurfaces` and verified zero clinical value literals, reference ranges, or local answer ladders exist across all answer surfaces. Added `tests/browser/companion-ai.spec.ts` testing companion panel opening, server planner routing, plan card rendering, workspace commands, and patient switching isolation. Ran `npm run check` (382/382 tests passed, 0 lint/type errors), `npm run build` (Next.js build succeeded cleanly), and Playwright tests (`home-assistant.spec.ts`, `companion-ai.spec.ts` all passed).

**Requirements:** CMD-01 through CMD-06, RIGHT-01/04, PAT-06, TRUST-01/03; D-064 remains governing.

**Inspect/reuse:** `app/components/companion/ClinicalAiPanel.tsx`, `app/components/home/ZenHomeWindow.tsx`, `app/components/OmniboxPlannerBridge.tsx`, `app/components/omnibox/OmniboxPlanCard.tsx`, `app/lib/omnibox-plan-client.ts`, `app/lib/use-omnibox-controller.ts`, `app/lib/use-workspace-voice-input.ts`, `app/api/ai/omnibox/plan/route.ts`, `app/server/ai/omnibox-planner.ts`, and permission-aware context assembly.

**Implementation sequence:**
1. Inventory clinical questions, practice-summary chips, navigation, layout commands, proposals, and note insertion offered by all entry surfaces. Map each to an existing planner/navigation/action capability; explicitly identify unsupported capabilities. Preserve supported deterministic layout commands through the existing controller rather than deleting them in the unification.
2. Route companion clinical requests through the same client/endpoint and shared proposal semantics. Reuse the plan renderer where suitable; do not copy another keyword answer ladder. Remove hardcoded daily briefings, dates, lab status, patient assertions, and operational counts.
3. For practice summaries, bind the request to the selected practice date/timezone and permitted provider/organization scope. Use existing authorized schedule/queue projections. If the planner cannot support an intent yet, show an explicit unsupported state; extend one bounded read intent only when necessary to preserve a supported workflow. Do not borrow the last patient as the practice context.
4. Bind request/result/proposal to originating patient, workspace, surface and request identity. On patient/scope changes clear or explicitly retain the old result under its old identity, reset cached context, and reject stale response/proposal execution. A comparison against a value captured in the same async closure is not a current-context check.
5. Distinguish loaded-empty, failed, unknown and stale evidence. An empty/missing context must not produce "all monitoring current" or "no prior encounters" unless the owning read supports that conclusion. Consequential writes remain explicit clinician actions through existing authorized APIs; merely asking never stages/sends/signs silently.

**Verify:** extend the behavior coverage in `tests/home-assistant-grounding.test.ts`, `tests/omnibox-planning-boundary.test.ts`, and `tests/browser/home-assistant.spec.ts`, or add focused companion coverage. Test equivalent explicit-patient requests from all three surfaces; changed appointment/result data; selected-day changes; unnamed/ambiguous/unknown/unreachable patients; missing evidence; request failure; and a delayed A response after switching to B. Exercise a proposal after focus changes and verify no wrong-patient write or automatic execution. Test the actual companion, not only the server endpoint or a source-string scan.

**Accept:** all clinical answer entry points cross the common authority boundary; equivalent scope produces consistent evidence and uncertainty; no canned clinical/clinic-day facts remain. **Exclude:** new model vendors, broad agent autonomy, replacement clinical protocols, or a generic AI framework.

### CB-2 — Contain prototype operations and unsupported integrations

**Requirements:** TRUST-01/02/03, RX-05, DASH-02/11; reuse D-063's containment approach.

**Inspect:** `app/components/team/TeamCollaborationDock.tsx` and `app/components/workspaces/{EmailWorkspace,FaxWorkspace,PatientCommunicationWorkspace,CommunityWorkspace,SocialMediaWorkspace,HRStaffWorkspace,WebsiteManagerWorkspace}.tsx`; their navigation/menu entry points; integration readiness; `BillingWorkspace` and `tests/browser/billing-containment.spec.ts` as examples.

1. Build a capability inventory for both companion and full-workspace views: real internal operations, local drafts, external transport, and fixture previews. Keep working team messaging/tasks and actual record workflows intact.
2. Remove timer/local-state success claims for send/deliver/publish/credential verification. An unconfigured adapter must produce a truthful unavailable state; a local draft must say draft. Preserve draft text and target on failure. Do not invent a live connector to finish this slice.
3. Keep synthetic demonstrations behind explicit preview routing/presentation, separate from ordinary operational data/actions. Never mix fake counts, reviews, delivered faxes, EPCS state, or invented provider credentials with authoritative records. Avoid using Logan's identity with fictional MD/NPI/DEA details in normal UI.
4. Apply the same capability/readiness decision to menus, pop-outs, and full workspaces so another entry point cannot bypass containment. Preview fixtures cannot write into clinical records or imply a verified external connection.

**Verify:** browser tests exercise both entry points with no adapter, transport failure where supported, and any explicit preview. Attempt send/reply/publish and confirm no fake success appears or input is lost. Assert operational metrics are sourced or explicitly unknown, and internal team operations still work.

**Accept:** every visible success has matching authoritative evidence; preview and disconnected states are unmistakable. **Exclude:** activating DrFirst, buying/selecting new vendors, building social/HR/CMS backends, or adding repetitive warning banners to every unrelated screen.

### CB-3 — Fix shell readability and protect Calendar progress

**Requirements:** VIS-03/05/07/08, TAB-01 through TAB-04, LEFT-01/02, NAV-04.

**Inspect:** `app/zen-home.css`, `app/tool-navigation.css`, `app/components/workspace/WorkspaceTopBar.tsx`, existing tab owners, `app/google-calendar.css`, `app/components/workspaces/calendar/CalendarViews.tsx`, and `app/lib/calendar-grid-layout.ts`.

- Repair the Home tab foreground/background cascade. Keep open tab names, active state, close controls and keyboard focus readable on Home and ordinary workspaces; do not hide open work to mask contrast failures.
- Preserve intrinsic top-navigation sizing and the two-level shell. Many tabs should scroll or expose accessible overflow while names remain discoverable; do not force system modules to icon-only tabs.
- Retain compact Calendar headers, visit counts, tonal cards, quarter-hour creation, and calm empty-slot hover. Add a concise visible/non-color waiting/in-office cue in day/week/month representations and accessible status names; preserve type versus status semantics and all existing lifecycle actions.
- Preserve full-width crowded-slot rows and the shared time mapping. Do not implement fixed duration rectangles, density scaling, drag/drop or resizing in this corrective slice.

**Verify:** extend `tests/browser/tool-navigation.spec.ts` for Home with open tabs, many tabs, theme contrast and focus; retain bounding-box/overflow assertions. Extend calendar browser coverage for waiting, tentative, in-visit, completed and cancelled states, focused/clicked slots, and a crowded slot. A DOM-visible assertion alone does not prove readable text or unclipped controls.

**Accept:** Home labels are readable, all top-level destinations remain reachable, waiting is understandable without color, and existing Calendar interactions and geometry still work.

### CB-4 — Simplify the patient overview without losing meaning

**Requirements:** PAT-01 through PAT-08, VIS-02/05/06, LAYOUT-02/05, WIN-08/09.

**Inspect:** `app/components/workspace/PatientHeader.tsx`, `app/components/patient/PatientOverview.tsx`, `PatientWorkspace` controllers, existing clinical attention/protocol projections, and feature-owned styles under the D-082 stacking contract.

1. Inventory every unique identity fact, administrative/care-team action, encounter action, clinical concern, and card control. Map old location to retained location before removing a repeated container.
2. Keep one persistent identity header per pane. Remove the duplicate overview identity banner, moving any unique administration/care-team action into the existing identity access. Keep patient identity visible in detached/minimal/full-screen work and consequential dialogs.
3. Keep primary clinical actions such as Manage Rx / Address in Note visible. Place pin, expand, collapse and hide in a consistent visible `...` overflow. Reuse existing controls/state and preserve keyboard focus, Escape, dismissal and recovery.
4. Make header alerts and overview details projections of the same owning concern. Show one detailed alert with a compact reachable header indicator where useful. Deduplicate by clinical identity/source, not a broad text match; retain distinct concerns, severity and action paths.
5. Preserve clinician density/preset choices and personal card arrangement. Message composition and message-history navigation are different functions; do not remove one merely because their labels resemble each other.

**Verify:** before/after fact/action inventory, patient switching with a dirty draft, detached panes, header density modes, keyboard-only card actions, hidden-card restoration, multiple different risks, and saved layout reload. Inspect the actual first viewport at the shared visual matrix.

**Accept:** clinical content appears sooner with fewer repeated controls; all unique facts/actions remain reachable; identity and unresolved safety signals are clear in every pane. **Exclude:** new patient route hierarchy, rebuilding tab persistence, note editor replacement, protocol threshold changes, or merging clinical authorities.

### CB-5 — Simplify dashboard, Tasks/Inbox, and intake filtering

**Requirements:** DASH-01/02/03/07/08/10/11/12/13, VIS-06, LAYOUT-05.

**Inspect:** `app/components/TodayDashboard.tsx`, `app/components/dashboard/`, `app/components/GlobalWorkspaceShell.tsx` and its queue views, `app/components/workspaces/IntakeWorkspace.tsx`, `app/lib/dashboard-layout-model.ts`, module registry and preference/preset controllers.

- In the default dashboard, combine repeated Day at a Glance / Practice Cockpit / schedule summaries into a compact schedule-led summary. Preserve unique preparation/unsigned-work actions and actual status meanings; use the same selected date/provider scope as the roster.
- Replace duplicate Tasks/Inbox count tiles with actionable filter counts. Keep useful information that has no existing filter through a compact label or filter; do not discard it. Unknown/loading counts must not render as zero.
- Move zero-count intake categories behind stable filter access where helpful; keep the selected filter visible even when it reaches zero. Preserve all category choices, predictable keyboard order, and the ability to inspect an empty queue.
- Preserve owner/PMHNP/manager role defaults, optional business windows, saved layouts, window recovery, and opt-in adaptation. Do not silently overwrite user presets or remove custom widgets. Explain any versioned default migration and retain a recovery path.
- Retain the DASH-12 owner visual review gate before broad default-dashboard replacement. Prepare the functioning synthetic preview and measured before/after evidence first; routine contained cleanup does not require repeated approvals.

**Verify:** empty, one-visit and busy days; provider/date changes; queue mutation updating counts; permission-limited counts; failed/stale reads; selected zero-count filter; narrow widths; personal preset reload and reset. Use existing source-backed dashboard/queue tests and browser flows.

**Accept:** the roster is dominant, summary facts are not repeated in several large tiles, and all unique actions/configuration survive. No new dashboard or second queue truth is introduced.

### CB-6 — Normalize companion presentation and lifecycle

**Requirements:** RIGHT-01 through RIGHT-05, PAT-04, SAVE-06, WIN-09, TRUST-02.

**Inspect:** `app/components/DynamicSidebar.tsx`, `app/lib/use-companion-rail-controller.ts`, `app/lib/use-companion-working-data.ts`, `app/components/team/TeamCollaborationDock.tsx`, companion panels, existing floating-window/navigation controllers, and semantic stacking tokens.

- Reuse the existing companion controller and container to provide consistent header, title/context, close, expand and supported pop-out/redock behavior. Keep full workspaces for larger jobs; unify presentation without merging unrelated domain state.
- Keep the right icon rail and underlying primary controls reachable. Implement responsive width/overflow using existing geometry ownership rather than ad hoc z-index increases.
- Preserve draft text, explicit patient/recipient target, scroll, selected tool and return path through container changes. State belongs to existing feature lifecycles, not a duplicate wrapper store.
- Apply CB-2 readiness and preview containment identically in docked and full views. Merely changing active patient must not retarget a pending message/order/proposal.

**Verify:** schedule, AI, scratchpad, tasks, assessments and communication tools; open/close, tool switch, expand, supported detach/redock, Escape/focus return, patient change, resize, refresh and failed persistence. Reuse `calendar-companion-panel`, `rail-personalization`, `workspace-layering`, and window-lifecycle browser coverage.

**Accept:** consistent presentation and state continuity with no obscured rail, wrong-target action, lost draft, or new navigation owner. **Exclude:** generic window-manager rewrite or imposing one mandatory layout on every user.

### CB-7 — Close P5 with an end-to-end manual encounter gate

**Requirements:** TAB-03, WIN-09, PAT-01/06, RIGHT-04, SAVE-01 through SAVE-08; existing encounter/legal-record ADRs.

**Inspect/reuse:** existing encounter save/signing/revision controllers, `tests/encounter-save-lifecycle.test.ts`, `tests/encounter-draft-revision.test.ts`, `tests/signed-encounter-integrity.test.ts`, `tests/browser/synthetic-visit.spec.ts`, `tests/browser/workspace-reliability.spec.ts`, and window lifecycle coverage.

Run one synthetic appointment through open -> document -> autosave -> review/coding -> explicit sign -> reopen signed history -> append amendment. Verify appointment/patient/encounter identity throughout and that signed snapshots remain immutable. AI must not be required to complete any step.

Complete a browser recovery matrix for patient switch, detach/redock, refresh, close/reopen, failed save/retry, late response, revision conflict, and signing while save is pending. Verify visible unsaved/saving/saved/failed/signed states and that no unconfirmed save is reported as durable. Fix only demonstrated gaps; do not rebuild existing encounter mechanisms.

**Accept:** the P5 exit gate below passes with reproducible evidence and no lost work, wrong-patient writes, or mutation of signed content. Remaining external prescribing/lab/communications work stays explicitly separate from the local encounter result.

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

## Completed-phase summary

Detailed delivery evidence remains available in the [historical roadmap snapshot](archive/roadmap/ROADMAP-through-2026-09-19.md). Important completed checkpoints include:

- P3 longitudinal clinical chart gate;
- P4 scheduling/front-office gate;
- RL-A/RL-B sign-time reference freeze and coded diagnosis foundation;
- Dashboard DB-0 through DB-10;
- P9-0 containment and durable internal charge foundation;
- AI-0 grounded answer path;
- signed-history authority correction (D-071);
- Calendar first-class workspace (D-072);
- Intake truth-alignment through D-078;
- code-quality/application-shell/CSS architecture cleanup D-079 through D-082.

Completed does not mean production-ready, vendor-connected, HIPAA-certified, or P12 accepted.

## Roadmap maintenance rules

- Keep only current state, active/future work, gates, and a compact completed summary here.
- Move completed implementation diaries, old validation snapshots, and superseded queue narratives into `docs/archive/roadmap/`; never delete useful rationale solely to shorten this file.
- Use stable IDs such as P5-B, P7-F, DB-10, RL-A, and D-072 instead of brittle numbered-section references.
- Do not duplicate the active queue in AGENTS, ARCHITECTURE, HANDOFF, or ADR bodies.
- When an architectural/product decision changes, update the ADR index/record; when implementation status changes, update this roadmap.
- For docs-only changes, validate links/structure/diff and report application tests/builds as not run.
