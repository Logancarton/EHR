# Clinical Bond Decision Index

This is the lightweight discovery surface for durable product and architecture decisions. Full rationale lives in [`docs/decisions/`](decisions/). The legacy monolithic decision log is preserved as [historical evidence](archive/decisions/DECISIONS-through-D-082.md).

## Status semantics

- **Active / Accepted** — currently governing.
- **Active — amended** — still governing, but a named later ADR modifies a specific portion.
- **Superseded** — the whole decision is replaced by a named successor.
- **Deferred / Proposed** — intentionally not governing current implementation.
- Implementation status is tracked separately from architectural authority.

No whole ADR in the current D-001 through D-083 corpus is classified as fully Superseded. Several decisions are partially amended; those relationships are explicit below and in each ADR. D-037 is an accepted decision to defer live DrFirst work; the decision itself remains active.

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

| ID | Authority | Implementation note | Decision |
| --- | --- | --- | --- |
| [D-001](decisions/D-001.md) | Active / Accepted | accepted | Build from scratch |
| [D-002](decisions/D-002.md) | Active / Accepted | accepted | Workspace-first interaction model |
| [D-003](decisions/D-003.md) | Active / Accepted | accepted | AI is a cross-cutting layer |
| [D-004](decisions/D-004.md) | Active / Accepted | accepted | Structured clinical data remains authoritative |
| [D-005](decisions/D-005.md) | Active / Accepted | accepted | FHIR at boundaries, not as the UI architecture |
| [D-006](decisions/D-006.md) | Active / Accepted | accepted | Vendor integrations use adapters |
| [D-007](decisions/D-007.md) | Active / Accepted | accepted | Synthetic data until security foundation exists |
| [D-008](decisions/D-008.md) | Active / Accepted | accepted | Human confirmation for consequential AI actions |
| [D-009](decisions/D-009.md) | Active / Accepted | accepted | Start single-clinician, avoid single-clinician dead ends |
| [D-010](decisions/D-010.md) | Active / Accepted | accepted | Direct-to-main agent workflow |
| [D-011](decisions/D-011.md) | Active / Accepted | accepted | Patient workspaces can detach into floating windows |
| [D-012](decisions/D-012.md) | Active / Accepted | accepted | Elastic Complexity & Dynamic Workspace Modularity |
| [D-013](decisions/D-013.md) | Active / Accepted | accepted | Vendor-Neutral Order Adapters & Staged Attestation Cart |
| [D-014](decisions/D-014.md) | Active / Accepted | accepted | SQLite FTS5 BM25 Engine for Longitudinal Clinical Note Search |
| [D-015](decisions/D-015.md) | Active / Accepted | accepted | Practice Scheduling Persistence & Walk-in Decoupling |
| [D-016](decisions/D-016.md) | Active / Accepted | accepted | Token-Budgeted, Permission-Aware Context Assembly Pipeline |
| [D-017](decisions/D-017.md) | Active / Accepted | accepted | Encounter closing is coordinated, not transactional |
| [D-018](decisions/D-018.md) | Active / Accepted | accepted | Authoritative team users with revocable server-side sessions |
| [D-019](decisions/D-019.md) | Active / Accepted | accepted | Medication clinical truth is separate from prescribing-vendor evidence |
| [D-020](decisions/D-020.md) | Active / Accepted | accepted | Medication reconciliation is an explicit clinician conversion of evidence into clinical truth |
| [D-021](decisions/D-021.md) | Active / Accepted | accepted | Prescription intent is separate from medication clinical truth |
| [D-022](decisions/D-022.md) | Active / Accepted | accepted | External prescription transaction state is a separate authority class |
| [D-023](decisions/D-023.md) | Active / Accepted | accepted | Refill/renewal requests are workflow evidence; approval creates a new prescription intent |
| [D-024](decisions/D-024.md) | Active / Accepted | accepted | Pharmacy change requests remain explicit workflow evidence; no generic prescription relationship graph yet |
| [D-025](decisions/D-025.md) | Active / Accepted | accepted | Verified prescribing callbacks are a separate integration authority boundary |
| [D-026](decisions/D-026.md) | Active / Accepted | accepted | Integration configuration, secrets, and delivery reliability remain separate from clinical authority |
| [D-027](decisions/D-027.md) | Active / Accepted | accepted (2026-09-09) | Canonical True North interaction specification |
| [D-028](decisions/D-028.md) | Active / Accepted | Selected vendor; live integration deferred by D-037 | DrFirst selected for planned e-prescribing and EPCS |
| [D-029](decisions/D-029.md) | Active / Accepted | accepted (2026-09-09) | Evidence-based roadmap gates and save reliability priority |
| [D-030](decisions/D-030.md) | Active / Accepted | accepted (2026-09-09) | Absence of clinical facts must be loaded, never assumed |
| [D-031](decisions/D-031.md) | Active / Accepted | accepted (2026-09-09) | Browser verification tooling is a named Phase 0 prerequisite |
| [D-032](decisions/D-032.md) | Active / Accepted | accepted (2026-09-09) | Remediate verified authority gaps independently of browser tooling |
| [D-033](decisions/D-033.md) | Active / Accepted | accepted (2026-09-09) | Patient access is organization membership, decided separately from authentication and role |
| [D-034](decisions/D-034.md) | Active / Accepted | accepted (2026-09-09) | Playwright is the browser verification harness (recording the D-031 choice) |
| [D-035](decisions/D-035.md) | Active — amended | accepted (2026-09-10) | Clinician layout choices are durable, and every dismissal has a visible way back |
| [D-036](decisions/D-036.md) | Active / Accepted | accepted (2026-09-10) | Workspace restoration completes before it is reported complete |
| [D-037](decisions/D-037.md) | Active / Accepted | Deferral active | DrFirst prescribing integration deferred; production infrastructure takes its place in the queue |
| [D-038](decisions/D-038.md) | Active / Accepted | accepted (2026-09-10) | Organization administration is confined to the administrator's own practice |
| [D-039](decisions/D-039.md) | Active / Accepted | accepted (2026-09-10) | An account's password belongs to its holder, never to the administrator |
| [D-040](decisions/D-040.md) | Active / Accepted | accepted (2026-09-10) | Password guessing is rate limited per username, and an administrator can clear a lockout |
| [D-041](decisions/D-041.md) | Active / Accepted | accepted (2026-09-10) | The database location is explicit in production, and recovery is proven rather than assumed |
| [D-042](decisions/D-042.md) | Active / Accepted | accepted (2026-09-10) | The authenticated roster is the only runtime patient truth |
| [D-043](decisions/D-043.md) | Active / Accepted | accepted (2026-09-11) | One interaction grammar, extracted from measured repetition |
| [D-044](decisions/D-044.md) | Active / Accepted | accepted (2026-09-11) | The administrative record is normalized, and age is derived |
| [D-045](decisions/D-045.md) | Active / Accepted | accepted (2026-09-11) | Billing order and prescribing destination are recorded choices, not orderings |
| [D-046](decisions/D-046.md) | Active / Accepted | accepted (2026-09-11) | A first install is a tested path |
| [D-047](decisions/D-047.md) | Active / Accepted | accepted (2026-09-11) | A destination is offered only when it works |
| [D-048](decisions/D-048.md) | Active — amended | accepted direction (2026-09-14); implementation pending the DB gates in ROADMAP.md section 21. | Schedule-first personal dashboards over shared team work |
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
| [D-064](decisions/D-064.md) | Active / Accepted | accepted (2026-09-15); implemented for roadmap §19 AI-0. Follows D-063, which removed the financial half of the same defect. | One grounded answer path for every clinical question |
| [D-065](decisions/D-065.md) | Active / Accepted | accepted (2026-09-15); implemented as the P9-0 follow-up recorded in ROADMAP §15. | Normalized signing-date projection over immutable encounter records |
| [D-066](decisions/D-066.md) | Active / Accepted | accepted (2026-09-15). | One expiry is one question: latching the session challenge |
| [D-067](decisions/D-067.md) | Active / Accepted | accepted (2026-09-15). | Getting out of a layered surface without reaching for the × |
| [D-068](decisions/D-068.md) | Active / Accepted | accepted (2026-09-15); completes roadmap §9 P3-C, the last sub-item of Phase P3 without a completion marker. | Medication longitudinal truth: a readable dose trajectory and a recorded indication |
| [D-069](decisions/D-069.md) | Active / Accepted | accepted (2026-09-15); delivers roadmap §21 DB-10. | Care completion is a projection over authoritative workflows, not a second task or clinical truth system |
| [D-070](decisions/D-070.md) | Active — amended | Implementation described in record; verify current code for exact scope | Three-row navigation replaces the launcher and left sidebar |
| [D-071](decisions/D-071.md) | Active / Accepted | Implementation described in record; verify current code for exact scope | Signed encounter history is authoritative; corrections append to the legal record |
| [D-072](decisions/D-072.md) | Active / Accepted | Not separately tracked in legacy header; verify current code/ROADMAP | Calendar is a first-class workspace, not a Dashboard mode |
| [D-072B](decisions/D-072B.md) | Active — amended | Not separately tracked in legacy header; verify current code/ROADMAP | Calendar booking can create a patient chart from caller-supplied identity |
| [D-073](decisions/D-073.md) | Active — amended | Not separately tracked in legacy header; verify current code/ROADMAP | Tentative caller holds are distinct from scheduled visits |
| [D-074](decisions/D-074.md) | Active — amended | Not separately tracked in legacy header; verify current code/ROADMAP | First-call intake is a projection over saved administrative facts |
| [D-075](decisions/D-075.md) | Active — amended | Implementation described in record; verify current code for exact scope | Intake is a staff-workflow queue and a readiness projection, not a second intake record |
| [D-076](decisions/D-076.md) | Active — amended | Implementation described in record; verify current code for exact scope | Intake truth-alignment and safety hardening: prospective identity, readiness accuracy, and the confirm-override boundary |
| [D-077](decisions/D-077.md) | Active / Accepted | Implementation described in record; verify current code for exact scope | Intake truth-continuity: prospect-stage documents and coverage are the same rows after promotion |
| [D-078](decisions/D-078.md) | Active / Accepted | Implementation described in record; verify current code for exact scope | Intake can start before a visit exists; starting one is reachable from the queue itself |
| [D-079](decisions/D-079.md) | Active / Accepted | accepted. | Staged ESLint/Prettier architecture; formatting and CSS linting deferred |
| [D-080](decisions/D-080.md) | Active / Accepted | accepted. | Typed application-shell coordination and PatientWorkspace decomposition |
| [D-081](decisions/D-081.md) | Active / Accepted | accepted. | Authoritative workspace navigation controller and typed cross-workspace event coordination |
| [D-082](decisions/D-082.md) | Active / Accepted | accepted. | CSS ownership and application stacking contract |
| [D-083](decisions/D-083.md) | Active / Accepted | Current implemented shell/documentation contract | Current work navigation uses Calendar; layout configuration lives under Preferences |

## Maintenance rule

Keep D-numbers stable. Never rewrite historical rationale merely to make it sound current. When only part of a decision changes, keep the ADR active and name the later amendment rather than declaring the whole record superseded. Execution/completion belongs in [`ROADMAP.md`](ROADMAP.md), not in this index.
