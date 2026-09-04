---
name: ehr-builder
description: Build or modify features in the Logancarton/EHR repository while preserving its workspace-first architecture, clinical safety boundaries, AI provenance, and direct-to-main workflow.
---

# EHR Builder Skill

Use this workflow for implementation tasks in https://github.com/Logancarton/EHR.

## Required context

Before editing code:

1. Read `/AGENTS.md`.
2. Read `/docs/INDEX.md`.
3. Read the specific design/architecture documents relevant to the requested feature.
4. Inspect the current implementation on `main`.

Do not rely only on a previous chat description of the repository.

## Feature workflow

### 1. Resolve the user goal

Translate the request into the smallest end-to-end clinician workflow that produces visible value.

Prefer a vertical slice over a large horizontal subsystem. Example: a working encounter draft that can be created, edited, autosaved, and reopened is better than building generic persistence infrastructure with no usable workflow.

### 2. Map the signal flow

Before coding, identify:

`user action -> UI state -> domain state -> persistence/tool action -> audit/provenance -> UI feedback`

For AI-assisted features also identify:

`source clinical data -> context assembly -> model -> structured output -> human review -> accepted action`

If any step is ambiguous, choose the design that keeps authoritative state explicit and AI-derived state separate.

### 3. Respect boundaries

- React components render and collect interaction; they are not the patient record.
- Domain models express clinical meaning without vendor-specific shapes.
- Persistence is accessed through a defined boundary.
- Vendor services use adapters.
- AI consumes deliberately assembled context.
- Auditable actions retain actor, timestamp, source, and relevant state when the production architecture reaches that layer.

### 4. Build for clinician cognition

Optimize for:

- fewer context switches
- fewer unnecessary clicks
- visible longitudinal change
- preservation of active patient context
- progressive disclosure instead of crowded screens
- fast recovery of "where was I?"
- clear distinction between read-only information, editable drafts, signed/committed records, and AI suggestions

Do not copy legacy EHR interaction patterns unless they solve a real workflow problem.

### 5. AI-specific requirements

If AI is involved:

- Never fabricate missing clinical evidence.
- Show or retain source provenance.
- Keep inference distinguishable from record facts.
- Prefer structured model outputs for downstream actions.
- Require clinician confirmation before committing AI-derived clinical or financial actions.
- Do not couple business logic to one model vendor.
- Do not send more patient context than the task requires.

### 6. Safety and data

During the prototype phase, use synthetic data only.

Never commit:

- PHI
- API keys
- tokens
- passwords
- credentials
- private certificates
- production secrets

Do not implement silent destructive actions.

### 7. Verification

At minimum run/verify:

```bash
npm run typecheck
npm run build
```

Also exercise the modified workflow when feasible.

A feature is not complete while validation is failing.

### 8. Documentation

Update durable documentation when the implementation changes:

- product behavior or product principles
- architecture boundaries
- major data ownership decisions
- AI behavior/safety rules
- roadmap status

Record consequential decisions in `/docs/DECISIONS.md`.

## Completion format

When reporting completion, keep it concise:

- What changed
- What the clinician can now do
- Validation result
- Any remaining limitation
- Best next vertical slice
