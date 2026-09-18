import { createHash, randomUUID } from "node:crypto";
import { getDatabase } from "../db/connection";
import {
  calculateBmi,
  bmiCategory,
  evaluateVitalFlags,
  ASSESSMENT_INSTRUMENTS,
  type VitalMeasurementInput,
  type VitalSignSummary,
  type PsychiatricHistoryCategory,
  type PsychiatricHistoryItem,
  type PsychiatricHistoryInput,
  type PsychiatricHistoryPatch,
  type AssessmentInstrumentType,
  type AssessmentRecord,
  type AssessmentInput,
} from "../../domain/clinical-measurements";
import type { RecordActor, RecordSource } from "./clinical-record-repository";

function now() {
  return new Date().toISOString();
}

function id(prefix: string) {
  return `${prefix}-${randomUUID()}`;
}

function sha(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function stamp(
  entityType: string,
  entityId: string,
  patientId: string,
  operation: string,
  snapshot: unknown,
  actor: RecordActor,
  source: RecordSource = {},
) {
  const db = getDatabase();
  const existing = db
    .prepare(
      `SELECT COALESCE(MAX(version_number), 0) AS n FROM record_versions WHERE entity_type = ? AND entity_id = ?`,
    )
    .get(entityType, entityId) as { n: number };
  const versionNumber = Number(existing?.n || 0) + 1;
  const at = now();

  db.prepare(
    `INSERT INTO record_versions
    (id, patient_id, entity_type, entity_id, version_number, operation, snapshot_json,
     actor_id, actor_name, source_type, source_ref, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id("ver"),
    patientId,
    entityType,
    entityId,
    versionNumber,
    operation,
    JSON.stringify(snapshot),
    actor.userId,
    actor.displayName,
    source.type || "clinician",
    source.ref || null,
    at,
  );

  db.prepare(
    `INSERT INTO provenance_events
    (id, patient_id, entity_type, entity_id, activity, source_type, source_system, source_ref,
     actor_id, actor_name, payload_sha256, metadata_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?)`,
  ).run(
    id("prov"),
    patientId,
    entityType,
    entityId,
    operation,
    source.type || "clinician",
    source.system || "ehr-local",
    source.ref || null,
    actor.userId,
    actor.displayName,
    sha(snapshot),
    at,
  );
}

// ---------------------------------------------------------------------------
// MeasurementRepository
// ---------------------------------------------------------------------------

export const MeasurementRepository = {
  // -------------------------------------------------------------------------
  // P3-D: Longitudinal Vitals
  // -------------------------------------------------------------------------

  listVitals(patientId: string, limit = 50): VitalSignSummary[] {
    const db = getDatabase();
    const rows = db
      .prepare(
        `SELECT code, value_text, value_num, unit, effective_at, observed_by
         FROM observations
         WHERE patient_id = ? AND category = 'vital-signs'
         ORDER BY effective_at DESC`,
      )
      .all(patientId) as Array<{
        code: string;
        value_text: string;
        value_num: number | null;
        unit: string | null;
        effective_at: string;
        observed_by: string | null;
      }>;

    if (rows.length === 0) return [];

    // Group observations by effective timestamp
    const groups = new Map<string, typeof rows>();
    for (const r of rows) {
      const timeKey = r.effective_at || "";
      if (!groups.has(timeKey)) {
        groups.set(timeKey, []);
      }
      groups.get(timeKey)!.push(r);
    }

    const summaries: VitalSignSummary[] = [];

    // Chronological order for weight trajectory calculation, then reverse back to newest first
    const sortedTimeKeys = [...groups.keys()].sort(); // oldest first
    let runningPriorWeight: number | null = null;

    const chronologicalSummaries: VitalSignSummary[] = [];

    for (const timeKey of sortedTimeKeys) {
      const items = groups.get(timeKey)!;
      const recordedAt = items[0].effective_at;
      let systolic: number | null = null;
      let diastolic: number | null = null;
      let bpText: string | null = null;
      let heartRate: number | null = null;
      let weightLbs: number | null = null;
      let heightIn: number | null = null;
      let bmi: number | null = null;
      let respiratoryRate: number | null = null;
      let temperatureF: number | null = null;
      let oxygenSaturation: number | null = null;

      for (const it of items) {
        const c = (it.code || "").toLowerCase();
        if (c === "bp" || c.includes("blood-pressure")) {
          bpText = it.value_text;
          const match = it.value_text.match(/(\d+)\s*\/\s*(\d+)/);
          if (match) {
            systolic = Number(match[1]);
            diastolic = Number(match[2]);
          }
        } else if (c === "bp-systolic" || c === "systolic") {
          systolic = it.value_num ?? Number(it.value_text) ?? null;
        } else if (c === "bp-diastolic" || c === "diastolic") {
          diastolic = it.value_num ?? Number(it.value_text) ?? null;
        } else if (c === "hr" || c.includes("pulse") || c.includes("heart")) {
          heartRate = it.value_num ?? Number(it.value_text) ?? null;
        } else if (c === "wt" || c.includes("weight")) {
          weightLbs = it.value_num ?? Number(it.value_text.replace(/[^\d.]/g, "")) ?? null;
        } else if (c === "ht" || c.includes("height")) {
          heightIn = it.value_num ?? Number(it.value_text.replace(/[^\d.]/g, "")) ?? null;
        } else if (c === "bmi") {
          bmi = it.value_num ?? Number(it.value_text) ?? null;
        } else if (c === "rr" || c.includes("resp")) {
          respiratoryRate = it.value_num ?? Number(it.value_text) ?? null;
        } else if (c === "temp" || c.includes("temperature")) {
          temperatureF = it.value_num ?? Number(it.value_text) ?? null;
        } else if (c === "spo2" || c.includes("oxygen")) {
          oxygenSaturation = it.value_num ?? Number(it.value_text) ?? null;
        }
      }

      if (!bpText && systolic !== null && diastolic !== null) {
        bpText = `${systolic}/${diastolic}`;
      }

      if (bmi === null && weightLbs !== null && heightIn !== null && heightIn > 0) {
        bmi = calculateBmi(weightLbs, heightIn);
      }

      const flags = evaluateVitalFlags(
        { systolic, diastolic, heartRate, weightLbs, heightIn, bmi },
        runningPriorWeight,
      );

      if (weightLbs !== null && weightLbs > 0) {
        runningPriorWeight = weightLbs;
      }

      chronologicalSummaries.push({
        recordedAt,
        systolic,
        diastolic,
        bpText,
        heartRate,
        weightLbs,
        heightIn,
        bmi,
        bmiCategory: bmi ? bmiCategory(bmi) : null,
        respiratoryRate,
        temperatureF,
        oxygenSaturation,
        flags,
      });
    }

    // Return newest first, capped to limit
    return chronologicalSummaries.reverse().slice(0, limit);
  },

  recordVitals(
    input: VitalMeasurementInput,
    actor: RecordActor,
    source: RecordSource = {},
  ): VitalSignSummary {
    const db = getDatabase();
    const effectiveAt = input.effectiveAt || now();
    const patientId = input.patientId;

    let computedBmi: number | null = null;
    if (input.weightLbs && input.heightIn && input.heightIn > 0) {
      computedBmi = calculateBmi(input.weightLbs, input.heightIn);
    }

    const obsRows: Array<{
      code: string;
      testName: string;
      valueText: string;
      valueNum: number | null;
      unit: string | null;
    }> = [];

    if (input.systolic !== undefined && input.diastolic !== undefined) {
      obsRows.push({
        code: "bp",
        testName: "Blood Pressure",
        valueText: `${input.systolic}/${input.diastolic}`,
        valueNum: null,
        unit: "mmHg",
      });
      obsRows.push({
        code: "bp-systolic",
        testName: "Systolic Blood Pressure",
        valueText: String(input.systolic),
        valueNum: input.systolic,
        unit: "mmHg",
      });
      obsRows.push({
        code: "bp-diastolic",
        testName: "Diastolic Blood Pressure",
        valueText: String(input.diastolic),
        valueNum: input.diastolic,
        unit: "mmHg",
      });
    }

    if (input.heartRate !== undefined) {
      obsRows.push({
        code: "hr",
        testName: "Heart Rate",
        valueText: `${input.heartRate} bpm`,
        valueNum: input.heartRate,
        unit: "bpm",
      });
    }

    if (input.weightLbs !== undefined) {
      obsRows.push({
        code: "wt",
        testName: "Weight",
        valueText: `${input.weightLbs} lbs`,
        valueNum: input.weightLbs,
        unit: "lbs",
      });
    }

    if (input.heightIn !== undefined) {
      obsRows.push({
        code: "ht",
        testName: "Height",
        valueText: `${input.heightIn} in`,
        valueNum: input.heightIn,
        unit: "in",
      });
    }

    if (computedBmi !== null) {
      obsRows.push({
        code: "bmi",
        testName: "Body Mass Index",
        valueText: `${computedBmi}`,
        valueNum: computedBmi,
        unit: "kg/m²",
      });
    }

    if (input.respiratoryRate !== undefined) {
      obsRows.push({
        code: "rr",
        testName: "Respiratory Rate",
        valueText: `${input.respiratoryRate} /min`,
        valueNum: input.respiratoryRate,
        unit: "/min",
      });
    }

    if (input.temperatureF !== undefined) {
      obsRows.push({
        code: "temp",
        testName: "Body Temperature",
        valueText: `${input.temperatureF} °F`,
        valueNum: input.temperatureF,
        unit: "°F",
      });
    }

    if (input.oxygenSaturation !== undefined) {
      obsRows.push({
        code: "spo2",
        testName: "Oxygen Saturation (SpO2)",
        valueText: `${input.oxygenSaturation}%`,
        valueNum: input.oxygenSaturation,
        unit: "%",
      });
    }

    const recordedObsIds: string[] = [];
    for (const obs of obsRows) {
      const obsId = id("obs-vital");
      db.prepare(
        `INSERT INTO observations
         (id, patient_id, category, code, coding_system, test_name, effective_at,
          value_text, value_num, unit, status, source_system, source_ref, observed_by,
          created_at, updated_at)
         VALUES (?, ?, 'vital-signs', ?, 'LOINC', ?, ?, ?, ?, ?, 'final', ?, ?, ?, ?, ?)`,
      ).run(
        obsId,
        patientId,
        obs.code,
        obs.testName,
        effectiveAt,
        obs.valueText,
        obs.valueNum,
        obs.unit,
        source.system || "ehr-local",
        source.ref || null,
        actor.displayName,
        effectiveAt,
        effectiveAt,
      );
      recordedObsIds.push(obsId);
    }

    // Also update patients table legacy vitals_json and cache for backward compatibility
    const patientRow = db.prepare(`SELECT vitals_json FROM patients WHERE id = ?`).get(patientId) as any;
    if (patientRow) {
      const currentVitals = parseJson<Record<string, string | number>>(patientRow.vitals_json, {});
      if (input.systolic && input.diastolic) currentVitals.bp = `${input.systolic}/${input.diastolic}`;
      if (input.heartRate) currentVitals.hr = input.heartRate;
      if (input.weightLbs) currentVitals.wt = `${input.weightLbs} lbs`;
      if (computedBmi) currentVitals.bmi = `${computedBmi}`;
      db.prepare(`UPDATE patients SET vitals_json = ?, updated_at = ? WHERE id = ?`)
        .run(JSON.stringify(currentVitals), now(), patientId);
    }

    stamp(
      "vitals",
      recordedObsIds[0] || id("vitals-batch"),
      patientId,
      "record_vitals",
      { input, effectiveAt, recordedObsIds },
      actor,
      source,
    );

    // Prior weight for flag calculation
    const existingVitals = this.listVitals(patientId, 5);
    const prior = existingVitals.find((v) => v.recordedAt !== effectiveAt && v.weightLbs);
    const priorWeight = prior?.weightLbs ?? null;

    const flags = evaluateVitalFlags(
      {
        systolic: input.systolic,
        diastolic: input.diastolic,
        heartRate: input.heartRate,
        weightLbs: input.weightLbs,
        heightIn: input.heightIn,
        bmi: computedBmi,
      },
      priorWeight,
    );

    return {
      recordedAt: effectiveAt,
      systolic: input.systolic ?? null,
      diastolic: input.diastolic ?? null,
      bpText: input.systolic && input.diastolic ? `${input.systolic}/${input.diastolic}` : null,
      heartRate: input.heartRate ?? null,
      weightLbs: input.weightLbs ?? null,
      heightIn: input.heightIn ?? null,
      bmi: computedBmi,
      bmiCategory: computedBmi ? bmiCategory(computedBmi) : null,
      respiratoryRate: input.respiratoryRate ?? null,
      temperatureF: input.temperatureF ?? null,
      oxygenSaturation: input.oxygenSaturation ?? null,
      flags,
      notes: input.notes ?? null,
    };
  },

  // -------------------------------------------------------------------------
  // P3-E: Structured Psychiatric History
  // -------------------------------------------------------------------------

  listPsychiatricHistory(
    patientId: string,
    category?: PsychiatricHistoryCategory,
  ): PsychiatricHistoryItem[] {
    const db = getDatabase();
    let query = `SELECT * FROM psychiatric_history_items WHERE patient_id = ?`;
    const params: any[] = [patientId];

    if (category) {
      query += ` AND category = ?`;
      params.push(category);
    }
    query += ` ORDER BY recorded_at DESC`;

    const rows = db.prepare(query).all(...params) as any[];

    return rows.map((r) => ({
      id: r.id,
      patientId: r.patient_id,
      category: r.category as PsychiatricHistoryCategory,
      title: r.title,
      details: parseJson<Record<string, unknown>>(r.details_json, {}),
      status: r.status,
      onsetDate: r.onset_date,
      resolvedDate: r.resolved_date,
      sourceSystem: r.source_system,
      sourceRef: r.source_ref,
      recordedBy: r.recorded_by,
      recordedAt: r.recorded_at,
      updatedAt: r.updated_at,
    }));
  },

  getPsychiatricHistoryItem(id: string): PsychiatricHistoryItem | null {
    const db = getDatabase();
    const r = db
      .prepare(`SELECT * FROM psychiatric_history_items WHERE id = ?`)
      .get(id) as any;
    if (!r) return null;

    return {
      id: r.id,
      patientId: r.patient_id,
      category: r.category as PsychiatricHistoryCategory,
      title: r.title,
      details: parseJson<Record<string, unknown>>(r.details_json, {}),
      status: r.status,
      onsetDate: r.onset_date,
      resolvedDate: r.resolved_date,
      sourceSystem: r.source_system,
      sourceRef: r.source_ref,
      recordedBy: r.recorded_by,
      recordedAt: r.recorded_at,
      updatedAt: r.updated_at,
    };
  },

  addPsychiatricHistoryItem(
    input: PsychiatricHistoryInput,
    actor: RecordActor,
    source: RecordSource = {},
  ): PsychiatricHistoryItem {
    const db = getDatabase();
    const itemId = id("psych-hist");
    const at = now();
    const status = input.status || "historical";

    db.prepare(
      `INSERT INTO psychiatric_history_items
       (id, patient_id, category, title, details_json, status, onset_date, resolved_date,
        source_system, source_ref, recorded_by, recorded_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      itemId,
      input.patientId,
      input.category,
      input.title,
      JSON.stringify(input.details || {}),
      status,
      input.onsetDate || null,
      input.resolvedDate || null,
      source.system || "ehr-local",
      source.ref || null,
      actor.displayName,
      at,
      at,
    );

    const created = this.getPsychiatricHistoryItem(itemId)!;
    stamp(
      "psychiatric_history",
      itemId,
      input.patientId,
      "create",
      created,
      actor,
      source,
    );

    return created;
  },

  updatePsychiatricHistoryItem(
    recordId: string,
    patch: PsychiatricHistoryPatch,
    actor: RecordActor,
    source: RecordSource = {},
  ): PsychiatricHistoryItem {
    const db = getDatabase();
    const current = this.getPsychiatricHistoryItem(recordId);
    if (!current) throw new Error(`Psychiatric history item not found: ${recordId}`);

    const entries: Array<[string, any]> = [];
    if (patch.title !== undefined) entries.push(["title", patch.title]);
    if (patch.details !== undefined) entries.push(["details_json", JSON.stringify(patch.details)]);
    if (patch.status !== undefined) entries.push(["status", patch.status]);
    if (patch.onsetDate !== undefined) entries.push(["onset_date", patch.onsetDate]);
    if (patch.resolvedDate !== undefined) entries.push(["resolved_date", patch.resolvedDate]);

    if (entries.length > 0) {
      const setClause = entries.map(([col]) => `${col} = ?`).join(", ");
      const values = entries.map(([, val]) => val);
      db.prepare(
        `UPDATE psychiatric_history_items SET ${setClause}, updated_at = ? WHERE id = ?`,
      ).run(...values, now(), recordId);
    }

    const updated = this.getPsychiatricHistoryItem(recordId)!;
    stamp(
      "psychiatric_history",
      recordId,
      current.patientId,
      "update",
      updated,
      actor,
      source,
    );

    return updated;
  },

  // -------------------------------------------------------------------------
  // P3-F: Standardized Clinical Rating Scales
  // -------------------------------------------------------------------------

  listAssessments(
    patientId: string,
    instrument?: AssessmentInstrumentType,
  ): AssessmentRecord[] {
    const db = getDatabase();
    let query = `SELECT * FROM clinical_assessments WHERE patient_id = ?`;
    const params: any[] = [patientId];

    if (instrument) {
      query += ` AND instrument = ?`;
      params.push(instrument);
    }
    query += ` ORDER BY administered_at DESC`;

    const rows = db.prepare(query).all(...params) as any[];

    return rows.map((r) => ({
      id: r.id,
      patientId: r.patient_id,
      encounterId: r.encounter_id,
      instrument: r.instrument as AssessmentInstrumentType,
      instrumentVersion: r.instrument_version,
      title: r.title,
      totalScore: r.total_score,
      maxScore: r.max_score,
      severity: r.severity,
      responses: parseJson<Record<number, number>>(r.responses_json, {}),
      flags: parseJson<string[]>(r.flags_json, []),
      source: r.source,
      administeredBy: r.administered_by,
      administeredAt: r.administered_at,
      reviewStatus: r.review_status,
      reviewedBy: r.reviewed_by,
      reviewedAt: r.reviewed_at,
      notes: r.notes,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  },

  getAssessment(id: string): AssessmentRecord | null {
    const db = getDatabase();
    const r = db.prepare(`SELECT * FROM clinical_assessments WHERE id = ?`).get(id) as any;
    if (!r) return null;

    return {
      id: r.id,
      patientId: r.patient_id,
      encounterId: r.encounter_id,
      instrument: r.instrument as AssessmentInstrumentType,
      instrumentVersion: r.instrument_version,
      title: r.title,
      totalScore: r.total_score,
      maxScore: r.max_score,
      severity: r.severity,
      responses: parseJson<Record<number, number>>(r.responses_json, {}),
      flags: parseJson<string[]>(r.flags_json, []),
      source: r.source,
      administeredBy: r.administered_by,
      administeredAt: r.administered_at,
      reviewStatus: r.review_status,
      reviewedBy: r.reviewed_by,
      reviewedAt: r.reviewed_at,
      notes: r.notes,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  },

  recordAssessment(
    input: AssessmentInput,
    actor: RecordActor,
    source: RecordSource = {},
  ): AssessmentRecord {
    const instrumentDef = ASSESSMENT_INSTRUMENTS[input.instrument];
    if (!instrumentDef) {
      throw new Error(`Unsupported assessment instrument: ${input.instrument}`);
    }

    const totalScore = Object.values(input.responses).reduce(
      (sum, val) => sum + (typeof val === "number" ? val : 0),
      0,
    );
    const interpretation = instrumentDef.interpret(totalScore, input.responses);

    const assessId = id("assess");
    const at = now();
    const administeredAt = input.administeredAt || at;
    const db = getDatabase();

    db.prepare(
      `INSERT INTO clinical_assessments
       (id, patient_id, encounter_id, instrument, instrument_version, title,
        total_score, max_score, severity, responses_json, flags_json,
        source, administered_by, administered_at, review_status, reviewed_by,
        reviewed_at, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, '1.0', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'reviewed', ?, ?, ?, ?, ?)`,
    ).run(
      assessId,
      input.patientId,
      input.encounterId || null,
      input.instrument,
      instrumentDef.title,
      totalScore,
      instrumentDef.maxScore,
      interpretation.severity,
      JSON.stringify(input.responses),
      JSON.stringify(interpretation.flags),
      input.source || "clinician",
      actor.displayName,
      administeredAt,
      actor.displayName,
      at,
      input.notes || null,
      at,
      at,
    );

    const created = this.getAssessment(assessId)!;
    stamp(
      "clinical_assessment",
      assessId,
      input.patientId,
      "record_assessment",
      created,
      actor,
      source,
    );

    return created;
  },

  reviewAssessment(
    assessmentId: string,
    actor: RecordActor,
    notes?: string,
  ): AssessmentRecord {
    const db = getDatabase();
    const current = this.getAssessment(assessmentId);
    if (!current) throw new Error(`Assessment record not found: ${assessmentId}`);

    const at = now();
    db.prepare(
      `UPDATE clinical_assessments
       SET review_status = 'reviewed', reviewed_by = ?, reviewed_at = ?, notes = COALESCE(?, notes), updated_at = ?
       WHERE id = ?`,
    ).run(actor.displayName, at, notes || null, at, assessmentId);

    const updated = this.getAssessment(assessmentId)!;
    stamp(
      "clinical_assessment",
      assessmentId,
      current.patientId,
      "review_assessment",
      updated,
      actor,
    );

    return updated;
  },
};
