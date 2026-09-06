import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("lab result -> AI visibility -> acknowledgement -> provenance retained", async () => {
  const originalCwd = process.cwd();
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-lab-result-lifecycle-"));
  process.chdir(isolatedRoot);

  try {
    const [{ ClinicalActionGateway }, { ContextAssembler }, { ClinicalRecordRepository }] = await Promise.all([
      import("../app/server/actions/clinical-action-gateway"),
      import("../app/server/context/context-assembler"),
      import("../app/server/repositories/clinical-record-repository"),
    ]);

    const patientId = "test-lab-result-patient";
    const actor = {
      userId: "test-provider",
      displayName: "Test Provider",
      credentials: "PMHNP-BC",
      role: "provider" as const,
    };
    const context = { source: "api" as const, requestId: "test-lab-result-lifecycle" };

    await ClinicalActionGateway.execute({
      actor,
      context,
      action: {
        type: "create_patient",
        payload: {
          id: patientId,
          name: "Lab Result Test",
          initials: "LR",
          dob: "01/01/1990",
          age: 36,
          pronouns: "they/them",
          mrn: "TEST-LAB-001",
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

    const result = await ClinicalActionGateway.execute({
      actor,
      context,
      action: {
        type: "add_observation",
        payload: {
          patientId,
          category: "laboratory",
          testName: "Valproic Acid",
          code: "4086-5",
          codingSystem: "LOINC",
          effectiveAt: "2026-09-06T08:00:00-07:00",
          valueText: "82",
          valueNum: 82,
          unit: "ug/mL",
          referenceRange: "50-100",
          status: "final",
          observedBy: "Quest Diagnostics",
          source: {
            type: "lab-interface",
            system: "quest",
            ref: "quest/results/test-lab-result-001",
          },
        },
      },
    });

    const before = ContextAssembler.assemble({ patientId, surface: "general", userRole: "provider" });
    assert.ok(before, "AI context should assemble after a result arrives");
    const aiResultBefore = before.recentLabs.find((lab) => lab.id === result.id);
    assert.ok(aiResultBefore, "AI context should include the authoritative lab result");
    assert.equal(aiResultBefore.value, "82");
    assert.equal(aiResultBefore.acknowledgedAt, undefined);

    const observationProvenance = ClinicalRecordRepository.provenance("observation", result.id);
    assert.equal(observationProvenance.length, 1);
    assert.equal(observationProvenance[0].source_type, "lab-interface");
    assert.equal(observationProvenance[0].source_system, "quest");
    assert.equal(observationProvenance[0].source_ref, "quest/results/test-lab-result-001");

    const acknowledgement = await ClinicalActionGateway.execute({
      actor,
      context,
      action: {
        type: "acknowledge_result",
        payload: {
          observationId: result.id,
          disposition: "reviewed-no-action",
          note: "Reviewed; within therapeutic range.",
        },
      },
    });

    const stored = ClinicalRecordRepository
      .observations(patientId, "laboratory")
      .find((row) => row.id === result.id);
    assert.ok(stored, "result should remain in the authoritative observation history");
    assert.equal(stored.acknowledged_by, "Test Provider, PMHNP-BC");
    assert.equal(stored.disposition, "reviewed-no-action");
    assert.equal(stored.acknowledgement_note, "Reviewed; within therapeutic range.");

    const after = ContextAssembler.assemble({ patientId, surface: "general", userRole: "provider" });
    assert.ok(after, "AI context should assemble after acknowledgement");
    const aiResultAfter = after.recentLabs.find((lab) => lab.id === result.id);
    assert.ok(aiResultAfter, "AI context should still include the result after acknowledgement");
    assert.ok(aiResultAfter.acknowledgedAt, "AI context should know the result has been acknowledged");

    const ackVersions = ClinicalRecordRepository.versions("result_acknowledgement", acknowledgement.id);
    const ackProvenance = ClinicalRecordRepository.provenance("result_acknowledgement", acknowledgement.id);
    assert.equal(ackVersions.length, 1, "acknowledgement should have an immutable version record");
    assert.equal(ackVersions[0].operation, "acknowledge");
    assert.equal(ackProvenance.length, 1, "acknowledgement should retain provenance");
    assert.equal(ackProvenance[0].source_ref, `observations/${result.id}`);

    await assert.rejects(
      ClinicalActionGateway.execute({
        actor,
        context,
        action: {
          type: "acknowledge_result",
          payload: { observationId: result.id, disposition: "reviewed-again" },
        },
      }),
      /already been acknowledged/i,
      "the same result must not be acknowledged twice as separate legal events",
    );
  } finally {
    process.chdir(originalCwd);
  }
});
