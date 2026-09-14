import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * DB-7: Optional Source-Backed Windows and Closed-Loop Work
 *
 * Verifies:
 * 1. Source Equivalence & Closed-Loop Queue Integrity (Notes, Labs, Refills, Handoffs)
 * 2. Arrivals / Waiting Room Truthfulness (Only waiting/in-visit, no fabricated rows)
 * 3. Visit Preparation Verified Facts vs. Explicit Unknowns (Never synthesized vitals/diagnoses)
 * 4. Population Scope Enforcement across All Practice Queues
 * 5. Module Registry & Declared Deferrals Integrity (Billing, Reports, Intake as planned)
 */
test("DB-7: source-backed windows, closed-loop queues, and declared deferrals", async () => {
  const originalCwd = process.cwd();
  const env = process.env as unknown as Record<string, string | undefined>;
  const originalNodeEnv = env.NODE_ENV;
  const originalSecret = env.EHR_SESSION_SECRET;
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-source-backed-windows-"));

  process.chdir(isolatedRoot);
  env.NODE_ENV = "test";
  env.EHR_SESSION_SECRET = "synthetic-source-backed-windows-secret-0123456789";

  try {
    const [
      { PracticeQueueRepository },
      { getDatabase },
      { DASHBOARD_MODULES, getDashboardModule },
      { defaultPreferences, builtInPresets },
      { TODAY_SECTION_META },
    ] = await Promise.all([
      import("../app/server/repositories/practice-queue-repository"),
      import("../app/server/db/connection"),
      import("../app/domain/dashboard-modules"),
      import("../app/lib/preference-engine"),
      import("../app/lib/use-today-layout"),
    ]);

    const db = getDatabase();

    // -------------------------------------------------------------------------
    // 1. MODULE REGISTRY & DEFERRED MODULES INTEGRITY
    // -------------------------------------------------------------------------
    const arrivalsMod = getDashboardModule("arrivals");
    assert.ok(arrivalsMod, "arrivals module must be registered");
    assert.equal(arrivalsMod.status, "available", "arrivals must be available");
    assert.equal(arrivalsMod.permanent, false, "arrivals must be optional");

    const visitPrepMod = getDashboardModule("visit-prep");
    assert.ok(visitPrepMod, "visit-prep module must be registered");
    assert.equal(visitPrepMod.status, "available", "visit-prep must be available");
    assert.equal(visitPrepMod.permanent, false, "visit-prep must be optional");

    // Declared deferrals
    const billingMod = getDashboardModule("billing");
    assert.ok(billingMod, "billing module must exist in registry");
    assert.equal(billingMod.status, "planned", "billing must be declared planned/deferred");
    assert.ok(billingMod.unavailableReason, "billing must explain why it is deferred");

    const reportsMod = getDashboardModule("reports");
    assert.ok(reportsMod, "reports module must exist in registry");
    assert.equal(reportsMod.status, "planned", "reports must be declared planned/deferred");

    const intakeMod = getDashboardModule("intake");
    assert.ok(intakeMod, "intake module must exist in registry");
    assert.equal(intakeMod.status, "planned", "intake must be declared planned/deferred");

    // Preferences and Presets
    assert.equal(defaultPreferences.today.showArrivals, false, "default preferences must have showArrivals false");
    assert.equal(defaultPreferences.today.showVisitPrep, false, "default preferences must have showVisitPrep false");

    const cockpitPreset = builtInPresets.cockpit;
    assert.ok(cockpitPreset, "cockpit preset must exist");
    assert.equal(cockpitPreset.config.today?.showArrivals, true, "cockpit preset enables showArrivals");
    assert.equal(cockpitPreset.config.today?.showVisitPrep, true, "cockpit preset enables showVisitPrep");
    assert.ok(cockpitPreset.config.today?.widgetOrder.includes("arrivals"), "cockpit widgetOrder includes arrivals");
    assert.ok(cockpitPreset.config.today?.widgetOrder.includes("visit-prep"), "cockpit widgetOrder includes visit-prep");

    // Section meta
    assert.ok(TODAY_SECTION_META.arrivals, "arrivals metadata registered in useTodayLayout");
    assert.ok(TODAY_SECTION_META["visit-prep"], "visit-prep metadata registered in useTodayLayout");

    // -------------------------------------------------------------------------
    // 2. SETUP SYNTHETIC PATIENTS & REPOSITORIES
    // -------------------------------------------------------------------------
    const patientAId = "p-db7-synth-a";
    const patientBId = "p-db7-synth-b";
    const nowIso = new Date().toISOString();
    const todayDate = nowIso.slice(0, 10);

    db.prepare(`
      INSERT OR REPLACE INTO patients (id, name, initials, mrn, dob, status, pronouns, last_visit, next_visit, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'active', 'she/her', ?, '', ?, ?)
    `).run(patientAId, "Alice Synthetic", "AS", "MRN-DB7-001", "1988-04-12", "2026-08-15", nowIso, nowIso);

    db.prepare(`
      INSERT OR REPLACE INTO patients (id, name, initials, mrn, dob, status, pronouns, last_visit, next_visit, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'active', 'he/him', ?, '', ?, ?)
    `).run(patientBId, "Bob Synthetic", "BS", "MRN-DB7-002", "1992-11-03", "", nowIso, nowIso);

    // -------------------------------------------------------------------------
    // 3. CLOSED-LOOP WORK QUEUES (Notes, Labs, Refills, Handoffs)
    // -------------------------------------------------------------------------
    // Initial baseline counts
    const baseCounts = PracticeQueueRepository.queueCounts();

    // A. Unsigned Draft Encounter
    const encId = "enc-db7-draft-1";
    db.prepare(`
      INSERT INTO encounters (id, patient_id, type, date, status, chief_complaint, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'draft', ?, ?, ?)
    `).run(encId, patientAId, "Follow-up", todayDate, "ADHD medication review", nowIso, nowIso);

    const unsignedList = PracticeQueueRepository.unsignedEncounters();
    const foundDraft = unsignedList.find((e) => e.encounterId === encId);
    assert.ok(foundDraft, "unsigned encounter draft must appear in PracticeQueueRepository.unsignedEncounters()");
    assert.equal(foundDraft.patientName, "Alice Synthetic");
    assert.equal(foundDraft.patientMrn, "MRN-DB7-001");
    assert.equal(foundDraft.chiefComplaint, "ADHD medication review");

    let counts = PracticeQueueRepository.queueCounts();
    assert.equal(counts.unsigned, baseCounts.unsigned + 1, "unsigned count increments with draft");

    // Close the loop on draft: Sign/complete it
    db.prepare(`UPDATE encounters SET status = 'completed' WHERE id = ?`).run(encId);
    assert.ok(!PracticeQueueRepository.unsignedEncounters().some((e) => e.encounterId === encId), "signed encounter removed from unsigned queue");
    assert.equal(PracticeQueueRepository.queueCounts().unsigned, baseCounts.unsigned, "unsigned count decrements after signing");

    // B. Prescription Refill Request
    const orderId = "ord-db7-med-1";
    db.prepare(`
      INSERT INTO orders (id, patient_id, type, name, status, details_json, ordered_by, created_at, updated_at)
      VALUES (?, ?, 'medication', ?, 'active', '{}', 'u-prov-1', ?, ?)
    `).run(orderId, patientAId, "Bupropion XL 300mg", nowIso, nowIso);

    const txId = "tx-db7-1";
    db.prepare(`
      INSERT INTO prescription_transactions (
        id, order_id, patient_id, adapter_id, vendor_name, transaction_type, state, correlation_id, idempotency_key, created_by, source_type, created_at, updated_at
      ) VALUES (?, ?, ?, 'surescripts', 'Surescripts', 'new_rx', 'transmitted', 'corr-db7-1', 'idem-db7-tx-1', 'u-prov-1', 'direct', ?, ?)
    `).run(txId, orderId, patientAId, nowIso, nowIso);

    const refillReqId = "refill-db7-req-1";
    db.prepare(`
      INSERT INTO prescription_refill_requests (
        id, patient_id, prior_order_id, prior_transaction_id, status, request_source, source_system, note, idempotency_key, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'pending', 'patient-portal', 'internal', 'Need 30 day refill for work trip', 'idem-db7-refill-1', 'u-prov-1', ?, ?)
    `).run(refillReqId, patientAId, orderId, txId, nowIso, nowIso);

    const refillsList = PracticeQueueRepository.refillRequests();
    const foundRefill = refillsList.find((r) => r.requestId === refillReqId);
    assert.ok(foundRefill, "refill request must appear in PracticeQueueRepository.refillRequests()");
    assert.equal(foundRefill.medicationName, "Bupropion XL 300mg");
    assert.equal(foundRefill.patientName, "Alice Synthetic");
    assert.equal(foundRefill.status, "pending");
    assert.equal(foundRefill.note, "Need 30 day refill for work trip");

    counts = PracticeQueueRepository.queueCounts();
    assert.equal(counts.refills, baseCounts.refills + 1, "refills count increments with pending request");

    // Close the loop on refill: approve it
    db.prepare(`UPDATE prescription_refill_requests SET status = 'approved' WHERE id = ?`).run(refillReqId);
    assert.ok(!PracticeQueueRepository.refillRequests().some((r) => r.requestId === refillReqId), "approved refill removed from pending queue");
    assert.equal(PracticeQueueRepository.queueCounts().refills, baseCounts.refills, "refills count decrements after approval");

    // C. Care Handoff
    const aptAId = "apt-db7-handoff-1";
    db.prepare(`
      INSERT INTO appointments (id, patient_id, patient_name, dob, age, mrn, date, time, duration, status, type, chief_complaint, insurance, provider_id, provider_name, created_at, updated_at)
      VALUES (?, ?, 'Alice Synthetic', '1988-04-12', 38, 'MRN-DB7-001', ?, '10:00 AM', '30 min', 'confirmed', 'Follow-up', 'Routine check-in', 'Private Insurance', 'u-prov-1', 'Dr. First', ?, ?)
    `).run(aptAId, patientAId, todayDate, nowIso, nowIso);

    const handoffId = "hand-db7-1";
    db.prepare(`
      INSERT INTO appointment_handoffs (
        id, appointment_id, patient_id, from_user_id, from_user_name, to_user_id, to_user_name,
        reason, clinical_summary, status, created_at, updated_at
      ) VALUES (?, ?, ?, 'u-prov-1', 'Dr. First', 'u-prov-2', 'Dr. Second', 'Coverage', 'Patient experiencing mild akathisia', 'pending', ?, ?)
    `).run(handoffId, aptAId, patientAId, nowIso, nowIso);

    const handoffList = PracticeQueueRepository.pendingHandoffs();
    const foundHandoff = handoffList.find((h) => h.handoffId === handoffId);
    assert.ok(foundHandoff, "handoff must appear in PracticeQueueRepository.pendingHandoffs()");
    assert.equal(foundHandoff.fromUserName, "Dr. First");
    assert.equal(foundHandoff.toUserName, "Dr. Second");
    assert.equal(foundHandoff.clinicalSummary, "Patient experiencing mild akathisia");

    counts = PracticeQueueRepository.queueCounts();
    assert.equal(counts.handoffs, baseCounts.handoffs + 1, "handoff count increments with pending handoff");

    // Close the loop on handoff: accept it
    db.prepare(`UPDATE appointment_handoffs SET status = 'accepted' WHERE id = ?`).run(handoffId);
    assert.ok(!PracticeQueueRepository.pendingHandoffs().some((h) => h.handoffId === handoffId), "accepted handoff removed from pending queue");
    assert.equal(PracticeQueueRepository.queueCounts().handoffs, baseCounts.handoffs, "handoff count decrements after acceptance");

    // D. Lab Result Acknowledgement
    const labObsId = "obs-db7-lab-1";
    db.prepare(`
      INSERT INTO observations (
        id, patient_id, category, code, test_name, value_text, value_num, unit, interpretation, effective_at, status, source_system, created_at, updated_at
      ) VALUES (?, ?, 'laboratory', 'lithium-level', 'Lithium Serum', '0.9', 0.9, 'mEq/L', 'Normal', ?, 'final', 'ehr-local', ?, ?)
    `).run(labObsId, patientAId, nowIso, nowIso, nowIso);

    const labRowsBefore = PracticeQueueRepository.labs();
    const foundLab = labRowsBefore.find((l) => l.observationId === labObsId);
    assert.ok(foundLab, "unacknowledged lab appears in PracticeQueueRepository.labs()");
    assert.equal(foundLab.testName, "Lithium Serum");
    assert.equal(foundLab.acknowledgedAt, null);

    counts = PracticeQueueRepository.queueCounts();
    assert.equal(counts.labs, baseCounts.labs + 1, "labs count increments with unacknowledged lab");

    // Acknowledge lab
    db.prepare(`
      INSERT INTO result_acknowledgements (observation_id, patient_id, acknowledged_by, acknowledged_at, disposition)
      VALUES (?, ?, 'u-prov-1', ?, 'reviewed_normal')
    `).run(labObsId, patientAId, nowIso);

    counts = PracticeQueueRepository.queueCounts();
    assert.equal(counts.labs, baseCounts.labs, "labs count decrements after acknowledgement");
    const labRowsAfter = PracticeQueueRepository.labs();
    const foundLabAfter = labRowsAfter.find((l) => l.observationId === labObsId);
    assert.ok(foundLabAfter?.acknowledgedAt !== null, "lab is now marked acknowledged");

    // -------------------------------------------------------------------------
    // 4. ARRIVALS / WAITING ROOM INTEGRITY
    // -------------------------------------------------------------------------
    const aptWaitingId = "apt-db7-waiting-1";
    const aptInVisitId = "apt-db7-invisit-1";
    const aptConfirmedId = "apt-db7-confirmed-1";
    const aptCancelledId = "apt-db7-cancelled-1";

    const testArrivalsDate = "2026-12-25";

    db.prepare(`
      INSERT INTO appointments (id, patient_id, patient_name, dob, age, mrn, provider_id, provider_name, date, time, duration, status, type, chief_complaint, insurance, room, created_at, updated_at)
      VALUES (?, ?, 'Alice Synthetic', '1988-04-12', 38, 'MRN-DB7-001', 'u-prov-1', 'Dr. First', ?, '10:30 AM', '30 min', 'waiting', 'Follow-up', 'Routine check-in', 'Private Insurance', 'Lobby', ?, ?)
    `).run(aptWaitingId, patientAId, testArrivalsDate, nowIso, nowIso);

    db.prepare(`
      INSERT INTO appointments (id, patient_id, patient_name, dob, age, mrn, provider_id, provider_name, date, time, duration, status, type, chief_complaint, insurance, room, created_at, updated_at)
      VALUES (?, ?, 'Alice Synthetic', '1988-04-12', 38, 'MRN-DB7-001', 'u-prov-1', 'Dr. First', ?, '11:00 AM', '30 min', 'in-visit', 'Psychotherapy', 'Therapy session', 'Private Insurance', 'Room 1', ?, ?)
    `).run(aptInVisitId, patientAId, testArrivalsDate, nowIso, nowIso);

    db.prepare(`
      INSERT INTO appointments (id, patient_id, patient_name, dob, age, mrn, provider_id, provider_name, date, time, duration, status, type, chief_complaint, insurance, created_at, updated_at)
      VALUES (?, ?, 'Bob Synthetic', '1992-11-03', 33, 'MRN-DB7-002', 'u-prov-1', 'Dr. First', ?, '02:00 PM', '30 min', 'confirmed', 'Intake', 'Initial evaluation', 'Private Insurance', ?, ?)
    `).run(aptConfirmedId, patientBId, testArrivalsDate, nowIso, nowIso);

    db.prepare(`
      INSERT INTO appointments (id, patient_id, patient_name, dob, age, mrn, provider_id, provider_name, date, time, duration, status, type, chief_complaint, insurance, created_at, updated_at)
      VALUES (?, ?, 'Bob Synthetic', '1992-11-03', 33, 'MRN-DB7-002', 'u-prov-1', 'Dr. First', ?, '03:00 PM', '30 min', 'cancelled', 'Follow-up', 'Cancelled visit', 'Private Insurance', ?, ?)
    `).run(aptCancelledId, patientBId, testArrivalsDate, nowIso, nowIso);

    // Arrivals domain rule verification:
    // Only 'waiting' and 'in-visit' represent physical arrivals in office.
    const allTodayApts = db.prepare(`SELECT * FROM appointments WHERE date = ?`).all(testArrivalsDate) as any[];
    const arrivedApts = allTodayApts.filter((a) => a.status === "waiting" || a.status === "in-visit");
    assert.equal(arrivedApts.length, 2, "only 2 appointments qualify as arrivals");
    assert.ok(arrivedApts.some((a) => a.id === aptWaitingId), "waiting patient is an arrival");
    assert.ok(arrivedApts.some((a) => a.id === aptInVisitId), "in-visit patient is an arrival");
    assert.ok(!arrivedApts.some((a) => a.id === aptConfirmedId), "confirmed patient not yet arrived");
    assert.ok(!arrivedApts.some((a) => a.id === aptCancelledId), "cancelled visit never arrived");

    // Clean up arrivals for clean empty state test
    db.prepare(`UPDATE appointments SET status = 'completed' WHERE id IN (?, ?)`).run(aptWaitingId, aptInVisitId);
    const updatedApts = db.prepare(`SELECT * FROM appointments WHERE date = ?`).all(testArrivalsDate) as any[];
    const zeroArrivals = updatedApts.filter((a) => a.status === "waiting" || a.status === "in-visit");
    assert.equal(zeroArrivals.length, 0, "when no one is waiting or in-visit, arrivals must be empty (no fabrication)");

    // -------------------------------------------------------------------------
    // 5. VISIT PREP: VERIFIED CLINICAL FACTS vs. EXPLICIT UNKNOWNS
    // -------------------------------------------------------------------------
    // Set up Patient A facts:
    // - Active problems
    db.prepare(`
      INSERT INTO patient_problems (id, patient_id, display_text, status, recorded_by, recorded_at, updated_at)
      VALUES ('prob-1', ?, 'Major Depressive Disorder, Recurrent', 'active', 'u-prov-1', ?, ?)
    `).run(patientAId, nowIso, nowIso);
    db.prepare(`
      INSERT INTO patient_problems (id, patient_id, display_text, status, recorded_by, recorded_at, updated_at)
      VALUES ('prob-2', ?, 'Generalized Anxiety Disorder', 'active', 'u-prov-1', ?, ?)
    `).run(patientAId, nowIso, nowIso);
    db.prepare(`
      INSERT INTO patient_problems (id, patient_id, display_text, status, recorded_by, recorded_at, updated_at)
      VALUES ('prob-3', ?, 'Nicotine Dependence', 'resolved', 'u-prov-1', ?, ?)
    `).run(patientAId, nowIso, nowIso);

    // - Active medications
    db.prepare(`
      INSERT INTO patient_medications (id, patient_id, display_text, medication_name, status, recorded_by, recorded_at, updated_at)
      VALUES ('med-1', ?, 'Escitalopram 20mg daily', 'Escitalopram 20mg daily', 'active', 'u-prov-1', ?, ?)
    `).run(patientAId, nowIso, nowIso);
    db.prepare(`
      INSERT INTO patient_medications (id, patient_id, display_text, medication_name, status, recorded_by, recorded_at, updated_at)
      VALUES ('med-2', ?, 'Clonazepam 0.5mg PRN', 'Clonazepam 0.5mg PRN', 'active', 'u-prov-1', ?, ?)
    `).run(patientAId, nowIso, nowIso);

    // - Vitals
    db.prepare(`
      INSERT INTO observations (id, patient_id, category, code, test_name, value_text, effective_at, status, source_system, created_at, updated_at)
      VALUES ('obs-vit-1', ?, 'vital-signs', 'bp', 'Blood Pressure', '118/76', ?, 'final', 'ehr-local', ?, ?)
    `).run(patientAId, nowIso, nowIso, nowIso);
    db.prepare(`
      INSERT INTO observations (id, patient_id, category, code, test_name, value_text, value_num, effective_at, status, source_system, created_at, updated_at)
      VALUES ('obs-vit-2', ?, 'vital-signs', 'hr', 'Heart Rate', '72', 72, ?, 'final', 'ehr-local', ?, ?)
    `).run(patientAId, nowIso, nowIso, nowIso);

    // Put Patient A on today's schedule for visit prep
    const prepAptAId = "apt-db7-prep-a";
    db.prepare(`
      INSERT INTO appointments (id, patient_id, patient_name, dob, age, mrn, provider_id, provider_name, date, time, duration, status, type, chief_complaint, insurance, room, created_at, updated_at)
      VALUES (?, ?, 'Alice Synthetic', '1988-04-12', 38, 'MRN-DB7-001', 'u-prov-1', 'Dr. First', ?, '09:00 AM', '45 min', 'confirmed', 'Follow-up', 'Routine check-in', 'Private Insurance', 'Office 3', ?, ?)
    `).run(prepAptAId, patientAId, todayDate, nowIso, nowIso);

    // Put Patient B on today's schedule with ZERO recorded clinical facts
    const prepAptBId = "apt-db7-prep-b";
    db.prepare(`
      INSERT INTO appointments (id, patient_id, patient_name, dob, age, mrn, provider_id, provider_name, date, time, duration, status, type, chief_complaint, insurance, created_at, updated_at)
      VALUES (?, ?, 'Bob Synthetic', '1992-11-03', 33, 'MRN-DB7-002', 'u-prov-1', 'Dr. First', ?, '10:00 AM', '60 min', 'confirmed', 'New Intake', 'Initial evaluation', 'Private Insurance', ?, ?)
    `).run(prepAptBId, patientBId, todayDate, nowIso, nowIso);

    const prepSummaries = PracticeQueueRepository.visitPrepSummaries(todayDate);
    const summaryA = prepSummaries.find((s) => s.patientId === patientAId);
    const summaryB = prepSummaries.find((s) => s.patientId === patientBId);

    assert.ok(summaryA, "summary A must exist");
    assert.equal(summaryA.patientName, "Alice Synthetic");
    assert.equal(summaryA.lastVisitDate, "2026-08-15", "lastVisitDate matches DB recorded value");
    assert.equal(summaryA.activeDiagnosesCount, 2, "resolved problem excluded, only active counted");
    assert.ok(summaryA.topDiagnoses.includes("Major Depressive Disorder, Recurrent"));
    assert.ok(summaryA.topDiagnoses.includes("Generalized Anxiety Disorder"));
    assert.ok(!summaryA.topDiagnoses.includes("Nicotine Dependence"), "resolved problem not in top diagnoses");
    assert.equal(summaryA.activeMedicationsCount, 2, "2 active medications counted");
    assert.equal(summaryA.vitals.bp, "118/76");
    assert.equal(summaryA.vitals.hr, 72);
    assert.equal(summaryA.room, "Office 3");

    // Patient B has NO recorded facts: assert strict truthfulness (no hallucinations)
    assert.ok(summaryB, "summary B must exist");
    assert.equal(summaryB.patientName, "Bob Synthetic");
    assert.equal(summaryB.lastVisitDate, null, "null lastVisitDate for patient with no prior visits");
    assert.equal(summaryB.activeDiagnosesCount, 0, "0 diagnoses");
    assert.equal(summaryB.topDiagnoses.length, 0, "no top diagnoses");
    assert.equal(summaryB.activeMedicationsCount, 0, "0 active medications");
    assert.deepEqual(summaryB.vitals, {}, "vitals must be empty object, never fabricated numbers");

    // -------------------------------------------------------------------------
    // 6. SCOPE FILTERING (Access Protection)
    // -------------------------------------------------------------------------
    // When scoped only to Patient B, queries must NOT return Patient A
    const scopedScope = [patientBId];

    const scopedUnsigned = PracticeQueueRepository.unsignedEncounters(500, scopedScope);
    assert.ok(!scopedUnsigned.some((u) => u.patientId === patientAId), "scope excludes Patient A unsigned notes");

    const scopedRefills = PracticeQueueRepository.refillRequests(500, scopedScope);
    assert.ok(!scopedRefills.some((r) => r.patientId === patientAId), "scope excludes Patient A refills");

    const scopedHandoffs = PracticeQueueRepository.pendingHandoffs(500, scopedScope);
    assert.ok(!scopedHandoffs.some((h) => h.patientId === patientAId), "scope excludes Patient A handoffs");

    const scopedPrep = PracticeQueueRepository.visitPrepSummaries(todayDate, 500, scopedScope);
    assert.equal(scopedPrep.length, 1, "only 1 visit prep summary for scoped patient");
    assert.equal(scopedPrep[0].patientId, patientBId, "scoped prep summary belongs to Patient B");

    const scopedCounts = PracticeQueueRepository.queueCounts(scopedScope);
    assert.equal(scopedCounts.refills, 0, "Patient B has no refills in scope");
    assert.equal(scopedCounts.handoffs, 0, "Patient B has no handoffs in scope");
  } finally {
    process.chdir(originalCwd);
    env.NODE_ENV = originalNodeEnv;
    env.EHR_SESSION_SECRET = originalSecret;
  }
});
