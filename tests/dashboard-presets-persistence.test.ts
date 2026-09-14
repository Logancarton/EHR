import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type ProviderPreferences,
  applyPreset,
  builtInPresets,
  createNamedPreset,
  defaultPreferences,
  deleteNamedPreset,
  duplicateNamedPreset,
  isPresetModified,
  mergeStoredPreferences,
  renameNamedPreset,
  revertToActivePreset,
  updateNamedPreset,
  adoptPracticeTemplate,
} from "../app/lib/preference-engine";
import {
  type DashboardLayoutState,
  adaptLayoutToViewport,
  createDefaultDashboardLayout,
} from "../app/lib/dashboard-layout-model";

test("named preset independence: working layout changes never silently mutate saved preset", () => {
  let prefs = applyPreset("cockpit", defaultPreferences);
  assert.equal(prefs.activePresetId, "cockpit");
  assert.equal(isPresetModified(prefs), false, "freshly applied preset is not modified");

  // Clinician modifies working layout (e.g. hides briefing)
  prefs = {
    ...prefs,
    today: {
      ...prefs.today,
      showMorningBriefing: false,
    },
  };
  assert.equal(isPresetModified(prefs), true, "modifying working layout sets isPresetModified");

  // The builtIn or saved preset definition is completely untouched
  assert.equal(
    builtInPresets.cockpit.config.today?.showMorningBriefing,
    true,
    "preset definition remains intact",
  );

  // Reverting restores exact preset settings
  const reverted = revertToActivePreset(prefs);
  assert.equal(reverted.today.showMorningBriefing, true);
  assert.equal(isPresetModified(reverted), false, "reverted layout is marked unmodified");
});

test("custom named presets: lifecycle supports create, explicit update, duplicate, rename, delete", () => {
  let prefs = defaultPreferences;

  // 1. Create personal preset from current layout
  prefs = createNamedPreset("Morning Flow", prefs, "My morning routine");
  const createdId = prefs.activePresetId;
  assert.ok(createdId.startsWith("preset-morning-flow-"));
  assert.ok(prefs.namedPresets[createdId]);
  assert.equal(prefs.namedPresets[createdId].name, "Morning Flow");
  assert.equal(isPresetModified(prefs), false);

  // 2. Modify working layout
  prefs = {
    ...prefs,
    density: "compact",
  };
  assert.equal(isPresetModified(prefs), true);

  // 3. Explicit update overwrites the named preset
  prefs = updateNamedPreset(createdId, prefs);
  assert.equal(prefs.namedPresets[createdId].layout.density, "compact");
  assert.equal(isPresetModified(prefs), false, "after explicit update, working layout matches saved");

  // Updating a built-in preset is blocked
  assert.throws(
    () => updateNamedPreset("standard", prefs),
    /Cannot overwrite built-in preset/,
  );

  // 4. Duplicate preset
  prefs = duplicateNamedPreset(createdId, "Morning Flow Copy", prefs);
  const dupId = prefs.activePresetId;
  assert.ok(prefs.namedPresets[dupId]);
  assert.equal(prefs.namedPresets[dupId].name, "Morning Flow Copy");
  assert.equal(prefs.namedPresets[dupId].layout.density, "compact");

  // 5. Rename preset
  prefs = renameNamedPreset(dupId, "Afternoon Flow", prefs);
  assert.equal(prefs.namedPresets[dupId].name, "Afternoon Flow");

  // Renaming built-in is blocked
  assert.throws(
    () => renameNamedPreset("standard", "Standard Altered", prefs),
    /Cannot rename built-in preset/,
  );

  // 6. Delete preset falls back to standard
  prefs = deleteNamedPreset(dupId, prefs);
  assert.equal(prefs.namedPresets[dupId], undefined);
  assert.equal(prefs.activePresetId, "standard");

  // Deleting built-in is blocked
  assert.throws(
    () => deleteNamedPreset("standard", prefs),
    /Cannot delete built-in preset/,
  );
});

test("copy-on-adopt: adopting a practice template creates an isolated personal preset", () => {
  const practiceTemplate = {
    id: "org-template-psych",
    name: "Psychiatry Intake Template",
    description: "Standard practice layout for intakes",
    config: {
      density: "comfortable" as const,
      headerDensity: "compact" as const,
      today: {
        ...defaultPreferences.today,
        showActionQueue: true,
        showMorningBriefing: false,
      },
    },
  };

  let prefs = defaultPreferences;
  prefs = adoptPracticeTemplate(practiceTemplate, prefs);

  const adoptedId = prefs.activePresetId;
  assert.ok(adoptedId.startsWith("adopted-org-template-psych-"));
  assert.ok(prefs.namedPresets[adoptedId]);
  assert.equal(prefs.namedPresets[adoptedId].isPracticeTemplate, true);
  assert.equal(prefs.today.showMorningBriefing, false);

  // Modifying or deleting the practice template later does NOT alter the clinician's adopted copy
  practiceTemplate.config.today.showMorningBriefing = true;
  assert.equal(
    prefs.namedPresets[adoptedId].layout.today.showMorningBriefing,
    false,
    "adopted personal layout is completely isolated from later practice template edits",
  );
});

test("responsive viewport adaptation: collapses multi-column half spans to full on narrow viewports", () => {
  const layout: DashboardLayoutState = {
    version: 1,
    columns: 2,
    modules: [
      { id: "schedule", visible: true, collapsed: false, span: "full" },
      { id: "queue", visible: true, collapsed: false, span: "half" },
      { id: "team", visible: true, collapsed: false, span: "half" },
    ],
  };

  // Wide desktop viewport (>= 768px): spans are preserved
  const desktop = adaptLayoutToViewport(layout, 1024);
  assert.equal(desktop.columns, 2);
  assert.equal(desktop.modules.find((m) => m.id === "queue")?.span, "half");

  // Mobile / narrow viewport (< 768px): columns collapse to 1 and all modules become full span
  const mobile = adaptLayoutToViewport(layout, 600);
  assert.equal(mobile.columns, 1);
  assert.equal(mobile.modules.find((m) => m.id === "queue")?.span, "full");
  assert.equal(mobile.modules.find((m) => m.id === "team")?.span, "full");
});

test("optimistic concurrency: preference revisions increment and detect conflicts on mismatch", async () => {
  const originalCwd = process.cwd();
  const env = process.env as unknown as Record<string, string | undefined>;
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-presets-concurrency-"));

  process.chdir(isolatedRoot);
  env.NODE_ENV = "test";
  env.EHR_SESSION_SECRET = "synthetic-concurrency-session-secret-0123456789";

  try {
    const [
      { POST: loginPost },
      { GET: preferencesGet, PUT: preferencesPut },
      { PreferenceRepository, PreferenceConcurrencyError },
    ] = await Promise.all([
      import("../app/api/auth/login/route"),
      import("../app/api/preferences/route"),
      import("../app/server/repositories/preference-repository"),
    ]);

    const loginResponse = await loginPost(
      new Request("http://ehr.local/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: "team-taylor" }),
      }),
    );
    assert.equal(loginResponse.status, 200);
    const cookie = loginResponse.headers.get("set-cookie")!.split(";", 1)[0];

    // Initial fetch: revision 1
    const initialGet = await preferencesGet(
      new Request("http://ehr.local/api/preferences", {
        headers: { cookie },
      }),
    );
    const initialData = (await initialGet.json()) as any;
    assert.equal(initialData.preferences.revision, 1);

    // First save: expectedRevision = 1 -> succeeds, server becomes revision 2
    const firstSave = await preferencesPut(
      new Request("http://ehr.local/api/preferences", {
        method: "PUT",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          preferences: { ...initialData.preferences, density: "compact" },
          expectedRevision: 1,
        }),
      }),
    );
    assert.equal(firstSave.status, 200);
    const firstSaveData = (await firstSave.json()) as any;
    assert.equal(firstSaveData.preferences.revision, 2);

    // Stale concurrent session save: expectedRevision = 1 (mismatches server revision 2) -> 409 Conflict
    const conflictingSave = await preferencesPut(
      new Request("http://ehr.local/api/preferences", {
        method: "PUT",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          preferences: { ...initialData.preferences, density: "comfortable" },
          expectedRevision: 1,
        }),
      }),
    );
    assert.equal(conflictingSave.status, 409, "mismatched expectedRevision returns HTTP 409 Conflict");
    const conflictData = (await conflictingSave.json()) as any;
    assert.equal(conflictData.conflict, true);
    assert.equal(conflictData.serverRevision, 2);
    assert.equal(conflictData.serverPreferences.density, "compact");

    // Resolving conflict by saving with current serverRevision 2 -> succeeds, increments to revision 3
    const resolvedSave = await preferencesPut(
      new Request("http://ehr.local/api/preferences", {
        method: "PUT",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          preferences: { ...initialData.preferences, density: "comfortable" },
          expectedRevision: 2,
        }),
      }),
    );
    assert.equal(resolvedSave.status, 200);
    const resolvedData = (await resolvedSave.json()) as any;
    assert.equal(resolvedData.preferences.revision, 3);
  } finally {
    process.chdir(originalCwd);
  }
});
