# EHR Roadmap

Reviewed: 2026-09-09 against GitHub `main` starting at `a2795fc47ddd0a930b78693ca4e39c942e6061b7`; updated by the floating-window gesture ownership slice in this change.

## Direction and status

The next milestone is a dependable psychiatric clinician workspace: find a patient, document, inspect related evidence, change sections/windows, and return without lost work or ambiguous patient context. Expand production AI and external services through those same workflows once their prerequisites are met.

[PRODUCT_VISION.md](PRODUCT_VISION.md) remains the canonical interaction target and requirement-ID source. This roadmap owns sequencing and exit gates, not a second feature specification. Historical Phase 3 and Phase 4A–4M implementation labels in commits/domain documents are not proof that the broad phases below are complete.

**Current verdict: substantial development foundations exist; the complete clinician workflow, production AI, live integrations, and production-PHI readiness remain incomplete.** Earlier “Complete” labels and claims of functional DrFirst/EPCS were inaccurate and are superseded by this review. CI #273 passed typecheck, clinical integration tests, production build, and overall CI on `a2795fc47ddd0a930b78693ca4e39c942e6061b7`; that evidence does not certify browser behavior, clinical-rule accuracy, or production deployment.

Status terms: **implemented foundation** means code and focused automated coverage exist; **partial** means a usable slice exists with known gaps; **deferred/gated** means prerequisites or implementation remain. No percentage-complete estimate is assigned.

## What exists and what remains

| Area | Evidence on reviewed main/current slice | Remaining work |
| --- | --- | --- |
| Browser workspace — partial | Reorder/detach controllers, floating-window chrome, local Back/Forward, side/corner snap logic and tray; clinician workspace snapshots and non-Encounter patient scroll persistence. Floating move/resize gestures now have explicit pointer ownership, pointer capture, shared cancellation cleanup, and gesture lifecycle signaling; snap completion is tied to the owning gesture and guarded against stale deferred callbacks. [Controllers](../app/components/FloatingPaneController.tsx), [window manager](../app/components/WorkspaceWindowManager.tsx), [gesture ownership](../app/lib/window-gesture.ts), [workspace state](../app/components/WorkspaceStateManager.tsx), [verified notes](PRODUCT_VISION.md#verified-implementation-notes). | Repeatable browser lifecycle verification with two synthetic patients, reachable geometry on small/resized viewports, focus/z-order and keyboard checks. Encounter scrolling is separate; floating history does not survive docking/reload; section-strip/global scroll remains session-only. |
| Personalization — partial | Density, layout customizer/presets, sidebar and companion-panel controls, clinician preference/workspace persistence. [Customizer](../app/components/WorkspaceCustomizer.tsx), [preferences](../app/lib/preference-engine.ts). | Verify launcher add/remove/reorder to both extremes, preset save/reload, keyboard access, readable identity and pending-work indicators across densities. Follow LEFT-01–04, RIGHT-01–04 and LAYOUT-01–05 without replacing existing customization. |
| Encounter workflow — partial | Server draft hydration/autosave now has explicit unsaved/saving/saved/failed state, retry, serialized/coalesced writes, server revision protection, clinician/patient/encounter binding, safe hydration, and reviewed-draft flush before signing. Signed-record integrity remains immutable. [EncounterWorkspace](../app/components/encounter/EncounterWorkspace.tsx), [save lifecycle](../app/lib/encounter-save-lifecycle.ts), [save tests](../tests/encounter-save-lifecycle.test.ts), [integrity tests](../tests/signed-encounter-integrity.test.ts), [closing tests](../tests/encounter-closing-workflow.test.ts). | Browser-level verification of pending/failed save behavior across patient switching, detach/dock, reload, close, and late responses; complete synthetic-visit workflow verification. The save coordinator foundation is no longer the first unfinished roadmap item. |
| Clinical record lifecycles — implemented foundations | Normalized medication/problem/allergy records, lab-result lifecycle, provenance/version history, immutable signed encounters, charted communications and document review/filing. [Architecture](ARCHITECTURE.md), [documents](document-workflow.md), [message charting](message-charting.md). | End-to-end workflow verification; durable document binary upload/retrieval and production object storage; import/reconciliation and related-evidence workflows. Existing document metadata/version workflows must be reused. |
| Prescribing — implemented internal foundation; external use gated | Medication reconciliation and prescription intent remain separate; authorization, transactions, CancelRx, renewals, change requests, verified callback boundary, uncertainty recovery, operations queue and patient prescribing surface exist. [Transactions](PRESCRIPTION_TRANSACTIONS.md), [callbacks](PRESCRIPTION_CALLBACKS.md), [recovery](PRESCRIPTION_RECOVERY.md). | Contracted DrFirst mapping/connectivity, vendor-tested callbacks and EPCS workflow, onboarding/certification and operational readiness. [DrFirst adapter](../app/adapters/prescribing/drfirst-adapter.ts) deliberately fails closed. No local PIN/OTP or mock transport establishes working EPCS. |
| Identity and persistence — implemented development foundations | Server sessions, authoritative roles, patient-bound action gateway, permission-aware context, SQLite records, audit and preferences. Ordered transactional migration ledger and integration secret-reference/readiness boundaries also exist. [Authentication](AUTHENTICATION.md), [integration infrastructure](INTEGRATION_INFRASTRUCTURE.md). | Production identity administration/session controls, organization/patient-access isolation, database migration strategy, encryption/secrets deployment, backups and tested recovery. The migration ledger covers new infrastructure; legacy startup schema work remains. |
| AI and voice — partial/prototype | Authenticated omnibox planning with validated proposals and restricted execution; context assembly; FTS encounter search; deterministic extraction; simulated ambient stream and dictation UI. [Planner gateway](../app/server/ai/omnibox-model-gateway.ts), [search](../app/server/repositories/clinical-search-repository.ts), [scribe](../app/components/encounter/EncounterScribePane.tsx). | Production model and transcription adapters, source-grounded drafting/retrieval, uncertainty and quality evaluations, latency/cost controls, approved data handling. Current rule planner and keyword search are not general LLM reasoning or semantic retrieval. |
| Schedule, queues and collaboration — partial | Appointment/task/message repositories, practice queues, team messaging and mutual assignment agreements; patient message charting and global lab/document queues. [Queue tests](../tests/practice-queues.test.ts), [collaboration service](../app/server/services/collaboration-service.ts). | Browser completion/error-path validation, patient-facing authentication/delivery, reminders, assessment collection, external calendar/booking integration, cross-coverage permissions. Local messaging is not evidence of a deployed patient portal or SMS service. |
| Clinical decision support and billing — prototype/deferred | Local interaction/protocol rules and encounter coding suggestions. [Interaction rules](../app/lib/drug-interaction-engine.ts), [encounter engine](../app/lib/encounter-engine.ts). | Clinical source/version governance and accuracy validation; evidence-grounded coding review; eligibility, claims, remittances and reconciliation. Local rules are not a comprehensive validated drug database or production billing service. |

## Phase 0 — Workspace reliability and restoration

Status: **Partial; active priority.** Requirements: TAB-01–04, WIN-01–09, NAV-01–05, SAVE-01–08, VIS-05.

1. **Implemented foundation:** floating movement/resizing is explicitly owned by one pointer from start through completion/cancellation. Shared cleanup covers pointer cancellation, Escape, focus loss, pane removal/controller cleanup, pointer capture release, moving/resizing classes, resize cursor and dock highlight. The snap manager consumes the owning move gesture identity and invalidates stale deferred release work when a gesture is canceled or superseded. Docking keeps precedence over snapping. Focused deterministic tests exist; this is not browser-lifecycle certification.
2. Establish repeatable browser tests with synthetic patients for detach, all eight resize directions, protected controls, docking by button/drag, snap preview/placement, minimize/restore, maximize/restore, title-bar double-click, activation and multiple visible charts. Side/corner snap code already exists: verify it before adding more layout logic. Include canceled gestures and late async responses.
3. Verify durable restoration across reload and viewport changes, including patient/section identity, reachable controls, clinician-scoped preferences and no observer loops. Audit competing session/durable geometry restoration and restore bounds before generalizing window state.
4. Extend scroll restoration to Encounter nested surfaces only after defining stable ownership; decide which remaining session-only scroll/history state actually needs durability. Keep non-Encounter scrolling in the existing workspace snapshot.

Exit gate: affected browser scenarios pass with two synthetic patients and an unfinished draft, including canceled gestures and late responses. Passing unit tests alone does not close this phase.

## Phase 1 — Dependable clinician workflow nucleus

Status: **Partial; encounter save acknowledgement/recovery foundation is implemented.** Requirements: TAB-03, WIN-09, PAT-01–06, RIGHT-04, NAV-05.

1. **Implemented foundation:** encounter persistence exposes saving/saved/failed feedback, retry, ordered/coalesced writes, optimistic server revision checks, identity binding, safe hydration, and exact reviewed-draft flush before signing while preserving server-owned signing and immutable signed records. Browser lifecycle verification of pending/failed saves remains part of the Phase 0/visit-flow acceptance work rather than a reason to redesign the coordinator.
2. Verify one complete synthetic visit: Today → patient → encounter draft → related medication/lab/document → reviewed candidates → sign → follow-up queue → reopen. Check that every pending action and async result retains its originating patient when another window becomes active.
3. Complete one document intake slice using existing document records: upload → stored content → review → file → reopen exact version, with content integrity and patient-bound access. Keep imports as evidence awaiting review, not automatic clinical truth.
4. Validate queue-to-object-to-action navigation for results, documents, patient communications and prescribing exceptions. Reuse the existing lifecycle services; fix missing action feedback or dead ends rather than build duplicate dashboards.

Exit gate: a clinician can complete and resume that visit with visible persistence outcomes and no lost work, wrong-patient mutations or misleading external-service success. Live prescribing is a separate Phase 4 gate.

## Phase 2 — Production data, identity and operations

Status: **Development foundations implemented; production requirements unmet.** Required before real PHI, regardless of progress in later phases.

- Choose and implement the production database/deployment path (PostgreSQL or equivalent), extending the migration discipline already present. Prove migration of existing records, version history and immutable data; retire legacy startup schema mutation deliberately.
- Define organization membership and patient-access scope across reads, search/context assembly, writes, documents and preferences. Reuse first-party identity and server-derived roles; do not treat integration configuration scope as complete tenant isolation.
- Complete controlled user provisioning/revocation and appropriate stronger authentication/session/device controls, with OAuth/SSO where chosen. Review browser draft/cache handling at logout and clinician changes.
- Deploy encryption, production secret management, protected object storage, audit retention/access review, monitoring and incident response. Verify backup restoration and disaster recovery rather than merely configure backups.
- Complete infrastructure/vendor agreements and security/privacy review appropriate to real clinical data, including retention and recovery policies. Exercise access-denial and cross-organization isolation tests.

Exit gate: an explicitly reviewed deployment with tested identity isolation, protected records, operational monitoring and demonstrated restore/recovery. A production Next.js build is not this gate.

## Phase 3 — Production AI and transcription

Status: **Safe planning/context foundation implemented; production intelligence deferred/gated.** Requirements: CMD-01–05, RIGHT-01–04, LAYOUT-04.

Build alongside clinical workflows using synthetic data until Phase 2 and the selected provider/data-handling arrangements permit more:

1. Connect one model adapter to the existing permission-aware context/proposal boundary. Deliver a source-linked patient summary or draft with explicit uncertainty before broadening tasks.
2. Replace simulated ambient input with one tested transcription path; preserve speaker/source attribution, review, consent/retention handling and draft recovery on interruption.
3. Evaluate factual grounding, source correctness, missed/unsupported facts, wrong-patient/stale-result rejection, clinician edits, latency and cost. Include adverse cases, not just successful demonstrations.
4. Extend retrieval beyond existing FTS only when evaluation shows a concrete need; add semantic retrieval behind patient/access filters. Extend workspace commands through supported operations rather than granting general clinical execution.

Exit gate: one useful AI-assisted clinical workflow meets documented quality criteria, with inspectable sources and explicit clinician acceptance. AI cannot sign, authorize/transmit prescriptions, reconcile medication truth or execute recovery actions.

## Phase 4 — Verified external integrations

Status: **Internal prescribing infrastructure implemented; live connectivity gated.** Requirements: RX-01–05.

- **DrFirst is the selected prescribing/EPCS integration.** First establish actual product/interface, contracted sandbox access, credentials, supported authentication and onboarding/testing requirements. Then implement and test one adapter edge using the existing transaction, callback and recovery architecture. Preserve visible patient context and distinguish local authorization from vendor-confirmed outcomes.
- Verify ambiguous sends, replay, cancellation, renewal/change requests and EPCS through the supported vendor workflow. Vendor evidence never automatically changes the medication list. PDMP, formulary/benefit, medication history and prior authorization depend on the actual contracted capabilities.
- Add lab ordering/results through a verified adapter with source identity, units, reference ranges, reconciliation and acknowledgement. Local requisition/simulation behavior does not establish Quest/Labcorp connectivity.
- Add patient portal/secure communications, booking/reminders and assessment collection as separate authenticated delivery workflows. Add record import/export (FHIR/US Core or C-CDA as appropriate) behind adapters with reconciliation and provenance.

Exit gate per integration: vendor-tested exchange, authoritative patient correlation, access controls, auditability, failure/retry handling and operational support. Do not wait for every integration to validate the first one, and do not fabricate connectivity while onboarding is unavailable.

## Phase 5 — Revenue cycle and practice operations

Status: **Deferred beyond local coding suggestions.**

Validate evidence-grounded coding and clinical-rule sources before consequential use. Then build one claim lifecycle: reviewed encounter evidence → prepared claim → explicit submission → status/remittance → reconciliation. Add eligibility, denial work queues and payer-specific checks through adapters as justified.

Accounting/banking, website/booking, practice analytics and other all-in-one ambitions follow defined reconciliation and permission boundaries. Keep administrative data distinct from clinical truth; do not add a large dashboard before its underlying workflow is dependable.

Exit gate: one auditable, reconcilable financial workflow with no invented billing evidence or implied payer success.

## Phase 6 — Team scale and specialty expansion

Status: **Basic team collaboration exists; expansion deferred.**

Extend existing messaging and mutual task-assignment agreements into cross-coverage, shared work queues and handoffs after organization/patient-access controls are established. Add multi-practice administration, specialty layouts and enterprise identity integrations only when concrete workflows require them.

Exit gate: tested access, ownership, handoff and conflict behavior across multiple clinicians/organizations without weakening patient context or record integrity.

## Immediate implementation queue

1. Repeatable two-patient browser lifecycle coverage, then fix the failures it demonstrates. Exercise detach, movement, all eight resize directions, protected controls, dock by button/drag, snap preview/placement, minimize/restore, maximize/restore, title-bar double-click, focus/z-order, multiple visible patient charts, unfinished encounter draft preservation, canceled gestures and late async responses.
2. Finish the next evidence-handling slice: durable document content intake/retrieval through the existing document workflow.
3. Verify the complete synthetic visit and queue-to-object-to-action flow with patient-bound late-response handling.

These are narrow implementation slices, not authorization to rewrite `PatientWorkspace.tsx` or replace existing controllers. Production infrastructure and vendor onboarding can proceed when their concrete prerequisites are available; they must not be represented as finished by prototype UI work.

## Updating this roadmap

Update evidence and remaining gaps after meaningful implementation. Before choosing work, inspect current `main`; this review is a dated baseline, not a substitute for code inspection. Keep requirement definitions in [PRODUCT_VISION.md](PRODUCT_VISION.md) and record material sequencing/architecture decisions in [DECISIONS.md](DECISIONS.md). Never introduce duplicate prescribing state machines, generic workflow frameworks or competing planning documents merely to advance a phase label.
