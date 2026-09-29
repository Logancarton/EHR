# Active Handoff — session-handoff

**Date:** 2026-09-29 (2026-09-29T23:14:13.059Z)  
**Branch:** `main`  
**Current SHA:** `248e18f51709e4ad13b4b8d7158c8d6ce244db89` (`248e18f`)  
**Working Tree Status:** Modified (24 files in working tree)  

---

## 1. Work Completed in this Session

The session made changes across 24 files in the working tree. See file inventory below.

### Recent Git Commits:
```text
248e18f feat(billing): promote workflow queue to default, add inline diagnosis attachment, and wire handoff generator
5c4c810 feat(intake): bridge pre-chart consent & form continuity across promotion, support inline DOB capture, and notify on promotion
be468ae feat(ai): integrate local zero-key Ollama for Omnibox planning, note scribing, reference extraction, and clinical synthesis
258cfa3 fix(workspace): resolve calendar toolbar clipping at 1280px, AI target context, task wrapping, document credentials, and intake progress sizing
0700db6 fix(workspace): resolve header button crowding, calculator wrapping, privacy masking, lab flowsheet alignment, and message composer layout
```

---

## 2. Modified & Created Files

```text
M app/api/intake/route.ts
 M app/components/AppChrome.tsx
 M app/components/auth/AuthSessionGate.tsx
 M app/components/workspace/WorkspaceTabStrip.tsx
 M app/components/workspaces/IntakeWorkspace.tsx
 M app/components/workspaces/intake/IntakeDetailPanel.tsx
 M app/domain/intake.ts
 M app/layout.tsx
 M app/lib/api-client.ts
 M app/lib/use-patient-tabs.ts
 M app/server/db/intake-foundation.ts
 M app/server/repositories/audit-repository.ts
 M app/server/repositories/intake-repository.ts
 M app/server/services/intake-service.ts
 M docs/DECISIONS.md
 M docs/ROADMAP.md
 M docs/ROADMAP_COMPLETED.md
?? app/api/intake/self-service/
?? app/components/intake/
?? app/intake-self-service.css
?? app/intake/
?? app/lib/self-service-route.ts
?? docs/decisions/D-110.md
?? tests/intake-self-service.test.ts
```

### Diff Summary:
```text
app/api/intake/route.ts                            |  23 ++
 app/components/AppChrome.tsx                       |   7 +-
 app/components/auth/AuthSessionGate.tsx            |  19 +-
 app/components/workspace/WorkspaceTabStrip.tsx     |   4 +-
 app/components/workspaces/IntakeWorkspace.tsx      |   3 +-
 .../workspaces/intake/IntakeDetailPanel.tsx        | 262 +++++++++++-
 app/domain/intake.ts                               | 146 ++++++-
 app/layout.tsx                                     |   1 +
 app/lib/api-client.ts                              |  51 ++-
 app/lib/use-patient-tabs.ts                        |   9 +-
 app/server/db/intake-foundation.ts                 |  25 ++
 app/server/repositories/audit-repository.ts        |   3 +
 app/server/repositories/intake-repository.ts       | 148 +++++++
 app/server/services/intake-service.ts              | 438 ++++++++++++++++++++-
 docs/DECISIONS.md                                  |   3 +
 docs/ROADMAP.md                                    |  12 +-
 docs/ROADMAP_COMPLETED.md                          |  27 ++
 17 files changed, 1150 insertions(+), 31 deletions(-)
```

---

## 3. Validation Evidence & Verification Gates

Run the required repository validation gates before completing:
- `npm run check` (lint + typecheck + Node test suite)
- `npm run build` (Next.js production build verification)
- Affected browser tests via Playwright (`npx playwright test <path>`)

---

## 4. Architectural Boundaries & Safety Invariants

Every agent working in this repository MUST uphold these invariant rules per `AGENTS.md`:
1. **EHR-First Scope Firewall:** Synthetic data only. No PHI, no paid integrations, and no mock tokens that fabricate transport success.
2. **Clinical Immutability:** `signed_encounter_snapshots` are cryptographically sealed (`content_sha256`) and strictly immutable. Corrections or billing metadata attach out-of-band.
3. **Two-Level Workspace Shell:** Calm global topbar above persistent labeled patient/workspace tabs. No permanent left rails.
4. **Authoritative State:** Structured clinical tables remain the source of truth; AI and workflows are derived assistance.

---

## 5. Open Defects & Remaining Scope (from ROADMAP.md)

- **Browser tests share one mutable database.** Any spec can write into the practice every later spec reads; `synthetic-visit` is intermittent under full-suite load. Isolating the database per spec or per file is the next bounded repair. *(Validation history; CB-0b / D-091.)* On 2026-09-26 a full run in the cloud workspace (preinstalled Chromium, icon font unreachable) had 22 failures common to `bc31d56` and CB-6c: `dashboard-preview` ×8, `ui-system` ×5, `patient-administration` ×3, `workspace-module-tabs` ×2, and one each in `capture-ui-tour`, `care-completion`, `tool-navigation` and `workspace-ergonomics`. Most time out at sign-in with the workspace still "restoring". They are not attributed one by one yet.
- **Standing browser failures last recorded 2026-09-25 (BILL-WF-1 run, 200 passed / 8 failed):** `workspace-module-tabs` ×2 (click the top-bar "Intake" removed by UI-8), `ui-system` "Workspace layout" (Preferences copy changed by MON-1), `companion-ai` patient-switch target label, and `tool-navigation` CB-3 (duplicate "Jordan Reed" week-view rows). Seen again 2026-09-27 during CB-6, failing identically on the unchanged baseline: `workspace-layering` "the note region isolates its own chrome" (Review & Sign opens no `.modal-backdrop` for Maya Chen's encounter in the shared database). Also failing identically on `867293f` (2026-09-27): `synthetic-visit` (an expected element is not found) and `capture-ui-tour`. `synthetic-visit` is CB-7's baseline visit path, so CB-7 starts by diagnosing it. Each is attributed as not caused by the slice that observed it; none is repaired. UI-8 was verified per spec, not by a full-suite run.
- **Validation pending:** PAT-OV-1, MON-1, PAT-HDR-1 and PAT-HDR-2 are recorded as "implemented, validation pending" with push CI as the authority. Confirm CI and record the result.
- **Prescribing queue cannot yet be exercised.** Two prerequisite slices, neither authorized yet: (1) a product surface for enabling an integration (`IntegrationConfigurationService` has no API route or UI); (2) the adapter must declare it cannot transmit, and the health projection must surface that, so the queue never shows "Integration ready" for the placeholder. Until then the detail pane, patient-context gate, retry and evidence forms stay unexercised. *(UI-7d / D-092 / D-093.)*
- **Duplicate creates are only stopped in the browser.** CB-6e stops a second press while a task, note or message save is in flight, but two tabs, or a network retry of a request that did succeed, can still create a duplicate. Needs a client-generated idempotency key the create routes honour. Messages matters most, because it reaches a patient. *(Found in CB-6e.)*

---

## 6. Next Steps for Incoming Agent

- **Next Eligible Slice:** Return to CB-7 (clinical certification gate) or UI-9 / AMB-1
- **Incoming Agent Instructions:**
  1. Inspect the code on `main` before assuming prior chat context matches reality.
  2. Confirm branch status against `origin/main`.
  3. Bound the vertical slice to one coherent workflow.
  4. Verify with `npm run check` and `npm run build` before reporting completion.
  5. Archive completed handoffs to `docs/archive/handoffs/` and keep root `HANDOFF.md` ephemeral.
