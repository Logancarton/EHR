# External Prescription Transactions

## Purpose

Phase 4F introduced a vendor-neutral transaction layer between authorized prescription intent and any future external prescribing vendor. Phase 4G added clinician-facing cancellation relationships and a bounded reusable transaction-status surface. Phase 4H adds the first refill/renewal workflow slice while preserving the distinction between a request to refill and an authorized outbound prescription.

The core authority classes are deliberately separate:

1. **Medication truth** — the clinician's authoritative longitudinal statement of what the patient is taking.
2. **Prescription intent** — what the clinician intends to prescribe.
3. **External prescription transaction state** — what the EHR knows about transport/network processing of that prescription intent.
4. **Medication reconciliation evidence** — patient/vendor/import evidence that may inform medication truth only after explicit clinician reconciliation.
5. **Refill/renewal workflow request state** — a request for clinician review that may later seed a new prescription intent but is not itself a prescription transaction or medication fact.

No class automatically promotes itself into another.

## Signal flow

Outbound:

`clinician -> authorized prescription intent -> ClinicalActionGateway transmit action -> prescription transaction -> vendor-neutral adapter -> future external network`

Inbound:

`verified future vendor callback/message -> vendor adapter normalization -> normalized transaction event -> transaction state/history -> audit/provenance -> reconciliation evidence when clinically relevant -> explicit clinician review`

Cancellation:

`transmitted prescription transaction -> explicit clinician cancellation request -> patient-bound ClinicalActionGateway -> linked cancel_rx transaction -> adapter submission -> normalized external acknowledgement/completion`

Refill/renewal:

`prior transmitted prescription -> refill/renewal request -> explicit patient-bound review action -> NEW staged prescription intent/order -> ordinary authorization -> ordinary new_rx transport transaction`

Never:

`vendor response -> patient_medications UPDATE`

and never:

`CancelRx -> automatic medication discontinuation`

and never:

`refill request -> automatic prescription authorization/transmission or medication-truth change`

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

Current normalized lifecycle concepts include `prepared`, `submitted`, `acknowledged`, `accepted`, `rejected`, `failed`, `cancellation_requested`, `cancellation_acknowledged`, `canceled`, and `change_requested`. These names describe transport/workflow state only.

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

### Why `related_transaction_id` is not generalized in Phase 4H

Phase 4G's `related_transaction_id` currently represents a same-order transport relationship: a `cancel_rx` transaction points to the original `new_rx` transaction and the repository enforces matching patient/order identity.

A renewal creates a **new order**. The cross-order lineage is therefore represented by the durable refill request (`prior_order_id`, `prior_transaction_id`, `renewal_order_id`) and by the staged order's `renewalSource`/`sourceReference` provenance. This avoids weakening the existing cancellation invariant merely to fit a different semantic relationship.

If later replacement/change/refill networking requires a generic cross-transaction relationship graph, that should be introduced deliberately with explicit relationship semantics rather than overloading one nullable field.

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

## Reusable transaction and refill status read surface

The permission-aware `app/api/prescription-transactions/route.ts` surface remains the reusable read boundary for prescription lifecycle state.

Transaction projection includes normalized transaction identity/type/state, attempt count, relationship summaries, safe external reference IDs, lifecycle timestamps, latest sanitized error summary, stable transaction/event references, and recent immutable event summaries. It intentionally excludes arbitrary event metadata and raw adapter payloads.

Phase 4H adds a separate bounded refill-request projection containing request identity, patient/prior-order/prior-transaction lineage, request source, bounded source reference, current request status, optional renewal order identity, timestamps, and stable record references. Free-text request notes and idempotency internals are not exposed through this reusable projection.

Reads require `read_clinical` permission and an active patient context. Looking up a transaction or refill request under the wrong active patient fails closed. The endpoint does not accept an arbitrary client patient ID to switch charts.

The transaction query can surface associated refill requests for either the prior transaction or the new renewal transaction's order, so future Order Cart, Medications, Timeline, Inbox/tasks, prescription details, and bounded AI context can reuse the same normalized source instead of duplicating lifecycle state.

Phase 4H still does not add transaction/refill status to `ContextAssembler`.

## Patient binding and callback correlation

The EHR-generated transaction `correlationId` is the routing authority for future inbound vendor events. Vendor-supplied patient, order, or transaction IDs are consistency assertions only. If they disagree with the transaction reached by the EHR correlation ID, ingestion fails closed.

Human cancellation, refill-request creation, and renewal staging are patient-bound. `ClinicalActionGateway` resolves patient identity from durable server-side transaction/request/order records and compares it with the active chart patient context before mutation.

No public webhook/callback HTTP route is exposed. A future production route must first authenticate and verify the vendor callback, enforce replay protection, and then hand only normalized events to the appropriate internal service.

## Idempotency and retries

Outbound prescription identity is stable per order/transaction type. Retries increment an attempt counter on the same internal transaction while append-only events preserve each attempt/failure. Replaying the same normalized inbound vendor event uses an adapter/event idempotency key and does not duplicate transaction events or medication-reconciliation candidates.

Cancellation uses a stable EHR idempotency identity derived from the target prescription transaction. A retry after failed cancellation transport uses the same linked cancel transaction and increments its attempt history instead of creating a new independent CancelRx record.

Refill request replay and renewal-stage replay are separately idempotent as described above. Once a renewal has been authorized/transmitted, the normal order/transaction idempotency rules apply to the new order.

## Medication evidence

An external event may carry clinically relevant medication evidence, such as a future dispense status or medication-history observation. That evidence is converted into a `medication_reconciliation_candidates` record with source type `external-vendor` and remains `pending` until a clinician explicitly reconciles it.

A refill **request** does not create medication-reconciliation evidence merely because a patient or pharmacy asked for more medication. The request does not establish dispensing, possession, ingestion, adherence, or current clinical use.

External evidence is intentionally unable to select or mutate an authoritative medication record. Medication truth changes continue through the existing reconciliation or explicit prescription-medication-truth confirmation pathways.

CancelRx status does not itself create a medication discontinuation. Renewal staging, authorization, and outbound transmission likewise do not themselves add/update a medication record.

## Secrets and raw vendor payloads

Transaction/event metadata and refill request fields are not credential stores. Secret-like keys and values in persisted error/reason/request text are removed or redacted. Normal order transmission receipts retain only a bounded summary; raw transport payload previews and adapter audit/credential artifacts are not persisted as ordinary order metadata.

The reusable transaction/refill read projections do not expose arbitrary transaction-event metadata, raw vendor payloads, free-text refill notes, credentials, or idempotency internals.

Future production credentials belong in secure infrastructure such as a secrets manager/KMS-backed configuration path with rotation and access control. They do not belong in orders, transaction events, refill requests, audit metadata, prescription intent, or medication records.

## AI authority

AI may eventually receive permission-aware transaction/refill status as a distinct read-only context slice so it can summarize a refill request, surface prior prescription context, identify potentially missing monitoring information, explain why review may be needed, or draft/propose a renewal.

Transaction/refill state is not yet added to `ContextAssembler`. When it is added, it must remain separate from `activeMedications` and retain stable source references.

AI cannot:

- approve or execute a refill/renewal request
- create the clinician-staged renewal through `renew_prescription`
- authorize a prescription
- start or retry transmission
- create or alter external transaction state
- ingest vendor events
- execute, submit, or retry prescription cancellation
- reconcile external medication evidence
- mutate authoritative medication truth
- decide controlled-substance refill legality or EPCS validity

AI may draft a proposed prescription intent through the existing proposal boundary, but consequential lifecycle actions remain explicit authenticated human actions.

## Human and external-system authority

Human consequential actions continue through authenticated, patient-bound `ClinicalActionGateway` actions. Existing permissions remain authoritative: staging authority does not imply authorization authority, and authorization does not imply transmission outside the existing permission checks.

External transport events are not human clinical mutations; they are normalized operational evidence accepted only through the dedicated transaction ingestion boundary after future vendor verification.

Neither path is allowed to bypass the medication-truth boundary.

## DrFirst readiness

### Ready in core EHR

- vendor-neutral `EPrescribingAdapter`
- authorized prescription intent and existing `ClinicalActionGateway` transmission action
- linked vendor-neutral CancelRx transaction lifecycle
- durable refill/renewal request lineage to prior prescription and new staged intent
- EHR-owned transaction, correlation, idempotency, retry, and event identity
- normalized transport states and append-only history
- patient-bound transaction/refill read services
- reusable bounded transaction/refill status API projection
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
- mapping DrFirst responses into normalized EHR states/events
- DrFirst-specific pharmacy/network routing details
- DrFirst SSO/embed launch behavior if contracted and required
- real DrFirst CancelRx transport and response mapping
- pharmacy refill/renewal request message normalization and prescriber response transport
- EPCS ceremony/verification integration
- PDMP, medication-history, formulary/benefit, ePA, change-request normalization

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

After the Phase 4H refill/renewal foundation is validated, the next narrow prescription-lifecycle slice should generalize prescription replacement/change-request relationships only as far as real workflow semantics require. A useful next target is a pharmacy change-request/replacement workflow that preserves the original order/transaction, creates a new reviewable intent, and introduces an explicit generic relationship type only if cross-order transaction relationships can no longer be represented cleanly through existing workflow provenance.
