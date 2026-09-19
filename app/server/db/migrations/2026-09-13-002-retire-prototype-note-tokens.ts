import type { DatabaseMigration } from "./types";

/** Immutable historical migration. Do not rename its ID or change its semantics. */
export const migration: DatabaseMigration =   {
    id: "2026-09-13-002-retire-prototype-note-tokens",
    description: "Strip abandoned smart-chip markup from draft note text",
    apply(db) {
      // The smart-chip prototype wrote `@[type:Label|meta]` tokens into note
      // prose. That markup was never clinical content — it was an editor
      // affordance that leaked into the field — and it reaches every export
      // verbatim. Drafts are rewritten to the label the clinician saw.
      //
      // Drafts only. A signed encounter is hashed over its note text
      // (`chart-integrity.ts`), so silently rewriting one would both break its
      // integrity snapshot and alter a legal record after attestation. If a
      // signed note contains tokens, that is a finding to surface, not a string
      // to fix; the check below records it rather than repairing it.
      const TOKEN = /@\[(?:med|dx|lab|vital|scale|date|allergy):([^\]|]+)(?:\|[^\]]+)?\]/g;
      const strip = (value: unknown): string =>
        typeof value === "string" ? value.replace(TOKEN, (_match, label) => String(label)) : "";

      const textColumns = [
        "chief_complaint",
        "interval_history",
        "hpi",
        "review_of_symptoms",
        "treatment_response",
        "side_effects",
        "assessment",
        "risk_assessment",
        "follow_up",
        "plan",
      ] as const;

      const rows = db.prepare(`SELECT * FROM encounters`).all() as any[];
      for (const row of rows) {
        const mseRaw = typeof row.mse_json === "string" ? row.mse_json : "{}";
        const touchesText = textColumns.some((column) => String(row[column] ?? "").includes("@["));
        const touchesMse = mseRaw.includes("@[");
        if (!touchesText && !touchesMse) continue;

        if (row.status === "signed") {
          // Leave the record untouched and leave a trail. A signed note is not a
          // string this migration is entitled to rewrite.
          db.prepare(
            // Stable identity, so re-running the migration records the finding
            // once rather than colliding on it.
            `INSERT OR IGNORE INTO provenance_events
             (id, patient_id, entity_type, entity_id, activity, source_type, source_system,
              source_ref, actor_id, actor_name, payload_sha256, metadata_json, created_at)
             VALUES (?, ?, 'encounter', ?, 'prototype-markup-detected', 'derived', 'ehr-local',
                     NULL, 'system-migration', 'Prototype token retirement', '', ?, ?)`,
          ).run(
            `prov-token-${row.id}`,
            row.patient_id,
            row.id,
            JSON.stringify({ note: "Signed note contains prototype chip markup; not rewritten." }),
            new Date().toISOString(),
          );
          continue;
        }

        let mseJson = mseRaw;
        if (touchesMse) {
          try {
            const mse = JSON.parse(mseRaw) as Record<string, unknown>;
            for (const key of Object.keys(mse)) mse[key] = strip(mse[key]);
            mseJson = JSON.stringify(mse);
          } catch {
            // Unparseable MSE stays as it is rather than being replaced by a guess.
          }
        }

        db.prepare(
          `UPDATE encounters SET
             chief_complaint = ?, interval_history = ?, hpi = ?, review_of_symptoms = ?,
             treatment_response = ?, side_effects = ?, assessment = ?, risk_assessment = ?,
             follow_up = ?, plan = ?, mse_json = ?, updated_at = ?
           WHERE id = ?`,
        ).run(
          strip(row.chief_complaint),
          strip(row.interval_history),
          strip(row.hpi),
          strip(row.review_of_symptoms),
          strip(row.treatment_response),
          strip(row.side_effects),
          strip(row.assessment),
          strip(row.risk_assessment),
          strip(row.follow_up),
          strip(row.plan),
          mseJson,
          new Date().toISOString(),
          row.id,
        );
      }
    },
  };
