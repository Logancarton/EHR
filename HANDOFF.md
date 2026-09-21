# Active Handoff

**There is no active handoff. Nothing is in flight.**

UI-7b closed on 2026-09-21: Tasks left the Clinical menu for the right companion, whose
expanded canvas now renders the practice task queue itself rather than linking to it
([D-089](docs/decisions/D-089.md)). `npm run check` is green (429/429) and `npm run build`
exits 0. The tree is clean.

Whether local and remote `main` agree is not something this file can see. `AGENTS.md`
treats GitHub `main` as authoritative: fetch and confirm before trusting any claim about
the remote, including one made here.

## Continue the roadmap

[`docs/ROADMAP.md`](docs/ROADMAP.md) is the only ordered queue. Read **Owner UI migration
directive** first; its **Current next step** names what to take and why. It is **UI-7c**,
Labs and Prescribing — the last two of Clinical's five children, taken one at a time by
the same add-verify-then-remove sequence UI-6 used on Practice. The directive settles
neither placement; decide each from where the work is actually done.

Read [`AGENTS.md`](AGENTS.md) before starting — the execution contract and the
drift-prevention rules govern how a slice is bounded, verified and reported. Then inspect
the code before trusting any document, including this one.

Three things a queue entry cannot carry on its own:

- **An existing surface is not a proven replacement.** UI-7a's Documents was in the `+`
  launcher and opened nothing at all. UI-7b's Tasks companion was pinned to the rail by
  default and could not filter, remove, reach a linked chart, or expand. Both looked like
  parity proofs with nothing to build. Exercise the replacement in a browser before you
  remove anything, and see [D-088](docs/decisions/D-088.md) and
  [D-089](docs/decisions/D-089.md).
- **A red `npm run check` is yours.** It has been green since CB-0a. Treat a failure as
  your slice's until you have reproduced it in a clean worktree at the SHA you started
  from. Nothing weakens an assertion to clear it.
- **The browser suite still has one open pre-existing defect.** The demo fixtures are
  shifted by a whole number of days, so the practice week keeps its spacing but loses its
  weekday identity and its week boundaries. Specs that name a weekday, or that expect one
  visit where the shift has delivered two into the same displayed week, fail for that
  reason alone. The roadmap's open defect entry has the diagnosis, the design decision the
  repair needs, and the current survey. Confirm any failure is one of those before
  continuing, and do not let them absorb a failure of your own. Delete
  `test-results/browser-ehr.db*` before a run that is meant to mean something, and do not
  edit source while a run is in flight — the suite's dev server recompiles under it.

---

Handoff rule: this file exists only to transfer genuinely unfinished work between agents.
When that work is completed, archive the handoff under
[`docs/archive/handoffs/`](docs/archive/handoffs/) and return this file to this minimal
state. Do not duplicate roadmap state, architecture, or durable rationale here.
