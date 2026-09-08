# External Prescription Transactions

## Purpose

Phase 4F introduces a vendor-neutral transaction layer between authorized prescription intent and any future external prescribing vendor. This layer records what happened to an outbound prescription transaction without allowing transport/network state to become authoritative medication truth.

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

Never:

`vendor response -> patient_medications UPDATE`

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

Events are append-only records of individual internal/outbound/inbound facts. Failures and retries remain inspectable rather than being overwritten by the latest state.

Current normalized lifecycle concepts include `prepared`, `submitted`, `acknowledged`, `accepted`, `rejected`, `failed`, `cancellation_requested`, `cancellation_acknowledged`, `canceled`, and `change_requested`. These names describe transport/workflow state only.

A vendor/adapter returning a successful outbound call moves the transaction to **submitted**. It does not infer `acknowledged` or `accepted`. Those later states require normalized external evidence.

Even `accepted` does not mean the medication was dispensed, picked up, started, or currently taken.

## Patient binding and callback correlation

The EHR-generated `correlationId` is the routing authority for future inbound vendor events. Vendor-supplied patient, order, or transaction IDs are consistency assertions only. If they disagree with the transaction reached by the EHR correlation ID, ingestion fails closed.

This prevents an external/vendor identifier from redirecting a callback into another patient's record.

No public webhook/callback HTTP route is exposed in Phase 4F. A future production route must first authenticate and verify the vendor callback, enforce replay protection, and then hand only normalized events to `PrescriptionTransactionService.ingestVendorEvent`.

## Idempotency and retries

Outbound prescription identity is stable per order/transaction type. Retries increment an attempt counter on the same internal transaction while append-only events preserve each attempt/failure. Replaying the same normalized inbound vendor event uses an adapter/event idempotency key and does not duplicate transaction events or medication-reconciliation candidates.

The existing order lifecycle remains the clinician-facing outbound authorization/transmission boundary. Phase 4F adds durable network detail behind it rather than creating a second prescribing-order subsystem.

## Medication evidence

An external event may carry clinically relevant medication evidence, such as a future dispense status or medication-history observation. That evidence is converted into a `medication_reconciliation_candidates` record with source type `external-vendor` and remains `pending` until a clinician explicitly reconciles it.

External evidence is intentionally unable to select or mutate an authoritative medication record. Medication truth changes continue through the existing reconciliation or explicit prescription-medication-truth confirmation pathways.

## Secrets and raw vendor payloads

Transaction/event metadata is not a credential store. Secret-like keys and secret-like values in persisted error text are removed/redacted. Normal order transmission receipts retain only a bounded summary; raw transport payload previews and adapter audit/credential artifacts are not persisted as ordinary order metadata.

Future production credentials belong in secure infrastructure such as a secrets manager/KMS-backed configuration path with rotation and access control. They do not belong in orders, transaction events, audit metadata, prescription intent, or medication records.

## AI authority

AI may eventually receive permission-aware transaction status as a distinct read-only context slice so it can answer questions such as “Did this prescription go through?” or “What happened with the cancellation?”

Phase 4F does not add transaction state to `ContextAssembler` yet. When it is added, it must remain separate from `activeMedications` and retain source transaction/event references.

AI cannot:

- authorize a prescription
- start or retry transmission
- create or alter external transaction state
- ingest vendor events
- cancel/change a prescription externally
- reconcile external medication evidence
- mutate authoritative medication truth

## Human and external-system authority

Human consequential actions continue through authenticated, patient-bound `ClinicalActionGateway` actions. External transport events are not human clinical mutations; they are normalized operational evidence accepted only through the dedicated transaction ingestion boundary after future vendor verification.

Neither path is allowed to bypass the medication-truth boundary.

## DrFirst readiness

### Ready in core EHR

- vendor-neutral `EPrescribingAdapter`
- authorized prescription intent and existing `ClinicalActionGateway` transmission action
- EHR-owned transaction, correlation, idempotency, retry, and event identity
- normalized transport states and append-only history
- patient-bound transaction read service
- adapter-normalized inbound event contract
- external-evidence-to-reconciliation boundary
- audit plus record-version/provenance history
- transient transport context supplied to adapters (`internalTransactionId`, `correlationId`, `idempotencyKey`, `attempt`)
- fail-closed development placeholders rather than simulated regulated-service success

### Belongs inside a future DrFirst adapter

- DrFirst request/response schemas and identifiers
- DrFirst-specific transaction/message codes
- API/SDK client behavior
- callback/webhook signature verification and vendor-specific replay identifiers
- mapping DrFirst responses into normalized EHR states/events
- DrFirst-specific pharmacy/network routing details
- DrFirst SSO/embed launch behavior if contracted and required
- EPCS ceremony/verification integration
- PDMP, medication-history, formulary/benefit, ePA, refill/change/cancel message normalization

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

Phase 4G should build the human-visible prescription lifecycle on top of this foundation: cancellation/change/refill intent and their transaction relationships, a compact reusable status surface/link target, and a permission-aware read/context API for transaction status. That keeps real DrFirst connectivity downstream until the internal lifecycle and UI can correctly represent external messages without confusing them with medication truth.
