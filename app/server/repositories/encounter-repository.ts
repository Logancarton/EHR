import { validateLiveSupport, type LiveEncounterSupport } from "../../domain/live-encounter";
import { getDatabase } from "../db/connection";
import { snapshotSignedEncounter } from "../db/chart-integrity";
import { ClinicalSearchRepository } from "./clinical-search-repository";
import { PatientRepository } from "./patient-repository";
import { formatClinicalDate, toCalendarDate } from "../../lib/clinical-date";
import { practiceToday } from "../../lib/practice-calendar";

export type EncounterWorkingState = {
  selectedTemplateId?: string;
  psychotherapyMinutes?: number;
  /**
   * Add-on codes (e.g. "+90833") shown to the clinician and attested at signing.
   * Stored beside the minutes they depend on so the signed snapshot and a charge
   * carry the attested codes rather than a later recomputation (D-101).
   */
  addonCodes?: string[];
  candidateActions: Array<Record<string, any>>;
  ambientTranscript: Array<Record<string, any>>;
  liveSupport?: LiveEncounterSupport;
  lastAutosavedAt?: string;
};

export type EncounterRecord = {
  id: string;
  patientId: string;
  /**
   * The appointment this visit was started from, when it was started from one.
   *
   * Absent for an encounter opened outside the schedule, and never inferred: it is
   * what tells the roster which visit a signed note actually closed, so a guess
   * here would be worse than nothing. See migration 2026-09-14-001.
   */
  appointmentId?: string;
  date: string;
  type: string;
  status: "draft" | "signed";
  chiefComplaint: string;
  /** @deprecated Compatibility alias. intervalHistory is the canonical HPI field. */
  hpi: string;
  intervalHistory: string;
  reviewOfSymptoms: string;
  treatmentResponse: string;
  sideEffects: string;
  mse: Record<string, string>;
  assessment: string;
  /**
   * Risk and follow-up are stored columns rather than working state: both are
   * clinical content of the note, both belong in the signed legal record, and
   * neither should depend on the browser that typed them still being open.
   */
  riskAssessment: string;
  followUp: string;
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

/** Only code-shaped strings survive; anything else is not an attestable code. */
export function sanitizeAddonCodes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const codes = value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim().toUpperCase())
    .filter((entry) => /^\+?[0-9]{4}[0-9A-Z]$/.test(entry));
  return [...new Set(codes)].slice(0, 8);
}

function getWorkingState(encounterId: string): EncounterWorkingState | undefined {
  const db = getDatabase();
  const row = db
    .prepare("SELECT * FROM encounter_working_state WHERE encounter_id = ?")
    .get(encounterId) as any;
  if (!row) return undefined;

  return {
    liveSupport: readLiveSupport(encounterId),
    selectedTemplateId: row.selected_template_id || undefined,
    psychotherapyMinutes:
      row.psychotherapy_minutes === null || row.psychotherapy_minutes === undefined
        ? undefined
        : Number(row.psychotherapy_minutes),
    addonCodes: sanitizeAddonCodes(parseJson<unknown>(row.addon_codes_json, [])),
    candidateActions: parseJson<Array<Record<string, any>>>(row.candidate_actions_json, []),
    ambientTranscript: parseJson<Array<Record<string, any>>>(row.ambient_transcript_json, []),
    lastAutosavedAt: row.last_autosaved_at || undefined,
  };
}

function rowToRecord(row: any): EncounterRecord {
  const intervalHistory = row.interval_history || row.hpi || "";
  return {
    id: row.id,
    patientId: row.patient_id,
    appointmentId: row.appointment_id || undefined,
    date: row.date,
    type: row.type,
    status: row.status as "draft" | "signed",
    chiefComplaint: row.chief_complaint || "",
    hpi: intervalHistory,
    intervalHistory,
    reviewOfSymptoms: row.review_of_symptoms || "",
    treatmentResponse: row.treatment_response || "",
    sideEffects: row.side_effects || "",
    mse: parseJson<Record<string, string>>(row.mse_json, {}),
    assessment: row.assessment || "",
    riskAssessment: row.risk_assessment || "",
    followUp: row.follow_up || "",
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
      encounter_id, selected_template_id, psychotherapy_minutes, addon_codes_json,
      candidate_actions_json, ambient_transcript_json, last_autosaved_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(encounter_id) DO UPDATE SET
      selected_template_id = excluded.selected_template_id,
      psychotherapy_minutes = excluded.psychotherapy_minutes,
      addon_codes_json = excluded.addon_codes_json,
      candidate_actions_json = excluded.candidate_actions_json,
      ambient_transcript_json = excluded.ambient_transcript_json,
      last_autosaved_at = excluded.last_autosaved_at,
      updated_at = excluded.updated_at
  `).run(
    encounterId,
    state.selectedTemplateId || null,
    state.psychotherapyMinutes ?? null,
    JSON.stringify(sanitizeAddonCodes(state.addonCodes)),
    JSON.stringify(state.candidateActions || []),
    JSON.stringify(state.ambientTranscript || []),
    state.lastAutosavedAt || null,
    now,
  );
}

function readLiveSupport(encounterId: string): LiveEncounterSupport {
  const db = getDatabase();
  return {
    guidance: (db.prepare("SELECT * FROM encounter_provider_guidance WHERE encounter_id = ? ORDER BY rowid").all(encounterId) as any[]).map((row) => ({
      id: row.id, kind: row.kind, target: row.target, text: row.text, needsClarification: Boolean(row.needs_clarification),
      replaces: row.replaces_text ?? undefined, createdAt: row.created_at, actorId: row.actor_id,
    })),
    attestations: (db.prepare("SELECT * FROM encounter_coverage_attestations WHERE encounter_id = ? ORDER BY rowid").all(encounterId) as any[]).map((row) => ({
      id: row.id, target: row.target, evidence: row.evidence, safetyExplicitlyAssessed: Boolean(row.safety_explicitly_assessed),
      createdAt: row.created_at, actorId: row.actor_id,
    })),
  };
}

function assertGuidanceHistory(encounterId: string, support?: LiveEncounterSupport) {
  validateLiveSupport(support);
  if (!support) return;
  const previous = readLiveSupport(encounterId);
  for (const list of ["guidance", "attestations"] as const) {
    for (const old of previous[list]) {
      const incoming = support[list].find((item) => item.id === old.id);
      if (!incoming) continue; // Omission cannot delete an event.
      const { actorId: _oldActor, ...oldContent } = old;
      const { actorId: _incomingActor, ...incomingContent } = incoming;
      // Compare by field rather than object key order in untrusted JSON.
      for (const [key, value] of Object.entries(oldContent)) {
        if ((incomingContent as Record<string, unknown>)[key] !== value) throw new Error("Provider guidance history is immutable; append a correction instead.");
      }
    }
  }
}

function saveLiveSupport(encounterId: string, support: LiveEncounterSupport | undefined, actorId: string) {
  if (!support) return;
  const db = getDatabase();
  for (const entry of support.guidance) db.prepare(`INSERT OR IGNORE INTO encounter_provider_guidance
    (encounter_id, id, kind, target, text, needs_clarification, replaces_text, created_at, actor_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(encounterId, entry.id, entry.kind, entry.target, entry.text,
      Number(entry.needsClarification), entry.replaces ?? null, entry.createdAt, actorId);
  for (const entry of support.attestations) db.prepare(`INSERT OR IGNORE INTO encounter_coverage_attestations
    (encounter_id, id, target, evidence, safety_explicitly_assessed, created_at, actor_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(encounterId, entry.id, entry.target, entry.evidence,
      Number(entry.safetyExplicitlyAssessed), entry.createdAt, actorId);
}

function nextUpdatedAt(existing?: EncounterRecord | null) {
  const current = Date.now();
  const prior = existing ? Date.parse(existing.updatedAt) : Number.NaN;
  const next = Number.isFinite(prior) && prior >= current ? prior + 1 : current;
  return new Date(next).toISOString();
}

export const EncounterRepository = {
  getByPatientId(patientId: string): EncounterRecord[] {
    return this.getByPatient(patientId);
  },

  getByPatient(patientId: string): EncounterRecord[] {
    const db = getDatabase();
    const rows = db
      .prepare("SELECT * FROM encounters WHERE patient_id = ?")
      .all(patientId) as any[];
    // `date` is stored for display ("Sep 25, 2026"), so SQL ordering on it was
    // alphabetical — Sep, May, Jul, Aug — and "last visit" read as May. Newest
    // first by calendar date, then by creation time within a day.
    return rows
      .map(rowToRecord)
      .sort(
        (left, right) =>
          (toCalendarDate(right.date) ?? "").localeCompare(toCalendarDate(left.date) ?? "") ||
          String(right.createdAt).localeCompare(String(left.createdAt)),
      );
  },

  getById(id: string): EncounterRecord | null {
    const db = getDatabase();
    const row = db.prepare("SELECT * FROM encounters WHERE id = ?").get(id) as any;
    return row ? rowToRecord(row) : null;
  },

  saveDraft(enc: Partial<EncounterRecord> & { patientId: string }, actorId = "system"): EncounterRecord {
    const db = getDatabase();
    const id = enc.id || `enc-${Date.now()}`;
    const existing = enc.id ? this.getById(enc.id) : null;
    const expectedUpdatedAt = (enc as Partial<EncounterRecord> & { expectedUpdatedAt?: string }).expectedUpdatedAt;

    if (existing?.status === "signed") {
      throw new Error(
        `Signed encounter ${id} is immutable; create an amendment instead of editing the signed record.`,
      );
    }
    if (existing && existing.patientId !== enc.patientId) {
      throw new Error(`Encounter ${id} belongs to a different patient and cannot be reassigned.`);
    }
    if (expectedUpdatedAt && !existing) {
      throw new Error(
        `Encounter draft conflict for ${id}: the expected server revision no longer exists. Reload or retry from recovered work.`,
      );
    }
    if (existing && expectedUpdatedAt && existing.updatedAt !== expectedUpdatedAt) {
      throw new Error(
        `Encounter draft conflict for ${id}: expected ${expectedUpdatedAt} but server is ${existing.updatedAt}. Reload or reconcile before saving.`,
      );
    }

    assertGuidanceHistory(id, enc.workingState?.liveSupport);
    const now = nextUpdatedAt(existing);
    const intervalHistory =
      enc.intervalHistory ?? enc.hpi ?? existing?.intervalHistory ?? existing?.hpi ?? "";

    const record: EncounterRecord = {
      id,
      patientId: enc.patientId,
      // A link is set once, by the workflow that opened the visit. A later save
      // that carries no appointment must not clear the one already recorded, and
      // an unlinked draft stays unlinked rather than adopting whatever is nearby.
      appointmentId: existing?.appointmentId ?? enc.appointmentId,
      date:
        enc.date ||
        existing?.date ||
        // The practice's day; the server's own zone may be UTC, where a US
        // evening is already tomorrow.
        formatClinicalDate(practiceToday()),
      type: enc.type || existing?.type || "Psychiatric Follow-Up",
      status: "draft",
      chiefComplaint: enc.chiefComplaint ?? existing?.chiefComplaint ?? "",
      hpi: intervalHistory,
      intervalHistory,
      reviewOfSymptoms: enc.reviewOfSymptoms ?? existing?.reviewOfSymptoms ?? "",
      treatmentResponse: enc.treatmentResponse ?? existing?.treatmentResponse ?? "",
      sideEffects: enc.sideEffects ?? existing?.sideEffects ?? "",
      mse: enc.mse ?? existing?.mse ?? {},
      assessment: enc.assessment ?? existing?.assessment ?? "",
      riskAssessment: enc.riskAssessment ?? existing?.riskAssessment ?? "",
      followUp: enc.followUp ?? existing?.followUp ?? "",
      plan: enc.plan ?? existing?.plan ?? "",
      // No level is assumed. A draft's code is whatever the coding engine last
      // derived from its documentation; the clinician confirms codes at signing.
      cptCode: enc.cptCode ?? existing?.cptCode ?? "",
      emLevel: enc.emLevel ?? existing?.emLevel ?? "",
      workingState: enc.workingState ?? existing?.workingState,
      signedBy: undefined,
      signedAt: undefined,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    db.exec("SAVEPOINT encounter_draft_save");
    try {
      db.prepare(`
        INSERT INTO encounters (
          id, patient_id, appointment_id, date, type, status, chief_complaint, hpi,
          interval_history, review_of_symptoms, treatment_response, side_effects, mse_json,
          assessment, risk_assessment, follow_up, plan, cpt_code, em_level, signed_by, signed_at,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          appointment_id = excluded.appointment_id,
          date = excluded.date,
          type = excluded.type,
          chief_complaint = excluded.chief_complaint,
          hpi = excluded.hpi,
          interval_history = excluded.interval_history,
          review_of_symptoms = excluded.review_of_symptoms,
          treatment_response = excluded.treatment_response,
          side_effects = excluded.side_effects,
          mse_json = excluded.mse_json,
          assessment = excluded.assessment,
          risk_assessment = excluded.risk_assessment,
          follow_up = excluded.follow_up,
          plan = excluded.plan,
          cpt_code = excluded.cpt_code,
          em_level = excluded.em_level,
          updated_at = excluded.updated_at
      `).run(
        record.id,
        record.patientId,
        record.appointmentId ?? null,
        record.date,
        record.type,
        "draft",
        record.chiefComplaint,
        intervalHistory,
        intervalHistory,
        record.reviewOfSymptoms,
        record.treatmentResponse,
        record.sideEffects,
        JSON.stringify(record.mse),
        record.assessment,
        record.riskAssessment,
        record.followUp,
        record.plan,
        record.cptCode,
        record.emLevel,
        null,
        null,
        record.createdAt,
        record.updatedAt,
      );

      saveWorkingState(record.id, record.workingState);
      saveLiveSupport(record.id, record.workingState?.liveSupport, actorId);

      const patient = PatientRepository.getById(record.patientId);
      ClinicalSearchRepository.indexEncounter(record, patient?.name || record.patientId);
      const saved = this.getById(record.id) || record;
      db.exec("RELEASE encounter_draft_save");
      return saved;
    } catch (error) {
      db.exec("ROLLBACK TO encounter_draft_save; RELEASE encounter_draft_save");
      throw error;
    }
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
