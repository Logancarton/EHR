import type { DatabaseMigration } from "./types";

/**
 * Clear the normal mental status exam that was pre-filled into every new draft.
 *
 * Until NOTE-SAFE-1 (D-104) a new note opened with a complete normal exam —
 * including "no evidence of … suicidal ideation" — and autosave stored it as if
 * a clinician had written it. The client now starts blank and clears these
 * values when an unsigned draft is opened, but the stored copies are also read
 * by server-side projections, so they are cleared here at the source.
 *
 * Only unsigned drafts are touched, and only a dimension whose text is still
 * byte-identical to the old default. Anything a clinician edited stays, and a
 * signed note is the legal record and is never rewritten. The strings are fixed
 * here because an issued migration must not change if the application does.
 */
const LEGACY_AUTOFILLED_MSE: Record<string, string> = {
  appearance: "Well-groomed, dressed appropriately for weather and setting.",
  behavior: "Cooperative, calm, maintains appropriate eye contact.",
  speech: "Normal rate, rhythm, and volume. Non-pressured.",
  moodAffect: "Mood described as 'stable, slightly anxious at times'; affect full and congruent.",
  thoughtProcess: "Linear, goal-directed, coherent. No looseness of associations.",
  thoughtContent: "No evidence of delusions, hallucinations, suicidal ideation, or homicidal ideation.",
  cognition: "Alert and oriented x4. Attention and concentration intact during exam.",
  insightJudgment: "Good insight into condition; judgment intact regarding pharmacotherapy and safety.",
};

export const migration: DatabaseMigration = {
  id: "2026-09-25-003-clear-unauthored-draft-mse",
  description: "Clear the unauthored default mental status exam from unsigned encounter drafts",
  apply(db) {
    const encounters = db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'encounters'`)
      .get();
    if (!encounters) return;
    const hasProvenance = Boolean(
      db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'provenance_events'`).get(),
    );
    const at = new Date().toISOString();

    const drafts = db
      .prepare(`SELECT id, patient_id, mse_json FROM encounters WHERE status = 'draft'`)
      .all() as Array<{ id: string; patient_id: string; mse_json: string | null }>;

    for (const draft of drafts) {
      let mse: Record<string, unknown>;
      try {
        mse = JSON.parse(draft.mse_json || "{}");
      } catch {
        continue;
      }
      const cleared: string[] = [];
      for (const [dimension, legacy] of Object.entries(LEGACY_AUTOFILLED_MSE)) {
        if (typeof mse[dimension] === "string" && (mse[dimension] as string).trim() === legacy) {
          mse[dimension] = "";
          cleared.push(dimension);
        }
      }
      if (cleared.length === 0) continue;

      db.prepare(`UPDATE encounters SET mse_json = ? WHERE id = ? AND status = 'draft'`).run(JSON.stringify(mse), draft.id);

      if (hasProvenance) {
        db.prepare(`INSERT OR IGNORE INTO provenance_events
          (id, patient_id, entity_type, entity_id, activity, source_type, source_system, source_ref,
           actor_id, actor_name, payload_sha256, metadata_json, created_at)
          VALUES (?, ?, 'encounter', ?, 'clear-unauthored-default', 'migration', 'ehr-local', ?, 'system-migration', 'System migration', NULL, ?, ?)`)
          .run(
            `prov-clear-mse-${draft.id}`,
            draft.patient_id,
            draft.id,
            "2026-09-25-003-clear-unauthored-draft-mse",
            JSON.stringify({ cleared, reason: "pre-filled default exam, never authored by a clinician" }),
            at,
          );
      }
    }
  },
};
