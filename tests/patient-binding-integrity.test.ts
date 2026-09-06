import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("cross-patient links and stale-chart actions are rejected", async () => {
  const originalCwd = process.cwd();
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-patient-binding-"));
  process.chdir(isolatedRoot);

  try {
    const [{ ClinicalActionGateway }, { ClinicalRecordRepository }] = await Promise.all([
      import("../app/server/actions/clinical-action-gateway"),
      import("../app/server/repositories/clinical-record-repository"),
    ]);

    const actor = {
      userId: "test-provider",
      displayName: "Test Provider",
      credentials: "PMHNP-BC",
      role: "provider" as const,
    };
    const context = { source: "api" as const, requestId: "test-patient-binding-integrity" };

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

    const patientA = "test-patient-a";
    const patientB = "test-patient-b";
    await createPatient(patientA, "TEST-A-001", "Patient Alpha");
    await createPatient(patientB, "TEST-B-001", "Patient Beta");

    const labOrder = await ClinicalActionGateway.execute({
      actor,
      context,
      expectedPatientId: patientA,
      action: {
        type: "stage_order",
        payload: {
          id: "test-patient-a-lab-order",
          patientId: patientA,
          orderType: "lab",
          name: "Comprehensive Metabolic Panel",
          details: {},
        },
      },
    });

    await assert.rejects(
      ClinicalActionGateway.execute({
        actor,
        context,
        expectedPatientId: patientB,
        action: {
          type: "authorize_order",
          payload: { orderId: labOrder.id },
        },
      }),
      /Patient binding mismatch/i,
      "a stale Patient B chart must not authorize Patient A's order",
    );

    await assert.rejects(
      ClinicalActionGateway.execute({
        actor,
        context,
        expectedPatientId: patientB,
        action: {
          type: "add_observation",
          payload: {
            patientId: patientB,
            category: "laboratory",
            testName: "Sodium",
            valueText: "140",
            unit: "mmol/L",
            orderId: labOrder.id,
            source: { type: "lab-interface", system: "test-lab", ref: "wrong-patient-order-link" },
          },
        },
      }),
      /belongs to a different patient/i,
      "a result must never attach to another patient's order",
    );

    const document = await ClinicalActionGateway.execute({
      actor,
      context,
      expectedPatientId: patientA,
      action: {
        type: "create_document",
        payload: {
          patientId: patientA,
          documentType: "lab-report",
          title: "Outside Lab Report",
          mimeType: "text/plain",
          contentText: "Synthetic outside result",
        },
      },
    });

    await assert.rejects(
      ClinicalActionGateway.execute({
        actor,
        context,
        expectedPatientId: patientB,
        action: {
          type: "add_observation",
          payload: {
            patientId: patientB,
            category: "laboratory",
            testName: "Potassium",
            valueText: "4.1",
            unit: "mmol/L",
            documentId: document.id,
            source: { type: "document-extraction", system: "ehr-local", ref: `documents/${document.id}` },
          },
        },
      }),
      /belongs to a different patient/i,
      "a result must never attach to another patient's source document",
    );

    await assert.rejects(
      ClinicalActionGateway.execute({
        actor,
        context,
        expectedPatientId: patientB,
        action: {
          type: "revise_document",
          payload: {
            documentId: document.id,
            contentText: "This stale-chart revision must never be stored.",
          },
        },
      }),
      /Patient binding mismatch/i,
      "a stale Patient B chart must not revise Patient A's document",
    );
    assert.equal(
      ClinicalRecordRepository.documentVersions(document.id).length,
      1,
      "rejected stale-chart document revision must not create a version",
    );

    const observation = await ClinicalActionGateway.execute({
      actor,
      context,
      expectedPatientId: patientA,
      action: {
        type: "add_observation",
        payload: {
          patientId: patientA,
          category: "laboratory",
          testName: "Creatinine",
          valueText: "0.9",
          unit: "mg/dL",
        },
      },
    });

    await assert.rejects(
      ClinicalActionGateway.execute({
        actor,
        context,
        expectedPatientId: patientB,
        action: {
          type: "acknowledge_result",
          payload: { observationId: observation.id, disposition: "reviewed" },
        },
      }),
      /Patient binding mismatch/i,
      "a stale Patient B chart must not acknowledge Patient A's result",
    );

    const encounterId = "test-patient-a-encounter";
    await ClinicalActionGateway.execute({
      actor,
      context,
      expectedPatientId: patientA,
      action: {
        type: "save_encounter_draft",
        payload: {
          id: encounterId,
          patientId: patientA,
          chiefComplaint: "Follow-up",
          assessment: "Stable",
          plan: "Continue plan",
        },
      },
    });

    await assert.rejects(
      ClinicalActionGateway.execute({
        actor,
        context,
        expectedPatientId: patientB,
        action: {
          type: "sign_encounter",
          payload: { encounterId },
        },
      }),
      /Patient binding mismatch/i,
      "a stale Patient B chart must not sign Patient A's encounter",
    );

    await assert.rejects(
      ClinicalActionGateway.execute({
        actor,
        context,
        expectedPatientId: patientB,
        action: {
          type: "save_encounter_draft",
          payload: {
            id: encounterId,
            patientId: patientB,
            plan: "Wrong-patient reassignment",
          },
        },
      }),
      /Patient binding mismatch|different patient|cannot be reassigned/i,
      "an existing encounter id must never be reassigned to another patient",
    );
  } finally {
    process.chdir(originalCwd);
  }
});
