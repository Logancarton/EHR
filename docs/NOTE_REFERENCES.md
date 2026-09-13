# Clinical Reference Layer — Plan

Status: proposed. Not yet an accepted decision.

Replaces the smart-chip-binding proposal. Smart chips as an authoring mechanism are abandoned: an AI extraction pass authors the references instead, and reference tokens no longer live in note text.

Related: `AGENTS.md` (AI principles, clinical safety boundary), `docs/AI_SYSTEM.md`, `docs/ROADMAP.md` P3-A / P3-C / P3-F / P3-H, `docs/DECISIONS.md` D-019, D-020, D-021, D-030.

---

## 1. Verdict

The goal is unchanged: the EHR should know which diagnoses and medications an encounter addressed, so that coding is derived rather than re-entered, and so that an exported note reads as formal clinical prose.

What changes is who authors the link. An AI extraction pass reads the note and proposes references to existing clinical records. It does **not** replace the reference — it replaces the `@` menu.

That distinction is the whole design. A model that reads the note at sign time and concludes "99214 for F33.1" is the current substring matcher with better judgment: inference over prose, no provenance, a different answer on re-run, and nothing to show an auditor. A model that emits **durable references to named records, stored and attested**, is a different system. The output of the first is an opinion. The output of the second is evidence.

Three properties force the reference to be a stored object rather than a model call:

- **Audit defense.** "Our AI read the note and concluded so" does not survive a payer review. "These two problem records were addressed, this medication was titrated on this date, the clinician attested at signing" does.
- **Determinism.** An extraction pass on every autosave is slow, costly, and non-deterministic; a coding dock that flickers between 99213 and 99214 as the clinician types is unusable. The extraction must be cached — and the cache *is* the reference index.
- **Immutability.** A note signed today must render identically in 2031, when the model that read it no longer exists.

Abandoning tokens-in-text is a strict improvement and closes a live defect. `@[dx:...]` markup in `draft.assessment` is why exports leaked raw syntax. References stored out of band mean the note text is clean prose from the first keystroke: nothing to strip, nothing to leak into a faxed record.

---

## 2. Mechanism

### 2.1 The reference is out of band

A reference is a row, not a token. Note text stays plain prose.

```
NoteReference {
  encounterId  string
  section      'assessment' | 'plan' | 'intervalHistory' | ...
  entityType   'problem' | 'medication' | 'observation' | 'assessment' | 'allergy'
  entityId     string        // patient_problems.id, patient_medications.id, ...
  versionNum   number        // record_versions.version_number when referenced
  spanStart    number|null   // presentation hint only — see 2.6
  spanEnd      number|null
  source       'ai-extracted' | 'clinician-authored' | 'action-derived'
  confidence   number|null
  status       'proposed' | 'confirmed' | 'rejected'
}
```

The durable key is `(encounterId, section, entityType, entityId)`. Spans are decoration and may be lost without loss of meaning.

`entityId` is the load-bearing field, and it is the reason this is not text mining. The extractor may only reference records that already exist for this patient. It cannot mint a diagnosis, a medication, or a code.

### 2.2 Extracted references are evidence, not truth

This is the same boundary the product already draws for medications. D-019 separates medication clinical truth from prescribing-vendor evidence; D-020 makes reconciliation an explicit clinician conversion of evidence into truth. Note extraction is that pattern applied to narrative.

| | Evidence | Truth |
|---|---|---|
| Medications | vendor/patient-reported history | `patient_medications` after reconciliation |
| Notes | `source='ai-extracted'`, `status='proposed'` | `status='confirmed'` — attested at signing |

Consequences, all non-negotiable:

- A `proposed` reference never silently counts toward MDM or a claim. It may **display** as a contributing factor, marked as unconfirmed.
- Confirmation happens at signing, in bulk, with the clinician able to reject individually. Signing is the conversion act.
- A clinician who explicitly links a record (from the problem list, or by accepting a candidate action) writes `source='clinician-authored'`, `status='confirmed'` directly. Authoring survives as a path; it is just no longer the only one.
- `source='action-derived'` covers references the system knows structurally rather than linguistically: a staged order, an accepted candidate action, a reconciliation performed in this encounter. These are the strongest evidence class and require no model at all.

That third class matters more than it looks. A meaningful share of what the coding engine needs — prescription drug management above all — is already knowable from structured events in the encounter without reading a single sentence.

### 2.3 Storage

```sql
CREATE TABLE encounter_note_references (
  id            TEXT PRIMARY KEY,
  encounter_id  TEXT NOT NULL,
  section       TEXT NOT NULL,
  entity_type   TEXT NOT NULL,
  entity_id     TEXT NOT NULL,
  version_num   INTEGER,
  span_start    INTEGER,
  span_end      INTEGER,
  source        TEXT NOT NULL,          -- 'ai-extracted' | 'clinician-authored' | 'action-derived'
  confidence    REAL,
  status        TEXT NOT NULL DEFAULT 'proposed',
  model_id      TEXT,                   -- extraction provenance
  extracted_at  TEXT,
  confirmed_by  TEXT,
  confirmed_at  TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  UNIQUE (encounter_id, section, entity_type, entity_id),
  FOREIGN KEY (encounter_id) REFERENCES encounters (id) ON DELETE CASCADE
);
```

Every extraction run also writes a `provenance_events` row per the existing pattern — entity, activity, model identity, payload hash. AGENTS.md requires important AI actions to be auditable; this is where that is satisfied.

A `clinician-authored` or `confirmed` reference is **never** overwritten by a later extraction run. Re-extraction may add proposals and may mark its own stale proposals rejected. It may not touch a human decision.

### 2.4 When extraction runs

Not on every keystroke, and not once at signing.

- **Debounced on section blur**, per section, for sections that changed. Assessment and Plan carry the coding weight and are short; extracting a single section is cheap.
- **Once on opening the sign modal**, over any section still dirty, so the clinician never signs against a stale proposal.
- Never blocking. Autosave and signing must not wait on a model. Extraction is asynchronous and the coding dock reflects the last completed run, labeled with its freshness.

Content-hash each section. Unchanged text is never re-extracted, which makes the steady state free.

### 2.5 What the extractor is given

AGENTS.md forbids giving a model unrestricted database access; context is assembled to the minimum permission-aware set. Reuse `app/server/context/context-assembler.ts`.

Input per call: the section text, plus a **candidate set** — the patient's active problems, active medications, recent observations, and recent assessments, each as `{ entityId, display, code }`. Nothing else. No other patient's data, no free-form chart access.

Output: a constrained list of `{ entityId, section, spanStart, spanEnd, confidence }`. The model selects from the candidate set; it does not generate identifiers. A returned `entityId` outside the candidate set is discarded and logged as a validation failure, not repaired.

This shape is what makes the model replaceable per AGENTS.md — the contract is a selection over a supplied set, not open-ended generation.

### 2.6 Spans drift; the reference does not

Character offsets are invalidated by the next edit anywhere earlier in the section. Do not build reconciliation logic to chase them.

Spans are a **presentation hint** with one job: letting the editor underline referenced phrases and letting a hovercard open from them. On any section edit, spans for that section are marked stale and the underline simply stops rendering until the next extraction restores it. The reference itself — the `(section, entityType, entityId)` tuple — survives untouched, because it is what the coding engine and the claim consume. Nothing clinical or financial depends on an offset.

### 2.7 Rendering

The export problem largely dissolves, because note text is already clean prose. What remains is an enrichment opportunity rather than a correctness fix.

| Target | Mode | Behavior |
|---|---|---|
| Editor / signed view | `interactive` | prose, with referenced phrases underlined from live spans; hovercard resolves the record |
| Legal export, print, fax, referral | `formal` | prose as written, optionally with a generated **Structured Summary** block listing confirmed diagnoses (with codes), medications addressed, and results reviewed |
| Claim / interoperability boundary | `structured` | confirmed references only, resolved to `{ system, code, entityId }` |

Keep a regression test asserting no export path emits a `@[` sequence — legacy drafts authored under the chip prototype may still contain tokens, and those must be stripped on read and migrated (see Phase 1).

### 2.8 The coding engine reads references, weighted by evidence class

`calculateEncounterCoding(draft, minutes, references)`. Rules become auditable instead of lexical, and each element reports its evidence class.

- **Problems addressed** — distinct `entityType='problem'` references in Assessment/Plan, weighted by each problem's own status/stability. Replaces `assessmentText.includes("adhd")`.
- **Prescription drug management** (the Moderate-risk pillar for 99214) — a medication reference in Plan, **plus** a medication-change event in this encounter: a staged order, a reconciliation, or a dose delta against `patient_medications`. Mostly `action-derived`, so mostly model-free. Replaces `textCorpus.includes("mg")`.
- **Data reviewed** — `entityType='observation'` references plus acknowledged results in the encounter window. A defensible Category-1 count.
- **Assessments** — `entityType='assessment'` references, per ROADMAP P3-F.

Each `EncounterGoal` carries `evidence: 'action-derived' | 'clinician-authored' | 'ai-extracted' | 'inferred'` and `sourceRefs: string[]`. `inferred` is the demoted prose-heuristic fallback, retained only so an un-extracted draft still shows something. The dock displays which record satisfied each goal and lets the clinician click through. A suggested code resting on `inferred` evidence is visually distinct from one resting on named records — the clinician should always be able to see which claim they are about to sign.

**Delete on sight:** the ICD-10 substring guess in `EncounterNoteDocument.tsx` (`d.includes("ADHD") ? "F90.2" : ... : "F33.1"`), which silently codes any unmatched diagnosis as recurrent MDD. It is a direct violation of the AGENTS.md prohibition on inventing billing evidence and is the highest-severity item in this plan. No component outside the resolver may map a clinical label to a code.

### 2.9 Signing freezes the projection and performs the conversion

At sign, in one transaction: every `proposed` reference the clinician accepted becomes `confirmed` with `confirmed_by`/`confirmed_at`; rejected ones are retained as `rejected` (never deleted — a rejection is audit-relevant); the resolved formal rendering of every confirmed reference is persisted into the signed snapshot via the existing `snapshotSignedEncounter()` in `app/server/db/chart-integrity.ts`; an audit event records the reference set, the model identity that proposed it, and the accepted code.

After signing, the signed view reads the snapshot rather than live records. Change a dose next month and the signed note is unchanged while the hovercard shows both values. This is D-030 applied to time: change must be loaded, never assumed.

### 2.10 The clinician attests

The reference set **pre-populates** the Diagnoses and Billing steps of `EncounterSignModal`. It does not decide them. The clinician sees the proposed diagnoses with their evidence class, the suggested code with the records supporting each element, adds or removes, and signs. Per AGENTS.md, no AI output becomes part of the legal record or triggers a financial action without explicit clinician action.

The win is that the drop-down arrives already correct, not that the drop-down disappears.

---

## 3. Implication

Billing stops being a second act of documentation assembled by hand from the same facts. Exports become releasable — today any note authored with the chip prototype leaks raw markup into print and fax, unguarded by any test. The P3-H timeline gets its edges as a query (`which encounters addressed this problem?`) instead of a full-text search. And the fabricated-ICD defect closes: a code reaches a claim only by having been recorded on a problem record by a clinician.

Sequencing dependency, stated plainly: references are only as good as the records they point at. `patient_problems` and `patient_medications` exist and are backfilled, so this works today — but ICD-10 codes on those records stay weak until ROADMAP **P3-A** lands. Until then a reference renders whatever code the record holds, **including none**. A missing code shows as missing. That is the correct behavior and should not be softened.

---

## 4. Build sequence

Four vertical slices. Each is independently shippable and leaves the product working. Phases 1–2 of the abandoned chip plan are dead; what follows is its surviving spine with the front end replaced.

### Phase 1 — Reference layer and legacy cleanup

**Inspect:** `app/domain/smart-canvas.ts`, `EncounterNoteDocument.tsx` (~113-200, `computedChips`), `EncounterWorkspace.tsx` (`handleCopyCleanNote`), `SmartProseEditor.tsx`, `SmartCanvasMenu.tsx`.

**Implement:**
- Migration for `encounter_note_references` in `app/server/db/migrations.ts`.
- `NoteReferenceRepository` with the version/provenance stamping the other repositories use.
- **Delete the ICD substring guess.** Highest-priority item in the phase.
- Migrate legacy `@[type:Label]` tokens in existing drafts: strip from text, best-effort match the label against the patient's records, write matches as `source='ai-extracted'`, `status='proposed'` (they were never attested), leave unmatched labels as plain text.
- Retire `SmartProseEditor` / `SmartCanvasMenu` / `SmartChipHoverCard` down to a plain prose editor plus a reference-underline layer.

**Validate:** migration is idempotent; a test asserting no export path emits `@[`; a test asserting no module outside the resolver maps a clinical label to a code.

**Exit gate:** note text is plain prose everywhere; references persist and resolve; no fabricated codes anywhere in the codebase.

### Phase 2 — Reference authoring

There is no LLM provider wired into this repository today. `app/server/ai/omnibox-model-gateway.ts` is a deterministic regex planner sitting behind an `OmniboxPlanningModel` interface with a validated output contract, and `.env.example` carries no provider settings. That is a constraint on sequencing, and it splits this phase cleanly — the half that needs no model is also the half that carries the most coding weight.

**Phase 2a — action-derived references (no model). Medication path implemented.**

Building this surfaced a prerequisite the plan had assumed away: **the encounter was not an organizing key for clinical actions.** `orders` was patient-scoped and time-ordered with no encounter column, and so is `medication_reconciliation_candidates`. "What was ordered during this visit" could only be answered by guessing at a time window — the exact class of inference this layer exists to remove, sitting underneath the strongest evidence class.

Implemented:

- `orders.encounter_id`, nullable and deliberately not backfilled (`2026-09-13-003`). An order placed before the column existed genuinely has no recorded encounter, and inferring one from proximity would manufacture the association the column is meant to make trustworthy. Threaded through `OrderRepository.stageOrder`, `OrderRepositoryPort`, `ClinicalService.stageOrder`, and the `stage_order` gateway action, plus `OrderRepository.getByEncounter`.
- `ActionDerivedReferenceService.deriveForEncounter` writes medication references from encounter-linked orders carrying a `medicationTruthConfirmation`. Intent alone produces nothing: until truth is confirmed there is no medication record to point at, and pointing at the order instead would make a prescription look like a medication the patient is taking (D-019/D-021). A confirmation naming a record that does not exist is skipped rather than written.
- Action-derived references are created `confirmed`, not `proposed`. Only extraction proposes. Staging an order is the clinician's own act; what signing decides is what reaches the claim, not whether the act happened.
- `replaceSection` takes a source scope. Each pass retires only its own rows, so extraction and derivation can write into the same section without clearing each other, and neither clears a clinician link. Derivation retains ownership of its own rows so a withdrawn order withdraws its reference — the one case where a `confirmed` row is still retirable.

Remaining in 2a:

- **Reconciliations** have the same missing linkage. `medication_reconciliation_candidates` needs an encounter association before a reconciliation performed during a visit can be derived from it.
- **Accepted candidate actions** carry only title and detail text, no entity identity, so they cannot produce a reference without matching. Either they gain an entity reference where the AI proposes them, or they stay out of this evidence class.
- **Lab orders** are deliberately excluded. An order is a workflow object, not a clinical record, and an unresulted lab has no observation to point at. Data-reviewed counts resulted observations.
- **Call sites.** Wired — see the phase 3 note below.

**Phase 2b — extraction (model-shaped, model-optional). Implemented.**

Still no LLM provider in this repository. What shipped is the whole pipeline behind an interface, with a deterministic implementation in the seat a hosted model will take.

- `NoteReferenceExtractor` (`app/server/ai/note-reference-extractor.ts`) mirrors the `OmniboxPlanningModel` shape already proven here: an interface, a validated output contract, and a local implementation. `extractWithModel` runs an extractor and validates what it returns.
- `DeterministicNoteReferenceExtractor` (`model: "deterministic-v1"`) matches candidate display strings, aliases, and a medication's leading drug name against the section text, word-boundary anchored, longest term first. It is weaker than a model would be, and that is acceptable: every reference it produces is a proposal requiring confirmation either way. Swapping in a hosted model changes no caller.
- `validateExtractionOutput` (`app/domain/note-reference-extraction.ts`) enforces the contract. **Structural faults throw** — a response that is not the agreed shape cannot be partially trusted. **Individual bad selections are discarded and recorded**, never repaired: an `entityId` outside the candidate set is the single most important rejection, and it lands in `provenance_events` as `note-extraction-rejected` with the model identity. A nonsensical span is dropped while the reference it decorated survives, because the reference is the finding and the span only decorates it.
- `NoteExtractionService.extractSection` builds the candidate set from this patient's active problems, active medications, and recent observations — nothing else — runs the extractor, and writes proposals through `replaceSection(..., "ai-extracted")`, so a pass retires only its own stale proposals and never a confirmed reference or a clinician link.
- **Unchanged text is never re-extracted.** `encounter_section_extractions` (`2026-09-13-004`) holds a content hash per section, keyed also by model identity, since a different extractor may legitimately reach a different answer about identical text. The steady state costs nothing.
- **A signed note is not extracted from.** Its references were confirmed at signing and are frozen with it; a later pass has no business proposing anything about it.

Wiring: `POST /api/encounters/[id]/references` gated on `edit_draft` — which is what this is, a consequence of the clinician writing their note. `EncounterWorkspace` debounces 1500ms on Assessment and Plan, the two sections that decide problems addressed and prescription drug management. Debounced rather than fired on blur so dictation, template application and typing all settle the same way. Never blocking, never fatal: extraction failing leaves the note as it is and the dock falls back to reading the text.

### Phase 3 — Structured coding engine — implemented

`calculateEncounterCoding(draft, minutes, references)` now reads references. `EncounterGoal` carries `evidence` and `sourceRefs`; `CodingRecommendation` carries `evidenceBasis` (`structured` / `mixed` / `inferred`) and `unconfirmedReferenceCount`. `EncounterCodingDock` shows the evidence class per goal, how many records satisfied it, and a standing notice when proposals are pending.

**The fallback is a tier, not a second opinion.** This is the design decision the phase turned on. Prose heuristics run only when the encounter has *no references at all* — a draft nothing has derived or extracted from yet. The moment references exist, they are the answer, and the word search stops contributing.

The alternative, OR-ing the heuristic in alongside references, preserves every false positive it was meant to remove: "her mother takes lithium 300 mg" would still satisfy the Moderate-risk pillar of a 99214. Under-capture is the safer failure for a billing claim and it is the visible one — an unmet goal states what is missing ("the note mentions medication, but no medication record is referenced in the plan"), and a proposal that would change the answer is reported rather than counted. A note running on the fallback is labelled `inferred` and its MDM reasoning says so outright.

Rules now in force:

- **Problems addressed** — distinct confirmed `problem` references in Assessment or Plan. A problem referenced only in Interval History or Review of Symptoms is context, not a problem addressed.
- **Prescription drug management** — a confirmed `medication` reference in Plan, which in practice means an order staged against this encounter and converted into medication truth.
- **Data reviewed** — distinct confirmed `observation` references.
- **Psychotherapy duration** — reclassified `clinician-authored`; a recorded number is not a reading of prose.
- **Safety** stays `inferred` by necessity: it lives in the MSE narrative and has no structured record to point at yet.

Nothing about the 2-of-3 scoring changed, and it should not: one referenced problem plus a referenced medication change is still a 99213, because the second category is not at moderate. The engine was already right about that.

**Wired.** `GET /api/encounters/[id]/references` refreshes the action-derived set and returns the encounter's references; `api.encounters.references()` reads it; `EncounterWorkspace` holds them in state, reloads on `ehr-order-cart-updated`, and passes them to the engine. `EncounterSignModal` now stages its orders with `draft.encounterId`, which is the link that makes any of it reach coding. Derivation also runs at the two mutation sites that change the answer — `confirmMedicationTruth` (where a prescription becomes a medication record) and `removeStaged` (where it goes away).

Two deliberate choices in that wiring:

- **The read path recomputes before returning.** A write during a GET, which the read/write separation elsewhere in this codebase would normally rule out. It is allowed here because these rows are a view over authoritative records — orders placed against this encounter and the medication truth they produced — in the same sense `encounters_fts` is a view over note content. Nothing clinical is created: a reference can only point at a record that already exists, and extraction proposals and clinician links are never touched. Recomputing on read is what makes the view self-healing when a mutation-side refresh failed.
- **Derivation never fails a clinical action.** Both mutation-site calls are wrapped and swallowed. A clinician's medication-truth confirmation must not fail because a derived view could not be rebuilt; the read path repairs it.

An encounter with no references at all still falls back to reading the note text, including one whose only reference was just withdrawn. That is correct for now — nothing structured is known about it — but it is also why phase 2b matters: until extraction runs, most notes will run on the labelled fallback.

### Phase 4 — Sign-time conversion and freeze

**Implement:**
- Sign modal Diagnoses/Billing steps pre-populated from references, grouped by evidence class, individually rejectable.
- One transaction at sign: confirm/reject, persist resolved formal renderings into the signed snapshot, audit the reference set and accepted code.
- Signed view reads the snapshot; hovercards still reach live records.
- Optional `formal`-mode Structured Summary block for outbound notes.

**Validate:** change a medication dose after signing — signed note text unchanged, live chart updated, hovercard shows both; rejected references persist as `rejected`.

**Exit gate:** a signed note is immutable in content while remaining navigable, and the claim carries clinician-attested codes traceable to named records.

---

## 5. Failure modes to design against

Extraction is non-deterministic, which introduces risks the chip design did not have. Each has a named mitigation above; they are collected here so they are not lost.

1. **Silent over-capture.** The model references a problem mentioned only as history, inflating problem count. Mitigation: section weighting (Assessment/Plan only for MDM), `proposed` never counting on its own, clinician rejection at signing.
2. **Silent under-capture.** The model misses a diagnosis and the code drops a level with no visible reason. Mitigation: the dock shows unmet goals and their evidence, so absence is visible rather than inferred — D-030.
3. **Model drift.** A model upgrade changes coding behavior across the practice. Mitigation: `model_id` on every reference, and signed encounters frozen to their snapshot.
4. **Extraction unavailable.** Network or vendor failure at sign time. Mitigation: asynchronous and non-blocking; fall back to `inferred` with the degraded state labeled; signing is never gated on a model call.
5. **Cost and latency creep.** Mitigation: content-hashed sections, per-section extraction, no keystroke triggers, `action-derived` references carrying the heaviest coding element without a model.

---

## 6. Decision to record

On acceptance, add to `docs/DECISIONS.md`:

> **D-0xx — Encounter notes carry out-of-band references to clinical records; AI proposes them and the clinician confirms them.**
> Note text is plain prose. References are rows keyed by `(encounter, section, entityType, entityId)`, authored by AI extraction, clinician action, or structured encounter events, and carry an evidence class. Extraction selects from a supplied permission-scoped candidate set and may never mint an identifier or a code. Proposed references are evidence, not truth; signing is the explicit clinician conversion and freezes the resolved projection into the signed snapshot. The confirmed reference set is the sole structured input to E/M coding, alongside a clearly labeled prose-heuristic fallback. No component outside the resolver may map a clinical label to a code. A clinical action that constitutes encounter evidence records the encounter it was performed during, rather than being associated with one by proximity in time. Supersedes the smart-chip-binding proposal.

---

## 7. Out of scope

- SNOMED/RxNorm terminology binding beyond the code a record already holds.
- FHIR resource emission — `structured` mode is shaped to map cleanly to it, but mapping is a boundary concern per AGENTS.md rule 8.
- References in documents, messages, or tasks. Prove the model in encounter notes first.
- Clearinghouse/claim submission.
- Extraction proposing *new* problems or medications not already on the chart. A record must exist before it can be referenced; creating one stays a deliberate clinician act in the problem/medication workspaces.
