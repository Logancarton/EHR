# Handoff — clinical reference layer, RL-A next

**Transient working note.** Delete or replace it once RL-A is done. Durable knowledge lives in `docs/NOTE_REFERENCES.md` (design) and `docs/ROADMAP.md` §20 (sequence). The active delivery queue is §21, which is a different thread of work.

Written 2026-09-13; the tree and validation sections corrected the same day after DB-0.

---

## Read first

1. `AGENTS.md` — project constitution.
2. `docs/NOTE_REFERENCES.md` — the design. Read it fully before touching any of this; several decisions look wrong until you see the reason.
3. `docs/ROADMAP.md` §20 — the reference layer's remaining build order and gates. §21 is the active queue and is currently on DB-1, not here.

Then **inspect the code before trusting this file.** It describes a tree as of one session and the tree may have moved.

---

## State of the tree — corrected 2026-09-13

**Everything this note described as uncommitted is committed.** It all landed in
`8cfda44` ("wip: clinical reference layer and in-flight workspace surfaces"), which
is now three commits back. Local and remote `main` agree. Ignore the file lists and
the "3 commits ahead" statement that used to be here; `git log` is the record.

---

## Validation status — corrected 2026-09-13

RL-0's question was whether this tree is green on a real toolchain, and it is. Run
on the development machine (macOS arm64, Node 24.14.0) with pinned platform-native
dependencies and Playwright 1.62.1 against its own matching chromium-1234 — no
shim, no strip-types hook:

| Check | Result on `986a37d` |
|---|---|
| `npm run typecheck` | pass |
| `npm test` | pass 173/173 |
| `npm run build` | pass |
| `npm run test:browser` | pass 23/23, twice |

The two container false failures this note predicted (`signed-encounter-integrity`,
`scroll-experience`) do pass under a real `tsx`. The call was right.

**The "noisy family" was one real defect, not measurement noise.** This note read
the churning floating-window/gesture/viewport failures as an environment that could
not measure them. It was not: the workspace restore was announcing completion from a
disposed React instance while a second copy was still clicking tabs, so specs acted
on a half-restored workspace and watched it move underneath them. Fixed at DB-0
(`98a6a49`) along with two restore defects it was hiding. See ROADMAP §21's DB-0
record. Nothing here needs a "fails twice before it counts" rule any more.

The browser suite now runs beside a developer's own dev server: it builds into its
own directory and disables the dev-tools overlay. See `next.config.ts`.

---

## Database state

Migrations through `2026-09-13-005` are applied. `2026-09-14-001`
(`encounters.appointment_id`, added at DB-0) applies on next server start.

`2026-09-13-002` stripped prototype `@[...]` markup from draft notes and has already
run: zero chipped drafts remain. Signed notes with markup are deliberately untouched
(hashed by `chart-integrity.ts`); they get a `prototype-markup-detected` provenance
row instead. There were none.

---

## Start here

### RL-0 — validate — **done**

Complete on the development machine on the matching chromium; see the table above
and ROADMAP §21's DB-0 record. RL-0 shares that evidence. Sign-time reference
completeness is a separate question and is still RL-A.

### RL-A — sign-time conversion and freeze

The last unbuilt phase, and the only thing standing between what exists and anything
that touches a claim. Today extraction proposals appear in the coding dock and count
toward nothing.

Design: `docs/NOTE_REFERENCES.md` §2.9 and phase 4. Exit gate: change a medication
dose after signing — the signed note's text is unchanged, the live chart reflects the
change, the claim carries clinician-attested codes traceable to named records.

Useful existing pieces: `NoteReferenceRepository.confirm/reject` already exist and are
tested. `snapshotSignedEncounter` in `app/server/db/chart-integrity.ts` is where
resolved renderings must be persisted. `EncounterSignModal` already has `diagnoses`
and `billing` steps that currently list `patient.diagnoses` strings.

**RL-B can run in parallel** and is arguably higher value: no problem record in the
database carries an ICD-10 code, so the claim path currently terminates in nothing
regardless of how well referencing works. That is P3-A work.

**Note on sequencing:** the active queue is ROADMAP §21 (DB-1 next), not this file.
RL-A/RL-B are the reference layer's own backlog and are sequenced in §20.

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

10. **`encounters.appointment_id` is the same shape, for the same reason** (added at DB-0, D-049). Which visit a note belongs to is recorded by the workflow that started it or not at all; an unlinked encounter completes no appointment. Two places used to guess — one matched on patient id, one took "the first appointment still open" — and both closed the wrong visit for a patient with two in a day.

---

## Deliberately not built

No LLM provider is wired into this repository at all. `DeterministicNoteReferenceExtractor` (`model: "deterministic-v1"`) sits behind the `NoteReferenceExtractor` interface in the seat a hosted model will take, mirroring the `OmniboxPlanningModel` pattern. Swapping it is RL-F and is a swap, not a new subsystem.

Resist starting there. It is the interesting problem and the one that changes least: a better extractor produces more proposals that nobody can yet confirm.
