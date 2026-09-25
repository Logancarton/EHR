# Clinical Bond Decision Index

This is the lightweight discovery surface for durable product and architecture decisions. Full rationale lives in [`docs/decisions/`](decisions/). The legacy monolithic decision log is preserved as [historical evidence](archive/decisions/DECISIONS-through-D-082.md).

## Status semantics

- **Active / Accepted** — currently governing.
- **Active — amended** — still governing, but a named later ADR modifies a specific portion.
- **Superseded** — the whole decision is replaced by a named successor.
- **Deferred / Proposed** — intentionally not governing current implementation.
- Implementation status is tracked separately from architectural authority.

No whole ADR in the current D-001 through D-098 corpus is classified as fully Superseded or Deferred/Proposed. Several decisions are partially amended; those relationships are explicit below and in each ADR. D-037 is an active accepted decision that defers live DrFirst implementation; D-028 remains the accepted selected-vendor record.

## Governing decisions by topic

### Core product / workspace

- [D-001](decisions/D-001.md) — Build from scratch
- [D-002](decisions/D-002.md) — Workspace-first interaction model
- [D-003](decisions/D-003.md) — AI is a cross-cutting layer
- [D-011](decisions/D-011.md) — Patient workspaces can detach into floating windows
- [D-012](decisions/D-012.md) — Elastic Complexity & Dynamic Workspace Modularity
- [D-027](decisions/D-027.md) — Canonical True North interaction specification
- [D-035](decisions/D-035.md) — Clinician layout choices are durable, and every dismissal has a visible way back *(amended)*
- [D-036](decisions/D-036.md) — Workspace restoration completes before it is reported complete
- [D-043](decisions/D-043.md) — One interaction grammar, extracted from measured repetition
- [D-048](decisions/D-048.md) — Schedule-first personal dashboards over shared team work *(amended)*
- [D-052](decisions/D-052.md) — Bounded dashboard module registry, pure layout state, and unified dashboard shell
- [D-054](decisions/D-054.md) — Autosaved personal state, named preset independence, copy-on-adopt templates, and optimistic concurrency
- [D-057](decisions/D-057.md) — Explicit adaptive layouts, clinical focus protection, and bounded inspectable triggers
- [D-058](decisions/D-058.md) — Dashboard acceptance gate, controlled default switch, and privacy display mode
- [D-067](decisions/D-067.md) — Getting out of a layered surface without reaching for the ×
- [D-069](decisions/D-069.md) — Care completion is a projection over authoritative workflows, not a second task or clinical truth system
- [D-080](decisions/D-080.md) — Typed application-shell coordination and PatientWorkspace decomposition
- [D-081](decisions/D-081.md) — Authoritative workspace navigation controller and typed cross-workspace event coordination
- [D-082](decisions/D-082.md) — CSS ownership and application stacking contract
- [D-085](decisions/D-085.md) — Home + workspace tabs + universal `+` launcher with expandable contextual canvases *(amended)*
- [D-096](decisions/D-096.md) — The foreground canvas owns implicit companion context
- [D-098](decisions/D-098.md) — Patient-bound companion tools stay bound to their chart, and workspace shortcuts never bypass staging

### Navigation / UI

- [D-011](decisions/D-011.md) — Patient workspaces can detach into floating windows
- [D-012](decisions/D-012.md) — Elastic Complexity & Dynamic Workspace Modularity
- [D-035](decisions/D-035.md) — Clinician layout choices are durable, and every dismissal has a visible way back *(amended)*
- [D-043](decisions/D-043.md) — One interaction grammar, extracted from measured repetition
- [D-047](decisions/D-047.md) — A destination is offered only when it works
- [D-050](decisions/D-050.md) — A design preview is a repository route with no chrome and no records
- [D-052](decisions/D-052.md) — Bounded dashboard module registry, pure layout state, and unified dashboard shell
- [D-053](decisions/D-053.md) — Distinct visit and chart targets, configurable roster registry, and operational cancellation
- [D-067](decisions/D-067.md) — Getting out of a layered surface without reaching for the ×
- [D-070](decisions/D-070.md) — Three-row navigation replaces the launcher and left sidebar *(amended)*
- [D-072](decisions/D-072.md) — Calendar is a first-class workspace, not a Dashboard mode
- [D-080](decisions/D-080.md) — Typed application-shell coordination and PatientWorkspace decomposition
- [D-081](decisions/D-081.md) — Authoritative workspace navigation controller and typed cross-workspace event coordination
- [D-082](decisions/D-082.md) — CSS ownership and application stacking contract
- [D-083](decisions/D-083.md) — Current work navigation uses Calendar; layout configuration lives under Preferences
- [D-084](decisions/D-084.md) — Unified two-level chrome replaces the standalone work-navigation row *(amended)*
- [D-085](decisions/D-085.md) — Home + workspace tabs + universal `+` launcher with expandable contextual canvases *(amended)*
- [D-087](decisions/D-087.md) — Organization administration is not preferences, and it lives in the account menu
- [D-096](decisions/D-096.md) — The foreground canvas owns implicit companion context

### Patient / clinical authority

- [D-004](decisions/D-004.md) — Structured clinical data remains authoritative
- [D-007](decisions/D-007.md) — Synthetic data until security foundation exists
- [D-008](decisions/D-008.md) — Human confirmation for consequential AI actions
- [D-017](decisions/D-017.md) — Encounter closing is coordinated, not transactional
- [D-018](decisions/D-018.md) — Authoritative team users with revocable server-side sessions
- [D-030](decisions/D-030.md) — Absence of clinical facts must be loaded, never assumed
- [D-032](decisions/D-032.md) — Remediate verified authority gaps independently of browser tooling
- [D-033](decisions/D-033.md) — Patient access is organization membership, decided separately from authentication and role
- [D-042](decisions/D-042.md) — The authenticated roster is the only runtime patient truth
- [D-044](decisions/D-044.md) — The administrative record is normalized, and age is derived
- [D-049](decisions/D-049.md) — A visit is an appointment, and a clinic day is the practice's own day
- [D-059](decisions/D-059.md) — Authoritative ICD-10-CM psychiatric registry, explicit NKDA semantics, and sign-time reference snapshot freezing
- [D-060](decisions/D-060.md) — Longitudinal measurements, structured psychiatric history, and standardized clinical rating scales
- [D-061](decisions/D-061.md) — Unified patient overview, multi-domain attention matrix, and longitudinal multi-event timeline
- [D-068](decisions/D-068.md) — Medication longitudinal truth: a readable dose trajectory and a recorded indication
- [D-071](decisions/D-071.md) — Signed encounter history is authoritative; corrections append to the legal record
- [D-096](decisions/D-096.md) — The foreground canvas owns implicit companion context

### Encounters / legal record

- [D-017](decisions/D-017.md) — Encounter closing is coordinated, not transactional
- [D-049](decisions/D-049.md) — A visit is an appointment, and a clinic day is the practice's own day
- [D-059](decisions/D-059.md) — Authoritative ICD-10-CM psychiatric registry, explicit NKDA semantics, and sign-time reference snapshot freezing
- [D-071](decisions/D-071.md) — Signed encounter history is authoritative; corrections append to the legal record

### Scheduling / Calendar

- [D-015](decisions/D-015.md) — Practice Scheduling Persistence & Walk-in Decoupling
- [D-049](decisions/D-049.md) — A visit is an appointment, and a clinic day is the practice's own day
- [D-053](decisions/D-053.md) — Distinct visit and chart targets, configurable roster registry, and operational cancellation
- [D-055](decisions/D-055.md) — Shared live scheduling, versioned concurrency, mutual-agreement visit handoffs, and ephemeral presence
- [D-062](decisions/D-062.md) — Authoritative appointment lifecycle, elapsed wait calculation, provider schedule filtering, and closed-loop follow-up scheduling
- [D-072](decisions/D-072.md) — Calendar is a first-class workspace, not a Dashboard mode
- [D-072B](decisions/D-072B.md) — Calendar booking can create a patient chart from caller-supplied identity *(amended)*
- [D-073](decisions/D-073.md) — Tentative caller holds are distinct from scheduled visits *(amended)*
- [D-083](decisions/D-083.md) — Current work navigation uses Calendar; layout configuration lives under Preferences

### Intake

- [D-072B](decisions/D-072B.md) — Calendar booking can create a patient chart from caller-supplied identity *(amended)*
- [D-073](decisions/D-073.md) — Tentative caller holds are distinct from scheduled visits *(amended)*
- [D-074](decisions/D-074.md) — First-call intake is a projection over saved administrative facts *(amended)*
- [D-075](decisions/D-075.md) — Intake is a staff-workflow queue and a readiness projection, not a second intake record *(amended)*
- [D-076](decisions/D-076.md) — Intake truth-alignment and safety hardening: prospective identity, readiness accuracy, and the confirm-override boundary *(amended)*
- [D-077](decisions/D-077.md) — Intake truth-continuity: prospect-stage documents and coverage are the same rows after promotion
- [D-078](decisions/D-078.md) — Intake can start before a visit exists; starting one is reachable from the queue itself

### Medications / prescribing

- [D-006](decisions/D-006.md) — Vendor integrations use adapters
- [D-013](decisions/D-013.md) — Vendor-Neutral Order Adapters & Staged Attestation Cart
- [D-019](decisions/D-019.md) — Medication clinical truth is separate from prescribing-vendor evidence
- [D-020](decisions/D-020.md) — Medication reconciliation is an explicit clinician conversion of evidence into clinical truth
- [D-021](decisions/D-021.md) — Prescription intent is separate from medication clinical truth
- [D-022](decisions/D-022.md) — External prescription transaction state is a separate authority class
- [D-023](decisions/D-023.md) — Refill/renewal requests are workflow evidence; approval creates a new prescription intent
- [D-024](decisions/D-024.md) — Pharmacy change requests remain explicit workflow evidence; no generic prescription relationship graph yet
- [D-025](decisions/D-025.md) — Verified prescribing callbacks are a separate integration authority boundary
- [D-026](decisions/D-026.md) — Integration configuration, secrets, and delivery reliability remain separate from clinical authority
- [D-028](decisions/D-028.md) — DrFirst selected for planned e-prescribing and EPCS
- [D-037](decisions/D-037.md) — DrFirst prescribing integration deferred; production infrastructure takes its place in the queue
- [D-045](decisions/D-045.md) — Billing order and prescribing destination are recorded choices, not orderings
- [D-059](decisions/D-059.md) — Authoritative ICD-10-CM psychiatric registry, explicit NKDA semantics, and sign-time reference snapshot freezing
- [D-068](decisions/D-068.md) — Medication longitudinal truth: a readable dose trajectory and a recorded indication

### AI

- [D-003](decisions/D-003.md) — AI is a cross-cutting layer
- [D-008](decisions/D-008.md) — Human confirmation for consequential AI actions
- [D-016](decisions/D-016.md) — Token-Budgeted, Permission-Aware Context Assembly Pipeline
- [D-030](decisions/D-030.md) — Absence of clinical facts must be loaded, never assumed
- [D-064](decisions/D-064.md) — One grounded answer path for every clinical question
- [D-069](decisions/D-069.md) — Care completion is a projection over authoritative workflows, not a second task or clinical truth system
- [D-097](decisions/D-097.md) — The omnibox answers informational questions before it navigates
- [D-098](decisions/D-098.md) — Patient-bound companion tools stay bound to their chart, and workspace shortcuts never bypass staging

### Identity / security

- [D-007](decisions/D-007.md) — Synthetic data until security foundation exists
- [D-018](decisions/D-018.md) — Authoritative team users with revocable server-side sessions
- [D-032](decisions/D-032.md) — Remediate verified authority gaps independently of browser tooling
- [D-033](decisions/D-033.md) — Patient access is organization membership, decided separately from authentication and role
- [D-038](decisions/D-038.md) — Organization administration is confined to the administrator's own practice
- [D-039](decisions/D-039.md) — An account's password belongs to its holder, never to the administrator
- [D-040](decisions/D-040.md) — Password guessing is rate limited per username, and an administrator can clear a lockout
- [D-041](decisions/D-041.md) — The database location is explicit in production, and recovery is proven rather than assumed
- [D-051](decisions/D-051.md) — Server-derived authority, persona separation, and capability-scoped access
- [D-066](decisions/D-066.md) — One expiry is one question: latching the session challenge

### Integrations

- [D-005](decisions/D-005.md) — FHIR at boundaries, not as the UI architecture
- [D-006](decisions/D-006.md) — Vendor integrations use adapters
- [D-022](decisions/D-022.md) — External prescription transaction state is a separate authority class
- [D-025](decisions/D-025.md) — Verified prescribing callbacks are a separate integration authority boundary
- [D-026](decisions/D-026.md) — Integration configuration, secrets, and delivery reliability remain separate from clinical authority
- [D-028](decisions/D-028.md) — DrFirst selected for planned e-prescribing and EPCS
- [D-037](decisions/D-037.md) — DrFirst prescribing integration deferred; production infrastructure takes its place in the queue
- [D-045](decisions/D-045.md) — Billing order and prescribing destination are recorded choices, not orderings
- [D-063](decisions/D-063.md) — Billing prototype isolation, and charges derived from the signed legal record
- [D-065](decisions/D-065.md) — Normalized signing-date projection over immutable encounter records

### Billing / financial

- [D-045](decisions/D-045.md) — Billing order and prescribing destination are recorded choices, not orderings
- [D-059](decisions/D-059.md) — Authoritative ICD-10-CM psychiatric registry, explicit NKDA semantics, and sign-time reference snapshot freezing
- [D-063](decisions/D-063.md) — Billing prototype isolation, and charges derived from the signed legal record
- [D-065](decisions/D-065.md) — Normalized signing-date projection over immutable encounter records
- [D-069](decisions/D-069.md) — Care completion is a projection over authoritative workflows, not a second task or clinical truth system

### Persistence / infrastructure / quality

- [D-014](decisions/D-014.md) — SQLite FTS5 BM25 Engine for Longitudinal Clinical Note Search
- [D-015](decisions/D-015.md) — Practice Scheduling Persistence & Walk-in Decoupling
- [D-017](decisions/D-017.md) — Encounter closing is coordinated, not transactional
- [D-026](decisions/D-026.md) — Integration configuration, secrets, and delivery reliability remain separate from clinical authority
- [D-033](decisions/D-033.md) — Patient access is organization membership, decided separately from authentication and role
- [D-036](decisions/D-036.md) — Workspace restoration completes before it is reported complete
- [D-041](decisions/D-041.md) — The database location is explicit in production, and recovery is proven rather than assumed
- [D-046](decisions/D-046.md) — A first install is a tested path
- [D-049](decisions/D-049.md) — A visit is an appointment, and a clinic day is the practice's own day
- [D-054](decisions/D-054.md) — Autosaved personal state, named preset independence, copy-on-adopt templates, and optimistic concurrency
- [D-055](decisions/D-055.md) — Shared live scheduling, versioned concurrency, mutual-agreement visit handoffs, and ephemeral presence
- [D-065](decisions/D-065.md) — Normalized signing-date projection over immutable encounter records
- [D-077](decisions/D-077.md) — Intake truth-continuity: prospect-stage documents and coverage are the same rows after promotion
- [D-078](decisions/D-078.md) — Intake can start before a visit exists; starting one is reachable from the queue itself
- [D-079](decisions/D-079.md) — Staged ESLint/Prettier architecture; formatting and CSS linting deferred
- [D-082](decisions/D-082.md) — CSS ownership and application stacking contract

## Complete register

| ID | Authority | Implementation status | Decision |
| --- | --- | --- | --- |
| [D-001](decisions/D-001.md) | Active / Accepted | Not separately tracked in the historical decision record; verify current code/ROADMAP for present implementation evidence. | Build from scratch |
| [D-002](decisions/D-002.md) | Active / Accepted | Not separately tracked in the historical decision record; verify current code/ROADMAP for present implementation evidence. | Workspace-first interaction model |
| [D-003](decisions/D-003.md) | Active / Accepted | Not separately tracked in the historical decision record; verify current code/ROADMAP for present implementation evidence. | AI is a cross-cutting layer |
| [D-004](decisions/D-004.md) | Active / Accepted | Not separately tracked in the historical decision record; verify current code/ROADMAP for present implementation evidence. | Structured clinical data remains authoritative |
| [D-005](decisions/D-005.md) | Active / Accepted | Not separately tracked in the historical decision record; verify current code/ROADMAP for present implementation evidence. | FHIR at boundaries, not as the UI architecture |
| [D-006](decisions/D-006.md) | Active / Accepted | Not separately tracked in the historical decision record; verify current code/ROADMAP for present implementation evidence. | Vendor integrations use adapters |
| [D-007](decisions/D-007.md) | Active / Accepted | Implementation evidence is recorded in this ADR; current code/ROADMAP is authoritative for exact present scope. | Synthetic data until security foundation exists |
| [D-008](decisions/D-008.md) | Active / Accepted | Not separately tracked in the historical decision record; verify current code/ROADMAP for present implementation evidence. | Human confirmation for consequential AI actions |
| [D-009](decisions/D-009.md) | Active / Accepted | Not separately tracked in the historical decision record; verify current code/ROADMAP for present implementation evidence. | Start single-clinician, avoid single-clinician dead ends |
| [D-010](decisions/D-010.md) | Active / Accepted | Not separately tracked in the historical decision record; verify current code/ROADMAP for present implementation evidence. | Direct-to-main agent workflow |
| [D-011](decisions/D-011.md) | Active / Accepted | Not separately tracked in the historical decision record; verify current code/ROADMAP for present implementation evidence. | Patient workspaces can detach into floating windows |
| [D-012](decisions/D-012.md) | Active / Accepted | Not separately tracked in the historical decision record; verify current code/ROADMAP for present implementation evidence. | Elastic Complexity & Dynamic Workspace Modularity |
| [D-013](decisions/D-013.md) | Active / Accepted | Not separately tracked in the historical decision record; verify current code/ROADMAP for present implementation evidence. | Vendor-Neutral Order Adapters & Staged Attestation Cart |
| [D-014](decisions/D-014.md) | Active / Accepted | Not separately tracked in the historical decision record; verify current code/ROADMAP for present implementation evidence. | SQLite FTS5 BM25 Engine for Longitudinal Clinical Note Search |
| [D-015](decisions/D-015.md) | Active / Accepted | Not separately tracked in the historical decision record; verify current code/ROADMAP for present implementation evidence. | Practice Scheduling Persistence & Walk-in Decoupling |
| [D-016](decisions/D-016.md) | Active / Accepted | Not separately tracked in the historical decision record; verify current code/ROADMAP for present implementation evidence. | Token-Budgeted, Permission-Aware Context Assembly Pipeline |
| [D-017](decisions/D-017.md) | Active / Accepted | Not separately tracked in the historical decision record; verify current code/ROADMAP for present implementation evidence. | Encounter closing is coordinated, not transactional |
| [D-018](decisions/D-018.md) | Active / Accepted | Not separately tracked in the historical decision record; verify current code/ROADMAP for present implementation evidence. | Authoritative team users with revocable server-side sessions |
| [D-019](decisions/D-019.md) | Active / Accepted | Not separately tracked in the historical decision record; verify current code/ROADMAP for present implementation evidence. | Medication clinical truth is separate from prescribing-vendor evidence |
| [D-020](decisions/D-020.md) | Active / Accepted | Not separately tracked in the historical decision record; verify current code/ROADMAP for present implementation evidence. | Medication reconciliation is an explicit clinician conversion of evidence into clinical truth |
| [D-021](decisions/D-021.md) | Active / Accepted | Not separately tracked in the historical decision record; verify current code/ROADMAP for present implementation evidence. | Prescription intent is separate from medication clinical truth |
| [D-022](decisions/D-022.md) | Active / Accepted | Not separately tracked in the historical decision record; verify current code/ROADMAP for present implementation evidence. | External prescription transaction state is a separate authority class |
| [D-023](decisions/D-023.md) | Active / Accepted | Not separately tracked in the historical decision record; verify current code/ROADMAP for present implementation evidence. | Refill/renewal requests are workflow evidence; approval creates a new prescription intent |
| [D-024](decisions/D-024.md) | Active / Accepted | Implementation evidence is recorded in this ADR; current code/ROADMAP is authoritative for exact present scope. | Pharmacy change requests remain explicit workflow evidence; no generic prescription relationship graph yet |
| [D-025](decisions/D-025.md) | Active / Accepted | Not separately tracked in the historical decision record; verify current code/ROADMAP for present implementation evidence. | Verified prescribing callbacks are a separate integration authority boundary |
| [D-026](decisions/D-026.md) | Active / Accepted | Not separately tracked in the historical decision record; verify current code/ROADMAP for present implementation evidence. | Integration configuration, secrets, and delivery reliability remain separate from clinical authority |
| [D-027](decisions/D-027.md) | Active / Accepted | Not separately tracked in the historical decision record; verify current code/ROADMAP for present implementation evidence. | Canonical True North interaction specification |
| [D-028](decisions/D-028.md) | Active / Accepted | Vendor selection remains accepted; live DrFirst integration is deferred by D-037. | DrFirst selected for planned e-prescribing and EPCS |
| [D-029](decisions/D-029.md) | Active / Accepted | Not separately tracked in the historical decision record; verify current code/ROADMAP for present implementation evidence. | Evidence-based roadmap gates and save reliability priority |
| [D-030](decisions/D-030.md) | Active / Accepted | Not separately tracked in the historical decision record; verify current code/ROADMAP for present implementation evidence. | Absence of clinical facts must be loaded, never assumed |
| [D-031](decisions/D-031.md) | Active / Accepted | Browser-verification prerequisite is satisfied by D-034 (Playwright); the verification requirement remains governing. | Browser verification tooling is a named Phase 0 prerequisite |
| [D-032](decisions/D-032.md) | Active / Accepted | Implementation evidence is recorded in this ADR; current code/ROADMAP is authoritative for exact present scope. | Remediate verified authority gaps independently of browser tooling |
| [D-033](decisions/D-033.md) | Active / Accepted | Not separately tracked in the historical decision record; verify current code/ROADMAP for present implementation evidence. | Patient access is organization membership, decided separately from authentication and role |
| [D-034](decisions/D-034.md) | Active / Accepted | Implemented: Playwright is the repository browser verification harness. | Playwright is the browser verification harness (recording the D-031 choice) |
| [D-035](decisions/D-035.md) | Active — amended | Implemented for durable layout preference/restore behavior; sidebar-specific presentation was later amended by D-070. | Clinician layout choices are durable, and every dismissal has a visible way back |
| [D-036](decisions/D-036.md) | Active / Accepted | Not separately tracked in the historical decision record; verify current code/ROADMAP for present implementation evidence. | Workspace restoration completes before it is reported complete |
| [D-037](decisions/D-037.md) | Active / Accepted | Implemented as an active sequencing decision: live DrFirst work remains deferred pending contracted access/onboarding. | DrFirst prescribing integration deferred; production infrastructure takes its place in the queue |
| [D-038](decisions/D-038.md) | Active / Accepted | Implementation evidence is recorded in this ADR; current code/ROADMAP is authoritative for exact present scope. | Organization administration is confined to the administrator's own practice |
| [D-039](decisions/D-039.md) | Active / Accepted | Not separately tracked in the historical decision record; verify current code/ROADMAP for present implementation evidence. | An account's password belongs to its holder, never to the administrator |
| [D-040](decisions/D-040.md) | Active / Accepted | Implementation evidence is recorded in this ADR; current code/ROADMAP is authoritative for exact present scope. | Password guessing is rate limited per username, and an administrator can clear a lockout |
| [D-041](decisions/D-041.md) | Active / Accepted | Not separately tracked in the historical decision record; verify current code/ROADMAP for present implementation evidence. | The database location is explicit in production, and recovery is proven rather than assumed |
| [D-042](decisions/D-042.md) | Active / Accepted | Implemented: the authenticated roster is the runtime patient source of truth. | The authenticated roster is the only runtime patient truth |
| [D-043](decisions/D-043.md) | Active / Accepted | Not separately tracked in the historical decision record; verify current code/ROADMAP for present implementation evidence. | One interaction grammar, extracted from measured repetition |
| [D-044](decisions/D-044.md) | Active / Accepted | Not separately tracked in the historical decision record; verify current code/ROADMAP for present implementation evidence. | The administrative record is normalized, and age is derived |
| [D-045](decisions/D-045.md) | Active / Accepted | Not separately tracked in the historical decision record; verify current code/ROADMAP for present implementation evidence. | Billing order and prescribing destination are recorded choices, not orderings |
| [D-046](decisions/D-046.md) | Active / Accepted | Not separately tracked in the historical decision record; verify current code/ROADMAP for present implementation evidence. | A first install is a tested path |
| [D-047](decisions/D-047.md) | Active / Accepted | Not separately tracked in the historical decision record; verify current code/ROADMAP for present implementation evidence. | A destination is offered only when it works |
| [D-048](decisions/D-048.md) | Active — amended | Implemented through Dashboard DB-0–DB-10; shell/navigation wording is later amended by D-070, D-072, and D-083. | Schedule-first personal dashboards over shared team work |
| [D-049](decisions/D-049.md) | Active / Accepted | accepted (2026-09-13); implemented at `986a37d`, migration `2026-09-14-001`. | A visit is an appointment, and a clinic day is the practice's own day |
| [D-050](decisions/D-050.md) | Active / Accepted | accepted (2026-09-13); implemented at `3cfbeac` for DB-1. | A design preview is a repository route with no chrome and no records |
| [D-051](decisions/D-051.md) | Active / Accepted | accepted (2026-09-14); implemented for DB-2. | Server-derived authority, persona separation, and capability-scoped access |
| [D-052](decisions/D-052.md) | Active / Accepted | accepted (2026-09-14); implemented for DB-3. | Bounded dashboard module registry, pure layout state, and unified dashboard shell |
| [D-053](decisions/D-053.md) | Active / Accepted | accepted (2026-09-14); implemented for DB-4. | Distinct visit and chart targets, configurable roster registry, and operational cancellation |
| [D-054](decisions/D-054.md) | Active / Accepted | accepted (2026-09-14); implemented for DB-5. | Autosaved personal state, named preset independence, copy-on-adopt templates, and optimistic concurrency |
| [D-055](decisions/D-055.md) | Active / Accepted | accepted (2026-09-14); implemented for DB-6. | Shared live scheduling, versioned concurrency, mutual-agreement visit handoffs, and ephemeral presence |
| [D-056](decisions/D-056.md) | Active / Accepted | accepted (2026-09-14); implemented for DB-7. | Optional source-backed dashboard windows, closed-loop work queues, and truthful declared deferrals |
| [D-057](decisions/D-057.md) | Active / Accepted | accepted (2026-09-14); implemented for DB-8. | Explicit adaptive layouts, clinical focus protection, and bounded inspectable triggers |
| [D-058](decisions/D-058.md) | Active / Accepted | accepted (2026-09-14); implemented for DB-9. | Dashboard acceptance gate, controlled default switch, and privacy display mode |
| [D-059](decisions/D-059.md) | Active / Accepted | accepted (2026-09-14); implemented for P3-A/RL-B, P3-B, and RL-A. | Authoritative ICD-10-CM psychiatric registry, explicit NKDA semantics, and sign-time reference snapshot freezing |
| [D-060](decisions/D-060.md) | Active / Accepted | accepted (2026-09-14); implemented for P3-D, P3-E, and P3-F. | Longitudinal measurements, structured psychiatric history, and standardized clinical rating scales |
| [D-061](decisions/D-061.md) | Active / Accepted | accepted (2026-09-14); implemented for P3-G and P3-H, completing Phase P3 exit gate. | Unified patient overview, multi-domain attention matrix, and longitudinal multi-event timeline |
| [D-062](decisions/D-062.md) | Active / Accepted | accepted (2026-09-14); implemented for Phase P4 (Complete scheduling and front-office workflow). | Authoritative appointment lifecycle, elapsed wait calculation, provider schedule filtering, and closed-loop follow-up scheduling |
| [D-063](decisions/D-063.md) | Active / Accepted | accepted (2026-09-15); implemented for roadmap §15 P9-0 and P9-B. Live clearinghouse transport (P9-C) and the denial queue (P9-E) remain deferred and blocked on a vendor decision, as D-037's DrFirst deferral is for prescribing. | Billing prototype isolation, and charges derived from the signed legal record |
| [D-064](decisions/D-064.md) | Active / Accepted | Implemented for Home + omnibox; focused review on 2026-09-19 found `ClinicalAiPanel` still uses a separate nonconforming answer path. CB-1 closes the remaining implementation gap. | One grounded answer path for every clinical question |
| [D-065](decisions/D-065.md) | Active / Accepted | accepted (2026-09-15); implemented as the P9-0 follow-up recorded in ROADMAP §15. | Normalized signing-date projection over immutable encounter records |
| [D-066](decisions/D-066.md) | Active / Accepted | Implementation evidence is recorded in this ADR; current code/ROADMAP is authoritative for exact present scope. | One expiry is one question: latching the session challenge |
| [D-067](decisions/D-067.md) | Active / Accepted | Implementation evidence is recorded in this ADR; current code/ROADMAP is authoritative for exact present scope. | Getting out of a layered surface without reaching for the × |
| [D-068](decisions/D-068.md) | Active / Accepted | accepted (2026-09-15); completes roadmap §9 P3-C, the last sub-item of Phase P3 without a completion marker. | Medication longitudinal truth: a readable dose trajectory and a recorded indication |
| [D-069](decisions/D-069.md) | Active / Accepted | Not separately tracked in the historical decision record; verify current code/ROADMAP for present implementation evidence. | Care completion is a projection over authoritative workflows, not a second task or clinical truth system |
| [D-070](decisions/D-070.md) | Active — amended | Implemented: three-row/no-left-sidebar shell; visible destination wording is amended by D-072 and D-083. | Three-row navigation replaces the launcher and left sidebar |
| [D-071](decisions/D-071.md) | Active / Accepted | Implemented: signed encounter history uses authoritative records and corrections append to the legal record. | Signed encounter history is authoritative; corrections append to the legal record |
| [D-072](decisions/D-072.md) | Active / Accepted | Implemented: Calendar is a first-class persistent workspace over the authoritative appointment store. | Calendar is a first-class workspace, not a Dashboard mode |
| [D-072B](decisions/D-072B.md) | Active — amended | Implemented for scheduled/confirmed new-patient booking; tentative new-caller behavior is amended by D-073/D-076. | Calendar booking can create a patient chart from caller-supplied identity |
| [D-073](decisions/D-073.md) | Active — amended | Implemented; existing-patient tentative holds remain, while new-caller chart creation is amended by D-076. | Tentative caller holds are distinct from scheduled visits |
| [D-074](decisions/D-074.md) | Active — amended | Implemented; administrative-facts projection remains, with later subject/evidence/timing extensions from D-076–D-078. | First-call intake is a projection over saved administrative facts |
| [D-075](decisions/D-075.md) | Active — amended | Implemented foundation; queue/readiness remains active with subject/appointment assumptions amended by D-076/D-078. | Intake is a staff-workflow queue and a readiness projection, not a second intake record |
| [D-076](decisions/D-076.md) | Active — amended | Implemented: prospective identity, readiness accuracy, duplicate review, and confirm-override boundary. | Intake truth-alignment and safety hardening: prospective identity, readiness accuracy, and the confirm-override boundary |
| [D-077](decisions/D-077.md) | Active / Accepted | Implemented: prospect-stage documents and coverage remain the same rows through promotion. | Intake truth-continuity: prospect-stage documents and coverage are the same rows after promotion |
| [D-078](decisions/D-078.md) | Active / Accepted | Implemented: Intake can start without a visit and the queue can create standalone intake episodes. | Intake can start before a visit exists; starting one is reachable from the queue itself |
| [D-079](decisions/D-079.md) | Active / Accepted | Implemented: ESLint/check quality gate is active; repo-wide Prettier formatting and CSS linting remain deferred. | Staged ESLint/Prettier architecture; formatting and CSS linting deferred |
| [D-080](decisions/D-080.md) | Active / Accepted | Implemented: PatientWorkspace is decomposed into focused controllers and presentation boundaries. | Typed application-shell coordination and PatientWorkspace decomposition |
| [D-081](decisions/D-081.md) | Active / Accepted | Implemented: authoritative navigation controller plus typed cross-workspace coordination are current shell architecture. | Authoritative workspace navigation controller and typed cross-workspace event coordination |
| [D-082](decisions/D-082.md) | Active / Accepted | Implemented: CSS ownership and semantic stacking-layer contract are current architecture. | CSS ownership and application stacking contract |
| [D-083](decisions/D-083.md) | Active — amended | Destination semantics remain current; D-084 changed shell placement and D-085 makes the old top work-menu placement transitional during additive migration. | Current work navigation uses Calendar; layout configuration lives under Preferences |
| [D-084](decisions/D-084.md) | Active — amended | Phase 1 remains implemented, but D-085 changes labeled Level-1 work navigation from the durable target to a transitional path retired only after replacement parity. | Unified two-level chrome replaces the standalone work-navigation row |
| [D-085](decisions/D-085.md) | Active — amended | Implemented through UI-1–UI-9: the additive shell migration is complete, including D-096's foreground-canvas context ownership. D-086 amends Staff/HR placement, D-087 Settings placement, D-089 Tasks ownership, D-090 Labs/Prescribing placement, and D-096 implicit context ownership. | Home + workspace tabs + universal `+` launcher with expandable contextual canvases |
| [D-086](decisions/D-086.md) | Active / Accepted | Implemented: the authority boundary, the self-service record, both presentations, and assignment by owners, managers and designated HR personnel. Designating remains owner/manager only. | HR is available to everyone, and other people's records are not |
| [D-087](decisions/D-087.md) | Active / Accepted | Implemented: the account-menu entry landed in UI-6f and the Practice group was removed in UI-6g, closing UI-6. Amends D-085's "Settings to profile/preferences" — the practice's default layouts never lived there. | Organization administration is not preferences, and it lives in the account menu |
| [D-088](decisions/D-088.md) | Active / Accepted | Implemented: the two contradicting `ehr-switch-view` branches were removed in UI-7a, restoring the practice Documents and Labs queues. Amends D-081 by stating the constraint its command/notification seam left unsaid. | A controller command and the notification it emits must not disagree |
| [D-089](decisions/D-089.md) | Active / Accepted | Implemented in UI-7b: the practice task queue is one component rendered by both the `tasks` module and the Tasks companion's expanded canvas; the Clinical menu entry was removed after that was verified. Amends D-085 by settling Tasks' ownership and what a companion owes a capability it owns. | Tasks belongs to the companion, and the companion renders the queue rather than linking to it |
| [D-090](decisions/D-090.md) | Active / Accepted | Half implemented in UI-7c: Labs moved to the `+` launcher and left the Clinical menu after verification. Prescribing's owner is decided and **not** implemented — its queue cannot be made non-empty without a commercial e-prescribing adapter, so the menu entry stays and UI-7d carries the work. Amends D-085 by settling both of Clinical's remaining children. | Labs is Documents' twin and goes where Documents went; Prescribing's owner is the companion, and it cannot be proven yet |
| [D-091](decisions/D-091.md) | Active / Accepted | Implemented in CB-0b: three of the six standing browser failures were stale specs repaired against the surfaces that replaced the ones they named, the demo schedule is now placed by relationship rather than by one day offset, the `+` launcher lists open charts before alphabetically-early ones, and the spec that books into the shared practice takes its bookings back out. Full browser suite green at 179/179. | A standing failure record names a cause per failure; the demo practice is placed by the relationships it was written to express; and the launcher lists what is open |
| [D-092](decisions/D-092.md) | Active / Accepted | Implemented in UI-7d: the practice prescribing queue is rendered by the right companion at two densities, the Clinical menu entry is removed and the Clinical group with it, and the workspace tab stays reachable. Amends D-090 — the owner decided the move proceeds without a vendor, and the parity bar is the route being removed rather than the capability working. The detail pane, patient-context gate, retry and evidence forms remain unexercisable and are named as such. | Prescribing moves to the companion on the owner's decision, with the unproven half named rather than implied |
| [D-093](decisions/D-093.md) | Active / Accepted | Implemented: the Prescribing companion offers a patient selector, and choosing one renders the same `PatientPrescriptionWork` the chart renders under an identity header of its own, with a composer bound to that patient. Amends D-092, which named the practice queue's gap without noticing it left a rail tool that did nothing. | The Prescribing companion picks a patient, and the pane it opens carries that patient's identity |
| [D-094](decisions/D-094.md) | Active / Accepted | Implemented in UI-8: Dashboard gained the `+` launcher entry it lacked, and the top-bar work-navigation row was then removed with its component, stylesheet rules, stacking token and the dead `navigationTrigger` variant. Amends D-070/D-083/D-084/D-085 by retiring the transitional work-navigation placement they preserved. `WORKSPACE_NAVIGATION_MENU_OPEN_EVENT` is left in place and named as inert. | Row one keeps identity, the omnibox and the account; every work destination is reached from the tab strip |
| [D-095](decisions/D-095.md) | Active / Accepted | Implemented in UI-8b: Calendar became a one-time rail backfill instead of being spliced into every read, and `PUT /api/preferences` stopped accepting the four pinned-rail fields `PUT /api/preferences/rails` owns — the same carve-out `workspaceState` already had in that handler. `activeRightPanel`/`rightPanelOpen` stay with the display-preferences writer, which is their only writer. Amends D-035/D-085; repeats D-088's shape. | A pinned rail is the clinician's, and only the endpoint that owns it may write it |
| [D-096](decisions/D-096.md) | Active / Accepted | Implemented in UI-9: one derived foreground-canvas identity scopes patient-capable companions, the omnibox, and the Layout Customizer; focused unit/browser coverage and the required repository gates pass. Amends D-085. | The foreground canvas owns implicit companion context |
| [D-097](decisions/D-097.md) | Active / Accepted | Implemented by the owner-directed ambient-omnibox slice: informational questions render the existing authorized planner answer inline with provenance and secondary explicit actions; push CI is the repository validation gate for this direct-main change. Amends D-064 and D-096. | The omnibox answers informational questions before it navigates |
| [D-098](decisions/D-098.md) | Active / Accepted | Implemented in ERG-1: patient-bound companion tools expose a shared toolScope/parked state, assessment insertion requires an active Encounter destination, patient-tab overflow preserves logical open work, shell hotkeys are centralized, and Stage Refill remains staging-only. | Patient-bound peripheral work never silently retargets, and shortcuts never bypass review boundaries |
| [D-099](decisions/D-099.md) | Active / Accepted | Implemented in MON-1: practice/provider/patient monitoring intervals persist as layered policy; patient exceptions require a reason; Overview consumes effective lab/vital policy; legacy synthetic surveillance banners no longer compete with the policy engine. | Medication monitoring attention is configurable policy, not hard-coded patient truth |
| [D-100](decisions/D-100.md) | Active / Accepted | Implemented in NOTE-READY-1: a visit-readiness panel beside the note projects the draft's coding goals, care-completion rules, D-099 monitoring, recorded coverage, coded diagnosis links and practice billing setup; nothing is checked off by hand and each source fails visibly on its own. Suggestions follow the cursor; Focus leaves only the page. | Visit readiness is a projection beside the note, not a second checklist |
| [D-101](decisions/D-101.md) | Active / Accepted | Implemented in BILL-1: charge templates per note template, a practice fee schedule (amounts only from it, never $0.00 for unpriced), attested add-on codes sealed into the signed snapshot, recorded practice/provider billing identity, and an audited superbill for reviewed charges. Claim transmission is still refused. | Charge templates, the practice fee schedule, attested add-ons, and the superbill |
| [D-102](decisions/D-102.md) | Active / Accepted | Implemented in CB-6b: on screens wider than 1080px the chart makes room for a docked companion (it floats only when narrower); all companions share one frame (compact header, fixed toolbar, single scroller, sticky footer); rating scales start blank per patient; scratchpad notes name their patient; rail labels appear on hover only, and badges say what they count. | Companion panels dock beside the chart and share one frame |

## Date corrections verified against Git history

- D-077 ADR date is 2026-09-17 (implementation commit `d129bf5`). Its migration identifier intentionally remains `2026-09-18-001-document-insurance-prospective-identity`.
- D-078 ADR date is 2026-09-17 (implementation commit `26809d6`). Its migration identifier intentionally remains `2026-09-19-001-intake-episode-standalone`.

The later-dated migration IDs are code identities and were not renamed.

## Maintenance rule

Keep D-numbers stable. Never rewrite historical rationale merely to make it sound current. When only part of a decision changes, keep the ADR active and name the later amendment rather than declaring the whole record superseded. Execution/completion belongs in [`ROADMAP.md`](ROADMAP.md), not in this index.
