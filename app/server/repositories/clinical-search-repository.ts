import { getDatabase } from "../db/connection";
import { type EncounterRecord } from "./encounter-repository";

export interface SearchResultItem {
  encounterId: string;
  patientId: string;
  patientName: string;
  date: string;
  chiefComplaint: string;
  snippet: string;
  rank: number;
}

export const ClinicalSearchRepository = {
  searchEncounters(query: string, patientId?: string, limit: number = 10): SearchResultItem[] {
    const db = getDatabase();

    const tokens = query
      .replace(/[^\w\s]/g, " ")
      .trim()
      .split(/\s+/)
      .filter((t) => t.length > 0);

    if (tokens.length === 0) return [];
    const ftsQuery = tokens.map((t) => `"${t}"*`).join(" OR ");

    let sql = `
      SELECT
        encounter_id,
        patient_id,
        patient_name,
        date,
        chief_complaint,
        snippet(encounters_fts, -1, '==', '==', '...', 12) as match_snippet,
        bm25(encounters_fts) as rank
      FROM encounters_fts
      WHERE encounters_fts MATCH ?
    `;

    const params: any[] = [ftsQuery];
    if (patientId) {
      sql += " AND patient_id = ?";
      params.push(patientId);
    }
    sql += " ORDER BY rank ASC LIMIT ?";
    params.push(limit);

    try {
      const rows = db.prepare(sql).all(...params) as any[];
      return rows.map((r) => ({
        encounterId: r.encounter_id,
        patientId: r.patient_id,
        patientName: r.patient_name,
        date: r.date,
        chiefComplaint: r.chief_complaint,
        snippet: (r.match_snippet || "").replace(/==/g, "**"),
        rank: Number(r.rank),
      }));
    } catch (err) {
      console.error("FTS5 search error:", err);
      return [];
    }
  },

  indexEncounter(record: EncounterRecord, patientName: string) {
    const db = getDatabase();
    try {
      db.prepare("DELETE FROM encounters_fts WHERE encounter_id = ?").run(record.id);

      // intervalHistory is canonical. Leave the legacy hpi FTS column blank rather
      // than indexing the same clinical text twice and distorting BM25 ranking.
      db.prepare(`
        INSERT INTO encounters_fts (
          encounter_id, patient_id, patient_name, date,
          chief_complaint, hpi, interval_history, treatment_response,
          assessment, plan
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        record.id,
        record.patientId,
        patientName,
        record.date,
        record.chiefComplaint || "",
        "",
        record.intervalHistory || "",
        record.treatmentResponse || "",
        record.assessment || "",
        record.plan || "",
      );
    } catch (err) {
      console.error("Failed to index encounter into FTS5:", err);
    }
  },

  deleteEncounter(encounterId: string) {
    const db = getDatabase();
    try {
      db.prepare("DELETE FROM encounters_fts WHERE encounter_id = ?").run(encounterId);
    } catch (err) {
      console.error("Failed to delete encounter from FTS5:", err);
    }
  },
};
