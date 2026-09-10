import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { grantSyntheticOrganizationAccess } from "./helpers/organization-access";

test("encounter draft optimistic revision rejects stale writes without changing server truth", async () => {
  const originalCwd = process.cwd();
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-encounter-revision-"));
  process.chdir(isolatedRoot);

  try {
    const [{ ClinicalActionGateway }, { EncounterRepository }] = await Promise.all([
      import("../app/server/actions/clinical-action-gateway"),
      import("../app/server/repositories/encounter-repository"),
    ]);

    // Patient access is an organization-membership decision. Synthetic actors must
    // declare their membership rather than being exempt from the boundary under test.
    await grantSyntheticOrganizationAccess(["test-provider"]);

    const patientId = "test-encounter-revision-patient";
    const encounterId = "test-encounter-revision";
    const actor = {
      userId: "test-provider",
      displayName: "Test Provider",
      credentials: "PMHNP-BC",
      role: "provider" as const,
    };
    const context = { source: "api" as const, requestId: "test-encounter-revision" };

    await ClinicalActionGateway.execute({
      actor,
      context,
      action: {
        type: "create_patient",
        payload: {
          id: patientId,
          name: "Revision Test",
          initials: "RT",
          dob: "01/01/1990",
          age: 36,
          pronouns: "they/them",
          mrn: "TEST-REVISION-001",
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

    const first = await ClinicalActionGateway.execute({
      actor,
      context,
      expectedPatientId: patientId,
      action: {
        type: "save_encounter_draft",
        payload: { id: encounterId, patientId, plan: "revision one" },
      },
    });

    const second = await ClinicalActionGateway.execute({
      actor,
      context,
      expectedPatientId: patientId,
      action: {
        type: "save_encounter_draft",
        payload: {
          id: encounterId,
          patientId,
          plan: "revision two",
          expectedUpdatedAt: first.updatedAt,
        } as any,
      },
    });
    assert.notEqual(second.updatedAt, first.updatedAt);

    await assert.rejects(
      ClinicalActionGateway.execute({
        actor,
        context,
        expectedPatientId: patientId,
        action: {
          type: "save_encounter_draft",
          payload: {
            id: encounterId,
            patientId,
            plan: "stale overwrite",
            expectedUpdatedAt: first.updatedAt,
          } as any,
        },
      }),
      /encounter draft conflict/i,
    );

    const authoritative = EncounterRepository.getById(encounterId);
    assert.equal(authoritative?.plan, "revision two");
    assert.equal(authoritative?.updatedAt, second.updatedAt);
  } finally {
    process.chdir(originalCwd);
  }
});
