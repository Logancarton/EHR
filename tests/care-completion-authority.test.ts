import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assignSyntheticPatients,
  grantSyntheticOrganizationAccess,
} from "./helpers/organization-access";

/**
 * DB-10 — the authority boundary around a personal worklist.
 *
 * A pin is a view preference. It grants nothing, and the tests below hold that
 * line from three directions: a patient outside the actor's reach cannot be
 * pinned; a pin that outlives access yields a count and never a name; and one
 * provider's board is invisible to another. The deferral tests hold the second
 * line — that a recorded reason is never mistaken for a completion.
 */

function isolate(prefix: string) {
  const originalCwd = process.cwd();
  const env = process.env as unknown as Record<string, string | undefined>;
  const originalNodeEnv = env.NODE_ENV;
  const originalSecret = env.EHR_SESSION_SECRET;
  const root = mkdtempSync(join(tmpdir(), prefix));
  process.chdir(root);
  env.NODE_ENV = "test";
  env.EHR_SESSION_SECRET = `synthetic-${prefix}-secret-0123456789abcdef`;
  return () => {
    process.chdir(originalCwd);
    if (originalNodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = originalNodeEnv;
    if (originalSecret === undefined) delete env.EHR_SESSION_SECRET;
    else env.EHR_SESSION_SECRET = originalSecret;
  };
}

const CONTEXT = { source: "api" as const, requestId: "test-request" };

function provider(userId: string) {
  return { userId, displayName: `Dr. ${userId}`, role: "provider" as const };
}

test("DB-10: pins are personal, access-checked, and grant nothing", async () => {
  const restore = isolate("ehr-care-completion-pins-");
  try {
    const [
      { getDatabase },
      { PatientRepository },
      { AuditRepository },
      { careCompletionService, CareCompletionError },
      { CareCompletionRepository },
      { PatientAccessError },
    ] = await Promise.all([
      import("../app/server/db/connection"),
      import("../app/server/repositories/patient-repository"),
      import("../app/server/repositories/audit-repository"),
      import("../app/server/services/care-completion-service"),
      import("../app/server/repositories/care-completion-repository"),
      import("../app/server/auth/patient-access"),
    ]);

    getDatabase();

    const orgA = await grantSyntheticOrganizationAccess(["cc-provider-a", "cc-provider-b"], {
      organizationId: "org-cc-a",
    });
    const orgB = await grantSyntheticOrganizationAccess(["cc-provider-outside"], {
      organizationId: "org-cc-b",
    });

    for (const [id, name, mrn] of [
      ["p-cc-shared", "Shared Patient", "MRN-CC-S1"],
      ["p-cc-other-org", "Other Org Patient", "MRN-CC-S2"],
    ] as const) {
      PatientRepository.create({
        id,
        name,
        initials: "SP",
        mrn,
        dob: "1990-01-01",
        status: "active",
        pronouns: "they/them",
      } as never);
    }
    await assignSyntheticPatients(["p-cc-shared"], orgA);
    await assignSyntheticPatients(["p-cc-other-org"], orgB);

    const providerA = provider("cc-provider-a");
    const providerB = provider("cc-provider-b");

    // --- An authorized provider can pin an accessible patient ---------------
    const pin = careCompletionService.pinPatient(providerA, "p-cc-shared", CONTEXT);
    assert.equal(pin.patientId, "p-cc-shared");
    assert.equal(pin.userId, "cc-provider-a");
    assert.equal(pin.organizationId, orgA, "a pin is scoped to the acting organization");

    // --- Pinning is idempotent and does not reorder the board ---------------
    const again = careCompletionService.pinPatient(providerA, "p-cc-shared", CONTEXT);
    assert.equal(again.id, pin.id, "re-pinning returns the same row rather than a duplicate");
    assert.equal(again.pinnedAt, pin.pinnedAt, "re-pinning does not move the patient to the top");

    // --- The pin persists and is readable back -----------------------------
    assert.equal(CareCompletionRepository.listPins("cc-provider-a").length, 1);
    assert.equal(careCompletionService.isPinned(providerA, "p-cc-shared"), true);

    // --- Provider A's pin is not Provider B's ------------------------------
    assert.equal(
      careCompletionService.isPinned(providerB, "p-cc-shared"),
      false,
      "another provider in the same organization has an independent pin set",
    );
    assert.equal(careCompletionService.buildBoard(providerB).cards.length, 0);

    // --- An inaccessible patient cannot be pinned --------------------------
    assert.throws(
      () => careCompletionService.pinPatient(providerA, "p-cc-other-org", CONTEXT),
      (error: unknown) => error instanceof PatientAccessError,
      "a patient outside the actor's organization must be refused",
    );
    assert.equal(
      CareCompletionRepository.getPin("cc-provider-a", "p-cc-other-org"),
      null,
      "a refused pin writes nothing",
    );

    // --- A pin that outlives access leaks nothing --------------------------
    const board = careCompletionService.buildBoard(providerA);
    assert.equal(board.cards.length, 1);
    assert.equal(board.cards[0].patientName, "Shared Patient");

    // Move the patient out of this actor's reach while the pin row remains.
    getDatabase()
      .prepare("UPDATE patient_organizations SET organization_id = ? WHERE patient_id = ?")
      .run(orgB, "p-cc-shared");

    const afterRevocation = careCompletionService.buildBoard(providerA);
    assert.equal(afterRevocation.cards.length, 0, "the stale pin renders no card");
    assert.equal(afterRevocation.inaccessiblePinCount, 1, "it is reported only as a count");
    const serialized = JSON.stringify(afterRevocation);
    assert.ok(!serialized.includes("Shared Patient"), "no name leaks through a stale pin");
    assert.ok(!serialized.includes("MRN-CC-S1"), "no MRN leaks through a stale pin");
    assert.ok(!serialized.includes("p-cc-shared"), "not even the patient id leaks");
    assert.equal(
      CareCompletionRepository.getPin("cc-provider-a", "p-cc-shared") !== null,
      true,
      "the pin row survives; it is the read that is refused, not the preference that is deleted",
    );
    assert.equal(
      careCompletionService.isPinned(providerA, "p-cc-shared"),
      false,
      "a pin the actor can no longer reach does not report as pinned",
    );

    // Restore access and unpin cleanly.
    getDatabase()
      .prepare("UPDATE patient_organizations SET organization_id = ? WHERE patient_id = ?")
      .run(orgA, "p-cc-shared");
    const { removed } = careCompletionService.unpinPatient(providerA, "p-cc-shared", CONTEXT);
    assert.equal(removed, true);
    assert.equal(careCompletionService.buildBoard(providerA).cards.length, 0);
    assert.ok(
      PatientRepository.getById("p-cc-shared"),
      "unpinning changes only the personal board; the chart is untouched",
    );

    // --- Audit records the decisions, not the reads ------------------------
    const events = AuditRepository.getRecent(200).map((entry) => entry.eventType);
    assert.ok(events.includes("care_completion_patient_pinned"));
    assert.ok(events.includes("care_completion_patient_unpinned"));
    assert.equal(
      events.filter((type) => type === "care_completion_patient_pinned").length,
      1,
      "an idempotent re-pin is not a second audited decision",
    );
    const pinEvent = AuditRepository.getRecent(200).find(
      (entry) => entry.eventType === "care_completion_patient_pinned",
    )!;
    assert.match(
      pinEvent.description,
      /grants no chart access/i,
      "the audit record states what a pin does not mean",
    );
    assert.equal(pinEvent.patientId, "p-cc-shared");

    // Building the board many times must not create audit noise.
    const before = AuditRepository.getRecent(500).length;
    careCompletionService.buildBoard(providerA);
    careCompletionService.buildBoard(providerA);
    assert.equal(AuditRepository.getRecent(500).length, before, "reads are not audited");

    // --- read_clinical is required -----------------------------------------
    await grantSyntheticOrganizationAccess(["cc-front-desk"], {
      organizationId: orgA,
      role: "staff",
      membershipRole: "member",
    });
    assert.throws(
      () =>
        careCompletionService.pinPatient(
          { userId: "cc-front-desk", displayName: "Front Desk", role: "staff" },
          "p-cc-shared",
          CONTEXT,
        ),
      (error: unknown) => error instanceof CareCompletionError && error.status === 403,
      "a scheduling-only role has no clinical worklist",
    );
  } finally {
    restore();
  }
});

test("DB-10: deferral records a reason and never becomes a completion", async () => {
  const restore = isolate("ehr-care-completion-defer-");
  try {
    const [
      { getDatabase },
      { PatientRepository },
      { AppointmentRepository },
      { AuditRepository },
      { careCompletionService, CareCompletionError },
      { CareCompletionRepository, CareCompletionConcurrencyError },
    ] = await Promise.all([
      import("../app/server/db/connection"),
      import("../app/server/repositories/patient-repository"),
      import("../app/server/repositories/appointment-repository"),
      import("../app/server/repositories/audit-repository"),
      import("../app/server/services/care-completion-service"),
      import("../app/server/repositories/care-completion-repository"),
    ]);

    const db = getDatabase();
    const nowIso = new Date().toISOString();
    const organizationId = await grantSyntheticOrganizationAccess(["cc-defer-a", "cc-defer-b"], {
      organizationId: "org-cc-defer",
    });

    const patientId = "p-cc-defer";
    PatientRepository.create({
      id: patientId,
      name: "Devon Deferral",
      initials: "DD",
      mrn: "MRN-CC-D1",
      dob: "1988-08-08",
      status: "active",
      pronouns: "he/him",
    } as never);
    await assignSyntheticPatients([patientId], organizationId);

    const originAptId = "apt-cc-defer-origin";
    AppointmentRepository.create({
      id: originAptId,
      patientId,
      patientName: "Devon Deferral",
      dob: "1988-08-08",
      age: 38,
      mrn: "MRN-CC-D1",
      date: "2026-09-14",
      time: "10:00 AM",
      duration: "30 min",
      type: "Follow-up",
      status: "completed",
      chiefComplaint: "Medication review",
      insurance: "Synthetic Plan",
      modality: "in-person",
      intakeStatus: "completed",
    } as never);

    const encounterId = "enc-cc-defer";
    db.prepare(`
      INSERT INTO encounters (id, patient_id, appointment_id, type, date, status, chief_complaint, follow_up, created_at, updated_at)
      VALUES (?, ?, ?, 'Follow-up', '2026-09-14', 'draft', 'Medication review', '4 weeks', ?, ?)
    `).run(encounterId, patientId, originAptId, nowIso, nowIso);

    const actor = provider("cc-defer-a");
    const other = provider("cc-defer-b");
    careCompletionService.pinPatient(actor, patientId, CONTEXT);

    const followUpKey = `follow-up-appointment:${encounterId}`;
    const itemFor = (who: ReturnType<typeof provider>, key: string) =>
      careCompletionService
        .buildBoard(who)
        .cards[0]?.items.find((item) => item.itemKey === key);

    assert.equal(itemFor(actor, followUpKey)!.state, "open");

    // --- Defer with a reason and a resume date -----------------------------
    const deferral = careCompletionService.deferItem(
      actor,
      {
        patientId,
        itemKey: followUpKey,
        reasonCode: "patient-checking-schedule",
        reasonText: "Patient is checking their work schedule and will call back.",
        resumeAt: "2026-09-22",
      },
      CONTEXT,
    );
    assert.equal(deferral.reasonCode, "patient-checking-schedule");
    assert.equal(deferral.deferredBy, "cc-defer-a", "provider identity is persisted");
    assert.ok(deferral.deferredAt, "the time of the decision is persisted");
    assert.equal(deferral.resumeAt, "2026-09-22T00:00:00.000Z", "the resume date is persisted");
    assert.equal(deferral.encounterId, encounterId, "the originating encounter is retained");
    assert.equal(deferral.version, 1);

    const deferred = itemFor(actor, followUpKey)!;
    assert.equal(deferred.state, "deferred", "the item renders as deferred");
    assert.notEqual(deferred.state, "complete", "deferring is emphatically not completing");
    assert.equal(deferred.classification, "deferred");
    assert.equal(deferred.deferral?.reasonText, "Patient is checking their work schedule and will call back.");

    const progress = careCompletionService.buildBoard(actor).cards[0].progress;
    assert.equal(progress.deferred, 1);
    assert.equal(progress.closed, false, "a board with a deferred item is not a closed loop");

    // --- The deferral is private to the provider who recorded it -----------
    careCompletionService.pinPatient(other, patientId, CONTEXT);
    const otherView = itemFor(other, followUpKey)!;
    assert.equal(
      otherView.state,
      "open",
      "another provider sees the work as open; this board state is personal",
    );
    assert.equal(otherView.deferral, undefined);

    // --- Concurrency: a stale version is refused, not silently overwritten --
    assert.throws(
      () =>
        careCompletionService.deferItem(
          actor,
          { patientId, itemKey: followUpKey, reasonCode: "waiting-for-patient", expectedVersion: 99 },
          CONTEXT,
        ),
      (error: unknown) => error instanceof CareCompletionConcurrencyError,
      "a second window acting on a stale version is told, not ignored",
    );

    // --- Resume restores pending, and the reason survives as history -------
    careCompletionService.resumeItem(actor, { patientId, itemKey: followUpKey }, CONTEXT);
    assert.equal(itemFor(actor, followUpKey)!.state, "open", "resuming returns the work to unresolved");
    const history = CareCompletionRepository.getDeferral("cc-defer-a", patientId, followUpKey)!;
    assert.equal(history.status, "resumed");
    assert.equal(history.reasonCode, "patient-checking-schedule", "the recorded reason is kept");

    // --- The authoritative workflow supersedes an obsolete deferral --------
    careCompletionService.deferItem(
      actor,
      { patientId, itemKey: followUpKey, reasonCode: "waiting-for-patient" },
      CONTEXT,
    );
    assert.equal(itemFor(actor, followUpKey)!.state, "deferred");

    AppointmentRepository.create({
      id: "apt-cc-defer-followup",
      patientId,
      patientName: "Devon Deferral",
      dob: "1988-08-08",
      age: 38,
      mrn: "MRN-CC-D1",
      date: "2026-10-12",
      time: "02:00 PM",
      duration: "30 min",
      type: "Follow-up",
      status: "scheduled",
      chiefComplaint: "Follow-up visit",
      insurance: "Synthetic Plan",
      modality: "in-person",
      intakeStatus: "completed",
      originAppointmentId: originAptId,
      followUpInterval: "4 weeks",
    } as never);

    const resolvedByWorkflow = itemFor(actor, followUpKey)!;
    assert.equal(
      resolvedByWorkflow.state,
      "complete",
      "scheduling the appointment closes the loop even while a deferral row exists",
    );
    assert.equal(
      resolvedByWorkflow.deferral,
      undefined,
      "an obsolete deferral is not rendered over a completion",
    );
    assert.match(resolvedByWorkflow.detail ?? "", /Oct 12, 2026/);

    // --- Completed work cannot be deferred ---------------------------------
    assert.throws(
      () =>
        careCompletionService.deferItem(
          actor,
          { patientId, itemKey: followUpKey, reasonCode: "waiting-for-patient" },
          CONTEXT,
        ),
      (error: unknown) => error instanceof CareCompletionError && error.status === 409,
      "there is nothing to defer once the record says the work is done",
    );

    // --- A fabricated item key writes nothing ------------------------------
    assert.throws(
      () =>
        careCompletionService.deferItem(
          actor,
          { patientId, itemKey: "follow-up-appointment:enc-does-not-exist", reasonCode: "other", reasonText: "x" },
          CONTEXT,
        ),
      (error: unknown) => error instanceof CareCompletionError && error.status === 404,
      "an item key is validated against the live board, not trusted from the request",
    );
    assert.throws(
      () =>
        careCompletionService.deferItem(
          actor,
          { patientId, itemKey: "not-a-rule:whatever", reasonCode: "other" },
          CONTEXT,
        ),
      (error: unknown) => error instanceof CareCompletionError && error.status === 400,
    );

    // --- Audit -------------------------------------------------------------
    const events = AuditRepository.getRecent(300);
    const deferEvent = events.find((entry) => entry.eventType === "care_completion_item_deferred")!;
    assert.ok(deferEvent, "deferring is audited");
    assert.equal(deferEvent.patientId, patientId);
    assert.match(deferEvent.description, /not a completion/i);
    assert.ok(events.some((entry) => entry.eventType === "care_completion_item_resumed"));
  } finally {
    restore();
  }
});

test("DB-10: the board cannot complete clinical work, and manual tasks are the only exception", async () => {
  const restore = isolate("ehr-care-completion-boundary-");
  try {
    const [
      { getDatabase },
      { PatientRepository },
      { careCompletionService },
      { TaskRepository },
      domain,
      service,
    ] = await Promise.all([
      import("../app/server/db/connection"),
      import("../app/server/repositories/patient-repository"),
      import("../app/server/services/care-completion-service"),
      import("../app/server/repositories/task-repository"),
      import("../app/domain/care-completion"),
      import("../app/server/services/care-completion-service"),
    ]);

    const db = getDatabase();
    const nowIso = new Date().toISOString();
    const organizationId = await grantSyntheticOrganizationAccess(["cc-bound"], {
      organizationId: "org-cc-bound",
    });
    const patientId = "p-cc-bound";
    PatientRepository.create({
      id: patientId,
      name: "Bailey Boundary",
      initials: "BB",
      mrn: "MRN-CC-B1",
      dob: "1991-03-03",
      status: "active",
      pronouns: "she/her",
    } as never);
    await assignSyntheticPatients([patientId], organizationId);

    const actor = provider("cc-bound");
    careCompletionService.pinPatient(actor, patientId, CONTEXT);

    db.prepare(`
      INSERT INTO encounters (id, patient_id, type, date, status, chief_complaint, created_at, updated_at)
      VALUES ('enc-cc-bound', ?, 'Follow-up', '2026-09-14', 'draft', 'Review', ?, ?)
    `).run(patientId, nowIso, nowIso);
    db.prepare(`
      INSERT INTO orders (id, patient_id, encounter_id, type, name, status, details_json, ordered_by, created_at, updated_at)
      VALUES ('ord-cc-bound', ?, 'enc-cc-bound', 'medication', 'Fluoxetine 20 mg', 'staged', '{}', 'cc-bound', ?, ?)
    `).run(patientId, nowIso, nowIso);

    const board = () => careCompletionService.buildBoard(actor).cards[0];
    const items = board().items;

    // --- The service exposes no way to complete an observed item -----------
    const mutators = Object.keys(service.careCompletionService);
    assert.deepEqual(
      mutators.filter((name) => /complete|sign|transmit|send|acknowledge|schedule/i.test(name)),
      [],
      "the care-completion service offers no clinical completion method at all",
    );

    const signing = items.find((item) => item.ruleId === "encounter-signed")!;
    assert.equal(signing.state, "open");
    assert.equal(signing.authority, "observed");
    const rx = items.find((item) => item.ruleId === "prescription-transmission")!;
    assert.equal(rx.state, "open");
    assert.equal(rx.authority, "observed");

    // The only writable state is the deferral, and it does not make either
    // complete — a manual "done" cannot reach these items at all.
    careCompletionService.deferItem(
      actor,
      { patientId, itemKey: signing.itemKey, reasonCode: "other", reasonText: "Finishing tomorrow." },
      CONTEXT,
    );
    const afterDefer = board().items.find((item) => item.itemKey === signing.itemKey)!;
    assert.equal(afterDefer.state, "deferred");
    assert.equal(
      (db.prepare("SELECT status FROM encounters WHERE id = 'enc-cc-bound'").get() as any).status,
      "draft",
      "deferring the signing item did not sign the encounter",
    );
    assert.equal(
      (db.prepare("SELECT status FROM orders WHERE id = 'ord-cc-bound'").get() as any).status,
      "staged",
      "nothing on this board advanced the prescription",
    );
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM prescription_transactions").get() as any).n,
      0,
      "no transport record was fabricated",
    );
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM appointments WHERE patient_id = ?").get(patientId) as any).n,
      0,
      "no fictional follow-up appointment was created",
    );

    // --- Manual tasks are the one item class the board may complete --------
    const task = TaskRepository.createTask({ text: "Call mother Thursday", patientId, due: "Thursday" });
    const manual = board().items.find((item) => item.ruleId === "manual-task")!;
    assert.ok(manual, "a patient-linked task appears as a manual item");
    assert.equal(manual.authority, "manual");
    assert.equal(manual.classification, "manual");
    assert.equal(manual.state, "open");
    assert.equal(manual.action?.taskId, task.id, "the item points at the real task row");

    // Completion still travels through the task record itself, so the board is
    // reading the same authoritative state the Tasks surface writes.
    TaskRepository.toggleTask(task.id);
    const manualDone = board().items.find((item) => item.ruleId === "manual-task")!;
    assert.equal(manualDone.state, "complete");
    assert.ok(manualDone.evidence.some((source) => source.sourceKind === "task"));

    // --- A manual task cannot impersonate an observed item -----------------
    // The worst version of this feature is one where a clinician can tick
    // something called "Sign encounter" and have the board agree. A completed
    // task whose text is exactly that sits beside the real item and changes
    // nothing about it, because item identity is rule id plus the authoritative
    // row — never display text.
    const impostor = TaskRepository.createTask({
      text: "Sign encounter",
      patientId,
      due: "Today",
    });
    TaskRepository.toggleTask(impostor.id);

    const withImpostor = board().items;
    const realSigning = withImpostor.find((item) => item.ruleId === "encounter-signed")!;
    assert.equal(
      realSigning.state,
      "deferred",
      "a completed task named after it leaves the real signing item exactly where it was",
    );
    assert.equal(
      (db.prepare("SELECT status FROM encounters WHERE id = 'enc-cc-bound'").get() as any).status,
      "draft",
      "and the encounter is still unsigned",
    );
    assert.equal(
      new Set(withImpostor.map((item) => item.itemKey)).size,
      withImpostor.length,
      "no task can collide with a rule's item key",
    );

    // --- Every rule that can report complete declares an evidence source ---
    for (const rule of domain.CARE_COMPLETION_RULES) {
      if (rule.availability !== "available") {
        assert.ok(rule.unavailableReason, `${rule.id} must state why it is unavailable`);
        continue;
      }
      assert.ok(
        rule.evidenceSources.length > 0,
        `${rule.id} must name the authoritative columns its completion is read from`,
      );
      assert.ok(rule.rationale.length > 20, `${rule.id} must explain why it exists`);
    }
  } finally {
    restore();
  }
});

test("DB-10: the window is registered, optional, permission-gated and server-backed", async () => {
  const restore = isolate("ehr-care-completion-registry-");
  try {
    const [
      { getDashboardModule, filterModulesByCapabilities, DASHBOARD_MODULES },
      { defaultPreferences, builtInPresets, mergeStoredPreferences },
      { TODAY_SECTION_META },
      { CARE_COMPLETION_RULES },
    ] = await Promise.all([
      import("../app/domain/dashboard-modules"),
      import("../app/lib/preference-engine"),
      import("../app/lib/use-today-layout"),
      import("../app/domain/care-completion"),
    ]);

    const module = getDashboardModule("care-completion");
    assert.ok(module, "the window is in the bounded module registry");
    assert.equal(module.status, "available", "it has a working backend, so it is not 'planned'");
    assert.equal(module.permanent, false, "the board is optional, not a fixture of the canvas");
    assert.equal(module.scope, "provider", "it is a personal board, not a practice view");
    assert.equal(module.category, "clinical");
    assert.deepEqual([...module.allowedSpans], ["half", "full"], "it works at half and full width");
    assert.equal(module.sourceApi, "/api/care-completion", "it is server-backed");
    assert.deepEqual([...module.requiredCapabilities], ["read_clinical"]);

    // It coexists with Outstanding Work rather than replacing it.
    const queue = getDashboardModule("queue");
    assert.equal(queue?.status, "available", "Outstanding Work is untouched");
    assert.notEqual(queue?.id, module.id);
    assert.equal(
      DASHBOARD_MODULES.filter((entry) => entry.id === "care-completion").length,
      1,
      "registered exactly once",
    );

    // Permission gating drops it for an actor without clinical read.
    const forScheduler = filterModulesByCapabilities(DASHBOARD_MODULES, ["read_schedule"]);
    assert.ok(
      !forScheduler.some((entry) => entry.id === "care-completion"),
      "a scheduling-only actor is not offered the window",
    );
    const forClinician = filterModulesByCapabilities(DASHBOARD_MODULES, ["read_clinical"]);
    assert.ok(forClinician.some((entry) => entry.id === "care-completion"));

    // Preferences: off by default, present in the order, addable from the menu.
    assert.equal(
      defaultPreferences.today.showCareCompletion,
      false,
      "an opt-in working set ships off",
    );
    assert.ok(defaultPreferences.today.widgetOrder.includes("care-completion"));
    assert.equal(
      builtInPresets.cockpit.config.today?.showCareCompletion,
      true,
      "the high-volume cockpit preset turns it on",
    );
    assert.equal(TODAY_SECTION_META["care-completion"].shipsVisible, false);
    assert.equal(TODAY_SECTION_META["care-completion"].visibilityKey, "showCareCompletion");

    // A layout saved before this window existed gains it rather than breaking.
    const legacy = mergeStoredPreferences({
      today: {
        ...defaultPreferences.today,
        widgetOrder: ["briefing", "metrics", "roster", "queue"],
      },
    } as never);
    assert.ok(
      legacy.today.widgetOrder.includes("care-completion"),
      "a stored order written before this window appends it at its default (off)",
    );
    assert.equal(legacy.today.showCareCompletion, false);

    // Rule catalogue integrity: stable ids, no duplicates, every rule explained.
    const ids = CARE_COMPLETION_RULES.map((rule) => rule.id);
    assert.equal(new Set(ids).size, ids.length, "rule identities are unique");
  } finally {
    restore();
  }
});
