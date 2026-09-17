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

## D-022 — External prescription transaction state is a separate authority class

Status: accepted

Decision: External prescription transport/network state is persisted in a vendor-neutral prescription transaction ledger separate from both prescription intent and authoritative medication truth. One EHR-owned transaction identity tracks an outbound order/type with stable correlation/idempotency identity, retry attempts, current normalized state, and append-only events. Adapter/network success initially means `submitted`; external acknowledgement/acceptance/rejection/change/cancellation states require normalized external evidence.

Reason: A prescribing vendor has authority to report what happened on its transport/network, but not to decide what the clinician believes the patient is taking. A durable transaction/event layer preserves failure/retry history, makes external state searchable/linkable from many future workspace surfaces, and provides a stable integration seam for DrFirst or another vendor without pushing vendor objects into the medication domain.

Constraints: The EHR-generated correlation ID is the routing authority for inbound events; vendor patient/order/transaction IDs are consistency assertions and mismatches fail closed. Replayed vendor events are idempotent. External dispense/history evidence may create pending medication-reconciliation candidates but cannot mutate medication truth. AI may eventually read permission-scoped transaction status but cannot create, transmit, retry, ingest, cancel, or mutate transactions. Human prescription transmission remains an authenticated, patient-bound `ClinicalActionGateway` action. No public vendor callback is exposed until callback authentication/verification and replay protection exist. Credentials, PINs, OTPs, tokens, secrets, raw transport payloads, and similar sensitive artifacts must not become ordinary transaction/order metadata. Development prescribing adapters must fail closed and must not fabricate regulated network, EPCS, PDMP, pharmacy acknowledgement, medication-history, formulary, ePA, or SSO behavior. Vendor-specific schemas/identifiers remain inside adapters; production DrFirst connectivity still requires secure infrastructure plus the applicable commercial onboarding, testing, certification, and network enablement.

## D-023 — Refill/renewal requests are workflow evidence; approval creates a new prescription intent

Status: accepted

Decision: A patient, pharmacy, or internally recorded refill/renewal request is persisted as a dedicated workflow request linked to the prior prescription order and prior transmitted `new_rx` transaction. It is not represented as an outbound prescription transaction before clinician review. Executing the renewal workflow creates a **new staged medication order/prescription intent** linked back to the refill request and prior prescription; the prior order and prior transaction remain historically intact. The new order then follows the ordinary authorization and outbound `new_rx` transmission path.

Reason: A request for more medication is not the same fact as an approved prescription, and a renewal is a new prescribing decision rather than a mutation of historical transport state. Separating request state from prescription intent prevents silent reuse of stale authorization/transport metadata, preserves provenance, keeps vendor workflow evidence downstream of clinical authority, and makes duplicate request/click behavior deterministically idempotent.

Constraints: `prescription_refill_requests` stores the cross-order lineage (`prior_order_id`, `prior_transaction_id`, optional `renewal_order_id`) with version/provenance and audit history. Phase 4H does not weaken or overload `prescription_transactions.related_transaction_id`, which continues to represent the same-order CancelRx relationship. The renewal copies only reviewable prescription fields and deliberately does not copy the prior start date, authorization/transmission receipt, credentials, or medication-truth confirmation. A refill request alone does not create medication-reconciliation evidence. Renewal staging, authorization, and transmission do not automatically change `patient_medications`. Patient identity is derived from durable server-side records and checked against the active chart. Existing `stage_order`, `authorize_order`, and `transmit_order` permissions remain authoritative. AI may summarize the request or draft/propose a renewal, but AI execution cannot create/approve the refill request workflow, run `renew_prescription`, authorize, transmit, ingest vendor events, reconcile medication evidence, or mutate medication truth. Real pharmacy refill networking and public vendor callbacks remain deferred until authenticated/verified callback infrastructure exists.

## D-024 — Pharmacy change requests remain explicit workflow evidence; no generic prescription relationship graph yet

Status: accepted

Decision: Pharmacy/vendor requests to alter a prior prescription are persisted as dedicated `prescription_change_requests` workflow records linked to the historical `new_rx` transaction and source order. Accepting a request creates exactly one new staged medication order/prescription intent; declining resolves the request without creating an order. The original order and transaction remain historical and unchanged. Phase 4I does **not** introduce a generic prescription relationship model and does not repurpose `prescription_transactions.related_transaction_id`.

Reason: Refill and pharmacy-change workflows are now two real cross-order lifecycles, but the repeated part is only the broad principle that a request can lead to a new prescription. Their request identities, sources, normalized content, resolution semantics, and clinician decisions differ materially. A generic relationship graph would add abstraction without simplifying either workflow and could weaken the same-order identity invariant already enforced for CancelRx. Explicit workflow lineage remains easier to audit and harder to misuse.

Constraints: Change-request ingestion is a trusted internal vendor-normalization boundary only; there is no public callback route in Phase 4I. Stable adapter/external-request identity is replay-safe and cannot be rebound to another patient or source prescription. Clinician accept/decline runs through authenticated, active-patient-bound `ClinicalActionGateway` execution and requires staging authority. Acceptance stages a new intent through the existing prescription validation/review path but does not authorize, transmit, cancel the old prescription, reconcile medication evidence, or change medication truth. Authorization and transmission remain separate explicit actions with their existing permissions and AI restrictions. The resulting outbound replacement, if later authorized and transmitted, creates an ordinary new `new_rx` transaction. AI may summarize, compare, or draft a candidate response, but AI execution cannot accept/decline the request, authorize/transmit the replacement, cancel the prior prescription, ingest vendor change requests, reconcile evidence, or mutate medication truth. A generic typed relationship primitive should be reconsidered only when another real workflow demonstrates shared semantics that cannot be represented cleanly through explicit workflow provenance.

## D-025 — Verified prescribing callbacks are a separate integration authority boundary

Status: accepted

Decision: Raw public prescribing callbacks never mutate clinical repositories directly. A vendor-specific verification adapter must first authenticate the raw HTTP request and translate it into the bounded vendor-neutral `VerifiedPrescriptionCallback` envelope. Core routing then resolves the prior prescription through the EHR-owned `correlationId`, treats vendor patient/order/transaction identifiers only as consistency assertions, durably reserves callback identity by `(adapter_id, external_message_id)` plus a fingerprint of normalized meaning and resolved EHR binding, and routes only supported transaction events, refill requests, or pharmacy change requests into their existing services. Exact replay is idempotent; semantic or identity rebinding fails closed.

Reason: Vendor traffic is untrusted until verified, duplicate webhook delivery is normal, and an external prescribing system can report transport state or request clinician review but cannot become a clinician. A separate verified integration authority layer preserves correlation, replay safety, auditability, vendor portability, and the distinction between external evidence and clinical authority.

Constraints: The public route must not use an ordinary EHR user session as vendor authentication and must never let callback-supplied patient identity choose or redirect the patient. External callback processing does not use `ClinicalActionGateway` as though the vendor were a human clinician. Current development prescribing adapters fail closed for callback verification and do not simulate DrFirst, Surescripts, or DoseSpot authentication. Raw request bodies, headers, signatures, cookies, credentials, API keys, PINs, OTPs, tokens, and arbitrary transport metadata are not stored in ordinary callback, audit, order, transaction, request, or medication records. `prescription_callback_receipts` stores only bounded replay/binding identity, normalized fingerprints, status, and resulting EHR entity references. Clinically meaningful transaction medication evidence may enter only through the existing reconciliation-candidate boundary; refill/change requests alone are not medication evidence. No callback automatically stages, authorizes, transmits, cancels, reconciles, or changes `patient_medications`. Human renewal/change decisions remain authenticated and patient-bound through `ClinicalActionGateway`. AI cannot use the callback boundary as an execution path. EPCS, PDMP, formulary, eligibility, ePA, medication-history feeds, real vendor credentials, regulated network connectivity, and commercial onboarding/certification remain deferred. `prescription_transactions.related_transaction_id` remains reserved for the same-order CancelRx relationship defined by D-024.

## D-026 — Integration configuration, secrets, and delivery reliability remain separate from clinical authority

Status: accepted

Decision: External integrations use durable vendor-neutral configuration records plus replaceable secret references, while actual secret values remain outside ordinary EHR persistence. Prescription delivery reliability continues to use the existing prescription transaction ledger rather than a second generic prescribing outbox. A transport attempt whose remote result cannot be proven is recorded as `outcome_uncertain` and is not blindly retried until the result is reconciled. New infrastructure migrations use explicit ordered identities and transactional application through `schema_migrations` while legacy additive foundations remain temporarily compatible.

Reason: Clinical authorization, adapter eligibility, operational delivery state, vendor evidence, and medication truth are different authority classes. Collapsing them would allow configuration or infrastructure state to impersonate a clinician, duplicate prescription transport authority, leak secrets into clinical data, or turn an ambiguous network timeout into a duplicate external prescription. The explicit migration ledger adds deterministic production-readiness without forcing a risky whole-database migration in one phase.

Constraints: Integration configuration mutation requires server-derived provider authority (`manage_integrations`). Configuration IDs cannot be rebound across adapter/purpose/environment/scope identities. Only bounded non-secret configuration and secret-reference identifiers may persist; production secret material must resolve through an `IntegrationSecretProvider` and missing material fails closed. Default prescribing transmission requires exactly one enabled matching integration configuration before a new external attempt is created. `outcome_uncertain` is a transport state, not medication truth, prescription authorization, or external acknowledgement; blind retry is blocked and later resolution must come from explicit operational reconciliation or verified vendor evidence. A generic integration outbox may be added only when a real integration demonstrates durable work-scheduling semantics not already owned by an existing transaction model. AI gains no new execution authority from this infrastructure, and real vendor credentials/connectivity, EPCS, commercial onboarding/certification, production secrets management, and production PHI deployment remain deferred.

## D-027 — Canonical True North interaction specification

Status: accepted (2026-09-09)

Decision: Maintain the owner's complete workspace/formatting requirements in `PRODUCT_VISION.md` as the single canonical product interaction specification. Require agents to read it, map meaningful work to requirement IDs, and distinguish intended behavior from verified implementation.

Reason: Successive backend phases and chat handoffs must continue toward Chrome + Google Workspace + an AI operating environment: `search / command / link / context → object → related object → action`. Durable, discoverable requirements prevent design drift and duplicate planning files.

Constraints: This elaborates D-002, D-003, D-011, and D-012 without replacing their safety boundaries. Floating workspaces remain in-application windows; AI workspace control does not grant clinical mutation authority. This documentation change does not certify checklist completion, alter roadmap phase status, or claim production readiness. Future intentional product-direction changes update the canonical vision and record their rationale here.

## D-028 — DrFirst selected for planned e-prescribing and EPCS

Status: accepted (2026-09-09)

Decision: Logan selected DrFirst as the planned prescribing integration, including EPCS (electronic prescribing of controlled substances). Treat this as a committed product direction rather than an interchangeable vendor example. The canonical requirements are RX-01 through RX-05 in `PRODUCT_VISION.md`.

Reason: Future development should prepare the existing prescribing architecture for the owner's intended integration while preserving the patient-workspace experience.

Constraints: Retain vendor adapters and existing clinical/AI authority boundaries. Determine specific DrFirst product/interface and EPCS onboarding requirements from vendor documentation when implementing; selection does not establish contracted access, supported API/SSO behavior, certification, or production enablement. Reuse existing workflows rather than building a second prescribing subsystem. This decision records intent only and does not activate live prescribing.

## D-029 — Evidence-based roadmap gates and save reliability priority

Status: accepted (2026-09-09)

Decision: Replace stale blanket completion claims in `ROADMAP.md` with an evidence-backed inventory and explicit workflow, production-infrastructure, AI and integration exit gates. Prioritize encounter save acknowledgement/failure recovery and interrupted window-gesture cleanup, followed by browser lifecycle verification, before further workspace feature expansion. Keep existing broad phase numbering for continuity; historical implementation phase labels do not certify those broad phases complete.

Reason: Review of `main` at `338520726cd09f6a5d48a235f4d42ba1e7999527` found silent encounter autosave error handling and missing floating gesture cancellation coverage, while the old roadmap claimed a complete clinical nucleus and functional prescribing/EPCS. Meanwhile, authentication, record integrity, prescribing recovery and migration foundations already exist and should not be rebuilt.

Constraints: This changes sequencing and status documentation only. `PRODUCT_VISION.md` remains canonical for interaction requirements; DrFirst remains the selected planned integration under D-028. Clinical authority, synthetic-data restrictions and production readiness gates remain intact. Browser behavior and production integrations require their own evidence beyond successful unit tests and builds.

## D-030 — Absence of clinical facts must be loaded, never assumed

Status: accepted (2026-09-09)

Decision: A clinical surface may render an empty list as an affirmative clinical statement ("None active", "None recorded") only when that patient's records have actually loaded. Not-yet-loaded and failed-to-load are distinct states and must be shown as such. Load state carries the patient identifier it belongs to, and presentation is derived against the currently active patient, so a result belonging to another patient is never displayed under that patient's identity. `app/lib/clinical-facts-presentation.ts` holds this rule as pure, tested logic; `ClinicalFactsBar` consumes it.

Reason: The patient header previously initialized problems and allergies to empty arrays with no load state, so it asserted "Allergies: None recorded" before any request resolved and permanently if the request failed — the load error was only visible inside the management modal. In an EHR, "no known allergies" is a clinical claim that a UI must not make on the strength of an unfulfilled promise. The same gap allowed a slow or failed load during a patient switch to leave the previous patient's chips under the new patient's name.

Constraints: This is a presentation-authority rule, not a data-model change; problem and allergy records, provenance and version history are unchanged. It elaborates PAT-01 and PAT-06 in `PRODUCT_VISION.md`. Focused unit tests cover the state machine and the wrong-patient case, and the three states were exercised in the browser; that is not browser-lifecycle certification. Other surfaces that render clinical absence should adopt the same rule as they are touched, rather than being rewritten speculatively.

## D-031 — Browser verification tooling is a named Phase 0 prerequisite

Status: accepted (2026-09-09)

Decision: Treat selection of a browser verification harness as an explicit, unsatisfied prerequisite step in Phase 0 rather than an implicit part of writing browser tests, and record the eventual choice here before adopting it. Also record the unauthenticated `GET /api/patients` and `GET /api/audit` handlers in `ROADMAP.md` as a present gap in the existing development foundation, sequenced ahead of Phase 2's production controls.

Reason: Phase 0's exit gate and the top of the implementation queue both require repeatable browser scenarios, and the roadmap states that passing unit tests alone does not close the phase. Inspection at `b7511f4` found no browser or DOM test tooling in `package.json` or `node_modules`; all 38 test files run as Node unit tests. The highest-priority phase was therefore gated on a tooling decision that had never been named, so no amount of implementation work could close it. Separately, Phase 2 was written as a list of production controls to add, which would not have surfaced two clinical/audit routes that already answer unauthenticated requests today.

Constraints: This records sequencing and a known defect; it selects no harness and adds no dependency. The choice is a durable dependency decision for Logan, weighed on faithful pointer-capture and drag semantics, deterministic control of late async responses, and cost on Windows, and belongs in this document when made. Closing the open endpoints is remediation of an existing defect and does not imply production identity, isolation or PHI readiness. This does not change any phase's exit gate or advance any phase label.

## D-032 — Remediate verified authority gaps independently of browser tooling

Status: accepted (2026-09-09)

Decision: Refine the roadmap queue from the inspected `6de7d15` baseline: remediate current API/audit authority gaps and the patient-creation allergy default while the D-031 browser-harness decision remains unresolved. Browser certification still gates Phase 0 completion; it does not gate independent handler/repository regression work. Keep one synthetic, source-grounded AI workflow alongside the clinician nucleus under the existing context/proposal boundary.

Reason: The audit POST handler accepts client-supplied actor identity without authentication, beyond the previously documented read gaps. Patient POST defaults omitted allergies to NKDA, which the creation service persists as a fact; the header loading fix cannot correct invented source data. Inspection also disproved the roadmap's claim that document content/storage fields were absent: text, storage-key and version primitives already exist and must be reused for the missing binary workflow. Clean `npm ci` fails on the committed lockfile although CI's `npm install` passes.

Constraints: This review changes documentation and sequencing only; none of these defects is marked fixed. Preserve D-018 server-derived identity, D-030 absence semantics, D-031's explicit harness decision, all clinical/AI authority boundaries and every production exit gate. Historical architecture milestone lists are not grounds to rebuild implemented integration or document foundations. No new model, storage provider, browser dependency or vendor interface is selected.

## D-033 — Patient access is organization membership, decided separately from authentication and role

Status: accepted (2026-09-09)

Decision: Introduce organization membership as a third, independent authority. Authentication answers *who* the user is (`AUTHENTICATION.md`), roles answer *what kind of action* they may take (`ClinicalPermission`), and organization membership answers *which patients they may touch*. A patient record is owned by exactly one organization (`patient_organizations`), written in the same transaction as the patient row. A user reaches a patient only through an `active` membership in that patient's organization; membership carries a `patient_access_scope` of `organization` (the whole practice population) or `assigned` (only patients explicitly linked through `team_member_patients` inside that organization). The rule is pure, tested logic in `app/lib/patient-access-policy.ts`; `app/server/auth/patient-access.ts` resolves it against durable records and raises `PatientAccessError`, which the HTTP boundary maps to `403`. Enforcement sits at both `clinicalRequest`/`authenticatedClinicalRequest` and inside `ClinicalActionGateway`, and cross-patient surfaces (roster, practice queues, cross-chart AI search and omnibox patient resolution, patient-attributed audit reads) narrow to the reachable population rather than post-filtering a full load.

Reason: Phase 2 required organization/patient-access authorization defined independently from authentication and roles, and Phase 6 team expansion was explicitly gated on it. Before this change, any authenticated clinician with `read_clinical` could open any chart in the database, and the roster returned every patient regardless of practice. Role permissions could not express this: a provider is fully authorized to prescribe — for their own patients. Collapsing the two questions into one would have made the only way to restrict a clinician's patient reach the removal of their clinical authority.

Constraints: The policy fails closed in every direction. A patient with no owning organization is reachable by nobody, so no import, backfill, or future creation path can produce an accessible orphan; `PatientRepository.create` therefore writes ownership inside the patient-insert transaction and `create_patient` derives the organization from the creating clinician's own membership rather than from client input. A `suspended` or `revoked` membership grants nothing, and revocation takes effect on the existing session without re-authentication, mirroring the role-derivation rule in `AUTHENTICATION.md`. A care-team assignment never reaches across organizations. Patient binding (D-018 lineage) is checked before access so a wrong-patient action still reports the binding mismatch it always did; access is then checked against both the durable binding and the asserted active chart. Test fixtures that construct a `ProviderContext` literal must declare their membership through `tests/helpers/organization-access.ts` rather than being exempted. This decision establishes the access *model* and its enforcement points; it does not establish production user provisioning, organization administration UI, cross-organization coverage agreements, encryption, deployment security, or PHI readiness, all of which remain open in Phase 2. Team collaboration surfaces (`/api/team/*`) still exchange internal messages and tasks under the existing mutual-agreement model; extending them across organizations is Phase 6 work that must now be expressed through this boundary.

## D-034 — Playwright is the browser verification harness (recording the D-031 choice)

Status: accepted (2026-09-09)

Decision: Playwright with a single Chromium project is the repository's browser verification harness, configured in `playwright.config.ts` against `tests/browser/` and run through `npm run test:browser`. It manages its own `next dev` web server, runs serially (`workers: 1`, `fullyParallel: false`) for deterministic database state, and retains a trace, screenshot and video on failure. This entry records the choice D-031 required to be documented before adoption; the dependency itself was added in `4f0fd26` and the first passing scenarios landed in `b917f19`.

Reason: D-031 named harness selection as an unsatisfied Phase 0 prerequisite and required the decision to be recorded here, weighed on faithful pointer-capture and drag semantics, deterministic control of late async responses, and cost on Windows. Playwright drives real pointer events through CDP rather than synthesizing DOM events, which is what the floating-window gesture, snap and resize behavior actually needs; its route interception gives deterministic control over slow and late API responses; and it installs and runs on Windows without additional native toolchain setup. The dependency was adopted before this entry existed, which is the gap being closed.

Constraints: This records tooling only. Passing browser scenarios are evidence for specific Phase 0 and Phase 1 exit-gate items, not certification of the whole phase, and they establish nothing about production infrastructure or PHI readiness. Serial execution is deliberate — the suites share one SQLite database, so parallel workers would make results order-dependent; a future parallel configuration requires per-worker database isolation first. Browser suites are a supplement to the Node test suite, not a replacement: authority, binding and clinical-safety boundaries continue to be proven by focused Node tests that do not depend on a running server.

## D-035 — Clinician layout choices are durable, and every dismissal has a visible way back

Status: accepted (2026-09-10)

Decision: Any workspace element a clinician can dismiss must (a) persist that choice through the server-side preference record, and (b) offer a restore affordance visible from where the dismissal happened. Concretely: every Today dashboard section carries the same four controls (move up, move down, collapse, hide) through the shared `SectionTools` primitive; collapse is persisted in `today.collapsedWidgets` rather than component state; hidden sections are listed in a `HiddenSectionsBar` with one click to restore each; and both the left sidebar (`showSidebar`) and the right companion rail (`showCompanionRail`) can be collapsed in place, leaving a slim edge handle. All preference-changing surfaces route through one `persistPreferences` handler in `PatientWorkspace` that saves and reports failure. Readers of stored preferences merge group by group through `mergeStoredPreferences`.

Reason: Logan reported the workspace had become overcluttered and that more of it should be dismissible. Inspection found the problem was not a missing feature but three defects. Preferences are loaded from the server on boot, yet only the Layout Customizer saved back to it, so hiding a section, collapsing an overview card, or switching density looked applied until the next reload and then silently reverted. The server repository merged stored preferences with a plain spread, so a `today` group written before a setting existed replaced the whole default group and left the new setting reading as off for every clinician who had ever saved preferences. And the controls had drifted apart — the briefing could collapse, the metrics row could not, the patient roster could neither collapse nor be dismissed — while `showSidebar` was fully persisted but never read by any component, so the Zen preset's promise to hide the sidebar did nothing. This elaborates principle 11 (Elastic Complexity & Progressive Disclosure) in `AGENTS.md`: a workspace that scales from Zen to cockpit has to let the clinician actually put things away, and keep them away.

The same defect class turned out to cover the whole `encounter` preference group: all six note-section toggles were offered in the Layout Customizer and read by nothing, so unchecking Assessment or Plan silently did nothing. They are now honoured — five note sections by `EncounterTemplatePane`, and `showPastEncountersSearch` by the past-encounter drawer plus the toolbar control that opens it, since a control that opens a drawer the clinician turned off would dead-end. Five of the six carry one safety override, held as pure logic in `app/lib/encounter-section-visibility.ts`: **a section that already holds text always renders, whatever the preference says.** Hiding a field is a template preference, not a way to remove what has been written — content that reaches the signed note must stay visible while the note is open, or a clinician would sign words they cannot see.

Constraints: This is a presentation and personalization change; it alters no clinical record, authority boundary, or AI capability. The encounter-section override is a clinical-safety rule, not a convenience: any future surface that hides a field a clinician can write into owes the same guarantee. Dismissal must never be a one-way door — the restore bar and the edge handles are load-bearing, not decoration, and a future dismissible element must ship its own way back rather than deferring to the Layout Customizer. The sidebar renders in the root layout, outside the workspace preference tree, so its visibility crosses that boundary through the existing custom-event channel (`ehr-sidebar-visibility` / `ehr-sidebar-visibility-request`) with preferences remaining the single source of truth; the component holds no second copy of the setting. `SectionTools` was extracted because the same control row already existed at five sites, not speculatively. Hidden and collapsed are deliberately distinct states: collapsed keeps a section's place and header, hidden removes it and lists it for restore.

## D-036 — Workspace restoration completes before it is reported complete

Status: accepted (2026-09-10)

Decision: `restoreWorkspace` waits for the restored view to be on screen before `data-workspace-restored` is set to `"true"`, waits for the view control to exist rather than querying it once, retries the view click once if the surface does not appear, and allows a larger wait budget (`VIEW_RESTORE_WAIT_MS`) for rendering a whole view than for locating a node inside an already-rendered tree. The saved `activeView` is derived from the rendered surface (`.today-dashboard`) rather than from the home tab's `active` class alone.

Reason: The flag previously flipped as soon as the final view click was dispatched. Three consequences followed. The autosave scheduled 250 ms later could capture a half-restored workspace. The snapshot read `activeView` from a CSS class React had not yet applied, so it could record `"patient"` while the Today dashboard was on screen — meaning a clinician who left the app on Today could return to a patient chart. And a click dispatched before the shell finished mounting was silently dropped by optional chaining, leaving the restored session on the wrong view with no error. These surfaced as intermittent browser-suite failures, but the failure mode is a clinician's restored session, not a test artifact.

Separately, `PUT /api/preferences` now preserves the server-owned `workspaceState` key rather than saving the client's object wholesale. Workspace restoration state is stored inside the same preference record but belongs to its own endpoint and its own writer, and under D-035 preferences save on every hide, collapse and density change — so a display-preferences write that did not happen to carry the restoration state back would silently discard the clinician's restored workspace. Relying on the client to round-trip server-owned state is not a boundary; the server now owns it.

A partial restore no longer strands the session either. Restoring charts, the sidebar or a companion panel can fail without the saved view being wrong, but `hydrate` caught the whole restore and swallowed it — leaving the clinician on whichever chart was mid-restore, with restoration reported complete and no error logged anywhere. The view restore is now a separate step (`restoreActiveView`) that also runs as the recovery path when an earlier stage throws, and both failure modes are reported to the console.

Constraints: This changes restoration timing, the accuracy of the saved snapshot, which writer owns restoration state, and recovery from a partial restore; no workspace state shape, preference, or clinical behaviour changes. `data-workspace-restored` is now a meaningful signal that the restored workspace is visible, and callers may rely on it. The larger budget applies only to the final view restore; intra-tree waits keep `PATIENT_WAIT_MS`. Browser fixtures must still reset both preferences and workspace state and verify the starting state they promise, because durable personalization means a test cannot assume the default layout.

## D-037 — DrFirst prescribing integration deferred; production infrastructure takes its place in the queue

Status: accepted (2026-09-10)

Decision: Logan is not obtaining DrFirst access at this time, so Phase 4 external prescribing is deferred by owner decision rather than merely gated on prerequisites. No further work should prepare, map, or stub a DrFirst interface until that changes. The development prescribing adapter continues to fail closed and must not simulate regulated network, EPCS, PDMP, pharmacy acknowledgement, medication-history, formulary, ePA, or SSO behaviour. Phase 2 production infrastructure — beginning with user provisioning and organization administration — moves ahead of it in the implementation queue.

Reason: D-028 recorded DrFirst as the selected prescribing vendor, and the roadmap has carried "prepare DrFirst integration from verified vendor requirements" as the active next step. That step cannot honestly proceed without a contracted product, sandbox credentials, and onboarding, and those are not being pursued now. Leaving it at the top of the queue would either stall the queue or invite speculative vendor-shaped code with nothing to verify it against. The internal prescribing architecture (intent, transaction ledger, callbacks, recovery, refill and change-request workflows) is already implemented and needs no vendor to remain correct.

Constraints: This defers sequencing, not the selection: D-028 stands as the recorded vendor choice should Logan pursue it later, and D-022 through D-026 keep their authority boundaries intact. Nothing here weakens the rule that vendor evidence never automatically changes medication truth, and no prescribing surface may represent connectivity, certification, or EPCS capability that does not exist. Reopening this requires contracted access first, then vendor-tested exchange per the Phase 4 exit gate — not a code change that assumes it.

## D-038 — Organization administration is confined to the administrator's own practice

Status: accepted (2026-09-10)

Decision: Provisioning users and changing memberships is a first-class, permission-gated, audited operation behind `manage_organization` (granted to `provider`), exposed at `GET/POST/PATCH /api/organization/members` and implemented in `OrganizationAdminService`. Every operation resolves the target through `administeredOrganization`, which honours a client-supplied `organizationId` **only when the actor holds an active membership in it**. A user is never created without a membership. Revoking or suspending a membership, and deactivating a user, also revoke that user's live sessions. An administrator cannot revoke or deactivate themselves. All four operations emit dedicated audit events attributed to the acting administrator.

Reason: D-033 made patient access enforceable but not operable — the only way to provision a clinician, widen their scope, or cut off their reach was a direct repository call, which is not something a practice can do. Phase 2 lists user provisioning and revocation as required before real PHI. The confinement rule is the part that carries the weight: without it, an administration endpoint would be a straightforward way to escalate out of the isolation D-033 established, since anyone able to name another organization could grant themselves membership in it.

Constraints: A client-supplied `organizationId` disambiguates between the actor's own memberships and is never a way to reach another practice; the tests prove that removing the check breaks them. Session revocation is deliberate rather than incidental — deactivation already fails the next request through the active-user check, but relying on that check being reached everywhere is weaker than ending the sessions, and an administrator revoking access means now. The self-revocation guard prevents an organization from being stranded with no administrator and no path back through the product. Granting `manage_organization` to every provider suits a small practice where the prescriber is the administrator; a dedicated administrator role is future work, not a speculative abstraction now. This adds no credential provisioning: `AuthService.configurePasswordCredential` remains a server-side primitive, and a provisioned user still has no password until that is called, so production login provisioning, password reset, SSO, and device controls remain open Phase 2 work.

## D-039 — An account's password belongs to its holder, never to the administrator

Status: accepted (2026-09-10)

Decision: A provisioned user obtains a credential by redeeming a single-use, expiring activation token that an administrator issues (`PATCH /api/organization/members` with `issueActivationToken`) and hands over out-of-band. The holder chooses their own username and password at the public `POST /api/auth/activate`. Administrators never set, see, or recover a password. Tokens are stored as a SHA-256 hash, superseded when reissued, reserved before the credential is written, and every activation failure returns one identical message. Activation establishes no session. A signed-in user changes their own password at `POST /api/auth/password`, which requires the current password and revokes all of that user's other sessions while keeping the acting one. Minimum password length is 12.

Reason: D-038 made it possible to provision a clinician, but a provisioned account had no username, no password, and no path to obtain either — the administration surface could create accounts nobody could use. The obvious shortcut, letting the administrator set an initial password, would leave them holding a working credential for another clinician's account, which is exactly what an audit trail attributing note signing, prescribing and result acknowledgement to a named person is meant to rule out. Separately, no user could change their own password at all.

Constraints: `/api/auth/activate` is deliberately unauthenticated, because the person redeeming has no credential yet; the token is the sole authorization, so it is single-use, expiring (72h), matched by hash so a leaked database row is not itself redeemable, and reserved before the credential write so one hand-off cannot set the password twice. Failure messages are uniform so an anonymous caller cannot distinguish an unknown token from an expired or spent one. Activation issuing a session would create a second, weaker route to one, so it does not. Password change requires the current password because a live session alone must not replace a credential — otherwise an unattended workstation is a permanent takeover — and it has no target parameter, so it can never reset someone else's. Other sessions are revoked because the reason for changing may be that someone else knew the old password. The issued token is returned once and is never written to the audit trail; only its issuance and expiry are. This adds no password reset for a locked-out user, no rate limiting on login or activation, no SSO, and no device inventory — all remain open Phase 2 work, and the 12-character minimum is a floor, not a reviewed production password policy.

## D-040 — Password guessing is rate limited per username, and an administrator can clear a lockout

Status: accepted (2026-09-10)

Decision: Failed password logins are counted durably in `auth_login_attempts`, keyed on the lowercased username attempted. Ten failures inside a one-hour window lock that username for fifteen minutes; a successful login clears the counter, and a stale run of failures starts over. A locked username is refused **before** the password is checked, and a lockout, a wrong password, and an unknown username all return the identical message. Attempts against usernames that do not exist are counted on the same budget. Lockouts and their clearing are audited. An administrator can clear a member's lockout through `PATCH /api/organization/members` with `clearLoginLockout`, confined to their own practice like every other administration action. The rule itself is pure logic in `app/lib/login-throttle-policy.ts`.

Reason: D-039 gave accounts real passwords, which made the login endpoint worth attacking; before this, it accepted unlimited guesses against a clinical system. Checking the lock before the password matters because otherwise a lockout can be worn down by continuing to guess. Counting non-existent usernames matters because otherwise username discovery is free while password guessing is limited, and an attacker would simply enumerate first.

Constraints: Keying on username is a deliberate trade-off with a known cost — someone who knows a clinician's username can lock that account. The alternative, no limit, is worse for a system holding clinical records, and the sting is removed by the administrator-clearing path so a locked-out clinician has a same-practice route back rather than waiting out the window mid-clinic. Source-address limiting is the missing second dimension: it requires a trusted proxy configuration before `x-forwarded-for` can be believed, so it is not attempted rather than implemented on a spoofable header. Uniform error messages mean a genuinely locked-out user is not told why; that is chosen over turning the endpoint into a username oracle, and it is why the administrator path exists. Attempted passwords never reach the audit trail. The activation endpoint is not throttled: its 32-byte random token is not brute-forceable, and a shared counter there would be a denial-of-service surface rather than a protection. This adds no password reset for a locked-out user who has also forgotten their password, no CAPTCHA, and no anomaly detection.

## D-041 — The database location is explicit in production, and recovery is proven rather than assumed

Status: accepted (2026-09-10)

Decision: The clinical database path comes from `EHR_DATABASE_PATH`. Development keeps the `data/ehr.db` default; production **requires** the variable and requires it to be absolute, refusing to start otherwise. Backups use SQLite's online `backup()` rather than a file copy, are verified immediately after being written, and refuse to overwrite an existing backup. Restore verifies the backup first, moves the current database aside instead of deleting it, and removes the stale `-wal`/`-shm` sidecars. Restore is exposed only through `scripts/database-backup.ts`, never through an HTTP route. `app/server/db/database-location.ts` holds the path rule as pure logic.

Reason: Phase 2's exit gate names a production database path and demonstrated restore/recovery. `getDatabase()` previously resolved `process.cwd()/data/ehr.db`, so on a deployment the clinical record store moves — or is created empty and silently seeded — whenever the service is restarted from a different directory. And a plain file copy of a WAL-mode database can capture a main file whose recent commits are still in the write-ahead log; a backup that restores to a silently older state is worse than no backup, because nobody discovers it until they need it. The tests write a real clinical fact, back up, delete it, restore, and assert the fact returns — a backup nobody has restored is a hypothesis.

Constraints: Restore replaces every clinical record in the system, so it is an operator action taken with the service stopped, not something reachable from a logged-in session — there is deliberately no route, no permission, and no UI for it. Refusing to overwrite an existing backup avoids a failed copy leaving neither the old nor the new one intact. Displacing rather than deleting the current database makes restoring the wrong backup itself recoverable. This adds no backup scheduling, no offsite or encrypted backup storage, no retention policy, and no restore rehearsal cadence; those are operational commitments rather than code, and the Phase 2 exit gate still requires them. The database remains SQLite: choosing a different production engine is a separate decision this does not pre-empt.

## D-042 — The authenticated roster is the only runtime patient truth

Status: accepted (2026-09-10)

Decision: Every live surface resolves patients through `app/lib/patient-roster.ts`, a single client-side store fed by `GET /api/patients`. Tabs, omnibox search, detached windows, the order composer, the global inbox and task queues, Clinical AI's cross-patient answers, workspace restoration, and DOM-level navigation all read that one store; `usePatientRoster()` subscribes React surfaces and `rosterPatients()` serves code that cannot await. Concurrent callers share one request, the cache is cleared on sign-out, and a response that arrives after sign-out or a newer request is discarded. A failed load is an empty, explicitly failed roster. The synthetic `patients` array in `app/domain/patient.ts` is frozen seed/fixture data, imported at runtime only by `app/server/db/seed.ts`; a test enforces that. Saved workspaces are filtered through the roster on restore, and with nothing reachable the workspace opens on Today rather than inventing a patient.

Reason: The shell carried two patient truths. The backend already narrowed the roster to the caller's organization and assignment scope (D-033, D-038), but `PatientWorkspace`, `GlobalWorkspaceShell`, `WorkspaceStateManager`, the navigation helpers and Clinical AI all resolved patients from the array compiled into the bundle, so the UI could open, name, search for and label charts the server would then refuse to answer for — and a reload could reconstruct a different chart state than the record holds. Encounter signing wrote a visit date straight onto a fixture object, creating a chart fact that existed only in one browser tab. Nothing about the access boundary was observable in the product while the client had its own roster.

Constraints: A failed roster read must never fall back to the fixtures — an empty roster is the honest answer, and the seed array is frozen so a runtime write fails loudly instead of forking the record. Every entry into a chart passes a reachability check, so a schedule row, a queue link, a saved tab or a voice command cannot open a patient outside the roster. Cross-patient AI answers may only name a chart inside the roster they were given. This replaces the client's patient list only: appointments, schedule fixtures, tasks and message seeds remain as they were, and the roster is a read-through cache with no offline or optimistic behaviour — a mutation that changes the chart re-reads it rather than editing it in place.

## D-043 — One interaction grammar, extracted from measured repetition

Status: accepted (2026-09-11)

Decision: Shared UI primitives live in `app/components/ui/` (`Button`, `AsyncSection` with `EmptyState`/`LoadingState`/`InlineError`, `SaveStateIndicator`, `StatusBadge`) over pure rules in `app/lib/ui-system.ts`, styled by `app/ui-system.css` from the existing tokens. Four behaviours are settled there rather than per call site: an action in flight keeps focus and reports `aria-busy` instead of being natively disabled; a `disabled` control must supply a `disabledReason`, enforced by the prop types; a failed load renders as an error with a retry and never as an empty result; and "saved" is only claimed once the server confirmed it. The `--radius-*` scale is `4/8/12/16/pill`, matching what the product draws. A new primitive is extracted only from repetition already present in at least three surfaces. `docs/UI_SYSTEM.md` records the inventory, what each primitive guarantees, and which surfaces are converted.

Reason: The token pass gave the product a palette but nothing shared consumed it, so surfaces kept growing their own controls: 207 button rules across 151 distinct visual signatures, a radius scale defined but used zero times while 459 rules hard-coded a pixel radius, and `#ffffff` written out 223 times. The same `loading → empty → rows` chain was hand-written in eight surfaces, usually with no error branch — so a practice queue that failed to load displayed "No documents match these filters", which a clinician reads as "nothing to review" rather than "this did not load". That is a clinical-safety difference, not a styling one, which is why the error branch is not optional in the shared lifecycle.

Constraints: This is extraction, not a component library — the variants are the ones already in the stylesheets, named rather than invented, and nothing here models a control the product does not have. Converted so far: the four practice queues, prescribing operations, patient Labs, and the encounter toolbar's save indicator; the shell, Today, Schedule and the patient sections are not converted and still carry their own controls, which is recorded rather than hidden. Requiring `disabledReason` is deliberately load-bearing: it makes an unexplained dead control a type error. Keeping a busy control focusable trades the browser's own re-entry guard for an explicit click guard, which the tests cover. Removing `.status-draft-pill`/`.status-locked-pill` changed the encounter toolbar's markup, so the browser assertion moved to what the clinician reads; `data-save-status` now has exactly one owner in the tree and the toolbar's own record state is `data-record-state`.

## D-044 — The administrative record is normalized, and age is derived

Status: accepted (2026-09-11)

Decision: Patient identity and contact are first-class columns on `patients` (preferred name, sex at birth, gender identity, preferred language, time zone, record status, deceased date, phones, email, address, preferred contact method, per-channel permissions), projected as `identity` and `contact` on `PatientRecord`. Related people and the outside care network are their own tables (`patient_related_people`, `patient_care_network`), each row carrying its own disclosure scope and retired by status rather than deleted. Coverage gains subscriber DOB, priority, coverage type and self-pay. Writes go through `ClinicalActionGateway` as `add/update_related_person` and `add/update_care_network_member`, patient-bound by row lookup and audited — a disclosure-scope change records both the old and new scope. MRN uniqueness and a minimum identity (legal name, date of birth, MRN) are enforced at the service. The stored `age` column is dropped: date of birth is the fact and age is derived at projection time. `PatientInformationDrawer` is the one editor, opening beside the chart.

Reason: P2's gate is that a practice can maintain the administrative record without touching the database, and none of it existed — the `patients` table had no phone, email, address or preferred name, and no table held guardians or emergency contacts. Adolescent psychiatry makes the relational part unavoidable: a chart routinely carries two guardians, a legal representative and a school counsellor, and each needs a different answer to "what may this person be told". Encoding that as patient columns would have capped it at whatever set was guessed first. Age was worse than incomplete: as a stored column it was wrong for every patient between their birthday and the next unrelated write to the row.

Constraints: Contact permission is tri-state — 1 yes, 0 no, NULL nobody asked — because leaving a voicemail about psychiatric care is a disclosure and "not asked" must not read as consent or refusal; `mayContactBy` treats unknown as do-not-use at the point of contact while the record keeps it visible as unknown. A withdrawn authorisation is retired, never deleted: who could be told what, and when that changed, is part of the record. Identity and contact merge field by field on update, so a form that edits one section cannot blank the other by omitting it. Dropping `age` is guarded — an older SQLite that cannot drop a column keeps it, and nothing reads it either way — and nine tests that built patient rows with raw SQL were updated to match the schema. Eligibility verification, insurance-card capture and a coverage editor are not in this change; P2-E/F remain partly done, and the drawer covers identity, contact, related people and care network only.

## D-045 — Billing order and prescribing destination are recorded choices, not orderings

Status: accepted (2026-09-11)

Decision: Coverage carries an explicit `coverage_priority` (1 primary, 2 secondary), `coverage_type`, `subscriber_dob` and an `is_self_pay` flag; `primaryCoverage` reads the priority rather than insert order and ignores anything not active. Terminating a policy sets its status and termination date and leaves it on the record. Self-pay is a coverage row of its own rather than the absence of one. A patient's pharmacies carry an explicit link priority, `preferredPharmacy` reads it, and promoting an alternate demotes the incumbent in the same action so a chart never holds two prescribing destinations. NCPDP remains an attribute, never the pharmacy's primary key. Both are editable from `PatientInformationDrawer`.

Reason: The schema for coverage and pharmacies existed but nothing read or wrote the parts that decide behaviour, so both effectively defaulted to insert order. Which policy is billed first is a denial when it is wrong, and which pharmacy is preferred is where a controlled substance is sent — neither is a detail that should fall out of the order rows happened to be created in. Self-pay mattered separately: an empty coverage list was being asked to mean both "this patient pays privately" and "nobody has entered insurance yet", which are opposite instructions to a front office.

Constraints: A terminated policy stays readable because a claim filed against it last month has to be reconstructable; the list therefore accumulates by design, and the browser tests establish their own preconditions rather than assuming an empty chart. Promotion writes both links rather than relying on a sentinel priority, so the demotion is explicit in the audit trail. This adds no eligibility verification and no insurance-card capture — those belong to the revenue-cycle phase — and no pharmacy directory lookup, so a pharmacy is typed in rather than chosen from NCPDP.

## D-046 — A first install is a tested path

Status: accepted (2026-09-11)

Decision: `tests/patient-administration.test.ts` runs the schema, every migration and the seed against a directory nothing has touched, then asserts the roster loaded, that `patients` has no `age` column, that the administrative columns exist, and that each seeded patient's age matches what is derived from their date of birth. The base schema in `schema.ts` no longer declares `age`, so the migration's drop only repairs existing databases.

Reason: D-044 removed the stored `age` column but `seed.ts` kept its own raw INSERT naming it, so a brand-new database failed to seed and sign-in returned 400. Every existing test passed, because they all ran against a database that already had rows — the seed path only executes when the database is empty, which is exactly the situation nobody was testing. A defect that only appears on a first install is the worst kind to ship.

Constraints: The test asserts the shape a fresh install produces rather than pinning specific fixture content, so seeding synthetic patients can change without breaking it. It does not cover migrating a populated legacy database forward; that path is exercised by the other suites, which run against databases the migrations have already touched.

## D-047 — A destination is offered only when it works

Status: accepted (2026-09-11)

Decision: `WorkspaceTool` carries an optional `status: "available" | "planned"`. Planned destinations stay in the registry so the intent is recorded and a stale id still resolves, but they are excluded from the launcher (`AVAILABLE_WORKSPACE_TOOLS`), excluded from the default rails, and stripped from a saved rail by `pinnedTools`. Billing and Reports are the current planned pair. Reaching one through a stale link renders a screen that says the destination is not built and that nothing on it works, with no claim of progress. `tests/navigation-hygiene.test.ts` enforces all of it.

Reason: Both tiles sat in the launcher opening a page that described what the screen would someday do and then announced "Workspace shell is active — this destination now opens as a real application workspace". That is a placeholder dressed as progress: a clinician who clicked Billing to check a claim spent the click learning the product cannot do it, having been told by the tile that it could. P1-E's requirement is that every visible launcher tool either opens a meaningful working surface or is not exposed by default, and an explanation of future functionality is not a working surface.

Constraints: The ids stay routable rather than deleted, because saved workspaces and navigation history already reference them and a missing route is a worse failure than an honest empty one. The not-built screen still names what the destination will cover — that is orientation, not a progress claim, and it is phrased as "nothing here works" first. Withholding is per-tool rather than a global development flag, so a destination is promoted by giving it a surface and removing one word, and cannot be promoted by accident. This does not decide when billing gets built; P9 owns that.

## D-048 — Schedule-first personal dashboards over shared team work

Status: accepted direction (2026-09-14); implementation pending the DB gates in ROADMAP.md section 21.

Decision: Implement DASH-01 through DASH-12 in PRODUCT_VISION.md. Roster-first schedule is
the main dashboard surface, with optional timeline and independently configurable
clinical/operational windows. Arrivals and waiting-room blocks are opt-in. Start with
PMHNP/prescriber, practice manager/billing, and owner personas; owner starts clinically
with optional business windows. Autosave the working layout and separately save named
presets. Adaptation is explicitly opt-in and cannot unexpectedly reconfigure focused
work. Visit selection opens specific visit information; patient-name selection opens
the longitudinal chart, both through the existing patient workspace.

Reason: Logan wants a full practice picture without a compulsory crowded dashboard.
Repeated UI directions should converge through a visual prototype and measurable
workflows, while preserving the existing clinical architecture.

Constraints: This refines D-009's initial single-clinician emphasis to a small psychiatric
team and elaborates D-012/D-035/D-036; it does not replace the window system or create a
new patient store. Owner/manager membership and copy-on-adopt practice templates already
exist in organization/workspace-template services. Reuse them. Clinical permissions,
organization/patient scope, workspace persona and personal layout are distinct. Owner
does not automatically mean prescriber, and a preset cannot grant authority. Any change
to provider-wide administration grants in D-038 needs explicit least-privilege migration,
last-owner protection and regression tests, not an indiscriminate role rewrite.

Clinical data, appointments, assignments and handoffs remain authoritative shared records;
presence is ephemeral advisory activity. Preferences contain layout/configuration, not
patient facts, notes, authorization or shared task state. Hiding a window does not resolve
its work; retain compact discoverability and policy-governed action-time safety checks.
No guessed medical-alert thresholds, diagnostic codes, vendor interfaces or successful
external transport. D-037 still defers DrFirst connectivity.

Sequencing: validate the WIP baseline first; create and review a clickable dashboard
prototype; then build the DB sequence in coherent tested slices. Retain P3–P12 and the
reference-layer backlog with explicit dependency mappings. Major hosted-model expansion
remains outside this dashboard priority. This documentation decision authorizes no PHI,
live prescribing, production deployment or claim submission.

## D-049 — A visit is an appointment, and a clinic day is the practice's own day

Status: accepted (2026-09-13); implemented at `986a37d`, migration `2026-09-14-001`.

Decision: An encounter records the appointment it was started from, in
`encounters.appointment_id`. The column is nullable, is never backfilled, and is never
inferred from same-day proximity, patient identity or open status. It is set once, by
the workflow that starts the visit, and the server refuses a link to an appointment
that does not exist or that belongs to a different patient. Signing a note completes
the appointment it names and no other; an encounter with no recorded appointment
completes nothing.

Separately: "today" on the schedule is the current date in the practice's configured
timezone (`app/lib/practice-calendar.ts`, America/Phoenix for Logan's practice), not a
constant. The synthetic seed days are written against one anchor date and shifted onto
the calendar when a database is first seeded, so a demo practice opens on a real clinic
day; seeding runs only on an empty appointments table, so no recorded appointment ever
moves.

Reason: appointment completion was matched on patient id in one place and on "the first
appointment still open" in another. Both are guesses. A patient with a morning and an
afternoon visit had the morning one closed by the afternoon's note, and a chart opened
outside the schedule closed whatever happened to be next. Which visit a note belongs to
is a fact the record has to carry, for the same reason `orders.encounter_id` exists
(D-046 era work, §20 RL-C): an inferred association is worse than an absent one,
because nothing downstream can tell it was inferred. The fixed demo date had the same
shape — it made every appointment booked after one Friday invisible on the only view
that opens by default.

Constraints: this does not make signing transactional. D-017 stands: note signing,
order authorization and transmission remain independent authoritative actions, and a
refused appointment transition never unwinds a signed note — it is reported instead.
The link travels through `app/lib/active-visit.ts`, which is a handover between two
surfaces in one browser and not clinical state; the column is the record. Per-organization
scheduling timezone belongs on the organization record and is not implemented; a second
hard-coded copy of the constant would be the regression. D-015's walk-in-before-chart
path remains unimplemented server-side, and the booking form now requires an existing
patient rather than fabricating an id for one.

## D-050 — A design preview is a repository route with no chrome and no records

Status: accepted (2026-09-13); implemented at `3cfbeac` for DB-1.

Decision: Visual prototypes that need owner review live at `/preview/*` inside this
repository, behind the ordinary sign-in, and are built from three rules:

1. **They read no record and write none.** A preview renders from an imported fixture
   module and issues no request. This is a structural guarantee, not a convention: the
   page has no client to reach the API with.
2. **They do not wear the live workspace chrome.** `app/components/AppChrome.tsx` owns
   the rails, window managers and workspace restoration, and withholds all of it on a
   preview path. Ordinary routes are unchanged.
3. **They say what they are, on screen.** A preview carries a banner naming it a
   preview and stating that nothing on it touches the database, and any sample money
   is marked "Demo" on both the container and each figure.

A preview is deleted or promoted after its review. It never becomes a second
implementation of a surface the product already has, and it is never the place a
clinical decision is recorded.

Reason: DASH-12 requires a clickable prototype rather than prose, and the cheapest
ways to get one are both wrong. A throwaway outside the repository cannot reuse the
primitives, so it reviews a design the product cannot actually build; a prototype
wired to the real API is a second, untested write path into the schedule. The chrome
rule is not cosmetic either: mounted on a preview page, `WorkspaceStateManager` hunts
for patient tabs that are not there, and the rail sits over the prototype — and a
prototype that looks like the live workspace is one screenshot away from being
mistaken for it.

Constraints: a preview is not evidence that anything is implemented, and approval of
one is approval of a design, not of clinical correctness or production readiness. A
preview may not be promoted to the default surface without the owner review its slice
names. State kept inside a preview is session-scoped and must say so; it is not the
durable preference record (DASH-08, DB-5) and must never claim to be. `AppChrome`
changes where the chrome is constructed, not what it does — the suppression predicate
is `isPreviewRoute`, tested in `tests/dashboard-preview-model.test.ts`, and a near-miss
path such as `/previews` is not a preview.

## D-051 — Server-derived authority, persona separation, and capability-scoped access

Status: accepted (2026-09-14); implemented for DB-2.

Decision: The EHR decouples client-facing personas from server authorization, separates clinical from administrative authority, migrates organization administration to explicit governance roles, and applies capability-scoped field stripping:

1. **Persona vs. Permission decoupling:** UI personas (`pmhnp`, `owner`, `manager`, `biller`) select visual layout defaults and presets only. All authorization is derived strictly server-side from authoritative database records (user role and active organization membership). Client-supplied headers (e.g. `x-ehr-persona`) or body fields can never escalate privileges.
2. **Separation of clinical and administrative authority:** Non-clinical owners and managers never gain clinical note-signing (`sign_encounter`) or prescription authorization/transmission (`authorize_order`, `transmit_order`) permissions by virtue of business standing. Clinical authority remains bound to clinical credentials and roles (`provider`).
3. **Migration of D-038 provider administration grant:** `manage_organization` is removed from the static `provider` role and derived dynamically from `membership_role IN ('owner', 'manager')` within the active organization. Last-owner protections (preventing demotion, revocation, deactivation, or self-demotion that leaves an organization without an active owner) remain inviolable.
4. **Capability-scoped filtering and field stripping:** Added bounded capabilities (`read_schedule`, `view_financial`, `manage_templates`). When non-clinical callers (e.g., billing or administrative staff with `read_schedule` but lacking `read_clinical`) access `GET /api/appointments`, clinical narrative text (`chiefComplaint`) is stripped server-side before the response leaves the server. Practice queues (`/api/practice-queues`) fail closed with 403 for non-clinical callers.
5. **Immediate session invalidation:** Revocation or deactivation of an organization membership invalidates active sessions immediately, preventing stale open tabs from executing further operations.

Reason: ROADMAP DB-2 and safety principles require that business responsibility does not confer clinical authority, and clinical credentials do not automatically grant governance of shared practice templates and memberships. Relying on client-selected personas or hidden UI buttons is unsafe; all boundaries must fail closed on the server with full permission and patient access validation.

Constraints: This decision maintains backward compatibility for solo practitioner accounts (where a provider is also an owner) by seeding default accounts with `membership_role: "owner"`. It does not create speculative fine-grained permission models; bounded capabilities are added only for demonstrated workflow gaps (`read_schedule`, `view_financial`, `manage_templates`).

## D-052 — Bounded dashboard module registry, pure layout state, and unified dashboard shell

Status: accepted (2026-09-14); implemented for DB-3.

Decision: The live practice dashboard is governed by a bounded module registry, pure presentation state separation, and a shared accessible window frame:

1. **Bounded module registry contract (`DASHBOARD_MODULE_REGISTRY`):**
   - Six available core modules are registered: `schedule`, `queue`, `team`, `briefing`, `metrics`, and `shortcuts`.
   - Planned modules without working backends (`billing`, `reports`) are marked `status: "planned"` and withheld from the runtime catalog. They cannot be placed on the canvas or presented with fictional zero metrics.
   - Today's Schedule is strictly permanent (`permanent: true`, span: `full`); it acts as the primary visual anchor and cannot be hidden or removed from the workspace.
2. **Pure presentation state model:**
   - Presentation layout state (`DashboardLayoutState`) stores strictly module identity and visual geometry: `{ id, visible, collapsed, span, settings }`.
   - Zero patient facts, names, notes, diagnoses, or MRNs are stored in layout state or serialized preferences.
   - All clinical and operational data is fetched authoritatively at runtime by the respective domain components (`usePracticeSchedule()`, `practiceQueueApi`, `teamApi.snapshot()`).
3. **Shared accessible window chrome (`DashboardWindowFrame`):**
   - Standard window frame providing title, icon, move up/down reordering (accessible via keyboard and buttons), span toggle (half vs. full column), collapse/expand, full-screen focus/restore, and hiding (with visible restore path).
   - Full-screen focus mode isolates any single module to occupy the full viewport while preserving background layout state upon exit.
   - Every hidden window remains discoverable and restorable via both `HiddenSectionsBar` and the "Add Window" popover.
4. **Authoritative team collaboration and practice queue windows:**
   - `TeamDashboardWindow` connects directly to `teamApi.snapshot()` to render clinical presence, active patient encounters, and shared handoff tasks with real completion toggling.
   - `QueueDashboardWindow` connects directly to `practiceQueueApi.unsigned()` and `practiceQueueApi.labs()` for actionable review.
5. **Capability-scoped module catalog:**
   - Modules are gated by clinical permissions (`read_schedule`, `read_clinical`, `manage_tasks`, `collaborate_team`). Modules requiring unavailable capabilities are withheld from the catalog rather than rendered in disabled or broken states.

Reason: Fulfills roadmap DB-3 requirements for a configurable, modular dashboard shell where clinicians can tailor their cockpit density without fracturing the clinical state boundary or losing access to the central schedule.

Constraints: Presentation settings schemas are versioned and sanitize arbitrary input, rejecting unknown keys, non-serializable objects, and HTML tags. Floating windows reuse existing bounded window mechanics without creating unmanaged OS windows.

## D-053 — Distinct visit and chart targets, configurable roster registry, and operational cancellation

Status: accepted (2026-09-14); implemented for DB-4.

Decision: The appointment roster enforces distinct click targets per row, explicit encounter binding, capability-scoped column configuration, live collision detection, and operational cancellation:

1. **Distinct targets per row:**
   - The patient name target opens the longitudinal patient chart directly in the clinician's workspace without opening the visit drawer or altering appointment state.
   - The visit target (clock time button, visit badge, info button) opens the slide-over `VisitDetailDrawer` for pure inspection.
   - Drawer inspection triggers 0 database mutations, changes no statuses, and stages no encounter drafts.
2. **Explicit start/resume encounter binding:**
   - Starting or resuming an encounter is an explicit permitted action (`noteVisitStartedFromSchedule`) that binds `patientId`, `patientName`, and `appointmentId`.
   - Returning from the encounter preserves the schedule date, active filter tab, and scroll position.
3. **Configurable roster field registry (`app/domain/roster-fields.ts`):**
   - 14 registered columns: `time`, `photo`, `patientName`, `visitType`, `modality`, `status`, `room`, `provider`, `assignment`, `reason`, `intake`, `alerts`, `mrn`, `coverage`.
   - Anchors `time` and `patientName` are permanent anchors and cannot be hidden.
   - Capability-scoped filtering: columns with clinical or financial requirements (`reason` and `intake` requiring `read_clinical`, `coverage` requiring `view_financial`) are automatically stripped on the server for non-clinical callers and excluded from client selection.
   - User selections persist to personal preferences (`today.rosterFields`).
4. **Context-sensitive row action menu & operational workflows:**
   - Permissions gate row actions: `manage_appointments` is strictly required to check in, edit, cancel, or mark no-show.
   - Dedicated "Cancelled" filter tab allows auditing cancellations without cluttering active patient flow.
5. **Interactive appointment editing with live collision warning (`AppointmentEditModal`):**
   - Allows editing time, duration, room, modality, provider, staff assignment, and chief complaint.
   - Real-time interval intersection (`checkAppointmentOverlap`) alerts the user to double-booking collisions by provider or room, allowing clinical overrides when necessary.
6. **Operational cancellation workflow:**
   - Cancellation uses standardized non-clinical reasons (`CANCELLATION_REASONS`) and notes.
   - HIPAA audit logging logs first-class `appointment_cancelled` and `appointment_updated` events with actor, patient, and operational reason provenance.

## D-054 — Autosaved personal state, named preset independence, copy-on-adopt templates, and optimistic concurrency

Status: accepted (2026-09-14); implemented for DB-5.

Decision: Workspace layout customization is governed by debounced autosave, strict preset immutability, isolated template adoption, optimistic concurrency, and viewport adaptation:

1. **Debounced autosave with visual feedback:**
   - Working dashboard layout mutations are debounced by 600ms before persisting to the server and localStorage.
   - Visual status badge (`AutosaveStatusBadge`) provides continuous feedback: `saving` (spinner), `saved` (check with timestamp), `error` (warning with explicit retry action), and `conflict` (concurrency warning with resolution modal).
2. **Named preset independence and overwrite protection:**
   - Autosaving working layout state never silently mutates or overwrites saved named presets or built-in presets.
   - Working modifications flag `isPresetModified: true` and surface a distinct `"Modified from [Preset Name]"` indicator with one-click "Revert" and "Save as Preset..." actions.
   - Built-in presets (`standard`, `cockpit`, `minimal`) are immutable anchors; they cannot be overwritten, renamed, or deleted.
   - Overwriting custom named presets requires explicit clinician confirmation via modal dialog.
3. **Copy-on-adopt practice templates:**
   - Organization/practice templates are copied into personal preferences upon adoption (`adoptPracticeTemplate`), generating an independent personal named preset (`isPracticeTemplate: true`).
   - Subsequent modification or deletion of practice templates by practice owners or managers never mutates or deletes adopted personal layouts.
4. **Optimistic concurrency and revision tracking:**
   - `provider_preferences` schema and database records maintain a monotonically increasing `revision: number`.
   - Conditional updates verify `expectedRevision`. Concurrent conflicting writes trigger HTTP 409 Conflict returning current server preferences and revision.
   - Clinicians can choose to reload from the server or overwrite with their current working layout.
5. **Responsive viewport adaptation:**
   - Responsive layout collapsing (`adaptLayoutToViewport`) collapses half-span modules into full-span modules on viewports under 768px without horizontal overflow.
   - Viewport collapsing is responsive and presentation-only; it preserves the clinician's underlying multi-column preferences.
6. **Core clinical state protection:**
   - Preference persistence routes strictly isolate display layout from `workspaceState` (patient chart tabs and coordinates) and clinical encounter drafts.

Reason: Fulfills roadmap §21 DB-5 requirements for clinician-owned layouts that survive reloads, prevent accidental preset corruption, gracefully handle multi-session conflicts, and adapt across display form factors.

Constraints: Autosave debouncing applies to layout geometry and display preferences only; clinical notes, orders, and appointment scheduling remain explicit actions requiring authorized user submission.

## D-055 — Shared live scheduling, versioned concurrency, mutual-agreement visit handoffs, and ephemeral presence

Status: accepted (2026-09-14); implemented for DB-6.

Decision: Team scheduling, operational assignments, visit handoffs, and live presence across concurrent clinical sessions are governed by versioned optimistic concurrency, mutual agreement, strict boundary isolation from longitudinal chart access, and ephemeral presence:

1. **Versioned authoritative updates with concurrency rejection:**
   - The `appointments` table and domain model track a monotonically increasing `version: number`.
   - Creation initializes `version = 1`. Updates (`update`, `updateStatus`, `cancel`) increment `version = existing.version + 1`.
   - Stale writes specifying `expectedVersion` mismatched with the database version throw `AppointmentConcurrencyError` and reject via `HTTP 409 Conflict` returning current server state and `serverVersion`.

2. **Strict separation of workflow assignment from chart access:**
   - Assigning a room, staff member, or provider to an appointment, or accepting a visit handoff, is an operational schedule coordination property and **never** inserts care-team relationships (`team_member_patients`) or grants longitudinal chart permissions.
   - Longitudinal chart access boundaries remain strictly rooted in organization membership and explicit care-team relationships.

3. **Mutual agreement visit handoffs:**
   - Transferring clinical or operational responsibility for a visit requires mutual consent (`appointment_handoffs` table with statuses: `pending`, `accepted`, `declined`, `cancelled`).
   - Merely viewing an appointment or opening a note **never silently accepts responsibility**.
   - The intended recipient must explicitly accept the handoff to update appointment assignments.
   - Declining requires a documented operational reason; responsibility remains with the initiating sender.
   - Initiators can cancel pending handoffs before acceptance.

4. **Ephemeral presence tracking:**
   - In-memory ephemeral presence tracker (`PresenceTracker`) records heartbeats (`< 30s` online, `30s–90s` away, `> 90s` offline).
   - Explicit away/offline statuses are respected immediately.
   - Periodic presence heartbeats do **not** write SQLite rows or generate permanent HIPAA audit log bloat.

5. **Live polling transport & client sync hygiene:**
   - Live schedule refresh uses authenticated background polling (10s active window, 30s background/idle window).
   - Window focus (`focus`) and network reconnect (`online`) trigger immediate re-fetch.
   - Sequence ID tracking discards out-of-order responses so stale responses never clobber fresh data.
   - Honest, persistent UI indicator (`LiveSyncIndicator`) displaying sync state ("Live · Synced just now", "Syncing...", "Stale · Synced Xm ago", "Offline", "Sync failed") and honest polling disclaimer: *"Live updates poll every 10s · Not instantaneous"*.
   - Schedule subscriptions immediately halt on logout or 401 unauthenticated response.

6. **Layout and preset isolation across clinical sessions:**
   - Multi-session schedule mutations and handoffs strictly preserve independent personal provider preferences, active presets, and workspace window layouts without cross-session pollution.

Reason: Fulfills roadmap §21 DB-6 requirements for multi-user shared scheduling, preventing accidental overwrite collisions, ensuring explicit responsibility transfer, and keeping personal layouts isolated.

## D-056 — Optional source-backed dashboard windows, closed-loop work queues, and truthful declared deferrals

Status: accepted (2026-09-14); implemented for DB-7.

Decision: Optional dashboard windows (`arrivals`, `visit-prep`) and the practice outstanding work queue (`queue`) are governed by source-workflow authority, truthful clinical facts and explicit unknowns, closed-loop actionability, and declared deferrals:

1. **Source-backed authority (no duplicate state stores):**
   - Dashboard windows are views over authoritative workflow records (`appointments`, `encounters`, `observations`, `prescription_refill_requests`, `appointment_handoffs`), never independent shadow databases.
   - Resolving an item (e.g. signing a note, approving a refill, acknowledging a lab, accepting a handoff) updates the authoritative source record and immediately reflects across all practice queues.

2. **Arrivals & Waiting Room truthfulness (`arrivals`):**
   - The waiting room window filters solely from appointments with `status === 'waiting' | 'in-visit'`.
   - Confirmed, upcoming, completed, and cancelled visits are strictly excluded.
   - When no patients have checked in or are currently in visit, the window displays a truthful empty state (*"No patients currently waiting in office"*). Physical arrivals are never fabricated.
   - Elapsed wait time is derived directly from scheduled arrival. Closed-loop action "Call In / Start Visit" atomically moves status to `in-visit` and launches the visit encounter.

3. **Visit Preparation verified clinical facts and explicit unknowns (`visit-prep`):**
   - Visit preparation cards summarize today's scheduled visits with verified facts from authoritative domain stores: last recorded visit date, active diagnoses count and top 3 diagnoses, active medication count, latest recorded vitals (BP, HR, WT, recorded date), unacknowledged labs count, and unsigned encounter drafts.
   - Explicit unknowns are truthfully surfaced when data is missing: *"First recorded visit"*, *"No active diagnoses"*, *"No active medications"*, and *"No recorded vitals"*.
   - Never fabricates or synthesizes surrogate values (e.g. fake 120/80 mmHg or 72 bpm); does not mandate an LLM call to display structured chart readiness facts.

4. **Multi-category closed-loop practice queue (`queue`):**
   - The outstanding work queue provides multi-category filtering (`All`, `Notes`, `Labs`, `Refills`, `Handoffs`) with category badges and distinct status glyphs.
   - Closed-loop clinical actions navigate directly to the authoritative task context:
     - Unsigned note -> opens chart to Encounter
     - Lab alert -> opens chart to Labs
     - Refill request -> opens chart to Medications
     - Care handoff -> opens interactive `VisitHandoffModal` for the appointment.

5. **Population scope enforcement:**
   - All practice queue queries (`unsignedEncounters`, `labs`, `documents`, `refillRequests`, `pendingHandoffs`, `visitPrepSummaries`, `queueCounts`) filter across `accessiblePatientIds(actor)`. Clinicians with restricted patient population access cannot see out-of-scope patient rows.

6. **Declared deferrals for downstream phases:**
   - P7/P9-dependent modules (`billing`, `reports`, `intake`) are registered in `DASHBOARD_MODULES` with `status: "planned"` and explicit `unavailableReason` documentation.
   - The UI does not render fake mock interfaces or fabricated revenue balances.

Reason: Fulfills roadmap §21 DB-7 requirements for source-backed dashboard windows, closed-loop practice workflows, strict clinical truthfulness, and honest declared deferrals.

## D-057 — Explicit adaptive layouts, clinical focus protection, and bounded inspectable triggers

Status: accepted (2026-09-14); implemented for DB-8.

Decision: Workspace layout adaptation responding to clinic schedule and workload is governed by opt-in control, deterministic inspectability, clinical focus protection, hysteresis stability, and prior layout recovery:

1. **Strictly opt-in (OFF by default):**
   - Adaptive mode is disabled by default (`adaptiveLayout.enabled: false`).
   - Workload shifts, clock progression, and queue volume never alter working layouts, density, or window spans without explicit clinician activation.
   - Built-in presets (`builtInPresets`) and saved named presets (`namedPresets`) remain completely immutable throughout adaptation.

2. **Bounded, inspectable rule vocabulary (zero opaque heuristics):**
   - Triggers are strictly deterministic and inspectable:
     - `time_window`: Clock range in practice timezone (e.g. `07:00–09:00` for Morning Prep, `09:00–16:00` for Clinic Flow, `16:00–19:00` for Documentation Wrap-up).
     - `waiting_threshold`: Authoritative count of patients currently waiting in the office (`status === 'waiting'`).
     - `urgent_queue_threshold`: Count of unreviewed critical queue items (unacknowledged labs, unsigned drafts, refill requests).
   - Rules specify explicit density modes, window visibility overrides, and pinned widgets that cannot be collapsed during the adaptation.
   - Zero machine learning heuristics, arbitrary scripts, or unreviewed automatic rules.

3. **Clinical focus & active interaction protection (zero surprise disruption):**
   - Adaptation **never** moves focused inputs, steals keyboard focus, dismisses open dialogs/drawers, changes patient/encounter bindings, or hides active draft notes.
   - If a rule triggers while the clinician is typing (`input`, `textarea`, `select`, `contenteditable`) or has an active dialog/drawer open, the layout transition is **deferred**.
   - A non-blocking notification pill appears (*"Adaptation deferred: '[Rule Name]' will apply after you finish typing"*), offering immediate `[Apply Now]` or `[Dismiss]` controls.
   - Once focus blurs and dialogs close, the deferred transition safely applies.

4. **Hysteresis & oscillation defense:**
   - Evaluates a cooldown window (minimum 15s) and stability checks to prevent rapid layout churn or oscillation around threshold boundaries (e.g. waiting count fluctuating 1 -> 2 -> 1).
   - Repeat evaluations of an already-active rule perform zero UI writes or state churn.

5. **Pause, Restore Prior Layout, and Presets independence:**
   - Clinicians can pause adaptation at any time (`paused: true`), freezing the current layout.
   - When an adaptation triggers, a pre-adaptation snapshot (`priorLayoutSnapshot`) is captured.
   - The clinician can click **"Restore Prior Layout"** at any time to immediately recover their baseline arrangement.
   - Rules with `returnBehavior: "restore_prior"` automatically restore the prior layout once trigger conditions cease.
   - Adapting and restoring layouts changes only display presentation and **never causes clinical record mutations**.

Reason: Fulfills roadmap §21 DB-8 and canonical vision DASH-09 for explicit adaptive layouts, ensuring dynamic workspace density without cognitive disruption or surprise rearrangement.

## D-058 — Dashboard acceptance gate, controlled default switch, and privacy display mode

Status: accepted (2026-09-14); implemented for DB-9.

Decision: The completion of the dashboard-first pre-AI milestone (Slice DB-9) establishes the 15-point acceptance matrix across clinical and administrative personas, delivers the controlled and reversible default landing view switch, and provides shoulder-surfing privacy masking:

1. **Persona-scoped acceptance matrix enforcement:**
   - **PMHNP Persona (`team-pmhnp`, `team-taylor`)**: Starts with a balanced clinical schedule view; arrivals and waiting room optional; retains clinical charting and prescribing capabilities while lacking practice organization administration (`admin_organization: false`).
   - **Practice Owner Persona (`prototype-provider`)**: Full clinical view with practice governance tools, team oversight, and copy-on-adopt template publishing.
   - **Practice Manager / Billing Persona (`team-morgan`)**: Accesses schedule operations and non-clinical practice queues, but is strictly prohibited by capability scoping and DOM attributes from note signing (`data-can-sign-encounter="false"`) and prescription authorization or transmission (`data-can-authorize-order="false"`, `data-can-transmit-order="false"`).

2. **Controlled, reversible default landing switch (`defaultLandingView`):**
   - The EHR primary landing view upon authentication transitions from the legacy launcher to the live operational cockpit (`TodayDashboard`), meeting the milestone requirement to make Today the default clinical surface.
   - Reversibility is fully guaranteed through user preferences (`defaultLandingView: "today" | "home"`, defaulting to `"today"`), environment override (`NEXT_PUBLIC_DEFAULT_WORKSPACE_VIEW`), and Workspace Customizer radio options.
   - Preserves single-architecture integrity: the distraction-free Zen Home view remains a 1-click companion launcher/pad, not an unmaintained second architecture.

3. **Privacy & compliance display mode (`privacyMode`):**
   - Adds a dedicated high-visibility display mode for shoulder-surfing protection in shared or patient-facing exam rooms.
   - Masks and blurs patient names, MRNs, notes, and sensitive clinical rows while permitting hover/focus inspection reveals for the clinician.
   - Displays a persistent, non-blocking compliance banner: *"Privacy Display Mode Active · Visual Masking Only · Does Not Alter HIPAA Authorization or Server Access"*.
   - Quickly togglable via header button or `Alt+P` keyboard shortcut.

4. **Longitudinal chart state & concurrency invariance:**
   - Patient chart tabs, window docking, scroll positions, and clinical note drafts strictly survive navigation between Today, Home, and detached windows.
   - Multi-session concurrent writes enforce optimistic versioning on appointments (`version`) and preferences (`revision`), returning 409 conflicts and safe resolutions.

Reason: Fulfills roadmap §21 DB-9 requirements for the final dashboard acceptance gate, delivering a battle-tested, persona-scoped, privacy-conscious cockpit with a safe, reversible default rollout.

## D-059 — Authoritative ICD-10-CM psychiatric registry, explicit NKDA semantics, and sign-time reference snapshot freezing

Status: accepted (2026-09-14); implemented for P3-A/RL-B, P3-B, and RL-A.

Decision: Clinical diagnoses, allergy assessments, and sign-time note reference claims must strictly reflect authoritative clinical records, explicit clinical decisions, and immutable legal record freezing:

1. **Authoritative ICD-10-CM psychiatric diagnosis coding (P3-A / RL-B):**
   - Completely eliminated synthetic `F{dIndex+4}x.x` interpolated mock codes from the patient overview surface.
   - Introduced `STANDARD_PSYCHIATRIC_ICD10` registry and `resolveStandardDiagnosisCode()` mapping standard psychiatric conditions to official ICD-10-CM codes (e.g. `F90.2` ADHD, `F41.1` GAD, `F33.1` MDD Recurrent Moderate, `F31.12` / `F31.32` Bipolar I, `F43.10` PTSD, `F10.10` Alcohol Use Disorder).
   - Unrecognized or clinician-custom conditions remain explicitly uncoded without synthetic or hallucinated codes.
   - Database tables `patient_problems` persist `code` and `coding_system` with schema migrations and backfill.
   - Note references provide enriched entity context (`NoteReferenceRepository.listEnrichedForEncounter`), resolving `display`, `code`, and `codingSystem` directly from authoritative entity rows.

2. **Explicit NKDA assessment semantics & allergy classification (P3-B):**
   - An empty allergy array represents an **unassessed state** and must **never** imply No Known Drug Allergies (NKDA). The clinical facts bar renders *"Unassessed / None recorded"* when 0 allergies are documented.
   - NKDA is an explicit clinical assessment recorded in `patient_allergies` with `is_nkda = 1` and `category = "medication"`, displayed with a distinct green `NKDA (Assessed)` badge.
   - Added structured `category` (`medication`, `food`, `environment`, `biologic`, `other`) and `is_nkda` attributes across domain models, database schema migrations, and `add_allergy` action validation.
   - Added a 1-click **"Assess NKDA"** quick action in the allergy management dialog to encourage timely, explicit clinician assessment.

3. **Sign-time reference review, atomic snapshot freeze, and chart immutability (RL-A):**
   - In `EncounterSignModal`, clinicians review references grouped by evidence class (`action-derived`, `clinician-authored`, `ai-extracted`), showing ICD-10 codes with interactive Accept/Decline actions.
   - Reference review decisions are committed via `PATCH /api/encounters/[id]/references` (`confirmIds`, `rejectIds`) immediately before signing.
   - `canonicalLegalRecord()` and `snapshotSignedEncounter()` freeze confirmed references, their ICD-10 codes, and display text directly into `signed_encounter_snapshots.content_json` and `content_sha256`.
   - Post-signing chart mutations (e.g. resolving a problem, changing a dose, or editing allergy records) do not alter the signed legal record snapshot or its cryptographic hash.
   - Audit trail records `note_signed` events enriched with `confirmedReferencesCount`, `confirmedReferenceIds`, and `attestedCodes`.

Reason: Fulfills roadmap §9 (P3-A, P3-B) and §20/21 (RL-A, RL-B), eliminating synthetic ICD codes, enforcing clinical safety around allergy documentation, and securing immutable diagnostic attestations in signed legal snapshots.

## D-060 — Longitudinal measurements, structured psychiatric history, and standardized clinical rating scales

Status: accepted (2026-09-14); implemented for P3-D, P3-E, and P3-F.

Decision: Patient vital signs/measurements, psychiatric history, and standardized clinical rating scales must be authoritative, versioned clinical records with automated clinical safety surveillance, itemized scoring, and provenance tracking:

1. **Longitudinal measurements, BMI derivation, and psychotropic safety surveillance (P3-D):**
   - Vitals observations (`bp-systolic`, `bp-diastolic`, `hr`, `wt`, `ht`, `bmi`, `spo2`, `temp`, `rr`) are persisted authoritatively in SQLite `observations` with exact-millisecond `effective_at` grouping and backward-compatible synchronization to `patients.vitals_json`.
   - BMI is derived deterministically from height and weight (`wt / ((ht/100)^2)`) with WHO categories (`Underweight`, `Normal`, `Overweight`, `Obesity Class I/II/III`).
   - Automated clinical safety flags evaluate:
     - American Heart Association BP classification (`Elevated`, `Stage 1 Hypertension`, `Stage 2 Hypertension`, `Hypertensive Crisis`).
     - Pulse flags: Tachycardia (`> 100 bpm`), Bradycardia (`< 60 bpm`).
     - Psychotropic metabolic surveillance: flags significant weight trajectories (`>= 7%` weight gain or loss from prior recorded weight), critical for monitoring patients on second-generation antipsychotics and mood stabilizers.
   - Clinical UI provides `PatientVitalsModal` with live BMI preview, AHA BP badge, weight trajectory alert, and longitudinal historical flowsheet table.

2. **Categorized, versioned psychiatric history (P3-E):**
   - Replaced fragmented free-text with structured, versioned records in `psychiatric_history_items` table.
   - Categorized domain model supporting 6 key clinical categories:
     - `prior_medication_trials` (compound name, max dose, duration, response rating, adverse reactions/discontinuation reasons).
     - `past_hospitalizations` (facility, admission date, discharge date, reason, voluntary/involuntary status, outcome).
     - `safety_self_harm` (event description, date, lethality, intent, active/historical risk level).
     - `psychotherapy_history` (modality e.g. CBT/DBT, therapist/clinic, duration, response).
     - `substance_use_history` (substance name, frequency, route, date of last use, treatment history, remission status).
     - `family_psychiatric_history` (relation, conditions, treatments, suicide history).
   - Authoritative persistence through `ClinicalActionGateway` (`add_psychiatric_history_item`, `update_psychiatric_history_item`) with immutable revision tracking in `record_versions` and provenance recording.
   - Rendered via `PatientPsychiatricHistorySection` with category filtering chips and structured creation dialog.

3. **Standardized clinical rating scales as persistent records (P3-F):**
   - Standardized instruments (`PHQ-9`, `GAD-7`, `ASRS v1.1`, `C-SSRS`) are authoritative clinical assessment records, not temporary calculators.
   - Stored in `clinical_assessments` table with itemized question responses (`responses_json`), auto-calculated total scores, standardized severity interpretation (`severity_label`), administration method (`self_administered`, `clinician_administered`), and clinician review workflow (`reviewed_by`, `reviewed_at`).
   - Critical clinical safety alerts are automated:
     - PHQ-9 Question 9 suicidality detection: triggers high-visibility safety alert when score > 0.
     - C-SSRS active suicidal intent detection: triggers immediate critical safety banner.
   - Two-way integration:
     - Dedicated `PatientAssessmentsModal` for interactive scale administration, real-time scoring, critical alerts, and longitudinal trend viewing.
     - Companion rail `CalculatorPanel` upgraded with multi-scale support, itemized scoring, and one-click "Save to Chart" action persisting directly to the patient's record.

Reason: Fulfills roadmap §9 requirements for P3-D, P3-E, and P3-F, establishing authoritative longitudinal vital surveillance, structured psychiatric history, and itemized clinical rating scales with automated safety detection.

## D-061 — Unified patient overview, multi-domain attention matrix, and longitudinal multi-event timeline

Status: accepted (2026-09-14); implemented for P3-G and P3-H, completing Phase P3 exit gate.

Decision: Patient overview and longitudinal history must be authoritative, cross-entity syntheses directly answering clinical questions and deep-linking into detailed workspaces without shadow databases or duplicate state stores:

1. **Unified patient overview answering the 6 core clinical questions (P3-G):**
   - **Who is this patient?**: Top administrative envelope summarizes legal name, preferred name, pronouns, DOB & calculated age, MRN, chart status (`Verified Outpatient`), and provides a direct 1-click trigger to open the `PatientInformationDrawer`.
   - **What is being treated?**: Displays active diagnoses with official ICD-10-CM codes (e.g. `F41.1` GAD, `F90.2` ADHD), onset dates, and quick action to address in current encounter note.
   - **What medications are active?**: Displays active pharmacotherapy regimen with dose, route, frequency, and prescriber, linking directly into the Medications workspace.
   - **What changed recently?**: Multi-domain activity summary tracking recent visits, medication titrations, vitals trajectory, and rating scale score movements.
   - **What needs attention?**: Actionable attention matrix evaluating:
     - Rating scale safety alerts (e.g. PHQ-9 Question 9 suicide ideation > 0, C-SSRS suicidal intent)
     - Vitals & metabolic alerts (AHA Stage 2/Crisis BP, Tachycardia, >= 7% weight shifts)
     - Overdue protocol surveillance (e.g. fasting lipids, lithium levels)
     - Unassessed allergy status (enforcing clinical safety review)
     - Unsigned encounter drafts
     Each attention item provides an immediate, 1-click resolution action navigating to the corresponding modal or chart section.
   - **What is next?**: Next scheduled appointment details (date, time, provider, room) or explicit unscheduled notification with quick booking button.
   - Preserves user customizer preferences (card reordering, spans, collapse, pinning, hiding) without state corruption.

2. **Longitudinal multi-event timeline with 8 stream categories and deep links (P3-H):**
   - Chronologically unifies 8 distinct clinical event streams:
     1. `encounters`: Clinical visits with chief complaint, assessment, and plan.
     2. `meds`: Medication milestones, starts, discontinuations, and dose titrations.
     3. `diagnoses`: Problem list onsets, additions, and status changes.
     4. `assessments`: PHQ-9, GAD-7, ASRS v1.1, C-SSRS rating scale administrations with total scores and safety flags.
     5. `vitals`: Flowsheet vital sign observations, AHA blood pressure staging, and weight trajectories.
     6. `labs`: Diagnostic laboratory observations with values, units, reference ranges, and flags.
     7. `documents`: Clinical documents, intake questionnaires, and neuropsych reports.
     8. `communications`: Official charted patient communications with SHA-256 integrity verification.
   - Interactive deep-link actions on timeline items:
     - `[Open Encounter Note]`, `[View in Meds Workspace]`, `[Address in Note]`, `[Inspect Scale & Responses]`, `[Open Vitals Flowsheet]`, `[View in Labs]`, `[Open Documents]`, and `[Insert to Note]`.
   - Multi-category stream filtering (`All`, `Visits`, `Medications`, `Diagnoses`, `Scales`, `Vitals`, `Labs`, `Messages & Docs`) and real-time clinical text search.

3. **Phase P3 Exit Gate Fulfillment:**
   - A clinician can fully understand current treatment, active problems, safety alerts, and longitudinal change over time without opening or rereading a stack of isolated encounter notes.

Reason: Fulfills roadmap §9 requirements for P3-G and P3-H and satisfies the Phase P3 exit gate, establishing the unified clinical cockpit and multi-domain longitudinal timeline.

## D-062 — Authoritative appointment lifecycle, elapsed wait calculation, provider schedule filtering, and closed-loop follow-up scheduling

Status: accepted (2026-09-14); implemented for Phase P4 (Complete scheduling and front-office workflow).

Decision: Appointments and front-office clinical scheduling must be fully authoritative and integrated directly into the clinician's workspace without shadow databases, local-only state mutations, or detached front-desk portals:

1. **Controlled Appointment Domain Model & Lifecycle Stamping (P4-A):**
   - Extended the appointment schema (`appointments`) with authoritative lifecycle audit columns:
     - `notes TEXT`: Front-desk operational context and arrival instructions.
     - `arrived_at TEXT`: Authoritatively stamped ISO timestamp upon patient arrival (`waiting` status).
     - `started_at TEXT`: Authoritatively stamped ISO timestamp when clinician begins visit (`in-visit` status).
     - `completed_at TEXT`: Authoritatively stamped ISO timestamp upon visit conclusion (`completed` status).
     - `follow_up_interval TEXT`: Deterministic clinical return interval (e.g., `2 weeks`, `4 weeks`, `3 months`).
     - `origin_appointment_id TEXT`: Cryptographic/traceable linkage back to the triggering encounter.
   - Backward-compatible SQLite additive migration `2026-09-14-005-appointment-lifecycle-and-followup`.

2. **Authoritative Scheduling Actions & Patient-Action Binding (P4-B):**
   - Implemented first-class execution pathways in `ClinicalActionGateway`:
     - `check_in_appointment`: Transitions to `waiting`, captures `arrived_at`, audits check-in.
     - `start_visit_appointment`: Transitions to `in-visit`, captures `started_at`, audits start.
     - `complete_appointment`: Transitions to `completed`, captures `completed_at`, audits completion.
     - `mark_no_show_appointment`: Transitions to `no-show`, audits absence.
     - `schedule_follow_up`: Computes target date from interval, links origin visit, creates appointment, and authoritatively updates patient `next_visit`.
     - `cancel_appointment`: Records structured reason and cancellation note.

3. **Practice Cockpit, Multi-Provider Filtering & Waiting Room (P4-C & P4-D):**
   - Multi-provider filtering in schedule queries, `AppointmentRepository`, API routes (`/api/appointments?providerId=...`), and the roster header controls, enabling seamless multi-clinician practice operation.
   - Elapsed wait time calculation (`calculateElapsedWait`) displaying live elapsed duration (`12m wait`) and intake readiness indicators (`Intake forms complete`) in both the Arrivals window and encounter roster.
   - Late/overdue visit detection (`isAppointmentLate`) with a 10-minute clinical grace window.

4. **Closed-Loop Follow-Up Scheduling (P4-E):**
   - Bidirectional linkage between encounters and subsequent appointments:
     - From `VisitDetailDrawer`: Dedicated **"Schedule Follow-Up"** action pre-fills booking modal with patient, visit type, reason, and origin link.
     - From `EncounterSignModal`: Dedicated interactive follow-up interval selector (`1 week` to `6 months`) with 1-click booking calling `api.appointments.scheduleFollowUp`, creating the linked appointment and updating the legal medical record.

Reason: Fulfills roadmap §10 requirements for Phase P4 (P4-A through P4-E) and satisfies the Phase P4 exit gate, allowing clinicians and front-desk staff to move a patient from scheduled -> waiting -> in-visit -> completed -> follow-up without manual external tracking or detached systems.

---

## D-063 — Billing prototype isolation, and charges derived from the signed legal record

Status: accepted (2026-09-15); implemented for roadmap §15 P9-0 and P9-B. Live clearinghouse transport (P9-C) and the denial queue (P9-E) remain deferred and blocked on a vendor decision, as D-037's DrFirst deferral is for prescribing.

### The defect

At `890b4ee` the Billing destination rendered a prototype that a clinician could not distinguish from a working revenue cycle:

- `BillingWorkspace.tsx` held five invented claims in React state, with patient names, MRNs, payers, billed and expected amounts.
- `handleBatchSubmit` flipped rows to `submitted` by calling `setState` and announced *"Batch 837P transmitted 1 claim to Availity clearinghouse"*. `handleResubmit` reported *"resubmitted successfully"*. Neither issued a request. Availity had never been selected as a vendor; it was prototype text.
- The screen showed a hard-coded `98.2% clean claim rate`, a denial count, a payout estimate and settled/remittance states.
- The Financials destination did the same for money arriving: invented monthly revenue of `$42,850.00`, an invented processor balance, a `Connected` accounting status for a system nothing talks to, and a Sync button that reported synchronising twelve transactions after a 1.2-second timer.
- The Zen home launcher's assistant answered any money question with those same invented figures.

Registry hiding was not the containment it appeared to be: Billing was never marked `planned` in the tool registry while the dashboard registry said it was, and three hard-coded destination lists each decided availability for themselves.

### Decision

1. **One registry decides what is reachable.** `isGlobalModuleAvailable` derives availability from `WORKSPACE_TOOLS`, and the app drawer, home-launcher shortcuts and workspace shell all defer to it. The shell's availability guard runs *before* any renderer branch, so re-adding a component branch for a withdrawn module cannot reopen the hole. `financial_integration` is withdrawn; `billing` is available because it now has an authoritative backend.

2. **The prototype is retained as a preview, not deleted.** The layout is design work worth keeping; the deception was in the framing. It lives at `/preview/billing` under the existing preview convention — no workspace chrome, no imports that can reach the server, a banner naming it synthetic, and a `Demo` marker on every individual figure so a cropped screenshot of one tile still carries it. Its controls report that they did nothing rather than simulating an outcome.

3. **A charge is derived from a signed encounter snapshot, never from a draft or a recomputation.** `billing_charges` stores the frozen snapshot's SHA-256 alongside the codes, so a charge is traceable to one attested legal record and a later chart edit cannot restate what was billed. `UNIQUE(encounter_id)` makes duplicate preparation a database refusal rather than a service check. Review is version-checked, so a second writer holding a stale version is refused instead of told it worked.

4. **No money is invented.** There is no fee schedule, so a charge carries codes and units and no amount. `BillingSummary.monetaryTotals` is permanently `null` and carries its reason as a field, forcing a screen to render the explanation rather than omitting money and reading as zero revenue. Counts state their window and their denominator.

5. **Transport refuses rather than simulating.** `billingService.submitClaim` reads the same `integration_configurations` boundary every other vendor uses, and always throws `BillingTransportUnavailableError` — mapped to HTTP 503, not 400 — writing no record, no status change and no audit entry. The control stays visible and disabled with the reason on it, because a missing control leaves a clinician wondering where it went.

6. **Financial access gates rows and totals together.** `view_financial` is owner/manager only; the worklist read is one authorized call, so a refusal cannot leak the practice's totals while withholding the detail, and a refused clinician is told they lack financial access rather than shown a screen that looks like a practice with nothing to bill.

### Files

`app/domain/billing.ts`, `app/server/repositories/billing-repository.ts`, `app/server/services/billing-service.ts`, `app/api/billing/route.ts`, `app/components/workspaces/BillingWorkspace.tsx` (rewritten), `app/components/preview/BillingPrototypePreview.tsx` and `app/preview/billing/page.tsx` (new), `app/components/workspaces/FinancialIntegrationWorkspace.tsx` (removed), plus registry, gateway, binding, audit, HTTP-status and navigation changes. Migration `2026-09-15-001-billing-charge-records`.

### Tests

`tests/billing-containment.test.ts`, `tests/billing-charge-lifecycle.test.ts`, `tests/browser/billing-containment.spec.ts`. See ROADMAP §15's gate status table.

Reason: AGENTS.md forbids inventing billing evidence or letting AI-shaped output become the source of truth, and a screen that reports a transmission that never happened is the most consequential form of that — it can lead a practice to believe it has billed for work it has not. Removing the fabrication without building the durable record underneath would have left the destination empty; building the record without removing the fabrication would have left two answers on screen. Both halves were needed, and the vendor-dependent third is honestly refused rather than approximated.

---

## D-064 — One grounded answer path for every clinical question

Status: accepted (2026-09-15); implemented for roadmap §19 AI-0. Follows D-063, which removed the financial half of the same defect.

### The defect

The product had two answer surfaces with two different truth standards.

The workspace omnibox crossed `/api/ai/omnibox/plan`, which authenticates the caller, resolves patient names only within charts that caller may reach, assembles bounded context with provenance, and refuses rather than inventing.

The home launcher did not. `ZenHomeWindow.handleQuerySubmit` matched the typed query against a list of substrings in the browser and returned invented clinical findings for named patients:

- "Marcus Vance's Serum Lithium drawn on 09/11 returned 0.9 mEq/L (therapeutic range: 0.6–1.2 mEq/L)";
- a PHQ-9 of 14 and an Escitalopram start date for Elena Rostova;
- a Maya Chen refill request with a GAD-7 trajectory and "Safety surveillance protocols are satisfied";
- "4 visits completed and signed" with a Lamotrigine titration to 100mg daily;
- a fallback asserting "Found 2 related records" and "No urgent safety contraindications identified".

None of it read a record. The decisive property is that **no request was made**, so no permission check, patient-access boundary or provenance rule was in a position to stop any of it. An invented lithium level with a therapeutic range is the most consequential case: it is precisely the shape a clinician would act on.

### Decision

1. **One path.** Both surfaces call the planner through `app/lib/omnibox-plan-client.ts` and render `app/components/omnibox/OmniboxPlanCard.tsx`. The card was extracted from `OmniboxPlannerBridge` rather than duplicated, so the two surfaces cannot drift apart again — which is how they came to disagree in the first place.

2. **Where the planner is supported, it answers.** Its answers carry the patient it resolved, the evidence it used, the context surface and token budget it was assembled from, and the standing line that nothing was executed.

3. **Where it is not, the surface says the information could not be retrieved.** `planIsUnanswered` detects a plan with no answer, navigation, proposal, restricted action or clarification, and renders an explicit refusal stating that nothing was inferred and no example was substituted. An empty card is not acceptable here: silence reads as "nothing found", which is itself a claim about the chart. A transport or authorization failure renders as a refusal with its reason, never as an absence of findings — "no results" and "I could not look" mean opposite things in a chart.

4. **The launcher declares no active patient,** because a launcher is not a chart. A clinical question naming nobody returns `patient_required` and asks; a name outside the caller's accessible roster returns absent rather than protected, so the refusal wording cannot be used to enumerate patients.

5. **Chips became templates.** They carry a `[patient]` placeholder, fill the box without submitting, and select the placeholder for replacement. An unfinished template is refused client-side with no request, because looking up a patient named `[patient]` would return "not found" and read as a fact about the chart rather than an unfinished question.

6. **Enter submits explicitly.** The home input relied on implicit form submission, which was not reaching the handler; a search field that ignores Enter reads as a broken assistant.

### Files

`app/components/omnibox/OmniboxPlanCard.tsx` and `app/lib/omnibox-plan-client.ts` (new), `app/components/home/ZenHomeWindow.tsx` (answer ladder removed), `app/components/OmniboxPlannerBridge.tsx` (refactored onto the shared card), `app/components/PatientWorkspace.tsx` (passes the plan's section through when opening a chart), `app/zen-home.css`.

### Tests

`tests/home-assistant-grounding.test.ts` — unsupported questions, missing records, patient identity (unnamed, unknown, and resolved without borrowing another chart), unauthorized access from a second organization, and source scans proving no module holds a clinical judgement as a string literal and no answer surface holds a clinical value of its own.

`tests/browser/home-assistant.spec.ts` — each outcome is visibly distinct in a running page, the request actually leaves the browser, an unfinished template sends nothing, and both surfaces render the same card.

### Known remaining exposure

The other prototype workspaces (`EmailWorkspace`, `FaxWorkspace`, `CommunityWorkspace`, `PatientCommunicationWorkspace`, `SocialMediaWorkspace`, `HRStaffWorkspace`, `WebsiteManagerWorkspace`) carry synthetic content of the same family. They do not claim to retrieve anything and are not answer surfaces, so they are outside this decision, but they need the containment treatment D-063 applied to billing: an authoritative backend, or an explicitly labelled preview.

Reason: AGENTS.md's AI principles forbid inventing patient facts, labs, medications or clinical events, and require that AI output never silently become the source of truth. A second answer surface that answers without asking the server cannot satisfy any of those rules, however careful the first one is — the guarantee has to live at the only boundary both surfaces cross.

---

## D-065 — Normalized signing-date projection over immutable encounter records

Status: accepted (2026-09-15); implemented as the P9-0 follow-up recorded in ROADMAP §15.

### The problem

`encounters.signed_at` holds two shapes. `EncounterRepository.sign` writes `new Date().toISOString()`; demonstration rows seeded through `patientEncounterHistory` carry a display date such as `"Aug 08, 2026"`. Signed encounters are immutable by database trigger, so the inconsistency cannot be cleaned up in place — and should not be, because the legal record says what it says.

The consequence is not cosmetic. `signed_at >= ? AND signed_at <= ?` is a string comparison in SQLite, and a display date sorts outside every ISO window because digits precede letters in ASCII. Every such record fell out of every windowed query **silently**, which is the same family of untruth P9-0 removed from the billing screen: a count that omits records without disclosing it is unverifiable.

### Decision

1. **Project, do not correct.** `encounter_signed_at_projection` stores a derived instant beside each signed encounter. No `UPDATE` reaches a signed row and the immutability triggers stay in force. The table is a view over authoritative records in the same sense as `encounters_fts` over note content.

2. **Reconcile on read.** `SignedEncounterDateRepository.refresh()` is idempotent and runs before any windowed count, so a note signed since the last read is projected before it is counted. A projection that can silently fall behind would reintroduce the defect it exists to remove. This reuses the justification already recorded for the action-derived note-reference view: the rows are derived, create nothing clinical, and being self-healing is what makes them trustworthy.

3. **Three outcomes, not two.** `iso` is used directly. `parsed` is a recognised display form placed at midnight UTC — a stated convention, so it is marked derived rather than promoted to `iso`. `unparseable` keeps the raw value, carries no instant, and is counted.

4. **Nothing is guessed.** The parser recognises only forms this product is known to have written, and there is deliberately no `new Date(raw)` fallback: it accepts almost anything and returns a confident wrong date for the rest. An unrecognised string stays unplaceable, which is a reportable state.

5. **A window that excludes records says how many.** `BillingSummary.signedEncountersUnplaceable` travels with the windowed denominator and the billing surface renders it. Unplaceable records also remain in the unbilled backlog, which is not window-scoped, so no unbilled work can be hidden by a date at all.

### Files

`app/domain/clinical-timestamp.ts`, `app/server/repositories/signed-encounter-date-repository.ts` (new), migration `2026-09-15-002-signed-encounter-date-projection`, plus the billing repository, domain summary and workspace surface.

### Tests

`tests/signed-encounter-date-projection.test.ts` — the recognised and refused forms; a signed record byte-identical after repeated refreshes; the immutability trigger still rejecting an in-place update, which is why a projection was the only option; an unparseable record counted and listable rather than missing; and the projection recovering rows that a direct string comparison drops.

Reason: the legal record's integrity and a correct report are both required, and they were in tension only because the query was reading the wrong thing. Normalizing at read time satisfies both — the chart keeps exactly what was written, and a count either places a record or admits that it could not.

---

## D-066 — One expiry is one question: latching the session challenge

Status: accepted (2026-09-15).

### The problem

`reportAuthenticationFailure` coalesced refused requests on a **1,500 ms time window**. That made the stated guarantee — "one expiry is one question to the server, not one per surface" — true only for refusals that happened to arrive close together.

The workspace deliberately stays mounted behind the challenge so unsaved clinical work survives, and its pollers keep running: the presence heartbeat, the ten-second schedule sync, anything else on a timer. Every one of those requests is refused while the session is gone, and every refusal that landed outside the window asked the server again. A session left expired on screen re-verified every 1.5 seconds for as long as the clinician left it there.

It surfaced as an intermittent browser-test failure. `session-expiry.spec.ts` waited 1,200 ms and asserted exactly one `/api/auth/me` — a 300 ms margin against the window — so whether it passed depended on where the test sat relative to a poll tick. It passed alone and failed in roughly half of full-suite runs, moving between tests. A flake that moves is usually a race, and this one was.

### Decision

Suppression is latched to the state of the enquiry rather than to the clock. The hub holds one of three states:

- `idle` — nothing known to be wrong; a refusal is worth asking about;
- `verifying` — a check is in flight; the burst of simultaneous 401s lands here and is swallowed;
- `challenged` — the check came back and there is no session; further refusals teach nobody anything.

`settleAuthenticationVerification` records the outcome and is what releases the latch. It is called for **every** check the gate performs, not only the ones a refusal triggered: a focus re-check that finds a healthy session is just as good a reason to stop suppressing. `session-valid` and `unknown` return to `idle`; `session-gone` holds the latch. A transport failure is `unknown` on purpose — the server did not say the session was gone, it said nothing — so the next refusal may ask again.

`clearAuthenticationChallenge` is the human resolving it rather than the server answering: signing back in, or switching account. Without it a clinician would be refused for the rest of the session with nothing on screen to say why, which is a worse failure than the repeated re-verification this replaced.

A `STALE_VERIFICATION_CEILING_MS` of 30 seconds remains as a **safety valve, not the mechanism**. The hub cannot see its listener, so a gate that unmounts mid-verification would otherwise hold the latch forever. Silence about an expired session is the worse failure, so an unsettled latch gives way.

### Tests

`tests/session-expiry-recovery.test.ts` covers the burst, a session that stays expired across 25 seconds of continued refusals, release on a healthy verification and on a transport failure, and the stale-latch valve.

`tests/browser/session-expiry.spec.ts` no longer asserts inside a timing window. It issues deliberate refused requests in three rounds well past the old 1.5 s boundary and still expects exactly one verification, and it now also proves that an expiry *after* a recovery challenges again.

Reason: a guarantee expressed as a time window is only a guarantee about requests that arrive inside it, and the thing being guarded against — a mounted workspace being refused on a timer — arrives outside it by construction. Latching to what is known makes the claim in the test name the claim the code actually implements.

---

## D-067 — Getting out of a layered surface without reaching for the ×

Status: accepted (2026-09-15).

### The problem

`PatientInformationDrawer` carries the comment "Escape closes, like every other layered surface in the workspace." That was aspiration rather than description. Surveying every dismissible surface:

| Surface | × | Click away | Escape |
|---|---|---|---|
| Right rail's add menu | yes | yes | yes |
| Left rail's pin menu | yes | yes | **no** |
| Clinical AI plan card | yes | **no** | **no** |
| Module shell (Billing, Inbox…) | yes | **no** | **no** |

The two rail menus are the same control and disagreed. The Clinical AI answer card had no exit at all except its ×.

### Decision

One hook, `useDismissible`, so the decision is made once and the surfaces cannot drift apart again. Which gestures a surface gets is a property of the surface rather than a blanket rule, and the distinctions are the substance of this decision:

1. **Escape suits anything layered.** It is the keyboard's way out and costs nothing to offer.

2. **Clicking past it suits a popover, not a surface that fills the content area.** For the module shell, "past it" is the rail, the header and the tab strip — a stray click would close the thing the clinician is working in. `dismissOnOutsideClick` is opt-in.

3. **Clicking past it also does not suit a card that sits in the flow.** The home launcher's answer card pushes the shortcut grid down while it is open; dismissing on the press pulled that grid back up between press and release, so a click aimed at the EHR tile landed on whatever slid under the cursor. The workspace's version of the same card is an overlay and moves nothing, so it does take click-away. Same component, different gesture, because the layout differs.

4. **A text field keeps Escape — unless the surface is layered above it.** Escape in a field reverts or clears an entry, and stealing it to close the surrounding surface would throw away what someone was typing: the Tasks composer inside the module shell is exactly that case. But the Clinical AI card opens while the cursor is still in the omnibox that asked the question, so a blanket "never steal Escape from a field" rule would have left the × as its only exit at the moment a clinician most wants it gone. The topmost layer answers first, and only the surface knows whether it is the topmost layer — hence `dismissFromTextEntry`.

5. **Modals holding typed work are deliberately not wired here.** The booking dialog and the recovery-evidence form need a deliberate discard, not a gesture that can be made by accident.

### A defect this surfaced

Adding dismissal to the workspace plan card exposed that `showing` was derived as `loading || error || plan`, so dismissing mid-flight cleared the plan but left the card up through `loading` — and the in-flight answer then reopened it. Dismissal is now its own state: someone who has put the card away has put it away, and a late answer to the abandoned question stays away too.

### Files

`app/lib/use-dismissible.ts` (new), `app/components/DynamicSidebar.tsx`, `app/components/OmniboxPlannerBridge.tsx`, `app/components/home/ZenHomeWindow.tsx`, `app/components/omnibox/OmniboxPlanCard.tsx`, `app/components/GlobalWorkspaceShell.tsx`.

### Tests

`tests/browser/dismissal.spec.ts` encodes each distinction rather than one blanket rule: the pin menu closing three ways, the module ignoring a rail click but honouring Escape, a composer keeping Escape for itself, the overlay card closing from the box that asked for it, the in-flow card closing on Escape while a click below it still reaches the control it was aimed at, and Escape with nothing open leaving the workspace alone.

Reason: a surface a clinician can open and cannot leave except by finding one small glyph is a surface that interrupts them. The × stays as the visible affordance — the point was never to remove it — but it should not be the only way out.

---

## D-068 — Medication longitudinal truth: a readable dose trajectory and a recorded indication

Status: accepted (2026-09-15); completes roadmap §9 P3-C, the last sub-item of Phase P3 without a completion marker.

### Why this was audited

P3-C carried no completion marker while the P3 exit gate was recorded as Passed (D-061) — the roadmap made two claims about the same phase. Auditing P3-C against its own list found that everything except two items was already built: active and historical medications, start/stop, dose/route/frequency, prescriber and source, reconciliation status, external evidence kept separate, and the relationship to prescription orders without collapsing the two concepts. The gate and the missing marker were both right about different things: the longitudinal chart did answer the six clinical questions, and a clinician still could not read a dose history.

### The two gaps

**1. "Review prior dose trajectory" could not be done.** Every write to `patient_medications` goes through `updateRow`, which stamps a full snapshot into `record_versions`. The trajectory had been recorded from the beginning. `MedicationTruthPanel` rendered `v3 · update · Dr. Taylor` and, from the snapshot, only `status` — so a Sertraline titrated 50 → 100 → 150 mg and then stopped displayed as four lines, three of which read "active". The data was there and nothing showed it.

**2. "Indication where useful" had nowhere to live.** `MedicationPrescriptionIntent.indication` has existed all along, and `medicationPrescriptionService.confirmMedicationTruth` dropped it on both the add and update paths. The reason a patient was being put on a medication existed at the moment of prescribing and was gone from the chart immediately afterwards.

### Decision

1. **The history says what changed, not that something did.** `summarizeMedicationTrajectory` diffs consecutive snapshots over the clinically meaningful fields and reports each write as the move it was. Two rules are load-bearing: a field is reported as changed only when two snapshots disagree — nothing is inferred from the gap between them — and a version whose snapshot is unreadable is reported as unreadable rather than skipped, because a silent omission in a dose history reads as "no change".

2. **A version that moved nothing clinical says so.** Display text and provenance move without the prescription changing; a blank row would suggest a titration that did not happen.

3. **The dose line is separate, and reads forwards.** "Has this been up and down before?" is a different question from "what happened on the 14th", and answering it by reading a change list backwards is work the reader should not have to do. Only writes that moved the dose appear. A single point means the dose never changed — a fact about the record, kept distinct from having no history.

4. **The trajectory re-establishes its own ordering.** A caller that handed over ascending versions would otherwise get a history that reads backwards while looking entirely plausible.

5. **Indication is carried, not invented.** Migration `2026-09-15-003` adds the column; `confirmMedicationTruth` carries the intent's value onto the record; the panel displays it where recorded and offers a field for it. A medication with no recorded indication shows none.

### A defect only the browser found

The unit test drove `ClinicalActionGateway` directly and passed, while the real screen silently dropped the indication: `validateClinicalRecordAction` whitelists patch fields at the request boundary and `indication` was not on the list. The field was added to both the add and update validators, and the whitelist is now asserted in the test rather than assumed — a gateway-level test cannot see a boundary that strips a field on the way in.

### Files

`app/domain/medication-trajectory.ts` (new), migration `2026-09-15-003-medication-indication`, `app/domain/clinical-records.ts`, `app/server/repositories/clinical-record-repository.ts`, `app/server/repositories/clinical-record-update-repository.ts`, `app/server/actions/clinical-record-validation.ts`, `app/server/actions/clinical-action-gateway.ts`, `app/server/services/medication-prescription-service.ts`, `app/lib/clinical-record-api.ts`, `app/components/patient/MedicationTruthPanel.tsx`, `app/components/patient/PatientMedications.module.css`.

### Tests

`tests/medication-longitudinal-truth.test.ts` — the change list, a version that changed nothing, an unreadable snapshot, ordering independence, the dose line, and an end-to-end titration whose indication survives both the gateway and the request boundary.

Reason: a longitudinal chart that records a dose history and cannot show it is keeping the data for nobody. P3-C's list is about what a clinician can *do* with medication truth, and the one task on it that could not be done was the one that most needs the longitudinal record — deciding whether a dose has already been tried.

---

## D-069 — Care completion is a projection over authoritative workflows, not a second task or clinical truth system

Status: accepted (2026-09-15); delivers roadmap §21 DB-10.

### The problem

A clinician finishes a visit and carries the rest of it in their head: the prescription
that still has to go, the labs to think about, the message to the patient, the note to
sign — and, most often forgotten, the next appointment. Outstanding Work answers "what is
unresolved across my practice", which is a different question from "for the four patients
I am actually carrying today, is everything closed". Nothing in the product answered the
second one, so the answer lived in working memory.

The obvious implementation is the wrong one. A checklist that stores its own ticks is a
second place where "the prescription was sent" is recorded, and the moment it can
disagree with the prescription transaction it is worse than nothing — a clinician who
trusts it will stop checking the thing that is actually true.

### Decision

**Care completion is a projection. It is not a source of truth.**

An item does not store "done". On every read, each rule asks the record that already owns
the fact — the signed encounter, the linked appointment, the order and its transport
transaction, the acknowledgement, the reviewed charge, the task — and reports what it
found together with the evidence row it found it in. A completion with no evidence is not
a completion the board will render, and there is deliberately no API on this surface that
could mark clinical work complete.

Four consequences follow, and each is enforced in code rather than by convention.

**1. Authority is a property of the rule, not of the render.** `CareCompletionAuthority`
is `observed` or `manual`, decided once in the rule catalogue. Only `manual` — work with
no other record, "call the mother on Thursday" — offers a check, and that check writes
through the ordinary task API so the board is reading the same row the Tasks surface
writes. The observed/actionable/manual/deferred vocabulary the product speaks is
*derived* from authority, state and target, so "observed" and "actionable" can never
contradict each other: signing an encounter is both, and saying so is correct.

**2. A missing source is stated, never invented.** `unavailable` is a first-class state,
counted as neither done nor open. A PCP recorded in the care network raises the
notification boundary and then says plainly that disclosure needs a release-of-information
record this build does not hold — because a PCP existing is not permission to disclose.
Patient balance has no authoritative source at all, so it produces no item on any patient
rather than a plausible number; the rule exists in the catalogue with its reason so the
boundary is visible without being fabricated.

**3. Deferral is not completion.** A deferred item keeps its own glyph, its own word, its
recorded reason and optional resume date, and its own count: a card reads
`3 done · 1 waiting · 2 open`, never `4 / 6`. Precedence runs the other way too — when the
authoritative workflow closes the loop, the completion supersedes the now-obsolete
deferral instead of the deferral hiding it.

**4. A pin is not authorization.** Patient access is re-resolved on every read and every
write. The board never loads a patient because their id appears in a pin row, and a pin
that outlives access contributes a count and nothing else: no name, no MRN, not the id.

### Follow-up, specifically

This is the loop the feature exists to protect, and it is the one place where a plausible
shortcut would have defeated the whole point.

A follow-up plan recorded in the note is an *intention*. An appointment linked back to the
originating visit through `origin_appointment_id` is the *fact*. They are different, and
only the second completes the item. An unrelated future visit does not satisfy it — that
shortcut is exactly how a forgotten follow-up comes to look finished. Cancelling or
missing the linked appointment returns the item to unresolved; rescheduling moves the
rendered date and time, because both are read from the appointment on every projection.

Signing the note does not close it. A signed encounter with no scheduled follow-up stays
visibly incomplete, and nothing blocks signing on account of that: there are legitimate
reasons scheduling cannot happen in the room, which is what deferral is for.

### Monitoring protocols are configuration with a stated basis

Intervals live in a data catalogue, not in a component, and the shape forces each entry to
say where its cadence comes from and what the clinician is being asked to consider. The
most any protocol can do is put "consider whether this is indicated" on a card with its
reasoning attached. Nothing here creates an order; the clinician decides, and a real lab
order is what closes the item. Clozapine monitoring is modelled on the neutrophil count,
so a bare white-cell count deliberately does not satisfy it — neutropenia is the question
being asked.

### Voice and AI

A spoken deferral travels the existing planning boundary and gains no shortcut:
transcript → typed intent → patient resolved against the accessible roster → work item
resolved against that patient's *live* board → proposal carrying `execution: "not_executed"`
→ explicit confirmation showing patient, item and reason → authenticated mutation → audit
→ refresh. The item key on the proposal is one the server produced from the board, never a
phrase from the transcript, and the server re-validates it before writing.

Ambiguity on either identity refuses and asks, with the candidates named. Fuzzy matching
that deferred the wrong patient's work would be a clinical safety failure, not a UX
annoyance. Hint matching therefore weights an item's own identity above the prose beneath
it — without that split, a medication-summary line reading "no follow-up appointment to
include yet" competed with the follow-up item itself and made an unambiguous request
ambiguous.

Deferral is the only thing the AI card can execute, and it is executable precisely because
it writes nothing clinical. Everything with clinical or financial consequence still routes
to Review, which opens the workflow that owns it.

### A defect this surfaced

Encounter dates are stored in two text formats: `2026-09-15` from the API, and
`Sep 15, 2026` from seeds and some UI paths. `Date.parse` accepts both and places them
differently — a bare ISO date at UTC midnight, a display date at *local* midnight — so
west of UTC the display form sorted later for the same calendar day. Ordering encounters
that way picked the wrong visit as the card's focus, and a patient with a real follow-up
plan produced no work item at all.

The product already had the answer: `normalizeClinicalTimestamp` (D-065) exists for this
exact class of defect, recognises only forms this codebase is known to have written, and
refuses to guess at anything else. Reusing it makes the two spellings compare equal and
leaves `updatedAt` — always a real instant — to decide. An encounter nobody can date now
sorts last rather than first, so a visit with no readable date cannot become the one the
whole card reports on.

### Persistence

Migration `2026-09-15-004-care-completion-worklist` adds exactly two tables:
`provider_patient_worklist_pins` and `care_completion_deferrals`. The deferral table has
no completion column by construction — there is no status there that means "done" —
because completion is always read from the workflow the item projects. Derived facts are
not copied into a `care_completion_items` table; they stay projections.

The same migration adds a nullable `messages.created_at`. Messages carried only a locale
clock string, which cannot be ordered or windowed, so "was a message sent to this patient
after the note was signed" could not be asked at all. Legacy rows keep a null and are
reported as unusable evidence rather than guessed at — the same honesty D-065 established.

### Files

`app/domain/care-completion.ts` (new), `app/server/services/care-completion-rules.ts`
(new), `app/server/services/care-completion-service.ts` (new),
`app/server/repositories/care-completion-repository.ts` (new),
`app/api/care-completion/route.ts` (new), `app/lib/care-completion-api.ts` (new),
`app/components/dashboard/CareCompletionDashboardWindow.tsx` (new),
`app/components/care-completion/` (new), `app/care-completion.css` (new),
migration `2026-09-15-004-care-completion-worklist`, plus registry, preference, patient
header, omnibox domain/planner/model-gateway and plan-card wiring.

### Tests

`tests/care-completion-projection.test.ts` — the follow-up loop end to end including
cancel and reschedule, an unrelated appointment failing to satisfy it, signing versus
scheduling as separate facts, prescription states read truthfully, monitoring protocols,
the unavailable boundaries, and the focus-visit date regression.
`tests/care-completion-authority.test.ts` — pin scope and access, stale-pin non-leakage,
per-provider isolation, deferral persistence and concurrency, workflow completion
superseding an obsolete deferral, and the absence of any clinical completion path.
`tests/care-completion-voice-defer.test.ts` — proposal-not-mutation, and refusal on an
ambiguous patient, an ambiguous item, an unmatched item and an inaccessible patient.
`tests/browser/care-completion.spec.ts` — the provider sequence in a real browser.

Reason: the point of the board is to reduce what a clinician has to hold in their head, and
that only works if they can believe it. A checklist that can disagree with the chart would
take the memory burden away and replace it with something worse.


## D-070 — Three-row navigation replaces the launcher and left sidebar

Date: 2026-09-16. Owner explicitly requested implementation of this layout.

The global row holds Home/logo/Clinical Bond, centered AI search and account/preferences.
The next row holds rounded labeled Clinical, Schedule, Team, Practice and Workspace
controls; the third is the existing open-work tab strip. Tool dropdowns overlay content
without displacing it. The left sidebar is no longer mounted and consumes no width.

Routes continue through existing workspace/communication events. Patient tabs, drafts,
clinical authority and server authorization remain owned by their existing systems.
The account control now belongs to the header instead of floating independently over it.
Saved layouts remain in the Workspace menu. The top Preferences button opens the
existing personal layout preferences; practice settings remain under Practice. Legacy sidebar files/preferences are retained
for traceability and compatibility, not exposed as active controls. Moving a companion
into the removed sidebar is no longer offered. Top-level group reordering is deferred.

The shared measured bottom edge of the tab strip now includes the tool row and bounds
module/companion overlays. Floating-window placement, move/resize constraints and
maximization now share the actual canvas bounds with snapping, replacing the old
64px header/84px sidebar constants that could hide window controls. Escape dismisses a tool dropdown before reaching the workspace
underneath. Search remains available on Home as well as clinical surfaces.

This improves the presentation/navigation layer, not clinical reasoning, data quality or
vendor readiness. Existing event routing and DOM-based workspace restoration remain
coupling risks; browser tests cover patient return, dropdown dismissal, geometry and
restoration. No new clinical mutation pathway is introduced.

---

## D-071 — Signed encounter history is authoritative; corrections append to the legal record

Date: 2026-09-16.

P5 audit found one remaining split-brain path in the encounter UI. The database already
owned signed encounters, immutable signed snapshots, addenda/amendments, provenance and
audit history, but the Past notes drawer still read and mutated the synthetic
`patientEncounterHistory` object at runtime. A newly signed note could therefore appear
because React changed a fixture rather than because the authoritative chart returned it.

Decision:

1. Past encounter history is loaded from the authenticated encounter API and filtered to
   signed records. Loading failure is shown as unknown/unavailable; no synthetic fallback
   is substituted.
2. A signed encounter reopens as a progressively disclosed read-only legal record. The
   original signed content is never placed back into an editable draft.
3. Corrections use the existing `add_encounter_addendum` action and
   `amend_signed_record` permission. The request boundary now validates correction type,
   body and reason before the action reaches `ClinicalActionGateway`.
4. Addenda and amendments remain separate records with provenance/audit. Neither operation
   rewrites the immutable signed snapshot or its hash.
5. Copying a prior plan into a current unsigned draft remains an explicit clinician action
   and is disabled when the current encounter is locked.

This closes the signed-history authority seam without creating another encounter store or
a second correction system. The broader P5 gate remains an audit target until its browser
recovery matrix and documentation UX are verified.

---

## D-072 — Calendar is a first-class workspace, not a Dashboard mode

Date: 2026-09-16.

The prior shell labeled the primary scheduling destination "Schedule" and opened a
menu whose calendar choice merely switched the Dashboard's roster window into a
timeline. That buried one of the clinician's core daily tools and meant Dashboard
and Calendar could not remain open independently.

Decision:

1. The primary work-navigation destination is **Calendar** and opens directly rather
   than through a Schedule submenu.
2. Calendar owns a persistent browser-style workspace tab independent of Dashboard
   and patient tabs.
3. The Calendar surface reuses the existing authoritative appointment store, booking
   flow, status mutations, patient navigation, and permissions. It does not create
   another scheduling record or client-side truth.
4. Its interaction grammar is intentionally familiar: mini-month at left, a book
   action, Today and previous/next navigation, Day/3-Day/Week/Month views, time grid,
   current-time marker, and click-to-book empty slots. Clinical Bond keeps its own
   visual identity and clinical workflows rather than copying another product.
5. The legacy internal id `schedule` remains accepted for saved pins and navigation
   compatibility, while new visible product language is Calendar.
6. The Dashboard's compact roster/calendar window remains available for operational
   scanning; the dedicated Calendar is the full scheduling workspace.

This separates "what needs my attention today" from "where does time go" without
duplicating appointment truth or adding a second scheduling engine.

---

## D-072B — Calendar booking can create a patient chart from caller-supplied identity

Date: 2026-09-16.

Decision: The calendar's New Event editor offers an inline new-patient path. A chart
requires a supplied full name and valid date of birth; the server assigns an MRN
and records only contact details actually entered. The chart is created through the
existing authenticated `create_patient` action and organization boundary. The
subsequent appointment uses the returned patient ID and starts in `scheduled`, the
existing on-the-books but unconfirmed state. The calendar does not manufacture age,
DOB, pronouns, coverage, prior visits, or a patient ID from a name alone.

The two authoritative writes are not atomic. If the appointment fails after the
chart succeeds, the editor retains the created patient and reports that only the
appointment needs retrying; a retry does not create a duplicate chart. This is an
architecture-faithful booking bridge through existing patient and schedule actions,
not a name-only walk-in intake workflow. A caller without a date of birth
still needs a separately scoped unlinked intake/hold design before a chart or
calendar booking can be made safely. The browser form and UI state remain coupled to
the two-step API sequence; there is no cross-request transaction.

---

## D-073 — Tentative caller holds are distinct from scheduled visits

Date: 2026-09-17. Supersedes D-072B's default status for a newly created patient.
**Partially superseded 2026-09-17 by D-076:** a brand-new caller's tentative hold no
longer creates a clinical chart at all — see D-076 for the corrected prospective-
identity boundary. An *existing* patient can still receive a tentative hold exactly
as described below; that path is unchanged.

A caller can be entered through the calendar editor with a supplied full name,
valid birth date, callback phone and email. The existing patient action stores
those details on an authoritative chart and assigns its MRN; the appointment
action then stores a patient-linked `tentative` status with intake pending. Existing
patients can also receive a tentative hold when their chart has these details.
The server checks the linked chart before creating or changing an appointment to
tentative. Calendar and roster surfaces show the hold in amber with an explicit
Tentative label, so color is not the only status cue.

The calendar searches a booking-only patient projection containing name, birth
date, MRN, callback phone and email. Scheduling staff may read this projection
within their organization/assignment scope; it does not expose clinical record
fields or grant access to the full patient roster.

A tentative hold occupies calendar time, but does not count as a booked follow-up
for care-completion. Staff can explicitly move it to Scheduled or Confirmed once
the arrangement progresses. No automatic email, text, or reminder is sent.
Patient creation and appointment creation remain separate audited writes; if the
second write fails, the editor keeps the created chart selected for a safe retry.
The existing authentication and synthetic-data-only boundaries still apply.

---

## D-074 — First-call intake is a projection over saved administrative facts

Date: 2026-09-17.

The calendar can create a patient-linked tentative appointment from a caller's
name, birth date, phone and email (D-073). After booking, the editor opens the
patient's administrative intake view; a calendar appointment can reopen the same
view. It shows identity, contact, contact permissions, related people, coverage
and pharmacy from their existing authoritative records and links to those editors.
It does not store a duplicate intake checklist or treat absent guardians and
pharmacies as automatically required for every patient.

Scheduling staff with `edit_patient` may read this patient-bound administrative
record without `read_clinical`; the route still checks organization and patient
access, and the response contains no clinical chart. This aligns the read with
the staff role that already creates/edits these records while preserving the
separate clinical permission boundary.

New patient intake appointments default to pending. Ordinary follow-ups and
practice events default to exempt instead of silently claiming completed forms.
Legacy/manual `completed` appointment markers are displayed as marked complete,
with form evidence explicitly unverified. Versioned forms, consent signatures,
patient access, and payer eligibility remain separate future records under P7
and P9-A. This is a front-door workflow bridge, not completion of intake-to-billing.

---

## D-075 — Intake is a staff-workflow queue and a readiness projection, not a second intake record

Date: 2026-09-17. **Hardened 2026-09-17 by D-076:** the "one per patient-linked
appointment" framing below is corrected — an episode may be prospect-linked before
a chart exists — and the readiness/plan-acceptance/confirm semantics described here
are tightened. Read D-076 alongside this entry rather than in isolation.

Decision: The Intake workspace (`app/components/workspaces/IntakeWorkspace.tsx`,
previously a placeholder) is a global queue of every active `intake_episodes` row —
one per patient-linked appointment carrying someone from a tentative hold toward a
first visit — sorted and staged by a pure projection (`app/domain/intake.ts`)
computed from records that already have an authoritative home: the D-074
administrative record, appointments, documents, and four new evidence tables this
phase adds (`consent_signatures`, `form_submissions`, `eligibility_checks`,
`payment_method_references`), plus practice configuration
(`payer_plan_participations`). `intake_episodes` and `intake_notes` are the only
new durable state this feature owns outright — staff assignment, follow-up,
outreach/notes, the guardian-situation flag, the staff-review sign-off, and
disposition. None of it is clinical truth, and none of it is a duplicate
checklist: `computeIntakeChecklist()` recomputes readiness on every read from
current evidence, exactly as `intakeAdministrativeSteps()` already did for the
six administrative steps it wraps and extends.

Reason: AGENTS.md's Intake brief asked for "who is in intake, where are they,
what's next" answered without inventing a second patient-truth system. The
codebase already had the hard part half-built — D-073's tentative hold, D-074's
`intake_status`/administrative-steps projection — so the honest scope for this
pass was finishing that projection into a real queue and staff-workflow
controller, not re-deriving it.

What this phase deliberately did and did not build, so the gap is legible rather
than silently missing:

- **Confirming an appointment reuses the existing status transition**
  (`update_appointment_status` → `confirmed`) rather than a new action. Readiness
  reaching "Ready to Confirm" never flips the appointment itself — a human clicks
  Confirm. The system also never autonomously cancels, disposes, or denies a visit;
  disposition (`patient_changed_mind`, `unable_to_reach`, `duplicate`, etc.) is
  always an explicit staff action with a required reason, recorded as both an
  episode field and an `intake_notes` row.
- **Consent, form, eligibility, and payment mutations go through a dedicated
  `intakeService`/`IntakeRepository` pair reached from one `/api/intake` route**,
  the same shape `care-completion-service.ts` already established for
  non-clinical-truth workflow state: `assertPermission`/`assertPatientAccess`
  enforced inline, `AuditRepository.log` after every write, no
  `ClinicalActionGateway` action added. This was a deliberate choice, not an
  oversight — these records are patient-bound but are Intake's own evidence
  classes (a staff-attested signature, a staff-administered form answer, a
  staff-verified eligibility call, a payment waiver), not existing clinical or
  financial record types the gateway already owns, and the safety invariants the
  gateway would have added (permission check, patient binding, audit) are already
  present without it.
- **Consent capture is staff-attested only** (`consent_signatures.method =
  'staff_attested'`) — there is no signature-capture pad in this build, so the
  record says exactly what evidence exists: signer name, relationship, timestamp,
  recording staff member, immutable at the database level (triggers reject
  UPDATE/DELETE). Four standard templates (treatment, privacy, financial,
  telehealth) are seeded; practice-authored template management (edit, upload a
  PDF packet, retire, versioning UI) is not built.
- **One seeded form template** (`form-psychiatric-intake`, the sections from
  AGENTS.md's intake brief) exercises a generic sectioned-questionnaire renderer
  reachable from the checklist. Templates are schema (`form_templates.sections_json`);
  submissions are staff-administered in this pass — there is no patient-facing
  secure-link intake flow, because there is no patient-authentication system to
  build it on (P7-F remains fully open). The "Clinical Bond account created"
  checklist step is `not_available` rather than silently omitted or falsely
  satisfied, saying plainly that no patient portal exists yet.
- **`EligibilityAdapter` and `PaymentMethodAdapter` are not built as vendor
  interfaces in this pass.** Both checklist steps read `not_available`/`needed`
  with an honest "Not configured" detail when no evidence exists. What a staff
  member can record today is bounded to what is actually true without a vendor: a
  manually staff-attested eligibility result (`eligibility_checks.source =
  'manual_staff_attestation'`, never `'adapter'`) from calling the payer directly,
  and a payment-method reference or an explicit staff waiver with a required
  reason (never a PAN or CVV — `payment_method_references` has no such columns).
  The schema's `source`/`result` and `status` vocabularies are shaped for a real
  adapter to slot into later without a migration.
- **Payer-plan acceptance is a separate axis from eligibility**, per
  `payer_plan_participations` (practice configuration, not patient data) and
  `matchPlanAcceptance()`: active coverage is never read as "this practice accepts
  the plan," and an unconfigured payer name reads `needs_review`, never a guessed
  `accepted`.
- **Government ID and insurance cards reuse the existing document workflow**
  rather than new storage: `document_type` values `government_id`,
  `insurance_card_primary`, `insurance_card_secondary` were added to the existing
  Documents upload UI, and the checklist reads `workflow_status` (`received` →
  `needs_review` → `reviewed`) so "received" is never displayed as "verified."
  There is no OCR/extraction-candidate pipeline in this pass — no
  document-extraction seam was worth building with nothing to populate it, so
  none was added speculatively; a document is reviewed and confirmed by a human
  the same way any other uploaded document already is.
- **Minor/guardian handling is a staff-recorded flag, not a legal
  determination**: `intake_episodes.guardian_situation`
  (`not_applicable`/`single_guardian_sufficient`/`joint_requires_multiple`/
  `unknown_needs_review`) is asked once and conditionally requires the guardian
  checklist step; Clinical Bond draws no custody conclusions from it.

Constraints: `intake_episodes` is keyed one-to-one with the appointment that
represents the front door to a first visit (`UNIQUE(appointment_id)`), not with
the patient, so a patient can carry more than one intake episode over time without
collision. An appointment reaching `completed` status removes its episode from
`buildQueue()`'s active set (the first completed visit ends intake); `no-show` and
`cancelled` do not, so outreach/rescheduling stays possible. Every new mutation
audits through the existing `AuditRepository` with new `intake_*` event-type
literals; nothing here introduces a second audit log. Access is enforced the same
way `care-completion-service.ts` enforces it: `canAccessPatient`/`assertPatientAccess`
re-checked per row and per write, never inferred from a queue row already existing.
Not built and explicitly deferred rather than faked: patient-facing secure-link
intake access (P7-F), OCR/extraction-candidate review, a real clearinghouse
`EligibilityAdapter`, a real `PaymentMethodAdapter`/tokenization processor,
practice-configurable requirement-rule UI (the requirement list itself — now
`computeIntakeChecklist`'s thirteen steps per D-076 — is a fixed foundation, not
yet practice-editable), and staged/escalating reminder automation. See
`ROADMAP.md` §13 (P7) for the remaining slices.

---

## D-076 — Intake truth-alignment and safety hardening: prospective identity, readiness accuracy, and the confirm-override boundary

Date: 2026-09-17. **Extended 2026-09-18 by D-077:** the boundary this entry drew
around `documents` and `insurance_policies` staying chart-only — "a larger,
separately-owned risk this pass does not take" — is closed. A prospect can now
complete government-ID, insurance-card, and coverage evidence before promotion,
using the same rows a chart would use. Read D-077 alongside this entry.

Decision: This corrects four seams D-075 got wrong against the intended Intake
workflow, without redesigning the foundation it built.

**1. A tentative caller is a prospective administrative identity, not a chart.**
`prospective_persons` (organization-scoped; name, DOB, phone, email, and a
promotion linkage only — no clinical field exists on the table for one to go in)
is the pre-chart stage:

`initial inquiry / tentative appointment -> prospective administrative identity
-> minimum identity confirmation / duplicate resolution -> deliberate
promotion/link to a durable patient chart -> full intake continues`

The calendar's "create new patient while booking tentatively" path
(`CalendarWorkspace.tsx`, D-072B/D-073) now calls `prospectivePersonService.create`
instead of `patientRecordService.create` when the booking status is tentative; a
*confirmed/scheduled* new-patient booking still creates a chart immediately exactly
as before, because that is a deliberate "this is a real patient, book them now"
action rather than an inquiry. `appointments.patient_id` — which never had a
database foreign key, tolerating the `event-...` non-patient sentinel already — now
also tolerates a `prospect-...` id, so a tentative hold can occupy calendar time
before any `patients` row exists. `PatientRepository.getById(prospectId)` returns
null by construction: nothing implicitly creates a chart from a held appointment.

Promotion (`prospectivePersonService.promote`) is the only door through:
`mode: "create"` reuses the ordinary patient-creation authority
(`organizationForNewPatient`, `PatientRepository.create`) with the prospect's
identity; `mode: "link"` attaches to an existing chart staff explicitly chose.
`findPossibleDuplicates` (exact DOB and/or normalized-name match, scoped to the
organization) surfaces candidates beforehand — it merges nothing and blocks
neither branch; a human always decides. Both branches relink every appointment
pointing at the prospect id (`AppointmentRepository.relinkSubject`) and every
Intake episode (`IntakeRepository.linkEpisodeToPatient`) to the real chart, and
retrying an already-promoted prospect fails closed rather than creating a second
chart. The prospect linkage is **kept**, not cleared, after promotion — evidence
collected before promotion (consents, forms, notes, eligibility, payment) is read
through a subject clause matching `patient_id = ? OR prospective_person_id = ?`,
so it stays visible afterward without being copied or duplicated into new rows.

Access to a prospect is organization membership only
(`assertProspectivePersonAccess` — no per-patient assignment scope, matching
D-074's precedent that front-door administrative work does not require clinical
permissions); once promoted, ordinary patient-access boundaries apply to the chart
and nothing about having handled the prospect widens that reach.

Six evidence/workflow tables (`intake_episodes`, `intake_notes`,
`consent_signatures`, `form_submissions`, `eligibility_checks`,
`payment_method_references`) had `patient_id NOT NULL` with (for the four evidence
tables) a foreign key to `patients`. SQLite cannot drop a `NOT NULL` constraint or a
foreign key in place, so migration `2026-09-17-002-intake-prospective-identity`
recreates each table with `patient_id` optional and a new nullable
`prospective_person_id` column (`relaxPatientIdToOptional`, a rename → create →
copy-by-id → drop sequence). This is safe on an existing database: copied rows keep
whichever id they already had, an already-valid foreign key stays valid on copy,
and NULL is exempt from FK checks entirely — no row is orphaned, duplicated, or
silently altered, and the migration is a no-op if run again. This does **not**
retroactively "uncreate" any chart D-073 already created for a prior tentative
caller; those appointments remain ordinary patient-linked, already-promoted-in-
effect Intake episodes, exercised by their own test path alongside the new
prospect-first one.

Not extended by this pass: `documents` and `insurance_policies` keep their existing
`patients` foreign key (recreating them is a larger, separately-owned risk this
pass does not take). A prospect's identity, contact, consents, forms, payment
readiness, and eligibility can therefore progress before promotion, but
government-ID and insurance-card/coverage evidence honestly wait for the chart —
the checklist reads an empty document list for a prospect rather than inventing a
capability that is not actually safe to add yet.

**2. Readiness now matches the intended definition, with steps that do not conflate
distinct facts.** `computeIntakeChecklist` grew from eleven steps to thirteen:
`insurance_details` (coverage on file or self-pay) split from `insurance_card`
(a card image received/reviewed — required and blocking only when insured, and
requiring a second image only when a second active policy exists), and
`plan_acceptance` (the practice's own participation decision) added alongside
`eligibility` (a payer-specific verification) as its own step rather than only
being visible through the queue stage. `eligibility` and `insurance_card` and
`plan_acceptance` are now `blocking: true` for an insured patient (previously
`eligibility` was never blocking) — matching the product definition of "ready for
first visit," with `confirmWithOverride` (below) as the explicit escape hatch for
a practice that needs to proceed anyway.

`matchPlanAcceptance()` no longer returns `not_accepted` merely because *some*
participation record exists and did not match this payer. It now requires an
affirmative, currently-active `out_of_network` record naming this exact payer;
absence of any configuration for this payer — regardless of how many other payers
are configured — is `needs_review`. `PayerPlanParticipation` gained an explicit
`status: "in_network" | "out_of_network"` field (previously only an `active`
boolean, which could not express an explicit exclusion at all).

`eligibility_checks` gained a structured, entirely-optional `BenefitEvidence`
(coverage status/dates, behavioral-health outpatient coverage, office/telehealth
copay, coinsurance, deductible and remaining, out-of-pocket max and remaining,
authorization/referral indicators, network context, payer message) — every field
absent means "not returned," never a guessed zero. `estimatePatientResponsibility()`
is a new pure projection over that evidence (a copay is a certain estimate;
coinsurance with an unconfirmed remaining deductible is not; no usable evidence
yields no estimate) — computed on read, never persisted as authoritative, always
distinguishable from a payer-returned fact. The 30-day eligibility freshness window
is now an explicit `IntakeFreshnessPolicy` value (`DEFAULT_INTAKE_FRESHNESS_POLICY`)
threaded through the projection instead of a bare module constant — the seam a
future practice-settings surface hangs off, not itself that surface.

**3. Government-ID review is its own evidence, distinct from generic document
status.** `identity_document_reviews` records an explicit human-confirmation event
— reviewer, result (`confirmed` / `conflict` / `needs_more_info`), legibility, a
required conflict note when in conflict — naming a specific document/version. The
`government_id` checklist step reads this table, not `documents.workflow_status`:
a document marked `reviewed` in the generic document workflow no longer reads as
identity confirmed on its own, and a review naming a document that has since been
superseded by a new upload no longer counts — the step reopens exactly as a
replaced ID should require. This is deliberately the human-confirmation foundation
a future OCR/extraction pipeline would feed, not OCR itself, which remains out of
scope for this pass as before.

**4. Confirming with incomplete requirements is an explicit, reasoned, audited
override — never the ordinary path.** The UI's plain "Confirm appointment" control
is only offered when every blocking step is satisfied. Otherwise, "Confirm
anyway…" opens a dialog that shows the current blockers and requires a non-empty
reason; `intakeService.confirmWithOverride` re-derives the blocker list from
current evidence itself (never trusts whatever the client last rendered), records
an `intake_notes` row (`kind: "override"`) and a dedicated
`intake_confirmed_with_override` audit event carrying the actor, reason, and
blocker ids, and only then performs the same `update_appointment_status` transition
the ordinary path uses. Nothing here is marked complete by an override, and no
appointment is autonomously cancelled, refused, or denied by the system — the
boundary section 23 of the intake brief and D-075 both already drew stays intact,
this closes the one gap in it (readiness silently allowing a plain confirm with
requirements outstanding, with no record of the decision).

Reason: reviewing the D-075 delivery against the intended workflow found each of
these was a real boundary error, not a style preference: a prospective caller
became a clinical chart merely by holding an appointment; "not accepted" could be
produced by a payer the practice never actually excluded; a reviewed document image
was read as confirmed identity with no human confirmation event behind it; and
staff could confirm an incomplete intake through the same control as a ready one,
leaving no trace that anything was missing.

Constraints: everything D-075 established that this decision does not name —
`intake_episodes`/`intake_notes` as staff-workflow state rather than clinical
truth, projection-not-storage for readiness, staff-attested-only consent/eligibility/
payment, the `intakeService`/`care-completion-service.ts`-shaped mutation boundary,
and the explicitly deferred slices (patient-facing secure-link access, OCR/AI
extraction, a real clearinghouse or payment processor, full practice-settings UI,
reminder transport) — remains as decided. No `ClinicalActionGateway` action was
added for prospect or override mutations, for the same reason none was added in
D-075: these are Intake's own evidence/workflow classes with their own inline
permission and access checks, not existing clinical or financial record types the
gateway already owns. Test coverage: `tests/intake-readiness.test.ts` (pure
projection logic — distinct-fact steps, plan-acceptance semantics, identity-review
semantics, benefit-evidence/estimate honesty) and `tests/intake-workflow.test.ts`
(full repository/service integration — prospect lifecycle, duplicate surfacing,
promotion by both modes, retry-safety, cross-organization denial, override
confirmation, the legacy patient-first path still working unchanged).

---

## D-077 — Intake truth-continuity: prospect-stage documents and coverage are the same rows after promotion

Date: 2026-09-18.

Decision: D-076 deliberately left `documents` and `insurance_policies` chart-only,
so a prospect's government ID, insurance card, and coverage information honestly
waited for a chart even though every other Intake evidence class could progress
pre-chart. This closes that gap using the same relaxation pattern D-076 already
established, and no new tables.

**1. `documents` and `insurance_policies` now support a prospect subject, exactly
like the six D-076 evidence tables.** Migration `2026-09-18-001-document-insurance-
prospective-identity` relaxes `documents.patient_id` and `insurance_policies.patient_id`
to optional and adds a nullable `prospective_person_id` alongside each — the same
`relaxPatientIdToOptional` rename → create → copy → drop sequence, safe on an
existing database and a no-op if re-run. `ClinicalRecordRepository` gained
subject-aware siblings of the existing patient-only functions —
`documentsBySubject`/`createDocumentForSubject` and
`insuranceBySubject`/`addInsuranceForSubject` — rather than changing the existing
`documents`/`addInsurance`/etc. signatures that the patient chart already
depends on; the chart's own Documents and Coverage surfaces are unchanged code,
reading the same tables exactly as before.

**2. Every table with a foreign key to `documents` had to be recreated together,
not just `documents` itself.** SQLite rewrites a referencing table's `FOREIGN KEY`
clause to follow a `RENAME TO` of the table it targets. Renaming `documents` away
silently retargeted `document_versions`, `document_workflow_events`, and
`identity_document_reviews`'s foreign keys at the about-to-be-replaced legacy
table; dropping that legacy table then triggers SQLite's implicit
delete-before-drop, which either fails outright against `document_versions`/
`document_workflow_events`'s `ON DELETE RESTRICT`, or — on a database that
already has real `identity_document_reviews` rows from a prior D-076 deployment —
would silently cascade-delete them. `relaxDocumentsCluster()` (in
`app/server/db/migrations.ts`) recreates all four tables together, in the order
that repoints every dependent's foreign key at the new `documents` table before
the legacy one is ever dropped. This was caught by running the migration against
copies of the real development and browser-test databases before trusting it, not
by reasoning alone — a fresh empty database never exercises RESTRICT/CASCADE
because it has nothing to restrict or cascade.

**3. Promotion (`prospectivePersonService.promote`) now also relinks documents
and coverage — the same rows, not copies.** `ClinicalRecordRepository.linkDocumentsToPatient`/
`linkInsuranceToPatient` `UPDATE ... SET patient_id = ? WHERE prospective_person_id
= ? AND patient_id IS NULL`, so the exact row a prospect uploaded or entered gains
`patient_id` while keeping `prospective_person_id` for provenance — never cleared,
matching how `linkEpisodeToPatient` already treated the episode itself. No new
document/version/policy row is created, no historical `document_workflow_events`
row is rewritten (they remain, correctly, immutable events that happened while
the person was still a prospect), and the `patient_id IS NULL` guard makes the
relink idempotent — calling it again after a successful promotion touches
nothing, matching the existing "promoting an already-promoted prospect fails
closed" guarantee at the service layer. Because the chart's own `documents`/
`insurance_policies` reads are unchanged (`WHERE patient_id = ?`), the same rows
become visible on the patient's Documents and Coverage surfaces automatically,
with zero changes to those surfaces' code.

**4. Linking to an *existing* chart adds coverage rather than overwriting it.**
`addInsuranceForSubject`/promotion never touch a row that isn't the prospect's
own — an existing patient's own primary policy stays exactly as it was, and the
prospect's policy becomes an additional row (its own `coverage_priority`, plainly
visible next to the existing one) rather than a silent replacement or merge. This
is the same "never resolve automatically" posture D-076 already established for
possible-duplicate patients: an actual conflict (e.g., two priority-1 policies
after linking) is left visible for a human to resolve through the ordinary
Coverage editor, not guessed at.

**5. Document workflow events and identity confirmation work identically
pre-chart.** `intakeService.uploadDocument`/`transitionDocument` are the
prospect-safe (and patient-safe) siblings of the ordinary `create_document`/
`transition_document_workflow` `ClinicalActionGateway` actions, gated by
`edit_patient` rather than `manage_clinical_record` — matching D-074/D-076's
precedent that front-desk Intake work does not require clinical-chart
permissions. They are a deliberately separate path, not a widening of the
gateway's own patient-only binding logic (`patient-action-binding.ts` is
untouched). `intakeService.recordIdentityDocumentReview` is now subject-aware
(`IntakeSubject` in place of a bare `patientId`), so a prospect's identity can be
explicitly confirmed — or left in conflict, or reopened by a superseding upload —
before any chart exists, using the exact same `identity_document_reviews`
evidence record and `identityStepState()` logic a chart already used. Document
review still does not mean identity confirmed, pre-chart or post-chart alike.

**6. Content capture stays honest about what this build actually has.** There is
still no binary/object storage — the new prospect-facing capture panel writes
plain text into `document_versions.content_text`, the same mechanism
`PatientDocuments.tsx` already uses, and says so in the UI rather than implying a
camera/scanner pipeline that does not exist. Source/provenance fields already
support a future capture-source distinction; none was added speculatively.

Reason: D-076 was correct to scope `documents`/`insurance_policies` out as "a
larger, separately-owned risk" for that pass, but the resulting gap was real: a
prospect who had confirmed their identity and entered coverage still could not
complete the two pieces of evidence — a government ID and a card image — that
most concretely stand between a tentative caller and a safe first visit. Closing
it required exactly one more application of the pattern D-076 already proved
safe, plus the FK-rewrite-on-rename coordination `documents`' being referenced by
three other tables specifically required.

Constraints: everything D-076 decided and this entry does not name — the
prospective-identity boundary itself, promotion's duplicate-surfacing and
audit requirements, the confirm-override boundary, readiness as a pure
projection — remains as decided. No OCR, AI extraction, patient-facing upload,
or real object/binary storage was added; the prospect-facing capture panel is
staff-operated, plain-text, and synthetic, exactly like the existing patient-chart
one. Test coverage: `tests/intake-document-coverage-continuity.test.ts` (prospect
document/coverage lifecycle, cross-organization denial, document workflow events
and identity review pre-chart, superseded-ID reopening, promotion preserving the
same rows and being idempotent, linking to an existing chart without overwriting
its coverage, legacy patient-bound document/coverage behavior unchanged, no
orphaned rows) and `tests/browser/intake-workspace.spec.ts` (the full pre-chart
flow through a real browser: government ID upload → workflow review → identity
confirmation, coverage entry, insurance-card upload → review, promotion, and the
same evidence appearing on the newly created chart's Documents and Coverage
surfaces).
