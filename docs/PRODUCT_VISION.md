# Product Vision — True North

Owner: Logan Carton. Direction confirmed: 2026-09-09; dashboard refinement: 2026-09-14; two-level unified chrome: 2026-09-19; workspace-launcher and expandable-canvas refinement: 2026-09-20.

## North star

**Build an EHR that feels like Chrome + Google Workspace + an AI operating environment.**

The patient is a persistent workspace, not a page. The clinician should hold the patient's story, current state, unanswered questions, related evidence, unfinished work, and next actions together without repeatedly reconstructing context.

The defining interaction is:

`search / command / link / context → object → related object → action`

rather than:

`menu → module → submenu → page → another module`

An object can be a patient, encounter, medication, result, message, document, task, or prescription. Open it in context, inspect related information beside the current work, and act through the appropriate authorized workflow. This is an interaction model, not a requirement to introduce a generic object database or relationship framework.

## Authority and how to use this document

This is the canonical product and interaction specification. Keep this document current rather than creating competing vision/checklist/handoff files.

- `AGENTS.md` defines development rules and safety boundaries.
- This document defines the intended experience and acceptance requirements.
- `ARCHITECTURE.md` and domain documents explain system boundaries.
- `ROADMAP.md` guides sequencing; `DECISIONS.md` records durable decisions and intentional changes.
- Current GitHub `main`, inspected code, and validation evidence determine what is actually implemented. Older prose, phase labels, and chat handoffs are not proof of completion.

**Every requirement below is an accepted target, not an assertion that it is implemented.** This documentation update does not certify UI behavior or production readiness. Quarter-screen snapping and AI workspace reconfiguration are explicitly eventual capabilities; other requirements may also need implementation or verification.

For each relevant change, cite requirement IDs in the work summary and report verified, partial, deferred, or blocked behavior with evidence and remaining gaps. Do not mark the whole vision complete because a backend phase or build passed. Do not rebuild working systems merely to match new terminology.

## Experience requirements

### VIS — Visual language and shell

- **VIS-01:** Clean white/light interface, Google-like spacing and simplicity, and restrained visual hierarchy.
- **VIS-02:** Avoid dense, card-heavy legacy-EHR dashboards as the default. Use progressive disclosure: complexity appears when needed.
- **VIS-03:** Main shell uses two chrome levels. Level 1 is the calm global bar for Clinical Bond/Home, the central AI/search/voice omnibox, notifications when applicable, and profile/preferences. Level 2 is the persistent labeled patient/workspace tab strip and its always-available `+` **Open workspace** control. Major workspaces may stay open as tabs or be closed and reopened from `+`; opening an already-open singleton workspace focuses it rather than duplicating it. Home is the suite launcher. There is no permanent left navigation rail and no separate full-width work-menu row. Existing Level-1 work-navigation controls are transitional during the migration defined by D-085 and remain only until their replacement access path is proven. Calendar remains a first-class persistent workspace over the authoritative appointment book.
- **VIS-04:** Density is clinician-controlled. A deliberately selected cockpit can be dense while the default remains calm.
- **VIS-05:** Preserve readable labels, keyboard access, visible focus, and non-color-only state cues. Primary work-navigation tabs keep their text labels visible at rest; clinicians should not have to hover or memorize icons to know where a tab goes. Essential identity and clinical safety signals remain available in every density mode.
- **VIS-06:** Minimalism is information architecture, not deletion or tiny typography. Remove repeated identity blocks, summaries, counts, warnings, and layout controls when the same fact/action already has a clear owner, while preserving every unique fact/action and an obvious recovery path for hidden work.
- **VIS-07:** Open workspace tabs and top-level destinations stay readable and reachable on Home and ordinary workspaces, including crowded, narrow, and zoomed layouts. Prefer intrinsic sizing, horizontal scrolling, or accessible overflow over clipping labels, collapsing the primary system navigation to icon-only controls, or hiding open work.
- **VIS-08:** Calendar styling keeps visit type separate from operational/lifecycle status. Use calm tonal appointment surfaces, but make waiting/in-office state immediately recognizable with a visible non-color cue and accessible status name; tentative, in-visit, completed, and cancelled states remain semantically distinct. Empty-slot hover/focus should be subtle and must not read as a selected or booked slot.

### CMD — Universal omnibox

- **CMD-01:** One AI-driven search/command bar at the top searches patients, records, and EHR functions.
- **CMD-02:** Support natural-language navigation such as “open Maya's medications,” and questions such as “what needs my attention today?”
- **CMD-03:** A voice-input toggle lives directly in that bar. Spoken and typed requests enter the same intent system and permission-aware context pipeline.
- **CMD-04:** Patient lookup primarily uses the omnibox; it does not require a Patients menu.
- **CMD-05:** Keep navigation, retrieval, AI proposals, and consequential execution distinguishable. Ambiguous patient identity must be resolved before patient-bound actions.
- **CMD-06:** Clinical questions from the omnibox, Home, and companion AI use the same permission-aware planner/context/proposal semantics. No answer surface may maintain a separate canned clinical answer ladder, substitute example facts, or silently reuse stale patient, workspace, date, provider, or request context.

### TAB — Patient tabs

- **TAB-01:** Browser-style tabs support multiple simultaneously open patient charts.
- **TAB-02:** Tabs are movable/reorderable, scroll horizontally when numerous, and close individually.
- **TAB-03:** Switching tabs preserves unfinished work. Closing a workspace must not silently discard unsaved clinical work.
- **TAB-04:** Remember tab order and active patient; each workspace retains its own active section.
- **TAB-05:** The tab-strip `+` is the universal **Open workspace** affordance, not merely a patient-chart button. It opens or focuses Home, Calendar, Patients, Intake, Documents, Billing, Brand, and appropriate recent work while preventing accidental duplicate singleton workspaces.
- **TAB-06:** Closing a major workspace tab removes it from the current shelf, not from the product. Home and `+` remain obvious recovery paths, and the Clinical Bond/Home control may reopen or focus Home.

### WIN — Detachable patient windows

- **WIN-01:** Drag a patient tab out of the tab bar to create an independent floating workspace inside the EHR canvas.
- **WIN-02:** Move it freely by its title bar and resize from every edge and corner. Interior clinical controls remain usable; resizing must not consume their interactions.
- **WIN-03:** Provide minimize, maximize/restore, close, Back, and Forward controls.
- **WIN-04:** Double-click the title bar to maximize/restore; activate a clicked window and bring it to the front.
- **WIN-05:** Dock/redock to the patient tab bar through an explicit Dock action and dragging back to the bar.
- **WIN-06:** Support left/right snapping with a preview before placement. Eventually support quarter-screen/corner snapping.
- **WIN-07:** Minimized windows remain accessible in a bottom tray.
- **WIN-08:** Multiple patient windows can remain visible side-by-side, retaining independent identity, section, navigation history, scrolling, and draft state.
- **WIN-09:** Detaching, docking, snapping, and maximizing preserve the workspace rather than recreate or lose its clinical work.

These are in-application windows, consistent with D-011. Do not reinterpret “independent” as unmanaged operating-system/browser windows. Earlier limited horizontally arranged panes are an incremental implementation, not the final target.

### PAT — Patient workspace and related information

- **PAT-01:** Persistent patient header keeps identity obvious, including in floating windows and minimal layouts.
- **PAT-02:** Coordinated surfaces include Overview, Encounter, Medications, Labs, Messages, and History/timeline.
- **PAT-03:** Documents, tasks, and related clinical tools plug into the same patient workspace.
- **PAT-04:** Open related information beside the current work without leaving patient context. Keep linked information visible while completing the main task.
- **PAT-05:** Preserve a coherent longitudinal picture: what changed, what is being treated, what remains unresolved, and what needs attention.
- **PAT-06:** Clearly distinguish source facts, clinician drafts, signed/committed records, pending actions, external evidence, and AI suggestions.
- **PAT-07:** Use one persistent identity header per independently usable patient pane. Avoid repeating the same demographics in an overview banner; retain any unique administration, care-team, or chart actions through the existing identity access so simplification never removes capability.
- **PAT-08:** A clinical concern has one owning source even when it has compact and detailed projections. Do not present the same concern as independent duplicate alerts. Keep primary clinical actions visible; secondary layout/card controls belong in a consistent keyboard-accessible overflow with dismissal, focus return, and a visible way to restore hidden content.

### LEFT — Workspace opening and suite navigation (no permanent left rail)

The 2026-09-20 owner direction keeps the main canvas free of a permanent left app rail while replacing the transitional top work-menu hierarchy with Home, persistent workspace tabs, and the tab-strip `+` launcher. D-085 governs the migration and explicitly requires additive-first replacement before old navigation is removed.

- **LEFT-01:** Home is the suite launcher. Its major entities are **Clinical**, **Billing**, and **Brand**. Clinical is the primary EHR environment and owns major workspaces such as Calendar, Patients, Intake, and Documents. Billing is a major workspace. Website and Social Media belong under Brand rather than appearing as peer global apps.
- **LEFT-02:** Staff/People/HR is deliberately not a Home app or major `+` workspace. Staff/HR belongs in the contextual companion/canvas layer and may expand to a main-canvas presentation while preserving the workspace beneath it.
- **LEFT-03:** The persistent tab-strip `+` opens or focuses major workspaces: Home, Calendar, Patients, Intake, Documents, Billing, Brand, plus appropriate recent work. A singleton workspace already on the tab strip is focused rather than duplicated.
- **LEFT-04:** The `+` launcher overlays the canvas without shifting the active workspace. It supports readable labels, search/filtering as the catalog grows, keyboard entry, visible focus, Escape with focus return, and outside-click dismissal.
- **LEFT-05:** Navigation migration is one destination at a time: add the replacement path, verify feature parity and state preservation, then remove only that old path. **Team -> Communication companion -> expandable canvas -> verified parity -> remove Team** is the first migration. Practice and Clinical are decomposed child-by-child afterward; no wholesale menu deletion is permitted.
- **LEFT-06:** Workspace/layout configuration, presets, rail/canvas preferences, account preferences, and Help live under profile/preferences rather than as peer work destinations. No new persistent left app rail or replacement full-width navigation row is introduced.

### RIGHT — Contextual AI and companion tools

- **RIGHT-01:** A persistent contextual AI rail follows the currently active patient/workspace and clinical surface. The foreground canvas/tab is the implicit context; a remembered patient chart behind a practice workspace must not remain the rail's apparent target. If a tool deliberately stays tethered to a background chart, that patient binding is explicit and visibly marked. AI feels integrated into the work.
- **RIGHT-02:** Companion tools can include scratchpad, tasks, and psychiatric assessments/calculators such as PHQ-9 and GAD-7.
- **RIGHT-03:** The right rail is collapsible and remembers its selected companion/panel state.
- **RIGHT-04:** Make every patient-capable companion's target context visible. Switching focus must not silently retarget a pending proposal, retain an inactive background chart as implicit context, or display another patient's response as belonging to the new patient.
- **RIGHT-05:** Docked, expanded, and supported pop-out/redock companion presentations preserve the selected tool, explicit patient/recipient target, drafts, scroll position, and return path. Container changes reuse existing feature lifecycles rather than create a second state owner, and the underlying companion rail/primary controls remain reachable.
- **RIGHT-06:** The canonical companion lifecycle is minimized/icon -> docked right panel -> expanded main canvas -> redocked -> minimized. Expansion is a presentation change, not a new instance of the tool; patient/recipient binding, selected item/channel, filters, draft state, scroll, and the underlying workspace location survive the transition.
- **RIGHT-07:** Staff/HR is a companion/canvas capability rather than a major suite app. Communication is the first legacy top-navigation group to migrate into this model; its old Team entry remains until the companion and expand/redock path are behaviorally verified.

### LAYOUT — Clinician control

- **LAYOUT-01:** Support Comfortable, Compact, Minimal/Zen, and a higher-density cockpit when appropriate.
- **LAYOUT-02:** Rearrange modules/cards, collapse individual sections, hide individual sections, and save preferred arrangements.
- **LAYOUT-03:** Provide workflow presets and clinician-saved presets. Existing presets include Standard Balanced, Minimal / Zen Focus, Comprehensive Intake, and Fast Med Check.
- **LAYOUT-04:** Eventually allow AI to reconfigure the workspace through the same voice/text intent surface. Reuse existing supported layout commands rather than replacing them.
- **LAYOUT-05:** Hiding or collapsing a module changes presentation, not clinical state. Essential identity, unresolved safety signals, and pending work must remain discoverable; minimal mode must not silently drop them.
- **LAYOUT-06:** Workspace customization, presets, and layout reset/template controls belong under Preferences/Settings. They are configuration, not a top-level work destination.

### NAV — Scrolling and navigation

- **NAV-01:** Each pane/window scrolls independently.
- **NAV-02:** Scrollbars are thin and unobtrusive, becoming more visible on hover/drag; stable gutters prevent content jumps.
- **NAV-03:** Keep the patient header/section navigation anchored where appropriate.
- **NAV-04:** Remember scroll position by patient and section.
- **NAV-05:** Back/Forward follow browser-like local navigation history rather than arbitrary module breadcrumbs. Navigation does not undo clinical mutations.

### SAVE — Workspace restoration

Restore the following after reopening the application, subject to current authentication and access:

| ID | State to restore |
| --- | --- |
| SAVE-01 | Open patient tabs, tab order, active patient |
| SAVE-02 | Active section within each patient workspace |
| SAVE-03 | Floating-window positions and sizes |
| SAVE-04 | Minimized/maximized state and snapped layout |
| SAVE-05 | Legacy sidebar preferences retained; no sidebar is rendered |
| SAVE-06 | Right companion panel selection and collapsed/open state |
| SAVE-07 | Density, module layout, and saved preference/preset state |
| SAVE-08 | Relevant per-patient/per-section scroll positions |

Restoration is workspace convenience, not restoration of clinical authority. Scope preferences to the authenticated clinician and applicable organization; revalidate patient access and current clinical records. Never restore an old authorization or treat cached UI state as legal chart truth. Keep clinical drafts in their appropriate durable clinical lifecycle. Do not use browser preference storage as the canonical patient database. Fit restored windows to the available viewport so controls remain reachable.


## DASH — Schedule-first, personally configurable team dashboard

Direction captured from Logan's dashboard discussion on 2026-09-14. These
are product targets, not implementation claims. Detailed implementation defaults
remain subject to the visual review gate; numbered answers without their original
option text must not be treated as approval of additional behavior. They refine VIS, PAT, LAYOUT and
SAVE; the current delivery sequence lives in [`ROADMAP.md`](ROADMAP.md).

- **DASH-01 — Home:** With no active patient, show a practice command center with
  schedule, team and operations. The schedule is the dominant surface. Default to
  a patient roster with an optional time-based calendar/timeline.
- **DASH-02 — Optional windows:** Arrivals and waiting room are optional, not
  compulsory dashboard blocks. Pre-visit preparation, unsigned work/follow-ups,
  medication/lab/refill work, messages/calls, intake/coverage/authorizations/forms,
  billing/payments and team handoffs are independently addable windows. Availability
  must reflect implemented workflows, permission and actual data, not a fake metric.
- **DASH-03 — Personal configuration:** Every member may choose permitted row
  fields, density, filters, alert categories/presentation and window contents.
  Support add/remove, move/reorder, resize, collapse and recoverable hiding.
  Use a structured, snapping layout by default, with bounded optional floating
  windows as an advanced mode. Role defaults are a starting point, not forced layouts.
- **DASH-04 — Shared work:** Authorized team members see the same durable schedule,
  assignment, room/patient-flow and handoff state. Personal layouts do not change
  colleagues' layouts. Presence indicates current activity, never a clinical
  attestation, exclusive lock, or grant of record access.
- **DASH-05 — Two schedule targets:** Selecting the appointment/visit target opens
  that specific visit's information; selecting the patient's name opens the full
  longitudinal chart. Opening visit information is navigation, not automatically
  starting a visit, creating a draft, or setting in-visit status. Carry appointment,
  patient and encounter identity explicitly, including multiple visits for one
  patient. Reuse the patient-workspace system and retain the source schedule state.
- **DASH-06 — Context and actions:** Keep the patient anchored during encounter
  work and related-evidence review; allow deliberate full-screen related workspaces
  with a clear return path. Schedule row mutations belong in a role-specific action
  menu containing permitted actions. A visible layout/persona switch grants no
  clinical or administrative permission.
- **DASH-07 — First personas:** PMHNP/prescriber uses a balanced clinical cockpit
  with optional preparation, medication/lab/refill and unfinished-work windows.
  Owner starts clinically with business metrics in optional windows. Practice
  manager/billing starts from schedule operations, handoffs and available financial
  work. One person may hold clinical and ownership responsibilities simultaneously.
  Start small-team focused; do not build three separate applications.
- **DASH-08 — Save:** Autosave the current personal arrangement with truthful
  save/failure feedback. Separately support named saved presets. Existing
  owner/manager-controlled practice templates are optional starting points,
  copied on adoption; later template changes must not rearrange personal layouts.
  Preserve personal presets, patient tabs and drafts when applying a template.
- **DASH-09 — Adapt only by choice:** Adaptive mode is OFF by default. A provider
  may create named adaptive configurations, explicitly activate/deactivate them or
  manually switch layouts. Time/workload changes must not rearrange inactive-mode
  layouts. Even active mode preserves focused input, ongoing edits, pinned windows
  and clinical context, with a visible way to undo or return to the prior layout.
- **DASH-10 — Safety and accessibility:** Personalization changes presentation,
  not clinical authority. Preserve identity and a compact, reachable path to
  unresolved safety/pending work even when its main window is hidden. Not every
  alert must remain expanded. Any non-dismissible action-time checks require
  explicit reviewed policy, not guessed medical thresholds. Include readable labels,
  keyboard alternatives to drag/resize/hover, non-color-only status, zoom/narrow
  layouts, reset/recovery and a privacy display mode. Permissions must still be
  enforced server-side, including counts, exports and live updates.
- **DASH-11 — Trustworthy status:** Every window distinguishes loading, empty,
  error, stale/disconnected, pending save, saved and conflict. Never replace missing
  clinical or operational data with synthetic fallback content. Visible success
  follows authoritative confirmation; unknown is not zero, normal or complete.
- **DASH-12 — Visual proof:** Produce a clickable synthetic prototype of the three
  personas and core interactions, not only prose or a flowchart. Review it with
  Logan before broad default-dashboard replacement. Reuse repository components
  and keep experimental/demo surfaces explicit and separate from live record views.
- **DASH-13 — First-viewport economy:** Keep the roster/schedule dominant. Do not spend the initial viewport repeating the same day summary or queue count in multiple large tiles. Prefer compact source-backed summaries and actionable filter counts; loading/unknown/failed counts are not zero. Simplification must preserve role defaults, saved layouts, optional windows, custom widgets, and recovery/reset paths.

## RX — DrFirst and EPCS integration target

**DrFirst is the selected planned e-prescribing integration, including electronic prescribing of controlled substances (EPCS).** This is an explicit product requirement, not merely an example of a possible vendor.

- **RX-01:** Integrate DrFirst through the existing vendor adapter boundary; retain EHR-owned patient records, medication truth, prescription intent, and workflow state.
- **RX-02:** Support EPCS through the contracted DrFirst-supported workflow. Verify the specific product, interface, enrollment, authentication, testing/certification, and enablement requirements from vendor documentation during integration; do not assume a particular API, embedded UI, or SSO arrangement is available.
- **RX-03:** Enter prescribing from the current patient workspace and preserve patient identity and task context across any required vendor interaction. Return status and follow-up work to the related EHR prescription/workspace.
- **RX-04:** Reuse the existing prescription authorization, transaction, callback, and recovery architecture. Keep clinician review and required signing/authentication explicit; AI cannot independently authorize, sign, or transmit controlled-substance prescriptions.
- **RX-05:** Distinguish planned integration, development placeholders, vendor-tested connectivity, and production-enabled prescribing. Local authorization or a mock PIN is not proof of working EPCS.

Selecting DrFirst does not remove adapter portability or authorize live network activation. Real connectivity and EPCS remain pending the applicable vendor onboarding and production readiness work. Consult the existing prescribing and integration documents before implementation.

## AI operating environment

AI should assist wherever work occurs: pre-visit preparation, longitudinal synthesis, medication review, symptom/vital/lab comparison, note drafting, structured candidates, unresolved follow-up, inbox triage, and evidence-grounded coding. Source provenance and uncertainty must remain inspectable.

Workspace operation and clinical authority are different. Opening a chart or changing density does not confer permission to sign, prescribe, transmit, reconcile, or mutate records.

Preserve existing architecture:

- Authenticated server-derived identity/permissions and patient binding.
- `ClinicalActionGateway` as the authoritative human clinical mutation boundary.
- Normalized clinical records, provenance/version history, audit, and immutable signed encounters.
- Permission-aware `ContextAssembler`; AI proposes and assists without unrestricted repository/database access.
- Separation of medication truth, reconciliation evidence, prescription intent, workflow requests, and external transaction state.
- Replaceable vendor adapters; vendor schemas and interoperability formats do not dictate the workspace.

Multiple visible patients make context binding more important. Each action carries its originating patient/workspace identity and is checked against authoritative server state. A late AI response, focus change, restored tab, or stale draft must never silently redirect an action.

## TRUST — Grounding, operational honesty, and verification

- **TRUST-01:** Every patient/practice fact, count, status, and AI answer presented as factual is grounded in authorized source data or explicit provenance. Loaded-empty, failed, unknown, stale, and disconnected are different states. Operational views must not substitute fixture literals, example findings, successful-looking fallbacks, or invented counts when evidence is unavailable.
- **TRUST-02:** External success requires authoritative transport/vendor evidence. Local state changes, timers, optimistic toasts, mock credentials, or preview fixtures cannot prove sent, delivered, published, verified, paid, prescribed, or EPCS-ready. A local draft says draft; an unavailable adapter says unavailable. Synthetic demonstrations stay behind explicit preview presentation and cannot write clinical truth or bypass the ordinary authority boundary.
- **TRUST-03:** Completion and verification claims require the relevant behavior and required checks to have actually succeeded. Code presence, a visible DOM node, optimistic state, skipped checks, stale CI, or a source-string scan is not sufficient evidence by itself. For a changed workflow, verify the meaningful failure/recovery and wrong-patient/access/stale-response cases that apply, and report blocked or failing gates rather than calling them complete.

## Acceptance scenarios

Use synthetic patients and exercise the affected scenarios when implementing these requirements:

1. **Find and continue:** Open patient A through the omnibox, start a draft, open patient B, and return to A. A's draft, section, and scroll position remain intact.
2. **Work beside evidence:** Open a related lab/document beside A's encounter. Continue writing with A's identity and evidence visible.
3. **Window lifecycle:** Tear out a tab, move it, resize from all edges/corners, snap with preview, minimize/restore, maximize/restore, and redock. Clinical controls and draft state remain intact.
4. **Personalize:** Open each top tool menu, personalize companion tools, change density, reorder/collapse/hide modules, save a preset, and reload. The chosen arrangement returns.
5. **Restore safely:** Reload with several tabs and floating/minimized windows. Restore layout and sections while rechecking access and keeping every window reachable.
6. **Context isolation:** Start an AI request/proposal in A, activate B before it finishes, then inspect the result. It remains explicitly bound to A; stale or wrong-patient execution is rejected.
7. **Navigate locally:** Use Back/Forward in one window while another remains open. The other window's section, history, and work are unaffected.
8. **Unified input:** Equivalent typed/voice commands use the same intent and safety boundaries. Unsupported or ambiguous commands remain explicit rather than pretending to succeed.

## Keeping future work on course

Before implementation, read this document and current domain guidance, inspect actual `main`, and identify the smallest coherent slice that advances a requirement or enables it safely. Backend work should explain which clinician capability it enables; UI work should explain how it reduces searching or context reconstruction.

In each meaningful handoff/completion report include:

- Starting and resulting commit; what changed.
- Relevant requirement IDs and clinician benefit.
- Evidence of implemented behavior and required validation; explicit gaps or blockers.
- The next smallest coherent step, grounded in current code rather than a guessed phase number.

Do not copy conventional module screens, add dashboards, create duplicate subsystems, or expand vendor scope simply to increase feature count. Keep the first workflow excellent for a psychiatric clinician while avoiding architectural dead ends for teams and other specialties.

If an intentional change alters this direction, update this document and record the rationale in `DECISIONS.md`. Ordinary feature implementation does not require a new vision document or changing the north star.

## Success test

A clinician can find the right object, understand its context, keep related evidence visible, and complete an authorized action with less searching, less repetitive documentation, fewer context switches, and no lost work or patient ambiguity.
