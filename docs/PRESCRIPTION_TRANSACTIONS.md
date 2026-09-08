# External Prescription Transactions

## Purpose

Phase 4F introduced a vendor-neutral transaction layer between authorized prescription intent and any future external prescribing vendor. Phase 4G begins building clinician-facing lifecycle relationships on top of that foundation. This layer records what happened to an outbound prescription transaction without allowing transport/network state to become authoritative medication truth.

The core authority classes are deliberately separate:

1. **Medication truth** — the clinician's authoritative longitudinal statement of what the patient is taking.
2. **Prescription intent** — what the clinician intends to prescribe.
3. **External prescription transaction state** — what the EHR knows about transport/network processing of that prescription intent.
4. **Medication reconciliation evidence** — patient/vendor/import evidence that may inform medication truth only after explicit clinician reconciliation.

No class automatically promotes itself into another.

## Signal flow

Outbound:

`clinician -> authorized prescription intent -> ClinicalActionGateway transmit action -> prescription transaction -> vendor-neutral adapter -> future external network`

Inbound:

`verified future vendor callback/message -> vendor adapter normalization -> normalized transaction event -> transaction state/history -> audit/provenance -> reconciliation evidence when clinically relevant -> explicit clinician review`

Cancellation:

`transmitted prescription transaction -> explicit clinician cancellation request -> patient-bound ClinicalActionGateway -> linked cancel_rx transaction -> adapter submission -> normalized external acknowledgement/completion`

Never:

`vendor response -> patient_medications UPDATE`

and never:

`CancelRx -> automatic medication discontinuation`

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

## Reusable transaction status read surface

Phase 4G adds a permission-aware bounded transaction status projection and API. It is intended to become the single reusable status source for Order Cart, Medications, Timeline, Inbox/tasks, prescription details, and later bounded AI context.

The projection includes normalized transaction identity/type/state, attempt count, relationship summaries, safe external reference IDs, lifecycle timestamps, the latest sanitized error summary, stable transaction/event references, and recent immutable event summaries.

It intentionally excludes arbitrary event metadata and raw adapter payloads. Reads require `read_clinical` permission and an active patient context. Looking up a transaction ID under the wrong active patient fails closed.

Phase 4G does not yet add transaction status to `ContextAssembler`. AI context remains a later bounded read-only step after the reusable status surface is established.

## Patient binding and callback correlation

The EHR-generated `correlationId` is the routing authority for future inbound vendor events. Vendor-supplied patient, order, or transaction IDs are consistency assertions only. If they disagree with the transaction reached by the EHR correlation ID, ingestion fails closed.

This prevents an external/vendor identifier from redirecting a callback into another patient's record.

Human cancellation is also patient-bound. `ClinicalActionGateway` resolves the target transaction's patient from the server-side transaction table and compares it with the active chart patient context before any cancellation mutation or adapter call can occur.

No public webhook/callback HTTP route is exposed. A future production route must first authenticate and verify the vendor callback, enforce replay protection, and then hand only normalized events to `PrescriptionTransactionService.ingestVendorEvent`.

## Idempotency and retries

Outbound prescription identity is stable per order/transaction type. Retries increment an attempt counter on the same internal transaction while append-only events preserve each attempt/failure. Replaying the same normalized inbound vendor event uses an adapter/event idempotency key and does not duplicate transaction events or medication-reconciliation candidates.

Cancellation uses a stable EHR idempotency identity derived from the target prescription transaction. A retry after failed cancellation transport uses the same linked cancel transaction and increments its attempt history instead of creating a new independent CancelRx record.

The existing order lifecycle remains the clinician-facing outbound authorization/transmission boundary. The transaction layer adds durable network detail behind it rather than creating a second prescribing-order subsystem.

## Medication evidence

An external event may carry clinically relevant medication evidence, such as a future dispense status or medication-history observation. That evidence is converted into a `medication_reconciliation_candidates` record with source type `external-vendor` and remains `pending` until a clinician explicitly reconciles it.

External evidence is intentionally unable to select or mutate an authoritative medication record. Medication truth changes continue through the existing reconciliation or explicit prescription-medication-truth confirmation pathways.

CancelRx status does not itself create a medication discontinuation. It answers only whether the external prescription cancellation workflow was requested/submitted/acknowledged/completed.

## Secrets and raw vendor payloads

Transaction/event metadata is not a credential store. Secret-like keys and secret-like values in persisted error/reason text are removed or redacted. Normal order transmission receipts retain only a bounded summary; raw transport payload previews and adapter audit/credential artifacts are not persisted as ordinary order metadata.

The reusable status read projection does not expose arbitrary transaction-event metadata, even after sanitization.

Future production credentials belong in secure infrastructure such as a secrets manager/KMS-backed configuration path with rotation and access control. They do not belong in orders, transaction events, audit metadata, prescription intent, or medication records.

## AI authority

AI may eventually receive permission-aware transaction status as a distinct read-only context slice so it can answer questions such as “Did this prescription go through?” or “What happened with the cancellation?”

Transaction state is not yet added to `ContextAssembler`. When it is added, it must remain separate from `activeMedications` and retain source transaction/event references.

AI cannot:

- authorize a prescription
- start or retry transmission
- create or alter external transaction state
- ingest vendor events
- execute, submit, or retry prescription cancellation
- cancel/change a prescription externally
- reconcile external medication evidence
- mutate authoritative medication truth

AI may propose a cancellation for clinician review, but execution remains an authenticated patient-bound human action.

## Human and external-system authority

Human consequential actions continue through authenticated, patient-bound `ClinicalActionGateway` actions. External transport events are not human clinical mutations; they are normalized operational evidence accepted only through the dedicated transaction ingestion boundary after future vendor verification.

Neither path is allowed to bypass the medication-truth boundary.

## DrFirst readiness

### Ready in core EHR

- vendor-neutral `EPrescribingAdapter`
- authorized prescription intent and existing `ClinicalActionGateway` transmission action
- linked vendor-neutral CancelRx transaction lifecycle
- EHR-owned transaction, correlation, idempotency, retry, and event identity
- normalized transport states and append-only history
- patient-bound transaction read/status service
- reusable bounded transaction-status API projection
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
- EPCS ceremony/verification integration
- PDMP, medication-history, formulary/benefit, ePA, refill/change message normalization

Vendor-specific fields should not be pushed into core medication or prescription-intent objects merely to make the adapter easier to write.

### Secure infrastructure still required

- production secrets management and rotation
- environment/tenant-specific credentials and configuration
- callback authentication/replay protection
- TLS/deployment controls
- durable delivery/retry/outbox or queue strategy appropriate to production network semantics
- operational monitoring and reconciliation for uncertain post-send failures

### Contract/onboarding/certification work, not ordinary application code

A real DrFirst integration still depends on the commercial and regulated prerequisites supplied through DrFirst and related networks. These can include executed agreements/BAA, implementation access and documentation, tenant/practice/provider onboarding, sandbox/test credentials, certification/testing requirements, production approval, EPCS identity-proofing/credentialing requirements, and any Surescripts/network enablement DrFirst requires for the contracted product.

The EHR must not claim those capabilities until they actually exist.

## Recommended next slice

After the cancellation/status foundation is validated, continue Phase 4G with refill/renewal relationships. Refill should become a new prescription intent/transaction relationship rather than editing the old transaction or medication truth in place. Replacement/supersession and pharmacy change-request workflows can then reuse the same relationship and status-read primitives.
