# External Prescription Transactions

## Purpose

Phase 4F introduced a vendor-neutral transaction layer between authorized prescription intent and external prescribing transport. Phase 4G added CancelRx relationships. Phase 4H added refill/renewal workflow requests. Phase 4I added pharmacy/vendor change requests. Phase 4J adds a verified public callback boundary in front of those existing inbound services without making core prescribing vendor-specific.

The core authority/workflow classes remain deliberately separate:

1. **Medication truth** — the clinician's authoritative longitudinal statement of what the patient is taking.
2. **Prescription intent** — what the clinician intends to prescribe.
3. **External prescription transaction state** — what the EHR knows about transport/network processing of that prescription intent.
4. **Medication reconciliation evidence** — patient/vendor/import evidence that may inform medication truth only after explicit clinician reconciliation.
5. **Prescription workflow request state** — refill/renewal or pharmacy/vendor change requests asking for clinician review; they may later seed a new prescription intent but are not prescription transactions or medication facts.

The Phase 4J callback receipt is a security/replay record around inbound external evidence, not a new clinical authority class. No class automatically promotes itself into another.

## Signal flow

Outbound:

`clinician -> authorized prescription intent -> ClinicalActionGateway transmit action -> prescription transaction -> vendor-neutral adapter -> external network`

Inbound verified transaction evidence:

`raw vendor callback -> vendor-specific verification adapter -> VerifiedPrescriptionCallback -> durable replay/binding receipt -> EHR correlation resolution -> normalized transaction event -> transaction state/history -> audit/provenance -> reconciliation evidence when clinically relevant -> explicit clinician review`

Inbound refill request:

`raw vendor callback -> verification -> normalized refill request -> pending prescription_refill_requests workflow -> explicit patient-bound renewal action -> NEW staged prescription intent -> ordinary authorization -> ordinary new_rx transaction`

Inbound pharmacy change request:

`raw vendor callback -> verification -> normalized change request -> pending prescription_change_requests workflow -> explicit patient-bound accept/decline -> if accepted, NEW staged replacement intent -> ordinary authorization -> ordinary new_rx transaction`

Cancellation:

`transmitted prescription transaction -> explicit clinician cancellation request -> patient-bound ClinicalActionGateway -> linked cancel_rx transaction -> adapter submission -> normalized external acknowledgement/completion`

Never:

`raw callback -> repository mutation`

Never:

`vendor response/request -> patient_medications UPDATE`

Never:

`external callback -> ClinicalActionGateway pretending to be a clinician`

Never:

`refill/change request -> automatic prescription authorization/transmission or medication-truth change`

Never:

`pharmacy change request -> rewrite the historical prescription order/transaction or automatically cancel it`

## Transaction model

`prescription_transactions` stores the current normalized transport state for an order while `prescription_transaction_events` preserves append-only event history. A transaction carries EHR-owned identity and routing data including:

- internal transaction ID
- order ID
- patient ID
- adapter/vendor identity
- transaction type
- normalized state
- destination/pharmacy reference
- bounded external reference when available
- EHR correlation ID
- idempotency key
- attempt count
- transport timestamps
- latest sanitized failure summary
- creation provenance
- optional related transaction ID for the same-order cancellation relationship

Failures and retries remain inspectable rather than overwritten. SQLite triggers reject UPDATE and DELETE on `prescription_transaction_events`.

Normalized lifecycle states include `prepared`, `submitted`, `acknowledged`, `accepted`, `rejected`, `failed`, `cancellation_requested`, `cancellation_acknowledged`, `canceled`, and `change_requested`. These describe transport/workflow state only. A `change_requested` transaction state is not the Phase 4I clinician workflow object; detailed normalized change requests live in `prescription_change_requests`.

A successful outbound adapter call moves a transaction to `submitted`. It does not infer `acknowledged` or `accepted`; those require normalized external evidence. Even `accepted` does not prove dispensing, pickup, ingestion, adherence, or current use.

## Phase 4G cancellation relationship

A CancelRx request is a new `cancel_rx` prescription transaction linked to the original `new_rx` transaction through `related_transaction_id`. The cancellation keeps the same patient/order identity but receives its own transaction ID, correlation ID, idempotency key, attempts, state, immutable events, provenance, and audit history.

The original prescription transaction is not rewritten into a cancellation record.

Lifecycle:

`cancellation_requested -> prepared attempt -> submitted -> cancellation_acknowledged -> canceled`

Failed/rejected cancellation attempts may retry on the same cancellation transaction. Repeating the same cancellation after submission/acknowledgement/completion is idempotent.

An adapter returning success for cancellation means submission was accepted, not that the network/pharmacy completed cancellation. Development prescribing adapters remain fail closed and do not fabricate regulated network success.

Prescription cancellation and medication discontinuation remain separate clinician decisions. A clinician who also wants medication truth discontinued must perform the explicit medication lifecycle action through `ClinicalActionGateway`.

## Phase 4H refill/renewal request model

A refill request is deliberately not a `prescription_transactions` row before a clinician creates/authorizes a new outbound prescription. It is workflow evidence asking for review.

`prescription_refill_requests` stores durable lineage to:

- patient
- prior medication order
- prior transmitted `new_rx` transaction
- request source and bounded source reference
- stable EHR-owned idempotency identity
- newly staged renewal order, once created
- version/provenance and audit history

Local workflow:

`pending -> renewal_staged`

`renewal_staged` means only that a new reviewable prescription intent exists. It does not mean approved, authorized, transmitted, dispensed, or taken.

The prior order and prior `new_rx` transaction remain historical. The refill lifecycle does not reopen them, resend their prior transport payload, or change their transport state.

### Creating a renewal intent

The human `renew_prescription` action is patient-bound through the durable refill row and requires existing staging authority. It creates a deterministic new staged medication order through the normal prescription-intent architecture.

Only reviewable prescription fields are copied forward. Prior authorization/transmission receipts, credentials, medication-truth confirmation, and historical start date are not copied. The new order carries refill/source lineage and undergoes ordinary deterministic prescription review.

Next steps remain separate:

`staged renewal intent -> authorize_order -> transmit_order -> NEW new_rx transaction`

The refill request itself never directly calls the prescribing adapter.

### Refill idempotency

Refill requests use stable EHR-owned idempotency based on the prior EHR transaction plus stable request source/reference. Replaying the same request does not duplicate the workflow row. Renewal staging uses a deterministic resulting order identity bound to the refill request, so repeated clinician clicks return the same staged order.

Phase 4J verified pharmacy refill callbacks now provide the external ingestion route. They create only the pending refill workflow request; they do not execute `renew_prescription`.

## Phase 4I pharmacy/vendor change-request model

A pharmacy/vendor request to modify a prescription is not clinician prescription intent. `prescription_change_requests` is a dedicated workflow entity rather than a rewrite of the historical order or an already-authorized replacement transaction.

A durable change request retains bounded normalized fields only:

- internal request ID and patient ID
- source transmitted `new_rx` transaction and source order
- adapter/vendor identity
- stable external request ID
- request category
- normalized requested prescription changes
- sanitized human-readable summary/source reference
- `pending`, `accepted`, or `declined` state
- resulting staged order ID when accepted
- resolution actor/timestamp/decision
- received/created/updated timestamps
- version/provenance and audit history

Raw vendor payloads and arbitrary metadata are not stored.

External request identity is unique by `(adapter_id, external_request_id)`. Replays return the same request. That identity cannot be rebound to another patient, source order, source transaction, or conflicting normalized request meaning.

### Accept and decline semantics

The human action is `respond_to_prescription_change_request`. `ClinicalActionGateway` resolves patient identity from the durable change-request row and requires matching active-patient context. AI-originated execution is rejected. Acceptance requires staging authority.

Decline:

`pending change request -> declined`

No prescription order is created. Prior order, prior transaction, medication truth, and reconciliation evidence remain unchanged.

Accept:

`pending change request -> exactly one NEW staged replacement order -> accepted`

The new order uses the existing prescription-intent/review system. Normalized requested changes are applied only over reviewable prior prescription fields. Historical start date, authorization/transmission receipt, medication-truth confirmation, and credential material are not copied. If medication identity changes, the old authoritative medication association is not automatically carried forward.

Next steps remain separate:

`staged replacement intent -> authorize_order -> transmit_order -> NEW new_rx transaction`

The old prescription is not automatically canceled.

### Relationship model remains explicit

`prescription_transactions.related_transaction_id` continues to mean the same-order CancelRx relationship.

Cross-order lineage remains explicit:

- refill: `prescription_refill_requests(prior_order_id, prior_transaction_id, renewal_order_id)`
- pharmacy change: `prescription_change_requests(source_order_id, source_transaction_id, resulting_order_id)`
- same-order cancellation: `prescription_transactions.related_transaction_id`

Phase 4J does not introduce or require a generic relationship graph. Reconsider one only when another real workflow demonstrates shared semantics that materially simplify multiple lifecycles without weakening patient binding or auditability.

## Phase 4J verified callback model

Phase 4J exposes one narrow public route:

`POST /api/integrations/prescribing/callback?adapter=<configured-adapter-id>`

The route identifier chooses a verification adapter only. It is not vendor authentication and never chooses the patient.

The public handler enforces a 64 KiB body limit, rejects unsupported adapters, requires successful verification, rejects malformed verified envelopes, and passes only verified normalized callback data into core processing. Ordinary EHR session authentication is not used as vendor authentication.

### Vendor-specific verification stays inside adapters

`PrescriptionCallbackVerificationAdapter` is the seam future vendor adapters implement. Raw HTTP headers/body bytes are available transiently to the verifier so it can apply the contracted authenticity mechanism. The verifier then emits only a bounded vendor-neutral `VerifiedPrescriptionCallback`.

Core EHR code does not understand DrFirst/Surescripts-specific signatures, proprietary headers, mTLS rules, or vendor message schemas.

Current development prescribing adapters resolve to fail-closed callback verifiers. They cannot simulate successful DrFirst, Surescripts, or DoseSpot callback verification.

### Supported callback categories

Only these categories are routed:

1. **`transaction-event`** -> existing `PrescriptionTransactionService.ingestVendorEvent`
2. **`refill-request`** -> existing refill workflow persistence, pending only
3. **`change-request`** -> existing `PrescriptionChangeRequestService.recordChangeRequest`, pending only

Phase 4J does not accept ePA, formulary, eligibility, PDMP, EPCS, or broad medication-history callbacks merely because the envelope could later be extended.

## Callback correlation and patient binding

The EHR-generated transaction `correlationId` is the routing authority for all supported callback categories.

Core processing first resolves the durable prescription transaction by correlation ID. The transaction determines patient and source order identity. Vendor-supplied patient, order, or transaction IDs are consistency assertions only. A mismatch fails closed.

The verified adapter ID must also match the adapter already bound to the correlated transaction.

A callback cannot switch charts using untrusted patient identity.

Human cancellation, renewal staging, and change-request response remain separately patient-bound through `ClinicalActionGateway`, which resolves identity from durable server-side records and compares it with the active chart context.

## Callback replay protection

`prescription_callback_receipts` provides durable callback-envelope replay/binding protection.

Stable callback identity is:

`(adapter_id, external_message_id)`

Each receipt also records:

- callback category
- EHR correlation ID
- SHA-256 fingerprint of bounded normalized callback meaning
- resolved patient/order/transaction IDs
- processing/rejection status
- optional resulting transaction-event/refill/change-request ID
- timestamps

Exact re-delivery of an already-processed verified callback is idempotent and does not repeat downstream mutation.

The same callback identity can never be rebound to a different callback category, correlation, normalized event/request meaning, patient, order, or transaction. Conflicts fail closed.

This envelope-level protection is durable and complements existing transaction-event/refill/change-request idempotency; it does not replace those lower-layer safeguards.

## Reusable read surfaces

The permission-aware transaction/refill and change-request APIs remain the clinician-facing reusable read boundaries. Phase 4J does not add a large callback UI or expose callback receipts as a general clinical surface.

Transaction projection includes bounded normalized transaction identity/type/state, attempts, relationship summaries, safe external references, lifecycle timestamps, sanitized error summary, stable transaction/event references, and immutable event summaries. It excludes arbitrary event metadata/raw adapter payloads.

Refill projection exposes bounded request identity/lineage/source/status/timestamps. Change projection exposes bounded source lineage, adapter/external identity, category, requested changes, summary, resolution state, and resulting order when present.

All clinical reads require `read_clinical` permission and active-patient context. Endpoints do not accept arbitrary patient IDs to switch charts.

Transaction/refill/change/callback state remains outside `ContextAssembler` in Phase 4J.

## Idempotency and retries

Outbound prescription identity is stable per order/transaction type. Retries increment attempts on the same transaction while append-only events preserve each attempt/failure.

Normalized inbound transaction events remain idempotent by adapter/event identity. Callback-envelope replay protection now runs before that event layer.

CancelRx uses stable target-derived idempotency and the same linked cancellation transaction for retries.

Refill request replay and renewal-stage replay are independently idempotent. Change-request ingestion and clinician accept/decline are independently idempotent.

The callback layer never weakens or substitutes for these existing rules.

## Medication evidence

A verified external transaction event may carry clinically meaningful medication evidence such as future dispense status. That evidence is converted into a pending `medication_reconciliation_candidates` record with source type `external-vendor` through the existing evidence path.

A refill request alone is not medication evidence. A pharmacy change request alone is not medication evidence. Neither establishes dispensing, possession, ingestion, adherence, or current clinical use.

External evidence cannot select or mutate an authoritative medication record. Medication truth changes continue only through explicit reconciliation or explicit prescription-medication-truth confirmation pathways.

CancelRx does not automatically discontinue medication truth. Renewal/replacement staging, authorization, transmission, callback receipt processing, or external transport acceptance likewise do not add/update/discontinue/reactivate medication truth.

## Secrets and raw vendor payloads

Orders, transaction events, refill/change requests, callback receipts, audit logs, and provenance records are not credential stores.

The callback verifier may transiently inspect raw headers/body/signatures, but core persistence receives only whitelisted normalized data. Unknown/raw transport fields are discarded before durable processing.

Do not persist:

- raw callback bodies or opaque vendor payloads
- authentication/signature headers
- cookies
- API keys or access tokens
- passwords
- PINs/OTPs/2FA secrets
- private signing material
- arbitrary vendor transport metadata

`prescription_callback_receipts` retain only bounded replay/binding identity, normalized fingerprints, state, and resulting EHR references. Audit/provenance retain only safe attribution and internal result metadata.

Production credentials belong in secure infrastructure such as a secrets manager/KMS-backed configuration path with rotation/access controls.

## AI authority

AI may later receive permission-aware transaction/refill/change-request summaries as distinct read-only context slices, but Phase 4J does not add them to `ContextAssembler`.

AI cannot:

- authenticate/verify or ingest vendor callbacks
- create/mutate callback receipts
- approve or execute refill renewal
- create the clinician-staged renewal through `renew_prescription`
- accept or decline a pharmacy change request
- authorize a prescription
- start/retry prescription transmission
- create/alter external transaction state through the callback path
- submit/retry cancellation
- reconcile external medication evidence
- mutate medication truth
- decide controlled-substance refill/change legality or EPCS validity

AI may draft/propose prescription intent or summarize future read-only workflow state, but consequential lifecycle actions remain explicit authenticated human actions.

## Human and external-system authority

Human consequential actions:

`authenticated EHR user -> server-derived role/permissions -> active patient binding -> ClinicalActionGateway -> clinician-authoritative mutation`

External vendor evidence:

`untrusted HTTP -> vendor verification -> bounded normalized callback -> durable replay/correlation checks -> external workflow/transport evidence`

These are intentionally different authority classes. The external path does not impersonate a provider or use `ClinicalActionGateway` as a substitute for vendor authentication.

External systems may report or request. They do not decide what the clinician prescribed, approved, reconciled, or believes the patient is taking.

## DrFirst readiness

### Ready in core EHR

- vendor-neutral `EPrescribingAdapter`
- authorized prescription intent and patient-bound transmission action
- linked vendor-neutral CancelRx lifecycle
- refill/renewal request lineage to prior prescription and new staged intent
- pharmacy change-request lineage to source prescription and staged replacement intent
- EHR-owned transaction/correlation/idempotency/retry/event identity
- append-only normalized transaction history
- bounded transaction/refill/change-request read projections
- vendor-neutral callback verification interface
- public callback ingress with bounded adapter selection and body-size limits
- durable `(adapter_id, external_message_id)` callback replay/binding protection
- correlation-ID-authoritative routing with patient/order/transaction assertion checks
- routing into existing transaction/refill/change-request services
- external-medication-evidence-to-reconciliation boundary
- bounded callback audit/provenance without raw transport persistence
- fail-closed development callback verification placeholders

See [`PRESCRIPTION_CALLBACKS.md`](PRESCRIPTION_CALLBACKS.md) for the detailed inbound security boundary.

### Belongs inside a future DrFirst adapter

- DrFirst request/response/callback schemas and identifiers
- DrFirst-specific transaction/message codes
- API/SDK client behavior
- contracted callback/webhook signature or authenticity verification
- vendor-specific timestamp/nonce/signature replay inputs before normalized envelope creation
- mapping DrFirst messages into supported normalized transaction/refill/change categories
- DrFirst pharmacy/network routing details
- DrFirst SSO/embed launch behavior if contracted
- real CancelRx transport/response mapping
- pharmacy refill/renewal normalization and prescriber response transport
- pharmacy change-request normalization and vendor response transport
- EPCS ceremony/verification integration
- PDMP, medication-history, formulary/benefit, eligibility, ePA behavior

Vendor-specific fields must not be pushed into core medication/prescription models merely to simplify adapter code.

### Secure infrastructure still required

- production secrets management/rotation
- tenant/environment-specific adapter configuration
- real production vendor verification configuration
- TLS/deployment controls
- durable queue/outbox/retry semantics appropriate to production network delivery
- operational monitoring, reconciliation, and alerting for uncertain/failing callbacks or outbound sends
- formal production database migrations

### Contract/onboarding/certification work

Real DrFirst integration still depends on commercial/regulatory prerequisites such as agreements/BAA, implementation access, tenant/practice/provider onboarding, sandbox/test credentials, certification/testing, production approval, EPCS identity proofing/credentialing, and network enablement required by the contracted product.

The EHR must not claim those capabilities until they actually exist.

## Recommended next slice

Phase 4J completes the vendor-neutral callback security seam. The next prescription-integration phase should stay narrow rather than adding broad message categories.

A sensible next step is production integration/operational readiness around this seam: formal adapter configuration identity, secrets/KMS handling, durable delivery/reconciliation/observability strategy, and formal migrations—then connect one real contracted prescribing vendor using its actual authentication and message specifications.

Do not implement DrFirst-specific business logic in core models before those contract details are known. Do not broaden into ePA/formulary/eligibility/PDMP/EPCS merely because the callback envelope could support them later.
