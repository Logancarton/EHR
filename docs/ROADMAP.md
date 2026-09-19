# Clinical Bond Roadmap — current state and next work

Last documentation verification: 2026-09-19
Verified against starting `main`: `48cd17c0927355170bd625b736636218ff750dab`

## Authority and purpose

This document owns execution state and sequencing:

`current verified state -> current gaps -> next coherent slices -> dependencies/gates -> deferred/blocked work`

It is not the historical delivery ledger. Completed phase evidence and prior queue snapshots are preserved in [the roadmap archive](archive/roadmap/ROADMAP-through-2026-09-19.md).

Use:
- [`PRODUCT_VISION.md`](PRODUCT_VISION.md) for intended clinician/product experience.
- [`ARCHITECTURE.md`](ARCHITECTURE.md) for current implemented boundaries and authority relationships.
- [`DECISIONS.md`](DECISIONS.md) for the governing ADR index and supersession/amendment state.
- current `main` and validation evidence for what is actually implemented.

Implementation truth comes from current code plus the newest intentional decisions. Vision requirements are targets, not proof of completion.

## Current verified product state

The project is architecturally ahead of its remaining product-completeness gaps.

Implemented foundations include:

- persistent multi-patient workspaces, detachable patient panes, restoration, clinician preferences, and browser-style patient tabs;
- server-derived user/session authority, organization membership, patient-access isolation, patient-bound consequential actions, audit/provenance, and immutable signed encounter snapshots;
- authoritative patient roster, administrative record, longitudinal chart foundations, medication truth/reconciliation/prescription-intent separation, prescription transaction/recovery workflows, and clinical reference freezing;
- complete Phase P3 longitudinal clinical-chart gate and Phase P4 scheduling/front-office gate;
- Dashboard DB-0 through DB-10, including configurable modules, shared live scheduling, care-completion projection, and persona/capability boundaries;
- Calendar as a first-class persistent workspace using the same authoritative appointment store as Dashboard/roster surfaces;
- signed encounter history and append-only addendum/amendment workflow;
- prospective-person Intake, standalone intake episodes, promotion/linking, evidence continuity, readiness projection, and staff workflow through D-078;
- durable internal billing charges derived from signed encounters without invented fee amounts; simulated billing success is isolated from normal workflows;
- one grounded AI question path with explicit unsupported/unknown behavior;
- staged static-quality tooling, PatientWorkspace decomposition, typed application navigation/coordination, and CSS ownership/stacking boundaries (D-079 through D-082).

Real PHI remains prohibited until the production-readiness gate is intentionally satisfied.

## Active work

### P5 — Finish and certify the AI-independent encounter loop

Status: **Active**

The core encounter mechanics already exist: appointment-bound opening, autosave/revision protection, immutable signing/reference freeze, deterministic/manual coding support, authoritative signed-history reads, and append-only corrections.

The remaining work is to audit and close the P5 exit gate rather than rebuild those foundations:

- verify the direct documentation UX against P5-B;
- complete the browser recovery matrix for patient switching, detach/redock, refresh, close/reopen, failed save/retry, late response, revision conflict, and signing while save is pending;
- verify visible unsaved/saving/saved/failed/signed states;
- run the full synthetic no-AI encounter path through reopen and amendment.

Exit gate: a synthetic psychiatric encounter can be started, documented, recovered, reviewed, signed, reopened, and amended without AI and without losing patient context.

### P6 — Finish operational queues and related-object workflows

Status: **Active after / alongside the bounded P5 audit where independent**

Audit the existing inbox/messages, tasks, results, document workflow, prescribing operations, and shared queue shells against one pattern:

`queue item -> source object -> patient context -> related evidence -> authorized action -> authoritative resolution -> return path`

Do not create duplicate dashboards or a second clinical/workflow truth system. Care Completion and Dashboard windows are projections over the owning records, not replacements for the queues.

Exit gate: clinician/staff users can work the major operational queues to resolution without dead ends or fabricated empty/success states.

### P7 — Complete forms, consents, assessments, and patient-facing intake

Status: **Active / foundation implemented**

D-073 through D-078 materially advanced staff-facing Intake. The remaining P7 work is now narrower and more explicit:

- versioned editable form-definition lifecycle and practice-facing form configuration;
- stronger initial-intake content using the general form model;
- assessment launch/completion/review integration with Intake;
- legally appropriate signature/capture workflow and versioned practice-authored consent content;
- distinct patient-facing authentication/authorization and self-service boundary;
- vendor-backed eligibility/payment adapters only when selected;
- binary/object-backed document capture and review; OCR/extraction only as reviewed evidence, never silent truth;
- practice-configurable readiness requirements and reminder/escalation behavior.

P7-F patient authority is a hard boundary: do not expose clinician APIs to patients by hiding controls.

## Next coherent slices

1. **P5 exit-gate audit and recovery matrix.** Close the encounter-loop evidence gap without redesigning the encounter system.
2. **P6 queue completion audit.** Prioritize workflows that currently have real source objects but incomplete resolution/return paths.
3. **P7 remaining form/consent/patient-access boundary.** Reuse the Intake prospective-person/evidence architecture already implemented.
4. **P9/P10/P11 product foundations.** Complete truthful financial lifecycle, portability, and production infrastructure before presenting the system as practice-ready with PHI.
5. **P12 full synthetic day-in-the-clinic acceptance.** Major hosted-model expansion follows the acceptance gate rather than compensating for unfinished manual workflows.

Cross-cutting correctness/security defects outrank this ordering when demonstrated.

## Dependencies and gates

- P5 recovery certification depends on authoritative encounter persistence already in place; it does not depend on external vendors.
- P6 internal workflows should be correct before external communications/lab transports are connected.
- P7 patient self-service requires a distinct patient identity/access model; clinician/staff session authority is not reusable for that purpose.
- P8 external integrations proceed only with contracted/official interfaces, explicit access, and testable authenticity/correlation requirements.
- P9 live claim/remittance/denial/balance work requires a selected clearinghouse/payment authority and must not infer payer success or money from absence.
- P10 import treats external records as evidence until reviewed/reconciled into authoritative internal truth.
- P11 production infrastructure and security review are blocking before real PHI.
- P12 is the product-level acceptance gate before major hosted-model/agent expansion.

## Deferred or externally blocked

- **DrFirst live prescribing/EPCS:** deferred by D-037 until contract/onboarding/interface details exist. D-028 remains the selected planned vendor decision.
- **Live lab, communications, reminders, eligibility/payment, and clearinghouse transports:** blocked until a real provider/vendor and verified interface are selected.
- **Hosted-model reference extraction / broad agentic expansion:** defer until the manual authoritative workflows and P12 acceptance path justify it.
- **Patient portal/self-service:** not blocked on a vendor, but blocked on designing and implementing its separate patient authority boundary.

## Completed-phase summary

Detailed delivery evidence remains available in the [historical roadmap snapshot](archive/roadmap/ROADMAP-through-2026-09-19.md). Important completed checkpoints include:

- P3 longitudinal clinical chart gate;
- P4 scheduling/front-office gate;
- RL-A/RL-B sign-time reference freeze and coded diagnosis foundation;
- Dashboard DB-0 through DB-10;
- P9-0 containment and durable internal charge foundation;
- AI-0 grounded answer path;
- signed-history authority correction (D-071);
- Calendar first-class workspace (D-072);
- Intake truth-alignment through D-078;
- code-quality/application-shell/CSS architecture cleanup D-079 through D-082.

Completed does not mean production-ready, vendor-connected, HIPAA-certified, or P12 accepted.

## Roadmap maintenance rules

- Keep only current state, active/future work, gates, and a compact completed summary here.
- Move completed implementation diaries, old validation snapshots, and superseded queue narratives into `docs/archive/roadmap/`; never delete useful rationale solely to shorten this file.
- Use stable IDs such as P5-B, P7-F, DB-10, RL-A, and D-072 instead of brittle numbered-section references.
- Do not duplicate the active queue in AGENTS, ARCHITECTURE, HANDOFF, or ADR bodies.
- When an architectural/product decision changes, update the ADR index/record; when implementation status changes, update this roadmap.
- For docs-only changes, validate links/structure/diff and report application tests/builds as not run.
