import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { grantSyntheticOrganizationAccess } from "./helpers/organization-access";
import {
  WORKSPACE_SELECT_MESSAGE_THREAD_EVENT,
  isSelectMessageThreadDetail,
} from "../app/lib/workspace-events";

test("operational queues: message thread creation, gateway authority, and thread navigation events", async () => {
  const originalCwd = process.cwd();
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-op-queues-"));
  process.chdir(isolatedRoot);

  try {
    const [
      { ClinicalActionGateway },
      { MessageRepository },
      { AuditRepository },
      { getDatabase },
    ] = await Promise.all([
      import("../app/server/actions/clinical-action-gateway"),
      import("../app/server/repositories/message-repository"),
      import("../app/server/repositories/audit-repository"),
      import("../app/server/db/connection"),
    ]);

    await grantSyntheticOrganizationAccess(["test-provider"]);

    const actor = {
      userId: "test-provider",
      displayName: "Dr. Logan Carton, MD",
      credentials: "MD",
      role: "provider" as const,
    };
    const context = { source: "api" as const, requestId: "test-op-queues" };

    // 1. Create test patient
    await ClinicalActionGateway.execute({
      actor,
      context,
      action: {
        type: "create_patient",
        payload: {
          id: "pt-op-1",
          name: "Test Ops Patient",
          initials: "TP",
          dob: "05/10/1988",
          age: 38,
          pronouns: "she/her",
          mrn: "MRN-OP-001",
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

    // 2. Verify patient boundary protection: mismatched expectedPatientId must be rejected
    await assert.rejects(
      async () => {
        await ClinicalActionGateway.execute({
          actor,
          context,
          expectedPatientId: "pt-wrong",
          action: {
            type: "create_message_thread",
            payload: {
              patientId: "pt-op-1",
              subject: "Titration Side Effect Follow-up",
              category: "symptom-check",
              urgency: "urgent",
              channel: "portal",
              content: "Patient reported mild nausea after dose increase.",
            },
          },
        });
      },
      /patient binding/i,
      "Executing create_message_thread with mismatched expectedPatientId must be blocked",
    );

    // 3. Execute create_message_thread with matching expectedPatientId
    const threadResult = await ClinicalActionGateway.execute({
      actor,
      context,
      expectedPatientId: "pt-op-1",
      action: {
        type: "create_message_thread",
        payload: {
          patientId: "pt-op-1",
          subject: "Titration Side Effect Follow-up",
          category: "symptom-check",
          urgency: "urgent",
          channel: "portal",
          content: "Patient reported mild nausea after dose increase.",
        },
      },
    });

    const createdThread = threadResult;
    assert.ok(createdThread);
    assert.equal(createdThread.subject, "Titration Side Effect Follow-up");
    assert.equal(createdThread.category, "symptom-check");
    assert.equal(createdThread.urgency, "urgent");
    assert.equal(createdThread.messages.length, 1);
    assert.equal(createdThread.messages[0].content, "Patient reported mild nausea after dose increase.");

    // 3. Verify audit log entry was created for message_thread_created
    const auditLogs = AuditRepository.getRecent(10, "pt-op-1");
    const threadAudit = auditLogs.find((l) => l.eventType === "message_thread_created");
    assert.ok(threadAudit, "Audit log must contain message_thread_created entry");
    assert.equal(threadAudit?.userId, "test-provider");

    // 4. Verify MessageRepository.getAllThreads() returns practice-wide threads with joined patient name and MRN
    const allThreads = MessageRepository.getAllThreads();
    const found = allThreads.find((t) => t.thread.id === createdThread.id);
    assert.ok(found, "getAllThreads must return the newly created thread");
    assert.equal(found?.patientName, "Test Ops Patient");
    assert.equal(found?.patientMrn, "MRN-OP-001");
    assert.equal(found?.patientId, "pt-op-1");

    // 5. Verify patientId filter in getAllThreads()
    const filteredSelf = MessageRepository.getAllThreads(["pt-op-1"]);
    assert.ok(filteredSelf.some((t) => t.thread.id === createdThread.id));
    const filteredOther = MessageRepository.getAllThreads(["pt-other"]);
    assert.equal(filteredOther.length, 0);

    // 6. Verify WORKSPACE_SELECT_MESSAGE_THREAD_EVENT detail guard
    assert.equal(
      isSelectMessageThreadDetail({
        patientId: "pt-op-1",
        threadId: createdThread.id,
        threadSubject: "Titration Side Effect Follow-up",
      }),
      true,
    );
    assert.equal(
      isSelectMessageThreadDetail({
        patientId: "pt-op-1",
      }),
      true,
    );
    assert.equal(
      isSelectMessageThreadDetail({
        threadId: createdThread.id,
      }),
      false,
      "Detail missing patientId must be rejected",
    );
    assert.equal(
      isSelectMessageThreadDetail(null),
      false,
    );
  } finally {
    process.chdir(originalCwd);
  }
});

test("messages API route: practice-wide listing and new thread creation via HTTP requests", async () => {
  const originalCwd = process.cwd();
  const env = process.env as unknown as Record<string, string | undefined>;
  const originalNodeEnv = env.NODE_ENV;
  const originalSecret = env.EHR_SESSION_SECRET;
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-messages-route-"));

  process.chdir(isolatedRoot);
  env.NODE_ENV = "test";
  env.EHR_SESSION_SECRET = "synthetic-messages-route-secret-9876543210";

  try {
    const [
      { GET, POST },
      { POST: loginPost },
      { ClinicalActionGateway },
    ] = await Promise.all([
      import("../app/api/messages/route"),
      import("../app/api/auth/login/route"),
      import("../app/server/actions/clinical-action-gateway"),
    ]);

    await grantSyntheticOrganizationAccess(["team-taylor"]);

    const sessionFor = async (userId: string) => {
      const response = await loginPost(new Request("http://ehr.local/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId }),
      }));
      assert.equal(response.status, 200, `login should succeed for ${userId}`);
      return response.headers.get("set-cookie")!.split(";", 1)[0];
    };
    const cookie = await sessionFor("team-taylor");

    const actor = { userId: "team-taylor", displayName: "Taylor", role: "provider" as const };
    const context = { source: "api" as const, requestId: "messages-route-test" };

    // Create synthetic patient
    await ClinicalActionGateway.execute({
      actor,
      context,
      action: {
        type: "create_patient",
        payload: {
          id: "pt-route-1",
          name: "Route Test Patient",
          initials: "RP",
          dob: "03/15/1992",
          age: 34,
          pronouns: "he/him",
          mrn: "MRN-RP-001",
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

    // 1. Create a new thread via POST /api/messages
    const createRes = await POST(new Request("http://ehr.local/api/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie,
        "x-ehr-patient-id": "pt-route-1",
      },
      body: JSON.stringify({
        isNewThread: true,
        patientId: "pt-route-1",
        subject: "Medication Refill Request - Wellbutrin",
        category: "refill",
        urgency: "routine",
        channel: "portal",
        content: "Patient requesting standard 30-day refill of Wellbutrin XL 150mg.",
      }),
    }));

    assert.equal(createRes.status, 201, "POST new thread should return 201 Created");
    const createJson = (await createRes.json()) as { success: boolean; thread: { id: string; subject: string; category: string } };
    assert.equal(createJson.success, true);
    assert.equal(createJson.thread.subject, "Medication Refill Request - Wellbutrin");
    assert.equal(createJson.thread.category, "refill");

    // 2. Query practice-wide threads via GET /api/messages (without patientId)
    const listAllRes = await GET(new Request("http://ehr.local/api/messages", {
      method: "GET",
      headers: { cookie },
    }));

    assert.equal(listAllRes.status, 200, "GET practice-wide threads should return 200");
    const listAllJson = (await listAllRes.json()) as {
      success: boolean;
      threads: Array<{ patientId: string; patientName: string; patientMrn: string; thread: { id: string; subject: string } }>;
    };
    assert.equal(listAllJson.success, true);
    assert.ok(Array.isArray(listAllJson.threads));
    const matchingThread = listAllJson.threads.find((t) => t.thread.id === createJson.thread.id);
    assert.ok(matchingThread, "Practice-wide list must include the created thread");
    assert.equal(matchingThread?.patientName, "Route Test Patient");
    assert.equal(matchingThread?.patientMrn, "MRN-RP-001");

    // 3. Query patient-scoped threads via GET /api/messages?patientId=pt-route-1
    const listPatientRes = await GET(new Request("http://ehr.local/api/messages?patientId=pt-route-1", {
      method: "GET",
      headers: {
        cookie,
        "x-ehr-patient-id": "pt-route-1",
      },
    }));

    assert.equal(listPatientRes.status, 200, "GET patient threads should return 200");
    const listPatientJson = (await listPatientRes.json()) as {
      success: boolean;
      threads: Array<{ id: string; subject: string }>;
    };
    assert.equal(listPatientJson.success, true);
    assert.ok(listPatientJson.threads.some((t) => t.id === createJson.thread.id));
  } finally {
    process.chdir(originalCwd);
    env.NODE_ENV = originalNodeEnv;
    env.EHR_SESSION_SECRET = originalSecret;
  }
});
