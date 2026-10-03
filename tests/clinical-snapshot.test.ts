import test from "node:test";
import assert from "node:assert/strict";
import { assertClinicalSnapshotPatient } from "../app/domain/clinical-snapshot";
import type { ClinicalRecordSnapshot } from "../app/domain/clinical-records";

const empty = (): ClinicalRecordSnapshot => ({ problems: [], allergies: [], medications: [], observations: [], vitals: [],
  assessments: [], psychiatricHistory: [], encounters: [], documents: [], upcomingAppointments: [] });

test("empty authorized snapshot is accepted without fictional context", () => {
  assert.doesNotThrow(() => assertClinicalSnapshotPatient(empty(), "patient-a"));
});

test("every identified clinical facet rejects wrong-patient context", () => {
  const snake = ["problems", "allergies", "medications", "observations"] as const;
  const camel = ["assessments", "psychiatricHistory", "encounters", "documents", "upcomingAppointments"] as const;
  for (const key of [...snake, ...camel]) {
    const snapshot = empty();
    // Deliberately malformed boundary records test patient identity independently of clinical content.
    Object.assign(snapshot, { [key]: [{ patient_id: "patient-b", patientId: "patient-b" }] });
    assert.throws(() => assertClinicalSnapshotPatient(snapshot, "patient-a"), /different patient/, key);
  }
});

test("clinical API publishes patient invalidation only after a successful authoritative mutation", async () => {
  const { clinicalRecordApi } = await import("../app/lib/clinical-record-api");
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const events: CustomEvent[] = [];
  Object.assign(globalThis, { window: { dispatchEvent: (event: CustomEvent) => { events.push(event); } } });
  let fail = false;
  globalThis.fetch = async () => new Response(JSON.stringify(fail ? { success: false, error: "Refused" } : { success: true, result: { id: "synthetic" } }), { status: fail ? 403 : 200 });
  try {
    await clinicalRecordApi.addProblem("patient-a", { displayText: "Synthetic problem" });
    assert.equal(events.length, 1);
    assert.equal(events[0].type, "ehr-patient-updated");
    assert.deepEqual(events[0].detail, { patientId: "patient-a" });
    fail = true;
    await assert.rejects(() => clinicalRecordApi.addProblem("patient-a", { displayText: "Refused" }));
    assert.equal(events.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) Reflect.deleteProperty(globalThis, "window");
    else Object.assign(globalThis, { window: originalWindow });
  }
});
