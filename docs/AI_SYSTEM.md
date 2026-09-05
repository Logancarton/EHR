# AI System Architecture

## Purpose

AI is a cross-cutting capability of the EHR. It should assist wherever cognition, synthesis, retrieval, drafting, comparison, or workflow preparation can be improved.

AI must remain downstream of authoritative clinical data and upstream of human-reviewed actions.

## Core signal flow

The preferred pattern is:

`authoritative data -> context assembly -> AI reasoning/generation -> structured candidate output -> clinician review -> committed action`

The system should make each boundary explicit.

## Context assembly

Do not give models unrestricted access to the entire patient database.

Build a context assembly layer that selects information based on:

- active patient
- active task/surface
- user permissions
- recency and relevance
- data sensitivity
- required source provenance

The context layer should be model-independent.

## AI output classes

### Read-only assistance

Examples: summaries, comparisons, retrieval, timeline synthesis, explanation of record content.

These outputs may be generated dynamically but should remain distinguishable from source facts.

### Draft assistance

Examples: draft note sections, patient messages, letters, encounter summaries, proposed structured fields.

Drafts require clinician review before becoming committed record content.

### Candidate actions

Examples: proposed medication changes, lab orders, prescriptions, diagnosis updates, billing/coding candidates, follow-up tasks, referrals.

AI may prepare these workflows but should not execute consequential external actions autonomously.

### Workspace & layout operations

Examples: switching layout presets (`Minimal Focus`, `Comprehensive Intake`, `Fast Med Check`), reordering overview cards, expanding/collapsing note sections, toggling sidebar rails, focusing specific clinical surfaces.

AI can act as an operator of the EHR workspace canvas: clinicians can issue natural language or voice commands to dynamically reshape their screen without navigating complex preference menus.

```typescript
type WorkspaceOperation =
  | { action: "apply_preset"; presetId: string }
  | { action: "set_density"; mode: "comfortable" | "compact" | "minimal" }
  | { action: "toggle_widget"; widgetId: string; visible: boolean }
  | { action: "reorder_cards"; target: "overview" | "today"; order: string[] }
  | { action: "focus_surface"; patientId: string; section: string };
```

## Provenance

AI outputs that depend on patient data should be capable of answering: "What record evidence produced this?"

Where practical, retain source references such as encounter IDs, document IDs, lab observations, medication events, messages, timestamps, or other stable record identifiers.

The system should not present inference with the same visual or data status as a recorded fact.

## Uncertainty and contradiction

Patient records are often incomplete or internally inconsistent.

The AI layer should be able to represent:

- known fact
- likely inference
- unresolved contradiction
- missing information
- stale information
- user-confirmation required

Do not force uncertain information into false certainty merely to produce a clean summary.

## Structured outputs

When AI output feeds another system function, prefer validated structured outputs over free text.

Examples:

- candidate medication change object
- candidate task
- candidate diagnosis evidence
- candidate billing evidence
- timeline event extraction
- note section draft with source references

Validate model output before it reaches domain logic.

## Model independence

No core clinical or business rule should depend on one LLM vendor's proprietary response format.

Use provider/model adapters so models can be changed based on:

- capability
- cost
- latency
- privacy/compliance requirements
- task type

Different tasks may eventually use different models.

## Deterministic logic vs AI

Use deterministic software for rules that can be stated reliably.

Use AI for ambiguity, language, synthesis, retrieval, ranking, pattern recognition, and drafting.

A useful rule:

If the same inputs should always produce the same legally/clinically required outcome, prefer deterministic logic and use AI only to gather or explain evidence.

## Memory

Do not treat model conversation history as the patient record.

Long-term patient context belongs in structured clinical storage and auditable documents/events. AI memory should be derived from or linked back to those authoritative sources.

## Safety and action gating

Require explicit clinician authorization before AI output causes consequential actions such as:

- signing a note
- adding/removing a diagnosis as committed record data
- creating or changing a medication order
- sending a prescription
- controlled-substance/EPCS action
- acknowledging a result on behalf of the clinician
- sending an external patient communication
- submitting a claim
- placing a clinical order

The UI should make the pending action and its source evidence visible before confirmation.

## Auditability

Production AI events should eventually record enough information to reconstruct important decisions, including appropriate subsets of:

- user/actor
- patient/context identity
- task type
- model/provider/version
- source record references
- generated structured output
- user acceptance/edit/rejection
- resulting committed action
- timestamp

Avoid storing unnecessary sensitive model input when stable source references can provide equivalent auditability.

## Evaluation

AI features should be evaluated as product components, not only by subjective impression.

Possible measures include:

- factual grounding
- unsupported-claim rate
- source/provenance accuracy
- task completion rate
- clinician edit distance
- clinician acceptance/rejection rate
- latency
- cost

## Adaptive Provider Personalization & Elastic Complexity

Clinicians vary widely in their preferred documentation verbosity, clinical risk tolerances, and interface density:

- A solo psychotherapist may require a distraction-free, narrative-focused Zen workspace with brief assessments.
- An interventional or child/adolescent psychiatrist may require granular diagnostic criteria, standardized symptom scoring scales (e.g. PHQ-9, GAD-7, Vanderbilt), and detailed titration rationales.

The AI layer should respect and learn provider preferences over time:
1. **Layout Elasticity**: AI recommends or activates clinical presets matching the provider's active clinical mode (e.g. automatically proposing `Comprehensive Intake` when opening a 60-minute new patient, or `Fast Med Check` for brief follow-ups).
2. **Drafting Style Alignment**: Proposed note drafts conform to the clinician's established sentence structure, abbreviation preferences, and detail density.
3. **Surveillance Thresholds**: Practice-level or clinician-level medication monitoring protocols (e.g. annual lipid/glucose vs bi-annual) dictate automated surveillance prompts.
- safety-critical false positive/negative behavior

High-risk AI features should have explicit test cases before production use.
