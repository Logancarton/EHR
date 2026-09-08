# EHR Documentation Index

Use this page as the map for durable project knowledge.

## Required reading for agents

1. [`../AGENTS.md`](../AGENTS.md) — project constitution and highest-level development rules.
2. [`PRODUCT_VISION.md`](PRODUCT_VISION.md) — what the product is trying to become and what makes it different.
3. [`ARCHITECTURE.md`](ARCHITECTURE.md) — current system boundaries and interaction architecture.
4. [`AI_SYSTEM.md`](AI_SYSTEM.md) — architecture and safety principles for AI throughout the EHR.
5. [`AUTHENTICATION.md`](AUTHENTICATION.md) — authoritative user identity, login/session trust, and development/production auth boundaries.
6. [`ROADMAP.md`](ROADMAP.md) — current build sequence and phase gates.
7. [`DECISIONS.md`](DECISIONS.md) — durable architectural/product decisions and changes to them.
8. [`PRESCRIPTION_TRANSACTIONS.md`](PRESCRIPTION_TRANSACTIONS.md) — prescription intent vs external transaction status vs reconciliation evidence vs medication truth, plus future DrFirst readiness boundaries.
9. [`PRESCRIPTION_CALLBACKS.md`](PRESCRIPTION_CALLBACKS.md) — verified public prescribing callback boundary, durable replay protection, correlation authority, and external-vs-human authority rules.

## Repo-local workflow

Implementation agents should also use:

- [`.codex/skills/ehr-builder/SKILL.md`](../.codex/skills/ehr-builder/SKILL.md) — repeatable feature-building workflow.

## Documentation rule

Keep stable knowledge here. Do not turn the repository into a pile of planning files. Create a new durable document only when a concept has enough independent complexity that placing it in an existing document would make that document harder to use.
