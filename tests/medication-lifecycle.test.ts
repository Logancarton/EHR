import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("prescribe -> active medication -> discontinue -> history retained -> AI sees current state", async () => {
  const originalCwd = process.cwd();
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-medication-lifecycle-"));
  process.chdir(isolatedRoot);

  try {
    const [
      { ClinicalActionGateway },
      { ContextAssembler },
      { PatientRepository },
      { ClinicalRecordRepository },
    ] = await Promise.all([
      import("../app/server/actions/clinical-action-gateway"),
      import("../app/server/context/context-assembler"),
      import("../app/server/repositories/patient-repository"),
      import("../app/server/repositories/clinical-record-repository"),
    ]);

    const patientId = "test-medication-lifecycle-patient";
    const orderId = "test-medication-lifecycle-order";
    const displayText = "Buspirone 7.5 mg twice daily";
    const actor = {
      userId: "test-provider",
      displayName: "Test Provider",
      credentials: "PMHNP-BC",
      role: "provider" as const,
    };
    const context = {
      source: "api" as const,
      requestId: "test-medication-lifecycle",
    };

    await ClinicalActionGateway.execute({
      actor,
      context,
      action: {
        type: "create_patient",
        payload: {
          id: patientId,
          name: "Medication Lifecycle Test",
          initials: "ML",
          dob: "01/01/1990",
          age: 36,
          pronouns: "they/them",
          mrn: "TEST-MED-001",
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

    const staged = await ClinicalActionGateway.execute({
      actor,
      context,
      action: {
        type: "stage_order",
        payload: {
          id: orderId,
          patientId,
          orderType: "medication",
          name: "Buspirone 7.5 mg tablet",
          details: {
            displayText,
            medicationName: "Buspirone",
            genericName: "buspirone",
            strength: "7.5 mg",
            dose: "7.5 mg",
            route: "oral",
            frequency: "twice daily",
            sig: "Take 1 tablet by mouth twice daily",
          },
        },
      },
    });
    assert.equal(staged.status, "staged");

    const authorized = await ClinicalActionGateway.execute({
      actor,
      context,
      action: {
        type: "authorize_order",
        payload: {
          orderId,
          authMetadata: { target: "test-pharmacy" },
        },
      },
    });
    assert.equal(authorized.status, "authorized");

    const activePatient = PatientRepository.getById(patientId);
    assert.ok(activePatient, "patient should still exist after prescribing");
    assert.ok(
      activePatient.meds.includes(displayText),
      "authorized prescription should appear in the active medication projection",
    );

    const medicationRows = ClinicalRecordRepository.medications(patientId);
    const medication = medicationRows.find((row) => row.source_ref === `orders/${orderId}`);
    assert.ok(medication, "authorized prescription should create an authoritative medication record");
    assert.equal(medication.status, "active");

    const aiBeforeDiscontinue = ContextAssembler.assemble({
      patientId,
      surface: "general",
      userRole: "provider",
    });
    assert.ok(aiBeforeDiscontinue, "AI context should assemble for the test patient");
    assert.ok(
      aiBeforeDiscontinue.activeMedications.includes(displayText),
      "AI context should see the newly prescribed active medication",
    );

    await ClinicalActionGateway.execute({
      actor,
      context,
      action: {
        type: "update_medication",
        payload: {
          recordId: medication.id,
          patch: {
            status: "discontinued",
            endDate: "2026-09-06",
          },
          source: {
            type: "clinician",
            system: "ehr-local",
            ref: `medications/${medication.id}/discontinue`,
          },
        },
      },
    });

    const currentPatient = PatientRepository.getById(patientId);
    assert.ok(currentPatient, "patient should still exist after discontinuation");
    assert.ok(
      !currentPatient.meds.includes(displayText),
      "discontinued medication should no longer appear in the active medication projection",
    );

    const retainedMedication = ClinicalRecordRepository
      .medications(patientId)
      .find((row) => row.id === medication.id);
    assert.ok(retainedMedication, "discontinued medication should remain in authoritative history");
    assert.equal(retainedMedication.status, "discontinued");
    assert.equal(retainedMedication.end_date, "2026-09-06");

    const versions = ClinicalRecordRepository.versions("medication", medication.id);
    assert.equal(versions.length, 2, "medication should retain create and discontinue versions");
    assert.equal(versions[0].operation, "update");
    assert.equal(versions[0].snapshot.status, "discontinued");
    assert.equal(versions[1].operation, "create");
    assert.equal(versions[1].snapshot.status, "active");

    const provenance = ClinicalRecordRepository.provenance("medication", medication.id);
    assert.equal(provenance.length, 2, "medication should retain provenance for creation and discontinuation");
    assert.equal(provenance[0].source_ref, `orders/${orderId}`);
    assert.equal(provenance[0].source_type, "prescription-order");

    const aiAfterDiscontinue = ContextAssembler.assemble({
      patientId,
      surface: "general",
      userRole: "provider",
    });
    assert.ok(aiAfterDiscontinue, "AI context should still assemble after discontinuation");
    assert.ok(
      !aiAfterDiscontinue.activeMedications.includes(displayText),
      "AI context should no longer treat the discontinued medication as active",
    );

    const reauthorized = await ClinicalActionGateway.execute({
      actor,
      context,
      action: {
        type: "authorize_order",
        payload: {
          orderId,
          authMetadata: { target: "test-pharmacy" },
        },
      },
    });
    assert.equal(reauthorized.status, "authorized");
    const sameOrderMedications = ClinicalRecordRepository
      .medications(patientId)
      .filter((row) => row.source_ref === `orders/${orderId}`);
    assert.equal(
      sameOrderMedications.length,
      1,
      "re-authorizing the same prescription order must not create a duplicate medication record",
    );
  } finally {
    process.chdir(originalCwd);
  }
});
