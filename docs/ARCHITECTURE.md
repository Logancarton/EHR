# EHR Architecture

## Product thesis

This EHR treats the patient chart as a persistent workspace rather than a sequence of pages. Multiple patient workspaces can remain open simultaneously, similar to browser tabs/windows. AI is a contextual layer attached to the active patient and active clinical surface rather than a separate chatbot destination.

## Current phase: authoritative local clinical backend

The application now has a server-side clinical architecture backed by local SQLite for synthetic development data. The browser UI is no longer the source of truth for encounters or core clinical facts.

The current backend includes:

- patient, encounter, appointment, message, task, order, audit, and team repositories
- normalized medications, allergies, diagnoses/problems, observations/results, insurance policies, pharmacies, and documents
- medication reconciliation candidates plus deterministic discrepancy review
- structured medication prescription intent inside the existing order lifecycle
- vendor-neutral external prescription transactions with append-only normalized event history
- document version history and content hashes
- result acknowledgement
- signed-encounter addenda/amendments
- generic record version history and explicit provenance events
- immutable signed encounter snapshots and database triggers protecting signed records
- permission-aware clinical services and a shared ClinicalActionGateway for UI/API/future AI mutations
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

Next.js + React + TypeScript. This layer owns workspace state, tabs/windows, clinical surfaces, and contextual AI presentation. It should consume clinical records through APIs/services rather than own legal record truth.

### Domain and authoritative record layer

Core clinical facts are normalized independently from UI components. Patient-facing compatibility projections may still expose `meds`, `diagnoses`, `allergies`, and `vitals` to older UI code, but those projections are derived from normalized records after migration.

FHIR compatibility belongs at the interoperability boundary. The internal UI and workflow model should not be forced to mirror FHIR resource structure.

### Clinical fact lifecycle pattern

Problems and allergies establish the reusable lifecycle for mutable clinical facts:

`clinician UI -> request validation -> authenticated actor -> expected patient binding -> ClinicalActionGateway -> clinical record service/repository -> version/provenance stamp -> audit -> refreshed authoritative projection -> ContextAssembler`

Clinical facts are not destructively deleted from clinician workflows. State transitions such as resolved, inactive, reactivated, and entered-in-error update the authoritative normalized record while retaining prior snapshots and provenance. `ContextAssembler` consumes only currently active problems/allergies, so historical or erroneous facts remain reviewable without being represented to AI as active clinical truth.

AI may read these normalized facts and propose changes, but confirmation still has to enter through the same clinical action boundary. The omnibox/model layer does not receive repository or mutation authority.

### Medication truth, evidence, prescription intent, and external transaction state

Medication/prescribing state uses four intentionally separate authority classes:

1. **Medication clinical truth** — normalized medication records representing what the clinician believes the patient is taking.
2. **Medication evidence** — patient/vendor/import evidence represented as reconciliation candidates until explicitly reconciled.
3. **Prescription intent** — what the clinician intends to prescribe, represented inside the existing medication order lifecycle.
4. **External prescription transaction state** — normalized transport/network state for an authorized prescription, with append-only event history and external references where available.

The internal prescription signal flow is:

`authoritative medication state -> draft prescription intent -> deterministic validation/comparison -> staged Order Cart item -> explicit clinician review -> explicit authorization -> patient-bound transmit action -> prescription transaction -> vendor-neutral adapter -> normalized external events -> reconciliation evidence when clinically relevant`

Staging, authorization, submission, acknowledgement, acceptance, failure, cancellation status, or external dispense/history evidence do not automatically rewrite medication clinical truth. The Order Cart shows the current authoritative medication relationship, the proposed prescription, and an advisory chart implication. If the clinician wants the prescription to add or update the medication list, that is a separate explicit patient-bound gateway action with its own medication version/provenance and audit record. Ambiguous medication relationships never select an authoritative medication target automatically.

A successful adapter call means the EHR recorded the transaction as `submitted`; it does not infer external `acknowledged` or `accepted`. Even a later normalized `accepted` event is transport evidence, not proof that the patient started, filled, picked up, or is currently taking the medication.

`ContextAssembler` currently mirrors the first three classes: `activeMedications` is authoritative, `pendingMedicationCandidates` is evidence-only, and `pendingPrescriptionIntents` is proposal-only. Phase 4F intentionally does not add external transaction state to model context yet. When added, it must be a distinct permission-aware read-only signal with stable source transaction/event references; it must never be merged into `activeMedications`.

See [`PRESCRIPTION_TRANSACTIONS.md`](PRESCRIPTION_TRANSACTIONS.md) for the transaction lifecycle and DrFirst readiness boundary.

### Clinical action layer

Consequential writes enter through `ClinicalActionGateway`. Permission checks, validation, audit policy, persistence, version history, and provenance remain behind that boundary. Future AI tool calls should use the same gateway rather than writing directly to repositories or SQL.

Prescription intent does not create a second human mutation path. Stage, authorize, explicit medication-truth confirmation, and transmission all reuse the same gateway and server-derived actor/patient-binding controls.

External vendor events are a different kind of state transition: they describe external transport evidence rather than a clinician-authored clinical mutation. Phase 4F accepts only adapter-normalized events through the dedicated transaction service and exposes no public callback endpoint. A future webhook must authenticate/verify the vendor before calling that service. External events can update transaction state and create pending reconciliation evidence, but they cannot mutate medication truth or bypass clinician confirmation.

### Persistence layer

Current development persistence is SQLite using WAL mode and foreign keys. Production will require PostgreSQL or an equivalent production database with formal migrations, encryption, backup/PITR, disaster recovery, tenant isolation, secrets management, and deployment controls.

### Record integrity

Signed encounters are frozen into immutable snapshots with SHA-256 hashes. Database triggers prevent signed notes, signed working state, and signed snapshots from being rewritten or deleted. Corrections after signing use explicit addenda/amendments rather than rewriting history.

Documents maintain explicit versions and content hashes. Clinical record mutations generate version-history and provenance records describing actor, source, entity, activity, and source reference. Prescription transactions also receive generic record-version/provenance stamps, while individual transaction events remain append-only.

### Integration layer

External services such as e-prescribing/EPCS, labs, claims/clearinghouse, scheduling, document exchange, and communications remain behind adapters so the product is not coupled to a single vendor. Existing prescribing adapters are development placeholders until real contracts/certifications are connected; they fail closed rather than fabricating transmission, EPCS verification, cancellation, acknowledgements, or regulated-service behavior.

Commercial e-prescribing, pharmacy-network connectivity, EPCS, PDMP, formulary/benefit, prior authorization, eligibility, and network medication-history feeds are not part of the internal prescription-intent or medication-truth domains. Those capabilities map into vendor-neutral transactions/events/evidence rather than redefining the medication domain.

### AI layer

AI receives deliberately assembled, permission-aware patient context rather than unrestricted database access. Structured clinical data remains authoritative. AI-generated outputs are candidates/drafts with source provenance and human confirmation before consequential actions.

The context assembler reads medications, allergies, problems, vitals, laboratory observations, medication evidence, and bounded prescription proposals from server-side records rather than unrestricted runtime fixture objects. AI execution is explicitly blocked from order authorization, order transmission, medication reconciliation, prescription-driven medication-truth mutation, and external transaction mutation/ingestion.

## Production safety boundary

Real PHI remains out of scope until authentication, authorization, encryption, deployment isolation, audit review, backups/recovery, retention, BAAs, security risk analysis, and HIPAA-appropriate infrastructure are intentionally implemented and reviewed together.

## Immediate next milestone

Continue applying the same explicit lifecycle boundaries without broadening vendor scope prematurely:

- add cancellation/change/refill prescription-intent relationships and their transaction lifecycle
- expose a compact reusable transaction/status read surface that can appear beside prescriptions, chart context, pharmacy responses, audit history, and future AI answers
- add a permission-aware transaction context slice only after provenance/source references are preserved end-to-end
- formalize authenticated/verified callback infrastructure before exposing any vendor webhook route
- continue automated repository/API/authorization/integrity coverage as new clinical modules become interactive
- formalize database migrations rather than startup-only additive migrations
- move development SQLite toward production PostgreSQL architecture
- add production document/object-storage adapter
- connect real OAuth/SSO and stronger session/device controls
- add FHIR/US Core mapping at the integration boundary
- replace development lab/prescribing adapters with contracted/certified integrations only when the internal domain and production security infrastructure are ready
