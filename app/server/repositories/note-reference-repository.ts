import { createHash, randomUUID } from "node:crypto";
import { getDatabase } from "../db/connection";

/**
 * References linking an encounter note section to clinical records.
 *
 * The note itself stays plain prose. A reference is a row beside it, keyed by
 * (encounter, section, entityType, entityId). That key is what the coding engine
 * and the claim consume; the character span is a presentation hint only and may
 * be lost on any edit without losing the reference.
 *
 * References are evidence until a clinician confirms them at signing, mirroring
 * the boundary medication reconciliation already draws between vendor evidence
 * and clinical truth (D-019/D-020).
 */

export type NoteReferenceEntityType =
  | "problem"
  | "medication"
  | "observation"
  | "assessment"
  | "allergy";

/**
 * Evidence class, strongest first.
 *
 * `action-derived` is known structurally — a staged order, an accepted candidate
 * action, a reconciliation performed in this encounter — and requires no language
 * understanding at all. `clinician-authored` is an explicit human link.
 * `ai-extracted` is a proposal.
 */
export type NoteReferenceSource = "action-derived" | "clinician-authored" | "ai-extracted";

export type NoteReferenceStatus = "proposed" | "confirmed" | "rejected";

export type NoteReferenceActor = { userId: string; displayName: string };

export type NoteReferenceInput = {
  section: string;
  entityType: NoteReferenceEntityType;
  entityId: string;
  versionNum?: number | null;
  spanStart?: number | null;
  spanEnd?: number | null;
  source?: NoteReferenceSource;
  confidence?: number | null;
  modelId?: string | null;
};

export type NoteReferenceRecord = {
  id: string;
  encounterId: string;
  patientId: string;
  section: string;
  entityType: NoteReferenceEntityType;
  entityId: string;
  versionNum: number | null;
  spanStart: number | null;
  spanEnd: number | null;
  source: NoteReferenceSource;
  confidence: number | null;
  status: NoteReferenceStatus;
  modelId: string | null;
  extractedAt: string | null;
  confirmedBy: string | null;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EnrichedNoteReference = NoteReferenceRecord & {
  display?: string;
  code?: string | null;
  codingSystem?: string | null;
};

function sha(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}
function newId(prefix: string) {
  return `${prefix}-${randomUUID()}`;
}
function now() {
  return new Date().toISOString();
}

/**
 * A decision a human made is never undone by a derivation pass. Re-derivation may
 * add references and retire its own stale ones; it may not touch these.
 *
 * Action-derived rows are the exception among confirmed references: they are
 * confirmed because the clinician performed the act, not because anyone reviewed
 * the reference, so the pass that derived them still owns them and must be able to
 * retire one when its order is withdrawn. A rejection is a decision either way.
 */
function isHumanDecided(row: { source: string; status: string }): boolean {
  if (row.status === "rejected") return true;
  if (row.source === "clinician-authored") return true;
  if (row.source === "action-derived") return false;
  return row.status === "confirmed";
}

function rowToRecord(row: any): NoteReferenceRecord {
  return {
    id: row.id,
    encounterId: row.encounter_id,
    patientId: row.patient_id,
    section: row.section,
    entityType: row.entity_type,
    entityId: row.entity_id,
    versionNum: row.version_num === null || row.version_num === undefined ? null : Number(row.version_num),
    spanStart: row.span_start === null || row.span_start === undefined ? null : Number(row.span_start),
    spanEnd: row.span_end === null || row.span_end === undefined ? null : Number(row.span_end),
    source: row.source,
    confidence: row.confidence === null || row.confidence === undefined ? null : Number(row.confidence),
    status: row.status,
    modelId: row.model_id ?? null,
    extractedAt: row.extracted_at ?? null,
    confirmedBy: row.confirmed_by ?? null,
    confirmedAt: row.confirmed_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function provenance(
  encounterId: string,
  patientId: string,
  activity: string,
  payload: unknown,
  actor: NoteReferenceActor,
  sourceRef?: string,
) {
  getDatabase()
    .prepare(
      `INSERT INTO provenance_events
      (id, patient_id, entity_type, entity_id, activity, source_type, source_system, source_ref,
       actor_id, actor_name, payload_sha256, metadata_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      newId("prov"),
      patientId,
      "note-reference",
      encounterId,
      activity,
      "derived",
      "ehr-local",
      sourceRef || null,
      actor.userId,
      actor.displayName,
      sha(payload),
      "{}",
      now(),
    );
}

export const NoteReferenceRepository = {
  listForEncounter(encounterId: string, status?: NoteReferenceStatus): NoteReferenceRecord[] {
    const db = getDatabase();
    const rows = (
      status
        ? db
            .prepare(
              `SELECT * FROM encounter_note_references WHERE encounter_id = ? AND status = ?
               ORDER BY section, entity_type, entity_id`,
            )
            .all(encounterId, status)
        : db
            .prepare(
              `SELECT * FROM encounter_note_references WHERE encounter_id = ?
               ORDER BY section, entity_type, entity_id`,
            )
            .all(encounterId)
    ) as any[];
    return rows.map(rowToRecord);
  },

  /** Returns references with display, code, and codingSystem populated from authoritative tables. */
  listEnrichedForEncounter(encounterId: string, status?: NoteReferenceStatus): EnrichedNoteReference[] {
    const refs = this.listForEncounter(encounterId, status);
    const db = getDatabase();
    return refs.map((ref) => {
      let display = ref.entityId;
      let code: string | null = null;
      let codingSystem: string | null = null;

      if (ref.entityType === "problem") {
        const row = db.prepare("SELECT display_text, code, coding_system FROM patient_problems WHERE id = ?").get(ref.entityId) as any;
        if (row) {
          display = row.display_text;
          code = row.code || null;
          codingSystem = row.coding_system || null;
        }
      } else if (ref.entityType === "medication") {
        const row = db.prepare("SELECT display_text, medication_name FROM patient_medications WHERE id = ?").get(ref.entityId) as any;
        if (row) {
          display = row.display_text || row.medication_name;
        }
      } else if (ref.entityType === "observation") {
        const row = db.prepare("SELECT test_name, code, coding_system FROM observations WHERE id = ?").get(ref.entityId) as any;
        if (row) {
          display = row.test_name;
          code = row.code || null;
          codingSystem = row.coding_system || null;
        }
      } else if (ref.entityType === "allergy") {
        const row = db.prepare("SELECT substance FROM patient_allergies WHERE id = ?").get(ref.entityId) as any;
        if (row) {
          display = row.substance;
        }
      }

      return {
        ...ref,
        display,
        code,
        codingSystem,
      };
    });
  },

  /** "Which encounters addressed this problem?" — the timeline edge, as a query. */
  listForEntity(entityType: NoteReferenceEntityType, entityId: string): NoteReferenceRecord[] {
    const rows = getDatabase()
      .prepare(
        `SELECT * FROM encounter_note_references WHERE entity_type = ? AND entity_id = ?
         ORDER BY created_at DESC`,
      )
      .all(entityType, entityId) as any[];
    return rows.map(rowToRecord);
  },

  upsert(
    encounterId: string,
    patientId: string,
    input: NoteReferenceInput,
    actor: NoteReferenceActor,
  ): NoteReferenceRecord {
    const db = getDatabase();
    const at = now();
    const source = input.source || "ai-extracted";

    const existing = db
      .prepare(
        `SELECT * FROM encounter_note_references
         WHERE encounter_id = ? AND section = ? AND entity_type = ? AND entity_id = ?`,
      )
      .get(encounterId, input.section, input.entityType, input.entityId) as any;

    if (existing) {
      // A human decision outranks a derivation pass. Refresh only the presentation
      // hint so an underline can still render, and leave the decision alone.
      if (isHumanDecided(existing) && source === "ai-extracted") {
        db.prepare(
          `UPDATE encounter_note_references SET span_start = ?, span_end = ?, updated_at = ? WHERE id = ?`,
        ).run(input.spanStart ?? null, input.spanEnd ?? null, at, existing.id);
        return rowToRecord(
          db.prepare(`SELECT * FROM encounter_note_references WHERE id = ?`).get(existing.id),
        );
      }

      db.prepare(
        `UPDATE encounter_note_references
         SET version_num = ?, span_start = ?, span_end = ?, source = ?, confidence = ?,
             model_id = ?, extracted_at = ?, updated_at = ?
         WHERE id = ?`,
      ).run(
        input.versionNum ?? null,
        input.spanStart ?? null,
        input.spanEnd ?? null,
        source,
        input.confidence ?? null,
        input.modelId ?? null,
        source === "ai-extracted" ? at : null,
        at,
        existing.id,
      );
      const updated = db.prepare(`SELECT * FROM encounter_note_references WHERE id = ?`).get(existing.id);
      provenance(encounterId, patientId, "note-reference-update", updated, actor, input.modelId || undefined);
      return rowToRecord(updated);
    }

    const id = newId("nref");
    // Only extraction produces a proposal. An explicit clinician link is already a
    // decision, and an action-derived reference records something the clinician
    // did — staging an order, reconciling a medication — rather than something a
    // model concluded from prose. Neither waits for signing to become true; what
    // signing decides is what goes on the claim.
    const status: NoteReferenceStatus = source === "ai-extracted" ? "proposed" : "confirmed";
    db.prepare(
      `INSERT INTO encounter_note_references
       (id, encounter_id, patient_id, section, entity_type, entity_id, version_num,
        span_start, span_end, source, confidence, status, model_id, extracted_at,
        confirmed_by, confirmed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      encounterId,
      patientId,
      input.section,
      input.entityType,
      input.entityId,
      input.versionNum ?? null,
      input.spanStart ?? null,
      input.spanEnd ?? null,
      source,
      input.confidence ?? null,
      status,
      input.modelId ?? null,
      source === "ai-extracted" ? at : null,
      status === "confirmed" ? actor.userId : null,
      status === "confirmed" ? at : null,
      at,
      at,
    );
    const row = db.prepare(`SELECT * FROM encounter_note_references WHERE id = ?`).get(id);
    provenance(encounterId, patientId, "note-reference-create", row, actor, input.modelId || undefined);
    return rowToRecord(row);
  },

  /**
   * Replace the derived reference set for one section.
   *
   * Derived, not authored: the set is rebuilt from the section each time, the way
   * the full-text index is. Human decisions in the section survive untouched —
   * a pass may retire only its own stale proposals.
   */
  replaceSection(
    encounterId: string,
    patientId: string,
    section: string,
    inputs: NoteReferenceInput[],
    actor: NoteReferenceActor,
    sourceScope: NoteReferenceSource = "ai-extracted",
  ): NoteReferenceRecord[] {
    const db = getDatabase();
    const keep = new Set(inputs.map((input) => `${input.entityType}:${input.entityId}`));

    const existing = db
      .prepare(`SELECT * FROM encounter_note_references WHERE encounter_id = ? AND section = ?`)
      .all(encounterId, section) as any[];

    for (const row of existing) {
      // A pass retires only its own output. Extraction and action derivation write
      // into the same sections from different evidence; neither may clear the
      // other's references, and neither may clear a human decision.
      if (row.source !== sourceScope) continue;
      if (isHumanDecided(row)) continue;
      if (keep.has(`${row.entity_type}:${row.entity_id}`)) continue;
      db.prepare(`DELETE FROM encounter_note_references WHERE id = ?`).run(row.id);
      provenance(encounterId, patientId, "note-reference-retract", row, actor);
    }

    for (const input of inputs) {
      this.upsert(encounterId, patientId, { ...input, section, source: input.source || sourceScope }, actor);
    }

    return this.listForEncounter(encounterId).filter((reference) => reference.section === section);
  },

  /** Signing is the conversion of evidence into truth. */
  confirm(referenceIds: string[], actor: NoteReferenceActor): number {
    if (referenceIds.length === 0) return 0;
    const db = getDatabase();
    const at = now();
    let changed = 0;
    for (const referenceId of referenceIds) {
      const row = db.prepare(`SELECT * FROM encounter_note_references WHERE id = ?`).get(referenceId) as any;
      if (!row || row.status === "confirmed") continue;
      db.prepare(
        `UPDATE encounter_note_references SET status = 'confirmed', confirmed_by = ?, confirmed_at = ?, updated_at = ? WHERE id = ?`,
      ).run(actor.userId, at, at, referenceId);
      provenance(row.encounter_id, row.patient_id, "note-reference-confirm", row, actor);
      changed += 1;
    }
    return changed;
  },

  /** A declined proposal is retained. That it was declined is audit-relevant. */
  reject(referenceIds: string[], actor: NoteReferenceActor): number {
    if (referenceIds.length === 0) return 0;
    const db = getDatabase();
    const at = now();
    let changed = 0;
    for (const referenceId of referenceIds) {
      const row = db.prepare(`SELECT * FROM encounter_note_references WHERE id = ?`).get(referenceId) as any;
      if (!row || row.status === "rejected") continue;
      db.prepare(
        `UPDATE encounter_note_references SET status = 'rejected', confirmed_by = ?, confirmed_at = ?, updated_at = ? WHERE id = ?`,
      ).run(actor.userId, at, at, referenceId);
      provenance(row.encounter_id, row.patient_id, "note-reference-reject", row, actor);
      changed += 1;
    }
    return changed;
  },
};
