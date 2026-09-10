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
