import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { grantSyntheticOrganizationAccess } from "./helpers/organization-access";

test("guidance persists with authenticated actor, append-only history, patient binding and signed integrity", async () => {
  const cwd = process.cwd();
  process.chdir(mkdtempSync(join(tmpdir(), "ehr-live-guidance-")));
  try {
    const [
      { ClinicalActionGateway },
      { EncounterRepository },
      { getDatabase },
    ] = await Promise.all([
      import("../app/server/actions/clinical-action-gateway"),
      import("../app/server/repositories/encounter-repository"),
      import("../app/server/db/connection"),
    ]);
    const actor = {
      userId: "guidance-provider",
      displayName: "Synthetic Provider",
      role: "provider" as const,
    };
    await grantSyntheticOrganizationAccess([actor.userId]);
    const context = { source: "ui" as const };
    const patientId = "maya-chen";
    const id = "enc-guidance-test";
    const entry = {
      id: "g1",
      kind: "clinical-thought" as const,
      target: "assessment" as const,
      text: "Consider akathisia",
      createdAt: new Date().toISOString(),
      needsClarification: true,
      actorId: "forged-browser-actor",
    };
    const support = { guidance: [entry], attestations: [] };
    const workingState = {
      candidateActions: [],
      ambientTranscript: [],
      liveSupport: support,
    };
    const save = (
      payload: Parameters<typeof EncounterRepository.saveDraft>[0],
    ) =>
      ClinicalActionGateway.execute({
        actor,
        context,
        expectedPatientId: patientId,
        action: { type: "save_encounter_draft", payload },
      });
    await save({
      id,
      patientId,
      chiefComplaint: "Synthetic follow-up",
      intervalHistory: "Synthetic history",
      assessment: "Clinician formulation",
      plan: "Synthetic plan",
      workingState,
    });
    const saved = EncounterRepository.getById(id)!;
    assert.equal(
      saved.workingState?.liveSupport?.guidance[0].actorId,
      actor.userId,
    );
    assert.equal(saved.assessment, "Clinician formulation");
    assert.equal(
      getDatabase()
        .prepare(
          "SELECT count(*) AS count FROM encounter_provider_guidance WHERE encounter_id = ?",
        )
        .get(id)?.count,
      1,
    );
    await assert.rejects(
      save({
        id,
        patientId,
        plan: "Should not persist",
        workingState: {
          ...workingState,
          liveSupport: {
            guidance: [{ ...entry, text: "Established diagnosis" }],
            attestations: [],
          },
        },
      }),
      /immutable/,
    );
    assert.equal(EncounterRepository.getById(id)?.plan, "Synthetic plan");
    await save({
      id,
      patientId,
      workingState: {
        candidateActions: [],
        ambientTranscript: [],
        liveSupport: { guidance: [], attestations: [] },
      },
    });
    assert.equal(
      EncounterRepository.getById(id)?.workingState?.liveSupport?.guidance
        .length,
      1,
    );
    await assert.rejects(
      save({ id, patientId: "jordan-reed", workingState }),
      /binding|different patient/i,
    );
    await ClinicalActionGateway.execute({
      actor,
      context,
      expectedPatientId: patientId,
      action: { type: "sign_encounter", payload: { encounterId: id } },
    });
    const snapshot = getDatabase()
      .prepare(
        "SELECT * FROM signed_encounter_snapshots WHERE encounter_id = ?",
      )
      .get(id);
    assert.ok(snapshot);
    await assert.rejects(save({ id, patientId, workingState }), /immutable/);
    assert.deepEqual(
      getDatabase()
        .prepare(
          "SELECT * FROM signed_encounter_snapshots WHERE encounter_id = ?",
        )
        .get(id),
      snapshot,
    );
  } finally {
    process.chdir(cwd);
  }
});
