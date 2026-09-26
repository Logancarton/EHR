# EHR Documentation Index

Use this page as the router for durable project knowledge. The hierarchy is:

`Constitution -> Product Vision -> Current Architecture -> Active Roadmap -> Decision Records -> Domain Detail -> Historical Archive`

## Core reading

For any meaningful implementation task:

1. [`../AGENTS.md`](../AGENTS.md) — durable project constitution, safety boundaries, workflow, and validation rules.
2. [`PRODUCT_VISION.md`](PRODUCT_VISION.md) — canonical intended clinician/product experience and stable requirement IDs.
3. [`ROADMAP.md`](ROADMAP.md) — unfinished work only: milestone, ordered queue, open defects, gates, and deferred/blocked work. Finished work moves to [`ROADMAP_COMPLETED.md`](ROADMAP_COMPLETED.md), with its evidence, in the same commit that finishes it.

Then read only the architecture/domain material relevant to the task.

## Architecture and decision discovery

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — current implemented system boundaries, authority relationships, and structural gaps. It does not own sprint order.
- [`DECISIONS.md`](DECISIONS.md) — lightweight ADR index showing what currently governs, what is amended, and where the full rationale lives.
- [`decisions/`](decisions/) — full stable D-number ADR records.

## Task-specific domain references

- [`AI_SYSTEM.md`](AI_SYSTEM.md) — AI/context architecture, provenance, uncertainty, and human-confirmation boundaries.
- [`AUTHENTICATION.md`](AUTHENTICATION.md) — user/session trust, organization membership, patient access, and production auth boundary.
- [`UI_SYSTEM.md`](UI_SYSTEM.md) — shared interaction grammar and UI primitives.
- [`NOTE_REFERENCES.md`](NOTE_REFERENCES.md) — clinical reference layer and signed-reference reasoning.
- [`PRESCRIPTION_TRANSACTIONS.md`](PRESCRIPTION_TRANSACTIONS.md) — prescription intent vs external transaction evidence vs medication truth.
- [`PRESCRIPTION_CALLBACKS.md`](PRESCRIPTION_CALLBACKS.md) — verified callback boundary and replay/correlation rules.
- [`PRESCRIPTION_RECOVERY.md`](PRESCRIPTION_RECOVERY.md) — uncertain-send recovery and restart discovery.
- [`INTEGRATION_INFRASTRUCTURE.md`](INTEGRATION_INFRASTRUCTURE.md) — adapter configuration, secret references, readiness/health, retries, and uncertain outcomes.
- [`document-workflow.md`](document-workflow.md) — document/version/workflow behavior.
- [`message-charting.md`](message-charting.md) — patient communication/charting behavior.
- [`../app/server/db/migrations/README.md`](../app/server/db/migrations/README.md) — immutable migration registry conventions.

Implementation agents should also use [`.codex/skills/ehr-builder/SKILL.md`](../.codex/skills/ehr-builder/SKILL.md).

## Transient work and history

- [`../HANDOFF.md`](../HANDOFF.md) — only genuinely unfinished in-flight transfer; it is not durable architecture or roadmap state.
- [`archive/`](archive/) — clearly labeled historical roadmaps, handoffs, product-implementation notes, and legacy decision-log snapshots. Archive material is non-authoritative for current state unless an active document explicitly cites its rationale.

## Documentation maintenance

Keep current guidance in the smallest authoritative document that owns it. Do not make every agent load every domain document or historical record.

- Product direction changes -> PRODUCT_VISION + ADR.
- Architecture/authority changes -> ARCHITECTURE + ADR.
- Remaining work -> ROADMAP; completion evidence -> ROADMAP_COMPLETED.
- Durable rationale/supersession -> decisions ADR + DECISIONS index.
- Temporary unfinished transfer -> HANDOFF, then archive it.
- Historical evidence -> archive, with an explicit non-authoritative banner.

Use repository-relative links and stable IDs rather than machine-local paths or brittle numbered-section references.
