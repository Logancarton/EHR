# External Prescription Transactions

## Purpose

Phase 4F introduced a vendor-neutral transaction layer between authorized prescription intent and any future external prescribing vendor. Phase 4G added clinician-facing cancellation relationships and a bounded reusable transaction-status surface. Phase 4H added the refill/renewal workflow slice. Phase 4I adds pharmacy/vendor prescription change requests while preserving the distinction between what a pharmacy asks to change, what a clinician actually prescribes, and what the clinician believes the patient is taking.

The core authority classes are deliberately separate:

1. **Medication truth** — the clinician's authoritative longitudinal statement of what the patient is taking.
2. **Prescription intent** — what the clinician intends to prescribe.
3. **External prescription transaction state** — what the EHR knows about transport/network processing of that prescription intent.
4. **Medication reconciliation evidence** — patient/vendor/import evidence that may inform medication truth only after explicit clinician reconciliation.
5. **Prescription workflow request state** — refill/renewal or pharmacy/vendor change requests asking for clinician review that may later seed a new prescription intent but are not themselves prescription transactions or medication facts.

No class automatically promotes itself into another.

## Signal flow

Outbound:

`clinician -> authorized prescription intent -> ClinicalActionGateway transmit action -> prescription transaction -> vendor-neutral adapter -> future external network`

Inbound transaction evidence:

`verified future vendor callback/message -> vendor adapter normalization -> normalized transaction event -> transaction state/history -> audit/provenance -> reconciliation evidence when clinically relevant -> explicit clinician review`

Cancellation:

`transmitted prescription transaction -> explicit clinician cancellation request -> patient-bound ClinicalActionGateway -> linked cancel_rx transaction -> adapter submission -> normalized external acknowledgement/completion`

Refill/renewal:

`prior transmitted prescription -> refill/renewal request -> explicit patient-bound review action -> NEW staged prescription intent/order -> ordinary authorization -> ordinary new_rx transport transaction`

Pharmacy/vendor change request:

`prior transmitted prescription -> trusted adapter-normalized change request -> durable non-authoritative request -> explicit patient-bound accept/decline -> if accepted, NEW staged replacement prescription intent/order -> ordinary authorization -> ordinary new_rx transport transaction`

Never:

`vendor response -> patient_medications UPDATE`

and never:

`CancelRx -> automatic medication discontinuation`

and never:

`refill/change request -> automatic prescription authorization/transmission or medication-truth change`

and never:

`pharmacy change request -> rewrite the historical prescription order/transaction or automatically cancel it`

## Transaction model

`prescription_transactions` stores the current normalized transport state for an order while `prescription_transaction_events` preserves the event history. The transaction carries EHR-owned identity and routing data such as:

- internal transaction ID
- order ID
- patient ID
- adapter/vendor identity
- transaction type
- normalized state
- destination/pharmacy reference
- external reference when available
- EHR correlation ID
- idempotency key
- attempt count
- transport timestamps
- latest sanitized failure summary
- creation provenance
- optional related transaction ID for lifecycle relationships such as cancellation

Events are append-only records of individual internal/outbound/inbound facts. Failures and retries remain inspectable rather than being overwritten by the latest state. SQLite triggers reject UPDATE and DELETE on `prescription_transaction_events`.

Current normalized lifecycle concepts include `prepared`, `submitted`, `acknowledged`, `accepted`, `rejected`, `failed`, `cancellation_requested`, `cancellation_acknowledged`, `canceled`, and `change_requested`. These names describe transport/workflow state only. A `change_requested` transaction state is not the Phase 4I clinician workflow object; normalized pharmacy change-request details live in `prescription_change_requests` so request evidence is not collapsed into transport state.

A vendor/adapter returning a successful outbound call moves the transaction to **submitted**. It does not infer `acknowledged` or `accepted`. Those later states require normalized external evidence.

Even `accepted` does not mean the medication was dispensed, picked up, started, or currently taken.

## Phase 4G cancellation relationship

A CancelRx request is represented as a new `cancel_rx` prescription transaction linked to the original `new_rx` transaction through `related_transaction_id`. The cancellation transaction keeps the same patient/order identity and receives its own EHR-owned transaction ID, correlation ID, idempotency key, attempt count, current state, immutable events, provenance, and audit history.

The original prescription transaction is not rewritten into a cancellation record. Its transport history remains what actually happened to that original transaction. The linked cancellation transaction answers the separate question: what happened to the attempt to withdraw that external prescription instruction?

The local lifecycle is deliberately precise:

`cancellation_requested -> prepared attempt -> submitted -> cancellation_acknowledged -> canceled`

`failed` or `rejected` cancellation attempts may retry on the same cancellation transaction so attempt history is retained. Repeating the same cancellation action after submission/acknowledgement/completion is idempotent and does not resubmit a duplicate cancellation.

An adapter returning `true` from the current cancellation interface means only that it accepted the cancellation for submission. It is not evidence that a pharmacy/network acknowledged or completed the CancelRx. Development DrFirst, Surescripts, and DoseSpot placeholders continue returning `false` and never fabricate regulated network success.

Prescription cancellation and medication discontinuation are separate clinician decisions. A clinician who also wants to mark the medication as discontinued must perform the existing explicit medication-truth mutation through `ClinicalActionGateway`.

## Phase 4H refill/renewal request model

A refill request is deliberately **not** stored as a `prescription_transactions` row before a clinician has created/authorized a new outbound prescription intent. A pharmacy request, patient request, or internally recorded renewal request is workflow evidence asking for review; treating it as transport state would blur the authority boundary established in Phase 4F.

Phase 4H therefore adds `prescription_refill_requests` as a small companion workflow entity. It stores durable lineage to:

- the patient
- the prior medication order
- the prior transmitted `new_rx` transaction
- the request source and bounded source reference
- stable EHR-owned idempotency identity
- the newly staged renewal order, once created
- version/provenance history and audit events

The refill request has a narrow local workflow:

`pending -> renewal_staged`

`renewal_staged` means only that a new reviewable prescription intent/order was created. It does not mean approved, authorized, transmitted, dispensed, or taken.

The old order and old `new_rx` transaction remain historically intact. Phase 4H does not reopen them, increment a refill counter on them, resend their old transport payload, or change their transaction state.

### Creating the new renewal intent

The `renew_prescription` clinical action is patient-bound through the durable refill-request row and requires the existing staging authority. It creates a deterministic new staged medication order using the existing prescription-intent/order architecture.

Only relevant prior intent fields are copied forward for review, such as medication, dose/strength, form, route, frequency, quantity, days supply, refill count, substitution flag, SIG, indication, pharmacy, controlled-substance schedule, and an explicit associated medication record when one already existed. Prior authorization/transmission receipts, credentials, medication-truth confirmation, and the old start date are not copied forward.

The new staged intent receives its own source reference pointing to the refill request and durable `renewalSource` identifiers for the prior order/transaction. It is still subject to the normal deterministic prescription review and duplicate checks.

The next authority steps are unchanged:

`staged renewal intent -> ordinary authorize_order -> ordinary transmit_order -> NEW new_rx transaction`

The refill request never directly calls the prescribing adapter.

### Refill idempotency

A refill request uses a stable EHR-owned idempotency identity derived from the prior EHR transaction, request source, and stable source reference when one is available. Replaying the same request does not duplicate the workflow row.

The clinician renewal action uses a deterministic renewal order identity bound to the refill request. Repeated clicks return the same staged order rather than creating duplicate prescription intents.

Future authenticated vendor refill callbacks may supply vendor message identifiers as source-reference assertions after adapter verification, but no public refill webhook exists in Phase 4H.

## Phase 4I pharmacy/vendor change-request model

A pharmacy/vendor request to modify a prescription is also deliberately **not** treated as clinician prescription intent. Phase 4I adds `prescription_change_requests` as a dedicated workflow entity rather than rewriting the historical order or representing the request as an already-authorized replacement transaction.

A durable change request retains only bounded normalized fields:

- internal request ID and patient ID
- source transmitted `new_rx` transaction and source order
- adapter/vendor identity
- stable external request ID
- request category
- normalized requested prescription changes
- sanitized human-readable summary and bounded source reference
- `pending`, `accepted`, or `declined` clinician workflow state
- resulting staged order ID when accepted
- resolution actor/timestamp/decision
- received/created/updated timestamps
- record-version, provenance, and audit history

Raw vendor payloads and arbitrary metadata are not stored.

External request identity is unique by `(adapter_id, external_request_id)`. Replays return the same request. The same external identity cannot be rebound to a different patient, source order, or source transaction, and conflicting normalized replay content is rejected.

### Accept and decline semantics

The human action is `respond_to_prescription_change_request`. `ClinicalActionGateway` resolves patient identity from the durable change-request row and requires matching active-patient context. AI-originated execution is rejected. The action requires the existing `stage_order` authority because acceptance can create a staged prescription.

Decline:

`pending change request -> declined`

No prescription order is created. The prior order, prior transaction, medication truth, and reconciliation evidence remain unchanged.

Accept:

`pending change request -> exactly one NEW staged replacement order -> accepted`

The new staged order uses the existing medication prescription-intent and deterministic review system. Normalized requested changes are applied over reviewable prior prescription fields. Historical start date, prior authorization/transmission receipt, medication-truth confirmation, and credential material are not copied. The staged order carries `changeRequestSource` lineage plus `sourceReference = prescription-change-request/<id>`.

If the request changes medication identity, the replacement does not automatically preserve the old authoritative medication association. The normal medication relationship/review logic must determine the implication. Acceptance still does not change medication truth.

The next authority steps remain ordinary and separate:

`staged replacement intent -> ordinary authorize_order -> ordinary transmit_order -> NEW new_rx transaction`

The old prescription is not automatically canceled. If a future workflow requires cancel-old plus transmit-replacement, those remain distinct authoritative actions even if a UI coordinates them.

### Why there is still no generic prescription relationship graph

Phase 4G's `related_transaction_id` represents a same-order transport relationship: a `cancel_rx` transaction points to the original `new_rx` transaction and the repository enforces matching patient/order identity.

Refill renewal and pharmacy replacement now provide two cross-order workflows, but their shared semantics are still too shallow to justify a generic relationship primitive. Refill requests have refill-source/idempotency semantics and a `renewal_staged` resolution. Pharmacy change requests have adapter/external-request identity, requested-change content, and explicit accept/decline decisions.

Cross-order lineage therefore remains explicit:

- refill: `prescription_refill_requests(prior_order_id, prior_transaction_id, renewal_order_id)`
- pharmacy change: `prescription_change_requests(source_order_id, source_transaction_id, resulting_order_id)`
- same-order cancellation: `prescription_transactions.related_transaction_id`

A generic typed relationship model should be introduced only when another real workflow demonstrates shared relationship semantics that materially simplify multiple existing workflows without weakening patient binding, historical identity, or auditability.

## Reusable read surfaces

The permission-aware `app/api/prescription-transactions/route.ts` surface remains the reusable read boundary for prescription transaction and refill state. Phase 4I adds a semantically separate `app/api/prescription-change-requests/route.ts` read/respond surface rather than overloading the transaction route further.

Transaction projection includes normalized transaction identity/type/state, attempt count, relationship summaries, safe external reference IDs, lifecycle timestamps, latest sanitized error summary, stable transaction/event references, and recent immutable event summaries. It intentionally excludes arbitrary event metadata and raw adapter payloads.

The refill projection contains request identity, patient/prior-order/prior-transaction lineage, request source, bounded source reference, current request status, optional renewal order identity, timestamps, and stable record references. Free-text request notes and idempotency internals are not exposed through this reusable projection.

The change-request projection contains request identity, patient/source-order/source-transaction lineage, adapter/vendor identity, external request ID, category, bounded normalized requested changes, sanitized summary/source reference, workflow status, resolution information, optional resulting-order identity, timestamps, and stable source references. It does not expose raw vendor payloads or arbitrary metadata.

All reads require `read_clinical` permission and active patient context. Looking up a transaction/refill/change request under the wrong active patient fails closed. Endpoints do not accept arbitrary client patient IDs to switch charts.

Phase 4I still does not add transaction/refill/change-request status to `ContextAssembler`.

## Patient binding and callback correlation

The EHR-generated transaction `correlationId` is the routing authority for future inbound vendor transaction events. Vendor-supplied patient, order, or transaction IDs are consistency assertions only. If they disagree with the transaction reached by the EHR correlation ID, ingestion fails closed.

Human cancellation, refill-request creation, renewal staging, and pharmacy change-request response are patient-bound. `ClinicalActionGateway` resolves patient identity from durable server-side transaction/request/order records and compares it with the active chart patient context before mutation.

Change-request ingestion has no public HTTP route. `PrescriptionChangeRequestService.recordChangeRequest` is a trusted internal normalization boundary intended for a future verified adapter/callback layer. The source transaction determines patient/order identity; the adapter identity must match the source transaction.

No public webhook/callback HTTP route is exposed. A future production route must first authenticate and verify the vendor callback, enforce replay protection, and then hand only normalized events/requests to the appropriate internal service.

## Idempotency and retries

Outbound prescription identity is stable per order/transaction type. Retries increment an attempt counter on the same internal transaction while append-only events preserve each attempt/failure. Replaying the same normalized inbound vendor event uses an adapter/event idempotency key and does not duplicate transaction events or medication-reconciliation candidates.

Cancellation uses a stable EHR idempotency identity derived from the target prescription transaction. A retry after failed cancellation transport uses the same linked cancel transaction and increments its attempt history instead of creating a new independent CancelRx record.

Refill request replay and renewal-stage replay are separately idempotent. Once a renewal has been authorized/transmitted, the normal order/transaction idempotency rules apply to the new order.

Change-request ingestion is idempotent by stable adapter/external-request identity. Acceptance uses a deterministic resulting order identity bound to the request, so repeated clicks return the same staged order rather than creating multiple replacements. Repeated decline is also idempotent.

## Medication evidence

An external event may carry clinically relevant medication evidence, such as a future dispense status or medication-history observation. That evidence is converted into a `medication_reconciliation_candidates` record with source type `external-vendor` and remains `pending` until a clinician explicitly reconciles it.

A refill **request** does not create medication-reconciliation evidence merely because a patient or pharmacy asked for more medication. A pharmacy **change request** likewise does not establish dispensing, possession, ingestion, adherence, or current clinical use and therefore does not create reconciliation evidence merely by being received or accepted.

External evidence is intentionally unable to select or mutate an authoritative medication record. Medication truth changes continue through the existing reconciliation or explicit prescription-medication-truth confirmation pathways.

CancelRx status does not itself create a medication discontinuation. Renewal or replacement staging, authorization, and outbound transmission likewise do not themselves add/update a medication record.

## Secrets and raw vendor payloads

Transaction/event metadata, refill requests, and change requests are not credential stores. Secret-like keys and values in persisted error/reason/request text are removed or redacted. Change-request normalized fields are explicitly whitelisted; unrestricted opaque metadata is discarded. Normal order transmission receipts retain only a bounded summary; raw transport payload previews and adapter audit/credential artifacts are not persisted as ordinary order metadata.

Reusable read projections do not expose arbitrary transaction-event metadata, raw vendor payloads, free-text refill notes, credentials, or idempotency internals.

Future production credentials belong in secure infrastructure such as a secrets manager/KMS-backed configuration path with rotation and access control. They do not belong in orders, transaction events, refill/change requests, audit metadata, prescription intent, or medication records.

## AI authority

AI may eventually receive permission-aware transaction/refill/change-request status as distinct read-only context slices so it can summarize requests, compare requested changes with the prior prescription and medication truth, surface missing information, or draft/propose a renewal/replacement.

Transaction/refill/change-request state is not yet added to `ContextAssembler`. When it is added, it must remain separate from `activeMedications` and retain stable source references.

AI cannot:

- approve or execute a refill/renewal request
- create the clinician-staged renewal through `renew_prescription`
- accept or decline a pharmacy change request
- authorize a prescription
- start or retry transmission
- create or alter external transaction state
- ingest vendor transaction/change events
- execute, submit, or retry prescription cancellation
- reconcile external medication evidence
- mutate authoritative medication truth
- decide controlled-substance refill legality or EPCS validity

AI may draft a proposed prescription intent through the existing proposal boundary, but consequential lifecycle actions remain explicit authenticated human actions.

## Human and external-system authority

Human consequential actions continue through authenticated, patient-bound `ClinicalActionGateway` actions. Existing permissions remain authoritative: staging authority does not imply authorization authority, and authorization does not imply transmission outside the existing permission checks.

External transport/events/change requests are not human clinical mutations; they are normalized operational/workflow evidence accepted only through dedicated internal boundaries after future vendor verification.

Neither path is allowed to bypass the medication-truth boundary.

## DrFirst readiness

### Ready in core EHR

- vendor-neutral `EPrescribingAdapter`
- authorized prescription intent and existing `ClinicalActionGateway` transmission action
- linked vendor-neutral CancelRx transaction lifecycle
- durable refill/renewal request lineage to prior prescription and new staged intent
- durable pharmacy/vendor change-request lineage to source prescription and new staged replacement intent
- EHR-owned transaction, correlation, idempotency, retry, and event identity
- stable adapter/external identity and replay-safe change-request ingestion boundary
- normalized transport states and append-only history
- patient-bound transaction/refill/change-request read services
- bounded transaction/refill/change-request API projections
- adapter-normalized inbound event contract
- external-evidence-to-reconciliation boundary
- audit plus record-version/provenance history
- transient transport context supplied to adapters (`internalTransactionId`, `correlationId`, `idempotencyKey`, `attempt`, and relationship references when applicable)
- fail-closed development placeholders rather than simulated regulated-service success

### Belongs inside a future DrFirst adapter

- DrFirst request/response schemas and identifiers
- DrFirst-specific transaction/message codes
- API/SDK client behavior
- callback/webhook signature verification and vendor-specific replay identifiers
- mapping DrFirst responses into normalized EHR states/events/requests
- DrFirst-specific pharmacy/network routing details
- DrFirst SSO/embed launch behavior if contracted and required
- real DrFirst CancelRx transport and response mapping
- pharmacy refill/renewal request message normalization and prescriber response transport
- pharmacy change-request normalization and any vendor-specific response transport
- EPCS ceremony/verification integration
- PDMP, medication-history, formulary/benefit, ePA behavior

Vendor-specific fields should not be pushed into core medication or prescription-intent objects merely to make the adapter easier to write.

### Secure infrastructure still required

- production secrets management and rotation
- environment/tenant-specific credentials and configuration
- callback authentication/replay protection
- TLS/deployment controls
- durable delivery/retry/outbox or queue strategy appropriate to production network semantics
- operational monitoring and reconciliation for uncertain post-send failures

### Contract/onboarding/certification work, not ordinary application code

A real DrFirst integration still depends on commercial and regulated prerequisites supplied through DrFirst and related networks. These can include executed agreements/BAA, implementation access and documentation, tenant/practice/provider onboarding, sandbox/test credentials, certification/testing requirements, production approval, EPCS identity-proofing/credentialing requirements, and any Surescripts/network enablement DrFirst requires for the contracted product.

The EHR must not claim those capabilities until they actually exist.

## Recommended next slice

After the Phase 4I internal pharmacy change-request lifecycle, the next narrow prescription-integration slice should establish an authenticated, verified, replay-protected vendor callback envelope before any public inbound prescribing webhook is exposed. Keep that slice vendor-neutral: verify a callback through an adapter-owned boundary, normalize it into existing transaction/refill/change-request services, preserve correlation/idempotency identity, and prove that raw callbacks cannot directly mutate orders or medication truth. Real DrFirst/Surescripts connectivity remains a later contracted integration phase.