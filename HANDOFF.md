# Active Handoff

**There is no active handoff. Nothing is in flight.**

CB-0b closed on 2026-09-21: every standing browser failure was attributed to a named
cause and all but one repaired — three stale specs, the demo fixture week's placement,
and a real ordering defect in the `+` launcher ([D-091](docs/decisions/D-091.md)). The
full browser suite is **green at 179/179** for the first time since CB-5a, `npm run check`
is green (430/430) and `npm run build` exits 0. The tree is clean.

Before that, UI-7c closed: Labs left the Clinical menu for the `+` launcher beside the
other practice queue, and Prescribing's owner was decided without being implementable
([D-090](docs/decisions/D-090.md)).

Whether local and remote `main` agree is not something this file can see. `AGENTS.md`
treats GitHub `main` as authoritative: fetch and confirm before trusting any claim about
the remote, including one made here.

## Continue the roadmap

[`docs/ROADMAP.md`](docs/ROADMAP.md) is the only ordered queue. Read **Owner UI migration
directive** first.

**The shell migration's next step, UI-7d, is blocked and should not be re-attempted.**
Prescribing's placement is settled by [D-090](docs/decisions/D-090.md) — the right
companion — but its second entry condition is not presentation work: the queue cannot be
made non-empty without a commercial e-prescribing adapter, because a transmission is
refused before a transaction row is written. The owner stated on 2026-09-21 that no money
is going to paid integrations or to a paid model for the internal EHR AI, so this does not
resolve by waiting. The roadmap's UI-7d entry now records that instruction and the two
honest routes that exist if it ever becomes urgent; both are larger than a presentation
slice and neither is authorised. Do not fake a transport to fill the queue, and do not
spend a session rediscovering the wall.

**So take the next unblocked slice instead.** The roadmap's ordered plan has CB-6
(companion lifecycle, in progress) and CB-7 (certify the manual encounter loop, not
started, baseline now genuinely unblocked). The one defect CB-0b named and did not fix is
also eligible and is described under *Review evidence and open defects*: the browser suite
shares one mutable database across every spec, any spec may write into the practice every
later spec reads, and `synthetic-visit` is still intermittent under full-suite load
because of it.

Read [`AGENTS.md`](AGENTS.md) before starting — the execution contract and the
drift-prevention rules govern how a slice is bounded, verified and reported. Then inspect
the code before trusting any document, including this one.

Five things a queue entry cannot carry on its own:

- **An existing surface is not a proven replacement.** UI-7a's Documents was in the `+`
  launcher and opened nothing at all. UI-7b's Tasks companion was pinned to the rail by
  default and could not filter, remove, reach a linked chart, or expand. Both looked like
  parity proofs with nothing to build. Exercise the replacement in a browser before you
  remove anything, and see [D-088](docs/decisions/D-088.md) and
  [D-089](docs/decisions/D-089.md).
- **And a replacement you cannot exercise is not one either.** UI-7c is the record of
  stopping for that reason: Labs was finished, Prescribing was decided and left in the
  menu, because its queue is empty in every checkout of this repository and a demo on an
  empty queue proves nothing about the half that matters — see
  [D-090](docs/decisions/D-090.md).
- **A recorded defect must not absorb a failure of anyone's, including the ones already
  inside it.** Three of the six standing browser failures were never the fixture week;
  they had been red since the slice that replaced the control each one named, and the
  family they were filed under hid that for four slices. One more looked like flake and
  was a real product defect in the `+` launcher. Attribute each failure on its own
  evidence, with the commit that caused it, before adding it to anything — see
  [D-091](docs/decisions/D-091.md).
- **A red `npm run check` is yours.** It has been green since CB-0a. Treat a failure as
  your slice's until you have reproduced it in a clean worktree at the SHA you started
  from. Nothing weakens an assertion to clear it.
- **The browser gate is green, and a green run is evidence about that run.** CB-0b took
  the full suite to 179/179 on a deleted database. `synthetic-visit` is not repaired: it
  is an intermittent that fails only under full-suite load and has passed in the two runs
  since. Delete `test-results/browser-ehr.db*` before a run that is meant to mean
  something, do not edit source while a run is in flight — the suite's dev server
  recompiles under it — and put `next-env.d.ts` back before committing, because `next dev`
  rewrites it and `repository-hygiene.test.ts` catches that.

---

Handoff rule: this file exists only to transfer genuinely unfinished work between agents.
When that work is completed, archive the handoff under
[`docs/archive/handoffs/`](docs/archive/handoffs/) and return this file to this minimal
state. Do not duplicate roadmap state, architecture, or durable rationale here.
