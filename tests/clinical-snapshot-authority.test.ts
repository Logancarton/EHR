import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

test("clinical snapshot client carries observations and authoritative aggregate facets", () => {
  const api = read("app/lib/clinical-record-api.ts");
  assert.match(api, /observations: response\.record\.observations \|\| \[\]/);
  assert.match(api, /encounters: response\.record\.encounters \|\| \[\]/);
  assert.match(api, /upcomingAppointments: response\.record\.upcomingAppointments \|\| \[\]/);
  assert.match(api, /function mapClinicalDocumentSummary/);
  assert.match(api, /createdAt: String\(row\.created_at \?\? row\.createdAt \?\? ""\)/);
  assert.match(api, /documents: \(response\.record\.documents \|\| \[\]\)\.map/);
});

test("patient overview never substitutes seeded encounters, labs, or fake normal vitals", () => {
  const overview = read("app/components/patient/PatientOverview.tsx");
  assert.equal(overview.includes("patientEncounterHistory"), false);
  assert.equal(overview.includes("patientLabHistory"), false);
  assert.equal(overview.includes("118/74 mmHg"), false);
  assert.match(overview, /clinical overview could not be loaded/i);
  assert.match(overview, /No authoritative vital-sign measurement is on file/);
});

test("patient history does not substitute seeded clinical history after empty or failed snapshot", () => {
  const history = read("app/components/patient/PatientHistory.tsx");
  assert.equal(history.includes("patientEncounterHistory"), false);
  assert.equal(history.includes("patientLabHistory"), false);
  assert.equal(history.includes("patientMedicationMilestones"), false);
  assert.equal(history.includes("Fallback gracefully"), false);
  assert.match(history, /Seeded or fixture history was not substituted/);
});

test("interval summary is bounded to authoritative signed encounters", () => {
  const history = read("app/components/patient/PatientHistory.tsx");
  assert.match(history, /signedEncounters/);
  assert.equal(history.includes("maya-chen"), false);
  assert.equal(history.includes("jordan-reed"), false);
  assert.match(history, /no interval comparison was generated/i);
});
