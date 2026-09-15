import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ClinicalRecordVersion } from "../app/domain/clinical-records";
import { doseTrajectory, summarizeMedicationTrajectory } from "../app/domain/medication-trajectory";
import { grantSyntheticOrganizationAccess } from "./helpers/organization-access";

/**
 * P3-C — medication longitudinal truth.
 *
 * Everything else P3-C asks for was already built: active and historical
 * medications, start/stop, dose/route/frequency, prescriber and source,
 * reconciliation status, external evidence kept separate, and the relationship to
 * prescription orders without collapsing the two concepts. Two things were not.
 *
 * 1. **"Review prior dose trajectory"** — the last clinician task in the list.
 *    Every write stamps a full snapshot into `record_versions`, so the trajectory
 *    had been recorded all along; the history panel rendered `v3 · update` and,
 *    from the snapshot, only the status. Three titrations displayed as three
 *    identical lines reading "active".
 * 2. **"Indication where useful"** — `MedicationPrescriptionIntent` has carried an
 *    indication all along and the confirmation step dropped it, so the reason for
 *    a medication existed at the moment of prescribing and was gone from the chart
 *    a minute later.
 */

function version(
  versionNumber: number,
  snapshot: Record<string, unknown>,
  overrides: Partial<ClinicalRecordVersion> = {},
): ClinicalRecordVersion {
  return {
    id: `ver-${versionNumber}`,
    patient_id: "p1",
    entity_type: "medication",
    entity_id: "med-1",
    version_number: versionNumber,
    operation: versionNumber === 1 ? "create" : "update",
    snapshot_json: JSON.stringify(snapshot),
    snapshot,
    actor_id: "team-taylor",
    actor_name: "Dr. Taylor",
    source_type: "clinician",
    source_ref: null,
    created_at: `2026-0${versionNumber}-01T10:00:00.000Z`,
    ...overrides,
  };
}

test("a trajectory reports what each write changed, not merely that it happened", () => {
  // A titration: 50 → 100 → 150, then discontinued.
  const versions = [
    version(4, { medication_name: "Sertraline", dose: "150 mg", frequency: "Once daily", status: "discontinued", end_date: "2026-04-01" }),
    version(3, { medication_name: "Sertraline", dose: "150 mg", frequency: "Once daily", status: "active" }),
    version(2, { medication_name: "Sertraline", dose: "100 mg", frequency: "Once daily", status: "active" }),
    version(1, { medication_name: "Sertraline", dose: "50 mg", frequency: "Once daily", status: "active" }),
  ];

  const entries = summarizeMedicationTrajectory(versions);
  assert.equal(entries.length, 4);
  assert.deepEqual(entries.map((entry) => entry.versionNumber), [4, 3, 2, 1], "newest first");

  // The discontinuation changed status and stopped date, and nothing else.
  assert.deepEqual(
    entries[0].changes.map((change) => `${change.field}:${change.from}→${change.to}`),
    ["status:active→discontinued", "end_date:null→2026-04-01"],
  );

  // The titration that mattered clinically.
  assert.deepEqual(
    entries[1].changes.map((change) => `${change.field}:${change.from}→${change.to}`),
    ["dose:100 mg→150 mg"],
    "a dose change is reported as the move it was, not as 'active'",
  );

  // The creation has no "from"; its tracked values are what it started as.
  assert.equal(entries[3].initial, true);
  assert.deepEqual(
    entries[3].changes.map((change) => `${change.field}=${change.to}`),
    ["medication_name=Sertraline", "dose=50 mg", "frequency=Once daily", "status=active"],
  );
  assert.ok(entries[3].changes.every((change) => change.from === null));
});

test("a version that moved nothing clinical says so rather than rendering blank", () => {
  // Display text and provenance move without the prescription changing. An empty
  // row would read as a titration that did not happen.
  const entries = summarizeMedicationTrajectory([
    version(2, { medication_name: "Sertraline", dose: "100 mg", status: "active" }),
    version(1, { medication_name: "Sertraline", dose: "100 mg", status: "active" }),
  ]);

  assert.equal(entries[0].changes.length, 0);
  assert.equal(entries[0].unreadable, false, "nothing changed is not the same as nothing readable");
});

test("an unreadable snapshot is reported, never silently skipped", () => {
  // A silent omission in a dose history reads as "no change", which is the one
  // thing it must not be able to mean.
  const broken = version(2, {} as Record<string, unknown>);
  const entries = summarizeMedicationTrajectory([broken, version(1, { dose: "50 mg", status: "active" })]);

  assert.equal(entries.length, 2, "the version is still listed");
  assert.equal(entries[0].unreadable, true);
  assert.equal(entries[0].changes.length, 0);
});

test("the trajectory reads forwards however the versions arrive", () => {
  // A caller that sorted ascending would otherwise get a history that reads
  // backwards while looking entirely plausible.
  const ascending = [
    version(1, { dose: "50 mg", status: "active" }),
    version(2, { dose: "100 mg", status: "active" }),
  ];

  const entries = summarizeMedicationTrajectory(ascending);
  assert.deepEqual(entries.map((entry) => entry.versionNumber), [2, 1]);
  assert.deepEqual(
    entries[0].changes.map((change) => `${change.from}→${change.to}`),
    ["50 mg→100 mg"],
    "the newer version is the one that changed, whichever order it was handed over in",
  );
});

test("the dose line shows only the writes that moved the dose", () => {
  const versions = [
    version(5, { dose: "150 mg", status: "discontinued" }),
    version(4, { dose: "150 mg", status: "active", prescriber: "Dr. Chen" }),
    version(3, { dose: "150 mg", status: "active" }),
    version(2, { dose: "100 mg", status: "active" }),
    version(1, { dose: "50 mg", status: "active" }),
  ];

  const points = doseTrajectory(versions);
  assert.deepEqual(points.map((point) => point.dose), ["50 mg", "100 mg", "150 mg"], "oldest first, one point per move");
  assert.deepEqual(points.map((point) => point.versionNumber), [1, 2, 3]);

  // A medication that never moved is one point — a fact about the record, kept
  // distinct from having no history at all.
  assert.equal(doseTrajectory([version(1, { dose: "20 mg", status: "active" })]).length, 1);
  assert.equal(doseTrajectory([]).length, 0);
});

test("a medication's indication survives the step from prescription to chart", async () => {
  const originalCwd = process.cwd();
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-medication-truth-"));
  process.chdir(isolatedRoot);

  try {
    const [
      { ClinicalRecordRepository },
      { ClinicalActionGateway },
      { ensureClinicalRecordFoundation },
      { getDatabase },
      { validateClinicalRecordAction },
    ] = await Promise.all([
      import("../app/server/repositories/clinical-record-repository"),
      import("../app/server/actions/clinical-action-gateway"),
      import("../app/server/db/clinical-record-foundation"),
      import("../app/server/db/connection"),
      import("../app/server/actions/clinical-record-validation"),
    ]);

    ensureClinicalRecordFoundation(getDatabase());
    await grantSyntheticOrganizationAccess(["team-taylor"]);

    const actor = { userId: "team-taylor", displayName: "Dr. Taylor", role: "provider" as const };
    const context = { source: "api" as const, requestId: "medication-truth-test" };
    const patientId = "maya-chen";

    const created = (await ClinicalActionGateway.execute({
      actor, context, expectedPatientId: patientId,
      action: {
        type: "add_medication",
        payload: {
          patientId,
          displayText: "Lamotrigine 25 mg nightly",
          medicationName: "Lamotrigine",
          dose: "25 mg",
          frequency: "At bedtime",
        },
      },
    })) as any;

    // The column exists and is honestly empty rather than absent, so a medication
    // recorded without a reason is distinguishable from one whose reason was lost.
    assert.ok("indication" in created, "the medication record carries an indication field");
    assert.equal(created.indication, null);

    // A titration, then a stop — the writes a dose trajectory is made of.
    await ClinicalActionGateway.execute({
      actor, context, expectedPatientId: patientId,
      action: { type: "update_medication", payload: { recordId: created.id, patch: { dose: "50 mg" } } },
    });
    await ClinicalActionGateway.execute({
      actor, context, expectedPatientId: patientId,
      action: {
        type: "update_medication",
        payload: { recordId: created.id, patch: { dose: "100 mg", indication: "Bipolar II maintenance" } },
      },
    });

    const stored = ClinicalRecordRepository.medications(patientId).find((row: any) => row.id === created.id);
    assert.equal(stored.indication, "Bipolar II maintenance", "an indication recorded later is kept");
    assert.equal(stored.dose, "100 mg");

    // And the history answers the question P3-C actually asks.
    const entries = summarizeMedicationTrajectory(
      ClinicalRecordRepository.versions("medication", created.id) as any,
    );
    assert.equal(entries.length, 3, "create plus two updates");
    assert.deepEqual(
      entries[0].changes.map((change) => change.field).sort(),
      ["dose", "indication"],
      "the most recent write reports both of the things it changed",
    );

    const doses = doseTrajectory(ClinicalRecordRepository.versions("medication", created.id) as any);
    assert.deepEqual(
      doses.map((point) => point.dose),
      ["25 mg", "50 mg", "100 mg"],
      "the titration is readable in the order it happened",
    );

    /**
     * The request boundary has to admit the field too.
     *
     * It did not, and only driving the real screen showed it: the clinical-record
     * route whitelists patch fields, `indication` was not on the list, and the
     * value was silently dropped between the browser and the gateway. A test that
     * calls the gateway directly — as the one above does — passes either way, so
     * the whitelist is asserted here rather than assumed.
     */
    const validatedAdd = validateClinicalRecordAction({
      type: "add_medication",
      payload: { patientId, displayText: "Sertraline 50 mg", indication: "Depressive episode" },
    }) as any;
    assert.equal(
      validatedAdd.payload.indication,
      "Depressive episode",
      "the boundary must not strip an indication on the way in",
    );

    const validatedUpdate = validateClinicalRecordAction({
      type: "update_medication",
      payload: { recordId: created.id, patch: { indication: "Panic disorder" } },
    }) as any;
    assert.equal(validatedUpdate.payload.patch.indication, "Panic disorder");
  } finally {
    process.chdir(originalCwd);
  }
});
