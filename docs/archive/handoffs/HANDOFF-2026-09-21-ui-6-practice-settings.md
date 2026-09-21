# Historical Handoff — UI-6 / the Practice settings diagnosis

> Historical record — not authoritative for current work. The slice it carried is complete: the diagnosis it records was acted on in UI-6f and UI-6g, Practice is retired, and the reasoning is now durable in [D-087](../../decisions/D-087.md) and the UI-6 section of [the active ROADMAP](../../ROADMAP.md).
>
> The original handoff is preserved below for rationale and regression context. Relative links were relocated for the archive.

# Active Handoff

Written 2026-09-21 at `6981f5224015129034213eeff800426092bf6b85`. Local and remote `main` agree; the tree is clean.

**There is no half-finished code in flight.** UI-6e (HR assignment) is complete, validated and pushed. This file exists to carry one thing the next thread should not have to rediscover: the Practice settings diagnosis, which was asked for by the roadmap and is now done — and which corrected a premise the roadmap had wrong.

Per the handoff rule below, delete or replace this file once that slice lands. The ordered queue, completion evidence and gates live in [`docs/ROADMAP.md`](../../ROADMAP.md) and are deliberately not repeated here.

---

## Read first

1. [`AGENTS.md`](../../../AGENTS.md) — project constitution, including the execution contract and drift-prevention rules.
2. [`docs/ROADMAP.md`](../../ROADMAP.md) — the only ordered queue. Read the **Owner UI migration directive**, the **UI-6** section, and **UI-6e**.
3. [`docs/decisions/D-086.md`](../../decisions/D-086.md) — HR's authority model, if you touch anything HR.

Then **inspect the code before trusting this file.** It describes the tree as of one session.

## Where UI-6 stands

Practice has one child left: **Practice settings**. Billing, Website, Social media and Staff directory are rehomed and gone from the menu.

## The diagnosis, and the correction

The roadmap previously said `settings` renders a surface owning "accounts, roles, sign-in access **and the practice's default layouts** — part preferences, part staff administration", and warned that the preferences / organization-administration / HR overlap needed deciding first.

Verified at `6981f52`, that framing was wrong on the point that mattered:

- `settings` renders [`PracticeStaffWorkspace`](../../../app/components/global/PracticeStaffWorkspace.tsx) (458 lines, rendered only from `GlobalWorkspaceShell.tsx:654`). It is titled **People** and owns exactly one thing — **organization administration**: provisioning a user, clinical role, membership role, membership status, patient-access scope, activation-link issuance, login-lockout clearing, deactivate/reactivate.
- It does **not** own the practice's default layouts. Those already live under profile/preferences — `WorkspaceProfileMenu`, `WorkspaceTopBar` and `PresetManagementModal` consume `app/lib/workspace-templates.ts` against `/api/organization/workspace-templates`. The "part preferences" half rested on a role-*hint string* inside `PracticeStaffWorkspace` describing what an owner can do elsewhere, not a control it hosts.
- There is no HR half either. HR owns personnel material; this owns accounts and access. They share no data, no service and no permission (`manage_organization` vs `manage_hr`).

**So the remaining work is a rehome and a rename, not a decomposition.** The three-way split the roadmap feared does not exist. The corrected diagnosis is recorded in the roadmap's UI-6 section; this is the short version.

Two constraints on whoever takes it:

- Additive-first still governs. Prove the replacement path, then remove `Practice -> Practice settings`, then Practice.
- This surface **issues activation links** — a response that carries a secret. Its new home must not be reachable more loosely than it is today.

## Known open defect, not caused by this work

`tests/intake-workflow.test.ts` fails with an `AppointmentScheduleConflictError`: the shifted seed fixture `apt-tue-1` lands on the test's hardcoded 2026-09-25 10:00 slot. Reproduced identically in a clean worktree at both `2f7592e` and `3fa7500`, with none of the HR changes present. It is the same fixture/date collision class CB-0 diagnosed, it needs its own bounded repair at the fixture boundary, and it is **not** a waiver for a later slice's own failures. Do not weaken the assertion.

Delete `test-results/browser-ehr.db*` before a browser run that is meant to mean something.

---

Handoff rule: this file exists only to transfer genuinely unfinished work between agents. When that work is completed, archive the handoff under [`docs/archive/handoffs/`](./) and return this file to a minimal no-active-handoff state. Do not duplicate roadmap state, architecture, or durable rationale here.
