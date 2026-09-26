# Active Handoff

**There is no active handoff. Nothing is in flight.**

The funding-prototype milestone ([D-107](docs/decisions/D-107.md)) is recorded, and the
roadmap is split: [`docs/ROADMAP.md`](docs/ROADMAP.md) holds unfinished work only;
finished work and its evidence live in
[`docs/ROADMAP_COMPLETED.md`](docs/ROADMAP_COMPLETED.md).

Whether local and remote `main` agree is not something this file can see. GitHub `main`
is authoritative: fetch and confirm before trusting any claim about the remote.

## Continue the roadmap

Start from **Next up** in [`docs/ROADMAP.md`](docs/ROADMAP.md). Read
[`AGENTS.md`](AGENTS.md) first, then inspect the code before trusting any document,
including this one.

Lessons from the UI-7 surface removals — what counts as a proven replacement, and how to
attribute a browser failure — are archived in
[`docs/archive/handoffs/HANDOFF-2026-09-21-post-ui-7d-lessons.md`](docs/archive/handoffs/HANDOFF-2026-09-21-post-ui-7d-lessons.md).
Read it before removing or replacing any surface.

---

Handoff rule: this file exists only to transfer genuinely unfinished work between agents.
When that work is completed, archive the handoff under
[`docs/archive/handoffs/`](docs/archive/handoffs/) and return this file to this minimal
state. Do not duplicate roadmap state, architecture, or durable rationale here.
