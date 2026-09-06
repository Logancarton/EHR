import { getDatabase } from "../db/connection";
import { snapshotSignedEncounter } from "../db/chart-integrity";
import { ClinicalSearchRepository } from "./clinical-search-repository";
import { PatientRepository } from "./patient-repository";

export type EncounterWorkingState = {
  selectedTemplateId?: string;
  psychotherapyMinutes?: number;
  candidateActions: Array<Record<string, any>>;
  ambientTranscript: Array<Record<string, any>>;
  lastAutosavedAt?: string;
};

export type EncounterRecord = {
  id: string;
  patientId: string;
  date: string;
  type: string;
  status: "draft" | "signed";
  chiefComplaint: string;
  /** @deprecated Compatibility alias. intervalHistory is the canonical HPI field. */
  hpi: string;
  intervalHistory: string;
  treatmentResponse: string;
  sideEffects: string;
  mse: Record<string, string>;
  assessment: string;
  plan: string;
  cptCode: string;
  emLevel: string;
  workingState?: EncounterWorkingState;
  signedBy?: string;
  signedAt?: string;
  createdAt: string;
  updatedAt: string;
};

function parseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== "string" || !raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function getWorkingState(encounterId: string): EncounterWorkingState | undefined {
  const db = getDatabase();
  const row = db
    .prepare("SELECT * FROM encounter_working_state WHERE encounter_id = ?")
    .get(encounterId) as any;
  if (!row) return undefined;

  return {
    selectedTemplateId: row.selected_template_id || undefined,
    psychotherapyMinutes:
      row.psychotherapy_minutes === null || row.psychotherapy_minutes === undefined
        ? undefined
        : Number(row.psychotherapy_minutes),
    candidateActions: parseJson<Array<Record<string, any>>>(row.candidate_actions_json, []),
    ambientTranscript: parseJson<Array<Record<string, any>>>(row.ambient_transcript_json, []),
    lastAutosavedAt: row.last_autosaved_at || undefined,
  };
}

function rowToRecord(row: any): EncounterRecord {
  // interval_history is authoritative. hpi remains a read/write compatibility mirror
  // until the legacy column can be removed in a later schema migration.
  const intervalHistory = row.interval_history || row.hpi || "";
  return {
    id: row.id,
    patientId: row.patient_id,
    date: row.date,
    type: row.type,
    status: row.status as "draft" | "signed",
    chiefComplaint: row.chief_complaint || "",
    hpi: intervalHistory,
    intervalHistory,
    treatmentResponse: row.treatment_response || "",
    sideEffects: row.side_effects || "",
    mse: parseJson<Record<string, string>>(row.mse_json, {}),
    assessment: row.assessment || "",
    plan: row.plan || "",
    cptCode: row.cpt_code,
    emLevel: row.em_level,
    workingState: getWorkingState(row.id),
    signedBy: row.signed_by || undefined,
    signedAt: row.signed_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function saveWorkingState(encounterId: string, state: EncounterWorkingState | undefined) {
  if (!state) return;
  const db = getDatabase();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO encounter_working_state (
      encounter_id, selected_template_id, psychotherapy_minutes,
      candidate_actions_json, ambient_transcript_json, last_autosaved_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(encounter_id) DO UPDATE SET
      selected_template_id = excluded.selected_template_id,
      psychotherapy_minutes = excluded.psychotherapy_minutes,
      candidate_actions_json = excluded.candidate_actions_json,
      ambient_transcript_json = excluded.ambient_transcript_json,
      last_autosaved_at = excluded.last_autosaved_at,
      updated_at = excluded.updated_at
  `).run(
    encounterId,
    state.selectedTemplateId || null,
    state.psychotherapyMinutes ?? null,
    JSON.stringify(state.candidateActions || []),
    JSON.stringify(state.ambientTranscript || []),
    state.lastAutosavedAt || null,
    now,
  );
}

export const EncounterRepository = {
  getByPatientId(patientId: string): EncounterRecord[] {
    return this.getByPatient(patientId);
  },

  getByPatient(patientId: string): EncounterRecord[] {
    const db = getDatabase();
    const rows = db
      .prepare("SELECT * FROM encounters WHERE patient_id = ? ORDER BY date DESC, created_at DESC")
      .all(patientId) as any[];
    return rows.map(rowToRecord);
  },

  getById(id: string): EncounterRecord | null {
    const db = getDatabase();
    const row = db.prepare("SELECT * FROM encounters WHERE id = ?").get(id) as any;
    return row ? rowToRecord(row) : null;
  },

  saveDraft(enc: Partial<EncounterRecord> & { patientId: string }): EncounterRecord {
    const db = getDatabase();
    const now = new Date().toISOString();
    const id = enc.id || `enc-${Date.now()}`;
    const existing = enc.id ? this.getById(enc.id) : null;

    if (existing?.status === "signed") {
      throw new Error(
        `Signed encounter ${id} is immutable; create an amendment instead of editing the signed record.`,
      );
    }
    if (existing && existing.patientId !== enc.patientId) {
      throw new Error(`Encounter ${id} belongs to a different patient and cannot be reassigned.`);
    }

    const intervalHistory =
      enc.intervalHistory ?? enc.hpi ?? existing?.intervalHistory ?? existing?.hpi ?? "";

    const record: EncounterRecord = {
      id,
      patientId: enc.patientId,
      date:
        enc.date ||
        existing?.date ||
        new Date().toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        }),
      type: enc.type || existing?.type || "Psychiatric Evaluation & Follow-up (99214)",
      status: "draft",
      chiefComplaint: enc.chiefComplaint ?? existing?.chiefComplaint ?? "",
      hpi: intervalHistory,
      intervalHistory,
      treatmentResponse: enc.treatmentResponse ?? existing?.treatmentResponse ?? "",
      sideEffects: enc.sideEffects ?? existing?.sideEffects ?? "",
      mse: enc.mse ?? existing?.mse ?? {},
      assessment: enc.assessment ?? existing?.assessment ?? "",
      plan: enc.plan ?? existing?.plan ?? "",
      cptCode: enc.cptCode ?? existing?.cptCode ?? "99214",
      emLevel: enc.emLevel ?? existing?.emLevel ?? "Moderate Complexity (99214)",
      workingState: enc.workingState ?? existing?.workingState,
      signedBy: undefined,
      signedAt: undefined,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    db.prepare(`
      INSERT INTO encounters (
        id, patient_id, date, type, status, chief_complaint, hpi,
        interval_history, treatment_response, side_effects, mse_json,
        assessment, plan, cpt_code, em_level, signed_by, signed_at,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        date = excluded.date,
        type = excluded.type,
        chief_complaint = excluded.chief_complaint,
        hpi = excluded.hpi,
        interval_history = excluded.interval_history,
        treatment_response = excluded.treatment_response,
        side_effects = excluded.side_effects,
        mse_json = excluded.mse_json,
        assessment = excluded.assessment,
        plan = excluded.plan,
        cpt_code = excluded.cpt_code,
        em_level = excluded.em_level,
        updated_at = excluded.updated_at
    `).run(
      record.id,
      record.patientId,
      record.date,
      record.type,
      "draft",
      record.chiefComplaint,
      intervalHistory,
      intervalHistory,
      record.treatmentResponse,
      record.sideEffects,
      JSON.stringify(record.mse),
      record.assessment,
      record.plan,
      record.cptCode,
      record.emLevel,
      null,
      null,
      record.createdAt,
      record.updatedAt,
    );

    saveWorkingState(record.id, record.workingState);

    const patient = PatientRepository.getById(record.patientId);
    ClinicalSearchRepository.indexEncounter(record, patient?.name || record.patientId);
    return this.getById(record.id) || record;
  },

  sign(id: string, signedBy: string): EncounterRecord | null {
    const db = getDatabase();
    const existing = this.getById(id);
    if (!existing) return null;
    if (existing.status === "signed") {
      throw new Error(`Encounter is already signed and immutable: ${id}`);
    }

    const now = new Date().toISOString();
    db.exec("BEGIN IMMEDIATE;");
    try {
      db.prepare(`
        UPDATE encounters SET
          status = 'signed',
          signed_by = ?,
          signed_at = ?,
          updated_at = ?
        WHERE id = ? AND status = 'draft'
      `).run(signedBy, now, now, id);

      const snapshot = snapshotSignedEncounter(db, id);
      if (!snapshot) throw new Error(`Could not create immutable snapshot for encounter ${id}.`);
      db.exec("COMMIT;");
    } catch (error) {
      db.exec("ROLLBACK;");
      throw error;
    }

    const signedRecord = this.getById(id);
    if (!signedRecord) return null;

    const patient = PatientRepository.getById(signedRecord.patientId);
    ClinicalSearchRepository.indexEncounter(
      signedRecord,
      patient?.name || signedRecord.patientId,
    );
    return signedRecord;
  },
};
