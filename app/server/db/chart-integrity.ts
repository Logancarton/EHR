import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || !value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function canonicalLegalRecord(row: any, workingState?: any, db?: DatabaseSync) {
  const intervalHistory = row.interval_history || row.hpi || "";
  let references: any[] = [];
  if (db) {
    try {
      const rawRefs = db
        .prepare(
          `SELECT id, section, entity_type, entity_id, source, status, confirmed_by, confirmed_at
           FROM encounter_note_references
           WHERE encounter_id = ? AND status = 'confirmed'
           ORDER BY section, entity_type, entity_id`,
        )
        .all(row.id) as any[];

      references = rawRefs.map((ref) => {
        let code: string | null = null;
        let codingSystem: string | null = null;
        let display: string | null = null;

        if (ref.entity_type === "problem") {
          const p = db.prepare("SELECT display_text, code, coding_system FROM patient_problems WHERE id = ?").get(ref.entity_id) as any;
          if (p) {
            display = p.display_text;
            code = p.code || null;
            codingSystem = p.coding_system || null;
          }
        } else if (ref.entity_type === "observation") {
          const o = db.prepare("SELECT test_name, code, coding_system FROM observations WHERE id = ?").get(ref.entity_id) as any;
          if (o) {
            display = o.test_name;
            code = o.code || null;
            codingSystem = o.coding_system || null;
          }
        } else if (ref.entity_type === "medication") {
          const m = db.prepare("SELECT display_text, medication_name FROM patient_medications WHERE id = ?").get(ref.entity_id) as any;
          if (m) {
            display = m.medication_name || m.display_text;
          }
        } else if (ref.entity_type === "allergy") {
          const a = db.prepare("SELECT substance FROM patient_allergies WHERE id = ?").get(ref.entity_id) as any;
          if (a) {
            display = a.substance;
          }
        }

        return {
          id: ref.id,
          section: ref.section,
          entityType: ref.entity_type,
          entityId: ref.entity_id,
          source: ref.source,
          status: ref.status,
          code,
          codingSystem,
          display,
          confirmedBy: ref.confirmed_by,
          confirmedAt: ref.confirmed_at,
        };
      });
    } catch {
      references = [];
    }
  }

  return {
    encounterId: row.id,
    patientId: row.patient_id,
    date: row.date,
    visitType: row.type,
    chiefComplaint: row.chief_complaint || "",
    intervalHistory,
    reviewOfSymptoms: row.review_of_symptoms || "",
    treatmentResponse: row.treatment_response || "",
    sideEffects: row.side_effects || "",
    mse: parseJson<Record<string, string>>(row.mse_json, {}),
    assessment: row.assessment || "",
    riskAssessment: row.risk_assessment || "",
    followUp: row.follow_up || "",
    plan: row.plan || "",
    coding: {
      cptCode: row.cpt_code,
      emLevel: row.em_level,
      psychotherapyMinutes: workingState?.psychotherapy_minutes ?? undefined,
      // Present only when the clinician attested add-ons, so a note without any
      // seals exactly the shape it always did (D-101).
      ...attestedAddonCodes(workingState),
    },
    templateId: workingState?.selected_template_id || undefined,
    references,
    signature: {
      signedBy: row.signed_by,
      signedAt: row.signed_at,
    },
  };
}

function attestedAddonCodes(workingState: any): { addonCodes?: string[] } {
  if (!workingState?.addon_codes_json) return {};
  try {
    const parsed = JSON.parse(workingState.addon_codes_json);
    const codes = Array.isArray(parsed)
      ? parsed.filter((entry: unknown): entry is string => typeof entry === "string" && entry.trim() !== "")
      : [];
    return codes.length > 0 ? { addonCodes: codes } : {};
  } catch {
    return {};
  }
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function snapshotSignedEncounter(
  db: DatabaseSync,
  encounterId: string,
  options: { backfilled?: boolean } = {},
) {
  const row = db.prepare("SELECT * FROM encounters WHERE id = ?").get(encounterId) as any;
  if (!row || row.status !== "signed") return null;

  const workingState = db
    .prepare("SELECT * FROM encounter_working_state WHERE encounter_id = ?")
    .get(encounterId) as any;

  const content = canonicalLegalRecord(row, workingState, db);
  const contentJson = JSON.stringify(content);
  const contentSha256 = sha256(contentJson);
  const id = `snap-${encounterId}`;
  const createdAt = new Date().toISOString();

  db.prepare(`
    INSERT OR IGNORE INTO signed_encounter_snapshots (
      id, encounter_id, patient_id, signed_by, signed_at,
      content_json, content_sha256, backfilled, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    encounterId,
    row.patient_id,
    row.signed_by || "unknown",
    row.signed_at || createdAt,
    contentJson,
    contentSha256,
    options.backfilled ? 1 : 0,
    createdAt,
  );

  return { id, encounterId, contentSha256, backfilled: Boolean(options.backfilled) };
}

/**
 * Forward-compatible chart migration and database-level legal-record guardrails.
 * This runs against both fresh and existing local ehr.db files without wiping data.
 */
export function ensureChartIntegrity(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS encounter_working_state (
      encounter_id TEXT PRIMARY KEY,
      selected_template_id TEXT,
      psychotherapy_minutes INTEGER,
      candidate_actions_json TEXT NOT NULL DEFAULT '[]',
      ambient_transcript_json TEXT NOT NULL DEFAULT '[]',
      last_autosaved_at TEXT,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (encounter_id) REFERENCES encounters (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS signed_encounter_snapshots (
      id TEXT PRIMARY KEY,
      encounter_id TEXT NOT NULL UNIQUE,
      patient_id TEXT NOT NULL,
      signed_by TEXT NOT NULL,
      signed_at TEXT NOT NULL,
      content_json TEXT NOT NULL,
      content_sha256 TEXT NOT NULL,
      backfilled INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (encounter_id) REFERENCES encounters (id) ON DELETE RESTRICT,
      FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE RESTRICT
    );

    CREATE INDEX IF NOT EXISTS idx_encounter_working_state_encounter
      ON encounter_working_state (encounter_id);
    CREATE INDEX IF NOT EXISTS idx_signed_snapshots_patient
      ON signed_encounter_snapshots (patient_id, signed_at);
  `);

  // Existing signed notes receive a one-time integrity snapshot. The snapshot is
  // explicitly marked as backfilled because it was generated after historical signing.
  const signed = db.prepare("SELECT id FROM encounters WHERE status = 'signed'").all() as Array<{ id: string }>;
  for (const row of signed) snapshotSignedEncounter(db, row.id, { backfilled: true });

  // Database-level immutability: application bugs cannot rewrite or delete a signed
  // note, its frozen working-state provenance, or its integrity snapshot.
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS prevent_signed_encounter_update
    BEFORE UPDATE ON encounters
    WHEN OLD.status = 'signed'
    BEGIN
      SELECT RAISE(ABORT, 'Signed encounters are immutable; create an amendment instead.');
    END;

    CREATE TRIGGER IF NOT EXISTS prevent_signed_encounter_delete
    BEFORE DELETE ON encounters
    WHEN OLD.status = 'signed'
    BEGIN
      SELECT RAISE(ABORT, 'Signed encounters cannot be deleted; use record-retention/amendment workflow.');
    END;

    CREATE TRIGGER IF NOT EXISTS prevent_signed_working_state_update
    BEFORE UPDATE ON encounter_working_state
    WHEN EXISTS (
      SELECT 1 FROM encounters
      WHERE encounters.id = OLD.encounter_id AND encounters.status = 'signed'
    )
    BEGIN
      SELECT RAISE(ABORT, 'Signed encounter working state is immutable.');
    END;

    CREATE TRIGGER IF NOT EXISTS prevent_signed_working_state_delete
    BEFORE DELETE ON encounter_working_state
    WHEN EXISTS (
      SELECT 1 FROM encounters
      WHERE encounters.id = OLD.encounter_id AND encounters.status = 'signed'
    )
    BEGIN
      SELECT RAISE(ABORT, 'Signed encounter working state cannot be deleted.');
    END;

    CREATE TRIGGER IF NOT EXISTS prevent_signed_snapshot_update
    BEFORE UPDATE ON signed_encounter_snapshots
    BEGIN
      SELECT RAISE(ABORT, 'Signed encounter snapshots are immutable.');
    END;

    CREATE TRIGGER IF NOT EXISTS prevent_signed_snapshot_delete
    BEFORE DELETE ON signed_encounter_snapshots
    BEGIN
      SELECT RAISE(ABORT, 'Signed encounter snapshots cannot be deleted.');
    END;
  `);
}
