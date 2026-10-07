import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { grantSyntheticOrganizationAccess } from "./helpers/organization-access";

/**
 * D-127: a patient message carries chart records by reference. Every reference
 * is checked against the message's own patient before anything is written, an
 * unsigned note never leaves the practice, and what a message carried is listed
 * when the conversation is charted.
 */
test("message attachments are this patient's signed records, checked before the message is written", async () => {
  const originalCwd = process.cwd();
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-message-attachments-"));
  process.chdir(isolatedRoot);

  try {
    const [{ ClinicalActionGateway }, { getDatabase }, { MessageRepository }] = await Promise.all([
      import("../app/server/actions/clinical-action-gateway"),
      import("../app/server/db/connection"),
      import("../app/server/repositories/message-repository"),
    ]);
    await grantSyntheticOrganizationAccess(["test-provider"]);
    const actor = { userId: "test-provider", displayName: "Test Provider", credentials: "PMHNP-BC", role: "provider" as const };
    const context = { source: "api" as const, requestId: "test-message-attachments" };
    const run = (action: any, expectedPatientId?: string) =>
      ClinicalActionGateway.execute({ actor, context, expectedPatientId, action });

    for (const [id, mrn, name] of [["att-a", "ATT-A-1", "Attach Alpha"], ["att-b", "ATT-B-1", "Attach Beta"]] as const) {
      await run({
        type: "create_patient",
        payload: {
          id, name, initials: "AA", dob: "01/01/1990", age: 36, pronouns: "they/them", mrn, status: "Established",
          allergies: [], diagnoses: [], meds: [], vitals: {}, lastVisit: "Initial", nextVisit: "Unscheduled",
        },
      });
    }

    const docA = await run({ type: "create_document", payload: { patientId: "att-a", documentType: "consult_note", title: "Synthetic consult", mimeType: "text/plain", contentText: "Synthetic" } }, "att-a");
    const docB = await run({ type: "create_document", payload: { patientId: "att-b", documentType: "consult_note", title: "Other chart", mimeType: "text/plain", contentText: "Synthetic" } }, "att-b");

    const db = getDatabase();
    const at = new Date().toISOString();
    db.prepare(`INSERT INTO encounters (id, patient_id, date, type, status, signed_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run("enc-signed", "att-a", "2026-09-01", "Follow-up", "signed", "Test Provider", at, at);
    db.prepare(`INSERT INTO encounters (id, patient_id, date, type, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run("enc-draft", "att-a", "2026-10-01", "Follow-up", "draft", at, at);
    db.prepare(`INSERT INTO clinical_assessments (id, patient_id, instrument, title, total_score, max_score, severity, responses_json, administered_by, administered_at, created_at, updated_at)
      VALUES (?, ?, 'phq-9', 'PHQ-9', 6, 27, 'Mild', '{}', 'Test Provider', ?, ?, ?)`)
      .run("asmt-a", "att-a", at, at, at);

    const thread = await run({
      type: "create_message_thread",
      payload: {
        patientId: "att-a", subject: "Your records", content: "Attached as discussed.",
        attachments: [{ kind: "document", recordId: docA.id }, { kind: "encounter", recordId: "enc-signed" }],
      },
    }, "att-a");
    assert.deepEqual(
      thread.messages[0].attachments.map((item: any) => [item.kind, item.recordId, item.title]),
      [["document", docA.id, "Synthetic consult"], ["encounter", "enc-signed", "Follow-up note"]],
      "titles come from the record, not the request",
    );

    const before = MessageRepository.getThreadsByPatient("att-a")[0].messages.length;
    await assert.rejects(
      run({ type: "send_message", payload: { patientId: "att-a", threadId: thread.id, content: "x", attachments: [{ kind: "document", recordId: docB.id }] } }, "att-a"),
      /not part of this patient's chart/,
      "another patient's document is refused",
    );
    await assert.rejects(
      run({ type: "send_message", payload: { patientId: "att-a", threadId: thread.id, content: "x", attachments: [{ kind: "encounter", recordId: "enc-draft" }] } }, "att-a"),
      /Only a signed note/,
      "an unsigned draft never leaves the practice",
    );
    await assert.rejects(
      run({ type: "send_message", payload: { patientId: "att-a", threadId: thread.id, content: "x", attachments: [{ kind: "spreadsheet", recordId: "x" }] } }, "att-a"),
      /kind and a record id/,
    );
    assert.equal(
      MessageRepository.getThreadsByPatient("att-a")[0].messages.length,
      before,
      "a refused attachment writes no message",
    );

    const reply = await run({
      type: "send_message",
      payload: { patientId: "att-a", threadId: thread.id, content: "And your PHQ-9.", attachments: [{ kind: "assessment", recordId: "asmt-a" }] },
    }, "att-a");
    assert.equal(reply.attachments[0].title, "PHQ-9");
    const listed = MessageRepository.getThreadsByPatient("att-a")[0].messages;
    assert.deepEqual(listed.map((message) => (message.attachments ?? []).length), [2, 1]);

    const charted = await run({ type: "save_message_to_chart", payload: { patientId: "att-a", threadId: thread.id, mode: "conversation" } }, "att-a");
    assert.match(charted.body, /Attached document: Synthetic consult/);
    assert.match(charted.body, /Attached assessment: PHQ-9/);
  } finally {
    process.chdir(originalCwd);
  }
});
