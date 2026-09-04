# Product Vision

## North star

Build an EHR that behaves like a clinician's active workspace rather than a filing cabinet of disconnected pages.

The system should help the clinician hold the patient's story, current state, unanswered questions, pending work, and next actions together in one coherent environment.

## What makes this product different

Traditional EHRs often organize work around modules: chart, medications, labs, messages, billing, scheduling, documents, and reports. The clinician must repeatedly navigate between them and mentally reconstruct the patient state.

This EHR should organize around the clinician's actual cognitive unit of work: the patient and the current clinical task.

The workspace should preserve context across clinical surfaces and allow multiple patient workspaces to remain open simultaneously, similar to a modern browser.

## Core interaction model

A patient workspace contains coordinated surfaces such as:

- Overview
- Encounter
- Medications
- Labs
- Messages
- History/timeline
- Tasks
- Documents
- Future billing/prescribing/integration tools

These are not separate destinations that lose context. They are views and tools operating on one patient state.

## AI-infused means system-level AI

AI should not be a chatbot bolted onto the side of a normal EHR.

AI should be able to assist at the point where work occurs, including eventually:

- preparing pre-visit context
- summarizing longitudinal change
- identifying unresolved items from prior visits
- organizing medication history
- comparing symptoms, vitals, labs, and treatment changes over time
- drafting notes from clinician-approved source material
- turning narrative into structured candidate data for review
- surfacing possible contradictions or missing follow-up
- assisting inbox/message triage
- preparing order or prescription workflows without executing them autonomously
- supporting coding/billing evidence review without inventing documentation
- retrieving relevant record context on demand
- helping the clinician understand why a recommendation or alert appeared

The human clinician remains the authority for clinical decisions and committed record actions.

## Design goals

### Reduce context reconstruction

When the clinician opens a patient, the system should quickly answer:

- Why is this patient here?
- What changed since the last encounter?
- What is currently being treated?
- What is unresolved?
- What should I pay attention to today?

### Make time visible

Longitudinal change should be a first-class feature. Medication changes, symptoms, labs, diagnoses, messages, and major events should be understandable as a timeline rather than isolated documents.

### Make state explicit

The UI should clearly distinguish:

- source record facts
- clinician-authored drafts
- signed/committed record data
- pending actions
- external results
- AI-generated suggestions or summaries

### Keep the product fast

The clinician should be able to move between patients and tasks without waiting for whole-page navigation or losing active work.

### Start focused, design for scale

The first real user is a single psychiatric clinician. That is an advantage: build an excellent end-to-end workflow for one clinician first.

Architecture should still avoid assumptions that prevent future multi-provider practices, additional specialties, teams, or organizations.

## What we should not optimize for early

Do not prioritize feature-count parity with established EHRs.

Do not build every integration before the core workflow is strong.

Do not copy legacy screens simply because clinicians recognize them.

Do not let FHIR, a clearinghouse, an e-prescribing vendor, or an AI provider dictate the internal product model.

Do not use AI to hide weak underlying data architecture.

## Success test

The product is succeeding when a clinician can understand and act on a patient's current state with less searching, less repetitive documentation, fewer context switches, and a clearer longitudinal picture than in a conventional EHR.
