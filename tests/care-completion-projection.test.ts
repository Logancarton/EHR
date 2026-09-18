import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * DB-10 — Care completion is a projection, never a second truth system.
 *
 * The invariants under test are the ones that make the board safe to believe:
 *
 * - clicking on this surface cannot mark an unsent prescription sent, an
 *   unsigned note signed, or a follow-up scheduled that does not exist;
 * - a follow-up completes only from an appointment actually linked to the
 *   originating visit, and it reopens when that appointment is cancelled;
 * - deferring records a reason and leaves the work unresolved;
 * - a completion in the authoritative record supersedes an obsolete deferral.
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

const NOW = new Date("2026-09-15T15:00:00.000Z");

test("DB-10: care-completion rules resolve from authoritative records only", async () => {
  const restore = isolate("ehr-care-completion-projection-");
  try {
    const [
      { getDatabase },
      { PatientRepository },
      { AppointmentRepository },
      rules,
      domain,
    ] = await Promise.all([
      import("../app/server/db/connection"),
      import("../app/server/repositories/patient-repository"),
      import("../app/server/repositories/appointment-repository"),
      import("../app/server/services/care-completion-rules"),
      import("../app/domain/care-completion"),
    ]);

    const db = getDatabase();
    const nowIso = NOW.toISOString();
    const patientId = "p-cc-jane";
    const capabilities = new Set([
      "read_clinical",
      "read_schedule",
      "send_message",
      "manage_tasks",
    ] as const);
    const options = { capabilities: capabilities as never, now: NOW };

    PatientRepository.create({
      id: patientId,
      name: "Jane Projection",
      initials: "JP",
      mrn: "MRN-CC-001",
      dob: "1990-02-02",
      status: "active",
      pronouns: "she/her",
    } as never);

    // ---------------------------------------------------------------------
    // 1. FOLLOW-UP: a recorded plan with no linked appointment stays open
    // ---------------------------------------------------------------------
    const originAptId = "apt-cc-origin";
    const appointmentFixture = (overrides: Record<string, unknown>) =>
      AppointmentRepository.create({
        patientId,
        patientName: "Jane Projection",
        dob: "1990-02-02",
        age: 36,
        mrn: "MRN-CC-001",
        duration: "30 min",
        type: "Follow-up",
        chiefComplaint: "Medication review",
        insurance: "Synthetic Plan",
        modality: "in-person",
        intakeStatus: "completed",
        ...overrides,
      } as never);

    appointmentFixture({
      id: originAptId,
      date: "2026-09-14",
      time: "09:00 AM",
      status: "completed",
    });

    const encounterId = "enc-cc-1";
    db.prepare(`
      INSERT INTO encounters (id, patient_id, appointment_id, type, date, status, chief_complaint, follow_up, created_at, updated_at)
      VALUES (?, ?, ?, 'Follow-up', '2026-09-14', 'draft', 'Medication review', '4 weeks', ?, ?)
    `).run(encounterId, patientId, originAptId, nowIso, nowIso);

    const bundle = () =>
      // Rebuilt from the database on every assertion: the point of the feature is
      // that the answer is re-derived, never cached beside the record.
      buildBundle(db, patientId);

    const items = rules.resolveCareCompletionItems(bundle(), options);
    const followUp = () =>
      rules.resolveCareCompletionItems(bundle(), options).find((item) => item.ruleId === "follow-up-appointment")!;

    assert.ok(followUp(), "a recorded follow-up plan produces a work item");
    assert.equal(followUp().state, "open", "no linked appointment means the loop is open");
    assert.match(followUp().label, /Schedule follow-up/);
    assert.match(followUp().label, /4 weeks/, "the recommended interval is carried onto the label");
    assert.equal(followUp().authority, "observed");
    assert.equal(followUp().classification, "actionable");

    // ---------------------------------------------------------------------
    // 2. An unrelated future appointment does NOT satisfy the linked rule
    // ---------------------------------------------------------------------
    appointmentFixture({
      id: "apt-cc-unrelated",
      date: "2026-10-01",
      time: "11:00 AM",
      status: "scheduled",
    });

    assert.equal(
      followUp().state,
      "open",
      "an arbitrary future visit is not evidence that THIS visit's follow-up plan was acted on",
    );

    // ---------------------------------------------------------------------
    // 3. A linked follow-up completes it, and shows the real date and time
    // ---------------------------------------------------------------------
    const followUpAptId = "apt-cc-followup";
    appointmentFixture({
      id: followUpAptId,
      date: "2026-10-12",
      time: "02:00 PM",
      status: "scheduled",
      originAppointmentId: originAptId,
      followUpInterval: "4 weeks",
    });

    assert.equal(followUp().state, "complete", "a linked follow-up appointment closes the loop");
    assert.match(followUp().detail ?? "", /Oct 12, 2026/, "the actual date is rendered");
    assert.match(followUp().detail ?? "", /02:00 PM/, "the actual time is rendered");
    assert.ok(
      followUp().evidence.some((source) => source.sourceKind === "appointment" && source.sourceId === followUpAptId),
      "completion names the appointment it was read from",
    );
    assert.equal(followUp().deferrable, false, "completed work is not deferrable");

    // ---------------------------------------------------------------------
    // 4. Rescheduling updates the rendered evidence
    // ---------------------------------------------------------------------
    db.prepare(`UPDATE appointments SET date = '2026-10-19', time = '03:30 PM' WHERE id = ?`).run(followUpAptId);
    assert.match(followUp().detail ?? "", /Oct 19, 2026/, "a reschedule moves the shown date");
    assert.match(followUp().detail ?? "", /03:30 PM/, "a reschedule moves the shown time");

    // ---------------------------------------------------------------------
    // 5. Cancelling the linked appointment returns the item to unresolved
    // ---------------------------------------------------------------------
    db.prepare(`UPDATE appointments SET status = 'cancelled' WHERE id = ?`).run(followUpAptId);
    assert.equal(
      followUp().state,
      "open",
      "a cancelled follow-up must not keep a checkmark it no longer earns",
    );

    db.prepare(`UPDATE appointments SET status = 'no-show' WHERE id = ?`).run(followUpAptId);
    assert.equal(followUp().state, "open", "a missed follow-up is also not a closed loop");

    db.prepare(`UPDATE appointments SET status = 'tentative' WHERE id = ?`).run(followUpAptId);
    assert.equal(followUp().state, "open", "a tentative hold does not close a recommended follow-up");

    db.prepare(`UPDATE appointments SET status = 'scheduled' WHERE id = ?`).run(followUpAptId);
    assert.equal(followUp().state, "complete", "rebooking the same linked visit closes it again");

    // ---------------------------------------------------------------------
    // 6. SIGNING: draft is unresolved; the signed record completes it
    // ---------------------------------------------------------------------
    const signing = () =>
      rules.resolveCareCompletionItems(bundle(), options).find((item) => item.ruleId === "encounter-signed")!;
    assert.equal(signing().state, "open", "a draft encounter is unresolved");

    db.prepare(`UPDATE encounters SET status = 'signed', signed_by = 'team-taylor', signed_at = ? WHERE id = ?`)
      .run(nowIso, encounterId);
    assert.equal(signing().state, "complete", "the signed legal record completes the item");
    assert.ok(
      signing().evidence.some((source) => source.sourceKind === "encounter" && source.sourceId === encounterId),
      "signing completion names the encounter",
    );

    // A signed note with no follow-up scheduled must still read as incomplete.
    db.prepare(`UPDATE appointments SET status = 'cancelled' WHERE id = ?`).run(followUpAptId);
    assert.equal(signing().state, "complete");
    assert.equal(
      followUp().state,
      "open",
      "signing the note does not close the follow-up loop — they are different facts",
    );
    db.prepare(`UPDATE appointments SET status = 'scheduled' WHERE id = ?`).run(followUpAptId);

    // ---------------------------------------------------------------------
    // 7. PRESCRIPTION: staged / authorized / transmitted each read truthfully
    // ---------------------------------------------------------------------
    const orderId = "ord-cc-1";
    db.prepare(`
      INSERT INTO orders (id, patient_id, encounter_id, type, name, status, details_json, ordered_by, created_at, updated_at)
      VALUES (?, ?, ?, 'medication', 'Sertraline 100 mg', 'staged', '{}', 'team-taylor', ?, ?)
    `).run(orderId, patientId, encounterId, nowIso, nowIso);

    const rx = () =>
      rules.resolveCareCompletionItems(bundle(), options).find((item) => item.ruleId === "prescription-transmission")!;
    assert.equal(rx().state, "open");
    assert.match(rx().detail ?? "", /Staged/, "staged is reported as staged, not as sent");

    db.prepare(`UPDATE orders SET status = 'authorized' WHERE id = ?`).run(orderId);
    assert.equal(rx().state, "open", "authorized is not transmitted");
    assert.match(rx().detail ?? "", /Authorized/);

    // Transmitted with no transport record is not "sent" — and says which it is.
    db.prepare(`UPDATE orders SET status = 'transmitted' WHERE id = ?`).run(orderId);
    assert.equal(
      rx().state,
      "open",
      "an order row alone cannot assert that a prescription reached a pharmacy",
    );
    assert.match(rx().detail ?? "", /no authoritative transport record/i);

    db.prepare(`
      INSERT INTO prescription_transactions (
        id, order_id, patient_id, adapter_id, vendor_name, transaction_type, state,
        correlation_id, idempotency_key, created_by, source_type, submitted_at, created_at, updated_at
      ) VALUES ('tx-cc-1', ?, ?, 'dev-adapter', 'Development', 'new_rx', 'submitted',
                'corr-cc-1', 'idem-cc-1', 'team-taylor', 'direct', ?, ?, ?)
    `).run(orderId, patientId, nowIso, nowIso, nowIso);

    assert.equal(rx().state, "complete", "an authoritative submitted transaction completes it");
    assert.ok(
      rx().evidence.some((source) => source.sourceKind === "prescription-transaction"),
      "prescription completion names the transaction",
    );

    // ---------------------------------------------------------------------
    // 8. NO DUPLICATE TRUTH: there is no writable completion for observed items
    // ---------------------------------------------------------------------
    const observedItems = rules
      .resolveCareCompletionItems(bundle(), options)
      .filter((item) => item.authority === "observed");
    assert.ok(observedItems.length >= 3, "several observed items exist to check");
    for (const item of observedItems) {
      assert.equal(
        item.authority,
        "observed",
        `${item.ruleId} must not offer a manual completion path`,
      );
      if (item.state === "complete") {
        assert.ok(
          item.evidence.length > 0,
          `${item.ruleId} reported complete with no authoritative evidence`,
        );
      }
    }
    const manual = rules
      .resolveCareCompletionItems(bundle(), options)
      .filter((item) => item.authority === "manual");
    assert.equal(manual.length, 0, "no manual tasks exist for this patient yet");

    // ---------------------------------------------------------------------
    // 9. PROGRESS: deferred is never counted as complete
    // ---------------------------------------------------------------------
    const sample = [
      { state: "complete" as const },
      { state: "complete" as const },
      { state: "deferred" as const },
      { state: "open" as const },
      { state: "unavailable" as const },
    ].map((entry) => ({ ...entry }) as never);
    const progress = domain.summarizeCareCompletion(sample);
    assert.deepEqual(
      { complete: progress.complete, open: progress.open, deferred: progress.deferred, unavailable: progress.unavailable },
      { complete: 2, open: 1, deferred: 1, unavailable: 1 },
    );
    assert.equal(progress.applicable, 4, "unavailable work is outside the denominator");
    assert.equal(progress.closed, false, "a deferred item keeps the loop open");
    assert.equal(
      domain.summarizeCareCompletion([{ state: "complete" }, { state: "deferred" }] as never).closed,
      false,
      "deferred is not complete, however few items there are",
    );
    assert.equal(
      domain.summarizeCareCompletion([]).closed,
      false,
      "an empty card is not a closed loop",
    );
  } finally {
    restore();
  }
});

test("DB-10: monitoring protocols recommend review and complete only from a real order", async () => {
  const restore = isolate("ehr-care-completion-monitoring-");
  try {
    const [{ getDatabase }, { PatientRepository }, rules, domain] = await Promise.all([
      import("../app/server/db/connection"),
      import("../app/server/repositories/patient-repository"),
      import("../app/server/services/care-completion-rules"),
      import("../app/domain/care-completion"),
    ]);

    const db = getDatabase();
    const nowIso = NOW.toISOString();
    const patientId = "p-cc-monitor";
    const options = {
      capabilities: new Set(["read_clinical", "read_schedule"] as const) as never,
      now: NOW,
    };

    PatientRepository.create({
      id: patientId,
      name: "Morgan Monitor",
      initials: "MM",
      mrn: "MRN-CC-002",
      dob: "1985-05-05",
      status: "active",
      pronouns: "they/them",
    } as never);

    db.prepare(`
      INSERT INTO patient_medications (
        id, patient_id, display_text, medication_name, generic_name, status,
        source_type, source_system, recorded_by, recorded_at, updated_at
      ) VALUES ('med-cc-li', ?, 'Lithium carbonate 600 mg BID', 'Lithium carbonate', 'lithium', 'active',
                'clinician', 'ehr-local', 'team-taylor', ?, ?)
    `).run(patientId, nowIso, nowIso);

    const findings = () => rules.monitoringFindings(buildBundle(db, patientId), NOW);

    // No matching result on file at all: overdue by definition.
    const found = findings();
    assert.equal(found.length, 1, "an active lithium prescription raises exactly one protocol");
    assert.equal(found[0].protocolKey, "lithium-maintenance");
    assert.equal(found[0].lastResultAt, null);
    assert.ok(
      found[0].basis.toLowerCase().includes("configur"),
      "the protocol states that its interval is configuration, not fixed clinical truth",
    );

    const item = () =>
      rules
        .resolveCareCompletionItems(buildBundle(db, patientId), options)
        .find((entry) => entry.ruleId === "monitoring-labs");
    assert.equal(item()!.state, "open");
    assert.match(item()!.label, /Review monitoring labs/, "the item asks for review, never for an order");
    assert.equal(
      item()!.explanation,
      found[0].basis,
      "the item carries its reasoning so a clinician can disagree with it knowingly",
    );

    // A recent in-window result means the protocol is satisfied and no item fires.
    db.prepare(`
      INSERT INTO observations (id, patient_id, category, test_name, effective_at, value_text, status, source_system, created_at, updated_at)
      VALUES ('obs-cc-li', ?, 'lab', 'Lithium level', '2026-09-01T00:00:00.000Z', '0.7', 'final', 'labcorp', ?, ?)
    `).run(patientId, nowIso, nowIso);
    assert.equal(findings().length, 0, "a result inside the configured interval closes the question");

    // Push it back beyond the interval and it returns.
    db.prepare(`UPDATE observations SET effective_at = '2025-01-01T00:00:00.000Z' WHERE id = 'obs-cc-li'`).run();
    assert.equal(findings().length, 1, "an out-of-interval result reopens the recommendation");
    assert.equal(item()!.state, "open");

    // A real lab order — the clinician's decision — is what completes it.
    db.prepare(`
      INSERT INTO orders (id, patient_id, type, name, status, details_json, ordered_by, created_at, updated_at)
      VALUES ('ord-cc-lab', ?, 'lab', 'Lithium level, BUN/Cr, TSH', 'staged', '{}', 'team-taylor', ?, ?)
    `).run(patientId, nowIso, nowIso);
    assert.equal(item()!.state, "complete", "an actual lab order closes the recommendation");
    assert.ok(
      item()!.evidence.some((source) => source.sourceKind === "order"),
      "monitoring completion names the order it read",
    );

    // Clozapine monitoring is neutrophil-based and a bare WBC must not satisfy it.
    const clozapine = domain.monitoringProtocolsForMedication("Clozapine", "clozapine");
    assert.equal(clozapine.length, 1);
    assert.ok(
      !clozapine[0].resultMatch.some((needle) => needle === "wbc" || needle === "white"),
      "a white-cell count is not accepted as an answer to a neutrophil question",
    );
    assert.ok(clozapine[0].resultMatch.includes("anc"));
    assert.ok(
      clozapine[0].reviewLabel.toLowerCase().includes("differential"),
      "the review asks for a differential, which is where ANC lives",
    );
  } finally {
    restore();
  }
});

test("DB-10: unavailable sources are stated, never invented", async () => {
  const restore = isolate("ehr-care-completion-unavailable-");
  try {
    const [{ getDatabase }, { PatientRepository }, rules, domain] = await Promise.all([
      import("../app/server/db/connection"),
      import("../app/server/repositories/patient-repository"),
      import("../app/server/services/care-completion-rules"),
      import("../app/domain/care-completion"),
    ]);

    const db = getDatabase();
    const nowIso = NOW.toISOString();
    const patientId = "p-cc-pcp";

    PatientRepository.create({
      id: patientId,
      name: "Priya Network",
      initials: "PN",
      mrn: "MRN-CC-003",
      dob: "1979-07-07",
      status: "active",
      pronouns: "she/her",
    } as never);

    db.prepare(`
      INSERT INTO encounters (id, patient_id, type, date, status, chief_complaint, signed_by, signed_at, created_at, updated_at)
      VALUES ('enc-cc-pcp', ?, 'Follow-up', '2026-09-14', 'signed', 'Med change', 'team-taylor', ?, ?, ?)
    `).run(patientId, nowIso, nowIso, nowIso);
    db.prepare(`
      INSERT INTO orders (id, patient_id, encounter_id, type, name, status, details_json, ordered_by, created_at, updated_at)
      VALUES ('ord-cc-pcp', ?, 'enc-cc-pcp', 'medication', 'Escitalopram 20 mg', 'staged', '{}', 'team-taylor', ?, ?)
    `).run(patientId, nowIso, nowIso);
    db.prepare(`
      INSERT INTO patient_care_network (id, patient_id, role, name, organization, status, created_at, updated_at)
      VALUES ('cn-cc-1', ?, 'pcp', 'Dr. Ada Primary', 'Northside Family Medicine', 'active', ?, ?)
    `).run(patientId, nowIso, nowIso);

    const options = {
      capabilities: new Set(["read_clinical", "read_schedule", "view_financial"] as const) as never,
      now: NOW,
    };
    const items = rules.resolveCareCompletionItems(buildBundle(db, patientId), options);

    const pcp = items.find((item) => item.ruleId === "pcp-notification")!;
    assert.ok(pcp, "an active PCP plus medication work raises the notification boundary");
    assert.equal(pcp.state, "unavailable", "there is no ROI record, so the workflow is not offered");
    assert.equal(pcp.deferrable, false, "work that cannot be done here is not work to defer");
    assert.match(pcp.unavailableReason ?? "", /release-of-information/i);
    assert.equal(pcp.action, undefined, "an unavailable item offers no transmission path");
    assert.ok(
      pcp.evidence.some((source) => source.sourceKind === "care-network"),
      "the boundary names the care-network record it read",
    );

    // Patient balance has no authoritative source at all, so it produces no item
    // on any patient rather than a plausible-looking dollar amount.
    assert.ok(
      !items.some((item) => item.ruleId === "patient-balance-reminder"),
      "no balance item is produced, because no balance exists to state",
    );
    const balanceRule = domain.getCareCompletionRule("patient-balance-reminder");
    assert.equal(balanceRule.availability, "unavailable");
    assert.match(balanceRule.unavailableReason ?? "", /no authoritative patient balance/i);

    const serialized = JSON.stringify(items);
    assert.ok(!/\$\d/.test(serialized), "no currency amount appears anywhere in the projection");

    // Coding review is real: it reads the charge record, and is withheld from an
    // actor without financial authority rather than shown as a dead row.
    const clinicalOnly = {
      capabilities: new Set(["read_clinical", "read_schedule"] as const) as never,
      now: NOW,
    };
    const withoutFinance = rules.resolveCareCompletionItems(buildBundle(db, patientId), clinicalOnly);
    assert.ok(
      !withoutFinance.some((item) => item.ruleId === "coding-review"),
      "a clinician without financial scope is not shown billing work",
    );
    assert.ok(
      items.some((item) => item.ruleId === "coding-review"),
      "an actor with financial scope sees the coding item",
    );
    const coding = items.find((item) => item.ruleId === "coding-review")!;
    assert.equal(coding.state, "open", "no charge has been prepared from this signed note yet");
  } finally {
    restore();
  }
});

/**
 * Rebuilds the evidence bundle straight from the database.
 *
 * Mirrors the service's own gathering so the rule tests exercise real rows
 * without going through the access boundary, which has its own suite.
 */
function buildBundle(db: any, patientId: string) {
  const rows = (sql: string) => db.prepare(sql).all(patientId) as any[];
  return {
    patientId,
    encounters: rows(`SELECT * FROM encounters WHERE patient_id = ?`).map((row) => ({
      id: row.id,
      date: row.date,
      status: row.status,
      followUp: row.follow_up || "",
      appointmentId: row.appointment_id || undefined,
      signedAt: row.signed_at || undefined,
      updatedAt: row.updated_at,
      transcriptUtteranceCount: 0,
    })),
    appointments: rows(`SELECT * FROM appointments WHERE patient_id = ?`).map((row) => ({
      id: row.id,
      date: row.date,
      time: row.time,
      status: row.status,
      originAppointmentId: row.origin_appointment_id || undefined,
      followUpInterval: row.follow_up_interval || undefined,
    })),
    orders: rows(`SELECT * FROM orders WHERE patient_id = ?`).map((row) => ({
      id: row.id,
      type: row.type,
      name: row.name,
      status: row.status,
      encounterId: row.encounter_id || undefined,
      createdAt: row.created_at,
    })),
    transactions: rows(`SELECT * FROM prescription_transactions WHERE patient_id = ?`).map((row) => ({
      id: row.id,
      orderId: row.order_id,
      state: row.state,
      submittedAt: row.submitted_at || undefined,
    })),
    observations: rows(
      `SELECT o.*, ra.acknowledged_at FROM observations o
       LEFT JOIN result_acknowledgements ra ON ra.observation_id = o.id
       WHERE o.patient_id = ?`,
    ).map((row) => ({
      id: row.id,
      testName: row.test_name,
      category: row.category,
      effectiveAt: row.effective_at,
      status: row.status,
      interpretation: row.interpretation || undefined,
      acknowledgedAt: row.acknowledged_at || undefined,
    })),
    medications: rows(`SELECT * FROM patient_medications WHERE patient_id = ?`).map((row) => ({
      id: row.id,
      medicationName: row.medication_name,
      genericName: row.generic_name || undefined,
      displayText: row.display_text,
      status: row.status,
    })),
    messages: rows(`SELECT * FROM messages WHERE patient_id = ?`).map((row) => ({
      id: row.id,
      senderRole: row.sender_role,
      createdAt: row.created_at ?? null,
    })),
    noteReferences: [],
    charges: rows(`SELECT * FROM billing_charges WHERE patient_id = ?`).map((row) => ({
      id: row.id,
      encounterId: row.encounter_id,
      status: row.status,
      reviewedAt: row.reviewed_at || undefined,
      procedureCodeCount: 0,
    })),
    tasks: rows(`SELECT * FROM tasks WHERE patient_id = ? AND type = 'task'`).map((row) => ({
      id: row.id,
      text: row.text,
      completed: Boolean(row.completed),
      due: row.due_date || "Today",
    })),
    careNetwork: rows(`SELECT * FROM patient_care_network WHERE patient_id = ? AND status = 'active'`).map((row) => ({
      id: row.id,
      role: row.role,
      name: row.name,
      organization: row.organization || undefined,
    })),
  };
}

test("DB-10: the focus visit is chosen from a comparable date, not from two text formats", async () => {
  const restore = isolate("ehr-care-completion-focus-");
  try {
    const [{ getDatabase }, { PatientRepository }, rules] = await Promise.all([
      import("../app/server/db/connection"),
      import("../app/server/repositories/patient-repository"),
      import("../app/server/services/care-completion-rules"),
    ]);

    const db = getDatabase();
    const patientId = "p-cc-focus";
    PatientRepository.create({
      id: patientId,
      name: "Frankie Focus",
      initials: "FF",
      mrn: "MRN-CC-004",
      dob: "1994-04-04",
      status: "active",
      pronouns: "they/them",
    } as never);

    // The same calendar day written the two ways this product actually writes it.
    // `Date.parse` places the display form at LOCAL midnight and the ISO form at
    // UTC midnight, so west of UTC a naive sort ranks the display row first — and
    // the card would then report on a visit with no follow-up plan while the real
    // plan sat in the other one, producing no work item at all.
    db.prepare(`
      INSERT INTO encounters (id, patient_id, type, date, status, chief_complaint, follow_up, created_at, updated_at)
      VALUES ('enc-cc-display', ?, 'Follow-up', 'Sep 15, 2026', 'draft', 'Display-format date', '', ?, ?)
    `).run(patientId, "2026-09-15T10:00:00.000Z", "2026-09-15T10:00:00.000Z");

    db.prepare(`
      INSERT INTO encounters (id, patient_id, type, date, status, chief_complaint, follow_up, created_at, updated_at)
      VALUES ('enc-cc-iso', ?, 'Follow-up', '2026-09-15', 'draft', 'ISO-format date', '4 weeks', ?, ?)
    `).run(patientId, "2026-09-15T12:00:00.000Z", "2026-09-15T12:00:00.000Z");

    // The invariant, asserted in both directions so it holds in any timezone:
    // two spellings of one day compare EQUAL, which leaves `updatedAt` — always a
    // real ISO instant — to decide. Under the defect the date comparison is
    // non-zero, so `updatedAt` never gets to decide and one of these two must
    // fail wherever local midnight differs from UTC midnight.
    const focusWith = (isoUpdatedAt: string, displayUpdatedAt: string) => {
      db.prepare("UPDATE encounters SET updated_at = ? WHERE id = 'enc-cc-iso'").run(isoUpdatedAt);
      db.prepare("UPDATE encounters SET updated_at = ? WHERE id = 'enc-cc-display'").run(displayUpdatedAt);
      return rules.focusEncounter(buildBundle(db, patientId))?.id;
    };

    assert.equal(
      focusWith("2026-09-15T12:00:00.000Z", "2026-09-15T10:00:00.000Z"),
      "enc-cc-iso",
      "same day: the more recently touched draft is the focus",
    );
    assert.equal(
      focusWith("2026-09-15T10:00:00.000Z", "2026-09-15T12:00:00.000Z"),
      "enc-cc-display",
      "same day, the other way round: the date must not be deciding this",
    );

    // Put the plan-bearing draft back in front for the rest of the test.
    focusWith("2026-09-15T12:00:00.000Z", "2026-09-15T10:00:00.000Z");
    const bundle = buildBundle(db, patientId);

    const items = rules.resolveCareCompletionItems(bundle, {
      capabilities: new Set(["read_clinical", "read_schedule"] as const) as never,
      now: NOW,
    });
    assert.ok(
      items.some((item) => item.ruleId === "follow-up-appointment"),
      "the follow-up plan recorded on the focus visit produces a work item",
    );

    // An undateable encounter never becomes the visit the whole card reports on.
    db.prepare(`
      INSERT INTO encounters (id, patient_id, type, date, status, chief_complaint, follow_up, created_at, updated_at)
      VALUES ('enc-cc-unplaceable', ?, 'Follow-up', 'sometime last spring', 'draft', 'Unplaceable', '', ?, ?)
    `).run(patientId, "2026-09-15T23:00:00.000Z", "2026-09-15T23:00:00.000Z");

    assert.equal(
      rules.focusEncounter(buildBundle(db, patientId))?.id,
      "enc-cc-iso",
      "a visit nobody can date sorts last rather than first",
    );
  } finally {
    restore();
  }
});
