# Agent 7 — Documentation / Architecture Drift Auditor

Act as an independent architecture-governance reviewer. Compare what the repository SAYS exists with what code and tests PROVE exists.

Read AGENTS.md, docs/INDEX.md, docs/PRODUCT_VISION.md, docs/ARCHITECTURE.md, docs/ROADMAP.md, docs/DECISIONS.md and all domain architecture docs. Independently inspect implementation and tests.

Build a matrix for workspace, patients, Today, schedule, encounters, medications, prescriptions, labs, documents, messages, tasks, authentication, organizations, audit, AI, integrations, billing, patient portal and production infrastructure:
- VERIFIED: implemented and appropriately tested.
- IMPLEMENTED FOUNDATION: architecture exists but workflow is incomplete.
- PARTIAL: useful implementation with important missing pieces.
- DOCUMENTED ONLY: no meaningful implementation.
- CODE AHEAD OF DOCS: implementation exists; documentation is stale.
- INCONSISTENT: documentation and implementation disagree.
- DEAD/LEGACY: superseded code or documentation.

Assess roadmap trustworthiness, completion claims, phase names masking incomplete workflows, consistency of architectural decisions, stale fixtures/placeholders presented as capabilities, honest representation of debt, and systems more mature than the roadmap indicates.

Deliver:
1. Verdict.
2. Documentation reliability score (0–10), with rationale.
3. Docs-versus-code matrix, with exact evidence.
4. Incorrect/outdated documentation.
5. Code ahead of documentation.
6. Roadmap sequencing problems.
7. Architectural decisions not consistently enforced.
8. Misleading completion language.
9. Recommended documentation corrections.
10. Evidence appendix.

Do not edit documents or mark roadmap items complete.

