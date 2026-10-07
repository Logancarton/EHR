import test from "node:test";
import assert from "node:assert/strict";
import { COMMON_PRESCRIPTION_INDICATIONS, otherPrescriptionIndications } from "../app/domain/prescription-indications";

test("a patient's own problem is not offered again as a coded duplicate", () => {
  const others = otherPrescriptionIndications(["Generalized anxiety disorder", "ADHD, combined presentation"]);
  assert.deepEqual(others, ["F33.1 - Major depressive disorder", "F31.9 - Bipolar disorder"]);
});

test("coded patient problems match too, and unrelated problems leave the list whole", () => {
  assert.deepEqual(otherPrescriptionIndications(["F33.1 - Major depressive disorder"]).includes("F33.1 - Major depressive disorder"), false);
  assert.deepEqual(otherPrescriptionIndications(["Insomnia disorder"]), [...COMMON_PRESCRIPTION_INDICATIONS]);
  assert.deepEqual(otherPrescriptionIndications([]), [...COMMON_PRESCRIPTION_INDICATIONS]);
});
