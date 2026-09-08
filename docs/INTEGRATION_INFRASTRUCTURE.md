# Integration Infrastructure

## Purpose

Phase 4K adds production-integration infrastructure behind the vendor-neutral adapter boundaries. It does not connect a commercial prescribing network and does not make the application production-PHI ready.

The authority layers remain separate:

`clinical authorization -> integration readiness -> durable prescription transaction attempt -> adapter transport -> verified external evidence`

Integration configuration answers **which adapter is allowed to operate**. Prescription transactions answer **what transport attempt/state exists**. Verified callbacks answer **what the external system reports**. Medication truth remains a separate clinician-owned record.

## Durable integration configuration

`integration_configurations` is the focused configuration primitive for external integrations. Each record has a stable configuration ID, adapter ID, purpose, environment, enabled state, practice/organization scope, bounded non-secret configuration, secret references, version, actor attribution, and timestamps.

Configuration IDs cannot be rebound to another adapter, purpose, environment, or scope. Replaying the same normalized configuration is idempotent and does not create another version. Configuration mutation requires the provider-only `manage_integrations` permission and creates bounded audit entries.

Non-secret configuration rejects secret-like keys and is size-bounded. Actual passwords, tokens, API keys, client secrets, private keys, PINs, OTPs, bearer credentials, and similar material do not belong in this table.

## Secret-reference boundary

Core persistence stores only references such as:

`prescribing/drfirst/production`

The `IntegrationSecretProvider` interface resolves actual material transiently. The current development provider maps a secret reference to an environment variable name. A future cloud secrets manager or KMS-backed provider can replace it without changing clinical records or integration configuration rows.

Production configurations fail closed when required secret references are absent or when referenced material cannot be resolved. Secret values are not returned by the integration health surface and must not enter audit, order, transaction, callback, or clinical metadata.

## Migration discipline

Phase 4K introduces `schema_migrations` and ordered `DatabaseMigration` definitions. New migrations:

- have stable identities and descriptions;
- run in deterministic declaration order;
- apply at most once;
- execute inside an explicit SQLite transaction;
- roll back the migration body and omit its ledger entry on failure.

Existing additive/idempotent startup foundations remain for compatibility. This phase intentionally does not rewrite the whole schema or move the EHR to PostgreSQL.

## Why there is no generic integration outbox yet

Phase 4K does **not** add a generic prescribing outbox.

The prescription transaction ledger already persists the outbound transaction identity, EHR correlation ID, idempotency key, attempt count, current transport state, and append-only events before the adapter call. A second queue/state machine for the same prescription would duplicate authority and create reconciliation ambiguity.

For the current synchronous prescribing flow, the durable transaction row is the operational attempt record. A generic outbox should be reconsidered only when another real integration needs durable work scheduling that cannot be represented by its existing transaction model. If introduced later, an outbox may own only **work waiting to be attempted**, never clinical authorization or prescription transport truth.

## Retry and uncertain-outcome semantics

A confirmed adapter failure remains `failed` and follows the existing idempotent retry path.

An adapter that may have sent the request but cannot prove the result must raise `IntegrationOutcomeUncertainError`. The EHR then records:

- prescription transaction state `outcome_uncertain`;
- order state `transmission_uncertain` for outbound orders;
- an append-only bounded transaction event;
- bounded operational/clinical audit entries;
- `retryBlocked: true` metadata.

A blind second transmission is rejected while the order/transaction remains uncertain. This prevents a network timeout after remote acceptance from becoming a duplicate prescription. Later verified external evidence may clarify the transaction state, but Phase 4K intentionally does not invent a production vendor reconciliation ceremony.

## Integration readiness gate

Default prescribing transmission now checks durable integration readiness before creating a new transport attempt. A prescribing adapter must have exactly one enabled matching configuration, and required secret material must be resolvable. Disabled, missing, ambiguous, or wrong-adapter configuration fails closed.

Explicit adapter injection remains a test seam. Production/default wiring uses the durable readiness gate.

Clinical authorization is still prerequisite state. Integration readiness never authorizes a prescription, never impersonates a clinician, and never bypasses `ClinicalActionGateway`.

## Operational health

`IntegrationHealthService` provides a provider-authorized server-side projection containing only bounded operational status:

- configuration/adapter identity;
- purpose/environment;
- enabled/readiness state;
- missing **secret aliases** (not references or values);
- count of prepared/pending prescription transactions;
- count of failed prescription transactions;
- count of unresolved uncertain prescription transactions;
- last successful prescribing interaction timestamp when available.

This is operational state, not medication truth and not AI context.

## Audit and provenance

Integration configuration changes are audited with adapter/purpose/environment/scope/version metadata and secret alias names only. Prescription `outcome_uncertain` transitions retain the existing transaction version/provenance path and add bounded audit/event evidence. No raw transport body, authentication header, credential, token, PIN, OTP, or arbitrary vendor blob is persisted.

## Still deferred

Phase 4K does not implement:

- real DrFirst, Surescripts, or DoseSpot credentials/connectivity;
- vendor-specific request/response schemas;
- production signature or mTLS contracts;
- EPCS identity proofing or controlled-substance ceremony;
- PDMP, formulary, eligibility, ePA, or broad medication history;
- commercial onboarding/certification;
- production queue workers or a generic outbox;
- production secret-manager/KMS configuration;
- production PHI deployment or a claim of HIPAA readiness.

Development prescribing adapters remain fail-closed.

## Recommended Phase 4L

If a legitimate commercial vendor contract, sandbox, and credentials are available, Phase 4L should build one vendor-specific mapping/adapter edge against these stable boundaries without changing clinical authority.

If commercial onboarding is not available, the next narrow phase should remain vendor-neutral and add explicit operational reconciliation/recovery for unresolved `outcome_uncertain` transactions plus process-restart recovery semantics, rather than fabricating vendor connectivity.
