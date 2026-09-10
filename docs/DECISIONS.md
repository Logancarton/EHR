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
