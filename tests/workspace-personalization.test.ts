import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultPreferences, mergeStoredPreferences } from "../app/lib/preference-engine";

test("stored preferences written before a setting existed keep that setting's default", () => {
  // A row saved by an earlier build: the `today` group has no showRoster and no
  // collapsedWidgets. A plain spread would replace the whole group and switch the
  // patient roster off for every clinician who had ever saved preferences.
  const legacy = {
    version: 1,
    activePresetId: "standard",
    density: "comfortable",
    headerDensity: "full",
    showCompanionRail: true,
    showSidebar: true,
    today: {
      showMorningBriefing: false,
      showMetrics: true,
      showScheduleSearch: true,
      showActionQueue: true,
      showQuickReferences: true,
      widgetOrder: ["briefing", "metrics", "roster", "queue", "shortcuts"],
    },
  } as never;

  const merged = mergeStoredPreferences(legacy);

  assert.equal(
    merged.today.showRoster,
    true,
    "a setting added after the row was written must arrive at its default, not undefined",
  );
  assert.deepEqual(merged.today.collapsedWidgets, {});
  assert.equal(
    merged.today.showMorningBriefing,
    false,
    "the clinician's own stored choices still win over the defaults",
  );
  assert.deepEqual(
    merged.overview,
    defaultPreferences.overview,
    "groups the stored row never mentioned fall back whole",
  );
  assert.equal(
    merged.rails.activeRightPanel,
    defaultPreferences.rails.activeRightPanel,
    "older preferences inherit the default selected companion tool",
  );
  assert.equal(
    merged.rails.rightPanelOpen,
    false,
    "older preferences do not unexpectedly reopen a companion panel",
  );
});

test("a rail saved before Communication, HR and Prescribing existed receives all three, once", () => {
  // UI-5 retired the Level 1 Team menu, so the right-rail Communication companion is
  // the only durable route to team chat, inbox, patient SMS, email, fax and community.
  // D-086 then made HR everyone's own record. UI-7d then retired the Clinical menu,
  // which was the last route to the practice prescribing queue. A layout saved before
  // any of them existed would otherwise never learn they are there — and in
  // Prescribing's case would simply have lost the capability.
  const legacyRail = {
    ...defaultPreferences,
    appliedRailBackfills: undefined,
    rails: { ...defaultPreferences.rails, right: ["calendar", "ai", "scratchpad", "tasks", "calc"] },
  } as never;

  const merged = mergeStoredPreferences(legacyRail);

  assert.deepEqual(
    merged.rails.right,
    ["calendar", "ai", "communication", "hr", "prescribing", "scratchpad", "tasks", "calc"],
    "backfilled tools sit with the companions they belong beside, not appended last",
  );
  assert.deepEqual(
    merged.appliedRailBackfills?.slice().sort(),
    ["communication", "hr", "prescribing"],
    "each applied backfill is recorded so it does not run again",
  );
});

test("each rail backfill is independent of the others", () => {
  // A layout that already took the Communication backfill should still receive the
  // later ones, and taking them must not re-run Communication against a deliberate
  // unpin.
  const afterCommunicationOnly = {
    ...defaultPreferences,
    appliedRailBackfills: ["communication"],
    rails: { ...defaultPreferences.rails, right: ["calendar", "ai", "communication", "scratchpad"] },
  } as never;

  const merged = mergeStoredPreferences(afterCommunicationOnly);

  assert.deepEqual(
    merged.rails.right,
    ["calendar", "ai", "communication", "hr", "prescribing", "scratchpad"],
    "a later backfill lands beside its anchor without disturbing the rest",
  );
});

test("a rail that deliberately unpinned Prescribing keeps that choice", () => {
  // The backfill exists so a saved layout does not lose the only route to the queue.
  // It must not become a rule that re-pins a tool somebody took off on purpose, which
  // is what recording the applied backfill is for.
  const unpinned = {
    ...defaultPreferences,
    appliedRailBackfills: ["communication", "hr", "prescribing"],
    rails: { ...defaultPreferences.rails, right: ["calendar", "ai", "communication", "hr", "scratchpad"] },
  } as never;

  const merged = mergeStoredPreferences(unpinned);

  assert.ok(
    !merged.rails.right.includes("prescribing"),
    "a backfill that has already run does not undo a deliberate unpin",
  );
});

test("a clinician who unpins a backfilled tool keeps that choice", () => {
  // The backfill exists to rescue layouts that never saw the tool. Once it has run,
  // re-adding the tool on every load would silently overrule an explicit unpin.
  const unpinned = {
    ...defaultPreferences,
    appliedRailBackfills: ["communication", "hr"],
    rails: { ...defaultPreferences.rails, right: ["calendar", "ai", "scratchpad", "tasks", "calc"] },
  } as never;

  const merged = mergeStoredPreferences(unpinned);

  assert.equal(
    merged.rails.right.includes("communication"),
    false,
    "an already-applied backfill must not restore a tool the clinician removed",
  );
  assert.equal(
    merged.rails.right.includes("hr"),
    false,
    "the same holds for every backfilled tool, not just the first one",
  );
});

test("malformed or absent stored preferences fall back rather than throwing", () => {
  assert.deepEqual(mergeStoredPreferences(null), defaultPreferences);
  assert.deepEqual(mergeStoredPreferences(undefined), defaultPreferences);
  assert.deepEqual(mergeStoredPreferences("not an object" as never), defaultPreferences);
});

test("dashboard personalization survives a reload through server-persisted preferences", async () => {
  const originalCwd = process.cwd();
  const env = process.env as unknown as Record<string, string | undefined>;
  const originalNodeEnv = env.NODE_ENV;
  const originalSecret = env.EHR_SESSION_SECRET;
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-personalization-"));

  process.chdir(isolatedRoot);
  env.NODE_ENV = "test";
  env.EHR_SESSION_SECRET = "synthetic-personalization-session-secret-0123456789";

  try {
    const [
      { POST: loginPost },
      { GET: preferencesGet, PUT: preferencesPut },
      { PreferenceRepository },
    ] = await Promise.all([
      import("../app/api/auth/login/route"),
      import("../app/api/preferences/route"),
      import("../app/server/repositories/preference-repository"),
    ]);

    const loginResponse = await loginPost(new Request("http://ehr.local/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: "team-taylor" }),
    }));
    assert.equal(loginResponse.status, 200);
    const cookie = loginResponse.headers.get("set-cookie")!.split(";", 1)[0];

    // Hiding a section and collapsing another is the clinician tuning their own
    // workspace. Both were previously React-only and evaporated on reload.
    const tuned = {
      ...defaultPreferences,
      rails: {
        ...defaultPreferences.rails,
        activeRightPanel: "tasks",
        rightPanelOpen: true,
      },
      today: {
        ...defaultPreferences.today,
        showMorningBriefing: false,
        collapsedWidgets: { metrics: true, roster: true },
      },
    };

    const saved = await preferencesPut(new Request("http://ehr.local/api/preferences", {
      method: "PUT",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ preferences: tuned }),
    }));
    assert.equal(saved.status, 200);

    const reloaded = await preferencesGet(new Request("http://ehr.local/api/preferences", {
      headers: { cookie },
    }));
    assert.equal(reloaded.status, 200);
    const body = (await reloaded.json()) as any;

    assert.equal(body.preferences.today.showMorningBriefing, false, "a hidden section stays hidden");
    assert.deepEqual(
      body.preferences.today.collapsedWidgets,
      { metrics: true, roster: true },
      "collapsed sections stay collapsed",
    );
    assert.equal(body.preferences.today.showRoster, true, "untouched sections are unaffected");
    assert.equal(body.preferences.rails.activeRightPanel, "tasks");
    assert.equal(body.preferences.rails.rightPanelOpen, true);

    // Restoring is the same durable path in reverse.
    const restored = {
      ...tuned,
      today: { ...tuned.today, showMorningBriefing: true, collapsedWidgets: {} },
    };
    const restoreResponse = await preferencesPut(new Request("http://ehr.local/api/preferences", {
      method: "PUT",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ preferences: restored }),
    }));
    assert.equal(restoreResponse.status, 200);

    const afterRestore = PreferenceRepository.getPreferences("team-taylor");
    assert.equal(afterRestore.today.showMorningBriefing, true);
    assert.deepEqual(afterRestore.today.collapsedWidgets, {});

    // Workspace restoration state lives in the same record but belongs to its own
    // endpoint. Preferences now save on every hide, collapse and density change, so
    // a display-preferences write must not carry the restored workspace away.
    const { PUT: workspaceStatePut, GET: workspaceStateGet } =
      await import("../app/api/workspace-state/route");

    const stateWrite = await workspaceStatePut(new Request("http://ehr.local/api/workspace-state", {
      method: "PUT",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        state: {
          activeView: "today",
          dockedPatientIds: ["maya-chen", "jordan-reed"],
          detachedPatientIds: [],
          activePatientId: "maya-chen",
        },
      }),
    }));
    assert.equal(stateWrite.status, 200);

    // A preferences write that carries no workspace state at all.
    const displayOnlyWrite = await preferencesPut(new Request("http://ehr.local/api/preferences", {
      method: "PUT",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ preferences: { ...defaultPreferences, density: "compact" } }),
    }));
    assert.equal(displayOnlyWrite.status, 200);

    const stateAfter = await workspaceStateGet(new Request("http://ehr.local/api/workspace-state", {
      headers: { cookie },
    }));
    assert.equal(stateAfter.status, 200);
    const stateBody = (await stateAfter.json()) as any;
    assert.deepEqual(
      stateBody.state?.dockedPatientIds,
      ["maya-chen", "jordan-reed"],
      "a display-preferences write must not wipe the restored workspace",
    );
    assert.equal(stateBody.state?.activeView, "today");
    assert.equal(
      PreferenceRepository.getPreferences("team-taylor").density,
      "compact",
      "the display preference itself still applies",
    );
  } finally {
    process.chdir(originalCwd);
    if (originalNodeEnv === undefined) delete env.NODE_ENV; else env.NODE_ENV = originalNodeEnv;
    if (originalSecret === undefined) delete env.EHR_SESSION_SECRET; else env.EHR_SESSION_SECRET = originalSecret;
  }
});

test("a note section the clinician hid still renders when it already holds text", async () => {
  const { encounterTemplateSectionVisibility } = await import("../app/lib/encounter-section-visibility");

  const allOff = {
    showIntervalHistory: false,
    showTreatmentResponse: false,
    showSideEffects: false,
    showAssessment: false,
    showPlan: false,
  };

  const empty = encounterTemplateSectionVisibility(allOff, {
    intervalHistory: "",
    treatmentResponse: "   ",
    sideEffects: undefined,
    assessment: "",
    plan: "",
  });
  assert.deepEqual(empty, allOff, "an empty section honours the clinician's preference");

  // Hiding a field is a template preference, not a way to remove what was written.
  // Text that will reach the signed note must stay visible while the note is open.
  const written = encounterTemplateSectionVisibility(allOff, {
    intervalHistory: "",
    treatmentResponse: "",
    sideEffects: "",
    assessment: "Generalized anxiety disorder, improving on current dose.",
    plan: "",
  });
  assert.equal(
    written.showAssessment,
    true,
    "a hidden section that already holds text must stay visible rather than conceal signed content",
  );
  assert.equal(written.showPlan, false, "sections with no content stay hidden");

  const allOn = {
    showIntervalHistory: true,
    showTreatmentResponse: true,
    showSideEffects: true,
    showAssessment: true,
    showPlan: true,
  };
  assert.deepEqual(
    encounterTemplateSectionVisibility(allOn, {}),
    allOn,
    "an absent draft never hides a section the clinician wants",
  );
});
