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
