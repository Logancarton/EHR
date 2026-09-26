# AGENTS.md — EHR Project Constitution

This file is the highest-level project instruction for coding agents working in this repository.

## Source of truth

- Repository: https://github.com/Logancarton/EHR
- Default and active development branch: `main`.
- For agent-assisted work performed through GitHub, make changes directly to `main` unless Logan explicitly requests a branch or pull request.
- Do not create branches or pull requests by default.
- GitHub `main` is authoritative. A local checkout is a working copy, not the source of truth.
- Before making changes, inspect the current repository state rather than assuming prior conversation context matches the code.
- After meaningful code changes, run or verify the repository validation workflow. Do not report a feature as complete if required validation is failing.
- For documentation-only changes, validate Markdown structure/links, inspect the complete documentation diff, run or emulate `git diff --check`, and inspect relevant CI status when available. Do not run expensive application tests/builds merely because Markdown changed unless the documentation change depends on a runtime claim that needs verification.

## Product mission

Build Clinical Bond as an AI-native healthcare-practice workspace with an electronic health record as its authoritative clinical core. AI is integrated throughout the system rather than bolted on as a chatbot.

The product spans Intake, Provider / Clinical Home, Billing, Analysis, Branding / Growth, HR, and Personal + Shared Storage while preserving clear authority boundaries.

**Execution priority: EHR first.** The broader platform is long-term scope, not permission to build every domain now. Until the core psychiatric EHR reaches the production-readiness gate, choose work that completes or hardens `Intake -> schedule -> patient chart -> encounter -> note/scribe -> medications/prescribing -> labs/results -> communication -> billing -> follow-up`. Do not initiate standalone expansion of Analysis, Branding/Growth, HR, or Personal + Shared Storage unless Logan explicitly reprioritizes it or the work directly unblocks the EHR loop, security/compliance, production readiness, or a required vendor integration. Preserve existing functionality in deferred domains. The product should feel more like a modern browser/workspace than a conventional EHR. A clinician should be able to keep multiple patient charts open, move between them quickly, preserve context, and work across clinical surfaces without repeatedly opening and closing disconnected modules.

**Current milestone and spending (D-107).** The target now is a functional funding prototype of that loop on synthetic data. Do not spend money: no paid vendors, services, subscriptions, APIs or hosted models without Logan's explicit approval. Build paid integrations up to their adapter boundary and leave them clearly disconnected until funding. AI features come in the final weeks before the pitch, by the owner's choice. Follow this plan rather than re-arguing it, and report concrete risks. See [docs/decisions/D-107.md](docs/decisions/D-107.md).

The central product model is:

`Clinician intent (voice/text/direct) <-> Dynamic Workspace (Zen to Cockpit) <-> Structured Clinical State <-> Ambient AI Substrate`

AI should reduce cognitive and clerical work while the clinician remains the decision-maker.

The owner's intended experience is light, readable, and familiar from Google Workspace/Facebook, with Chrome-like labeled persistent tabs. "Anywhere from anywhere" means context-preserving access to related records and authorized actions through direct controls or the shared AI intent path. Minimalism removes repetition and reveals detail on demand; it must not remove information, shrink essential text, conceal patient identity, or replace visible labels with icon memorization. The canonical requirements live in [docs/PRODUCT_VISION.md](docs/PRODUCT_VISION.md).

## Product principles

1. Patient = workspace, not page; Provider / Clinical Home is also a persistent operating workspace for cross-patient and practice work.
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
2. Read `docs/INDEX.md`, `docs/PRODUCT_VISION.md` (the canonical True North interaction specification), and the documents relevant to the task.
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

For code/runtime changes:
- Run `npm run check` (lint + typecheck + Node/unit tests — the fast inner loop; `npm run lint` and `npm run typecheck` also run standalone).
- Run `npm run build`.
- Exercise the affected workflow when possible.
- Confirm no secret or real patient data was added.
- Update durable documentation if an architectural decision changed.
- If validation fails, fix it or explicitly report the unresolved failure; never call a failing build complete.

For documentation-only changes:
- Verify repository-relative Markdown links and anchors that were changed.
- Confirm active docs do not contain machine-local filesystem links.
- Inspect the documentation diff as a system for contradictory current guidance.
- Run or emulate `git diff --check`; inspect CI if the commit triggers it.
- Do not claim application tests/builds were run when they were not.

## Product alignment and handoffs

- Treat `docs/PRODUCT_VISION.md` as the canonical intended experience and interaction checklist. Requirements there are targets, not proof that features already work.
- For each meaningful change, identify relevant requirement IDs and the clinician workflow it advances or safely enables.
- Preserve browser-like patient workspaces, contextual AI, progressive disclosure, and clinician-controlled layout; avoid drifting into disconnected module pages or a dense default dashboard.
- Inspect current code before claiming completion or choosing the next phase. Do not rebuild existing systems from stale handoffs.
- In completion reports, include commit references, validation evidence, remaining gaps, and the next smallest coherent step. Distinguish implemented behavior from partial or deferred targets.
- Root `HANDOFF.md` is ephemeral and only for genuinely unfinished in-flight transfer. Archive completed handoffs under `docs/archive/handoffs/`; never use HANDOFF as a second roadmap or architecture document.
- Keep product direction in the existing vision document; record intentional changes in `docs/DECISIONS.md` rather than creating competing source-of-truth files.

## Execution contract for every coding agent

1. **Establish the baseline.** Fetch current `main`, record the starting SHA and worktree status, read the roadmap evidence and relevant ADRs, and inspect implementation before deciding something is missing. Preserve others' changes. Re-read/fetch before publishing; integrate concurrent commits without force-pushing.
2. **Bound the slice.** Name one roadmap slice (or the owner's explicit override), its product requirement IDs, the clinician workflow, owning source records, expected visible change, and exclusions. Paths in a plan are starting points, not an instruction to recreate moved components.
3. **Preserve ownership.** Reuse the navigation controller, shared schedule store, existing workspace/preference lifecycle, planner, and clinical action boundary. Do not introduce another router, answer ladder, patient store, task truth, or generic framework to accomplish presentation cleanup.
4. **Specify the interaction.** Before replacing a control or duplicate block, map each unique fact/action to its retained location and return path. For navigation migrations, the replacement must coexist with the old route until parity is verified; deletion is a later bounded step. Keep high-frequency clinical actions visible; put contextual tools in the shared companion/canvas lifecycle and secondary layout actions in a labeled-accessible overflow. Keep keyboard/focus behavior and a visible way to recover hidden work.
5. **Implement and verify one coherent result.** Exercise success, empty, loading, failure, stale response, wrong-patient/access, and recovery cases that are relevant to the slice. For visual changes inspect the running result at the roadmap's viewport/zoom matrix, with synthetic data. Tests must cover behavior, not merely the presence of a selector.
6. **Report accurately.** Provide starting/resulting SHA, requirement and slice IDs, changed behavior, checks actually run with outcomes, UI evidence when applicable, unresolved risks, and the next eligible slice. Distinguish code present, behavior verified, blocked, and complete. Give a concise usable result before ending; never leave a long investigation without findings.
7. **Update the owning document.** Remaining work goes in ROADMAP; when a slice is finished, its completion evidence moves to `docs/ROADMAP_COMPLETED.md` and the slice is removed from ROADMAP in the same commit; product changes go in PRODUCT_VISION plus an ADR; architecture changes go in ARCHITECTURE plus an ADR. Do not mirror the ordered queue here, in README, or in HANDOFF.

### Drift prevention

- Preserve the two-level shell: a calm global top bar above persistent labeled patient/workspace tabs. The tab strip's `+` is the durable **Open workspace** path; Home is the suite launcher. Do not restore a permanent left app rail or add another full-width navigation row.
- Treat the current top work-navigation groups as **transitional migration paths**, not the final shell. Never delete one first. Add its replacement, verify feature parity/state preservation/browser coverage, then remove only that one old entry. The first required sequence is `+ launcher -> Communication companion -> expand/redock parity -> remove Team`.
- Home major entities are Clinical, Billing, and Brand. Staff/People/HR is not a Home or major `+` app; it belongs in the contextual companion/canvas layer. Website/Social consolidate under Brand; Settings/layout configuration belongs under profile/preferences.
- A single identity header is required **per independently usable patient pane**, not one identity label for the entire application. Keep identity available in detached views, encounter work, and action review.
- Use the existing vanilla CSS/token system and semantic stacking layers. No UI-framework migration, blanket font reduction, repo-wide reformatting, or routing/schema rewrite as part of these cleanup slices.
- Ground every answer surface and status/count in authorized source data. Never substitute fixture literals or a successful-looking fallback when retrieval fails. Cancel/reject stale responses and preserve the originating patient of proposals.
- External success requires authoritative transport evidence. A timer, local state update, mock token, or toast cannot establish delivery, publishing, credential verification, payment, or EPCS readiness. Preview content must be explicitly separated from operational views.
- Existing failing tests are not permanent waivers. Diagnose the cause, preserve the intended authority/clinical rule, and document any remaining blocker. Never skip, weaken, or rewrite assertions solely to turn CI green.
- A new feature or architectural rewrite outside the selected slice is deferred with a concrete reason. Routine implementation choices within the accepted plan do not require another owner approval. Ask only when a material product/authority conflict cannot be resolved from current instructions.

## Decision discipline

For decisions that materially affect architecture, data ownership, security, clinical safety, vendor coupling, or durable product behavior, update the relevant ADR under `docs/decisions/` (or add the next stable D-number) and update the lightweight `docs/DECISIONS.md` index.

Do not casually reverse an established decision. If a better direction emerges, preserve the historical rationale and record explicit supersession/amendment metadata.

## Current work priority

The active execution queue lives only in [`docs/ROADMAP.md`](docs/ROADMAP.md). Do not maintain a second ordered feature queue here. Re-read the current roadmap and current `main` before choosing a slice.

## Skills

For implementation work, read `.codex/skills/ehr-builder/SKILL.md` when available. It defines the repeatable feature-building workflow for this project.

More specialized skills should only be added when a workflow has become repetitive enough to justify a reusable playbook. Do not create skills merely to create structure.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
