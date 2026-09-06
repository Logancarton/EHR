# EHR Architecture

## Product thesis

This EHR treats the patient chart as a persistent workspace rather than a sequence of pages. Multiple patient workspaces can remain open simultaneously, similar to browser tabs/windows. AI is a contextual layer attached to the active patient and active clinical surface rather than a separate chatbot destination.

## Current phase: authoritative local clinical backend

The application now has a server-side clinical architecture backed by local SQLite for synthetic development data. The browser UI is no longer the source of truth for encounters or core clinical facts.

The current backend includes:

- patient, encounter, appointment, message, task, order, audit, and team repositories
- normalized medications, allergies, diagnoses/problems, observations/results, insurance policies, pharmacies, and documents
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

### Clinical action layer

Consequential writes enter through `ClinicalActionGateway`. Permission checks, validation, audit policy, persistence, version history, and provenance remain behind that boundary. Future AI tool calls should use the same gateway rather than writing directly to repositories or SQL.

### Persistence layer

Current development persistence is SQLite using WAL mode and foreign keys. Production will require PostgreSQL or an equivalent production database with formal migrations, encryption, backup/PITR, disaster recovery, tenant isolation, secrets management, and deployment controls.

### Record integrity

Signed encounters are frozen into immutable snapshots with SHA-256 hashes. Database triggers prevent signed notes, signed working state, and signed snapshots from being rewritten or deleted. Corrections after signing use explicit addenda/amendments rather than rewriting history.

Documents maintain explicit versions and content hashes. Clinical record mutations generate version-history and provenance records describing actor, source, entity, activity, and source reference.

### Integration layer

External services such as e-prescribing/EPCS, labs, claims/clearinghouse, scheduling, document exchange, and communications remain behind adapters so the product is not coupled to a single vendor. Existing vendor adapters are development mocks until real contracts/certifications are connected.

### AI layer

AI receives deliberately assembled, permission-aware patient context rather than unrestricted database access. Structured clinical data remains authoritative. AI-generated outputs are candidates/drafts with source provenance and human confirmation before consequential actions.

The context assembler now reads medications, allergies, problems, vitals, and laboratory observations from authoritative normalized records instead of runtime fixture objects.

## Production safety boundary

Real PHI remains out of scope until authentication, authorization, encryption, deployment isolation, audit review, backups/recovery, retention, BAAs, security risk analysis, and HIPAA-appropriate infrastructure are intentionally implemented and reviewed together.

## Immediate next milestone

Harden the normalized backend before adding more surface area:

- complete update/discontinue/resolve workflows for normalized clinical facts
- add automated repository/API/authorization/integrity tests
- formalize database migrations rather than startup-only additive migrations
- move development SQLite toward production PostgreSQL architecture
- add production document/object-storage adapter
- connect real OAuth/SSO and stronger session/device controls
- add FHIR/US Core mapping at the integration boundary
- replace mock lab/prescribing adapters with certified/contracted integrations when appropriate
