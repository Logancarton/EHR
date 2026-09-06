# EHR Roadmap

This roadmap is intentionally ordered around usable clinician workflows rather than feature-count parity with existing legacy EHRs.

Rather than bolting on AI at the end or sequestering it to a later phase, **AI capabilities and elastic UI modularity are developed concurrently with each vertical clinical surface**.

---

## Phase 0 — Foundation & Dynamic Modularity Engine

Status: **Complete / Active**

Goals:
- Workspace-first UI shell (persistent patient tabs, Google-inspired design language).
- **Elastic Modularity Engine**: Provider layout customizer, 4 clinical presets (`Standard Balanced`, `Minimal / Zen Focus`, `Comprehensive Intake`, `Fast Med Check`), and custom preset persistence.
- Direct on-screen manipulation (`▲`/`▼` card reordering, in-line collapse, and in-line hide).
- Natural language AI intent parser for layout and workspace reconfiguration.
- Project constitution (`AGENTS.md`) and durable architecture documentation.
- CI/type-check/build validation with 100% synthetic clinical fixtures.

Exit criteria:
- Repository rules and clinical boundaries are established.
- Workspace adapts dynamically between Zen focus and high-density cockpit.
- Next.js Turbopack build and TypeScript typecheck pass with zero errors.

---

## Phase 1 — Clinician Workflow Nucleus & Native AI Assistance

Status: **Complete**

Build the end-to-end clinical workflow nucleus for psychiatric practice with native AI assistance woven into every step:

Sequence:
1. **Today / Schedule Dashboard**: Live patient flow metrics, status transitions (`waiting`, `in-visit`, `completed`), and dynamic AI Morning Briefing.
2. **Patient Domain & Creation / Search**: Fast patient indexing, cross-chart clinical search, and voice-assisted chart navigation.
3. **Encounter Lifecycle & Ambient Note Scribing**:
   - Encounter open/conduct/sign lifecycle with autosaved drafts.
   - Ambient/voice transcript ingestion into psychiatric note blocks (HPI, Interval History, Treatment Response, MSE, Assessment, Plan).
   - Past encounter longitudinal search drawer embedded directly in note drafting.
   - Dynamic E/M progression meter (99212–99215) and AMA/CMS psychotherapy add-on stepper (+90833/+90836/+90838).
4. **Longitudinal Patient Timeline & History Flowsheet**:
   - Unified chronological view of encounters, medication titrations, and laboratory trends.
   - Ambient AI-driven interval change synthesis (*"What changed since last visit?"*).
5. **Medication Workspace & Automated Protocol Surveillance**:
   - Prescription management, titrations, and side-effect tracking.
   - Active protocol surveillance engine (e.g., automated overdue monitoring for Quetiapine, Lithium, SSRIs).
   - One-click draft orders for surveillance labs.
6. **Draft Orders & Prescription Workflow (DrFirst Rcopia / Surescripts / Quest)**:
   - Vendor-neutral adapter architecture ([D-006](file:///c:/Users/Logan/Desktop/EHR/docs/DECISIONS.md#d-006--vendor-integrations-use-adapters), [D-013](file:///c:/Users/Logan/Desktop/EHR/docs/DECISIONS.md#d-013--vendor-neutral-order-adapters--staged-attestation-cart)).
   - DEA EPCS 21 CFR §1311 two-factor authentication and provider legal attestation gate ([D-008](file:///c:/Users/Logan/Desktop/EHR/docs/DECISIONS.md#d-008--human-confirmation-for-consequential-ai-actions)).
   - Real-time psychiatric drug-drug interaction and duplicate therapy screening.
   - Staged order cart with electronic requisition slip generator.
7. **Patient Messages & Asynchronous Clinical Triage**:
   - Google Workspace / Gmail + Chat aesthetic with ambient AI urgency triage.
   - One-click medication refill staging into DrFirst adapter.
   - Smart Reply pills and provider voice dictation.
8. **Tasks / Inbox & Attention Queue**:
   - Proactive clinical queue (lab alerts, unsigned notes, patient messages, scratchpad notes).

Exit criteria:
A clinician can start the day with an AI morning briefing, open a patient, conduct/document an encounter with ambient AI assistance, see longitudinal timeline context, manage medications and lab surveillance protocols, e-prescribe with DrFirst/Surescripts, triage patient messages, and return to unfinished work without losing state or being trapped in rigid legacy layouts. All 6 patient chart subsurfaces (`Overview`, `Encounter`, `Meds`, `Labs`, `Messages`, `History`) are fully functional with zero placeholder screens.

---

## Phase 2 — Secure Data Foundation & Personalization Store

Goals:
- Production-grade persistence architecture (PostgreSQL / Prisma / Supabase).
- **Provider Preference & Personalization Store**: Persist clinician UI profiles, custom presets, documentation styles, and protocol preferences.
- **Context Assembly Pipeline**: Permission-aware, token-optimized context assembler that feeds the minimum necessary clinical evidence to AI models.
- Authentication & RBAC (Provider, Staff, Clinical Assistant).
- HIPAA-appropriate infrastructure: Audit logging, immutable event history, encryption at rest/in transit, backup/recovery, and secrets management.
- Tenant/organization model for future multi-provider expansion.

Safety boundary:
No real PHI should be introduced until this phase's security and audit requirements are intentionally implemented and reviewed.

---

## Phase 3 — Production Multimodal AI & Clinical Intelligence

Transition from prototype AI rules to production multimodal models:

Capabilities:
- **Offline/Local & Cloud Voice Scribe**: Real-time ambient clinical transcription with psychiatric vocabulary fine-tuning.
- **Structured Candidate Extraction**: Extract proposed medication titrations, lab orders, DSM-5 diagnoses, and billing codes with exact source provenance.
- **Cross-Encounter Semantic Retrieval**: Vector embeddings over past clinical notes to answer longitudinal clinician queries (*"When was the patient last manic?"*, *"Did we try lamotrigine before?"*).
- **Autonomous Workspace Operations**: AI dynamically reorganizes the clinician's canvas, prepares intake tools, or sets up medication review based on natural language intent.
- **Safety & Verification Harness**: Uncertainty representation, hallucination guards, and explicit clinician sign-off gates before committing legal medical records.
- **Model-Provider Abstraction**: Switch seamlessly between Gemini, Claude, OpenAI, or local HIPAA-compliant models without rewriting EHR application logic.

---

## Phase 4 — Core Integrations (Behind Adapters)

Integrate external healthcare services cleanly behind isolated adapters:

1. **Scheduling / Calendar APIs**: External booking, reminder notifications.
2. **E-Prescribing & EPCS**: Surescripts / DoseSpot adapter for electronic prescriptions and controlled substances.
3. **Lab Orders & Results**: Quest / Labcorp HL7/FHIR adapters for automated result ingestion.
4. **Patient Communications**: HIPAA-compliant SMS and portal messaging.
5. **Document Exchange / Interoperability**: C-CDA and FHIR US Core document import/export.
6. **Claims, Clearinghouse & Billing**: Electronic claim submission, ERA/EOB processing, eligibility verification.

Rule: Integration vendors must never leak into the core internal domain model.

---

## Phase 5 — Revenue-Cycle & Practice Intelligence

- Clinical evidence-grounded E/M coding suggestions.
- Pre-submission claim scrubbing and denial-risk checks.
- Practice-level operational dashboards and quality measure reporting.
- Clinician administrative load reduction metrics.

---

## Phase 6 — Multi-Provider Enterprise & Specialty Expansion

- Multi-tenant organization administration.
- Shared provider inboxes, cross-coverage, and handoffs.
- Multi-specialty layout packs (e.g. primary care, neurology, cardiology presets).
- Enterprise audit compliance, SSO, and federated directory integration.

---

## Rule for Changing Sequence

The roadmap is a guide, not a prison. Change it when a different vertical slice produces substantially more clinical cognition value or reduces provider burnout faster. When changing a major sequence or architectural assumption, record the rationale in `docs/DECISIONS.md`.
