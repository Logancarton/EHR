# Clinical Bond Roadmap — current state and next work

Last documentation verification: 2026-09-21
Current status refresh inspected: `b8abf78eb4c320df4932370e0254a6fbc0865f8f` (2026-09-21).
Latest fully validated implementation slice: UI-7d, which moved Prescribing from the Clinical menu to the right companion and removed Clinical with it, completing UI-7 ([D-092](decisions/D-092.md)). Before it, CB-0b attributed every standing browser failure to a named cause and repaired all but one ([D-091](decisions/D-091.md)).
Earlier broad documentation baseline: `48cd17c0927355170bd625b736636218ff750dab`.
The 2026-09-20 refresh reconciled the active roadmap with completed CB-0 through CB-5 work and the subsequent fixed-height Calendar geometry commits. It did not recertify every earlier phase or claim the full browser gate is green. Fetch current `main` before executing; this document records evidence, not an eternally current build status.


## Owner UI migration directive — highest priority

Direction confirmed 2026-09-20. This is the current shell/UI migration order and takes priority over the older top-navigation presentation while preserving its working routes until replacements are proven.

`Home / + launcher -> persistent workspace tabs -> active canvas -> contextual right companion canvas`

**Migration invariant:** never remove a working top-bar destination merely because its replacement has been designed. Add the replacement, prove parity and state preservation, then remove only that one old entry.

### UI migration invariants

- No permanent left navigation rail is part of the target. Home and the always-available `+` on the workspace tab strip are the recovery/open paths for major workspaces.
- The `+` control becomes **Open workspace**, not only **Open a patient chart**. It opens or focuses major workspaces without creating duplicate singleton tabs.
- Home is the suite launcher. Its major entities are **Clinical**, **Billing**, and **Brand**. Staff/People/HR is deliberately **not** a Home app or major `+` workspace; it belongs in the contextual companion/canvas layer.
- Clinical major workspaces include Calendar, Patients, Intake, and Documents. Billing remains a major workspace. Website and Social Media consolidate under Brand.
- Companion/canvas tools include AI, Communication, Tasks, Assessments, compact Calendar, document/form review, Staff/HR, Scratchpad, and Calculators as their implementations mature.
- Companion presentation follows one lifecycle: **minimized/icon -> docked right panel -> expanded main canvas -> redocked -> minimized**, preserving drafts, selected item/tool, patient or recipient binding, filters, scroll, and return path.
- Existing navigation remains available during migration. Each old top-bar entry is retired only after its replacement path is behaviorally verified, keyboard reachable, and covered by focused browser tests.
- Reuse the existing workspace navigation controller, persistent tab ownership, tool registry, and companion state lifecycle. Do not introduce a second router, duplicate workspace store, or parallel tool truth.

### Ordered shell migration

| UI slice | Change | Exit gate before the next slice |
| --- | --- | --- |
| **UI-1** | Upgrade the tab-strip `+` from **Open a patient chart** to **Open workspace**. Offer Home, Calendar, Patients, Intake, Documents, Billing, Brand, and appropriate recent work. If already open, focus the existing tab instead of duplicating it. | **Verified complete.** Popover opens/toggles, instant filter matches keywords/patients, singleton workspaces and docked/undocked charts focus existing tabs without duplication, full keyboard/escape dismissal, Level 1 top-navigation preserved. Unit tests (4/4) and browser tests (5/5) pass. |
| **UI-2** | Make Home and `+` consume one shared workspace catalog rather than separate hard-coded destination lists. Home presents Clinical / Billing / Brand; Staff/HR is excluded from major-app launchers. | **Verified complete.** Single shared catalog (`app/lib/workspace-catalog.ts`); Home presents Clinical / Billing / Brand in centered Google Workspace aesthetics; `+` presents Home, Calendar, Patients, Intake, Documents, Billing, Brand; Staff/HR and withdrawn/planned tools (`financial_integration`, `reports`) excluded from both; destination identity and availability aligned. Unit tests (6/6) and browser tests (5/5) pass. |
| **UI-3** | Add **Communication** to the right companion/canvas rail while keeping the existing **Team** top-bar menu intact. Reuse real Inbox/team/patient communication/email/fax/community capabilities only where currently implemented. | **Verified complete.** Pinned `communication` tool in right companion rail by default; `CommunicationCompanionPanel` supports Team, Inbox, Patient SMS, Email, Fax, and Community; honest unconfigured notices for external gateways; Level 1 Team menu fully intact; unit tests (5/5), browser tests (5/5), and full inner loop pass. |
| **UI-4** | Give Communication the canonical companion lifecycle: docked, resizable, expanded main-canvas presentation, redock, minimize/close. | **Verified complete.** Canonical lifecycle implemented (docked, resizable, expanded main-canvas presentation, redock, minimize/close); right companion rail (52px) remains accessible during canvas expansion (RIGHT-05); draft persistence (chat, SMS, email, fax, tasks) and channel/partner selection survive expand, redock, tool-switching, close/reopen, and page reload; Escape gracefully redocks before dismissing; Level 1 Team menu preserved intact; unit tests (4/4), browser tests (5/5), and full inner loop (416/416) pass. |
| **UI-5** | Remove **Team** from the top bar only after UI-3/UI-4 parity is proven. | **Verified complete.** Team retired from `ToolNavigation` with its channel-dispatch plumbing; all six capabilities and their full-workspace escalations reachable from the right companion rail; a one-time `appliedRailBackfills` migration reaches layouts saved before the tool existed; the legacy collaboration dock still opens alone from its own control. |
| **UI-6** | Decompose **Practice** one child at a time: Billing -> major workspace; Website + Social Media -> Brand; Staff/HR -> companion canvas with expand; Settings -> profile/preferences; Reports -> assigned to its owning workspace when real. | **Verified complete.** Billing (UI-6a), Website + Social media (UI-6b/UI-6c), Staff/HR (UI-6d, with assignment in UI-6e) and Practice settings (UI-6f) each reached a verified owner before losing their entry; Reports was already filtered out as `planned` and left with the group. Practice was removed last (UI-6g). "Settings -> profile/preferences" is amended by [D-087](decisions/D-087.md): the child was organization administration, the practice's default layouts were already under preferences, and administration went to the account menu. |
| **UI-7** | Decompose **Clinical** one child at a time. Keep Calendar first-class; Patients/Documents open through `+`; move contextual tools such as Tasks to companions where appropriate; decide Labs/Prescribing placement from workflow ownership before removing their old route. | **Verified complete.** All five children reached an owner before losing their entry: Patients and Documents to the `+` launcher (UI-7a, which repaired the Documents route first), Tasks to the right companion whose expanded canvas renders the practice queue itself (UI-7b, D-089), Labs to the `+` launcher beside Documents (UI-7c, D-090), and Prescribing to the right companion (UI-7d, D-090 as amended by D-092). Clinical was removed last, after its last child. Prescribing's detail pane, patient-context gate, retry and evidence forms remain unexercisable without an enabled prescribing integration, which D-092 records rather than implies. |
| **UI-8** | Final chrome cleanup: Level 1 becomes brand/Home + omnibox + account/preferences; Level 2 remains persistent labeled workspace tabs + `+`; right side remains contextual companions. | Legacy top work-navigation controls are gone only because all replacements are proven. No left app rail or replacement full-width navigation row is introduced. **Now the current slice, and smaller than it was:** UI-7d removed the last expandable group, so Level 1 already holds only Calendar, Intake and Dashboard as direct destinations — and `ToolNavigation`'s popover machinery is now unreachable code that this slice should remove. |

**Current next step: UI-8 — the final two-level chrome cleanup.** UI-1 through **UI-7 are verified complete**. UI-7 took all five of Clinical's children and then the group: Patients, Documents and Labs to the `+` launcher (UI-7a, UI-7c), Tasks and Prescribing to the right companion (UI-7b [D-089](decisions/D-089.md), UI-7d [D-090](decisions/D-090.md) as amended by [D-092](decisions/D-092.md)). With Clinical gone the Level 1 work navigation holds three direct destinations — Calendar, Intake, Dashboard — and **no expandable group at all**, which is most of what UI-8 was going to do. What is left of UI-8 is the smaller cleanup it was always meant to be: brand/Home + omnibox + account above the persistent labeled tabs and `+`, with no left rail and no replacement navigation row.

**UI-7d moved on the owner's decision, and part of it is unproven by design.** The owner's instruction on 2026-09-21 was *"We don't need to buy DrFirst to get moved what is there. Please move it and then delete it from its current position."* [D-092](decisions/D-092.md) records the move and, more importantly, records what it does and does not establish. In short: the Clinical menu reached the same structurally empty queue, so nothing that worked before stopped working, and the parity bar is the route being removed rather than the capability working end to end. The detail pane, the patient-context gate's own controls, retry and the three evidence forms are **unexercised and unexercisable here**, and nobody should read UI-7d as evidence that prescribing recovery works. What *was* proven in a browser is the container and the structural precondition the module could never meet: the queue stays on screen while a patient chart is the active tab, and the shell resolves that tab to the patient.

**Owner instruction, 2026-09-21: no money is being committed to paid integrations or to a paid model for the internal EHR AI.** Work around the gap rather than buying past it, and never simulate the part that is missing. `PrescriptionOperationsWorkspace`'s queue stays empty in every checkout because a transmission is refused before a `prescription_transactions` row is written when no adapter is enabled.

**There is an honest way to make that queue non-empty with no vendor, and it is not taken yet.** Verified by driving the real transmit path: with an enabled configuration for the development placeholder adapter, `orderTransmissionService.transmit` prepares a transaction, the placeholder honestly refuses (`DrFirst network transmission is not implemented`), the failure is recorded, and the queue returns **one real `transmission_failed` item with retry allowed**. Nothing is simulated — the refusal is genuine and no success is claimed. Two things must come first, and each is its own slice:

1. **Nothing in the product can enable an integration.** `IntegrationConfigurationService` has `manage_integrations`, audit logging and secret references, and **no API route and no UI**. Organization administration already has a home in the account menu ([D-087](decisions/D-087.md)).
2. **"Integration ready" would then be a lie on the surface least able to afford one.** With the placeholder enabled, `integrationHealthService` reports `ready` and the operations queue renders *"Integration ready — the configured prescribing integration is enabled and its required secret material is available"* for an adapter that cannot transmit anything, ever. That is configuration readiness wearing transport readiness' clothes. The adapter needs to declare that it cannot transmit and the health projection needs to surface it. **This one is not optional**: shipping it to unblock a UI proof would trade a presentation gap for the fabricated-readiness failure AGENTS.md forbids.

Neither is authorised here. Both are recorded so a later slice starts from them rather than from the wall, and so that the unexercised surfaces above get exercised when it does.

Prove the replacement before removing anything. UI-7a is the reason to insist on that: Documents looked like a parity proof with nothing to build, and the launcher's Documents turned out to open nothing at all. Nothing about the `+` launcher already listing a destination means the destination works. UI-7b is the second reason: the Tasks companion existed, was pinned by default, and was still not a replacement — it could not filter, could not remove, could not reach a linked chart, and had no expanded presentation at all. UI-7c is the third: the replacement for Prescribing could have been built and demonstrated on an empty queue without ever touching the half that matters — and UI-7d is the fourth, where the owner decided the move was worth making anyway and the honest thing left to do was name the half that stayed untouched rather than let a passing suite imply otherwise.

One part of the defect CB-0a was drawn from is still open, and it is not UI-7's: the browser suite's fixture week still moves under specs that name a weekday or expect one visit where the shift has delivered two. It is recorded below with a fresh diagnosis and it does not touch UI-7's surfaces. Do not let it absorb a failure of your own.

CB-6's companion-container requirements remain binding and are consumed directly by UI-3/UI-4/UI-5. CB-7 and later clinical certification work remain in the roadmap; this owner-directed shell migration is the immediate presentation priority.

**Deferred from UI-7b with reason:** Escape is answered by every layered surface that is listening, with no arbitration about which is topmost. With a module workspace open underneath, one Escape press both redocks an expanded companion and closes the module — the module's tab survives and is one click away, so nothing is lost, but two surfaces answer one keystroke. `app/lib/use-dismissible.ts` already states the intended rule ("The topmost layer answers first") and implements it only for `[role='dialog']` through `event.target`, which does not fire when Escape is pressed with nothing focused. The obvious local fix — a capture-phase `window` listener in the companion controller, as `ToolNavigation` uses — was rejected rather than merely skipped: a companion panel can be open underneath a modal, and a capture-phase swallow would steal Escape from the modal above it. This needs one small shared layer rule, owned where the rule is already written down, which is more than a presentation slice should decide on its own.

**Deferred from UI-5 with reason:** `TeamCollaborationDock` is a separate surface, not a top-bar entry, so retiring it is not part of this slice. It keeps ownership of the `ehr-open-communications` intent and its remaining entry point (the dashboard Team window). Consolidating the dock into the Communication companion is a bounded follow-up that belongs with the dashboard/Team decomposition work, not with the menu deletion.

### UI-1 — Upgrade tab-strip `+` to universal "Open workspace" launcher

Status: **Verified complete**
- **Implementation:** Created `OpenWorkspaceLauncher.tsx` and `open-workspace-launcher.css` implementing the universal "Open workspace" popover. Integrated into `WorkspaceTabStrip.tsx` with updated `aria-label="Open workspace"`, `aria-haspopup="dialog"`, and `data-workspace-control="open-workspace-launcher"`.
- **Destinations & Catalog:** Offers Home, Calendar, Patients, Intake, Documents, Billing, Brand, and Recent Patients with live instant search filtering and Google Workspace/Facebook aesthetic icon badges.
- **Focus-Existing Singleton Invariant:** Selecting an already-open workspace or docked patient focuses that existing tab without duplicating it; un-docked patients activate and append cleanly.
- **Keyboard & Dismissal:** Supports Arrow Up/Down navigation, Enter selection, Escape dismissal with focus return to `+` button, and outside-click dismissal.
- **Top Bar Preservation:** Preserved `ToolNavigation` completely intact (Clinical, Calendar, Intake, Team, Practice, Dashboard) without premature removal.
- **Evidence:**
  - Unit tests: `tests/workspace-open-launcher.test.ts` (4 passed)
  - Browser tests: `tests/browser/workspace-open-launcher.spec.ts` (5 passed)
  - Regression validation: `npm run check` (401/401 unit tests passed, 0 lint/typecheck errors) and `npm run build` passed.

### UI-2 — Shared Home / '+' workspace catalog

Status: **Verified complete**
- **Implementation:** Created canonical `app/lib/workspace-catalog.ts` defining major suite entities (`Clinical`, `Billing`, `Brand`) and major workspaces (`Home`, `Calendar`, `Patients`, `Intake`, `Documents`, `Billing`, `Brand`). Refactored `ZenHomeWindow.tsx` and `OpenWorkspaceLauncher.tsx` to consume the single shared catalog rather than hard-coded destination lists.
- **Home Suite Presentation:** Home presents the 3 major entities (`Clinical`, `Billing`, `Brand`) in a centered, balanced layout beneath the omnibar and chips with rich circular icon badges. The Clinical tile carries `[data-workspace-view="today"]` for 1-click restore to Today.
- **Staff/HR & Withdrawn Tool Exclusion:** Staff/People/HR is excluded from both Home and `+` major-app launchers (retained for contextual companion/canvas per D-085/LEFT-02). Withdrawn prototypes (`financial_integration`) and planned tools (`reports`) cannot leak into either surface.
- **Destination Parity:** Billing and Brand agree on identical identity, label, icon, tone, and global module target between Home and `+`.
- **Evidence:**
  - Unit tests: `tests/workspace-catalog.test.ts` (6 passed)
  - Browser tests: `tests/browser/workspace-catalog.spec.ts` (5 passed)
  - Regression validation: `tests/browser/workspace-open-launcher.spec.ts` (5 passed), `npm run check` (407/407 unit tests passed, 0 lint/typecheck errors) and `npm run build` passed.

### UI-3 — Add Communication to the right companion rail

Status: **Verified complete**
- **Implementation:** Registered `communication` in `app/lib/workspace-tools.ts` and `app/lib/preference-engine.ts` with default right-rail pinning. Built `CommunicationCompanionPanel.tsx` hosted inside `CompanionPanelHost.tsx` with dedicated styling in `app/communication-companion.css`.
- **Six Communication Channels:**
  1. *Team:* Integrated internal team chat, presence strip, patient context linking, and full tasks launcher using authoritative `teamApi`.
  2. *Inbox:* Integrated patient message roster across all clinical patients with filter chips (`all`, `unread`, `priority`, `refills`) and full inbox workspace launcher.
  3. *Patient SMS:* Patient-bound SMS threads with honest unconfigured telephony gateway notice (`data-sms-transport="unconfigured"`) and draft response composer.
  4. *Email:* Clinical email/referral threads with honest unconfigured SMTP/IMAP gateway notice (`data-email-transport="unconfigured"`).
  5. *Fax:* Digital fax log and composer with honest unconfigured digital fax gateway notice (`data-fax-transport="unconfigured"`).
  6. *Community:* Psychiatric consultation network with honest unconfigured network notice (`data-community-network="unconfigured"`).
- **Navigation Preservation:** Existing Level 1 `Team` top-bar menu (`ToolNavigation.tsx`) and `TeamCollaborationDock.tsx` remain 100% untouched and functional.
- **Evidence:**
  - Unit tests: `tests/communication-companion.test.ts` (5 passed)
  - Browser tests: `tests/browser/communication-companion.spec.ts` (5 passed)
  - Regression validation: `npm run check` (412/412 unit tests passed, 0 lint/typecheck errors).

### UI-4 — Expand/redock Communication canvas with state preservation

Status: **Verified complete**
- **Canonical Companion Lifecycle:**
  1. *Docked right panel:* Opens cleanly in `.companion-panel` at preferred/default width with standard chrome headers, tab selector, and resize boundary.
  2. *Expanded main canvas:* `<CompanionPanelHeader>` provides an accessible `Expand to workspace canvas` (`open_in_full`) button. When toggled, the panel applies `.companion-expanded-canvas` spanning the main workspace canvas (`position: fixed; inset: 0 52px 0 0; z-index: var(--z-modal, 1000)`).
  3. *Unobscured right companion rail (RIGHT-05):* The right companion rail remains visible, stationary, and fully interactable at `right: 0; width: 52px`, allowing one-click companion switching or toggling directly from the rail while expanded.
  4. *Redock & minimize:* Clinicians can redock back to the side panel via the header's `Redock to side panel` (`close_fullscreen`) button, redock via `Escape` key, or close entirely via the header close (`close`) button or rail toggle.
- **State & Draft Preservation across Container Changes:**
  - Implemented `app/lib/use-communication-drafts.ts` syncing active channel, selected partner/thread, team chat composer text, shared task delegate and title drafts, and patient-bound SMS drafts with `sessionStorage` (`ehr-communication-drafts-v1`).
  - Drafts survive container expand, redock, tool switching (e.g. switching between communication and calendar or scratchpad), companion close/reopen, and browser reload without data loss.
  - SMS drafts adhere strictly to active patient context (`drafts.patientSms[patientId]`) with zero silent cross-patient leaking (`RIGHT-04`, `RIGHT-05`).
- **Responsive Workspace Grid in Expanded View:**
  - In expanded view (`data-companion-presentation="expanded"`), the Team channel renders in a rich 2-column workspace (`.comm-team-workspace-wrap`) with chat on the left and shared tasks on the right.
  - Channels with unconfigured gateways (SMS, Email, Fax, Community) present structured multi-column views with persistent honest gateway notices and uninhibited drafting capability.
- **Escape Key Contract:**
  - When expanded, the initial `Escape` keypress safely transitions presentation back to `"docked"` without closing the panel or losing draft text. A subsequent `Escape` keypress dismisses the docked panel back to the rail with focus retained.
- **Evidence:**
  - Unit tests: `tests/communication-companion-lifecycle.test.ts` (4 passed) covering docked/expanded attributes, expand/redock button accessibility, draft persistence roundtrips, and patient-bound SMS draft isolation.
  - Browser Playwright tests: `tests/browser/communication-lifecycle.spec.ts` (5 passed) verifying docked opening at preferred width, expand filling workspace while rail remains clickable, team chat and partner surviving expand/redock, patient SMS draft surviving channel switching and redock, and two-stage Escape key dismissal.
  - Inner loop & build: `npm run check` (416/416 tests passed, 0 lint errors, 0 typecheck errors) and `npm run build` (Turbopack production build succeeded cleanly).
  - Combined UI-1..4 regression: All 20 browser tests across `workspace-open-launcher.spec.ts`, `workspace-catalog.spec.ts`, `communication-companion.spec.ts`, and `communication-lifecycle.spec.ts` passed cleanly in 1.2m.

### UI-5 — Retire Team top-bar entry with full companion parity

Status: **Verified complete**
- **Retirement of the Level 1 Team group:**
  - `Team` is gone from `.tool-navigation` in `app/components/ToolNavigation.tsx`, leaving `Clinical`, `Calendar`, `Intake`, `Practice`, and `Dashboard`.
  - Its six channel destinations were the only ones that carried a `channel`, so the `WORKSPACE_OPEN_COMMUNICATIONS_EVENT` dispatch and the `Destination.channel` field went with them rather than staying behind as an unreachable second route.
- **Full capability parity through the companion rail:**
  - All six retired capabilities (Team collaboration, Inbox, Patient SMS, Email, Fax, Community) open from the pinned right-rail Communication companion, which is keyboard reachable as well as clickable.
  - Every channel keeps the escalation to its full workspace (`.comm-launch-workspace-btn`) that the old dock's fullscreen control provided.
- **Repaired the escalation path the parity test exposed:**
  - `.communication-companion-panel` set `height: 100%`. On the fixed-positioned `.companion-panel`, a percentage height resolves against the viewport instead of the element's own `top`/`bottom` pair, so the panel ran one workspace-chrome height (108px) past the bottom of the screen and carried every channel's "Open Full … Workspace" button off-screen with it — docked *and* expanded. Removing the declaration lets `top`/`bottom` size the panel; all six escalation buttons now sit inside the viewport (measured at 1024x768: panel 108→768, buttons ending at 756).
  - This was live before UI-5 and only mattered once the companion became the sole route, which is why the slice fixes it rather than deferring it.
- **Legacy layouts are not stranded:**
  - `app/lib/preference-engine.ts` records `appliedRailBackfills` and backfills the `communication` pin once into stored rails written before the tool existed, placing it beside the other assistive companions rather than at the end of the rail.
  - Recording the backfill means it runs exactly once, so a clinician who then unpins the tool keeps that choice instead of having it restored on every load.
- **Surface separation:**
  - `TeamCollaborationDock` is not retired by this slice. It keeps the `ehr-open-communications` intent and its own remaining entry point, and opening it does not also summon the companion — one request must not produce two competing communication surfaces.
- **Evidence:**
  - Unit tests: `tests/communication-companion.test.ts` (Team group and its channel dispatch retired; remaining groups retained) and `tests/workspace-personalization.test.ts` (a pre-UI-3 rail receives `communication` once and in position; an explicit unpin survives a later load).
  - Browser tests: `tests/browser/team-retirement.spec.ts` (5/5) — Team gone while other destinations work, all six channels plus their escalations reachable from the rail, Inbox opens the full inbox workspace, a pre-UI-3 stored layout still gets the rail entry, and the legacy dock opens alone. Run together with `communication-companion.spec.ts` and `communication-lifecycle.spec.ts`: 15/15.
  - Inner loop & build: `npm run check` (418/418 unit tests, 0 lint errors, 0 type errors) and `npm run build` (Turbopack production build succeeded).
  - Full browser suite on a fresh test database: **129 passed, 6 failed**. All six failures reproduce unchanged at `143e323` without this slice's changes, verified in a clean worktree, and share one date-dependent cause: the run date (2026-09-20) is a Sunday, so the shifted seed fixtures leave the clinic day empty and roster rows, calendar event rows, and appointment seeding have nothing to assert against. They are `calendar-interval-jump`, `care-completion` (follow-up loop), `dismissal`, `home-assistant`, `intake-workspace` (D-077), and `tool-navigation` (CB-3 calendar status cues). They are recorded here as an open pre-existing defect, not as a UI-5 result and not as a waiver.

### UI-6 — Decompose Practice one child at a time

Status: **Verified complete** at working tree on 2026-09-21, from `86c4c02`. Every child
reached a verified owner before losing its entry, and the group was removed last.

| Practice child | New owner | State |
| --- | --- | --- |
| Billing | Home suite tile and the `+` launcher | **UI-6a done** — menu entry removed |
| Staff directory (`hr`) | HR: a `+` launcher workspace and a rail companion (D-086) | **UI-6d/UI-6e done** — menu entry removed; records are assignable from the interface |
| Website | Brand workspace, Website section | **UI-6c done** — menu entry removed |
| Social media | Brand workspace, Social media section | **UI-6c done** — menu entry removed |
| Practice settings (`settings`) | Organization administration, in the account menu, gated on `manage_organization` (D-087) | **UI-6f/UI-6g done** — replacement proven, then the entry and the group removed |
| Reports | Its owning workspace when real | Never rendered: the tool registry calls it `planned` and the menu filtered on that, so it left with the group rather than needing a home |

- **UI-6a — Billing.** `Practice -> Billing` called `nav.openGlobalModule("billing")`; the Home tile and the `+` launcher issue the same command, so the replacement is the identical controller path rather than a lookalike, focus-existing singleton rule included. The layering spec's "leave a module, return Home" case reached its module through `Practice -> Billing` and now uses Staff directory.
- **UI-6b — Brand as a real workspace.** Brand was a Home tile and launcher entry that quietly opened the `website` module, with `openGlobalModule("website")` hard-coded in two places beside the catalog's own `targetModule`. It is now a registered module of its own rendering `BrandWorkspace`, and both hard-coded routes are gone, so the catalog is the single answer to where Brand goes. `BrandWorkspace` is a container, not a rewrite: each section renders the same component the `website` and `social_media` modules render, so content, drafts and honest unconfigured-gateway notices are the originals rather than a second copy free to drift. Visited sections stay mounted, so an edited practice headline or an unsent post draft survives switching sections.
- **UI-6c — Website and Social media leave the menu.** Removed only after UI-6b proved Brand reaches both surfaces, per the additive-first rule. The `website` and `social_media` modules stay registered: they are the renderers Brand composes, and persisted workspace state may still name them.
- **Evidence:**
  - Browser tests: `tests/browser/practice-decomposition.spec.ts` (10/10) — launcher and Home reach Billing, Billing focuses its existing tab, Brand opens as its own workspace with both sections, work in progress survives section switches in both directions, Brand focuses its existing tab, and Practice was left holding exactly Staff directory and Practice settings — the state at that commit, before UI-6d and UI-6f rehomed both.
  - `tests/browser/workspace-catalog.spec.ts` (5/5) with its Brand case updated to the new destination; `workspace-layering`, `workspace-open-launcher`, `workspace-module-tabs`, `prototype-containment` and `billing-containment` green.
  - Inner loop: `npm run check` (418/418 unit tests, 0 lint errors, 0 type errors).
  - Verified in the running app at 1024x768: Brand opens from `+` and Home with labeled `Website` / `Social media` section tabs, the website CMS notice intact, and an edited headline plus an unsent post draft both surviving a round trip between sections.
- **Practice is gone.** `ToolNavigation` now holds Clinical, Calendar, Intake and Dashboard. Reports stays parked until it is real, and nothing routes to it from the shell.
- **Diagnosis of Practice settings, done 2026-09-21 at `6981f52`, acted on in UI-6f/UI-6g and recorded as [D-087](decisions/D-087.md).** The earlier framing here was wrong on a point that changed the slice, so it is corrected rather than repeated. `settings` renders `PracticeStaffWorkspace` (`app/components/global/PracticeStaffWorkspace.tsx`, 458 lines, rendered only from `GlobalWorkspaceShell.tsx:654`). It is titled **People** and owns exactly one thing: **organization administration** — provisioning a user, clinical role, membership role, membership status, patient-access scope, activation-link issuance, login-lockout clearing, and deactivate/reactivate.
  - It does **not** own the practice's default layouts. Those are already under profile/preferences: `WorkspaceProfileMenu`, `WorkspaceTopBar` and `PresetManagementModal` consume `app/lib/workspace-templates.ts` against `/api/organization/workspace-templates`. The "part preferences" half of the old framing rested on a role-*hint string* inside `PracticeStaffWorkspace` ("Sets the practice's default layouts") that describes what an owner can do elsewhere, not a control this surface hosts.
  - So the three-way overlap this entry feared does not exist. There is no preferences half to separate, and no HR half: HR (D-086) owns personnel material — insurance, licensing deadlines, coachings, goals — while this owns accounts and access. The two touch the same people and share no data, no service and no permission (`manage_organization` vs `manage_hr`).
  - That made the remaining work a **rehome and a rename**, not a decomposition. Done in UI-6f/UI-6g below: the account menu became the owner rather than the Preferences menu beside it, gated on `manage_organization` ([D-087](decisions/D-087.md)); the path was proven first; then `Practice -> Practice settings` and Practice itself were removed. The surface issues activation links, and the constraint that its new home must not be reachable more loosely than the old one is met by a stricter gate, with the `403` asserted rather than the hidden control trusted.

### UI-6d — HR: everyone's own record, and a boundary around everyone else's

Status: **Verified complete** for the authority boundary, the self-service record, and both presentations. Assignment UI is not built.

Owner direction, 2026-09-21: *"Everyone should have an HR tab, but only manager and owner / HR personal has access to other employees. The rest will have access to what is designated for them. Most likely insurance, licensing timeline and deadlines, coachings, goals, etc. It is assigned by office manager or owner."* Recorded as [D-086](decisions/D-086.md), which amends D-085's Staff/HR placement only.

- **Why this was urgent.** The `hr` module rendered a hard-coded roster of every employee's NPI, DEA number, license expirations, malpractice policy and FTE to any authenticated user, with no permission check. Nothing real leaked because the roster was fixture literals — but a screen whose only protection is that its data is fake cannot later be given real data.
- **Authorization.** New `manage_hr` permission, held inherently by organization owners and managers and grantable by them to a specific member through `organization_memberships.hr_access`. Clinical role grants nothing: a provider — the highest clinical role — is refused the directory. A member's own record needs no permission at all. Refusals are `403` with an explicit message, never an empty directory.
- **Data.** `hr_records` and `hr_record_items` (migration `2026-09-21-001-hr-records-and-designation`). One item table with an open category rather than four tables, because insurance, licensing deadlines, coachings and goals differ in what they mean to the practice, not in what the record stores — and the owner said "etc.".
- **Presentation (both, per the owner).** HR is a major workspace in the `+` launcher and a companion pinned to the right rail by default, reaching the same records through the same service. The companion shows only the viewer's own deadlines, soonest first; the directory is the workspace's job. Home's three major entities are unchanged.
- **Reaching existing layouts.** The `appliedRailBackfills` mechanism built for UI-5 now carries a list, so a saved rail that predates HR receives it once, beside Communication, and a later unpin still sticks.
- **Honesty.** The workspace states that credentialing and primary-source verification are not configured, and that the dates shown are what the practice recorded rather than verified status. License and DEA numbers are not invented in the synthetic fixtures; they read as pending verification.
- **Practice decomposition.** With HR owning the capability, `Staff directory` left the Practice menu (UI-6d). Practice now holds only `Practice settings`.
- **Evidence:**
  - Unit: `tests/hr-access-boundary.test.ts` — own record for all four personas; directory for owner, manager and designated member; refusal for an undesignated provider at both the directory and a named colleague; the self case still resolving through the call that refuses others; the designation granting `manage_hr` and *not* `manage_organization` or `view_financial`; and revocation taking the access but not the member's own record.
  - Browser: `tests/browser/hr-workspace.spec.ts` (6/6) — no People tab rendered for a provider, a 403 at the API rather than an empty list, owner and designated-member access, the companion's deadline ordering and escalation, and expand/redock with the rail reachable.
  - `tests/browser/practice-decomposition.spec.ts` (11/11) and `workspace-catalog`, `workspace-open-launcher`, `workspace-layering`, `prototype-containment` green.
  - Inner loop: `npm run check` (419/420 unit tests; the one failure is the pre-existing date-dependent defect below) and `npm run build`.
- **Assignment UI:** delivered as UI-6e below. At the close of UI-6d the service and schema supported assignment and the screens did not; that gap is now closed.

### UI-6e — HR assignment: creating records, assigning items, granting the designation

Status: **Verified complete** at working tree on 2026-09-21, from `3fa7500`.

UI-6d left HR readable and bounded but read-only: the service and schema supported
assignment, no screen did, and every record came from the seed. This closes that.

- **Two write authorities, not one.** D-086 named the owner's rule — "it is assigned by
  office manager or owner" — and implementing it forced the distinction the ADR now
  records. *Assigning* (setting up a record, adding an item) takes `manage_hr`: owners,
  managers, and a designated HR administrator, because doing HR administration is what
  the designation is for. *Designating* takes `manage_organization`: owners and managers
  only. A designated HR administrator can assign all day and cannot designate anyone —
  an access grant that reproduces itself without an administrator is not a boundary.
  A member holding neither cannot author HR material at all, including their own, which
  is the ADR's "an employee does not author their own HR record".
- **Refused, not disabled.** The designation is refused outright for an owner or
  manager, who already hold HR access inherently. A toggle that appeared to grant what
  is already held, and to revoke what it cannot take away, would be lying about who can
  read personnel data.
- **Separate acts, separately audited.** Assigning an item to a member with no record is
  refused rather than quietly creating one: setting somebody up is its own act with its
  own `hr_record_assigned` entry, and a personnel record that appeared as a side effect
  would hide that it happened. Designation changes write `hr_access_designation_changed`.
- **The screen reflects a server decision.** `/api/hr` and `/api/hr/directory` now carry
  `canAssign` and `canDesignate` beside `canReadOthers`, so a control is never offered
  for an act the next request would refuse — and every write re-reads the directory
  rather than merging locally, so what the screen shows is what was stored.
- **A fixture must not outrank a real assignment.** The seed rewrote every HR record on
  every boot, which was harmless while nothing else could write and would have silently
  deleted assigned items and reset granted designations the moment something could.
  `hr_record_items.source` (migration `2026-09-21-002-hr-item-source`, backfilling
  existing rows to `seed`) makes the origin explicit: the seed refreshes only rows it
  authored, leaves records it has already created alone, and applies a designation only
  when first establishing a record. Without the backfill the seed would also have hit a
  primary-key conflict on the next boot of any existing database.
- **Deferred with reason:** editing and removing an assigned item. Personnel-record
  retention is its own decision — what may be deleted, by whom, and what survives — and
  guessing it inside an assignment slice is how a retention rule gets set by accident.
  A typo is currently corrected by assigning a replacement.
- **Evidence:**
  - Unit: `tests/hr-assignment-authority.test.ts` — who may assign and who may designate
    across all four personas; a member refused authoring even their own record; setting
    up a record that does not exist (`team-taylor`, the one seeded member without one);
    an item refused before its record exists; validation refusing an empty title, an
    impossible date (`2027-02-31`) and an unknown category; a target outside the
    organization refused; a granted designation actually opening the directory and a
    revoked one closing it; the refusal for an owner or manager; and a re-run of
    `ensureHrSeed` leaving assigned items, employment details and a granted designation
    untouched while still refreshing its own rows exactly once.
  - Browser: `tests/browser/hr-workspace.spec.ts` (10/10, previously 6) — an owner sets
    up a record, assigns an item and finds it stored as `source: "assigned"`; a
    designated HR administrator gets the assignment forms, no designation control, and a
    403 from `PATCH /api/hr/designation`; an owner grants the designation and the granted
    member's previously-403 directory returns 200, then revokes it; a provider is offered
    no assignment controls and is refused both writes at the API. The suite restores the
    designation it grants, so it passes twice in a row on the same database — verified.
  - Regression: `tests/browser/practice-decomposition.spec.ts` (11/11),
    `workspace-catalog` (5/5), `workspace-open-launcher` (5/5), `workspace-layering`
    (12/12), `prototype-containment` (2/2) — 34/34 together.
  - Inner loop: `npm run check` — 420/421 unit tests, 0 lint errors, 0 type errors. The
    one failure is the pre-existing date-dependent `intake-workflow` defect below,
    reproduced identically in a clean worktree at `3fa7500` without these changes.
    `npm run build` succeeded; `/api/hr`, `/api/hr/items`, `/api/hr/designation` and
    `/api/hr/directory` all register.
  - Visual, in the running app with synthetic data: 1440x900 and 1280x800 two-column,
    1024x768 with the form rows wrapping and labels intact, and 640x400 (≈1280 at 200%
    zoom) with the People grid stacking to one column. Two layout defects found and
    fixed rather than deferred: `.hr-field`'s `flex: 1 1 14rem` was being read as a
    *height* on the column-direction form and stretching the two-row Detail textarea to
    14rem, and `.hr-people-grid`'s bare `1fr` floored the detail column at its
    min-content width, scrolling the whole People tab sideways at 200% zoom. Empty
    (a member with no record), typical and crowded (five categories) volumes all checked.

### UI-6f — Organization administration moves to the account menu

Status: **Verified complete** at `86c4c02`. Recorded as [D-087](decisions/D-087.md),
which amends D-085's "Settings to profile/preferences".

The additive half of UI-6's last child, taken from the diagnosis above: there was no
three-way split to make, so this is a rehome and a rename.

- **Where it went, and why not Preferences.** The account menu, beside the
  server-verified identity every clinical action uses — not the Preferences menu next to
  it, which owns workspace layout. Putting the administration of accounts and access
  inside the layout menu would have rebuilt the preferences-versus-administration
  conflation the diagnosis dissolved. It is not a Home entity and not a major `+`
  workspace, so the shell invariants are untouched: Home stays Clinical, Billing, Brand.
- **The same path, not a lookalike.** The entry issues `openGlobalModule("settings")`,
  the command the menu entry issued, so focus-existing singleton behaviour comes with it
  rather than being reimplemented.
- **Offered only to whoever may use it.** Rendered when the session's permission list —
  the server's own answer, from `permissionsForActor` via `/api/auth/me` — holds
  `manage_organization`. That is not the boundary: `/api/organization/members` refuses
  with a `403` either way, and the tests assert the refusal rather than trusting the
  hidden control. It matters here because provisioning mints an **activation link**, a
  response carrying a secret; the new home is reachable *more* strictly than the old
  menu entry, which rendered for everyone.
- **The rename.** "Organization administration" in the tab, the workspace header and the
  account menu; "Organization" where a short label is needed. The tool registry's
  "Settings / Preferences and account" was part of why this looked like a preferences
  screen. The module id stays `settings`: saved rails and the persisted module view name
  it, and renaming what a thing is called is not a reason to invalidate a workspace.
- **Evidence:**
  - Browser: `tests/browser/practice-decomposition.spec.ts` UI-6f (5/5) — an owner opens
    it from the account menu and the roster loads; re-opening focuses the existing tab
    rather than stacking a second; the entry is reachable and operable from the keyboard
    alone (avatar, Enter, Tab, Enter), which the migration invariants require of any
    replacement path; a member is not offered the entry; and both the roster read and
    provisioning refuse that member with a `403`.
  - Inner loop: `npm run check` — 420/421 unit tests, 0 lint errors, 0 type errors; the
    one failure is the pre-existing date-dependent `intake-workflow` defect below.
  - Visual, in the running app with synthetic data: account menu and workspace at
    1440x900, 1280x800, 1024x768 and 640x400 (≈1280 at 200% zoom). Screenshots under
    `test-results/ui6-*`. Two defects on this surface found and fixed rather than
    deferred: the "Add someone" button drew `person_add` twice, because `Button`'s own
    `icon` prop was passed alongside a child `Icon`; and `.staff-table-scroll` is a grid
    item, whose default `min-width: auto` is its content, so the wrapper grew to the
    table's width and its `overflow-x: auto` had nothing to scroll — at 200% zoom the
    practice-role and account controls ran off the right edge unreachable. `min-width: 0`
    lets it shrink and scroll.

### UI-6g — Practice settings, and Practice, leave the top navigation

Status: **Verified complete** at working tree on 2026-09-21, from `86c4c02`.

The subtractive half, taken only after UI-6f proved the account menu reaches the same
module. With its last child rehomed the group held nothing a clinician could open, so the
group went with it.

- **What was removed:** the `practice` group and its two items. Reports needed no home —
  the tool registry calls it `planned` and the menu filtered on that, so it never
  rendered a destination.
- **What stayed:** the `settings` module, its renderer, and its registry entry. This
  retires a menu entry, not a capability.
- **Tests moved with the product, not around it.** Assertions that asked "is this still
  in the Practice menu?" became unanswerable, and an unanswerable assertion passes for the
  wrong reason. They now read the whole top navigation with every menu expanded and assert
  the label is offered nowhere — a stricter question than the one they replaced. The UI-5
  source scan in `tests/communication-companion.test.ts` listed `practice` among the
  groups Team's retirement had to leave standing; it now asserts the group is absent, so a
  regression that restored it still fails there.
- **Evidence:**
  - Browser: `practice-decomposition` (16/16), including "Practice itself is gone, and
    nothing it held is stranded" — no work menu offers Billing, Website, Social media,
    Staff directory, Practice settings or Reports, and Clinical, Calendar, Intake and
    Dashboard remain. Regression across `workspace-catalog` (5/5),
    `workspace-open-launcher` (5/5), `workspace-layering` (12/12),
    `prototype-containment` (2/2), `team-retirement` (4/4) and `hr-workspace` (10/10) —
    54/54 together.
  - `tool-navigation.spec.ts` keeps the narrow-viewport menu-fit check on Clinical, and
    its "Reports is filtered out" assertion is now navigation-wide: a destination with
    nothing behind it is offered nowhere.
  - Inner loop: `npm run check` — 420/421 unit tests, 0 lint errors, 0 type errors, the
    same pre-existing failure. `npm run build` compiled successfully.
  - CI at `fb15e1e`: the `validate` job **failed** at *Clinical integration tests*
    (`npm test`). Lint and Typecheck passed; *Production build* and *Browser workspace
    verification* were **skipped** as a consequence rather than run and failed. The same
    step failed at `3538814`, a documentation-only commit, so this is the open defect
    below and not a UI-6 result — but it does mean this slice's build and browser evidence
    is local-only. The job log needs an authenticated download, so the failing test is
    identified from the local run of the same command on the same tree rather than read
    off CI. CI's verdict becomes meaningful again once the fixture repair lands, which is
    the first reason it is queued ahead of UI-7.

### UI-7 — Decompose Clinical one child at a time

Status: **In progress.** UI-7a, UI-7b and UI-7c are complete at working tree on
2026-09-21, from `b8abf78`. Prescribing has a decided owner and no proven one, so its
menu entry and the group stay.

| Clinical child | New owner | State |
| --- | --- | --- |
| Patients | The `+` launcher (and its Recent patients list) | **UI-7a done** — menu entry removed |
| Documents | The `+` launcher, which now reaches the practice Documents queue | **UI-7a done** — the route was repaired first, then the menu entry removed |
| Tasks | The right companion, whose expanded canvas is the practice queue itself ([D-089](decisions/D-089.md)) | **UI-7b done** — the companion was made a replacement first, then the menu entry removed |
| Labs | The `+` launcher, beside the other practice queue ([D-090](decisions/D-090.md)) | **UI-7c done** — the launcher was exercised against the queue's own counts, then the menu entry removed |
| Prescribing | The right companion ([D-090](decisions/D-090.md)) — decided, not built | Open, UI-7d. Blocked on being able to drive a non-empty queue; the entry stays until parity is verified |

- **UI-7a — Patients and Documents.** Both were already offered by the `+` launcher, so
  this looked like a parity proof with nothing to build. Patients was: the launcher issues
  `nav.openPatient` exactly as the menu did, and additionally restores the chart's last
  section and closes an open module, so the replacement is a superset of the command it
  replaces rather than a lookalike.
- **Documents was not, and the gate caught it.** The launcher's Documents opened nothing.
  Neither did the menu's. Neither did the menu's Labs. Diagnosed to
  `WorkspaceNavigationProvider`: `openGlobalModule` set the active module and then
  dispatched `ehr-switch-view`, and the provider's own listener for that event held a
  branch that set the active module back to `null` for exactly `documents` and `labs`.
  `use-persistent-workspace-tabs` held the matching branch. The premise — that the two are
  chart surfaces rather than module workspaces — is half right: the chart has Documents
  and Labs *sections*, and the practice has Documents and Labs *queues*. Nothing dispatches
  the event for the sections, so the branch only ever cancelled the command that emitted
  it. Both practice queues were unreachable from every surface in the shell from `948f003`
  (2026-09-18) until this slice. Removing both branches restored them; being ineligible for
  a tab is already `isTabEligibleModule`'s answer and does not need a second, contradictory
  expression as a refusal to open. The rule this violated is recorded as
  [D-088](decisions/D-088.md), amending D-081.
- **This closes the dead end CB-5 recorded** as "Labs and Documents are unreachable from
  navigation … P6 dead-end work, tracked separately". CB-5 had the symptom and the
  location right; the cause was a shell regression three days old, not missing queue work.
- **The count came with the destination.** The Clinical menu showed a standing
  unreviewed-documents count, published by `PracticeQueueWorkspaceShell` at load, and it
  was the shell's only ambient view of that queue. `useWorkspaceBadgeCounts` is now the
  one place that count is read, the `+` launcher renders it beside Documents, and the
  browser test compares it against the queue's own `Received` and `Needs review` filter
  counts rather than a literal. `WorkspaceTabStrip` holds the subscription because the
  popover is mounted only while open and would miss a count published before it opened.
- **Repaired en route, in the visual matrix.** At the matrix's 200%-equivalent viewport
  (720x450) the launcher popover ran off the right edge and clipped its own close
  control: its positioning clamp reserved 360px while `.open-workspace-popover` draws
  `min(380px, 100vw - 16px)`. Pre-existing, and tolerable while the Clinical menu was a
  second way in — not tolerable once this popover is the only route to Patients and
  Documents. The clamp now uses the same 380, and a spec case holds the popover inside
  the viewport with its dismissal reachable.
- **Evidence:**
  - Browser: new `tests/browser/clinical-decomposition.spec.ts` (7/7) — the launcher opens
    a chart from Home and focuses the already-open chart instead of docking a second tab;
    it opens the Documents queue; the unreviewed count in the launcher equals the queue's
    own `Received` plus `Needs review`; Clinical holds exactly Tasks, Labs and Prescribing
    and each still opens its surface; Patients and Documents are offered nowhere in the
    top navigation; the popover fits a 720x450 viewport; and the group itself stays until
    its remaining children are rehomed.
  - This is the first browser coverage either practice queue has ever had, which is why a
    three-day-old regression survived lint, types and 425 unit tests.
  - `tool-navigation.spec.ts`'s keyboard case now expects Tasks first in the Clinical menu.
    The contract under test is the keyboard behaviour, not the membership list.
  - Inner loop: `npm run check` — 425/425 unit tests, 0 lint errors, 0 type errors.
    `npm run build` exits 0.
  - Full browser suite on a deleted database: **163 passed / 5 failed of 168**, against a
    recorded baseline of 155/5/1 of 161 at `832a6a7`. Same five specs, no new failure, and
    the previously flaky `communication-companion` passed without a retry. Because this
    slice changes the launcher, `workspace-open-launcher` was not assumed pre-existing: it
    passes 5/5 alone on a fresh database, and the five-spec subset returns **21 passed / 4
    failed** — the same four tests, and the same figures, the baseline records at both
    `44ece69` and `832a6a7`.
  - Visual matrix at 1440x900, 1280x800, 1024x768 and 720x450 (200%-equivalent), with the
    synthetic clinic day: launcher, Clinical menu, the restored Documents queue and Home.
    Labels stay visible, the menu's Tasks and Labs counts are intact, and the queue's own
    `Received (1)` and `Needs review (2)` agree with the `3` the launcher shows.

- **UI-7b — Tasks.** The directive lists Tasks among companion tools, a companion for it
  was already pinned to the right rail by default, and it was still not a replacement.
  The menu's Tasks opened the practice queue as a labelled workspace tab with filters,
  patient links, completion, removal and a standing open-task count. The companion could
  add and tick; it could not filter, could not remove, could not reach a linked chart,
  had no expanded presentation at all, and called itself a "Personal clinical action
  list" while `GET /api/tasks` returned the practice queue. Deciding ownership was the
  easy half; the parity was the work.
- **One queue, two presentations.** `PracticeTaskQueue` is the queue the `tasks` module
  rendered, lifted out and rendered by both the module and the companion's expanded
  canvas. Two lookalike task lists would have drifted, and the first thing to drift is
  what a count means. What belongs to a presentation stays with it: each caller owns its
  filter and draft, and each supplies `onAddTask`, because a task added beside a chart is
  that patient's and one added from the practice queue is the practice's. Completing and
  removing announce `ehr-tasks-updated` after the server saves, and every surface showing
  the queue reloads from that one event — verified in a browser by adding from the
  expanded companion and watching the docked list, the module's filters and the rail's
  count move together, then removing it and watching them move back.
- **The tab came too.** A companion overlay cannot be a persistent labelled tab that
  survives reload beside an open chart, which is what the menu's Tasks opened. The
  companion therefore carries `Open Full Tasks Workspace`, the control HR and the compact
  Calendar already use, and the `tasks` module keeps the routes the omnibox planner,
  Clinical AI and the Communication companion already use. Nothing about this slice makes
  the module a second implementation: it renders the same component.
- **The count followed the destination**, by UI-7a's rule. `useWorkspaceBadgeCounts` is
  unchanged; the companion rail now reads it, and the open-task count the Clinical menu
  used to carry sits on the rail's Tasks button. The browser test compares it against the
  queue's own `Open (n)` rather than a literal.
- **Repaired en route.** Expanding any companion while a module workspace was open
  painted it *behind* the module — `--z-chrome-base` (18) against
  `--z-global-workspace` (28) — so the clinician saw nothing happen. Pre-existing since
  UI-4 and invisible while no companion owned a destination that also has a module tab.
  An expanded companion is now `--z-companion-expanded` (30), above the workspace it was
  expanded over and below every popover and menu.
- **Corrected with the move:** the docked panel's subtitle. It named a personal list;
  the endpoint returns the practice queue, and the panel is now the surface that owns it.
- **Evidence:**
  - Browser: `tests/browser/clinical-decomposition.spec.ts` gains a UI-7b describe (6
    tests, 13/13 in the file) — the expanded companion carries compose, all four
    filters, completion and removal with the rail still reachable; the rail's count
    equals the queue's own `Open`; a draft and a chosen filter survive expand, redock
    and expand again; Escape redocks before it dismisses; an add moves the queue and the
    count together and a removal puts both back; and the companion still opens the Tasks
    workspace tab. Tasks is then checked to be offered nowhere in the top navigation, and
    Clinical is checked to hold exactly Labs and Prescribing, each still opening.
  - `tool-navigation.spec.ts` exercises Prescribing where it used to exercise Tasks, and
    its keyboard case expects Labs first. The contracts under test — a menu destination
    opening over the workspace without taking the chart's tab away, and ArrowDown
    reaching the first child — are unchanged.
  - `ui-system.spec.ts` reaches the queue through the companion, expanded, the way its
    `railTool` helper already reached the Inbox through the Communication companion after
    UI-5. Its two task cases are the shared interaction system's own gate — a disabled
    control that says why, a filter that announces its pressed state and answers the
    keyboard — and they now hold on the surface that owns the queue. **They failed first.**
    A full run before this change returned 7 failures rather than the baseline's 5, and
    the two extra were these: the helper was still opening the Clinical menu. That is the
    mechanism the handoff warns about, working: a known-failing family is not a waiver,
    and every failure gets attributed before it is dismissed.
  - Unit: new `tests/task-queue-ownership.test.ts` (4/4) holds the ownership invariants
    the browser cannot see: the Clinical group offers exactly Labs and Prescribing;
    neither the module nor the companion grows its own queue rows; a saved change is
    announced and both surfaces subscribe; and a reload does not re-announce, which is
    what keeps the listeners from feeding each other.
  - Inner loop: `npm run check` — 429/429 unit tests, 0 lint errors, 0 type errors.
    `npm run build` exits 0.
  - The patient binding was checked by hand rather than assumed, because it is the one
    behaviour the two callers deliberately do differently: with David Kim's chart open,
    a task added from the docked box came back from the API bound to `david-kim` and due
    Today, while one added from the expanded queue is a practice task. The rail count
    moved with each and returned when the task was removed.
  - Full browser suite on a deleted database: **169 passed / 5 failed of 174**, against a
    recorded baseline of 163/5 of 168 at `e4ac7cd`. Same five specs, no new failure, and
    the six added tests pass. Because this slice changes the companion rail, which nearly
    every spec renders, `workspace-open-launcher` was re-checked rather than assumed: it
    passes 5/5 alone on a fresh database, and the five-spec subset returns **21 passed / 4
    failed** — the same four tests, and the same figures, the baseline records at both
    `44ece69` and `832a6a7`.
  - Visual matrix at 1440x900, 1280x800, 1024x768 and 720x450 (200%-equivalent): the
    expanded companion fills the canvas at every size with the rail and its count still
    on screen, and the docked panel keeps its compose box, its list and its workspace
    escalation at 720x450.
- **Deferred from this slice with reason:** one Escape press dismisses both the expanded
  companion and an open module underneath it. Recorded under the migration directive
  above; it needs a shared topmost-layer rule rather than another per-surface listener.

- **UI-7c — Labs, and the decision Prescribing could not be given.** The queue entry
  named both children. Exercising them separated them: one was UI-7a repeated, and the
  other could not be finished at all.
- **Labs is Documents' twin.** The same `PracticeQueueWorkspaceShell` renders both,
  neither is eligible for a workspace tab, each publishes a standing count, and each row
  opens the patient's chart at the matching section. Nothing about it argued for a
  different surface from the one Documents reached, so it is offered beside Documents in
  the `+` launcher and the unacknowledged-result count moved with the destination. The
  catalog entry reads "practice results awaiting acknowledgement" rather than "Labs",
  because the chart has a Labs *section* and the practice has a Labs *queue* — treating
  those as one thing is the mistake [D-088](decisions/D-088.md) records.
- **This time the replacement worked.** Unlike UI-7a's Documents, the launcher route
  needed no repair: D-088 had already removed the branch that cancelled
  `openGlobalModule("labs")`, and the launcher's Labs opens the queue through the same
  controller command the menu issued. What the slice added was the catalog entry, the
  launcher's "already open" reading for a module that cannot hold a tab, and the count.
- **Prescribing was decided and not implemented**, which is the honest half of this
  slice. [D-090](decisions/D-090.md) settles that its owner is the right companion, and
  argues it from the prescribing workflow: every action `PrescriptionOperationsWorkspace`
  offers is gated on the patient's chart being the *active* execution context; a
  full-canvas module and a chart cannot both own the active tab; therefore the queue can
  never execute its own actions from its own surface. The companion layer is the one that
  coexists with an open chart, and the per-patient half of the workflow already has a
  working owner in the chart's Medications section (`PatientPrescriptionWork`, which
  carries the same recovery actions and works because the chart is active by
  construction).
- **It could not be proven, so the entry stayed.** `prescription_transactions` is the
  queue's only source, and a transmission is refused before a transaction row exists when
  no adapter is enabled — verified in a browser by prescribing Bupropion XL 150 mg for
  Maya Chen and authorising it: the order reached `authorized`, `PATCH /api/orders`
  answered `External prescribing integration is not enabled for adapter
  drfirst-placeholder.`, and no transaction was written. The queue is structurally empty
  in any checkout of this repository, so its detail pane, patient-context gate, retry and
  evidence forms are unreachable. A companion built against that would be provable for
  the shell and unprovable for everything the menu entry reaches. Standing up a simulated
  transport to fill the queue is explicitly rejected, not merely skipped: it is the
  fabricated-transport-evidence failure AGENTS.md forbids, in the area where it is least
  acceptable.
- **Open defect, found here and owned by UI-7d.** "Activate patient chart" in the
  prescribing detail pane calls `openPatient`, which clears the active module and
  unmounts the workspace the clinician was working from, while every other control on
  that pane is disabled because `patientContextMatches` is false — as it always is from
  that surface. The tab survives so nothing is lost, but the recovery actions cannot be
  completed from the queue as it stands. The repair belongs to the move.
- **Evidence:**
  - Browser: `tests/browser/clinical-decomposition.spec.ts` gains a UI-7c describe (4
    tests, 17/17 in the file) — the launcher opens the Labs queue with its rows and its
    acknowledgement control, and Labs is offered nowhere in the top navigation; the
    launcher's count equals the queue's own `Needs review`; a second visit reports
    `Active` and does not grow a tab a non-tab-eligible queue cannot hold; and both
    practice queues are reachable from the one surface that now owns them, the second
    replacing the first rather than opening beside it.
  - `tool-navigation.spec.ts`'s keyboard case now expects Prescribing, the group's only
    remaining child, and additionally holds that the list still wraps rather than
    trapping focus. The contract under test — ArrowDown reaching the first child — is
    unchanged.
  - `ui-system.spec.ts`'s `railTool` fallback was re-pointed in comment only: it is
    called with `Inbox` and `Tasks`, both of which reach their companions.
  - Unit: `tests/workspace-catalog.test.ts` gains a D-090 case (the two practice queues
    are offered adjacently, Labs targets the labs module, stays a Clinical workspace, is
    findable by "results", and its description distinguishes the practice queue from a
    chart section) and its canonical-order case gains `labs`.
    `tests/task-queue-ownership.test.ts` now asserts the Clinical group offers exactly
    `prescribing`, so a regression that restored Labs to the menu still fails there.
  - Inner loop: `npm run check` — 430/430 unit tests, 0 lint errors, 0 type errors.
    `npm run build` exits 0.
  - Full browser suite on a deleted database: **173 passed / 5 failed of 178** — the same
    five specs the baseline records, no new failure, and the four added tests pass.
  - **An earlier run of the same tree returned six**, and the extra was reported rather
    than absorbed. `synthetic-visit`'s sign step timed out waiting for the signed
    record's Close button after the attestation was submitted. It passes alone on a fresh
    database (2/2), it passed in the repeat full run, and the base SHA `b8abf78` was
    re-run from a stash on a deleted database and returned exactly **169 passed / 5
    failed of 174** with `synthetic-visit` passing — so the failure is not this slice's,
    and it is not one of the recorded five either. It is a new intermittent under full-
    suite load, recorded in the open-defect section below rather than counted as known.
  - Because this slice changes the launcher, `workspace-open-launcher` was re-checked
    rather than assumed: with `workspace-catalog`, 10/10 on a fresh database.
  - Visual matrix at 1440x900, 1280x800, 1024x768 and 720x450 (200%-equivalent): the
    launcher carries nine destinations with Labs' count beside it, and at the
    200%-equivalent viewport it still sits inside the viewport (x 186, right edge 566 of
    720) with Labs and its count legible on scroll. The Labs queue keeps all four
    filters with their counts, its search, Refresh and a row's Acknowledge at 720x450.

#### UI-7d — Prescribing leaves the Clinical menu for the right companion, and Clinical leaves with it

Status: **Verified complete** — with one part explicitly unexercised, named below and in [D-092](decisions/D-092.md).

- **Why the companion, and why now.** [D-090](decisions/D-090.md) argued the owner from the workflow: every action the queue offers is gated on the patient's chart being the *active* execution context, a full-canvas module and a chart cannot both own the active tab, so the queue could never execute its own actions from its own surface. D-090 then declined to implement it because the queue cannot be made non-empty without a vendor. The owner decided on 2026-09-21 that the move should happen anyway — *"We don't need to buy DrFirst to get moved what is there"* — and [D-092](decisions/D-092.md) records both that decision and the reason the bar D-090 set was the wrong one: the Clinical menu reached the *same* empty queue, so parity, which is a comparison with the route being removed, was never at risk.
- **One component, two callers.** `PrescriptionOperationsWorkspace` gained a `presentation` prop and is rendered by both the `prescribing` module and the new `PrescribingPanel`, compact when docked and full when expanded. The companion is a container — header, workspace, escalation — and a unit test asserts it carries no second copy of the queue's retry or evidence rules. That is [D-089](decisions/D-089.md)'s contract, and here it is what keeps the unexercisable half from being a divergent copy.
- **The defect D-090 recorded is repaired by the move, in one path.** Before activating a chart, the queue asks for the Prescribing companion through a new general `WORKSPACE_OPEN_COMPANION_EVENT` — a no-op from the companion, and from the module the thing that stops `openPatient` unmounting the queue. The rail honours it only for a pinned tool, so an unknown id cannot conjure a panel. **The line is not exercised by any test**: reaching it needs a selected item. A source test asserts the ordering, which is the part a later edit could get wrong.
- **Nothing lost on the way out.** The `prescribing` module stays registered and the companion escalates to it, so a saved layout holding the tab is not stranded. A rail saved before the companion existed is backfilled with it — unlike the Communication and HR backfills this one prevents an outright loss of capability, because the Clinical menu was those layouts' last route — and a rail that already took the backfill and then unpinned it keeps that choice.
- **Clinical is gone.** Its last child had an owner first, which is the rule UI-6 followed to the end on Practice. Level 1 now holds Calendar, Intake and Dashboard as direct destinations and **no expandable group at all**.
- **What is proven, in a browser on a deleted database.** The companion opens docked and renders the authoritative queue's own summary counts, integration notice and empty state; expanded it holds the canvas with both panes while the rail stays reachable (RIGHT-05); Escape redocks before dismissing; the workspace tab still opens and renders the same component; Prescribing is offered nowhere in the top navigation. And the one that is the whole argument: **the queue stays on screen while a patient chart is the active tab**, with the shell resolving that tab to the patient — the precondition every recovery action reads, which a full-canvas module can never produce.
- **What is not proven, and cannot be here.** The detail pane, the patient-context gate's own controls, retry, and the three evidence forms. Each needs a row in `prescription_transactions`, and a transmission is refused before one is written when no prescribing integration is enabled. No transport is simulated to produce one; D-090's rejection of that stands and is the part D-092 does **not** amend. The honest, vendor-free route to exercising them is recorded under the migration directive above, along with the two things that must happen first.
- **Eight specs used the Clinical menu as their example of "a tool menu", and it is now the only kind of surface the work navigation does not have.** None of them was testing Clinical: they were testing popover dismissal, keyboard access, layering and the destination enumeration, and Clinical was the handy instance. Each was moved to a surface that still exists rather than deleted or loosened — the popover taxonomy in `dismissal` to the account menu, which carries the same three exits; `tool-navigation`'s "a destination opens over the workspace without taking the chart's tab away" to a direct destination; its arrow-key list to the `+` launcher, where `workspace-open-launcher.spec.ts` already owns that contract; the rest to the new enumeration. **A consequence for UI-8:** with no group carrying `items`, `ToolNavigation`'s popover machinery — the `open` state, the panel ref, the placement and the panel's keyboard handling — is now unreachable. It is deliberately left in place here rather than deleted mid-slice, and removing it belongs to UI-8.
- **Evidence.**
  - Unit: `tests/prescribing-queue-ownership.test.ts` (3 new) — one queue not two, the companion registered/pinned/backfilled, and the companion asked for before the chart is activated. `tests/workspace-personalization.test.ts` gains the deliberate-unpin case. `npm run check` **exit 0, 434/434, 0 lint errors, 0 type errors**; `npm run build` exit 0.
  - Browser: `tests/browser/clinical-decomposition.spec.ts` 23/23 on a deleted database, including six new UI-7d cases and the two UI-7a group tests rewritten for Clinical's removal. Full suite on a deleted database: **185 passed / 0 failed of 185**, `npx playwright test` exit 0 — the eight specs the removal broke were repaired first and re-run together (46/46, then 5/5) before the full run.
  - Visual matrix at 1440x900, 1280x800, 1024x768 and 720x450 (200%-equivalent): docked, the summary wraps and the panes stack; expanded, the two-pane layout returns with the rail still clickable; at 720x450 the panel sits inside the viewport (left 288, right 668 of 720) with its close control at 652 and the escalation reachable on scroll.


#### D-093 — the Prescribing companion picks a patient

Status: **Verified complete**, and unlike the queue beside it, exercised end to end.

- **The defect it repairs is one UI-7d shipped.** The practice attention queue is structurally empty in every checkout, so a companion whose only content was that queue offered a clinician nothing to do with a prescription. [D-092](decisions/D-092.md) named the queue's unexercisable surfaces and considered the matter closed; it did not notice that naming the gap still left a tool on the rail that does nothing. The owner's reaction on seeing it — *"Why have a medication order tab without it... I need to be able to pick a patient in the side canvas"* — is the report that found it.
- **Prescribing has two halves and only one needs a vendor.** The cross-patient queue cannot be populated without an enabled integration. A patient's own prescribing work — staged intents, ready to authorize, ready to send, awaiting an external outcome — is populated by ordinary clinical work, because **staging and authorizing need no adapter at all**; only transmission is refused. That half was already implemented and reachable only through the chart's Medications section. The selector reaches it.
- **One component, two callers, again.** Choosing a patient renders the same `PatientPrescriptionWork` the chart renders, so the two cannot disagree about what a clinician may do to a prescription. The panel stays a container and carries no copy of either queue's rules.
- **Picking a patient sets what the pane is about; it never tags a form.** There is still no patient control inside the composer, and there should not be — choosing who a half-composed prescription is for is how prescriptions land on the wrong chart. The selector chooses whose record the pane shows *before* anything is composed, and the binding is explicit the whole way down: `x-ehr-patient-id` on the read, an explicit `patientId` into `orders.openComposer` through a new `onOpenPrescribeFor` that deliberately does **not** reuse `onOpenOrderCart` (which resolves the active chart), and a server that re-derives the patient from the record and refuses a mismatch.
- **The pane says whose it is.** Identity per independently usable pane is an `AGENTS.md` rule and this is the case it exists for: the companion can be on one patient while another's chart fills the canvas. The pane carries name, MRN and DOB of its own, and states the mismatch in words when there is one. The risk is not that a clinician may choose a patient; it is that they may not notice which one is chosen.
- **`WORKSPACE_ORDER_CREATED_EVENT` was declared and never dispatched.** Staging now dispatches it, because this is the first surface where a clinician can stage an order and watch the same panel go on saying the patient has no prescribing history.
- **Evidence.** `npm run check` **exit 0, 438/438**; `npm run build` exit 0. Browser, deleted database: `clinical-decomposition.spec.ts` 30/30 including four new D-093 cases, one of which drives the whole loop — pick a patient while another chart is active, open the composer, confirm it is bound to the companion's patient and not the chart's, stage a real prescription through `/api/orders`, and watch it arrive in the companion's own list as "Ready to authorize". Visual matrix at 1440x900, 1280x800, 1024x768 and 720x450: at the 200%-equivalent the panel sits inside the viewport (right edge 668 of 720) with the selector, both identity actions and the escalation all reachable.
- **What it does not change.** [D-092](decisions/D-092.md)'s unexercised list stands exactly as written: the *practice queue's* detail pane, patient-context gate, retry and evidence forms still need a non-empty `prescription_transactions`. Nothing here simulates a transport.


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
- one grounded planner path shared by the omnibox, Home, and Clinical AI companion, with permission-aware context, stale-response protection, explicit unsupported/unknown behavior, and human-confirmed consequential actions;
- staged static-quality tooling, PatientWorkspace decomposition, typed application navigation/coordination, and CSS ownership/stacking boundaries (D-079 through D-082).

Real PHI remains prohibited until the production-readiness gate is intentionally satisfied.

## Review evidence and open defects

The CB cleanup sequence is now materially implemented through CB-5a. The table below describes current `main`, not the pre-CB review snapshot:

| Surface | Current implementation | Remaining active gap |
| --- | --- | --- |
| Shell / Calendar | CB-3 closed the Home/tab contrast and non-color status-cue gaps. Calendar uses compact headers, tonal events, quarter-hour creation, and a fixed 96px/hour vertical scale; visually overlapping events tile horizontally instead of stretching time. CB-5a also repaired the Calendar/browser regressions without weakening scheduling conflict rules. | No open CB-3/CB-5a validation gap is currently recorded; later Calendar work should be treated as new scoped product work, not baseline repair. |
| Patient overview | CB-4 removed the duplicate identity banner, consolidated secondary card controls, preserved per-pane identity, elevated primary clinical actions, and retained hide/restore behavior. | No open CB-4 product gap is currently recorded; broader chart work belongs to later phase gates. |
| Dashboard / queues | CB-5 made the roster dominant, removed repeated day/count summaries, moved queue counts onto actionable filters, preserved layouts/presets, and compacted Intake filtering. UI-7a repaired the Labs/Documents navigation dead-end CB-5 recorded: it was a shell regression in the navigation controller ([D-088](decisions/D-088.md)), not missing P6 queue work, and both queues now open and carry browser coverage. | No open queue-navigation gap. Queue *resolution* workflow remains P6. |
| AI | CB-1 routes the companion, Home, and omnibox through the shared planner boundary with stale-response and patient-scope protections; canned clinical/clinic-day facts were removed. | Broad model/agent expansion remains deferred until the authoritative manual workflows and P12 gate justify it. |
| Communications / practice | CB-2 removed simulated external success and clearly separates real internal operations, local drafts, disconnected capabilities, and synthetic previews. | Live fax/email/SMS/social/lab/reminder/payment/clearinghouse transports remain vendor/access dependent rather than product-completeness claims. |

**Historical review evidence:** [run 35464310622](https://github.com/Logancarton/EHR/actions/runs/35464310622) captured the original 2026-09-19 pre-CB baseline: lint/typecheck passed and 380 of 381 tests passed, with the tentative-booking 409 that CB-0 subsequently diagnosed and repaired. Keep this run as provenance, not as the current health summary.

**Latest validated slice evidence:** CB-5a completed at `ae0850bbd988b29ad60a61fb1a3f0d7be4787ee8`. CI run [35516899267](https://github.com/Logancarton/EHR/actions/runs/35516899267) passed lint, typecheck, clinical integration tests, production build, Chromium installation, and the complete browser workspace verification with **103/103 Playwright tests passed**.

**Browser-gate history:** green at `ae0850bbd988b29ad60a61fb1a3f0d7be4787ee8` when CB-5a closed, which is when CB-5a stopped blocking CB-7. It went red afterwards, CB-0b returned it to green on 2026-09-21 at **179/179**, and UI-7d left it green at **185/185**. The only failure since is the recorded `synthetic-visit` intermittent. Read the entries immediately below before quoting this line, and re-run the suite before quoting a figure: one member of the old group was an intermittent, and it has not been repaired.

**Closed — the unit half of the calendar-day-dependent defect.** `tests/intake-workflow.test.ts` failed on 2026-09-21 because the shifted seed fixture `apt-tue-1` landed on its hardcoded 2026-09-25 10:00 AM slot. Verified identical at `2f7592e`, `3fa7500` and `3538814`, each with none of the work under test present. Repaired as **CB-0a**: a unit-test database is created without the demo clinic day, so no shifted fixture can arrive on a date a test wrote down as empty, on any calendar day. `npm run check` is green at 425/425. No assertion was weakened.

**Closed — the browser half of the calendar-day-dependent defect, and three failures that were never part of it.** Repaired as **CB-0b** at `fa5fb37`..HEAD. The entry this replaces described a *family*, and a family is not a diagnosis: reproduced on a deleted database at `fd26cc3` the group was **172 passed / 6 failed of 178**, and the six had four different causes. Each is now named with the commit that caused it.

- **`dismissal` and `home-assistant` — stale since UI-2 (`8a573ee`).** Both waited 45s for `getByRole("button", { name: "EHR" })`. The Home tile that leads back into the clinical workspace was labelled "EHR" until UI-2 made Home present the three major suite entities, where it became **Clinical**. Repaired by addressing it as `.zen-shortcut-item[data-workspace-id="clinical"]`, which the next rename cannot break and which cannot also match the top bar's Clinical group. No assertion changed.
- **`calendar-interval-jump` — stale since `94cdc8e`.** It drove `.interval-chip`, `.companion-active-interval-banner` and `.calc-days-input`: a companion-only scheduling UI removed on purpose when the Calendar companion became the same `CalendarWorkspace` the Calendar tab renders. Rewritten against what replaced it, and now asserts the date the calendar lands on (a `.gcal-preset-pill` is `active` only while the view is on that interval's target) rather than a banner's label.
- **`tool-navigation`'s CB-3 case — the real fixture-week defect.** Reproduced in isolation on a deleted database: `.gcal-event-row` filtered on `"Jordan Reed"` resolved to **two** elements, `apt-5` (waiting, 04:30 PM) and `apt-mon-1` (scheduled, 09:30 AM), which the +17-day shift pulled into one displayed week. Repaired at the fixture boundary — see [D-091](decisions/D-091.md) decision 2 — because the set expresses two relationships and was placed with one offset: the anchor's week is written in *days* (yesterday, today, tomorrow) and the block after it in *weeks* ("Upcoming Week"). Each is now placed by its own relationship, so today is always the anchor day and next week's Monday is a Monday next week. Verified over 400 consecutive clinic days: today is the six-visit clinic on every one, no slot collides, and the patient seen today and again next week is never drawn into one displayed week. The trade is stated rather than discovered: **weekday identity is deliberately not preserved**, so an install on a Sunday gets a Sunday clinic, and the spec reaches the clinic day through `.gcal-week-header-col.is-today` as its own comment always said it wanted.
- **`workspace-open-launcher` — a real product defect, not flake.** It failed only in full runs and passed alone, which had been filed as shared-database instability. The cause is exact: the launcher offered `roster.slice(0, 5)` and the roster is ordered by name, so on the demo roster Maya Chen sits **fifth of six** and any patient a run registers ahead of her pushes the chart under test off the list. That also broke UI-1's own rule — a chart whose patient sorts sixth could not be focused from the launcher at all. Open charts now come first, the active one at the top, and `an open chart is offered even when its patient sorts past the end of the list` guards it with Sofia Martinez, who sorts last; it fails against the old ordering.
- **`synthetic-visit` — the intermittent UI-7c recorded, still intermittent.** It failed in the `fd26cc3` baseline run and passed in the CB-0b run of the same suite, with nothing between the two that touches it. It stays recorded on its own evidence rather than merged into anything.

**Current browser gate: 188 passed, 1 failed of 189** (full suite, deleted database, 2026-09-21). The one failure is `synthetic-visit`, the recorded intermittent: same locator, same line, same signature, and it passes 2/2 alone on a deleted database. It is **not repaired** and is not treated as a waiver. The suite was 185/185 after UI-7d and 179/179 after CB-0b; D-093 added four cases. An intermediate run at 177/1 of 178 was taken before the launcher repair landed in the same slice; the remaining failure was the launcher case that repair addresses, and the count rose to 179 because CB-0b adds one test. `synthetic-visit` is **not** declared repaired: it is a known intermittent that failed under full-suite load during UI-7c and again in the `fd26cc3` baseline, and has passed in the two runs since. A green run is evidence about that run. Re-run the suite before quoting a figure.

Standing rules, unchanged and still earned: do not weaken assertions; attribute a failure on its own evidence before adding it to any recorded defect, including the ones already inside it; delete `test-results/browser-ehr.db*` before a run that is meant to mean something; and do not edit source while a run is in flight, because the suite's dev server recompiles underneath it. `next dev` also rewrites `next-env.d.ts`, which `repository-hygiene.test.ts` catches — put it back before committing.

**Open — the suite shares one mutable database across every spec.** This is what is actually left of the old family, and it is now the only entry in it. `care-completion` books real follow-ups four weeks after an origin visit it dates a few weeks back, for two patients already on the demo schedule, so its bookings land inside the demo practice's current week; in the `fd26cc3` full run that put a *third* Jordan Reed at 11:00 AM into the week `tool-navigation` was reading. CB-0b made that spec take its own future bookings back out ([D-091](decisions/D-091.md) decision 3), which is the fix that costs nothing, but the structural problem remains: any spec may write into the practice every later spec reads, and `synthetic-visit` is still intermittent under full-suite load. Isolating the database per spec (or per file) is the next bounded repair and is larger than a cleanup rule.

**The surveys below are historical.** Each counts "the same five specs" as one family, which CB-0b showed they never were; read them for the run-to-run figures and for what each slice re-checked, not for the diagnosis. The attribution above supersedes their grouping.

**Re-surveyed during UI-7c (2026-09-21), full suite on a deleted database: 173 passed, 5 failed of 178.** The same five specs, and the four added tests pass. The interesting part is a run that was *not* clean, and what it cost to attribute rather than absorb: an earlier full run of the identical tree returned **172 passed / 6 failed**, the sixth being `synthetic-visit`'s sign step, which timed out waiting for the signed record's Close button after the attestation was submitted. It is **not** a member of the family below and it is **not** this slice's: `synthetic-visit` passes alone on a fresh database (2/2), it passed in the repeat full run, and the starting SHA `b8abf78` was restored from a stash and re-run in full on a deleted database, returning exactly **169 passed / 5 failed of 174** with `synthetic-visit` passing. So it is a new intermittent that appears only under full-suite load, first observed here, and it should be attributed on its own evidence next time rather than folded into the five. `workspace-open-launcher` was re-checked rather than assumed because UI-7c changes the launcher: with `workspace-catalog`, 10/10 on a fresh database.

**Re-surveyed during UI-7b (2026-09-21), full suite on a deleted database: 169 passed, 5 failed of 174.** The same five specs, and the six added tests pass. Two points worth keeping. First, a run taken *before* this slice's test updates returned **7** failures, and the two extra were the slice's own: `ui-system`'s `railTool` helper still opened the Clinical menu to reach Tasks. The family below is not a waiver, and reading a count rather than the list would have hidden a real break. Second, do not edit source while a run is in flight — the suite's dev server recompiles underneath it, and a run taken across an edit cannot be quoted. Because UI-7b changes the companion rail, which nearly every spec renders, `workspace-open-launcher` was re-checked rather than assumed: 5/5 alone on a fresh database, and the five-spec subset returns 21 passed / 4 failed — the same figures and the same four tests as at `44ece69` and `832a6a7`.

**Re-surveyed during UI-7a (2026-09-21), full suite on a deleted database: 163 passed, 5 failed of 168.** The five are the same five specs below; the seven added tests pass, and `communication-companion` passed without the retry it needed last time. UI-7a touched the `+` launcher, so `workspace-open-launcher` was re-checked rather than assumed: 5/5 alone on a fresh database, and the five-spec subset returns 21 passed / 4 failed — the same figures and the same four tests as at `44ece69` and `832a6a7`.

**Survey at `832a6a7` (2026-09-21), full suite on a deleted database: 155 passed, 5 failed, 1 flaky of 161.** Failing: `calendar-interval-jump`, `dismissal` (the home launcher's answer closing on Escape), `home-assistant` (the shared answer card), `tool-navigation` (CB-3 status cues), and `workspace-open-launcher` (opening patient charts from the launcher). Flaky: `communication-companion`'s Team channel, which passed on retry. Every one of these was checked against the baseline rather than assumed pre-existing: the same five specs run as their own 25-test subset on a fresh database return **21 passed / 4 failed at `44ece69` and identically at `832a6a7`** — same four tests, none of CB-0a's changes present in the first. `workspace-open-launcher` passes in that subset at both SHAs and fails only in the full run, which is the shared-database instability described above rather than a fifth member of the fixture-week family.


## Ordered execution plan

This is the only ordered delivery queue. The owner can explicitly override scope. Otherwise take the next eligible slice; do not treat all work here as one giant change. Finish and report a bounded slice before taking another. A slice may use several coherent commits, but it is not complete until its acceptance gate is satisfied.

| Order / ID | Deliverable | Dependency / exit condition | Current state |
| --- | --- | --- | --- |
| UI-1 | Universal `+` Open workspace launcher | Opens/focuses Home, Calendar, Patients, Intake, Documents, Billing, Brand and recent work without duplicate tabs; old top nav untouched | Verified complete |
| UI-2 | Shared Home / `+` workspace catalog | One destination registry; Home = Clinical / Billing / Brand; Staff/HR excluded from major-app launchers | Verified complete |
| UI-3 | Communication companion alongside existing Team menu | New right-canvas route reaches implemented communication capabilities while Team remains | Verified complete |
| UI-4 | Expand/redock Communication canvas with state preservation | Dock/expand/redock/minimize lifecycle passes CB-6 state, focus, resize and restoration gates | Verified complete |
| UI-5 | Retire Team top-bar entry | Only after UI-3/UI-4 parity and browser coverage | Verified complete |
| UI-6 | Decompose Practice one child at a time | Billing/Brand/Staff-HR/Settings/Reports each have verified owners before Practice is removed | **Verified complete** — every child rehomed and proven first; Practice removed last (UI-6g) |
| UI-7 | Decompose Clinical one child at a time | Every clinical child has a verified workspace or companion owner before group removal | **Verified complete** — five children rehomed, Clinical removed last. UI-7d moved Prescribing to the companion on the owner's decision (D-092); the surfaces that need a non-empty queue are named as unexercised |
| UI-8 | Final two-level chrome cleanup | Brand/Home + omnibox + account above labeled tabs + `+`; no left rail | **Unblocked and current** — UI-7 is complete and Level 1 already has no menus |
| CB-0 | Restore the validation baseline | Diagnose the 409; checks, build, and browser baseline actually run | Verified complete |
| CB-0a | Unit suite stops sharing a schedule with the demo clinic day | `npm run check` green on any calendar day, with no fixture, shift or assertion changed | Verified complete |
| CB-0b | Browser suite stops depending on the calendar day, and on controls the product replaced | Every standing browser failure attributed to a named cause and repaired, or left with one named cause | Verified complete — full suite green at 179/179; the shared mutable database is named and scoped as the next repair |
| CB-1 | One trustworthy AI entry path | Shared planner/context/proposals; no canned companion facts | Verified complete |
| CB-2 | Honest external-service and preview states | No simulated operational success through either entry point | Verified complete |
| CB-3 | Readable Home chrome and Calendar state cues | Context-preserving tabs and non-color waiting state | Verified complete |
| CB-4 | Compact patient overview without information loss | Identity/action/alert inventory preserved in every pane | Verified complete |
| CB-5 | Schedule-first dashboard and compact queue filters | Unique facts/actions and saved layouts preserved; DASH-12 honored | Verified complete |
| CB-5a | Repair the browser validation baseline | The 17 remaining pre-existing spec failures diagnosed; booking-conflict group fixed at its cause | Verified complete |
| CB-6 | Consistent companion containers | Draft/context lifecycle survives dock/expand/pop-out | In progress — AI viewport repair verified; broader lifecycle gate pending |
| CB-7 | Certify the complete manual encounter loop (P5) | Recovery matrix and synthetic reopen/amendment path pass | Not started — baseline unblocked |
| P6, P7 | Queue resolution and remaining intake/forms | Continue the phase gates below after CB-7, or bounded independent work explicitly scoped | Existing foundations; gates open |
| P9/P10/P11, P12 | Financial truth, portability, production gates; full synthetic clinic day | External/PHI gates remain binding; broad AI expansion follows P12 | Partial / deferred as described below |

CB-0 through CB-5a, and the later CB-0a and CB-0b baseline repairs, are verified complete. The owner-directed shell migration runs UI-1 through UI-8 in order; UI-1 through **UI-7 are done and UI-8 is the current slice**. CB-6 remains the companion lifecycle acceptance contract and is exercised through UI-3/UI-4 rather than skipped; CB-7 remains the next clinical certification gate after the bounded shell migration or when the owner explicitly reprioritizes it. Bounded P6/P7 work may proceed when explicitly scoped, but it must not bypass P5/CB-7 or the production/PHI gates.

### CB-0 — Reestablish a trustworthy validation baseline

Status: **Verified complete**
- **Diagnosis:** The 409 status on `tests/api-authority-boundary.test.ts:301` was caused by a fixture date collision. In `app/server/db/seed.ts`, seed fixtures are dynamically shifted to align with `practiceToday()`. When `practiceToday()` advanced to 2026-09-19, `apt-2` (10:30 AM – 11:15 AM) shifted directly onto 2026-09-19, conflicting with the test's hardcoded tentative booking at 11:00 AM – 12:00 PM. Moved the test fixture date forward to `2026-11-19` (outside the shifted fixture window), preserving the underlying scheduling conflict rules.
- **Related repairs:** `GlobalWorkspaceShell.tsx` was fixed to ensure withdrawn modules like `financial_integration` are displayed via `ModuleNotBuilt` ("not built yet") upon restore while clearing persisted state (`billing-containment.spec.ts`), and `dismissal.spec.ts` stray-click target was updated to `.browser-tabs` to avoid intercepting the unified Level 1 omnibox.
- **Evidence:** `npm run check` (381/381 tests pass, 0 lints/type errors), `npm run build` succeeds, and targeted browser suites (`billing-containment.spec.ts`, `dismissal.spec.ts`) pass cleanly.

### CB-0a — The unit suite stops sharing a schedule with the demo clinic day

Status: **Verified complete** at `44ece69` + this slice.

- **Diagnosis.** `app/domain/schedule-seed.ts` writes the demo clinic days against one anchor Friday (`2026-09-04`) and `seedDatabaseIfEmpty` shifts the whole set onto `practiceToday()`, so a first install never opens on an empty week. That shift made the unit suite's result depend on the date it ran. The fixture day advances one slot per day until it reaches a date some test wrote down as empty; on 2026-09-21 it reached `tests/intake-workflow.test.ts`, whose 2026-09-25 10:00 AM tentative hold met the shifted `apt-tue-1` and was correctly refused by `assertAppointmentSlotAvailable`. Reproduced at `44ece69` before any change: `AppointmentScheduleConflictError … conflictingAppointmentId: 'apt-tue-1'`.
- **Why not another date.** CB-0 repaired this same class by moving the colliding test's date forward to `2026-11-19`, which the fixture window would not reach until mid-November. It did not survive that long, because the window only has to reach *some* test: two days later it reached `intake-workflow`'s 2026-09-25 instead. Freezing the shift instead only changes whose turn it is, which was checked rather than assumed: with the fixtures written at the anchor and nothing else on the schedule, `appointment-encounter-link`'s `apt-morning` booking raises `AppointmentScheduleConflictError … occupies 2026-09-04 at 09:00 AM, conflicting: apt-1` — the seeded row is `completed`, and `completed` still blocks the schedule. Every variant that keeps a demo clinic day in a unit-test database keeps the collision; only the victim changes.
- **The repair, at the fixture boundary.** A unit-test database is created without the demo clinic day, so it holds exactly the appointments the test under it booked, on any calendar day. `shouldSeedDemoSchedule()` in `app/server/db/seed.ts` reads `NODE_TEST_CONTEXT`, which Node sets in every `--test` worker, so a single file run on its own opts out the same way `npm test` does — which matters, because that is how the failure reproduces. `EHR_SEED_DEMO_SCHEDULE` overrides it either way; `playwright.config.ts` sets it to `"1"` so the browser suite's server keeps the populated practice it drives, rather than inheriting a decision the unit suite made.
- **What did not change.** No assertion was weakened, skipped or rewritten. No fixture row, date, or shift arithmetic was edited: the same 14 rows still land on the same shifted days for development, production and the browser suite, and `seededScheduleDate()` is the same computation the inline shift performed, named so it can be tested directly. Only the roster, encounters, messages, tasks and audit fixtures are still seeded under test; the dated clinic day is the single thing withheld.
- **Evidence.**
  - Unit tests: `tests/seed-schedule-fixture-boundary.test.ts` (4 passed) — a unit-test database has no appointments while keeping its roster; an install still receives all 14 rows moved by one shared offset with clock times untouched; the seeded date is computed correctly across a month end and a leap day; and the opt-out applies to the unit suite only and is overridable in both directions.
  - Regression: `tests/intake-workflow.test.ts` passes. `npm run check` **exit 0, 425/425 unit tests, 0 lint errors, 0 type errors** — the first green inner loop since the collision began. `npm run build` (Turbopack production build) exit 0.
  - Browser seeding unaffected: after a run on a deleted database, `test-results/browser-ehr.db` holds all 14 demo appointments shifted onto 2026-09-21 exactly as before. Full browser suite on a deleted database: 155 passed, 5 failed, 1 flaky of 161, and the five failures reproduce identically at `44ece69` without this slice — see the open defect entry for the side-by-side.
  - Comment accuracy: two stale comments in `tests/appointment-encounter-link.test.ts` that described the seeded practice sharing the test's date were corrected. Neither is an assertion.

**Inspect/reuse:** `app/server/db/seed.ts` (`shouldSeedDemoSchedule`, `seededScheduleDate`), `app/domain/schedule-seed.ts`, `app/lib/practice-calendar.ts`, `playwright.config.ts`, `tests/seed-schedule-fixture-boundary.test.ts`.

**Does not close:** the browser half of the calendar-day-dependent defect, which has a different cause and is re-diagnosed under *Review evidence and open defects*. **Now closed by CB-0b, below.**

### CB-0b — The browser suite stops depending on the calendar day, and on controls the product replaced

Status: **Verified complete** at `fa5fb37`..HEAD.

- **Diagnosis, per failure rather than per family.** The standing browser failures were recorded as one defect — "the fixture week moves under its specs". Reproduced on a deleted database at `fd26cc3`: **172 passed / 6 failed of 178**, with four different causes. Three were specs left behind by changes that were themselves correct (`8a573ee`'s Home tile rename, `94cdc8e`'s calendar-companion consolidation); one was the fixture week; one was a real ordering defect in the `+` launcher; one is an intermittent that had already been recorded separately. The full attribution, with the commit behind each, is under *Review evidence and open defects*.
- **The fixture repair, at the same boundary CB-0a used.** `seededScheduleDate` now places each block of the demo set by the relationship it was written to express — the anchor's week in days, so today is always the anchor day; a later week that many weeks after today's week, keeping its authored weekday. Weekday identity of the anchor is deliberately not preserved, and [D-091](decisions/D-091.md) records why: an empty clinic day on a fresh install is the worse failure, and the fixture weekdays exist only in comments and row ids.
- **The launcher repair.** `OpenWorkspaceLauncher` offered `roster.slice(0, 5)` against a name-ordered roster, so whether a chart could be reached from the launcher depended on the patient's initial — and a chart that was already open but sorted sixth could not be focused at all, which is the one thing UI-1 promises. Open charts now come first, the active one at the top.
- **The shared-practice rule.** `care-completion` books real follow-ups into the demo practice's current week and now removes them again. Its origin visits stay: they are dated weeks in the past, carry the encounter the board reads, and sit outside every week another spec looks at.
- **What did not change.** No assertion was weakened, skipped or rewritten to clear a failure. The two specs whose Home tile moved keep their assertions exactly and change only how they name the control; the interval-jump test asserts more than the deleted version did; `tool-navigation` reaches the clinic day through `is-today`, which is what its own comment asked for. `tests/seed-schedule-fixture-boundary.test.ts` changed because it described the old placement: it now states both relationships and the property the browser case depends on.
- **Evidence.**
  - Unit: `tests/seed-schedule-fixture-boundary.test.ts` (4 passed). `npm run check` **exit 0, 430/430, 0 lint errors, 0 type errors**; `npm run build` exit 0.
  - Placement probe over **400 consecutive clinic days**: today is the six-visit clinic on every one, no slot collisions, and the patient with a visit today and one next week never lands twice in one displayed week.
  - Browser, deleted database: `dismissal` + `home-assistant` + `calendar-interval-jump` 15/15; `care-completion` + `tool-navigation` 9/9; `workspace-open-launcher` + `workspace-catalog` 11/11 with the new ordering case, which fails against the old ordering.
  - Full suite, deleted database: **179 passed / 0 failed of 179**, `npx playwright test` exit 0. An earlier full run in the same slice returned 177/1 of 178, before the launcher repair; its one failure is the case that repair addresses.
- **Inspect/reuse:** `app/server/db/seed.ts` (`seededScheduleDate`), `app/domain/schedule-seed.ts`, `app/components/workspace/OpenWorkspaceLauncher.tsx`, `tests/browser/workspace-fixtures.ts` (`clinicalHomeTile`).
- **Does not close:** the shared mutable browser database. Isolating it per spec is the next bounded repair; `synthetic-visit` remains intermittent under full-suite load until then.

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

Status: **Verified complete**
- **Changes:** Contained all unconfigured prototype communication and practice workspaces (`EmailWorkspace`, `FaxWorkspace`, `PatientCommunicationWorkspace`, `SocialMediaWorkspace`, `HRStaffWorkspace`, `WebsiteManagerWorkspace`, `CommunityWorkspace`, and `TeamCollaborationDock`). Added persistent `practice-banner-notice` banners identifying unconfigured adapters/transports. Removed all fabricated timer-based success toasts ("Secure email dispatched", "CONF-EHR-XXXXX", "Encrypted SMS sent", live website publishing, fake reviews/reach metrics). Outbound messages, faxes, posts, and replies operate in local draft mode, preserving all user input and contact info without data loss. Replaced fictional provider credentials (Logan Carton, MD, NPI 1841920391) with synthetic demonstration identities in unverified states. Internal Team Chat and Tasks in `TeamCollaborationDock` remain fully functional via `teamApi`.
- **Evidence:** Added unit test suite `tests/prototype-containment.test.ts` (4/4 tests passed) asserting no simulated transport claims, credential honesty, banner presence, and team operation retention. Added browser Playwright suite `tests/browser/prototype-containment.spec.ts` (1/1 passed in 4.5s) exercising Email, Fax, SMS, Social Media, and HR workspaces for banner visibility, draft-mode operations, and absence of fake external dispatch strings. Ran `npm run check` (386/386 passed, 0 lint/type errors) and `npm run build` (Next.js build succeeded).

**Requirements:** TRUST-01/02/03, RX-05, DASH-02/11; reuse D-063's containment approach.

**Inspect:** `app/components/team/TeamCollaborationDock.tsx` and `app/components/workspaces/{EmailWorkspace,FaxWorkspace,PatientCommunicationWorkspace,CommunityWorkspace,SocialMediaWorkspace,HRStaffWorkspace,WebsiteManagerWorkspace}.tsx`; their navigation/menu entry points; integration readiness; `BillingWorkspace` and `tests/browser/billing-containment.spec.ts` as examples.

1. Build a capability inventory for both companion and full-workspace views: real internal operations, local drafts, external transport, and fixture previews. Keep working team messaging/tasks and actual record workflows intact.
2. Remove timer/local-state success claims for send/deliver/publish/credential verification. An unconfigured adapter must produce a truthful unavailable state; a local draft must say draft. Preserve draft text and target on failure. Do not invent a live connector to finish this slice.
3. Keep synthetic demonstrations behind explicit preview routing/presentation, separate from ordinary operational data/actions. Never mix fake counts, reviews, delivered faxes, EPCS state, or invented provider credentials with authoritative records. Avoid using Logan's identity with fictional MD/NPI/DEA details in normal UI.
4. Apply the same capability/readiness decision to menus, pop-outs, and full workspaces so another entry point cannot bypass containment. Preview fixtures cannot write into clinical records or imply a verified external connection.

**Verify:** browser tests exercise both entry points with no adapter, transport failure where supported, and any explicit preview. Attempt send/reply/publish and confirm no fake success appears or input is lost. Assert operational metrics are sourced or explicitly unknown, and internal team operations still work.

**Accept:** every visible success has matching authoritative evidence; preview and disconnected states are unmistakable. **Exclude:** activating DrFirst, buying/selecting new vendors, building social/HR/CMS backends, or adding repetitive warning banners to every unrelated screen.

### CB-3 — Fix shell readability and protect Calendar progress

Status: **Verified complete**
- **Changes:**
  1. `app/zen-home.css`: Harmonized the two-level shell contrast cascade. Eliminated conflicting dark-on-dark/white-on-white text overrides (`.view-zen-home .browser-tab { color: #ffffff }`) so open tabs remain crisp and legible against the light surface. Styled active Home button with high contrast and keyboard focus-visible indicator.
  2. `app/tool-navigation.css`: Completed Level 2 tab strip readability styling (`.three-row-shell .browser-tabs` with horizontal scroll, accessible close button contrast/hover/focus, and new-tab button focus). Resolved grid-column collision on `.three-row-shell .top-actions` (setting `grid-column: auto` so it does not wrap or collide with the omnibox) and updated omnibox top margin to 6px satisfying topbar vertical inset requirements.
  3. `app/components/workspaces/calendar/CalendarViews.tsx`: Added semantic non-color status badges (`.gcal-status-badge`) and month pills (`.gcal-month-status-cue`) with explicit `data-status-cue` attributes ("waiting" with "In Office" + `how_to_reg` icon, "tentative", "in-visit", "completed" with "Done" + `check` icon, and "cancelled"). Updated `aria-label` and `title` attributes on calendar events to explicitly include status name for screen readers.
  4. `app/google-calendar.css`: Styled calendar status badges and month status cues across waiting, tentative, in-visit, completed, and cancelled states with accessible contrast and semantic icons.
- **Evidence:** Added comprehensive tests to `tests/browser/tool-navigation.spec.ts` testing Home tab active state contrast, tab name readability, accessible close button contrast, keyboard focus, and non-color calendar status badges across week, day, and month views. All 5 browser tests in `tests/browser/tool-navigation.spec.ts` passed in 25.0s. Validated with `npm run check` (386/386 unit tests passed, 0 lint/type errors) and `npm run build` (production Next.js build completed cleanly).

**Requirements:** VIS-03/05/07/08, TAB-01 through TAB-04, LEFT-01/02, NAV-04.

**Inspect:** `app/zen-home.css`, `app/tool-navigation.css`, `app/components/workspace/WorkspaceTopBar.tsx`, existing tab owners, `app/google-calendar.css`, `app/components/workspaces/calendar/CalendarViews.tsx`, and `app/lib/calendar-grid-layout.ts`.

- Repair the Home tab foreground/background cascade. Keep open tab names, active state, close controls and keyboard focus readable on Home and ordinary workspaces; do not hide open work to mask contrast failures.
- Preserve intrinsic top-navigation sizing and the two-level shell. Many tabs should scroll or expose accessible overflow while names remain discoverable; do not force system modules to icon-only tabs.
- Retain compact Calendar headers, visit counts, tonal cards, quarter-hour creation, and calm empty-slot hover. Add a concise visible/non-color waiting/in-office cue in day/week/month representations and accessible status names; preserve type versus status semantics and all existing lifecycle actions.
- Preserve full-width crowded-slot rows and the shared time mapping. Do not implement fixed duration rectangles, density scaling, drag/drop or resizing in this corrective slice.

**Verify:** extend `tests/browser/tool-navigation.spec.ts` for Home with open tabs, many tabs, theme contrast and focus; retain bounding-box/overflow assertions. Extend calendar browser coverage for waiting, tentative, in-visit, completed and cancelled states, focused/clicked slots, and a crowded slot. A DOM-visible assertion alone does not prove readable text or unclipped controls.

**Accept:** Home labels are readable, all top-level destinations remain reachable, waiting is understandable without color, and existing Calendar interactions and geometry still work.

### CB-4 — Simplify the patient overview without losing meaning

Status: **Verified complete**
- **Changes:**
  1. `app/components/patient/PatientOverview.tsx`: Eliminated the redundant duplicate `patient-envelope-card` identity banner (former lines 498–576) that duplicated `PatientHeader.tsx`. Removed unused `StatusBadge` and `administrativeSummary`. Patient identity remains authoritative and visible in the single persistent per-pane `PatientHeader`.
  2. `app/components/patient/PatientOverview.tsx`: Replaced the repeated row of 4 loose header buttons on each card (Pin, Span, Collapse, Hide) with a consolidated, accessible `OverviewCardMenu` (`<details className="overview-card-menu">` with `aria-label="Card options"`). The menu closes cleanly on Escape or outside click and provides labeled options ("Unpin from top / Pin to top", "Narrow to 1 column / Expand to full width", "Expand card / Collapse card", "Hide card").
  3. `app/components/patient/PatientOverview.tsx` & `app/globals.css`: Elevated primary clinical actions (`Address in Note →`, `Manage Rx →`, `Full Timeline →`) to prominent `.card-primary-action-btn` buttons in card headers, clearly separating primary clinical workflow from secondary card layout controls.
  4. Preserved hidden card recovery via the existing `.overview-restore-bar` ("Restore: [Card Name]").
  5. `app/components/workspace/PatientChartSurface.tsx`: Connected the clinical alert review button in the chart header banner directly to `onSectionChange("Overview")` for seamless navigation to the alert details.
  6. `app/lib/patient-id-card-generator.ts` & `app/components/patient/PatientPhotoModal.tsx`: Fixed root cause of browser freeze when opening patient photo/ID cards by providing safe default fallbacks for synthetic patient license fields and restoring hook dependency stability.
- **Evidence:** Added comprehensive browser Playwright suite `tests/browser/patient-overview.spec.ts` (3/3 tests passed in 17.1s) verifying single identity header, visible primary clinical actions, card menu open/close/keyboard escape, and hide/restore functionality. Live browser verification with subagent confirmed zero Redbox errors, seamless photo/ID card inspection, and interactive responsiveness. Validated with `npm run check` (386/386 unit tests, 0 lint/typecheck errors) and `npm run build`.

**Inspect:** `app/components/workspace/PatientHeader.tsx`, `app/components/patient/PatientOverview.tsx`, `PatientWorkspace` controllers, existing clinical attention/protocol projections, and feature-owned styles under the D-082 stacking contract.

1. Inventory every unique identity fact, administrative/care-team action, encounter action, clinical concern, and card control. Map old location to retained location before removing a repeated container.
2. Keep one persistent identity header per pane. Remove the duplicate overview identity banner, moving any unique administration/care-team action into the existing identity access. Keep patient identity visible in detached/minimal/full-screen work and consequential dialogs.
3. Keep primary clinical actions such as Manage Rx / Address in Note visible. Place pin, expand, collapse and hide in a consistent visible `...` overflow. Reuse existing controls/state and preserve keyboard focus, Escape, dismissal and recovery.
4. Make header alerts and overview details projections of the same owning concern. Show one detailed alert with a compact reachable header indicator where useful. Deduplicate by clinical identity/source, not a broad text match; retain distinct concerns, severity and action paths.
5. Preserve clinician density/preset choices and personal card arrangement. Message composition and message-history navigation are different functions; do not remove one merely because their labels resemble each other.

**Verify:** before/after fact/action inventory, patient switching with a dirty draft, detached panes, header density modes, keyboard-only card actions, hidden-card restoration, multiple different risks, and saved layout reload. Inspect the actual first viewport at the shared visual matrix.

**Accept:** clinical content appears sooner with fewer repeated controls; all unique facts/actions remain reachable; identity and unresolved safety signals are clear in every pane. **Exclude:** new patient route hierarchy, rebuilding tab persistence, note editor replacement, protocol threshold changes, or merging clinical authorities.

### CB-5 — Simplify dashboard, Tasks/Inbox, and intake filtering

Status: **Verified complete**

- **Governing finding:** the clinic day was counted three times above the fold. The roster's own filter bar (`All / Tentative / Confirmed / In Office / In Visit / Upcoming / Completed`, each with a count) both counts *and* filters, so it is now the single owner of day status counts; Day at a Glance and the Practice Cockpit were restating it.
- **Changes:**
  1. `app/components/TodayDashboard.tsx`: the roster filter bar no longer sits behind `showScheduleSearch` — that preference gates the search input only. Turning search off previously removed the day's only actionable counts, which is how the duplicate copies upstream were justified. Day at a Glance is now one compact line naming who the day is waiting on (waiting / in-visit / next arrival / nothing booked / tentative holds / concluded) plus its action row, laid out as a single band in `app/globals.css`; it no longer restates `counts.booked/completed/waiting/tentative`. An empty day now says "No visits are booked for this date." instead of the finished-day sentence it used to share.
  2. `app/lib/preference-engine.ts`, `app/lib/use-today-layout.ts`, `app/lib/dashboard-layout-model.ts`: the Practice Cockpit ships **off** and sits after the roster in the default order. It remains a first-class window — listed in Customize → Today Dashboard, addable through the ordinary visibility path, and still on by default in the Psychopharm Cockpit preset. `shipsVisible` is now false so the hidden-sections bar does not report it as dismissed work, and `restoreAllSections` no longer turns it on. Stored preferences are untouched: a clinician who already had it keeps it.
  3. `app/components/GlobalWorkspaceShell.tsx`: the Tasks and Inbox count tiles (`.global-module-summary-strip`) are gone; their numbers moved onto the filters that produce them. Tasks gained a real `Patient-linked` filter — it was previously a tile counting a subset nothing could select. Inbox filters carry per-filter thread counts including `Refills`, which had none. Counts render without a number until the queue has loaded or when it errored (DASH-11).
  4. `app/components/global/GlobalLabsWorkspace.tsx`, `GlobalDocumentsWorkspace.tsx`, `app/components/PracticeQueueWorkspaceShell.tsx`: the same tile strips removed and counts moved onto their filters; Documents gained a `Filed` filter for the one tile that had no filter behind it. Both queues now receive a real `hasLoadedOnce` from their shell instead of inferring it from `rows.length`, so an unanswered queue shows no count while a genuinely empty one shows zero.
  5. `app/lib/adaptive-layout-engine.ts`: the shipped "Morning Pre-Clinic Prep" rule no longer forces the cockpit on. Adaptive mode is opt-in and reversible (DASH-09), but the rule's own description is about the briefing, patient flow and pre-visit readiness — the cockpit override contradicted both that and the new default. No other rule changed.
  6. `app/components/workspaces/IntakeWorkspace.tsx`, `app/intake-workspace.css`: a stage earns a tab when it holds someone; the selected stage keeps its tab at zero; everything else folds into an in-place `N more stages` disclosure listing them in `STAGE_ORDER`. The duplicate "N people" header count is gone (the All tab carries it) and stage counts wait for the queue to load. The disclosure expands under the tab row rather than over it, because the row scrolls horizontally and would clip an overlay.
- **Measured first viewport** (1440x900, shipped defaults, same six-visit synthetic day, measured before/after on the same database):

  | | Before | After |
  | --- | --- | --- |
  | Chrome above the schedule window | 328px | 159px |
  | Schedule window top | y=526 (58% of viewport) | y=357 (40%) |
  | Visit rows fully visible | 3 of 6 | 6 of 6 |
  | Places the day's status counts render | 3 | 1 |

- **Evidence:** `npm run check` (394/394 unit tests, 0 lint errors, 0 type errors) and `npm run build` both pass. New `tests/dashboard-first-viewport-economy.test.ts` (8 tests) pins the shipped defaults, the preserved-preference rule, cockpit addability, and the filter-bar ownership. New `tests/browser/queue-filter-counts.spec.ts` (5 tests) asserts in a browser that every filter's advertised count equals the rows pressing it returns, across the roster, Tasks, and Inbox, plus the intake overflow promotion path. Visual matrix checked at 1440x900, 1280x800, 1024px and 200%-equivalent (720x450): no horizontal overflow, the summary band wraps rather than truncating, and labels stay readable.
- **DASH-12:** this is contained cleanup inside the existing canvas — no new dashboard, no module removed, no persona default rewritten beyond the one opt-in toggle above — so it did not re-enter the owner visual-review gate. The measured before/after table is the evidence that gate asks for. The gate remains binding for a broad default-dashboard replacement.
- **Full browser gate, run on both sides with a fresh database:** this slice **86 passed / 17 failed**; unmodified `main` **18 failed** over the same specs. Failure sets compared by test name: **zero regressions introduced, one failure fixed.** Every one of the 17 remaining failures reproduces on `main`.
- **Repaired en route:** `tests/browser/window-lifecycle.spec.ts`'s hide/restore test had a stale `/Open Layout Customizer/i` locator (the control is "Customize layout") and had therefore been failing on `main`, leaving the restore path unexercised. It now runs, and additionally exercises adding the opt-in cockpit from Customize. This is the one failure CB-5 closes.
- **Labs and Documents are unreachable from navigation:** selecting either from the Clinical menu opens nothing — `activeModule` never reaches `PracticeQueueWorkspaceShell`. Pre-existing, no browser coverage exists for either queue, and the reason this slice's Labs/Documents filter counts are verified by type and unit checks rather than in a browser. P6 dead-end work, tracked separately. **Closed by UI-7a (2026-09-21).** The observation was exact and the attribution was not: `activeModule` never arrived because `openGlobalModule` dispatched an event whose own listener immediately cleared it for these two views — a regression introduced at `948f003` on 2026-09-18, one day before this was written, rather than queue work P6 had not reached. See [D-088](decisions/D-088.md) and the UI-7 entry above; both queues now open, and `clinical-decomposition.spec.ts` covers Documents in a browser.

### CB-5a — Repair the validation baseline regression

Status: **Verified complete**

CB-5a repaired the 17-failure browser baseline one root cause at a time instead of weakening assertions or scheduling safeguards.

- **Booking and fixture collisions:** Calendar `New Event` now chooses a real open default slot rather than hardcoding a time occupied by shifted seed data. Browser fixtures were made deterministic and care-completion visit fixtures were isolated while preserving the authoritative overlap guard.
- **Navigation and workspace ownership:** patient opens and schedule chart actions were routed through the existing navigation controller; module-tab fallback now synchronizes the active workspace view instead of leaving the shell between states.
- **Calendar and layering regressions:** waiting/in-office state remains visibly distinguishable in month view, the event editor owns Escape dismissal correctly, and layering tests follow the current contained website-preview controls.
- **State/test isolation:** browser preference caches reset with server defaults; stale inbox data remains visible with an explicit refresh failure; test selectors were aligned to current accessible labels instead of obsolete UI wording.
- **Clinical/encounter path:** clinical document summaries are normalized through the DTO boundary, and encounter drafts are durably persisted before the review/sign ceremony so the synthetic visit lifecycle reaches the authoritative signed state.
- **Final selector cleanup:** Preferences verification now targets the complete accessible name of the real `Customize layout` control rather than requiring an obsolete exact accessible-name match.

**Completion evidence:** resulting code SHA `ae0850bbd988b29ad60a61fb1a3f0d7be4787ee8`; CI run [35516899267](https://github.com/Logancarton/EHR/actions/runs/35516899267) passed lint, typecheck, clinical integration tests, production build, Chromium install, and **103/103 browser tests** with no failures or flaky tests reported in the final Playwright summary.

**Exit result:** the full browser validation gate is trustworthy and green again. CB-7 is no longer blocked by CB-5a. The next ordered slice is CB-6; CB-7 then performs the deeper manual encounter/recovery certification rather than re-litigating this repaired baseline.

### CB-6 — Normalize companion presentation and lifecycle

Status: **In progress — AI viewport repair verified; broader lifecycle gate pending**

**2026-09-20 owner-requested screen-fit repair (baseline `dcee02d`):** The AI panel used an unstyled container class and relative 100%-height positioning, consuming a full-width workspace row. Restored the existing `.companion-panel` geometry and measured chrome offset, with a scrollable body and anchored context header/composer. Calendar retains its full height and independent time-grid scrolling; the rail, Close control and input remain reachable. This advances NAV-01/NAV-02, VIS-07 and RIGHT-05 without changing clinical state or the companion controller.

- **Browser evidence:** four viewport cases (1440×900, 1280×800, 1024×768, and 720×450 as the 200%-zoom equivalent) plus the existing AI planner/context-isolation test passed, **5/5**. Tests exercise actual wheel scrolling, unchanged calendar height, complete input/Close visibility, draft retention during scrolling, and closing the overlay. Reinstating the old component made the new 1440×900 regression fail: opening AI consumed 490.89px of calendar height. Screenshots were visually inspected under `test-results/screen-fit-evidence/` (ignored artifacts).
- **Validation:** production build, typecheck and lint passed (existing lint warnings remain); final Node suite **394/394**. This runtime blocked the `tsx` CLI's IPC socket, so the same suite ran with `node --import tsx --test tests/*.test.ts`. The browser CDN was unavailable; local verification used Chromium 153 and a locally supplied Material Symbols font through a temporary test harness, with no runtime dependencies or harness committed. CI retains the repository's normal browser configuration.
- **Observed baseline risks:** an initial unit run intermittently failed the existing weight-change assertion (vitals group by timestamp); its focused recheck and final full suite passed. A run overlapping browser verification also hit the generated `next-env.d.ts` hygiene check; restoring that generated file and running sequentially passed. Neither clinical logic nor assertions were changed for this presentation repair.
- **Still pending:** complete CB-6 lifecycle certification across other tools, expand/pop-out/redock, persistence failures and draft/context continuity. This repair does not certify all of CB-6.

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
