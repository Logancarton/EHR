import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("message -> chart entry -> provenance -> immutable history -> AI context", async () => {
  const originalCwd = process.cwd();
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-message-charting-"));
  process.chdir(isolatedRoot);

  try {
    const [
      { ClinicalActionGateway },
      { ChartCommunicationRepository },
      { ClinicalRecordRepository },
      { ContextAssembler },
      { getDatabase },
    ] = await Promise.all([
      import("../app/server/actions/clinical-action-gateway"),
      import("../app/server/repositories/chart-communication-repository"),
      import("../app/server/repositories/clinical-record-repository"),
      import("../app/server/context/context-assembler"),
      import("../app/server/db/connection"),
    ]);

    const actor = {
      userId: "test-provider",
      displayName: "Test Provider",
      credentials: "PMHNP-BC",
      role: "provider" as const,
    };
    const context = { source: "api" as const, requestId: "test-message-charting" };

    const createPatient = async (id: string, mrn: string, name: string) =>
      ClinicalActionGateway.execute({
        actor,
        context,
        action: {
          type: "create_patient",
          payload: {
            id,
            name,
            initials: name.split(" ").map((part) => part[0]).join("").slice(0, 2),
            dob: "01/01/1990",
            age: 36,
            pronouns: "they/them",
            mrn,
            status: "Established",
            allergies: [],
            diagnoses: [],
            meds: [],
            vitals: {},
            lastVisit: "Initial",
            nextVisit: "Unscheduled",
          },
        },
      });

    const patientA = "test-message-chart-patient-a";
    const patientB = "test-message-chart-patient-b";
    const threadId = "test-message-chart-thread";
    const inboundMessageId = "test-message-chart-inbound";
    await createPatient(patientA, "TEST-MSG-A", "Patient Alpha");
    await createPatient(patientB, "TEST-MSG-B", "Patient Beta");

    const db = getDatabase();
    db.prepare(`
      INSERT INTO messages (
        id, patient_id, thread_id, subject, category, urgency, channel,
        sender_role, sender_name, content, ai_triage_summary, clinical_intent,
        suggested_actions_json, smart_replies_json, status, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', '[]', 'delivered', ?)
    `).run(
      inboundMessageId,
      patientA,
      threadId,
      "Medication question",
      "symptom-check",
      "routine",
      "portal",
      "patient",
      "Patient Alpha",
      "I have been more tired since the dose change. No safety concerns.",
      "Patient reports increased fatigue after a dose change without acute safety concerns.",
      "Medication tolerability update",
      "10:00 AM",
    );

    const single = await ClinicalActionGateway.execute({
      actor,
      context,
      expectedPatientId: patientA,
      action: {
        type: "save_message_to_chart",
        payload: {
          patientId: patientA,
          threadId,
          mode: "message",
          messageId: inboundMessageId,
        },
      },
    });

    assert.equal(single.communicationType, "message");
    assert.equal(single.patientId, patientA);
    assert.equal(single.sourceMessageId, inboundMessageId);
    assert.deepEqual(single.sourceMessageIds, [inboundMessageId]);
    assert.match(single.body, /more tired since the dose change/i);
    assert.equal(single.sourceRef, `messages/${inboundMessageId}`);

    const duplicate = await ClinicalActionGateway.execute({
      actor,
      context,
      expectedPatientId: patientA,
      action: {
        type: "save_message_to_chart",
        payload: {
          patientId: patientA,
          threadId,
          mode: "message",
          messageId: inboundMessageId,
        },
      },
    });
    assert.equal(duplicate.id, single.id, "saving the same message twice should be idempotent");

    const providerReply = await ClinicalActionGateway.execute({
      actor,
      context,
      expectedPatientId: patientA,
      action: {
        type: "send_message",
        payload: {
          patientId: patientA,
          threadId,
          content: "Thanks for the update. Please continue the current dose until we review it together.",
          channel: "portal",
        },
      },
    });

    const conversation = await ClinicalActionGateway.execute({
      actor,
      context,
      expectedPatientId: patientA,
      action: {
        type: "save_message_to_chart",
        payload: { patientId: patientA, threadId, mode: "conversation" },
      },
    });
    assert.equal(conversation.communicationType, "conversation");
    assert.deepEqual(conversation.sourceMessageIds, [inboundMessageId, providerReply.id]);
    assert.match(conversation.body, /Patient Alpha \(patient\)/);
    assert.match(conversation.body, /Test Provider, PMHNP-BC \(provider\)/);

    const summaryText =
      "Patient reported increased fatigue following a medication dose change and denied acute safety concerns. Provider advised continuing the current dose pending review.";
    const summary = await ClinicalActionGateway.execute({
      actor,
      context,
      expectedPatientId: patientA,
      action: {
        type: "save_message_to_chart",
        payload: {
          patientId: patientA,
          threadId,
          mode: "summary",
          summaryText,
        },
      },
    });
    assert.equal(summary.communicationType, "summary");
    assert.equal(summary.body, summaryText);
    assert.equal(summary.sourceRef, `messages/threads/${threadId}#clinical-summary`);

    const stored = ChartCommunicationRepository.listByPatient(patientA);
    assert.equal(stored.length, 3, "single message, conversation snapshot, and approved summary should all remain");

    const versions = ClinicalRecordRepository.versions("chart_communication", single.id);
    const provenance = ClinicalRecordRepository.provenance("chart_communication", single.id);
    assert.equal(versions.length, 1);
    assert.equal(versions[0].operation, "create");
    assert.equal(provenance.length, 1);
    assert.equal(provenance[0].source_ref, `messages/${inboundMessageId}`);
    assert.deepEqual(provenance[0].metadata.sourceMessageIds, [inboundMessageId]);

    assert.throws(
      () => db.prepare("UPDATE chart_communications SET body = ? WHERE id = ?").run("rewritten", single.id),
      /immutable/i,
      "charted communication content must not be rewritten",
    );
    assert.throws(
      () => db.prepare("DELETE FROM chart_communications WHERE id = ?").run(single.id),
      /immutable/i,
      "charted communication content must not be deleted",
    );

    await assert.rejects(
      ClinicalActionGateway.execute({
        actor,
        context,
        expectedPatientId: patientB,
        action: {
          type: "save_message_to_chart",
          payload: {
            patientId: patientA,
            threadId,
            mode: "message",
            messageId: inboundMessageId,
          },
        },
      }),
      /patient binding mismatch/i,
      "a stale Patient B chart must never save Patient A's message",
    );

    const aiContext = ContextAssembler.assemble({
      patientId: patientA,
      surface: "longitudinal-query",
      userRole: "provider",
    });
    assert.ok(aiContext);
    assert.ok(aiContext.chartedCommunications?.some((entry) => entry.id === single.id));
    assert.ok(aiContext.chartedCommunications?.some((entry) => entry.id === summary.id));
  } finally {
    process.chdir(originalCwd);
  }
});
