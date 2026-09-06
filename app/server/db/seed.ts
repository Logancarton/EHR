import type { DatabaseSync } from "node:sqlite";
import { patients } from "../../domain/patient";
import { patientEncounterHistory } from "../../lib/clinical-protocols";
import { initialPatientThreads } from "../../domain/messages";
import { initialTasks, initialScratchNotes } from "../../domain/tasks";
import { defaultPreferences } from "../../lib/preference-engine";

export function seedDatabaseIfEmpty(db: DatabaseSync) {
  const check = db.prepare("SELECT COUNT(*) as count FROM patients").get() as { count: number } | undefined;
  if (check && check.count > 0) {
    return; // Already populated
  }

  const now = new Date().toISOString();

  // 1. Seed Patients
  const insertPatient = db.prepare(`
    INSERT INTO patients (
      id, name, dob, age, mrn, status, pronouns, initials, alert,
      allergies_json, diagnoses_json, meds_json, vitals_json,
      last_visit, next_visit, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const p of patients) {
    insertPatient.run(
      p.id,
      p.name,
      p.dob,
      p.age,
      p.mrn,
      p.status,
      p.pronouns,
      p.initials,
      p.alert || null,
      JSON.stringify(p.id === "maya-chen" ? ["Penicillin (Rash)"] : p.id === "jordan-reed" ? ["Sulfa drugs (Hives)"] : ["NKDA"]),
      JSON.stringify(p.diagnoses),
      JSON.stringify(p.meds),
      JSON.stringify(p.id === "maya-chen" ? { bp: "118/76", hr: 72, wt: "138 lbs", bmi: "22.4" } : { bp: "124/80", hr: 78, wt: "172 lbs", bmi: "24.8" }),
      p.lastVisit,
      p.nextVisit,
      now,
      now
    );
  }

  // 2. Seed Encounters
  const insertEncounter = db.prepare(`
    INSERT INTO encounters (
      id, patient_id, date, type, status, chief_complaint, hpi,
      interval_history, treatment_response, side_effects, mse_json,
      assessment, plan, cpt_code, em_level, signed_by, signed_at,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const [patientId, encList] of Object.entries(patientEncounterHistory)) {
    for (const enc of encList) {
      insertEncounter.run(
        enc.id,
        patientId,
        enc.date,
        enc.type,
        "signed",
        enc.chiefComplaint || "",
        enc.hpi,
        "Denies acute worsening; stable interval functional status.",
        "Positive response noted on current titration schedule.",
        "Tolerating well; denies sedation, tremor, rash, or gastrointestinal upset.",
        JSON.stringify({ appearance: "Well-groomed", mood: "Euthymic", affect: "Congruent", thoughtProcess: "Linear", insight: "Intact" }),
        enc.assessment,
        enc.plan,
        "99214",
        "Moderate Complexity (99214)",
        "Dr. Logan Carton, MD",
        enc.date,
        now,
        now
      );
    }
  }

  // 3. Seed Messages
  const insertMessage = db.prepare(`
    INSERT INTO messages (
      id, patient_id, thread_id, subject, category, urgency, channel,
      sender_role, sender_name, content, ai_triage_summary, clinical_intent,
      suggested_actions_json, smart_replies_json, status, timestamp
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const [patientId, threads] of Object.entries(initialPatientThreads)) {
    for (const th of threads) {
      for (const msg of th.messages) {
        insertMessage.run(
          msg.id,
          patientId,
          th.id,
          th.subject,
          th.category,
          th.urgency,
          msg.channel,
          msg.senderRole,
          msg.senderName,
          msg.content,
          th.aiTriageSummary,
          th.clinicalIntent,
          JSON.stringify(th.suggestedActions),
          JSON.stringify(th.smartReplies),
          msg.status,
          msg.timestamp
        );
      }
    }
  }

  // 4. Seed Tasks & Scratchpad
  const insertTask = db.prepare(`
    INSERT INTO tasks (
      id, patient_id, text, completed, due_date, type, color, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const t of initialTasks) {
    insertTask.run(
      t.id,
      t.patientId || null,
      t.text,
      t.completed ? 1 : 0,
      t.due || "Today",
      "task",
      null,
      now,
      now
    );
  }

  for (const sn of initialScratchNotes) {
    insertTask.run(
      sn.id,
      sn.patientId || null,
      sn.text,
      0,
      null,
      "scratchpad",
      sn.color,
      now,
      now
    );
  }

  // 5. Seed Preferences
  const insertPref = db.prepare(`
    INSERT INTO provider_preferences (
      provider_id, active_preset_id, density, header_density,
      show_companion_rail, show_sidebar, config_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertPref.run(
    "dr-carton",
    defaultPreferences.activePresetId,
    defaultPreferences.density,
    defaultPreferences.headerDensity,
    defaultPreferences.showCompanionRail ? 1 : 0,
    defaultPreferences.showSidebar ? 1 : 0,
    JSON.stringify(defaultPreferences),
    now
  );

  // 6. Seed Initial Audit Log
  const insertAudit = db.prepare(`
    INSERT INTO audit_logs (
      id, timestamp, user_id, user_name, user_role, event_type,
      patient_id, description, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertAudit.run(
    "audit-init-1",
    now,
    "system",
    "Home Base DB Engine",
    "system",
    "system_init",
    null,
    "EHR home-base SQLite database initialized and synthetic psychiatric clinical records seeded.",
    JSON.stringify({ version: "1.0", syntheticData: true })
  );
}
