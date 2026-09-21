# Active Handoff

**There is no active handoff. Nothing is in flight.**

CB-0a closed on 2026-09-21: the unit suite no longer shares a schedule with the demo
clinic day, so `npm run check` is green (425/425) on any calendar day rather than on the
days the shifted fixtures happen to miss. The tree is clean.

CB-0a is pushed, so local and remote `main` agreed at the moment this was written.
`AGENTS.md` still treats GitHub `main` as authoritative and this file cannot see it:
fetch and confirm before trusting the sentence above.

## Continue the roadmap

[`docs/ROADMAP.md`](docs/ROADMAP.md) is the only ordered queue. Read **Owner UI migration
directive** first; its **Current next step** names what to take and why. It is **UI-7**,
decomposing Clinical one child at a time — the same add-verify-then-remove sequence UI-6
used on Practice, and the migration invariant that no working top-bar destination is
removed before its replacement is proven still governs.

Read [`AGENTS.md`](AGENTS.md) before starting — the execution contract and the
drift-prevention rules govern how a slice is bounded, verified and reported. Then inspect
the code before trusting any document, including this one.

Two things a queue entry cannot carry on its own:

- **A red `npm run check` is now yours.** It has been green since CB-0a, so treat a
  failure as your slice's until you have reproduced it in a clean worktree at the SHA you
  started from. Nothing weakens an assertion to clear it.
- **The browser suite is a different story, and still has one open pre-existing defect.**
  The demo fixtures are shifted by a whole number of days, so the practice week keeps its
  spacing but loses its weekday identity and its week boundaries. Specs that name a
  weekday, or that expect one visit where the shift has delivered two into the same
  displayed week, fail for that reason alone — `tool-navigation`'s CB-3 case fails today
  on a Playwright strict-mode violation over two Jordan Reed events. The roadmap's open
  defect entry has the full diagnosis, the design decision the repair needs, and the
  current survey: a full run on a fresh database is **155 passed / 5 failed / 1 flaky of
  161**, and all five failures reproduce identically at the SHA before CB-0a. Confirm any
  failure is one of those before continuing, and do not let them absorb a failure of your
  own. Delete `test-results/browser-ehr.db*` before a run that is meant to mean
  something: the suite shares one database across specs and a stale one changes results —
  `workspace-open-launcher` fails only in the full run and passes in isolation for
  exactly that reason.

---

Handoff rule: this file exists only to transfer genuinely unfinished work between agents.
When that work is completed, archive the handoff under
[`docs/archive/handoffs/`](docs/archive/handoffs/) and return this file to this minimal
state. Do not duplicate roadmap state, architecture, or durable rationale here.
