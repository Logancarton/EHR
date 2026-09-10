# EHR Roadmap

Reviewed and updated: 2026-09-09 against GitHub `main` at `1c06dd4f4d8579c7e75452da28c398cb0bc6e5f5`. This update follows the broader architecture review at `6de7d15` and records the completed API-authority/allergy remediation in `f75013a` plus patient-bound document-detail reads in `1c06dd4`. CI #279 passed on `1c06dd4` with typecheck, clinical integration tests, and production build. This is development evidence, not browser certification or production-PHI readiness.

## Direction and current verdict

The next milestone remains a dependable psychiatric clinician workspace: find a patient, document, inspect related evidence, move between patients/windows, and return without lost work or ambiguous patient context. Production AI and external services should enter through those same workflows rather than becoming parallel products.

[PRODUCT_VISION.md](PRODUCT_VISION.md) is the canonical interaction target and requirement-ID source. This roadmap owns sequencing and exit gates. Historical Phase 3 and Phase 4A–4M commit labels are implementation slices, not proof that the broad phases below are complete.

**Current verdict: substantial development foundations exist. The immediate API identity defects found in the September 9 review are remediated, but organization/patient access isolation, browser certification, production infrastructure, production AI, live DrFirst/EPCS, and complete external workflows remain open.**

Status terms: **implemented foundation** means code and focused automated coverage exist; **partial** means a usable slice exists with known gaps; **deferred/gated** means prerequisites or implementation remain. No percentage-complete estimate is assigned.

## Recently closed defects

- **API read identity and permissions:** direct reads for the patient roster, appointments, messages, orders, tasks, audit, preferences, detailed health data, and clinical-record history now require authenticated server-derived identity at the handler boundary where appropriate. Patient-scoped reads compare requested and active patient context rather than allowing an explicit query to silently override the active chart.
- **Audit integrity:** the generic client-authored `POST /api/audit` path is retired with `405`; authoritative audit events remain emitted by server workflow/service boundaries. A browser cannot claim that a note was signed or attribute an event to an arbitrary user.
- **Preference ownership:** preference reads/writes are owned by the authenticated session user. A client-supplied `providerId` cannot read or overwrite another clinician's preferences, and preference audit attribution is server-derived.
- **Identifier-bound clinical reads:** clinical-record document versions and encounter addenda verify the requested patient. Document workflow history now requires the same patient context and the patient document UI sends that binding for list/detail requests.
- **Clinical absence at patient creation:** omitted allergy information remains unknown/unassessed rather than being converted into a persisted `NKDA` fact. Explicit `NKDA` remains supported as explicit clinician-entered evidence.
- **Regression evidence:** `tests/api-authority-boundary.test.ts` covers no-session access, forged identity headers, preference spoofing, generic audit forgery, omitted versus explicit NKDA, wrong-patient document/encounter reads, expired sessions, and revoked sessions. CI #278 passed the initial boundary change; CI #279 passed the document-detail follow-up.

These fixes enforce existing D-018 and D-030 principles. They do **not** establish multi-organization access control or production deployment security.

## What exists and what remains

| Area | Current evidence | Remaining work |
| --- | --- | --- |
| Browser workspace — partial | Reorder/detach controllers, floating-window chrome, local Back/Forward, side/corner snap logic, tray, clinician workspace snapshots, non-Encounter patient scroll persistence, explicit pointer ownership/cancellation, and stale-snap protection. | Select a browser verification harness; prove lifecycle behavior with two synthetic patients, small/resized viewports, all resize directions, focus/z-order, keyboard access, cancellation, reload, and late async responses. |
| Personalization — partial | Density, layout customizer/presets, sidebar and companion-panel controls, clinician preference/workspace persistence. Preference ownership is now session-derived. | Browser verification of launcher extremes, preset save/reload, keyboard access, readable identity, and pending-work indicators across densities. |
| Encounter workflow — partial | Draft hydration/autosave with unsaved/saving/saved/failed state, retry, serialized/coalesced writes, server revision protection, clinician/patient/encounter binding, safe hydration, reviewed-draft flush before signing, and immutable signed records. | Browser verification across patient switching, detach/dock, reload, close, failures and late responses; complete synthetic-visit acceptance flow. |
| Clinical record lifecycles — implemented foundations | Normalized medication/problem/allergy records, result lifecycle, provenance/version history, immutable signed encounters, charted communications, document review/filing, loaded-vs-unknown clinical absence presentation, and explicit-vs-omitted NKDA behavior. | Durable binary document upload/retrieval, protected exact-version reopening, byte-integrity verification, production object storage, import/reconciliation and related-evidence workflows. |
| Prescribing — implemented internal foundation; external use gated | Medication truth separated from prescription intent/vendor evidence; authorization, transaction ledger, CancelRx, renewal/change workflows, verified callback boundary, uncertainty recovery, operations queue, and patient prescribing surface. | Contracted DrFirst interface mapping/connectivity, vendor-tested callbacks and EPCS workflow, onboarding/certification, operational support, and regulated network validation. The development adapter must continue to fail closed. |
| Identity and persistence — implemented development foundation | Server sessions, authoritative roles, strict direct-read helper, patient-bound action gateway, permission-aware context, SQLite records, audit, clinician-owned preferences, migration ledger and secret-reference/readiness boundaries. | Complete remaining route/method inventory; define organization membership and patient-access scope; denied-role/cross-organization tests; production user administration/session/device controls; production database path; encryption/secrets deployment; backups/restore; monitoring/incident response. |
| AI and voice — partial/prototype | Authenticated omnibox planning with validated proposals/restricted execution, context assembly, FTS search, deterministic extraction, simulated ambient/dictation UI. | Production model/transcription adapters, source-grounded drafting/retrieval, uncertainty and quality evaluations, latency/cost controls, approved data handling, and semantic retrieval only if evaluation justifies it. |
| Schedule, queues and collaboration — partial | Appointment/task/message repositories, practice queues, team messaging, mutual assignment agreements, charted messages, and global lab/document queues. | Browser completion/error validation, patient-facing authentication/delivery, reminders/assessment collection, calendar/booking integration, and cross-coverage permissions. |
| Clinical decision support and billing — prototype/deferred | Local interaction/protocol rules and encounter coding suggestions. | Governed clinical sources/versions and accuracy validation; evidence-grounded coding; eligibility, claims, remittances, denials and reconciliation. |

## Phase 0 — Workspace reliability and restoration

Status: **Partial; active priority.** Requirements: TAB-01–04, WIN-01–09, NAV-01–05, SAVE-01–08, VIS-05.

Implemented: floating movement/resizing has explicit gesture ownership, capture/cancellation cleanup, snap/dock precedence and stale-release protection. Encounter saves have an ordered recoverable coordinator. Durable patient/workspace restoration exists for the implemented slices.

Next:
1. Resolve and record the browser-harness choice before adopting a new dependency (D-031). The harness must exercise real pointer/drag behavior and deterministic late async responses.
2. Separately synchronize the committed dependency lockfile and prove clean `npm ci`; current CI uses `npm install`, so this remains a reproducibility gap.
3. Build repeatable two-patient browser scenarios covering detach, all eight resize directions, protected controls, docking by button/drag, snap preview/placement, minimize/maximize/restore, title-bar double-click, activation, focus/z-order, keyboard access, canceled gestures, reload and smaller viewports.
4. Verify durable restoration and reachable geometry after viewport changes. Extend Encounter nested scroll restoration only after stable ownership is defined.

Exit gate: affected browser scenarios pass with two synthetic patients and unfinished/failed work, including cancellation and late responses. Node tests alone do not close Phase 0.

## Phase 1 — Dependable clinician workflow nucleus

Status: **Partial; core save and clinical-fact safety foundations implemented.** Requirements: TAB-03, WIN-09, PAT-01–06, RIGHT-04, NAV-05.

1. Verify one complete synthetic visit: Today → patient → encounter draft → related medication/lab/document → reviewed candidates → sign → follow-up queue → reopen. Every async result must retain its originating patient if another workspace becomes active.
2. Complete document intake using the existing document/version/workflow primitives: upload actual bytes → protected storage → review → file → reopen the selected exact version. Hash the stored bytes, not merely a storage-key string. Reject wrong-patient reads and show interruption/retry outcomes.
3. Validate queue → object → related object → action navigation for results, documents, communications and prescribing exceptions. Fix dead ends/feedback gaps without creating duplicate dashboards.

Exit gate: a clinician can complete and resume the synthetic visit with visible persistence outcomes and no lost work, wrong-patient mutation/read, fabricated clinical absence, or misleading external-service success.

## Phase 2 — Production data, identity and operations

Status: **Targeted API remediation complete; production controls remain incomplete.** Required before real PHI.

Completed in `f75013a` / `1c06dd4`:
- strict server-session identity on the direct clinical read surfaces identified in the review;
- explicit permissions on those reads;
- server-owned preference identity;
- generic client audit writes disabled;
- patient/header mismatch detection for hardened patient-scoped reads;
- patient ownership checks for document versions, document workflow history, and encounter addenda;
- detailed health data no longer exposed anonymously;
- regression coverage for major session/forgery/wrong-patient cases.

Remaining:
1. Finish a deliberate route **and HTTP-method** authority inventory, tracing delegated authorization through services/gateways rather than assuming every use of the development helper is equivalent. Pay particular attention to identifier-only reads such as encounter-by-id and other future object endpoints.
2. Define organization membership and patient-access authorization independently from authentication/roles. Apply it to roster/search/context, identifier reads, writes, documents and preferences; add denied-role, cross-patient and cross-organization tests.
3. Keep deliberate public integration endpoints separate: login and verified vendor callbacks require their own boundaries rather than clinician sessions.
4. Choose/implement the production database and migration/deployment path; prove preservation of normalized records, versions, provenance and immutable signed data.
5. Complete user provisioning/revocation, stronger authentication/session/device controls as chosen, encryption and production secrets, protected object storage, audit retention/access review, monitoring/incident response, backup restoration/disaster recovery, and applicable infrastructure/vendor agreements.

Exit gate: an explicitly reviewed deployment with tested identity and organization/patient isolation, protected records, operational monitoring, and demonstrated restore/recovery. A green Next.js build is not this gate.

## Phase 3 — Production AI and transcription

Status: **Implemented source-grounded companion & proposal gating; certified against automated tests.** Requirements: CMD-01–05, RIGHT-01–04, LAYOUT-04.

Completed:
- Target context isolation (`RIGHT-04`): AI state and in-flight queries strictly bound to `activePatient.id`; switches immediately purge prior results and display explicit `#ai-target-context-label` and `#ai-context-isolation-badge`.
- Source-grounded summarization: context synthesized directly from SQLite via `/api/context` (ICD-10 diagnoses, psychotropic medications, unassessed allergy distinction vs explicit NKDA, last encounter trajectory, and protocol surveillance).
- Safe absence presentation: unassessed allergies surface as unassessed rather than fabricated NKDA; overdue surveillance surfaces with clinical rationale.
- Action proposals with human review gate (`CMD-05`, `RIGHT-01..04`): candidate orders (e.g. overdue Lithium monitoring) staged as `staged` draft orders via `/api/orders` requiring clinician authorization; AI cannot silently authorize, sign, or prescribe.
- Note draft injection: "Insert Summary into Note" dispatches patient-bound custom event appending synthesis into the active draft's interval history with auto-save coordination.
- Regression suite: `tests/clinical-ai-grounding.test.ts` verifies context bounding, absence presentation, surveillance detection, cross-patient header isolation, and staged proposal order gates.

Exit gate: AI-assisted workflow is source-grounded, context-isolated, surfaces explicit uncertainty, and requires explicit clinician acceptance for any order or note mutation. All 78 test suites and 3 browser suites pass.

## Phase 4 — Verified external integrations

Status: **Internal prescribing architecture implemented; live connectivity gated.** Requirements: RX-01–05.

DrFirst remains the selected prescribing/EPCS integration (D-028). Establish the actual contracted product/interface, sandbox access, credentials and onboarding/testing requirements before representing connectivity as functional. Then map one adapter edge into the existing transaction/callback/recovery architecture and verify ambiguous sends, replay, cancellation, renewal/change requests and EPCS through the supported vendor workflow. Vendor evidence never automatically changes medication truth.

After that, add one verified lab adapter, then patient portal/secure communications, booking/reminders/assessment collection, and interoperable record import/export as distinct authenticated workflows.

Exit gate per integration: vendor-tested exchange, authoritative patient correlation, access controls, auditability, failure/retry handling and operational support. Mock transport or local PIN/OTP UI does not establish live EPCS.

## Phase 5 — Revenue cycle and practice operations

Status: **Deferred beyond local coding suggestions.**

Validate coding/rule sources before consequential use. Then implement one auditable claim lifecycle: reviewed encounter evidence → prepared claim → explicit submission → status/remittance → reconciliation. Add eligibility, denial queues and payer-specific checks through adapters as justified. Keep accounting/banking and clinical truth as separate authority domains.

Exit gate: one reconcilable financial workflow with no invented billing evidence or implied payer success.

## Phase 6 — Team scale and specialty expansion

Status: **Basic collaboration exists; expansion gated by access model.**

Extend mutual task/message infrastructure into cross-coverage, shared queues and handoffs only after organization/patient-access controls are explicit. Add multi-practice administration, specialty layouts and enterprise identity integrations when concrete workflows require them.

Exit gate: tested ownership, access, handoff and conflict behavior across clinicians/organizations without weakening patient context or record integrity.

## Immediate implementation queue

1. **Establish repeatable verification.** (Completed: Playwright browser harness in `tests/browser/`, lockfile validated, automated `test:browser`, `typecheck`, `test`, `build` clean).
2. **Prove two-patient workspace continuity and complete the synthetic visit.** (Completed: `workspace-reliability.spec.ts` and `synthetic-visit.spec.ts` pass in commit `b917f19`).
3. **Finish binary document intake.** (Completed: protected byte upload, SHA-256 integrity hashing, exact-version reopening, patient isolation in commit `b917f19`).
4. **Complete Phase 2 authority inventory.** (Completed: route & HTTP method authority inventory across `workspace-state`, `practice-queues`, `messages/chart`, `context`, `documents/workflow`, `encounters`, and `patient-prescribing-workspace` in commit `3f29a78`).
5. **Develop source-grounded AI workflow alongside nucleus.** (Completed: target context isolation `RIGHT-04`, source grounding from SQLite, safe absence presentation, proposal review gate `CMD-05`, draft note injection, regression test `tests/clinical-ai-grounding.test.ts`).
6. **Prepare DrFirst integration from verified vendor requirements.** (Active Next: reuse existing prescribing state machines, fail closed until contracted sandbox credentials/network behavior can be tested).

These are implementation slices, not authorization to rewrite `PatientWorkspace.tsx`, replace existing coordinators, or create duplicate prescribing/workflow frameworks.

## Updating this roadmap

Inspect current `main` before choosing work. Update evidence and remaining gaps after meaningful implementation. Keep requirement definitions in [PRODUCT_VISION.md](PRODUCT_VISION.md), durable architectural decisions in [DECISIONS.md](DECISIONS.md), and domain-specific invariants in their existing documents. Do not advance a phase label from code presence alone; use the stated exit gates.
