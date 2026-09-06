import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("practice queues aggregate authoritative labs and documents across patients", async () => {
  const originalCwd = process.cwd();
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-practice-queues-"));
  process.chdir(isolatedRoot);

  try {
    const [{ PatientRepository }, { ClinicalRecordRepository }, { PracticeQueueRepository }] = await Promise.all([
      import("../app/server/repositories/patient-repository"),
      import("../app/server/repositories/clinical-record-repository"),
      import("../app/server/repositories/practice-queue-repository"),
    ]);

    const actor = { userId: "queue-test-provider", displayName: "Queue Test Provider" };
    for (const [id, name, mrn, initials] of [
      ["queue-patient-a", "Queue Patient A", "QUEUE-A", "QA"],
      ["queue-patient-b", "Queue Patient B", "QUEUE-B", "QB"],
    ] as const) {
      PatientRepository.create({
        id,
        name,
        initials,
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
      });
    }

    const acknowledged = ClinicalRecordRepository.addObservation({
      patientId: "queue-patient-a",
      category: "laboratory",
      testName: "TSH",
      effectiveAt: "2026-09-05T10:00:00.000Z",
      valueText: "2.1",
      valueNum: 2.1,
      unit: "mIU/L",
      referenceRange: "0.4-4.5",
      interpretation: "normal",
    }, actor, { system: "quest", ref: "quest/result-a" });
    ClinicalRecordRepository.acknowledgeResult(acknowledged.id, { disposition: "reviewed" }, actor);

    const unacknowledged = ClinicalRecordRepository.addObservation({
      patientId: "queue-patient-b",
      category: "lab",
      testName: "Valproic Acid",
      effectiveAt: "2026-09-06T10:00:00.000Z",
      valueText: "125",
      valueNum: 125,
      unit: "ug/mL",
      referenceRange: "50-100",
      interpretation: "high",
    }, actor, { system: "labcorp", ref: "labcorp/result-b" });

    ClinicalRecordRepository.addObservation({
      patientId: "queue-patient-a",
      category: "vital-signs",
      testName: "Heart rate",
      valueText: "72 bpm",
      valueNum: 72,
    }, actor);

    const document = ClinicalRecordRepository.createDocument({
      patientId: "queue-patient-a",
      documentType: "outside-record",
      title: "Outside psychiatric evaluation",
      mimeType: "application/pdf",
      storageKey: "synthetic/outside-eval.pdf",
    }, actor, { system: "external-records", ref: "external/doc-1" });
    ClinicalRecordRepository.addDocumentVersion(document.id, {
      storageKey: "synthetic/outside-eval-v2.pdf",
      mimeType: "application/pdf",
    }, actor, { system: "external-records", ref: "external/doc-1/v2" });

    const labs = PracticeQueueRepository.labs();
    assert.equal(labs.length, 2, "only laboratory observations should appear in the practice lab queue");
    assert.equal(labs[0].observationId, unacknowledged.id, "unacknowledged results should sort before reviewed results");
    assert.equal(labs[0].patientName, "Queue Patient B");
    assert.equal(labs[0].interpretation, "high");
    assert.equal(labs[0].acknowledgedAt, null);
    assert.equal(labs[1].observationId, acknowledged.id);
    assert.equal(labs[1].disposition, "reviewed");

    const documents = PracticeQueueRepository.documents();
    assert.equal(documents.length, 1);
    assert.equal(documents[0].patientName, "Queue Patient A");
    assert.equal(documents[0].documentType, "outside-record");
    assert.equal(documents[0].currentVersion, 2);
    assert.equal(documents[0].sourceSystem, "external-records");
  } finally {
    process.chdir(originalCwd);
  }
});
