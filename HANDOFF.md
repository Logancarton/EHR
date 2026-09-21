# Active Handoff

**There is no active handoff. Nothing is in flight.**

UI-6 closed on 2026-09-21: Practice was decomposed child by child and the group is gone.
Local and remote `main` agree and the tree is clean.

## Continue the roadmap

[`docs/ROADMAP.md`](docs/ROADMAP.md) is the only ordered queue. Read **Owner UI migration
directive** first; its **Current next step** names what to take and why.

Read [`AGENTS.md`](AGENTS.md) before starting — the execution contract and the
drift-prevention rules govern how a slice is bounded, verified and reported. Then inspect
the code before trusting any document, including this one.

Two things a queue entry cannot carry on its own:

- **The inner loop is red for a reason that has nothing to do with your slice.**
  `npm run check` fails `tests/intake-workflow.test.ts` whenever the shifted seed fixtures
  collide with its hardcoded date. That is the repair the roadmap now queues first. Until
  it lands, a failing `check` is not automatically yours — but it is also not a waiver:
  confirm the failure is that one before continuing, and never weaken an assertion to clear
  it.
- **Delete `test-results/browser-ehr.db*` before a browser run that is meant to mean
  something.** The suite shares one database across specs and a stale one changes results.

---

Handoff rule: this file exists only to transfer genuinely unfinished work between agents.
When that work is completed, archive the handoff under
[`docs/archive/handoffs/`](docs/archive/handoffs/) and return this file to this minimal
state. Do not duplicate roadmap state, architecture, or durable rationale here.
