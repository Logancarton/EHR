# EHR Roadmap

Reviewed and updated: 2026-09-09 against `main` at `9d9d5ec`, after adding organization membership and patient-access authorization (D-033). Local validation on that change: `npm run typecheck` clean, `npm test` 79/79 passing, `npm run build` clean, and `npm run test:browser` 3/3 passing against a freshly seeded database. This is development evidence, not production-PHI readiness.

## Direction and current verdict

The next milestone remains a dependable psychiatric clinician workspace: find a patient, document, inspect related evidence, move between patients/windows, and return without lost work or ambiguous patient context. Production AI and external services should enter through those same workflows rather than becoming parallel products.

[PRODUCT_VISION.md](PRODUCT_VISION.md) is the canonical interaction target and requirement-ID source. This roadmap owns sequencing and exit gates. Historical Phase 3 and Phase 4A–4M commit labels are implementation slices, not proof that the broad phases below are complete.

**Current verdict: substantial development foundations exist. The API identity defects found in the September 9 review are remediated and organization/patient access isolation is now enforced and tested. Production infrastructure, production AI models/transcription, live DrFirst/EPCS, and complete external workflows remain open.**

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
| Browser workspace — partial | Reorder/detach controllers, floating-window chrome, local Back/Forward, side/corner snap logic, tray, clinician workspace snapshots, non-Encounter patient scroll persistence, explicit pointer ownership/cancellation, and stale-snap protection. Playwright harness selected and in use (D-034). Browser-verified: two-patient detach/gesture/dock/reload continuity, small-viewport reachability with keyboard access, all eight resize directions with opposite-edge anchoring, protected window controls, focus/z-order between two floating charts, title-bar double-click, edge snap preview/placement/release, canceled gestures, and a late clinical response never landing in the chart the clinician moved to. | Minimize/maximize/restore and docking-by-drag remain covered only by the original continuity spec; extend deliberate coverage there. Encounter nested scroll restoration still needs stable ownership before extension. |
| Personalization — partial | Density, layout customizer/presets, clinician preference/workspace persistence, and session-derived preference ownership. Every Today section shares one collapse/hide/reorder control set; collapse and hide persist; hidden sections and both rails keep a visible way back (D-035). Restoration reports completion only once the restored view is on screen (D-036). | Browser verification of launcher extremes, preset save/reload, keyboard access, readable identity, and pending-work indicators across densities. |
| Encounter workflow — partial | Draft hydration/autosave with unsaved/saving/saved/failed state, retry, serialized/coalesced writes, server revision protection, clinician/patient/encounter binding, safe hydration, reviewed-draft flush before signing, and immutable signed records. | Browser verification across patient switching, detach/dock, reload, close, failures and late responses; complete synthetic-visit acceptance flow. |
| Clinical record lifecycles — implemented foundations | Normalized medication/problem/allergy records, result lifecycle, provenance/version history, immutable signed encounters, charted communications, document review/filing, loaded-vs-unknown clinical absence presentation, and explicit-vs-omitted NKDA behavior. | Durable binary document upload/retrieval, protected exact-version reopening, byte-integrity verification, production object storage, import/reconciliation and related-evidence workflows. |
| Prescribing — implemented internal foundation; external use gated | Medication truth separated from prescription intent/vendor evidence; authorization, transaction ledger, CancelRx, renewal/change workflows, verified callback boundary, uncertainty recovery, operations queue, and patient prescribing surface. | Contracted DrFirst interface mapping/connectivity, vendor-tested callbacks and EPCS workflow, onboarding/certification, operational support, and regulated network validation. The development adapter must continue to fail closed. |
| Identity and persistence — implemented development foundation | Server sessions, authoritative roles, strict direct-read helper, patient-bound action gateway, permission-aware context, SQLite records, audit, clinician-owned preferences, migration ledger and secret-reference/readiness boundaries. Organization membership and patient-access scope are enforced independently of authentication and roles, with cross-organization, assigned-scope and revocation coverage. | Production user provisioning into organizations and organization administration; production session/device controls; production database path; encryption/secrets deployment; backups/restore; monitoring/incident response. |
| AI and voice — partial/prototype | Authenticated omnibox planning with validated proposals/restricted execution, context assembly, FTS search, deterministic extraction, simulated ambient/dictation UI. | Production model/transcription adapters, source-grounded drafting/retrieval, uncertainty and quality evaluations, latency/cost controls, approved data handling, and semantic retrieval only if evaluation justifies it. |
| Schedule, queues and collaboration — partial | Appointment/task/message repositories, practice queues, team messaging, mutual assignment agreements, charted messages, and global lab/document queues. | Browser completion/error validation, patient-facing authentication/delivery, reminders/assessment collection, calendar/booking integration, and cross-coverage permissions. |
| Clinical decision support and billing — prototype/deferred | Local interaction/protocol rules and encounter coding suggestions. | Governed clinical sources/versions and accuracy validation; evidence-grounded coding; eligibility, claims, remittances, denials and reconciliation. |

## Phase 0 — Workspace reliability and restoration

Status: **Partial; active priority.** Requirements: TAB-01–04, WIN-01–09, NAV-01–05, SAVE-01–08, VIS-05.

Implemented: floating movement/resizing has explicit gesture ownership, capture/cancellation cleanup, snap/dock precedence and stale-release protection. Encounter saves have an ordered recoverable coordinator. Durable patient/workspace restoration exists for the implemented slices.

Next:
1. ~~Resolve and record the browser-harness choice (D-031).~~ **Completed:** Playwright, recorded in D-034.
2. ~~Synchronize the committed dependency lockfile.~~ **Completed** in `bc24301`; CI still runs `npm install` rather than `npm ci`, so reproducibility is proven locally but not enforced in CI.
3. **Largely complete.** Two-patient detach/gesture/dock/reload continuity, smaller-viewport reachability with keyboard access, all eight resize directions, protected controls, snap preview/placement/release, title-bar double-click, focus/z-order, canceled gestures and deterministic late async responses all pass in `tests/browser/`. Minimize/maximize/restore and docking-by-drag remain covered only incidentally by the continuity spec.
4. Verify durable restoration and reachable geometry after viewport changes. Extend Encounter nested scroll restoration only after stable ownership is defined.

Exit gate: affected browser scenarios pass with two synthetic patients and unfinished/failed work, including cancellation and late responses. Node tests alone do not close Phase 0.

## Phase 1 — Dependable clinician workflow nucleus

Status: **Partial; core save and clinical-fact safety foundations implemented.** Requirements: TAB-03, WIN-09, PAT-01–06, RIGHT-04, NAV-05.

1. Verify one complete synthetic visit: Today → patient → encounter draft → related medication/lab/document → reviewed candidates → sign → follow-up queue → reopen. Every async result must retain its originating patient if another workspace becomes active.
2. Complete document intake using the existing document/version/workflow primitives: upload actual bytes → protected storage → review → file → reopen the selected exact version. Hash the stored bytes, not merely a storage-key string. Reject wrong-patient reads and show interruption/retry outcomes.
3. Validate queue → object → related object → action navigation for results, documents, communications and prescribing exceptions. Fix dead ends/feedback gaps without creating duplicate dashboards.

Exit gate: a clinician can complete and resume the synthetic visit with visible persistence outcomes and no lost work, wrong-patient mutation/read, fabricated clinical absence, or misleading external-service success.

## Phase 2 — Production data, identity and operations

Status: **API authority inventory and organization/patient-access isolation complete; production infrastructure controls remain incomplete.** Required before real PHI.

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
2. ~~Define organization membership and patient-access authorization independently from authentication/roles.~~ **Completed.** `organizations`, `organization_memberships` (`active`/`suspended`/`revoked` with an `organization` or `assigned` patient scope) and `patient_organizations` are enforced at both `clinicalRequest`/`authenticatedClinicalRequest` and `ClinicalActionGateway`, and narrow the roster, practice queues, cross-chart AI search, omnibox patient resolution and patient-attributed audit reads. Patient ownership is written inside the patient-insert transaction, so no creation path yields an accessible orphan. `tests/organization-access-boundary.test.ts` covers cross-organization reads/writes, assigned-scope narrowing, suspended/revoked membership, roster and queue isolation, owned patient creation, and revocation taking effect on a live session. See D-033. **Remaining:** production user provisioning into organizations, organization administration surfaces, and cross-organization coverage agreements (Phase 6).
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

Status: **Basic collaboration exists; the access model prerequisite is now satisfied (D-033), so expansion is unblocked but unstarted.**

Extend mutual task/message infrastructure into cross-coverage, shared queues and handoffs. Team surfaces (`/api/team/*`) currently exchange internal messages and tasks under the existing mutual-agreement model and must be expressed through the organization/patient-access boundary before crossing organizations. Add multi-practice administration, specialty layouts and enterprise identity integrations when concrete workflows require them.

Exit gate: tested ownership, access, handoff and conflict behavior across clinicians/organizations without weakening patient context or record integrity.

## Immediate implementation queue

1. **Establish repeatable verification.** (Completed: Playwright browser harness in `tests/browser/`, lockfile validated, automated `test:browser`, `typecheck`, `test`, `build` clean).
2. **Prove two-patient workspace continuity and complete the synthetic visit.** (Completed: `workspace-reliability.spec.ts` and `synthetic-visit.spec.ts` pass in commit `b917f19`).
3. **Finish binary document intake.** (Completed: protected byte upload, SHA-256 integrity hashing, exact-version reopening, patient isolation in commit `b917f19`).
4. **Complete Phase 2 authority inventory.** (Completed: route & HTTP method authority inventory across `workspace-state`, `practice-queues`, `messages/chart`, `context`, `documents/workflow`, `encounters`, and `patient-prescribing-workspace` in commit `3f29a78`).
5. **Develop source-grounded AI workflow alongside nucleus.** (Completed: target context isolation `RIGHT-04`, source grounding from SQLite, safe absence presentation, proposal review gate `CMD-05`, draft note injection, regression test `tests/clinical-ai-grounding.test.ts`).
6. **Enforce organization membership and patient-access scope.** (Completed: policy, enforcement points, cross-patient surface narrowing, and `tests/organization-access-boundary.test.ts` in the D-033 change).
7. **Prepare DrFirst integration from verified vendor requirements.** (Blocked on Logan: requires a contracted DrFirst product/interface, sandbox credentials and onboarding. The development adapter continues to fail closed; no further implementation should claim connectivity before vendor access exists).
8. **Production infrastructure for Phase 2.** (Active Next, and the largest remaining non-vendor-gated block: user provisioning into organizations, production database path and migration/deployment, encryption/secrets deployment, protected object storage, audit retention/access review, backup restoration, monitoring/incident response).

These are implementation slices, not authorization to rewrite `PatientWorkspace.tsx`, replace existing coordinators, or create duplicate prescribing/workflow frameworks.

## Updating this roadmap

Inspect current `main` before choosing work. Update evidence and remaining gaps after meaningful implementation. Keep requirement definitions in [PRODUCT_VISION.md](PRODUCT_VISION.md), durable architectural decisions in [DECISIONS.md](DECISIONS.md), and domain-specific invariants in their existing documents. Do not advance a phase label from code presence alone; use the stated exit gates.
