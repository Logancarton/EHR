# EHR Architecture

## Product thesis

This EHR treats the patient chart as a persistent workspace rather than a sequence of pages. Multiple patient workspaces can remain open simultaneously, similar to browser tabs. AI is a contextual layer attached to the active patient and active clinical surface rather than a separate chatbot destination.

## Current phase: interaction prototype

The current application is intentionally frontend-only and uses fictional mock patients. There is no database, authentication, PHI storage, prescribing, billing, clinical decision support, or external API integration yet.

The purpose of this phase is to validate the workspace model before backend choices constrain the product.

## Core interaction model

1. Global patient search opens a patient workspace.
2. Open patients persist as reorderable tabs.
3. Each patient workspace contains clinical surfaces such as Overview, Encounter, Medications, Labs, Messages, and History.
4. The active patient and clinical surface define the context available to the AI panel.
5. Clinical tools should eventually plug into the workspace without forcing navigation into disconnected modules.

## Architectural boundaries

### Presentation layer

Next.js + React + TypeScript. This layer owns workspace state, patient tabs, clinical surfaces, and contextual AI presentation.

### Domain layer — next

Introduce explicit healthcare-domain models independent from UI components. Initial concepts should include Patient, Encounter, Medication, Problem/Diagnosis, Observation/Lab, Appointment, Message, Task, and Document.

FHIR compatibility should be considered at the domain/integration boundary, but the product UI should not be forced to mirror FHIR resource structure.

### Persistence layer — later

Do not connect real patient data until authentication, authorization, audit logging, encryption, backups, retention, and HIPAA-appropriate infrastructure are designed together.

### Integration layer — later

External services such as e-prescribing/EPCS, labs, claims/clearinghouse, scheduling, document exchange, and communications should be isolated behind adapters so the main product is not coupled to a single vendor.

### AI layer — later

AI should receive deliberately assembled, permission-aware patient context rather than unrestricted database access. AI-generated clinical output should retain provenance and remain reviewable before becoming part of the legal medical record.

## Immediate next milestone

Turn the shell into a stateful single-practitioner workflow prototype:

- Today/schedule dashboard
- patient creation/search
- encounter lifecycle and autosaved drafts
- structured medication list
- longitudinal timeline
- task/inbox model
- local development database using fictional data

Real PHI should remain out of scope until the security and compliance foundation exists.
