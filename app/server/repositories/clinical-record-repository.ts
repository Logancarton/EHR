import { createHash, randomUUID } from "node:crypto";
import { getDatabase } from "../db/connection";

export type RecordActor = { userId: string; displayName: string };
export type RecordSource = { type?: string; system?: string; ref?: string };

function sha(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}
function id(prefix: string) { return `${prefix}-${randomUUID()}`; }
function now() { return new Date().toISOString(); }
function parse<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function version(entityType: string, entityId: string, patientId: string | null, operation: string,
  snapshot: unknown, actor: RecordActor, source: RecordSource = {}) {
  const db = getDatabase();
  const row = db.prepare(`SELECT COALESCE(MAX(version_number), 0) AS n FROM record_versions WHERE entity_type = ? AND entity_id = ?`)
    .get(entityType, entityId) as { n: number };
  const n = Number(row?.n || 0) + 1;
  db.prepare(`INSERT INTO record_versions
    (id, patient_id, entity_type, entity_id, version_number, operation, snapshot_json,
     actor_id, actor_name, source_type, source_ref, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id("ver"), patientId, entityType, entityId, n, operation, JSON.stringify(snapshot),
      actor.userId, actor.displayName, source.type || "clinician", source.ref || null, now());
}

function provenance(entityType: string, entityId: string, patientId: string | null, activity: string,
  payload: unknown, actor: RecordActor, source: RecordSource = {}) {
  getDatabase().prepare(`INSERT INTO provenance_events
    (id, patient_id, entity_type, entity_id, activity, source_type, source_system, source_ref,
     actor_id, actor_name, payload_sha256, metadata_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id("prov"), patientId, entityType, entityId, activity, source.type || "clinician",
      source.system || "ehr-local", source.ref || null, actor.userId, actor.displayName,
      sha(payload), "{}", now());
}

function stamp(entityType: string, entityId: string, patientId: string | null, operation: string,
  payload: unknown, actor: RecordActor, source?: RecordSource) {
  version(entityType, entityId, patientId, operation, payload, actor, source);
  provenance(entityType, entityId, patientId, operation, payload, actor, source);
}

export const ClinicalRecordRepository = {
  allergies(patientId: string) {
    return getDatabase().prepare(`SELECT * FROM patient_allergies WHERE patient_id = ? ORDER BY recorded_at DESC`).all(patientId) as any[];
  },
  problems(patientId: string) {
    return getDatabase().prepare(`SELECT * FROM patient_problems WHERE patient_id = ? ORDER BY recorded_at DESC`).all(patientId) as any[];
  },
  medications(patientId: string) {
    return getDatabase().prepare(`SELECT * FROM patient_medications WHERE patient_id = ? ORDER BY recorded_at DESC`).all(patientId) as any[];
  },
  observations(patientId: string, category?: string, limit = 100) {
    const db = getDatabase();
    return (category
      ? db.prepare(`SELECT o.*, ra.acknowledged_by, ra.acknowledged_at, ra.disposition, ra.note AS acknowledgement_note
          FROM observations o LEFT JOIN result_acknowledgements ra ON ra.observation_id = o.id
          WHERE o.patient_id = ? AND o.category = ? ORDER BY o.effective_at DESC LIMIT ?`).all(patientId, category, limit)
      : db.prepare(`SELECT o.*, ra.acknowledged_by, ra.acknowledged_at, ra.disposition, ra.note AS acknowledgement_note
          FROM observations o LEFT JOIN result_acknowledgements ra ON ra.observation_id = o.id
          WHERE o.patient_id = ? ORDER BY o.effective_at DESC LIMIT ?`).all(patientId, limit)) as any[];
  },
  insurance(patientId: string) {
    return getDatabase().prepare(`SELECT * FROM insurance_policies WHERE patient_id = ? ORDER BY status = 'active' DESC, updated_at DESC`).all(patientId) as any[];
  },
  pharmacies(patientId: string) {
    return getDatabase().prepare(`SELECT p.*, pp.priority, pp.status AS patient_status
      FROM patient_pharmacies pp JOIN pharmacies p ON p.id = pp.pharmacy_id
      WHERE pp.patient_id = ? ORDER BY pp.priority ASC, p.name ASC`).all(patientId) as any[];
  },
  documents(patientId: string) {
    return getDatabase().prepare(`SELECT * FROM documents WHERE patient_id = ? ORDER BY updated_at DESC`).all(patientId) as any[];
  },
  documentVersions(documentId: string) {
    return getDatabase().prepare(`SELECT * FROM document_versions WHERE document_id = ? ORDER BY version_number DESC`).all(documentId) as any[];
  },
  addenda(encounterId: string) {
    return getDatabase().prepare(`SELECT * FROM encounter_addenda WHERE encounter_id = ? ORDER BY created_at ASC`).all(encounterId) as any[];
  },
  versions(entityType: string, entityId: string) {
    return (getDatabase().prepare(`SELECT * FROM record_versions WHERE entity_type = ? AND entity_id = ? ORDER BY version_number DESC`).all(entityType, entityId) as any[])
      .map(r => ({ ...r, snapshot: parse(r.snapshot_json, {}) }));
  },
  provenance(entityType: string, entityId: string) {
    return (getDatabase().prepare(`SELECT * FROM provenance_events WHERE entity_type = ? AND entity_id = ? ORDER BY created_at ASC`).all(entityType, entityId) as any[])
      .map(r => ({ ...r, metadata: parse(r.metadata_json, {}) }));
  },

  addAllergy(input: { patientId: string; substance: string; reaction?: string; severity?: string }, actor: RecordActor, source: RecordSource = {}) {
    const db = getDatabase(); const recordId = id("alg"); const at = now();
    db.prepare(`INSERT INTO patient_allergies
      (id, patient_id, substance, reaction, severity, status, source_type, source_system, source_ref, recorded_by, recorded_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?)`)
      .run(recordId, input.patientId, input.substance, input.reaction || null, input.severity || null,
        source.type || "clinician", source.system || "ehr-local", source.ref || null, actor.displayName, at, at);
    const row = db.prepare(`SELECT * FROM patient_allergies WHERE id = ?`).get(recordId) as any;
    stamp("allergy", recordId, input.patientId, "create", row, actor, source); return row;
  },
  addProblem(input: { patientId: string; displayText: string; code?: string; codingSystem?: string; onsetDate?: string }, actor: RecordActor, source: RecordSource = {}) {
    const db = getDatabase(); const recordId = id("prb"); const at = now();
    db.prepare(`INSERT INTO patient_problems
      (id, patient_id, code, coding_system, display_text, status, onset_date, source_type, source_system, source_ref, recorded_by, recorded_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?)`)
      .run(recordId, input.patientId, input.code || null, input.codingSystem || null, input.displayText,
        input.onsetDate || null, source.type || "clinician", source.system || "ehr-local", source.ref || null,
        actor.displayName, at, at);
    const row = db.prepare(`SELECT * FROM patient_problems WHERE id = ?`).get(recordId) as any;
    stamp("problem", recordId, input.patientId, "create", row, actor, source); return row;
  },
  addMedication(input: { patientId: string; displayText: string; medicationName?: string; genericName?: string; strength?: string; dose?: string; route?: string; frequency?: string; startDate?: string; prescriber?: string }, actor: RecordActor, source: RecordSource = {}) {
    const db = getDatabase(); const recordId = id("med"); const at = now();
    db.prepare(`INSERT INTO patient_medications
      (id, patient_id, display_text, medication_name, generic_name, strength, dose, route, frequency, status,
       start_date, prescriber, source_type, source_system, source_ref, recorded_by, recorded_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(recordId, input.patientId, input.displayText, input.medicationName || input.displayText,
        input.genericName || null, input.strength || null, input.dose || null, input.route || null,
        input.frequency || null, input.startDate || null, input.prescriber || actor.displayName,
        source.type || "clinician", source.system || "ehr-local", source.ref || null, actor.displayName, at, at);
    const row = db.prepare(`SELECT * FROM patient_medications WHERE id = ?`).get(recordId) as any;
    stamp("medication", recordId, input.patientId, "create", row, actor, source); return row;
  },
  addObservation(input: { patientId: string; category: string; testName: string; code?: string; codingSystem?: string; effectiveAt?: string; valueText: string; valueNum?: number; unit?: string; referenceRange?: string; interpretation?: string; status?: string; orderId?: string; documentId?: string; observedBy?: string }, actor: RecordActor, source: RecordSource = {}) {
    const db = getDatabase(); const recordId = id("obs"); const at = now();
    db.prepare(`INSERT INTO observations
      (id, patient_id, category, code, coding_system, test_name, effective_at, value_text, value_num,
       unit, reference_range, interpretation, status, source_system, source_ref, order_id, document_id,
       observed_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(recordId, input.patientId, input.category, input.code || null, input.codingSystem || null,
        input.testName, input.effectiveAt || at, input.valueText, input.valueNum ?? null, input.unit || null,
        input.referenceRange || null, input.interpretation || null, input.status || "final",
        source.system || "ehr-local", source.ref || null, input.orderId || null, input.documentId || null,
        input.observedBy || actor.displayName, at, at);
    const row = db.prepare(`SELECT * FROM observations WHERE id = ?`).get(recordId) as any;
    stamp("observation", recordId, input.patientId, "create", row, actor, source); return row;
  },
  addInsurance(input: { patientId: string; payerName: string; planName?: string; memberId?: string; groupNumber?: string; subscriberName?: string; relationship?: string; effectiveDate?: string }, actor: RecordActor, source: RecordSource = {}) {
    const db = getDatabase(); const recordId = id("ins"); const at = now();
    db.prepare(`INSERT INTO insurance_policies
      (id, patient_id, payer_name, plan_name, member_id, group_number, subscriber_name, relationship,
       status, effective_date, source_system, source_ref, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)`)
      .run(recordId, input.patientId, input.payerName, input.planName || null, input.memberId || null,
        input.groupNumber || null, input.subscriberName || null, input.relationship || null,
        input.effectiveDate || null, source.system || "ehr-local", source.ref || null, at, at);
    const row = db.prepare(`SELECT * FROM insurance_policies WHERE id = ?`).get(recordId) as any;
    stamp("insurance", recordId, input.patientId, "create", row, actor, source); return row;
  },
  addPharmacy(input: { patientId: string; name: string; ncpdpId?: string; phone?: string; fax?: string; addressLine1?: string; city?: string; state?: string; postalCode?: string; priority?: number }, actor: RecordActor, source: RecordSource = {}) {
    const db = getDatabase(); const recordId = id("pharm"); const at = now();
    db.prepare(`INSERT INTO pharmacies
      (id, name, ncpdp_id, phone, fax, address_line1, city, state, postal_code, source_system, source_ref, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(recordId, input.name, input.ncpdpId || null, input.phone || null, input.fax || null,
        input.addressLine1 || null, input.city || null, input.state || null, input.postalCode || null,
        source.system || "ehr-local", source.ref || null, at, at);
    db.prepare(`INSERT INTO patient_pharmacies (patient_id, pharmacy_id, priority, status, created_at, updated_at)
      VALUES (?, ?, ?, 'active', ?, ?)`)
      .run(input.patientId, recordId, input.priority || 1, at, at);
    const row = db.prepare(`SELECT * FROM pharmacies WHERE id = ?`).get(recordId) as any;
    stamp("pharmacy", recordId, input.patientId, "create", row, actor, source); return row;
  },
  createDocument(input: { patientId: string; documentType: string; title: string; mimeType?: string; contentText?: string; storageKey?: string }, actor: RecordActor, source: RecordSource = {}) {
    const db = getDatabase(); const documentId = id("doc"); const versionId = id("docver"); const at = now();
    const contentHash = sha(input.contentText || input.storageKey || "");
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare(`INSERT INTO documents
        (id, patient_id, document_type, title, status, current_version, mime_type, storage_key, content_sha256,
         source_system, source_ref, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'active', 1, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(documentId, input.patientId, input.documentType, input.title, input.mimeType || "text/plain",
          input.storageKey || null, contentHash, source.system || "ehr-local", source.ref || null,
          actor.displayName, at, at);
      db.prepare(`INSERT INTO document_versions
        (id, document_id, version_number, storage_key, content_text, mime_type, content_sha256, created_by, created_at)
        VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?)`)
        .run(versionId, documentId, input.storageKey || null, input.contentText || null,
          input.mimeType || "text/plain", contentHash, actor.displayName, at);
      db.exec("COMMIT");
    } catch (e) { db.exec("ROLLBACK"); throw e; }
    const row = db.prepare(`SELECT * FROM documents WHERE id = ?`).get(documentId) as any;
    stamp("document", documentId, input.patientId, "create", row, actor, source); return row;
  },
  addDocumentVersion(documentId: string, input: { contentText?: string; storageKey?: string; mimeType?: string }, actor: RecordActor, source: RecordSource = {}) {
    const db = getDatabase(); const doc = db.prepare(`SELECT * FROM documents WHERE id = ?`).get(documentId) as any;
    if (!doc) throw new Error(`Document not found: ${documentId}`);
    const next = Number(doc.current_version) + 1; const at = now(); const contentHash = sha(input.contentText || input.storageKey || "");
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare(`INSERT INTO document_versions
        (id, document_id, version_number, storage_key, content_text, mime_type, content_sha256, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id("docver"), documentId, next, input.storageKey || null, input.contentText || null,
          input.mimeType || doc.mime_type, contentHash, actor.displayName, at);
      db.prepare(`UPDATE documents SET current_version = ?, storage_key = ?, mime_type = ?, content_sha256 = ?, updated_at = ? WHERE id = ?`)
        .run(next, input.storageKey || doc.storage_key, input.mimeType || doc.mime_type, contentHash, at, documentId);
      db.exec("COMMIT");
    } catch (e) { db.exec("ROLLBACK"); throw e; }
    const row = db.prepare(`SELECT * FROM documents WHERE id = ?`).get(documentId) as any;
    stamp("document", documentId, doc.patient_id, "revise", row, actor, source); return row;
  },
  acknowledgeResult(observationId: string, input: { disposition: string; note?: string }, actor: RecordActor) {
    const db = getDatabase(); const obs = db.prepare(`SELECT * FROM observations WHERE id = ?`).get(observationId) as any;
    if (!obs) throw new Error(`Observation not found: ${observationId}`);
    const existing = db.prepare(`SELECT id FROM result_acknowledgements WHERE observation_id = ?`).get(observationId);
    if (existing) throw new Error("Result has already been acknowledged.");
    const recordId = id("ack"); const at = now();
    db.prepare(`INSERT INTO result_acknowledgements
      (id, observation_id, patient_id, acknowledged_by, acknowledged_at, disposition, note)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(recordId, observationId, obs.patient_id, actor.displayName, at, input.disposition, input.note || null);
    const row = db.prepare(`SELECT * FROM result_acknowledgements WHERE id = ?`).get(recordId) as any;
    stamp("result_acknowledgement", recordId, obs.patient_id, "acknowledge", row, actor,
      { type:"clinician", system:"ehr-local", ref:`observations/${observationId}` }); return row;
  },
  addEncounterAddendum(encounterId: string, input: { body: string; reason?: string; addendumType?: "addendum" | "amendment" }, actor: RecordActor) {
    const db = getDatabase(); const enc = db.prepare(`SELECT id, patient_id, status FROM encounters WHERE id = ?`).get(encounterId) as any;
    if (!enc) throw new Error(`Encounter not found: ${encounterId}`);
    if (enc.status !== "signed") throw new Error("Addenda/amendments are only used for signed encounters; edit the draft instead.");
    const recordId = id("add"); const at = now();
    db.prepare(`INSERT INTO encounter_addenda
      (id, encounter_id, patient_id, addendum_type, body, reason, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(recordId, encounterId, enc.patient_id, input.addendumType || "addendum", input.body,
        input.reason || null, actor.displayName, at);
    const row = db.prepare(`SELECT * FROM encounter_addenda WHERE id = ?`).get(recordId) as any;
    stamp("encounter_addendum", recordId, enc.patient_id, "create", row, actor,
      { type:"clinician", system:"ehr-local", ref:`encounters/${encounterId}` }); return row;
  },
};
