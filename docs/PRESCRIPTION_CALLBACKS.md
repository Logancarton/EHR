# Prescription Vendor Callback Boundary

## Purpose

Phase 4J introduces the smallest public inbound prescribing boundary that can safely precede a future DrFirst or other vendor adapter. It is not a DrFirst integration and does not implement regulated network connectivity, EPCS, PDMP, formulary, eligibility, ePA, medication-history feeds, or vendor credentials.

The callback boundary exists to convert untrusted vendor HTTP traffic into bounded, verified, vendor-neutral external evidence without weakening clinical authority.

The governing sequence is:

`raw public HTTP callback -> vendor-specific verification adapter -> bounded VerifiedPrescriptionCallback -> durable callback replay/binding receipt -> existing transaction/refill/change-request service -> audit/provenance`

Never:

`raw HTTP callback -> repository mutation`

Never:

`external callback -> ClinicalActionGateway pretending to be a clinician`

Never:

`external callback -> patient_medications mutation`

## Four authority layers

1. **Raw HTTP traffic is untrusted.** Route selection, body fields, headers, patient identifiers, and vendor-supplied entity identifiers have no clinical authority.
2. **Vendor verification is integration authority.** A vendor-specific adapter is responsible for authenticating the raw callback using whatever mechanism a future contract requires. The core EHR does not understand DrFirst/Surescripts-specific signatures, proprietary headers, mTLS rules, or similar mechanisms.
3. **Verified normalized callbacks are external evidence.** The adapter may emit only a bounded `VerifiedPrescriptionCallback` describing an already-supported transaction event, refill request, or pharmacy change request.
4. **Clinician decisions remain human authority.** Renewal staging, change-request acceptance/decline, prescription authorization, transmission, cancellation, reconciliation, and medication-truth changes remain explicit authenticated human actions through their existing patient-bound clinical boundaries.

## Public ingress

The narrow public ingress is:

`POST /api/integrations/prescribing/callback?adapter=<configured-adapter-id>`

The `adapter` route value selects the verification adapter only. It is not authentication and it cannot select a patient.

The HTTP boundary:

- accepts only bounded adapter identifiers
- rejects unsupported adapters
- enforces a 64 KiB request-body ceiling
- requires non-empty request bodies
- calls the selected verification adapter with transient raw headers/body bytes
- rejects missing or failed verification
- rejects malformed verified envelopes
- rejects a verified envelope whose adapter identity does not match the selected verifier
- returns only generic processing errors to the caller

Ordinary EHR browser/session authentication is deliberately not used as vendor authentication.

## Verification adapter seam

`PrescriptionCallbackVerificationAdapter` is the vendor-neutral interface. Future vendor adapters may inspect the raw transport request and, only after successful authenticity verification, return a normalized `VerifiedPrescriptionCallback`.

Current development prescribing adapters do not implement real callback verification. The resolver recognizes them but supplies a fail-closed verifier that always returns `verified: false`. This prevents development placeholders from fabricating DrFirst, Surescripts, DoseSpot, or other production verification success.

Vendor-specific schemas and signature rules belong inside the future adapter implementation, not in core prescribing domain models.

## Verified callback envelope

The core envelope is deliberately small. It contains only bounded normalized identity/evidence such as:

- adapter identity
- callback category
- stable external message/event identity
- EHR-owned prescription transaction correlation ID
- optional bounded external reference
- optional occurred-at timestamp
- optional patient/order/transaction consistency assertions
- a category-specific normalized payload

Raw HTTP bodies, raw vendor payloads, headers, signatures, cookies, API keys, credentials, PINs, OTPs, tokens, and arbitrary transport metadata are not part of the durable normalized callback model.

Core normalization whitelists supported fields and bounds string lengths again even after adapter verification. Verification proves authenticity; it does not make arbitrary adapter output safe to persist.

## Correlation and patient identity

The EHR-owned prescription transaction `correlationId` is the routing authority for all Phase 4J callback categories.

Core processing first resolves the durable prescription transaction from that correlation ID. The resolved transaction determines the patient and source order. Vendor-supplied patient/order/transaction identifiers are consistency assertions only.

If an assertion disagrees with the transaction reached through the EHR correlation ID, processing fails closed. A callback cannot switch charts by supplying another patient ID.

The callback adapter identity must also match the adapter identity already bound to the correlated transaction.

## Durable replay and binding protection

Duplicate webhook delivery is expected, so callback replay protection is durable rather than process-memory based.

`prescription_callback_receipts` stores one stable callback identity per:

`(adapter_id, external_message_id)`

The receipt also stores:

- callback category
- EHR correlation ID
- SHA-256 fingerprint of the bounded normalized callback meaning
- resolved patient, order, and prescription transaction IDs
- optional resulting transaction-event, refill-request, or change-request ID
- processing/rejection state and safe failure code
- timestamps

The same callback identity may replay only when its normalized meaning and EHR binding are identical. Reusing that identity for another callback type, correlation, patient, order, transaction, or normalized meaning fails closed.

An exact already-processed replay returns idempotently without repeating the downstream workflow mutation. The existing transaction-event, refill-request, and change-request idempotency rules remain additional defense-in-depth rather than substitutes for callback-envelope replay protection.

## Supported Phase 4J callback categories

Only three callback categories are supported.

### Prescription transaction event

A verified transaction callback routes into the existing `PrescriptionTransactionService.ingestVendorEvent` path.

The EHR correlation ID remains authoritative. Transaction/order/patient assertions must match. The existing append-only event ledger and normalized transaction-state transition rules remain authoritative.

Clinically meaningful medication evidence attached to a transaction event may create a pending `medication_reconciliation_candidates` record through the existing evidence boundary. It does not update `patient_medications`.

### Refill/renewal request

A verified refill callback may create only a pending `prescription_refill_requests` workflow object linked to the prior transmitted `new_rx` transaction/order.

The callback does not:

- create a renewal prescription order
- authorize a prescription
- transmit a prescription
- alter the prior order or transaction
- create medication-reconciliation evidence merely because a refill was requested
- change medication truth

A later human `renew_prescription` action remains patient-bound and creates a new staged prescription intent through the existing Phase 4H lifecycle.

### Pharmacy change/replacement request

A verified change callback routes into the existing `PrescriptionChangeRequestService.recordChangeRequest` boundary.

It creates only the durable pending Phase 4I request. It does not automatically accept/decline the request, stage a replacement, authorize, transmit, cancel the prior prescription, create reconciliation evidence merely from the request, or change medication truth.

A later human response remains patient-bound through `ClinicalActionGateway`.

## Historical protection

Callback processing does not reopen or rewrite historical source prescription orders.

Existing prescription transaction events remain append-only. Refill/change requests retain their explicit lineage objects. `prescription_transactions.related_transaction_id` remains reserved for the same-order CancelRx relationship and is not generalized for callback or cross-order lineage.

## Audit and provenance

Verified callback receipts receive provenance events. Accepted, replayed, and rejected callback processing is audited with bounded metadata including:

- integration/adapter identity
- stable external message identity
- callback type
- EHR correlation/transaction identity
- resulting internal entity IDs when applicable
- safe processing/rejection state

Raw request bodies, authentication artifacts, signatures, credentials, tokens, and arbitrary transport metadata are not written to callback receipts, audit metadata, or provenance metadata.

Pre-verification rejection audit records intentionally contain only route-level adapter identity and safe rejection codes.

## Human versus external authority

The external callback path does not impersonate a provider and does not call `ClinicalActionGateway` as though a vendor were a human clinician.

External systems may report or request. Humans decide.

Human consequential prescription actions retain the existing server-derived actor identity, role/permission checks, active-patient binding, audit, and provenance requirements.

## Medication truth

No Phase 4J callback automatically:

- adds a medication
- updates a medication
- discontinues/reactivates a medication
- reconciles a medication candidate
- marks a patient as taking a medication

Transaction medication evidence remains evidence until explicit clinician reconciliation. Refill/change requests alone are workflow evidence, not medication evidence.

## AI boundary

Phase 4J does not expose callback data to `ContextAssembler` and does not create an AI tool path into callback ingestion.

AI cannot verify or ingest vendor callbacks, mutate callback receipts, change transaction state through this boundary, create/approve refill workflows, accept/decline change requests, authorize/transmit/cancel prescriptions, reconcile evidence, change medication truth, or make EPCS/legal controlled-substance decisions.

AI may later read explicitly permission-scoped, non-authoritative workflow status through a separate context slice, but that is not part of Phase 4J.

## Intentionally deferred

Phase 4J does not include:

- real DrFirst/Surescripts/DoseSpot credentials or connectivity
- production callback signature algorithms
- commercial vendor SDKs
- EPCS or identity proofing
- PDMP
- formulary/benefit
- eligibility
- ePA
- external medication-history callbacks
- durable production queue/outbox semantics
- production secrets/KMS configuration
- tenant-specific vendor configuration
- operational vendor reconciliation dashboards
- vendor response transport for refill/change decisions

These belong to later production-integration phases after the core security boundary and production infrastructure are ready.
