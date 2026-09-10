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
  } finally {
    process.chdir(originalCwd);
    if (originalNodeEnv === undefined) delete env.NODE_ENV; else env.NODE_ENV = originalNodeEnv;
    if (originalSecret === undefined) delete env.EHR_SESSION_SECRET; else env.EHR_SESSION_SECRET = originalSecret;
  }
});
