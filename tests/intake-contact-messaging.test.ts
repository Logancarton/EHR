import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

/**
 * Intake is first contact, so the practice can write to someone before they have
 * a chart. The thread is the intake contact's, reachable only by their practice,
 * recorded rather than claimed delivered, and it becomes the chart's conversation
 * when they are promoted — the same rows, not a copy.
 */
test("an intake contact can be messaged, and the conversation moves into the chart on promotion", async () => {
  const env = process.env as unknown as Record<string, string | undefined>;
  const originalCwd = process.cwd();
  const originalSecret = env.EHR_SESSION_SECRET;
  process.chdir(mkdtempSync(join(tmpdir(), "ehr-intake-messaging-")));
  env.EHR_SESSION_SECRET = "synthetic-intake-messaging-secret-0123456789";

  try {
    const [
      { grantSyntheticOrganizationAccess },
      { ClinicalActionGateway },
      { prospectivePersonService },
      { MessageRepository },
    ] = await Promise.all([
      import("./helpers/organization-access"),
      import("../app/server/actions/clinical-action-gateway"),
      import("../app/server/services/prospective-person-service"),
      import("../app/server/repositories/message-repository"),
    ]);

    const orgId = await grantSyntheticOrganizationAccess(["msg-staff", "msg-provider"], {
      role: "staff",
      patientAccessScope: "organization",
    });
    const staff = {
      userId: "msg-staff",
      displayName: "Front Desk",
      organizationId: orgId,
      role: "staff" as const,
      capabilities: ["edit_patient" as const, "manage_appointments" as const, "read_schedule" as const],
    };
    const provider = { userId: "msg-provider", displayName: "Test Provider", credentials: "PMHNP-BC", role: "provider" as const, organizationId: orgId };
    const context = { source: "api" as const };

    const prospect = prospectivePersonService.create(
      { name: "Intake Messagee", dob: "1992-02-02", mobilePhone: "555-555-0199", email: "messagee@example.test" },
      staff,
      context,
    );

    // 1. A thread for someone with no chart yet.
    const thread = (await ClinicalActionGateway.execute({
      actor: provider,
      context,
      expectedPatientId: prospect.id,
      action: {
        type: "create_message_thread",
        payload: { patientId: prospect.id, subject: "Your first visit", content: "Please bring your insurance card." },
      },
    })) as { id: string; messages: Array<{ status: string }> };
    assert.equal(thread.messages[0].status, "queued", "nothing is delivered without a transport");
    assert.equal(MessageRepository.getThreadsByPatient(prospect.id).length, 1);
    assert.equal(MessageRepository.threadSubject(thread.id), prospect.id);

    // 2. A reply lands in the same thread, owned by the same contact.
    await ClinicalActionGateway.execute({
      actor: provider,
      context,
      expectedPatientId: prospect.id,
      action: { type: "send_message", payload: { patientId: prospect.id, threadId: thread.id, content: "Arrive 15 minutes early." } },
    });
    assert.equal(MessageRepository.getThreadsByPatient(prospect.id)[0].messages.length, 2);

    // 3. Someone outside the practice cannot write to the contact.
    const outsider = { userId: "msg-outsider", displayName: "Other Practice", credentials: "MD", role: "provider" as const, organizationId: "org-elsewhere" };
    await assert.rejects(
      ClinicalActionGateway.execute({
        actor: outsider,
        context,
        expectedPatientId: prospect.id,
        action: { type: "create_message_thread", payload: { patientId: prospect.id, subject: "x", content: "y" } },
      }),
    );

    // 4. Promotion: the conversation is the chart's, on the same rows.
    const { patient } = prospectivePersonService.promote(staff, context, { prospectiveId: prospect.id, mode: "create" });
    const chartThreads = MessageRepository.getThreadsByPatient(patient.id);
    assert.equal(chartThreads.length, 1);
    assert.equal(chartThreads[0].id, thread.id);
    assert.equal(chartThreads[0].messages.length, 2);
    assert.equal(MessageRepository.threadSubject(thread.id), patient.id);

    // The old intake record can no longer be written to; the chart is where it goes.
    await assert.rejects(
      ClinicalActionGateway.execute({
        actor: provider,
        context,
        expectedPatientId: prospect.id,
        action: { type: "create_message_thread", payload: { patientId: prospect.id, subject: "Late", content: "After promotion." } },
      }),
      /has a chart now/,
    );

    // 5. A reply naming a different subject than the thread's owner is refused.
    const other = prospectivePersonService.create(
      { name: "Someone Else", dob: "1980-01-01", mobilePhone: "555-555-0100", email: "else@example.test" },
      staff,
      context,
    );
    await assert.rejects(
      ClinicalActionGateway.execute({
        actor: provider,
        context,
        expectedPatientId: other.id,
        action: { type: "send_message", payload: { patientId: other.id, threadId: thread.id, content: "Wrong thread." } },
      }),
      /binding/i,
    );
    assert.equal(MessageRepository.getThreadsByPatient(patient.id)[0].messages.length, 2, "nothing was written");
  } finally {
    process.chdir(originalCwd);
    env.EHR_SESSION_SECRET = originalSecret;
  }
});

test("the migration relaxes an old messages table and stops calling practice messages delivered", async () => {
  const { migration } = await import("../app/server/db/migrations/2026-09-29-001-message-prospective-identity");
  const db = new DatabaseSync(":memory:");
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE patients (id TEXT PRIMARY KEY);
    CREATE TABLE prospective_persons (id TEXT PRIMARY KEY);
    CREATE TABLE messages (
      id TEXT PRIMARY KEY, patient_id TEXT NOT NULL, thread_id TEXT NOT NULL, subject TEXT NOT NULL,
      category TEXT NOT NULL, urgency TEXT NOT NULL, channel TEXT NOT NULL, sender_role TEXT NOT NULL,
      sender_name TEXT NOT NULL, content TEXT NOT NULL, ai_triage_summary TEXT, clinical_intent TEXT,
      suggested_actions_json TEXT NOT NULL DEFAULT '[]', smart_replies_json TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'delivered', timestamp TEXT NOT NULL, created_at TEXT,
      FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE
    );
    INSERT INTO patients (id) VALUES ('p1');
    INSERT INTO messages (id, patient_id, thread_id, subject, category, urgency, channel, sender_role, sender_name, content, status, timestamp)
      VALUES ('m1', 'p1', 't1', 's', 'general', 'routine', 'portal', 'patient', 'Pat', 'hi', 'delivered', '9:00'),
             ('m2', 'p1', 't1', 's', 'general', 'routine', 'portal', 'provider', 'Doc', 'hello', 'delivered', '9:05');
  `);

  migration.apply(db);
  migration.apply(db); // idempotent

  const columns = db.prepare("PRAGMA table_info(messages)").all() as Array<{ name: string; notnull: number }>;
  assert.equal(columns.find((c) => c.name === "patient_id")?.notnull, 0);
  assert.ok(columns.some((c) => c.name === "prospective_person_id"));
  const statuses = db.prepare("SELECT id, status FROM messages ORDER BY id").all() as Array<{ id: string; status: string }>;
  assert.deepEqual(statuses.map((r) => `${r.id}:${r.status}`), ["m1:delivered", "m2:queued"]);
  assert.throws(
    () => db.prepare(`INSERT INTO messages (id, thread_id, subject, category, urgency, channel, sender_role, sender_name, content, timestamp) VALUES ('m3','t2','s','g','r','portal','provider','Doc','x','9:10')`).run(),
    /CHECK/,
    "every message names a chart or an intake contact",
  );
});
