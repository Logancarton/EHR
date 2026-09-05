# AGENTS.md — EHR Project Constitution

This file is the highest-level project instruction for coding agents working in this repository.

## Source of truth

- Repository: https://github.com/Logancarton/EHR
- Default and active development branch: `main`.
- For agent-assisted work performed through GitHub, make changes directly to `main` unless Logan explicitly requests a branch or pull request.
- Do not create branches or pull requests by default.
- GitHub `main` is authoritative. A local checkout is a working copy, not the source of truth.
- Before making changes, inspect the current repository state rather than assuming prior conversation context matches the code.
- After meaningful changes, run or verify the repository validation workflow. Do not report a feature as complete if type-check/build validation is failing.

## Product mission

Build a new electronic health record from the ground up with AI integrated throughout the system rather than bolted on as a chatbot.

The product should feel more like a modern browser/workspace than a conventional EHR. A clinician should be able to keep multiple patient charts open, move between them quickly, preserve context, and work across clinical surfaces without repeatedly opening and closing disconnected modules.

The central product model is:

`Clinician intent (voice/text/direct) <-> Dynamic Workspace (Zen to Cockpit) <-> Structured Clinical State <-> Ambient AI Substrate`

AI should reduce cognitive and clerical work while the clinician remains the decision-maker.

## Product principles

1. Patient = workspace, not page.
2. Multiple patient workspaces may remain open simultaneously.
3. Clinical context should persist as the clinician moves through the application.
4. AI is a system layer available wherever it adds value, not a separate destination.
5. Structured clinical data is authoritative; AI output is derived assistance.
6. The UI should optimize clinician cognition and workflow before optimizing legacy EHR conventions.
7. Integration vendors must sit behind adapters so the core product is not owned by an e-prescribing, lab, billing, messaging, or clearinghouse vendor.
8. Interoperability should be supported at boundaries without forcing the UI or internal architecture to mirror FHIR resource shapes.
9. Preserve longitudinal context. The EHR should make change over time easier to understand than a stack of isolated encounter notes.
10. Prefer systems that are understandable, testable, replaceable, and auditable over clever opaque abstractions.
11. Elastic Complexity & Progressive Disclosure: The workspace must scale seamlessly between a distraction-free Zen pad (for solo psychotherapists or pure note-taking) and a high-density, multi-metric cockpit (for high-volume psychopharmacologists). The system must never force a single visual density or rigid module configuration on all clinicians.
12. AI as Canvas Controller & Workspace Operator: AI is an operator of the EHR workspace, not just a text generator. Clinicians can control their workspace, summon records, reconfigure cards, filter schedules, and toggle modules using natural language or voice intent. The workspace itself is an AI-addressable surface.

## AI principles

AI may summarize, organize, retrieve, draft, compare, identify possible inconsistencies, prepare structured information, and assist with workflow.

AI must not silently become the source of truth.

- Never invent patient facts, history, diagnoses, medications, labs, orders, billing evidence, or clinical events.
- Distinguish source data from AI inference.
- Preserve provenance whenever AI output depends on clinical records.
- Represent uncertainty when evidence is incomplete or conflicting.
- Require explicit clinician action before AI-generated content becomes part of the legal medical record or triggers an external clinical/financial action.
- Do not give an AI model unrestricted database access. Assemble the minimum permission-aware context required for the task.
- Important AI actions must be auditable.
- Design AI capabilities so models can be replaced without rewriting the EHR.

See `docs/AI_SYSTEM.md`.

## Clinical safety boundary

This is healthcare software. Treat clinical correctness, identity, permissions, provenance, and auditability as architectural requirements rather than later polish.

During early development:

- Use only fictional/synthetic patient data.
- Do not introduce real PHI until authentication, authorization, audit logging, encryption, backup/recovery, retention, secrets management, and HIPAA-appropriate infrastructure are intentionally implemented and reviewed.
- Never place PHI, credentials, access tokens, API secrets, or production keys in the repository.
- Never make destructive clinical actions implicit.
- Medication orders, prescriptions, controlled-substance actions, result acknowledgements, diagnoses, note signing, claims, and external communications must eventually require explicit authorized-user action.

## Architecture rules

Maintain clear boundaries between:

- Presentation/workspace layer
- Healthcare domain model
- Persistence/data access
- Integration adapters
- AI/context assembly
- Authentication/authorization
- Audit/event history

UI components should not become the canonical patient database.

External vendors should not leak deeply into domain logic. Use adapters/interfaces for e-prescribing, EPCS, labs, clearinghouses, scheduling, communications, payments, document exchange, and future external services.

Prefer a durable clinical domain model that can map to interoperability standards where needed.

## Development workflow

Before implementing a feature:

1. Read this file.
2. Read `docs/INDEX.md` and the documents relevant to the task.
3. Inspect the existing code and current behavior.
4. Identify the smallest coherent vertical slice that advances the product.
5. Preserve existing working behavior unless change is intentional.

While implementing:

- Prefer strongly typed domain structures.
- Keep components focused.
- Avoid premature frameworks and abstractions.
- Avoid adding dependencies when the platform or small local code is sufficient.
- Keep fictional fixtures clearly separated from future production data access.
- Build reusable primitives when the same interaction pattern clearly repeats; do not generalize purely speculatively.
- Add comments for architectural intent or non-obvious safety constraints, not to narrate obvious code.

Before completion:

- Run `npm run typecheck`.
- Run `npm run build`.
- Exercise the affected workflow when possible.
- Confirm no secret or real patient data was added.
- Update durable documentation if an architectural decision changed.
- If validation fails, fix it or explicitly report the unresolved failure; never call a failing build complete.

## Decision discipline

For decisions that materially affect architecture, data ownership, security, clinical safety, or vendor coupling, update `docs/DECISIONS.md`.

Do not casually reverse an established decision. If a better direction emerges, document why the previous decision changed.

## Current build priority

Build the clinician workflow nucleus and native AI capabilities concurrently:

1. workspace/navigation foundation & dynamic modularity (presets, reordering, density)
2. Today/schedule workflow & live practice cockpit
3. patient domain, creation/search, and cross-chart natural language queries
4. encounter lifecycle, autosaved drafts, and ambient AI note drafting
5. longitudinal timeline and cross-encounter search
6. medication workspace and automated protocol surveillance
7. tasks/inbox & proactive clinical queue
8. secure persistence, authentication, and audit foundation
9. integrations and production multimodal intelligence

See `docs/ROADMAP.md` for the living sequence.

## Skills

For implementation work, read `.codex/skills/ehr-builder/SKILL.md` when available. It defines the repeatable feature-building workflow for this project.

More specialized skills should only be added when a workflow has become repetitive enough to justify a reusable playbook. Do not create skills merely to create structure.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
