# EHR Architecture

## Product thesis

This EHR treats the patient chart as a persistent workspace rather than a sequence of pages. Multiple patient workspaces can remain open simultaneously, similar to browser tabs/windows. AI is a contextual layer attached to the active patient and active clinical surface rather than a separate chatbot destination.

## Current phase: authoritative local clinical backend

The application has a server-side clinical architecture backed by local SQLite for synthetic development data. The browser UI is not the source of truth for encounters or core clinical facts.

The current backend includes:

- patient, encounter, appointment, message, task, order, audit, and team repositories
- normalized medications, allergies, diagnoses/problems, observations/results, insurance policies, pharmacies, and documents
- medication reconciliation candidates plus deterministic discrepancy review
- structured medication prescription intent inside the existing order lifecycle
- vendor-neutral external prescription transactions with append-only normalized event history
- durable refill/renewal workflow requests linked to prior prescriptions and newly staged renewal intents
- durable pharmacy/vendor prescription change requests linked to prior prescriptions and newly staged replacement intents
- a verified vendor-neutral public prescribing callback boundary with durable replay/binding protection
- document version history and content hashes
- result acknowledgement
- signed-encounter addenda/amendments
- generic record version history and explicit provenance events
- immutable signed encounter snapshots and database triggers protecting signed records
- permission-aware clinical services and a shared `ClinicalActionGateway` for human/UI/API clinical mutations
- permission-aware, token-budgeted AI context assembly sourced from authoritative records
- additive migration/backfill from legacy JSON and synthetic fixture data without deleting existing local development charts

SQLite remains a development persistence engine. No real PHI is permitted yet.

## Core interaction model

1. Global patient search opens a patient workspace.
2. Open patients persist as reorderable tabs and detachable panes.
3. Each patient workspace contains coordinated clinical surfaces such as Overview, Encounter, Medications, Labs, Messages, and History.
4. The active patient and clinical surface define the context available to the AI layer.
5. Clinical tools plug into the workspace without forcing navigation into disconnected modules.

## Architectural boundaries

### Presentation layer

Next.js + React + TypeScript. This layer owns workspace state, tabs/windows, clinical surfaces, and contextual AI presentation. It consumes clinical records through APIs/services rather than owning legal record truth.

### Domain and authoritative record layer

Core clinical facts are normalized independently from UI components. Patient-facing compatibility projections may still expose `meds`, `diagnoses`, `allergies`, and `vitals` to older UI code, but those projections are derived from normalized records after migration.

FHIR compatibility belongs at the interoperability boundary. The internal UI and workflow model should not be forced to mirror FHIR resource structure.

### Clinical fact lifecycle pattern

Problems and allergies establish the reusable lifecycle for mutable clinical facts:

`clinician UI -> request validation -> authenticated actor -> expected patient binding -> ClinicalActionGateway -> clinical record service/repository -> version/provenance stamp -> audit -> refreshed authoritative projection -> ContextAssembler`

Clinical facts are not destructively deleted from clinician workflows. State transitions such as resolved, inactive, reactivated, and entered-in-error update the authoritative normalized record while retaining prior snapshots and provenance. `ContextAssembler` consumes only currently active problems/allergies, so historical or erroneous facts remain reviewable without being represented to AI as active clinical truth.

AI may read normalized facts and propose changes, but confirmation still has to enter through the same clinical action boundary. The omnibox/model layer does not receive repository or mutation authority.

### Medication truth, evidence, prescription intent, workflow requests, and external transaction state

Medication/prescribing state uses five intentionally separate authority/workflow classes:

1. **Medication clinical truth** — normalized medication records representing what the clinician believes the patient is taking.
2. **Medication evidence** — patient/vendor/import evidence represented as reconciliation candidates until explicitly reconciled.
3. **Prescription intent** — what the clinician intends to prescribe, represented inside the existing medication order lifecycle.
4. **Prescription workflow requests** — refill/renewal and pharmacy/vendor change requests asking for clinician review; these may seed a new staged prescription intent but are not prescriptions or transport transactions.
5. **External prescription transaction state** — normalized transport/network state for an authorized prescription, with append-only event history and external references where available.

The verified callback boundary is not a sixth clinical authority class. It is a security/integration boundary that allows authenticated external evidence to enter the already-existing workflow/transport classes.

The outbound prescription signal flow is:

`authoritative medication state -> draft prescription intent -> deterministic validation/comparison -> staged Order Cart item -> explicit clinician review -> explicit authorization -> patient-bound transmit action -> prescription transaction -> vendor-neutral adapter -> external network`

The inbound verified signal flow is:

`raw vendor callback -> vendor-specific verification adapter -> bounded VerifiedPrescriptionCallback -> durable callback replay/binding receipt -> EHR correlation resolution -> existing transaction/refill/change-request service -> audit/provenance`

Refill/renewal remains:

`prior transmitted prescription -> refill/renewal request -> explicit patient-bound review -> NEW staged prescription intent -> ordinary authorization -> ordinary outbound transaction path`

A refill request does not reopen the prior order, modify the prior transaction, or become medication-reconciliation evidence merely because somebody requested more medication. Approval creates a new staged order with durable lineage back to the refill request and prior order/transaction. The prior prescription remains historical evidence.

Pharmacy/vendor change requests remain:

`prior transmitted prescription -> normalized change request -> explicit patient-bound accept/decline -> if accepted, NEW staged replacement intent -> ordinary authorization -> ordinary new_rx transaction`

A change request does not rewrite the source order or source transaction, authorize or transmit a replacement, cancel the prior prescription, create medication-reconciliation evidence, or change medication clinical truth. Decline resolves only the request. Acceptance creates exactly one new staged medication order carrying change-request/source-order/source-transaction provenance and then reuses the ordinary prescription review lifecycle.

`prescription_transactions.related_transaction_id` remains the same-order transport relationship used by CancelRx. Refill lineage remains in `prescription_refill_requests`; change-request lineage remains in `prescription_change_requests`. Phase 4J does not introduce a generic cross-order/cross-transaction relationship graph.

Staging, authorization, submission, acknowledgement, acceptance, failure, cancellation status, refill/change-request status, renewal/replacement staging, verified callback receipt state, or external dispense/history evidence do not automatically rewrite medication clinical truth. If the clinician wants a prescription/evidence item to alter the medication list, that is a separate explicit patient-bound action with its own version/provenance and audit record.

A successful outbound adapter call means the EHR recorded the transaction as `submitted`; it does not infer external `acknowledged` or `accepted`. Even a later verified normalized `accepted` event is transport evidence, not proof that the patient started, filled, picked up, or is currently taking the medication.

`ContextAssembler` currently exposes `activeMedications` as authoritative, `pendingMedicationCandidates` as evidence-only, and `pendingPrescriptionIntents` as proposal-only. External transaction/refill/change-request/callback state is intentionally not added to model context yet. When added, it must be a distinct permission-aware read-only signal and never be merged into `activeMedications`.

See [`PRESCRIPTION_TRANSACTIONS.md`](PRESCRIPTION_TRANSACTIONS.md) and [`PRESCRIPTION_CALLBACKS.md`](PRESCRIPTION_CALLBACKS.md).

### Care-completion projection layer

Care completion is a **projection over authoritative workflows, not a clinical authority
class.** It answers "is every loop closed for the patients this provider is carrying" by
re-reading records that already own the facts, and it holds no completion state of its own.

`authoritative patient state -> care-completion resolver -> provider-specific workboard`

The resolver reads signed encounters, linked appointments, orders and prescription
transactions, result acknowledgements, observations, provider messages, AI-extracted note
references, billing charges, care-network records and tasks. Every completion it reports
carries the evidence row it was read from; a completion with no evidence is not rendered.
Nothing on this surface can sign a note, transmit a prescription, create an order or an
appointment, acknowledge a result, or send a communication. Items link into the workflows
that own those actions.

The subsystem owns exactly two durable records, and neither is clinical truth:

1. **Provider patient pins** — a personal view preference. A pin grants no chart access,
   adds nobody to the care team, assigns no responsibility, and changes no patient
   ownership. Patient access is re-resolved on every read and every write, and a pin that
   outlives access yields a count with no identifying detail.
2. **Care-completion deferrals** — a recorded reason that unresolved work is waiting. The
   table has no completion status by construction. Deferred is counted separately from
   complete, and an authoritative completion supersedes an obsolete deferral.

Manual tasks are the single exception where the board may record completion, and they
write through the existing task action rather than through a parallel path, because such
work has no other authoritative record.

Where a rule's source does not exist in this build, the boundary is stated rather than
simulated: PCP notification is unavailable because no release-of-information authorization
record and no document-exchange transport exist, and patient-balance reminders produce no
item because no authoritative balance exists. Neither invents the information it lacks.

AI may propose a deferral through the ordinary omnibox planning boundary and may execute
nothing else here. The proposal carries a server-resolved work-item identity, not a phrase
from the transcript, and requires explicit human confirmation; ambiguous patient or work-item
identity refuses rather than guessing. See [`DECISIONS.md`](DECISIONS.md) D-069.

### Intake — a staff-workflow queue and readiness projection

Intake is the operational front door between an initial inquiry and a first
completed visit. Like care completion, it is **a projection plus a small amount of
its own workflow state, not a second patient-truth system.**

`initial inquiry -> prospective administrative identity (no chart, no visit
required yet) -> minimum identity confirmation / duplicate resolution ->
deliberate promotion/link to a durable patient chart -> full intake continues`

**Starting intake does not require a visit either (D-078).** `intake_episodes.appointment_id`
is optional; an episode reached via the queue's own "New Intake" button, or via
`intakeService.startStandalone`, can exist with no appointment at all —
`IntakeStage.awaiting_first_visit` — and progress identity, coverage, document,
and consent readiness before one is scheduled. `intakeService.scheduleVisit`
attaches the first tentative hold to that **same** episode row
(`IntakeRepository.linkEpisodeToAppointment`), not a new one, so nothing
recorded beforehand needs to be re-entered or re-attached. Two partial unique
indexes (`WHERE appointment_id IS NULL`) keep `getOrCreateStandalone` a true
get-or-create per subject.

`authoritative evidence (administrative record, appointments, documents, consents,
forms, eligibility, payment, payer-plan configuration) -> computeIntakeChecklist()
-> readiness steps -> intakeStage() -> queue row`

**The pre-chart identity boundary (D-076).** A tentative caller no longer creates a
clinical chart. `prospective_persons` is a durable, organization-scoped,
administrative-only record (name, DOB, phone, email — never a diagnosis, medication,
lab, or note) that a tentative appointment can point to before any `patients` row
exists. `appointments.patient_id` has no database foreign key — it already tolerated
the `event-...` non-patient sentinel — so a prospect's id (`prospect-...`) reuses
that same tolerance rather than requiring an appointments schema change.
`isProspectivePersonId()` is the one predicate every layer (workflow-service,
the clinical-action gateway, the HTTP patient-binding helper, the appointments
route's visibility filter) branches on to resolve a prospect through
`ProspectivePersonRepository`/`assertProspectivePersonAccess` instead of the
patient-chart path. Promotion (`prospectivePersonService.promote`) is the only way
a chart appears: `mode: "create"` reuses the ordinary `PatientRepository.create`
authority; `mode: "link"` attaches to a patient staff explicitly selected after
`findPossibleDuplicates()` surfaced it — matching is a suggestion a human acts on,
never an automatic merge. Promotion relinks the appointment
(`AppointmentRepository.relinkSubject`) and every intake episode
(`IntakeRepository.linkEpisodeToPatient`) to the real chart, and **keeps** the
prospect linkage rather than clearing it, so pre-promotion evidence and history stay
attached and readable. An episode, note, or evidence row therefore carries
`patientId?` **and** `prospectivePersonId?` — exactly one is set before promotion,
both after — never one field overloaded with two meanings.

The projection is recomputed on every read. Nothing about a step's state
(`recorded` / `needed` / `review` / `not_available`) is stored independently of the
record it describes, so correcting the underlying evidence — reissuing an ID,
changing a coverage policy, waiving a payment requirement — immediately changes
readiness without a separate reconciliation step. A stale eligibility check, one
that belonged to a coverage policy the patient no longer has, or an identity review
that named a now-superseded document is treated as absent, not as evidence.

**Distinct facts stay distinct steps.** Thirteen checklist steps, not eleven bundled
ones: `insurance_details` (a coverage policy on file) is separate from
`insurance_card` (a card image received/reviewed), which is separate from
`plan_acceptance` (the practice's own participation decision), which is separate
from `eligibility` (a payer-specific verification). `government_id` requires an
explicit `identity_document_reviews` row naming the *current* (non-superseded)
document — generic document `workflow_status = 'reviewed'` records that the image
was looked at, never that the identity claim was confirmed; a conflict stays
`review` until a human resolves it. `matchPlanAcceptance()` returns `not_accepted`
only for an affirmative, currently-active `out_of_network` participation record
naming that exact payer — a differently-configured payer, or no configuration at
all, is `needs_review`, never a guessed accept or reject. `eligibility_checks`
carries a structured, optional-everywhere `BenefitEvidence` (copay, coinsurance,
deductible remaining, authorization/referral indicators, …) so a real 270/271
adapter has somewhere correct to put its data later; `estimatePatientResponsibility()`
is a pure projection over that evidence, always labeled an estimate, never
persisted as a payer-confirmed fact.

This feature owns three durable staff-workflow record shapes, and none is clinical
truth: **`intake_episodes`** (one row per subject carrying someone toward a
first visit, `UNIQUE(appointment_id)` when one exists — the column is optional
since D-078, so an episode may carry no appointment at all yet — holding staff
assignment, follow-up timing,
the guardian-situation flag, staff-review sign-off, and disposition — the same
category as a care-completion pin or deferral), **`intake_notes`** (append-style
note/outreach/disposition/override log), and **`identity_document_reviews`** (the
explicit human-confirmation event described above). Six evidence tables —
`consent_signatures` (immutable, staff-attested — no capture pad, and it says so),
`form_submissions`, `eligibility_checks`, `payment_method_references` (a processor
reference or an explicit reasoned waiver, never a PAN/CVV), plus the two above —
all carry nullable `patient_id` *and* `prospective_person_id` columns (SQLite
cannot drop a `NOT NULL` constraint in place, so the D-076 migration recreates each
table with the relaxed shape via `relaxPatientIdToOptional`, copying existing rows
by id — already-valid foreign keys stay valid, and it is a no-op on a database
already migrated). Repository reads match `patient_id = ? OR prospective_person_id
= ?` across whichever ids an episode carries, so pre-promotion evidence stays
readable afterward without being duplicated at promotion time. `payer_plan_participations`
remains practice configuration, not patient data.

**Prospect-stage documents and coverage (D-077).** `documents` and
`insurance_policies` carry the same nullable `patient_id`/`prospective_person_id`
pair as the six D-076 evidence tables (migration
`2026-09-18-001-document-insurance-prospective-identity`), so a prospect can
complete government-ID capture (`documents.document_type` values `government_id`,
`government_id_front`, `government_id_back`), insurance-card capture
(`insurance_card_primary`, `insurance_card_secondary`), and coverage/self-pay
entry before promotion — every Intake evidence class now progresses pre-chart,
closing the one gap D-076 deliberately left open. `ClinicalRecordRepository`
exposes subject-aware siblings (`documentsBySubject`/`createDocumentForSubject`,
`insuranceBySubject`/`addInsuranceForSubject`) rather than changing the existing
patient-only functions the chart's Documents and Coverage surfaces already call —
those surfaces are unmodified and unaware anything changed. `intakeService.uploadDocument`/
`transitionDocument`/`addCoverage` are the prospect-safe (and patient-safe)
mutation path, gated by `edit_patient` like every other Intake evidence write,
deliberately separate from the `ClinicalActionGateway`'s `create_document`/
`add_insurance` actions rather than widening `patient-action-binding.ts`'s
patient-only binding logic.

Promotion relinks these the same way it relinks an episode:
`ClinicalRecordRepository.linkDocumentsToPatient`/`linkInsuranceToPatient` set
`patient_id` on the prospect's own rows (`WHERE prospective_person_id = ? AND
patient_id IS NULL`, making the relink idempotent) while keeping
`prospective_person_id` for provenance — the same document/version/policy row,
never copied, immediately visible on the chart's ordinary Documents/Coverage
surfaces because those surfaces' `WHERE patient_id = ?` reads now match. Linking
to an *existing* chart adds the prospect's coverage as an additional row rather
than overwriting the chart's own — a genuine conflict (two primary policies,
say) is left visible for staff to resolve, never silently merged.

Because SQLite rewrites a referencing table's `FOREIGN KEY` clause to follow a
`RENAME TO` of the table it targets, relaxing `documents.patient_id` required
recreating `document_versions`, `document_workflow_events`, and
`identity_document_reviews` together in one coordinated sequence
(`relaxDocumentsCluster()`) — repointing every dependent at the new `documents`
table before the legacy one is dropped, so the drop's implicit row-delete never
trips a `RESTRICT` or silently cascades away real `identity_document_reviews`
rows on a database that already has them from a prior D-076 deployment.

**The confirm boundary (D-076).** Reaching every blocking step never itself confirms
an appointment — a human still clicks Confirm. When blocking steps remain,
`intakeService.confirmWithOverride` is the only path through: it re-derives the
blocker list server-side (never trusts a client-supplied list), requires a non-empty
reason, records an `intake_notes` row (`kind: "override"`) and a dedicated
`intake_confirmed_with_override` audit event carrying the actor, reason, and
blocker ids, and only then calls the same `update_appointment_status` transition
the ready path uses. The override marks no requirement complete; a subsequent
`getDetail` shows the same outstanding steps.

Mutations that are Intake's own evidence classes (consent signature, form
submission, eligibility attestation, payment readiness, episode workflow state,
identity document review) go through a dedicated `intakeService`/`IntakeRepository`
pair behind `/api/intake` and `prospectivePersonService`/`/api/prospective-persons`
for the pre-chart stage, following the same shape `care-completion-service.ts`
established: permission and access checks enforced inline (`assertPatientAccess`
for a chart, `assertProspectivePersonAccess` — organization membership only, no
per-patient assignment scope — for a prospect), an audit event after every write,
no `ClinicalActionGateway` action added for them.

See D-075, D-076, D-077, and D-078 for the full boundary and the explicitly deferred
slices (patient-facing secure-link access, OCR/extraction review, a real
eligibility/payment vendor adapter, practice-configurable requirement rules,
reminder automation, and real binary/object document storage).

### Human clinical action layer

Consequential human clinical writes enter through `ClinicalActionGateway`. Permission checks, patient binding, validation, audit policy, persistence, version history, and provenance remain behind that boundary. AI tool calls that propose human clinical actions must use the same controlled gateway rather than write directly to repositories or SQL.

Prescription intent does not create a second human mutation path. Stage, authorize, explicit medication-truth confirmation, transmission, cancellation, renewal staging, and clinician change-request response continue to reuse the gateway and server-derived actor/patient-binding controls.

For refill/renewal, patient identity is resolved from the durable prior transaction/refill row; client-supplied patient identity is not trusted. `renew_prescription` creates only a staged order and does not authorize or transmit it.

For pharmacy change requests, patient identity is resolved from the durable change-request row. `respond_to_prescription_change_request` fails closed without matching active-patient context. Acceptance creates only a staged replacement order; decline creates no order. Neither branch changes medication truth or transport state.

### External integration authority layer

External vendor callbacks are intentionally separate from human clinical mutation authority.

The public prescribing callback route does not use ordinary EHR user-session authentication as vendor authentication and does not call `ClinicalActionGateway` pretending the vendor is a clinician. A bounded route identifier selects a configured verification adapter; that adapter must authenticate the raw transport and produce a verified vendor-neutral envelope before core processing begins.

The EHR-owned prescription transaction `correlationId` is authoritative for routing. Vendor patient/order/transaction identifiers are optional consistency assertions only. If they disagree with the transaction reached by correlation ID, processing fails closed. Adapter identity must also match the correlated transaction. A callback cannot choose a patient using untrusted request identity.

Phase 4J permits only three verified callback categories: prescription transaction event, refill request, and pharmacy change/replacement request. These route into existing services. Transaction callbacks may update normalized external transport state through append-only event ingestion and may create reconciliation evidence when clinically meaningful. Refill/change callbacks create only workflow requests. No callback directly mutates medication truth, authorizes/transmits/cancels a prescription, or performs clinician decisions.

Current development prescribing adapters fail closed for inbound callback verification. They do not fabricate DrFirst/Surescripts/DoseSpot authenticity, EPCS, network, or regulated-service success.

### Persistence layer

Current development persistence is SQLite using WAL mode and foreign keys. Schema evolution is additive/idempotent at startup for existing development databases.

Prescribing persistence includes:

- `prescription_transactions` and append-only `prescription_transaction_events`
- `prescription_refill_requests` with restrictive lineage to patient/prior order/prior transaction/optional renewal order
- `prescription_change_requests` with restrictive lineage to patient/source order/source transaction/optional replacement order and stable adapter/external-request identity
- `prescription_callback_receipts` with unique `(adapter_id, external_message_id)`, normalized callback fingerprint, resolved patient/order/transaction binding, processing state, and optional resulting event/refill/change IDs

Callback receipts are replay/security records, not clinical medication or prescription truth. They store no raw HTTP body, headers, signatures, credentials, cookies, tokens, PINs, OTPs, or arbitrary transport payloads.

Production will require PostgreSQL or equivalent production persistence with formal migrations, encryption, backup/PITR, disaster recovery, tenant isolation, secrets management, and deployment controls.

### Record integrity

Signed encounters are frozen into immutable snapshots with SHA-256 hashes. Database triggers prevent signed notes, signed working state, and signed snapshots from being rewritten or deleted. Corrections after signing use explicit addenda/amendments.

Documents maintain explicit versions and content hashes. Clinical record mutations generate version-history/provenance records describing actor, source, entity, activity, and source reference. Prescription transactions receive version/provenance stamps while individual transaction events remain append-only. Refill/change requests retain their own version/provenance histories. Verified callback receipts receive bounded integration provenance and audit records so external message identity and resulting EHR entities remain attributable without persisting raw transport content.

### Integration layer

External services such as e-prescribing/EPCS, labs, claims/clearinghouse, scheduling, document exchange, and communications remain behind replaceable adapters so the product is not coupled to one vendor.

For prescribing inbound traffic, the adapter boundary now has two responsibilities that remain vendor-specific: authenticating the raw callback and translating it into the bounded vendor-neutral callback envelope. Core EHR logic owns correlation, durable replay/binding protection, normalized routing, audit/provenance, and clinical-authority separation.

Commercial e-prescribing, pharmacy-network connectivity, production callback verification algorithms, EPCS, PDMP, formulary/benefit, prior authorization, eligibility, medication-history feeds, and real pharmacy refill/change-message response transport remain vendor/infrastructure responsibilities. Real DrFirst connectivity still requires contracted onboarding, credentials, testing/certification, production security infrastructure, and applicable network enablement.

### AI layer

AI receives deliberately assembled, permission-aware patient context rather than unrestricted database access. Structured clinical data remains authoritative. AI-generated outputs are candidates/drafts with human confirmation before consequential actions.

AI execution is explicitly blocked from order authorization/transmission, medication reconciliation, prescription-driven medication-truth mutation, external transaction mutation/ingestion, cancellation execution, refill renewal execution, pharmacy change-request accept/decline, and vendor callback ingestion/receipt mutation.

Phase 4J does not expose callback data to `ContextAssembler`. AI may later summarize permission-scoped workflow state or draft a proposed renewal/replacement, but it cannot authenticate or ingest vendor callbacks, use the callback boundary as an execution path, make EPCS/legal controlled-substance decisions, or turn external evidence into clinical truth.

## Production safety boundary

Real PHI remains out of scope until authentication, authorization, encryption, deployment isolation, audit review, backups/recovery, retention, BAAs, security risk analysis, production secrets handling, and HIPAA-appropriate infrastructure are intentionally implemented and reviewed together.

## Immediate next milestone

Continue applying explicit lifecycle and authority boundaries without broadening vendor scope prematurely:

- keep the Phase 4J callback boundary vendor-neutral and fail closed until a real contracted adapter supplies production authenticity verification
- next add production-integration operational foundations only when needed: tenant/configured adapter identity, secrets/KMS handling, durable delivery/reconciliation semantics, observability, and formal migrations
- connect a real DrFirst or other prescribing adapter only after contract/onboarding details are known; vendor-specific verification and schemas stay inside that adapter
- keep transaction/refill/change-request status out of AI context until a distinct permission-aware, provenance-backed read slice is deliberately designed
- reuse compact transaction/refill/change-request status surfaces beside prescriptions, medications, timeline, inbox/tasks, and audit history rather than building a large callback UI
- reconsider a generic cross-order relationship primitive only if another real workflow proves shared semantics that improve the existing lifecycles
- continue automated repository/API/authorization/integrity coverage as clinical modules become interactive
- formalize database migrations rather than startup-only additive migrations
- move development SQLite toward production PostgreSQL architecture
- add production document/object-storage adapter
- connect real OAuth/SSO and stronger session/device controls
- add FHIR/US Core mapping at the integration boundary
