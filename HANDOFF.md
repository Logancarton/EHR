# Handoff — clinical reference layer, ready for RL-0

**Transient working note.** Delete or replace it once RL-0 and RL-A are done. Durable knowledge lives in `docs/NOTE_REFERENCES.md` (design) and `docs/ROADMAP.md` §20 (sequence).

Written 2026-09-13.

---

## Read first

1. `AGENTS.md` — project constitution.
2. `docs/NOTE_REFERENCES.md` — the design. Read it fully before touching any of this; several decisions look wrong until you see the reason.
3. `docs/ROADMAP.md` §20 — the remaining build order and gates. §21 "Next 0" points here.

Then **inspect the code before trusting this file.** It describes a tree as of one session and the tree may have moved.

---

## State of the tree — nothing is committed

Every change from that session is **uncommitted working-tree state**. `git log` shows none of it.

Also: local `main` is **3 commits ahead of `origin/main`**. AGENTS.md treats GitHub `main` as authoritative, so that is already drifted independently of this work.

**Modified:**

```
app/api/orders/route.ts
app/components/encounter/EncounterCodingDock.tsx
app/components/encounter/EncounterSignModal.tsx
app/components/encounter/EncounterWorkspace.tsx
app/encounter-note.css
app/lib/api-client.ts
app/lib/encounter-close-api.ts
app/lib/encounter-engine.ts
app/server/actions/clinical-action-gateway.ts
app/server/db/migrations.ts
app/server/repositories/order-repository.ts
app/server/repositories/ports.ts
app/server/services/clinical-service.ts
app/server/services/medication-prescription-service.ts
app/server/services/order-control-service.ts
docs/ROADMAP.md
```

**New:**

```
app/api/encounters/[id]/references/route.ts
app/domain/note-reference-extraction.ts
app/server/ai/note-reference-extractor.ts
app/server/repositories/note-reference-repository.ts
app/server/services/action-derived-reference-service.ts
app/server/services/note-extraction-service.ts
docs/NOTE_REFERENCES.md
tests/action-derived-references.test.ts
tests/encounter-coding-wiring.test.ts
tests/note-extraction.test.ts
tests/note-reference-foundation.test.ts
tests/structured-coding-engine.test.ts
```

**Deleted** (an abandoned smart-chip prototype, never committed, so it shows in no diff): `app/domain/smart-canvas.ts`, `app/components/encounter/SmartProseEditor.tsx`, `SmartCanvasMenu.tsx`, `SmartChipHoverCard.tsx`. `EncounterNoteDocument.tsx` and `encounter-note.css` were reverted to HEAD to remove it; the CSS was later re-extended with coding-dock evidence styles only.

**Ask Logan whether to commit before or after RL-0.** Do not push without asking.

---

## Validation status — read this precisely

| Check | Status |
|---|---|
| `npx tsc --noEmit` | **Clean** — on the dev machine and in the container |
| `npm test` | **151/151 pass** — container only, see below |
| `npm run build` | **Clean** — container only, exit 0, all routes compiled |
| Playwright (`npm run test:browser`) | **Inconclusive** — see below |

Most of that gap is now closed. Playwright is the part that is not, so RL-0 still blocks the section.

### The 2026-09-13 container run

A follow-up session ran the suite in a linux cloud container against a copy of this working tree with a fresh `npm ci` from the committed lockfile. That is **not** the retired shim: it is a clean platform-native install of the pinned versions, on Node 22.22.2 rather than the dev machine's 22.23.2. Results transfer for anything platform-independent and should still be reproduced on the dev machine before RL-A.

- `npm test`: 151 tests, 151 pass, 0 fail, ~37s.
- **The two predicted false failures are confirmed environmental.** `signed-encounter-integrity` and `scroll-experience` both pass under a real `tsx`. Neither is a regression; the handoff's call was right.
- `npm run build`: exit 0. `/api/encounters/[id]/references` compiles and appears in the route manifest.

### Playwright is not yet trustworthy anywhere

The container ships chromium build 1194; Playwright 1.62.1 wants 1234. Pointed at the installed binary, **18-20 of 23 pass** — but the failing set is *not stable*, and that instability is the finding:

- Three full runs of this working tree produced three different failure sets.
- A clean `git archive HEAD` tree produced a five-failure set that matched none of them.
- Every failure sits in a gesture, pointer, viewport, or floating-window spec.

`synthetic-visit` deserves a specific note because it is the one browser spec that walks the reference layer, and it looks alarming when it fails: the Encounter tab resolves, is clicked, and stays `class=""` / `aria-selected="false"`. **It is cold-start timing, not a regression.** It failed twice on first-run-of-a-cold-dev-server, then passed 3/3 in isolation and passed on clean `HEAD`. The spec's own comment at `ensureDockedPatient` already warns about this. Do not go hunting for a tab-activation bug on that evidence alone.

**So Playwright still has to run on the dev machine, with the matching chromium**, before anyone calls the tree green. A browser failure is only a finding if it reproduces.

#### The noisy family — do not chase these without a reproduction

A controlled A/B (same container, same browser, same OS; only the code differs) between this working tree and a clean `git archive HEAD` could not separate them. Run to run, the hard-failure sets churn and even swap arms: `resizes from all eight directions` was a hard failure on HEAD and merely flaky on the working tree; `edge snap` and `late clinical response` did the reverse. Repeated runs of the two gesture specs on the working tree gave pass rates between 0/3 and 3/3 for the same tests.

Every unstable test across every run belongs to one family — floating windows, pointer gestures, and viewport:

- `window-lifecycle`: eight-direction resize, window-control focus order, edge snap, late clinical response
- `workspace-reliability`: detach/dock/reload binding, smaller-viewport keyboard access
- `patient-administration`: identity edits persist

**No reference-layer test failed in any run.** The extraction, coding-dock, and action-derived specs were green throughout, as were all 151 node tests.

The honest reading: this environment cannot measure the floating-window family, so it also cannot clear it. On the dev machine, run the browser suite at least twice and treat only a test that fails both times as real.

### Why the runner was non-standard

The session ran from a Linux VM with the repo mounted from macOS, so `node_modules` held darwin binaries and `tsx` could not load esbuild. Note the exact failure shape: `npx tsx --version` **succeeds** and prints a version — the binary launches, and only the transform fails, with a `TransformError` at module load, on every file. A probe that checks only whether `tsx` runs will report a healthy environment that is not healthy. Tests were run with Node's native type stripping plus a small extensionless-import resolver hook kept **outside the repository**. That hook no longer exists and should not be recreated.

**On the development machine just run `npm test`.** If you are not on that machine, do not try to reproduce the shim — report that you cannot validate.

Two known false failures under that shim, both environmental, neither a regression: `signed-encounter-integrity` (Node strip-types rejects TS parameter properties) and `scroll-experience` (imports CSS). They should pass under `tsx`. **Confirm that during RL-0** — if either fails for a real reason, that is a genuine finding.

---

## Database state

Migrations `2026-09-13-001/002/003` are **already applied to `data/ehr.db`** — the dev server picked them up during the session. `004` (`encounter_section_extractions`) is **not yet applied**; it applies on next server start.

`002` stripped prototype `@[...]` markup from draft notes. **It has already run: zero chipped drafts remain.** Signed notes with markup are deliberately untouched (hashed by `chart-integrity.ts`); they get a `prototype-markup-detected` provenance row instead. There were none.

---

## Start here

### RL-0 — validate (blocking)

`npm run typecheck && npm test && npm run build` — all three are green in the container, so on the dev machine this is a confirmation pass, and any divergence is itself the finding. **The real remaining work is Playwright**, which has never run anywhere on a browser build that matches. Run it more than once: a failure that does not reproduce is not a finding. Fix what breaks or report it explicitly. Do not start RL-A on a red tree.

### RL-A — sign-time conversion and freeze

The last unbuilt phase, and the only thing standing between what exists and anything that touches a claim. Today extraction proposals appear in the coding dock and count toward nothing.

Design: `docs/NOTE_REFERENCES.md` §2.9 and phase 4. Exit gate: change a medication dose after signing — the signed note's text is unchanged, the live chart reflects the change, the claim carries clinician-attested codes traceable to named records.

Useful existing pieces: `NoteReferenceRepository.confirm/reject` already exist and are tested. `snapshotSignedEncounter` in `app/server/db/chart-integrity.ts` is where resolved renderings must be persisted. `EncounterSignModal` already has `diagnoses` and `billing` steps that currently list `patient.diagnoses` strings.

**RL-B can run in parallel** and is arguably higher value: no problem record in the database carries an ICD-10 code (0 of 12), so the claim path currently terminates in nothing regardless of how well referencing works. That is P3-A work.

---

## Traps — things that look like bugs and are not

Each of these was a deliberate decision. Changing one without reading the reasoning will reintroduce a defect that has a test guarding it.

1. **The prose fallback is gated, not OR'd.** In `calculateEncounterCoding`, heuristics run only when `references.length === 0`. Making it `structured || inferred` restores every false positive the layer removes — "her mother takes lithium 300 mg" satisfying the Moderate-risk pillar of a 99214. Under-capture is the intended failure and it is visible.

2. **Action-derived references are created `confirmed`, not `proposed`.** Only extraction proposes. Staging an order is the clinician's own act; signing decides what reaches the claim, not whether the act happened.

3. **`isHumanDecided` returns `false` for `action-derived`.** Deliberate. Derivation owns its own rows so a withdrawn order withdraws its reference. Remove this and stale references outlive their orders.

4. **`replaceSection` takes a source scope.** Each pass retires only its own rows. Without it, an extraction pass over Plan deletes the action-derived references in it. This was an actual bug found in phase 2a.

5. **`GET /api/encounters/[id]/references` writes.** It recomputes the action-derived view before returning. Justified in §2.7/phase-4 notes: these rows are a view over authoritative records, like `encounters_fts` over note content. Nothing clinical is created. It is what makes the view self-healing.

6. **Never map a clinical label to a code.** The abandoned prototype did (`d.includes("ADHD") ? "F90.2" : ... : "F33.1"`), silently coding unmatched diagnoses as recurrent MDD. A test in `note-reference-foundation.test.ts` fails if that shape returns.

7. **Never put `@[` markup in note text.** A test asserts no application source contains it, excluding `migrations.ts`, whose job is removing it.

8. **2-of-3 E/M scoring is correct.** One referenced problem plus a referenced medication change is a **99213**, not a 99214 — the second category is not at moderate. A test asserting 99214 there is a wrong test; that mistake was already made once.

9. **`orders.encounter_id` is nullable and unbackfilled on purpose.** Inferring an encounter from timestamp proximity manufactures the association the column exists to make trustworthy. `prescription-refill-service` and `prescription-change-request-service` deliberately do not set it — see RL-C, which asks for that to become a recorded decision.

---

## Deliberately not built

No LLM provider is wired into this repository at all. `DeterministicNoteReferenceExtractor` (`model: "deterministic-v1"`) sits behind the `NoteReferenceExtractor` interface in the seat a hosted model will take, mirroring the `OmniboxPlanningModel` pattern. Swapping it is RL-F and is a swap, not a new subsystem.

Resist starting there. It is the interesting problem and the one that changes least: a better extractor produces more proposals that nobody can yet confirm.
