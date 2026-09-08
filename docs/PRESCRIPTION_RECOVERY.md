# Prescription Uncertainty Recovery

## Purpose

Phase 4L makes ambiguous prescription transport state operationally recoverable without guessing network truth, retransmitting automatically, or creating a second prescribing state machine.

The authority chain remains:

`authorized prescription intent -> durable prescription transaction -> adapter attempt -> verified external evidence`

Manual recovery evidence is a separate human operational layer. It may explain what was investigated and, in one narrow case, unlock a controlled retry. It never becomes a vendor acknowledgement and never changes medication truth.

## Ambiguous transport episodes

Two durable situations require conservative recovery:

1. `outcome_uncertain`: the adapter call may have reached the remote system, but the EHR could not prove the result.
2. an existing `prepared` transaction whose `attempt_count` is greater than zero: a process may have stopped after the durable attempt was prepared and before a transport result was recorded.

A prepared attempt with `attempt_count > 0` is therefore not silently restarted. Repeated clicks and application restarts cannot convert it into a new adapter call without recovery evidence.

The operational recovery projection discovers these records after startup. Discovery is read-only: startup never retransmits, resets, succeeds, or fails a prescription transaction.

## Manual evidence is not network truth

Manual evidence is stored as an append-only `prescription_transaction_events` event with direction `internal` and event type `manual_recovery_evidence`. The existing event table already provides immutable history and a unique `event_key`, so Phase 4L does not add a new recovery table.

The bounded manual event retains:

- transaction, order, and patient binding through the event foreign keys;
- actor ID and display identity;
- timestamp and provenance;
- evidence source;
- bounded note;
- recovery disposition;
- optional verified superseding transaction reference;
- whether the disposition unlocks retry;
- explicit `networkTruthChanged: false` and `medicationTruthChanged: false` markers.

Supported human dispositions are intentionally narrow:

- `investigated_unresolved`: investigation occurred, but external outcome remains unknown;
- `confirmed_not_received`: human investigation produced evidence that the current ambiguous attempt was not received, which unlocks one explicit controlled retry;
- `superseded_by_verified_transaction`: another same-patient transaction already has retained positive verified external evidence, so the ambiguous transaction is operationally superseded and must not be retried.

There is deliberately no human `accepted`, `submitted`, `acknowledged`, or `rejected` button. Those states remain external/vendor evidence when they arrive through the verified callback boundary.

## Exact retry rule

A retry is legal only when all of the following are true:

- the current transaction is still `outcome_uncertain`, or it is the current interrupted `prepared` attempt with `attempt_count > 0`;
- the latest ambiguity episode contains a manual `confirmed_not_received` event;
- that event is the current episode's retry-unlocking evidence;
- no later verified external resolution event exists for that episode;
- the authenticated actor has `transmit_order` permission;
- patient binding and normal adapter readiness still pass;
- the request did not originate from AI.

Time passing never unlocks retry.

When retry begins, the same prescription transaction identity, correlation ID, idempotency key, order, and patient binding are retained. Only the existing attempt counter advances. A recovery event identifies the manual evidence used to unlock that attempt. No new order or duplicate prescription transaction authority is created.

If the recovered attempt itself becomes ambiguous, the newer ambiguity event begins a new episode. Evidence from an older episode cannot unlock another retry.

## Restart behavior

Durable transaction, order, callback, configuration, and integration-health records already survive process restart in SQLite. Phase 4L does not add a startup worker or outbox.

The important restart rule is conservative: a durable `prepared` attempt with `attempt_count > 0` may represent a process interruption around the network call. `startAttempt` therefore rejects another ordinary attempt from that state. It can advance only through the evidence-gated recovery path.

The operational recovery projection exposes:

- ambiguous `outcome_uncertain` transactions;
- interrupted prepared attempts;
- confirmed failed transactions that retain the normal retry path;
- submitted transactions awaiting later evidence;
- callback receipts stuck in `processing` beyond a bounded stale threshold.

The recovery API combines that projection with `IntegrationHealthService`, so provider-authorized operational tooling can also see disabled/missing integration readiness without receiving secret references or secret values.

## Callback crash recovery

`prescription_callback_receipts` already reserve `(adapter_id, external_message_id)` plus a normalized fingerprint and EHR-owned binding before downstream routing.

If a process stops while a receipt is `processing`, Phase 4L does not mark it successful or failed merely because it is old. The stale receipt is surfaced as work needing attention.

Recovery is exact replay of the same already-verified callback. Downstream prescription transaction events, refill requests, and change requests are independently idempotent. Replaying the exact callback therefore resumes routing and marks the receipt processed only after downstream work succeeds. A payload or binding mismatch still fails closed. Replay evidence is never deleted.

## Verified external evidence remains authoritative

Verified callbacks continue to route by the EHR-owned correlation ID. Callback-supplied patient, order, and transaction IDs remain consistency assertions only.

When a verified transaction callback resolves an ambiguous `new_rx` attempt:

- verified `submitted`, `acknowledged`, or `accepted` evidence can reconcile an unresolved order transport projection to transmitted;
- verified `rejected` or `failed` evidence can reconcile an unresolved order transport projection to transmission failed;
- the transaction event remains inbound/vendor evidence;
- no synthetic vendor receipt or acknowledgement is created;
- medication truth is unchanged.

A late verified callback is retained even after manual investigation. If positive external evidence arrives after a human disposition that assumed the original attempt was not successful or had been superseded, the recovery projection reports an evidence conflict rather than deleting or overwriting either source.

The callback state machine also accepts the bounded terminal/acknowledgement transitions needed to resolve an interrupted prepared attempt or uncertain cancellation. This does not let the vendor choose a patient or bypass callback verification.

## Authorization and patient binding

Manual recovery writes are consequential human actions and pass through `ClinicalActionGateway`.

They use the existing `transmit_order` authority rather than a new permission because recovery can unlock a prescription retransmission and therefore belongs to the same prescribing authority boundary. Server-derived actor identity is authoritative. The gateway binds the target transaction to the active patient, and an optional superseding transaction must bind to that same patient.

The cross-patient operational recovery queue requires `manage_integrations`, matching the existing integration-health authority.

## Phase 4M provider operations surface

Phase 4M exposes the existing recovery model through the browser-like global workspace as a provider-facing Prescribing Operations module. It is an operational work queue, not a second prescribing system and not a medication-management dashboard.

The server-owned `PrescriptionOperationsService` classifies and projects attention items. The client renders those facts rather than deriving transport semantics locally. The default queue includes unresolved uncertain outcomes, interrupted prepared attempts, confirmed transmission failures, stale callback processing, and manual/vendor evidence conflicts. Ordinary successful traffic is omitted by default.

Each item carries only bounded operational identity and explanation: patient name/MRN, order and transaction identity, medication display name, transaction type/state/attempt count, bounded pharmacy name, classification, reason for attention, retry eligibility, and retry-block reason. Integration readiness is reduced to provider-facing readiness and explanation. Secret references, missing-secret aliases, raw callback data, normalized fingerprints, and arbitrary event metadata are not part of the projection.

The detail projection provides a bounded chronological timeline with explicit categories for local system events, outbound attempts, manual recovery evidence, verified vendor evidence, and callback processing. Manual evidence is reconstructed only from whitelisted recovery fields. Vendor events expose normalized state/source evidence, not raw vendor payloads. Conflicts remain visible even if a late verified vendor event has already advanced the transaction out of `outcome_uncertain`.

The UI never writes transaction state. Existing recovery actions continue through `/api/prescription-transactions` and `ClinicalActionGateway`; retry continues through the existing order transmission path. Before the client submits either action, the target patient chart must be the actual active browser-tab context, and the active patient ID is sent as the existing patient-binding header. The server remains authoritative: a stale or wrong-patient action fails closed even if the client is outdated or bypassed.

After any successful action or rejected stale action, the client reloads the authoritative queue/detail. Exact duplicate manual evidence remains idempotent under the established recovery event key, while a genuinely stale action after vendor resolution is rejected instead of rewriting history.

The surface does not add AI execution authority, a new prescribing permission, a new recovery table, a duplicate transaction model, or any mutation of `patient_medications`.

## AI boundary

AI may summarize ambiguity, explain why an item needs review, gather already-readable context, or propose a recovery plan.

AI cannot:

- record manual recovery evidence;
- unlock retry;
- assert external acceptance or rejection;
- retry or retransmit;
- mutate callback receipts;
- suppress later vendor evidence;
- change medication truth.

Operational recovery is not automatically injected into AI context.

## Medication truth and prescription intent

Transport recovery never adds, updates, discontinues, reactivates, or reconciles `patient_medications`.

The original prescription intent remains historical. Recovery changes only operational transport handling around the existing transaction/order. CancelRx, refill/renewal, and pharmacy change-request lineage remain unchanged, and `prescription_transactions.related_transaction_id` is not repurposed as a generic graph.

## Secrets

Recovery events, audits, queues, and callback reconciliation use the existing bounded metadata sanitizers. They do not persist PINs, OTPs, passwords, tokens, credentials, secret values, raw callback payloads, or authentication headers.

## Deferred

Phase 4L/4M still do not provide real DrFirst, Surescripts, or DoseSpot connectivity; EPCS identity proofing; PDMP; formulary/benefit; eligibility; ePA; broad medication-history ingestion; billing; a generic outbox; a generic workflow engine; a message bus; microservices; PostgreSQL; cloud deployment; or production secret-manager/KMS wiring.

They also do not claim production prescribing connectivity, HIPAA readiness, or production-PHI readiness.