import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { validateClinicalRecordAction } from "../app/server/actions/clinical-record-validation";

test("signed encounter history no longer reads or mutates the synthetic runtime fixture", () => {
  const source = readFileSync(
    join(process.cwd(), "app/components/encounter/EncounterWorkspace.tsx"),
    "utf8",
  );
  assert.equal(source.includes("patientEncounterHistory"), false);
  assert.match(source, /api\.encounters\s*\.list\(patient\.id\)/);
  assert.match(source, /setPastEncounters/);
});

test("signed-record correction input is validated before reaching the clinical gateway", () => {
  const action = validateClinicalRecordAction({
    type: "add_encounter_addendum",
    payload: {
      encounterId: " enc-123 ",
      body: " Correction after signing. ",
      reason: " Clarification ",
      addendumType: "amendment",
    },
  });

  assert.deepEqual(action, {
    type: "add_encounter_addendum",
    payload: {
      encounterId: "enc-123",
      body: "Correction after signing.",
      reason: "Clarification",
      addendumType: "amendment",
    },
  });

  assert.throws(
    () => validateClinicalRecordAction({
      type: "add_encounter_addendum",
      payload: { encounterId: "enc-123", body: " ", addendumType: "addendum" },
    }),
    /Addendum text is required/,
  );
  assert.throws(
    () => validateClinicalRecordAction({
      type: "add_encounter_addendum",
      payload: { encounterId: "enc-123", body: "Correction", addendumType: "replacement" },
    }),
    /Unsupported addendum type/,
  );
});
