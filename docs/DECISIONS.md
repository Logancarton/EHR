# Architecture and Product Decision Log

This file records durable decisions that future agents should not casually reverse.

## D-001 — Build from scratch

Status: accepted

Decision: Build the EHR as a new product rather than extending OpenEMR or another existing EHR codebase.

Reason: The defining interaction and AI architecture are substantially different from conventional EHR assumptions. Starting from a legacy product would risk allowing its information architecture and workflows to dictate the new product.

## D-002 — Workspace-first interaction model

Status: accepted

Decision: Treat each patient chart as a persistent workspace. Support multiple simultaneously open patient workspaces with browser-like navigation.

Reason: The patient's active clinical state is the primary cognitive unit of work, not the software module.

## D-003 — AI is a cross-cutting layer

Status: accepted

Decision: AI will be integrated throughout relevant clinical and operational workflows rather than existing only as a standalone chatbot.

Reason: The largest value comes from reducing synthesis, retrieval, documentation, and workflow burden in context.

Constraint: AI output is not automatically authoritative clinical data.

## D-004 — Structured clinical data remains authoritative

Status: accepted

Decision: The patient record and domain state must exist independently of an LLM conversation or generated summary.

Reason: Clinical data requires auditability, deterministic retrieval, interoperability, and durable state beyond any one AI model.

## D-005 — FHIR at boundaries, not as the UI architecture

Status: accepted

Decision: Design for FHIR compatibility/interoperability but do not force UI components or the internal clinician workflow to mirror FHIR resources.

Reason: Interoperability is necessary, but an exchange standard should not dictate the clinician experience.

## D-006 — Vendor integrations use adapters

Status: accepted

Decision: E-prescribing, EPCS, labs, claims/clearinghouse, communications, payments, scheduling, and other external systems should connect through replaceable adapters/interfaces.

Reason: Core EHR behavior must remain portable if pricing, contracts, APIs, or vendors change.

## D-007 — Synthetic data until security foundation exists

Status: accepted

Decision: Early prototypes use fictional patient data only.

Real PHI is out of scope until authentication, authorization, audit logging, encryption, secrets handling, backup/recovery, retention, and HIPAA-appropriate infrastructure have been intentionally implemented and reviewed.

## D-008 — Human confirmation for consequential AI actions

Status: accepted

Decision: AI may prepare consequential clinical/financial workflows, but explicit authorized-user action is required before committing or sending them.

Examples include note signing, prescriptions, EPCS actions, orders, committed diagnosis changes, result acknowledgement, external patient messages, and claim submission.

## D-009 — Start single-clinician, avoid single-clinician dead ends

Status: accepted

Decision: Optimize the first usable product for one psychiatric clinician while keeping core domain, authorization, data, and integration architecture capable of later supporting multiple providers and organizations.

Reason: A focused first user enables rapid workflow learning without requiring premature enterprise complexity.

## D-010 — Direct-to-main agent workflow

Status: accepted

Decision: For agent-assisted GitHub work, changes are made directly to `main` unless Logan explicitly requests a branch or pull request.

GitHub `main` is the source of truth. Validation remains required after meaningful changes.

Reason: This is the owner's preferred early-stage workflow while the project is small and rapidly evolving.

## D-011 — Patient workspaces can detach into floating windows

Status: accepted

Decision: Patient tabs may be torn out of the primary tab strip into movable, resizable floating windows inside the EHR and later returned to the tab strip. Floating patient windows should behave like familiar desktop/browser windows: drag by the title bar, resize from every edge and corner, minimize, maximize/restore, close, move to front when activated, and navigate backward through that window's recent local views.

Reason: The clinician may need more than one patient workspace visible at the same time for comparison, reference, messages, labs, or related work. Free positioning allows those workspaces to overlap, tile, or partially occupy the screen without forcing a rigid split layout. Keeping these windows inside the application preserves EHR context and creates a cleaner future boundary for authentication, PHI handling, permissions, audit behavior, and AI context than spawning unmanaged browser windows.

Constraint: Each visible window must retain unambiguous patient identity and local workspace state. Future production AI/context routing must never confuse which patient window an action belongs to. The chart interior remains interactive content; window resize behavior belongs to the perimeter rather than consuming clicks inside clinical forms.

## D-012 — Elastic Complexity & Dynamic Workspace Modularity

Status: accepted

Decision: The EHR interface must scale elastically from an ultra-minimal, distraction-free "Zen" writing pad to a high-density, multi-metric clinical cockpit. All workspace modules, dashboard widgets, and overview cards must support direct in-line reordering (`▲`/`▼`), collapsing, and hiding, as well as natural language AI layout reconfiguration. Built-in clinical presets (`Standard Balanced`, `Minimal / Zen Focus`, `Comprehensive Intake`, `Fast Med Check`) and custom user-saved presets are persisted across sessions.

Reason: Clinical workflows and provider specialties vary radically. Forcing a single rigid layout or fixed density on all clinicians produces cognitive overload, visual fatigue, and administrative burnout. Allowing clinicians and ambient AI to reshape the screen ensures maximum focus during patient encounters while retaining instant access to high-velocity clinical tools when needed.

Constraint: Clinical safety invariants (e.g. overdue lab warnings, allergy alerts, unsigned notes) must remain auditable and never be silently dropped when switching to minimal density modes.

## D-013 — Vendor-Neutral Order Adapters & Staged Attestation Cart

Status: accepted

Decision: All medication e-prescribing and diagnostic laboratory requisitions must operate through strongly-typed vendor adapters (`EPrescribingAdapter`, `LabRequisitionAdapter`) decoupled from concrete clearinghouses or commercial labs. Clinicians stage orders into a unified Order Cart across clinical subsurfaces (Medications, Labs, Encounter Scribe, and Today flow), review live drug-drug interactions and EPCS controlled substance warnings, and explicitly sign with provider credentials (NPI, DEA, and two-factor PIN) before dispatching electronic transactions.

Reason: Fulfills D-006 and D-008. Clinical orders must never be transmitted implicitly or owned by proprietary vendor SDKs. A staging cart gives providers total cognitive command over outbound prescriptions and test requisitions without disruptive context-switching.

## D-014 — SQLite FTS5 BM25 Engine for Longitudinal Clinical Note Search

Status: accepted

Decision: Longitudinal cross-encounter note retrieval operates via native SQLite Full-Text Search 5 (`encounters_fts`) directly within `data/ehr.db` using BM25 ranking and lexical proximity matching. No remote vector database, cloud embeddings API, or Python sidecar is required for core longitudinal record queries.

Reason: Fulfills D-004 and D-010. Clinical search must be auditable, zero-latency, local-first, and resilient offline. FTS5 provides instantaneous multi-column ranking across HPI, Assessment, and Plan with tokenized snippet generation.

## D-015 — Practice Scheduling Persistence & Walk-in Decoupling

Status: accepted

Decision: Daily practice appointments and live patient flow statuses (`scheduled`, `waiting`, `in-visit`, `completed`, `no-show`) persist directly into the SQLite `appointments` table with append-only HIPAA audit logging (`appointment_scheduled`, `appointment_updated`). The `patient_id` in appointments is decoupled from strict foreign key cascades to allow walk-in patients and external intakes to be scheduled prior to chart creation.

Reason: Clinical operations require flexible intake handling without blocking clinic flow or corrupting relational database invariants.

## D-016 — Token-Budgeted, Permission-Aware Context Assembly Pipeline

Status: accepted

Decision: Implement the Context Assembly layer specified in `docs/AI_SYSTEM.md` as an isolated engine (`app/server/context/context-assembler.ts`) that scopes patient state by clinical surface (`encounter-scribe`, `order-cart`, `patient-message`, `longitudinal-query`), enforces user role permissions (`provider`, `clinical-assistant`, `staff`), retains record provenance IDs, and deterministically budgets token payload size.

Reason: AI capabilities must never be given unrestricted access to the entire patient database. Strict context assembly preserves patient privacy, enforces role boundaries, and prevents LLM token exhaustion.

## D-017 — Encounter closing is coordinated, not transactional

Status: accepted

Decision: The end of a psychiatric visit may be presented as one clinician-facing closing workflow, but note signing, order authorization, and order transmission remain separate authoritative actions. The signed encounter is immutable even if a later prescription or laboratory transmission fails. Orders persist their own forward-only state (`staged` → `authorized` → `transmitted`, with `transmission_failed` as a recoverable outbound state), and transmission retries are idempotent by order id.

Reason: The clinician should be able to finish a visit coherently without creating a false database/vendor transaction boundary. A legal note and an external order have different failure semantics: loss of connectivity or a vendor rejection must never erase or unlock a valid signed note, while retrying an already-transmitted order must never create a duplicate outbound transaction.

Constraints: Every patient-bound closing action continues through `ClinicalActionGateway`, server-side active-patient binding remains mandatory, only roles with the relevant explicit permission may sign/authorize/transmit, and transient authentication secrets such as EPCS PIN/OTP values are never persisted into the legal chart or order metadata.

## D-018 — Authoritative team users with revocable server-side sessions

Status: accepted

Decision: `team_members` is the authoritative first-party EHR user/team-member directory. Authentication identities and revocable server-side sessions are separate records linked to that user. The browser session token contains only a signed opaque session reference and expiry metadata; role, display identity, credentials, and active status are resolved from authoritative server records on each authenticated request.

Reason: Legal clinical actions require attributable human identity and current permissions. Embedding a role inside a long-lived browser token would allow stale authorization after a role change or deactivation and would make logout/revocation weaker. Resolving the actor from server state makes user deactivation, role changes, and logout effective immediately while preserving a clean boundary for future OAuth/SSO.

Constraints: Production never falls back to `prototype-provider`; an invalid presented cookie is rejected even in development; client-supplied identity/role metadata is never trusted; plaintext passwords and production session secrets are never committed; local development convenience is explicitly non-production and still creates a normal revocable server session tied to an authoritative synthetic user.

## D-019 — Medication clinical truth is separate from prescribing-vendor evidence

Status: accepted

Decision: The normalized EHR medication record is the authoritative longitudinal statement of what the clinician believes the patient is taking. Prescription, dispense, fill, medication-history, or other vendor data are external evidence and must first be translated by a vendor-neutral adapter into non-authoritative medication candidates. External candidates do not create, overwrite, discontinue, or reactivate clinical medication records without an explicit clinician-confirmed workflow through the existing clinical mutation boundary.

Reason: A transmitted or filled prescription does not prove current medication use, and a patient may be taking a medication that was prescribed outside this EHR. Keeping vendor evidence separate from clinical truth preserves reconciliation semantics, provenance, patient safety, and vendor portability.

Constraints: `ClinicalActionGateway` remains the authoritative clinical mutation boundary; medication lifecycle changes retain version/provenance/audit history and patient binding; AI may propose medication changes but cannot commit them; specialized e-prescribing network capabilities such as EPCS, pharmacy connectivity, external medication history, formulary/benefit data, and network acknowledgements remain integration-provider responsibilities rather than core medication-domain behavior. Prescription authorization is not, by itself, medication-truth confirmation; D-021 defines the explicit internal prescription-intent boundary.

## D-020 — Medication reconciliation is an explicit clinician conversion of evidence into clinical truth

Status: accepted

Decision: Medication reconciliation candidates persist independently from authoritative medication records. A candidate may originate from a patient report, clinician-entered review evidence, imported data, or a vendor-neutral integration adapter, but only an explicit clinician reconciliation decision may add, update, or discontinue an authoritative medication. Ignoring a candidate resolves the evidence without changing clinical truth.

Reason: Reconciliation is the safety boundary between evidence and longitudinal clinical state. Preserving that boundary makes disagreement visible, prevents silent vendor/patient/AI data promotion, and retains a traceable explanation for why a medication fact changed.

Constraints: Reconciliation mutations remain patient-bound, authenticated, permission-controlled, and routed through `ClinicalActionGateway` plus the existing clinical record service/repository path. Candidate resolution and its resulting medication mutation are atomic within the local database so one cannot commit without the other. Medication matching is advisory only; update/discontinue require an explicitly selected same-patient medication. Candidate provenance remains separate from authoritative medication provenance, with the resulting medication version referencing the candidate. Pending evidence must not enter `ContextAssembler.activeMedications`; AI may reason about reconciliation evidence only when it is exposed through a clearly non-authoritative channel and still cannot execute reconciliation without clinician confirmation.

## D-021 — Prescription intent is separate from medication clinical truth

Status: accepted

Decision: A medication prescription is an outbound clinician intent with its own lifecycle. Staging, authorizing, or transmitting a prescription does not automatically add, update, discontinue, or reactivate an authoritative medication record. If the clinician wants the prescription to change the longitudinal medication list, that is a separate explicit action through `ClinicalActionGateway` and the existing medication record lifecycle.

Reason: What the clinician intends to prescribe and what the clinician believes the patient is actually taking are related but not identical facts. Separating them prevents a prescription transaction from silently rewriting the longitudinal chart, preserves reconciliation semantics, and allows future prescribing vendors to remain downstream adapters rather than owners of the EHR medication model.

Constraints: Prescription intent reuses the existing order repository, Order Cart, authorization permissions, transmission lifecycle, patient binding, audit infrastructure, and vendor-neutral adapter boundary rather than creating a second order subsystem. Deterministic prescription validation and medication-truth comparison are advisory until explicit clinician action. Phase 4D medication matching logic is reused conservatively; ambiguous relationships never preselect an authoritative medication target. AI may draft, summarize, compare, and identify missing prescription fields, but AI-originated execution cannot authorize, transmit, or change medication truth. `ContextAssembler.activeMedications` remains authoritative; prescription intents are exposed separately as proposal-only context. Source provenance survives lifecycle changes so a clinician-authorized AI draft remains attributable to AI as the proposal source. EPCS, PDMP, formulary, eligibility, prior authorization, pharmacy-network transmission, medication-history feeds, and commercial e-prescribing vendor integration remain outside this decision and require later phases.
