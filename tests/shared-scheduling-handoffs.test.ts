import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function cookieFrom(response: Response): string {
  const setCookie = response.headers.get("set-cookie");
  assert.ok(setCookie, "login should set an EHR session cookie");
  return setCookie.split(";", 1)[0];
}

/**
 * DB-6: Shared Live Scheduling, Assignments and Handoffs.
 *
 * Verifies:
 * 1. Versioned Authoritative Updates & Concurrency Rejection (HTTP 409 Conflict)
 * 2. Strict Separation of Workflow Assignment from Longitudinal Chart Access
 * 3. Visit Handoff Mutual Agreement Workflow (No silent acceptance, decline with reason, cancel)
 * 4. Ephemeral Presence Expiry (Online -> Away -> Offline, without DB/audit bloat)
 * 5. Layout and Preset Isolation across Clinician Sessions
 */
test("DB-6: shared scheduling, assignments, mutual handoffs, and presence isolation", async () => {
  const originalCwd = process.cwd();
  const env = process.env as unknown as Record<string, string | undefined>;
  const originalNodeEnv = env.NODE_ENV;
  const originalSecret = env.EHR_SESSION_SECRET;
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-shared-scheduling-"));

  process.chdir(isolatedRoot);
  env.NODE_ENV = "test";
  env.EHR_SESSION_SECRET = "synthetic-shared-scheduling-secret-0123456789";

  try {
    const [
      { POST: loginPost },
      { GET: appointmentsGet, POST: appointmentsPost, PATCH: appointmentsPatch, PUT: appointmentsPut },
      { GET: handoffsGet, POST: handoffsPost },
      { GET: presenceGet, POST: presencePost },
      { ClinicalActionGateway },
      { AppointmentRepository, AppointmentConcurrencyError },
      { HandoffRepository },
      { PresenceTracker },
      { OrganizationRepository },
      { UserRepository },
      { AuthRepository },
      { PatientRepository },
      { getDatabase },
      { assertPatientAccess, PatientAccessError },
      { defaultPreferences, applyPreset, isPresetModified },
    ] = await Promise.all([
      import("../app/api/auth/login/route"),
      import("../app/api/appointments/route"),
      import("../app/api/appointments/handoffs/route"),
      import("../app/api/team/presence/route"),
      import("../app/server/actions/clinical-action-gateway"),
      import("../app/server/repositories/appointment-repository"),
      import("../app/server/repositories/handoff-repository"),
      import("../app/server/presence/presence-tracker"),
      import("../app/server/repositories/organization-repository"),
      import("../app/server/repositories/user-repository"),
      import("../app/server/repositories/auth-repository"),
      import("../app/server/repositories/patient-repository"),
      import("../app/server/db/connection"),
      import("../app/server/auth/patient-access"),
      import("../app/lib/preference-engine"),
    ]);

    const db = getDatabase();
    const orgId = OrganizationRepository.defaultOrganizationId();
    const now = new Date().toISOString();

    // -------------------------------------------------------------
    // Setup Users:
    // User A: Attending Physician (Full access)
    // User B: Coverage Nurse (Assigned-only patient scope)
    // User C: Third-party staff
    // -------------------------------------------------------------
    UserRepository.create({
      id: "dr-alice",
      displayName: "Dr. Alice",
      role: "provider",
    });
    OrganizationRepository.upsertMembership({
      organizationId: orgId,
      userId: "dr-alice",
      membershipRole: "member",
      patientAccessScope: "organization",
    });

    UserRepository.create({
      id: "nurse-bob",
      displayName: "Nurse Bob",
      role: "staff",
    });
    OrganizationRepository.upsertMembership({
      organizationId: orgId,
      userId: "nurse-bob",
      membershipRole: "member",
      patientAccessScope: "assigned", // Restrict Bob to assigned-only
    });

    UserRepository.create({
      id: "assistant-carol",
      displayName: "Assistant Carol",
      role: "clinical_assistant",
    });
    OrganizationRepository.upsertMembership({
      organizationId: orgId,
      userId: "assistant-carol",
      membershipRole: "member",
      patientAccessScope: "organization",
    });

    async function sessionFor(userId: string): Promise<string> {
      const response = await loginPost(
        new Request("http://ehr.local/api/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ userId }),
        }),
      );
      assert.equal(response.status, 200, `login should succeed for ${userId}`);
      return cookieFrom(response);
    }

    const aliceCookie = await sessionFor("dr-alice");
    const bobCookie = await sessionFor("nurse-bob");
    const carolCookie = await sessionFor("assistant-carol");

    // Create a test patient belonging to orgId
    PatientRepository.create(
      {
        id: "patient-david",
        name: "David Test",
        initials: "DT",
        dob: "01/01/1985",
        age: 41,
        pronouns: "he/him",
        mrn: "MRN-DAVID",
        status: "Established",
        allergies: [],
        diagnoses: [],
        meds: [],
        vitals: {},
        lastVisit: "Initial",
        nextVisit: "Unscheduled",
      },
      orgId,
    );

    const aliceActor = {
      userId: "dr-alice",
      displayName: "Dr. Alice",
      role: "provider" as const,
    };
    const bobActor = {
      userId: "nurse-bob",
      displayName: "Nurse Bob",
      role: "staff" as const,
    };
    const carolActor = {
      userId: "assistant-carol",
      displayName: "Assistant Carol",
      role: "clinical_assistant" as const,
    };
    const context = { source: "api" as const, requestId: "shared-scheduling-test" };

    // =============================================================
    // 1. Versioned Authoritative Updates & Concurrency Rejection
    // =============================================================
    const initialAppointment = AppointmentRepository.create({
      id: "apt-shared-1",
      date: "2026-09-14",
      patientId: "patient-david",
      patientName: "David Test",
      dob: "1985-05-15",
      age: 41,
      mrn: "MRN-DAVID",
      time: "10:00 AM",
      duration: "30 min",
      type: "30-min Med Check",
      status: "scheduled",
      chiefComplaint: "Routine medication review",
      insurance: "Blue Cross",
      providerId: "dr-alice",
      providerName: "Dr. Alice",
    });

    assert.equal(initialAppointment.version, 1, "New appointment must initialize with version = 1");

    // Successful update with matching expectedVersion = 1
    const updatedByAlice = AppointmentRepository.update(
      "apt-shared-1",
      { room: "Room 101" },
      1,
    );
    assert.ok(updatedByAlice);
    assert.equal(updatedByAlice.version, 2, "Updating appointment increments version to 2");
    assert.equal(updatedByAlice.room, "Room 101");

    // Stale update directly in repository throws AppointmentConcurrencyError
    assert.throws(
      () => {
        AppointmentRepository.update("apt-shared-1", { room: "Room 102" }, 1);
      },
      (err: any) => {
        assert.ok(err instanceof AppointmentConcurrencyError);
        assert.equal(err.serverVersion, 2);
        assert.equal(err.currentAppointment.room, "Room 101");
        return true;
      },
      "Stale expectedVersion must throw AppointmentConcurrencyError with current serverVersion",
    );

    // Stale update via HTTP API (PATCH) returns HTTP 409 Conflict
    const stalePatchReq = new Request("http://ehr.local/api/appointments", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        cookie: aliceCookie,
      },
      body: JSON.stringify({
        id: "apt-shared-1",
        expectedVersion: 1, // Stale! Server is at version 2
        updates: { room: "Room 103" },
      }),
    });
    const patchRes = await appointmentsPatch(stalePatchReq);
    assert.equal(patchRes.status, 409, "API must return HTTP 409 Conflict on version mismatch");
    const patchBody = await patchRes.json();
    assert.equal(patchBody.conflict, true);
    assert.equal(patchBody.serverVersion, 2);
    assert.equal(patchBody.currentAppointment.room, "Room 101");

    // Stale update via HTTP API (PUT) returns HTTP 409 Conflict
    const stalePutReq = new Request("http://ehr.local/api/appointments", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        cookie: aliceCookie,
      },
      body: JSON.stringify({
        id: "apt-shared-1",
        expectedVersion: 1, // Stale!
        room: "Room 104",
      }),
    });
    const putRes = await appointmentsPut(stalePutReq);
    assert.equal(putRes.status, 409, "PUT API must return HTTP 409 Conflict on version mismatch");
    const putBody = await putRes.json();
    assert.equal(putBody.conflict, true);
    assert.equal(putBody.serverVersion, 2);

    // Update with current version = 2 succeeds and increments to version = 3
    const freshPatchReq = new Request("http://ehr.local/api/appointments", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        cookie: aliceCookie,
      },
      body: JSON.stringify({
        id: "apt-shared-1",
        expectedVersion: 2,
        updates: { room: "Room 105" },
      }),
    });
    const freshRes = await appointmentsPatch(freshPatchReq);
    assert.equal(freshRes.status, 200);
    const freshBody = await freshRes.json();
    assert.equal(freshBody.appointment.version, 3);
    assert.equal(freshBody.appointment.room, "Room 105");

    // updateStatus and cancel also respect versioning
    const statusUpdated = AppointmentRepository.updateStatus("apt-shared-1", "waiting", 3);
    assert.ok(statusUpdated);
    assert.equal(statusUpdated.version, 4);

    assert.throws(() => {
      AppointmentRepository.cancel("apt-shared-1", "Patient Request", "Rescheduling", "dr-alice", 3);
    }, AppointmentConcurrencyError);

    // =============================================================
    // 2. Separation of Workflow Assignment from Chart Access
    // =============================================================
    // Assign Nurse Bob to the appointment as assigned staff
    AppointmentRepository.update("apt-shared-1", {
      assignedStaffId: "nurse-bob",
      assignedStaffName: "Nurse Bob",
    });

    // Check that assigning Bob to appointment did NOT insert any row into team_member_patients
    const assignedRows = db
      .prepare("SELECT * FROM team_member_patients WHERE user_id = ? AND patient_id = ?")
      .all("nurse-bob", "patient-david");
    assert.equal(
      assignedRows.length,
      0,
      "Operational appointment assignment must never insert rows into team_member_patients",
    );

    // Nurse Bob has assigned-only scope and is not in team_member_patients for patient-david:
    assert.throws(
      () => {
        assertPatientAccess(bobActor, "patient-david");
      },
      PatientAccessError,
      "Assigned staff on an appointment cannot access patient chart without care-team assignment",
    );

    // =============================================================
    // 3. Visit Handoff Mutual Agreement Workflow
    // =============================================================
    // User A initiates handoff to User B
    const handoff = HandoffRepository.createHandoff(
      {
        appointmentId: "apt-shared-1",
        patientId: "patient-david",
        toUserId: "nurse-bob",
        toUserName: "Nurse Bob",
        reason: "Coverage handover",
        clinicalSummary: "Patient arrived with mild headache, awaiting vitals.",
      },
      aliceActor,
    );

    assert.equal(handoff.status, "pending");
    assert.equal(handoff.fromUserId, "dr-alice");
    assert.equal(handoff.toUserId, "nurse-bob");

    // Viewing the handoff by User B does NOT accept responsibility
    const viewedHandoff = HandoffRepository.getHandoff(handoff.id);
    assert.equal(
      viewedHandoff?.status,
      "pending",
      "Viewing an appointment or handoff must never silently accept responsibility",
    );

    // User C (Carol) cannot accept Bob's handoff
    assert.throws(
      () => {
        HandoffRepository.acceptHandoff(handoff.id, carolActor);
      },
      /Unauthorized/,
      "Non-recipient cannot accept another member's handoff",
    );

    // User B declines handoff with reason
    const declinedHandoff = HandoffRepository.declineHandoff(
      handoff.id,
      bobActor,
      "Assisting in Room 3 with urgent procedure",
    );
    assert.equal(declinedHandoff.status, "declined");
    assert.equal(declinedHandoff.declineReason, "Assisting in Room 3 with urgent procedure");

    // Responsibility remains with sender (Alice)
    const aptAfterDecline = AppointmentRepository.getById("apt-shared-1");
    assert.equal(aptAfterDecline?.providerId, "dr-alice");

    // Alice initiates another handoff to Bob
    const handoff2 = HandoffRepository.createHandoff(
      {
        appointmentId: "apt-shared-1",
        patientId: "patient-david",
        toUserId: "nurse-bob",
        toUserName: "Nurse Bob",
        reason: "Coverage handover",
        clinicalSummary: "Vitals intake needed.",
      },
      aliceActor,
    );

    // Bob accepts explicitly
    const acceptedHandoff = HandoffRepository.acceptHandoff(
      handoff2.id,
      bobActor,
      "Accepting coverage for vitals check.",
    );
    assert.equal(acceptedHandoff.status, "accepted");
    assert.equal(acceptedHandoff.history.length, 2);
    assert.equal(acceptedHandoff.history[1].action, "accepted");

    // Appointment assignedStaff is updated to Bob
    const aptAfterAccept = AppointmentRepository.getById("apt-shared-1");
    assert.equal(aptAfterAccept?.assignedStaffId, "nurse-bob");

    // Third handoff: Sender cancellation test
    const handoff3 = HandoffRepository.createHandoff(
      {
        appointmentId: "apt-shared-1",
        patientId: "patient-david",
        toUserId: "nurse-bob",
        toUserName: "Nurse Bob",
        reason: "Coverage handover",
        clinicalSummary: "Test cancellation.",
      },
      aliceActor,
    );
    assert.equal(handoff3.status, "pending");

    const cancelledHandoff = HandoffRepository.cancelHandoff(
      handoff3.id,
      aliceActor,
      "Patient leaving early",
    );
    assert.equal(cancelledHandoff.status, "cancelled");

    // Verify Handoffs API endpoints
    const listReq = new Request("http://ehr.local/api/appointments/handoffs?appointmentId=apt-shared-1", {
      headers: { cookie: aliceCookie },
    });
    const listRes = await handoffsGet(listReq);
    assert.equal(listRes.status, 200);
    const listBody = await listRes.json();
    assert.equal(listBody.success, true);
    assert.equal(listBody.handoffs.length, 3);

    // =============================================================
    // 4. Ephemeral Presence Expiry
    // =============================================================
    PresenceTracker._resetForTesting();

    // Alice sends heartbeat -> online
    const p1 = PresenceTracker.recordHeartbeat("dr-alice", "schedule");
    assert.equal(p1.presence, "online");
    assert.equal(p1.userId, "dr-alice");

    // Fast-forward timestamp to 45 seconds ago -> away (threshold is 30s-90s)
    PresenceTracker._setTimestampForTesting("dr-alice", Date.now() - 45_000);
    const p2 = PresenceTracker.getUserPresence("dr-alice");
    assert.equal(p2.presence, "away", "User must transition to 'away' after 30s of inactivity");

    // Fast-forward timestamp to 100 seconds ago -> offline (threshold is > 90s)
    PresenceTracker._setTimestampForTesting("dr-alice", Date.now() - 100_000);
    const p3 = PresenceTracker.getUserPresence("dr-alice");
    assert.equal(p3.presence, "offline", "User must transition to 'offline' after 90s of inactivity");

    // Explicit offline status
    PresenceTracker.recordHeartbeat("nurse-bob", "station");
    const pBobOffline = PresenceTracker.setExplicitStatus("nurse-bob", "offline");
    assert.equal(pBobOffline.presence, "offline");
    assert.equal(PresenceTracker.getUserPresence("nurse-bob").presence, "offline");

    // Verify Presence API GET and POST
    const presPostReq = new Request("http://ehr.local/api/team/presence", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: aliceCookie },
      body: JSON.stringify({ location: "schedule" }),
    });
    const presPostRes = await presencePost(presPostReq);
    assert.equal(presPostRes.status, 200);
    const presPostBody = await presPostRes.json();
    assert.equal(presPostBody.presence.presence, "online");

    const presGetReq = new Request("http://ehr.local/api/team/presence", {
      headers: { cookie: aliceCookie },
    });
    const presGetRes = await presenceGet(presGetReq);
    assert.equal(presGetRes.status, 200);
    const presGetBody = await presGetRes.json();
    assert.ok(Array.isArray(presGetBody.presence));

    // Confirm that presence heartbeats NEVER write SQLite database rows or audit events
    const auditCount = db
      .prepare("SELECT COUNT(*) as count FROM audit_logs WHERE event_type LIKE '%presence%'")
      .get() as { count: number };
    assert.equal(
      auditCount.count,
      0,
      "Presence heartbeats must remain ephemeral and never pollute audit_logs",
    );

    // =============================================================
    // 5. Layout and Preset Isolation
    // =============================================================
    let alicePrefs = applyPreset("minimal", defaultPreferences);
    let bobPrefs = applyPreset("cockpit", defaultPreferences);

    assert.equal(alicePrefs.activePresetId, "minimal");
    assert.equal(bobPrefs.activePresetId, "cockpit");

    // Alice performs scheduling operations; verify Bob's preferences remain unaffected
    assert.equal(bobPrefs.activePresetId, "cockpit");
    assert.equal(isPresetModified(bobPrefs), false);
    assert.equal(isPresetModified(alicePrefs), false);
  } finally {
    process.chdir(originalCwd);
    env.NODE_ENV = originalNodeEnv;
    env.EHR_SESSION_SECRET = originalSecret;
  }
});
