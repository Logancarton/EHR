import test from "node:test";
import assert from "node:assert/strict";
import { applyPreset, defaultPreferences } from "../app/lib/preference-engine";
import { DEFAULT_OVERVIEW_CARD_ORDER, resolveOverviewCardOrder } from "../app/domain/overview-layout";

test("overview upgrades legacy defaults while preserving custom and pinned ordering", () => {
  assert.deepEqual(resolveOverviewCardOrder(["snapshot", "medications", "diagnoses", "timeline"]), DEFAULT_OVERVIEW_CARD_ORDER);
  const custom = resolveOverviewCardOrder(["medications", "timeline", "snapshot", "diagnoses"]);
  assert.deepEqual(custom.filter((id) => ["medications", "timeline", "snapshot", "diagnoses"].includes(id)), ["medications", "timeline", "snapshot", "diagnoses"]);
  assert.ok(custom.indexOf("history") < custom.indexOf("timeline"));
  assert.equal(resolveOverviewCardOrder(["snapshot", "medications", "diagnoses", "timeline"], { snapshot: true })[0], "snapshot");
  assert.deepEqual(resolveOverviewCardOrder(DEFAULT_OVERVIEW_CARD_ORDER), DEFAULT_OVERVIEW_CARD_ORDER);
  assert.equal(new Set(resolveOverviewCardOrder(["medications", "medications", "timeline"])).size, 7);
});

import type { ObservationRecord } from "../app/domain/clinical-records";
import { latestLaboratoryObservations } from "../app/domain/overview-labs";

test("latest labs bridge absent codes using exact names and units without merging conflicting codes", () => {
  const observation = (id: string, date: string, code: string | null, name = "Synthetic test", unit = "ng/mL") => ({ id, effective_at: date, category: "laboratory", status: "final", code, coding_system: "LOINC", test_name: name, unit }) as ObservationRecord;
  const rows = [observation("old-code", "2026-09-01", "123"), observation("new-no-code", "2026-09-20", null), observation("conflict", "2026-09-21", "456")];
  assert.deepEqual(latestLaboratoryObservations(rows).map((item) => item.id), ["conflict", "new-no-code", "old-code"]);
  assert.deepEqual(latestLaboratoryObservations(rows.slice(0, 2)).map((item) => item.id), ["new-no-code"]);
  assert.deepEqual(latestLaboratoryObservations([rows[0], rows[2]]).map((item) => item.id), ["conflict", "old-code"]);
  assert.equal(latestLaboratoryObservations([rows[0], observation("different-unit", "2026-09-21", null, "Synthetic test", "mmol/L")]).length, 2);
});


test("returning from Minimal to Standard restores the new clinical summaries", () => {
  const minimal = applyPreset("minimal", defaultPreferences);
  assert.equal(minimal.overview.showHistory, false);
  const standard = applyPreset("standard", minimal);
  assert.equal(standard.overview.showHistory, true);
  assert.equal(standard.overview.showResults, true);
  assert.equal(standard.overview.showMeasures, true);
});
