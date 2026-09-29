# Active Handoff — billing-workflow-default-and-diagnosis-gap

**Date:** 2026-09-29 (2026-09-29T22:29:25.957Z)  
**Branch:** `main`  
**Current SHA:** `5c4c8109800957cc76b7b6d9450e7b0a5ceff08e` (`5c4c810`)  
**Working Tree Status:** Modified (21 files in working tree)  

---

## 1. Work Completed in this Session

Promote Billing Workflow queue to default, add inline diagnosis attachment without note mutation, wire handoff script, and verify test suite.

### Recent Git Commits:
```text
5c4c810 feat(intake): bridge pre-chart consent & form continuity across promotion, support inline DOB capture, and notify on promotion
be468ae feat(ai): integrate local zero-key Ollama for Omnibox planning, note scribing, reference extraction, and clinical synthesis
258cfa3 fix(workspace): resolve calendar toolbar clipping at 1280px, AI target context, task wrapping, document credentials, and intake progress sizing
0700db6 fix(workspace): resolve header button crowding, calculator wrapping, privacy masking, lab flowsheet alignment, and message composer layout
3a37728 fix(workspace): adapt encounter header status, order cart attestation styling, and layout polish
```

---

## 2. Modified & Created Files

```text
M app/api/billing/route.ts
 M app/billing-setup.css
 M app/components/workspaces/BillingWorkflowQueue.tsx
 M app/components/workspaces/BillingWorkspace.tsx
 M app/lib/api-client.ts
 M app/server/actions/clinical-action-gateway.ts
 M app/server/actions/patient-action-binding.ts
 M app/server/repositories/audit-repository.ts
 M app/server/repositories/billing-repository.ts
 M app/server/services/billing-service.ts
 M docs/DECISIONS.md
 M docs/ROADMAP.md
 M docs/ROADMAP_COMPLETED.md
 M docs/decisions/D-105.md
 M next-env.d.ts
 M package.json
 M tests/billing-charge-lifecycle.test.ts
 M tests/billing-workflow.test.ts
 M tests/browser/billing-workflow.spec.ts
?? docs/archive/handoffs/HANDOFF-2026-09-29-billing-workflow-default-and-diagnosis-gap.md
?? scripts/handoff.ts
```

### Diff Summary:
```text
app/api/billing/route.ts                           |  43 ++++-
 app/billing-setup.css                              |  93 ++++++++++
 app/components/workspaces/BillingWorkflowQueue.tsx | 196 ++++++++++++++++++++-
 app/components/workspaces/BillingWorkspace.tsx     |  20 ++-
 app/lib/api-client.ts                              |  17 ++
 app/server/actions/clinical-action-gateway.ts      |   5 +
 app/server/actions/patient-action-binding.ts       |   1 +
 app/server/repositories/audit-repository.ts        |   1 +
 app/server/repositories/billing-repository.ts      |  46 +++++
 app/server/services/billing-service.ts             |  60 +++++++
 docs/DECISIONS.md                                  |   2 +-
 docs/ROADMAP.md                                    |   1 -
 docs/ROADMAP_COMPLETED.md                          |   8 +-
 docs/decisions/D-105.md                            |   9 +-
 next-env.d.ts                                      |   4 +-
 package.json                                       |   3 +-
 tests/billing-charge-lifecycle.test.ts             | 167 +++++++++++++++++-
 tests/billing-workflow.test.ts                     |  48 +++++
 tests/browser/billing-workflow.spec.ts             |   6 +-
 19 files changed, 702 insertions(+), 28 deletions(-)
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
