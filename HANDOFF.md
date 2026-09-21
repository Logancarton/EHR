# Active Handoff

**There is no active handoff. Nothing is in flight.**

UI-7d closed on 2026-09-21, and with it **UI-7**: Prescribing left the Clinical menu for
the right companion, and Clinical — its last child rehomed — left too
([D-092](docs/decisions/D-092.md)). The Level 1 work navigation now holds three direct
destinations and no menu at all. Part of UI-7d is deliberately unproven and D-092 names
which part; read it before treating the prescribing queue as exercised.

**Then [D-093](docs/decisions/D-093.md) repaired a defect UI-7d shipped.** The practice
queue is empty in every checkout, so the companion UI-7d delivered was a rail tool that
did nothing. It now has a patient selector: choosing a patient renders the same
`PatientPrescriptionWork` the chart renders, under an identity header of its own, with a
composer bound to that patient. That half of prescribing needs no vendor — staging and
authorizing work; only transmission is refused — so it is driven end to end by a browser
test rather than described.

Before that, CB-0b attributed every standing browser failure to a named cause and
repaired all but one ([D-091](docs/decisions/D-091.md)).

Whether local and remote `main` agree is not something this file can see. `AGENTS.md`
treats GitHub `main` as authoritative: fetch and confirm before trusting any claim about
the remote, including one made here.

## Continue the roadmap

[`docs/ROADMAP.md`](docs/ROADMAP.md) is the only ordered queue. Read **Owner UI migration
directive** first.

**The next step is UI-8, and it is smaller than the roadmap once assumed.** UI-7d removed
the last expandable group, so Level 1 already holds only Calendar, Intake and Dashboard.
One concrete thing it should do: with no group carrying `items`, `ToolNavigation`'s
popover machinery is now unreachable code, left in place rather than deleted mid-slice.

**Do not re-open UI-7d expecting to finish what it left.** The owner decided on
2026-09-21 that the move should happen without a vendor, and it did. What remains
unexercised — the detail pane, the patient-context gate's controls, retry and the three
evidence forms — needs a non-empty `prescription_transactions`, and the owner has said no
money is going to paid integrations. Do not fake a transport to fill it. There *is* an
honest, vendor-free route, verified by driving the real transmit path and written up under
the migration directive: an enabled configuration for the development placeholder adapter
turns the adapter's own refusal into a genuine `transmission_failed` item. It is not taken
because two things must come first — the product has no surface for enabling an
integration at all, and the queue would then report "Integration ready" for an adapter
that can never transmit, which is a worse honesty failure than the one being solved.

**Other eligible slices.** CB-6 (companion lifecycle, in progress) and CB-7 (certify the
manual encounter loop, not started, baseline now genuinely unblocked). The one defect
CB-0b named and did not fix is also eligible and is described under *Review evidence and
open defects*: the browser suite shares one mutable database across every spec, any spec
may write into the practice every later spec reads, and `synthetic-visit` is still
intermittent under full-suite load because of it.

Read [`AGENTS.md`](AGENTS.md) before starting — the execution contract and the
drift-prevention rules govern how a slice is bounded, verified and reported. Then inspect
the code before trusting any document, including this one.

Seven things a queue entry cannot carry on its own:

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
- **"Named in the record" is not the same as "fine to ship".** D-092 recorded exactly
  which prescribing surfaces could not be exercised and treated that as sufficient. It
  was not: the companion it shipped had nothing a clinician could act on, because the
  only thing in it was the queue that cannot be populated. Naming a gap does not excuse
  handing someone a tool that does nothing — check what the surface *offers*, not only
  what you can prove about it. [D-093](docs/decisions/D-093.md) is the repair.
- **Removing a group removes the last instance of a *kind* of surface.** UI-7d took the
  work navigation's last menu, and eight specs failed — none of them testing Clinical.
  They were testing popover dismissal, keyboard access, layering and the destination
  list, using Clinical as the handy example. Each moved to a surface that still exists
  rather than being deleted or loosened. Before removing the last of something, search
  the suite for what was using it as a stand-in.
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
- **The browser gate is green apart from one recorded intermittent, and a green run is
  evidence about that run.** CB-0b took the full suite to 179/179 on a deleted database,
  UI-7d left it at 185/185, and D-093 left it at 188 passed / 1 failed of 189 — the one
  being `synthetic-visit`, which passes 2/2 alone and is not repaired. `synthetic-visit` is not repaired: it
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
