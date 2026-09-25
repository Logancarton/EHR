import type { DatabaseMigration } from "./types";

/**
 * Three synthetic office blood-pressure readings were seeded as laboratory
 * results, so they sat in the lab queue as "lab orders to acknowledge" and were
 * missing from the vitals flowsheet. The seed now writes them as vital signs
 * under the same ids; this converts the old rows of an existing database in
 * place — same id, same timestamp — into the blood-pressure row `record_vitals`
 * writes. The seed's matching systolic, diastolic and heart-rate rows complete
 * each reading.
 *
 * Only rows still carrying the synthetic fixture source are touched; the values
 * are fixed here because an issued migration must not change if the fixture does.
 */
const READINGS = [
  { id: "lab-mc-2", bp: "116/74" },
  { id: "lab-er-1", bp: "128/82" },
  { id: "lab-mv-1", bp: "120/78" },
] as const;

export const migration: DatabaseMigration = {
  id: "2026-09-25-001-vital-readings-out-of-lab-results",
  description: "Reclassify synthetic blood-pressure readings from laboratory results to vital signs",
  apply(db) {
    const observations = db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'observations'`)
      .get();
    if (!observations) return;
    const hasProvenance = Boolean(
      db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'provenance_events'`).get(),
    );
    const at = new Date().toISOString();

    for (const reading of READINGS) {
      const row = db
        .prepare(`SELECT patient_id FROM observations
                  WHERE id = ? AND category = 'laboratory' AND source_system = 'synthetic-fixture-migration'`)
        .get(reading.id) as { patient_id: string } | undefined;
      if (!row) continue;

      db.prepare(`UPDATE observations
                  SET category = 'vital-signs', code = 'bp', coding_system = 'LOINC',
                      test_name = 'Blood Pressure', value_text = ?, value_num = NULL, unit = 'mmHg',
                      reference_range = NULL, interpretation = NULL,
                      source_ref = ?, updated_at = ?
                  WHERE id = ?`)
        .run(reading.bp, `clinical-protocols/patientVitalHistory/${row.patient_id}/${reading.id}`, at, reading.id);

      if (hasProvenance) {
        db.prepare(`INSERT OR IGNORE INTO provenance_events
          (id, patient_id, entity_type, entity_id, activity, source_type, source_system, source_ref,
           actor_id, actor_name, payload_sha256, metadata_json, created_at)
          VALUES (?, ?, 'observation', ?, 'reclassify', 'migration', 'ehr-local', ?, 'system-migration', 'System migration', NULL, ?, ?)`)
          .run(`prov-reclassify-${reading.id}`, row.patient_id, reading.id,
            "2026-09-25-001-vital-readings-out-of-lab-results",
            JSON.stringify({ from: "laboratory", to: "vital-signs", reason: "blood pressure is a vital sign" }), at);
      }
    }
  },
};
