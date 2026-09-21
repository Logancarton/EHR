# Active Handoff

**There is no active handoff. Nothing is in flight.**

UI-7a closed on 2026-09-21: Patients and Documents left the Clinical menu for the `+`
launcher, and the navigation regression that had left the practice Documents and Labs
queues unreachable from every surface in the shell is repaired. `npm run check` is green
(425/425) and `npm run build` exits 0. The tree is clean.

Whether local and remote `main` agree is not something this file can see. `AGENTS.md`
treats GitHub `main` as authoritative: fetch and confirm before trusting any claim about
the remote, including one made here.

## Continue the roadmap

[`docs/ROADMAP.md`](docs/ROADMAP.md) is the only ordered queue. Read **Owner UI migration
directive** first; its **Current next step** names what to take and why. It is **UI-7b**,
Tasks — the third of Clinical's five children, taken one at a time by the same
add-verify-then-remove sequence UI-6 used on Practice. The directive suggests a companion
for Tasks; that is a suggestion, not a decision.

Read [`AGENTS.md`](AGENTS.md) before starting — the execution contract and the
drift-prevention rules govern how a slice is bounded, verified and reported. Then inspect
the code before trusting any document, including this one.

Three things a queue entry cannot carry on its own:

- **A destination already offered by the `+` launcher is not a proven replacement.** This
  is UI-7a's lesson and it will recur for Tasks, Labs and Prescribing. Documents was in
  the launcher, looked like a parity proof with nothing to build, and opened nothing at
  all — as did the Clinical menu's Documents and Labs. The cause was a controller command
  that cancelled itself through the legacy event it emitted, live since 2026-09-18 with no
  browser coverage over either queue to catch it. Exercise the replacement in a browser
  before you remove anything, and see [D-088](docs/decisions/D-088.md).
- **A red `npm run check` is yours.** It has been green since CB-0a. Treat a failure as
  your slice's until you have reproduced it in a clean worktree at the SHA you started
  from. Nothing weakens an assertion to clear it.
- **The browser suite still has one open pre-existing defect.** The demo fixtures are
  shifted by a whole number of days, so the practice week keeps its spacing but loses its
  weekday identity and its week boundaries. Specs that name a weekday, or that expect one
  visit where the shift has delivered two into the same displayed week, fail for that
  reason alone. The roadmap's open defect entry has the diagnosis, the design decision the
  repair needs, and the current survey: a full run on a fresh database is **163 passed / 5
  failed of 168**, the same five specs recorded at the baseline before CB-0a. Confirm any
  failure is one of those before continuing, and do not let them absorb a failure of your
  own — `workspace-open-launcher` was re-checked against the baseline during UI-7a for
  exactly that reason, because the slice had touched the launcher. Delete
  `test-results/browser-ehr.db*` before a run that is meant to mean something: the suite
  shares one database across specs and a stale one changes results, which is why
  `workspace-open-launcher` fails in the full run and passes in isolation.

---

Handoff rule: this file exists only to transfer genuinely unfinished work between agents.
When that work is completed, archive the handoff under
[`docs/archive/handoffs/`](docs/archive/handoffs/) and return this file to this minimal
state. Do not duplicate roadmap state, architecture, or durable rationale here.
