import { getDatabase } from "../db/connection";

export type EncounterRecord = {
  id: string;
  patientId: string;
  date: string;
  type: string;
  status: "draft" | "signed";
  chiefComplaint: string;
  hpi: string;
  intervalHistory: string;
  treatmentResponse: string;
  sideEffects: string;
  mse: Record<string, string>;
  assessment: string;
  plan: string;
  cptCode: string;
  emLevel: string;
  signedBy?: string;
  signedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export const EncounterRepository = {
  getByPatient(patientId: string): EncounterRecord[] {
    const db = getDatabase();
    const rows = db
      .prepare("SELECT * FROM encounters WHERE patient_id = ? ORDER BY date DESC, created_at DESC")
      .all(patientId) as any[];

    return rows.map((r) => ({
      id: r.id,
      patientId: r.patient_id,
      date: r.date,
      type: r.type,
      status: r.status as "draft" | "signed",
      chiefComplaint: r.chief_complaint,
      hpi: r.hpi,
      intervalHistory: r.interval_history,
      treatmentResponse: r.treatment_response,
      sideEffects: r.side_effects,
      mse: JSON.parse(r.mse_json || "{}"),
      assessment: r.assessment,
      plan: r.plan,
      cptCode: r.cpt_code,
      emLevel: r.em_level,
      signedBy: r.signed_by || undefined,
      signedAt: r.signed_at || undefined,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  },

  getById(id: string): EncounterRecord | null {
    const db = getDatabase();
    const r = db.prepare("SELECT * FROM encounters WHERE id = ?").get(id) as any;
    if (!r) return null;

    return {
      id: r.id,
      patientId: r.patient_id,
      date: r.date,
      type: r.type,
      status: r.status as "draft" | "signed",
      chiefComplaint: r.chief_complaint,
      hpi: r.hpi,
      intervalHistory: r.interval_history,
      treatmentResponse: r.treatment_response,
      sideEffects: r.side_effects,
      mse: JSON.parse(r.mse_json || "{}"),
      assessment: r.assessment,
      plan: r.plan,
      cptCode: r.cpt_code,
      emLevel: r.em_level,
      signedBy: r.signed_by || undefined,
      signedAt: r.signed_at || undefined,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  },

  saveDraft(enc: Partial<EncounterRecord> & { patientId: string }): EncounterRecord {
    const db = getDatabase();
    const now = new Date().toISOString();
    const id = enc.id || `enc-${Date.now()}`;
    const existing = enc.id ? this.getById(enc.id) : null;

    const record: EncounterRecord = {
      id,
      patientId: enc.patientId,
      date: enc.date || new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      type: enc.type || "Psychiatric Evaluation & Follow-up (99214)",
      status: "draft",
      chiefComplaint: enc.chiefComplaint ?? existing?.chiefComplaint ?? "",
      hpi: enc.hpi ?? existing?.hpi ?? "",
      intervalHistory: enc.intervalHistory ?? existing?.intervalHistory ?? "",
      treatmentResponse: enc.treatmentResponse ?? existing?.treatmentResponse ?? "",
      sideEffects: enc.sideEffects ?? existing?.sideEffects ?? "",
      mse: enc.mse ?? existing?.mse ?? {},
      assessment: enc.assessment ?? existing?.assessment ?? "",
      plan: enc.plan ?? existing?.plan ?? "",
      cptCode: enc.cptCode ?? existing?.cptCode ?? "99214",
      emLevel: enc.emLevel ?? existing?.emLevel ?? "Moderate Complexity (99214)",
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
        status = excluded.status,
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
      record.status,
      record.chiefComplaint,
      record.hpi,
      record.intervalHistory,
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
      record.updatedAt
    );

    return record;
  },

  sign(id: string, signedBy: string): EncounterRecord | null {
    const db = getDatabase();
    const existing = this.getById(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE encounters SET
        status = 'signed',
        signed_by = ?,
        signed_at = ?,
        updated_at = ?
      WHERE id = ?
    `).run(signedBy, now, now, id);

    return {
      ...existing,
      status: "signed",
      signedBy,
      signedAt: now,
      updatedAt: now,
    };
  },
};
