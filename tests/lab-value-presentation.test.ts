import test from "node:test";
import assert from "node:assert/strict";
import { displayLabUnit, formatLabValue } from "../app/lib/lab-value-presentation";
import { patientLabHistory } from "../app/lib/clinical-protocols";

test("the multi-analyte unit sentinel is never shown as a unit", () => {
  assert.equal(formatLabValue("Na 140, K 4.2", "multi"), "Na 140, K 4.2");
  assert.equal(formatLabValue("Na 140, K 4.2", " MULTI "), "Na 140, K 4.2");
  assert.equal(displayLabUnit("multi"), "");
});

test("single-analyte results keep their unit", () => {
  assert.equal(formatLabValue("24.1", "ng/mL"), "24.1 ng/mL");
  assert.equal(formatLabValue("24.1", ""), "24.1");
  assert.equal(formatLabValue("24.1", null), "24.1");
  assert.equal(formatLabValue(null, "ng/mL"), "ng/mL");
});

test("seeded panel summaries that state their own units do not append another", () => {
  for (const rows of Object.values(patientLabHistory)) {
    for (const row of rows) {
      const statesOwnUnits = row.value.includes(",") && /[a-zA-Z]+\/[a-zA-Z]+/.test(row.value);
      if (statesOwnUnits) assert.equal(row.unit, "multi", `${row.id} would render "${row.value} ${row.unit}"`);
    }
  }
});
