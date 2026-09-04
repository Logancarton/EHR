# EHR Roadmap

This roadmap is intentionally ordered around usable clinician workflows rather than feature-count parity with existing EHRs.

## Phase 0 — Foundation

Status: active

Goals:

- workspace-first UI shell
- patient tabs and contextual surfaces
- project constitution and durable architecture docs
- CI/type-check/build validation
- synthetic data only

Exit criteria:

- repository rules are clear
- application builds cleanly
- major architectural boundaries are documented
- future agents can understand the product without relying on chat history

## Phase 1 — Clinician workflow nucleus

Build the minimum coherent EHR workflow for one psychiatric clinician.

Sequence:

1. Today/schedule dashboard
2. patient creation and patient search
3. patient domain model
4. encounter creation/open/close lifecycle
5. autosaved encounter drafts
6. longitudinal patient timeline
7. medication workspace
8. tasks/inbox

Use a development database with fictional patients only.

Exit criteria:

A clinician can start the day, open a patient, conduct/document an encounter, see longitudinal context, manage a draft medication list, and return to unfinished work without losing state.

## Phase 2 — Secure data foundation

Goals:

- production-grade persistence architecture
- authentication
- role/permission model
- audit/event history
- encryption and secrets handling
- backup/recovery design
- retention/deletion policy
- tenant/organization model appropriate for future multi-provider use

No real PHI should be introduced until this phase's safety requirements are intentionally satisfied.

## Phase 3 — Native AI layer

Build AI on top of authoritative clinical state rather than using AI as the database.

Initial capabilities may include:

- pre-visit synthesis
- longitudinal change summary
- unresolved-item detection
- context-aware record retrieval
- note drafting from approved sources
- structured candidate extraction
- medication-history synthesis
- inbox/message assistance

Requirements:

- provenance
- uncertainty representation
- permission-aware context assembly
- structured output validation
- clinician confirmation for committed/consequential actions
- model-provider abstraction
- evaluation harness for important workflows

## Phase 4 — Core integrations

Add integrations behind adapters in order of clinician value.

Likely sequence:

1. scheduling/calendar interfaces as needed
2. e-prescribing
3. EPCS
4. labs/results
5. communications
6. documents/exchange
7. claims/clearinghouse/billing
8. payments/eligibility as product requirements mature

Do not let any vendor become the internal domain model.

## Phase 5 — Revenue-cycle and operational intelligence

Potential capabilities:

- coding support grounded in encounter evidence
- claim preparation
- denial-risk checks
- claim lifecycle tracking
- insurance/eligibility workflow
- operational dashboards
- practice-level task automation

Consequential financial actions still require explicit authorized-user review where appropriate.

## Phase 6 — Multi-provider productization

Goals:

- organizations/tenants
- provider/team permissions
- shared inbox/tasks
- scalable scheduling
- configurable workflows
- onboarding/administration
- monitoring/support tooling
- deployment/compliance hardening

## Rule for changing sequence

The roadmap is a guide, not a prison. Change it when a different vertical slice produces substantially more learning or clinical value.

When changing a major sequence or architecture assumption, record the reason in `DECISIONS.md`.
