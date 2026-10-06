import test from "node:test";
import assert from "node:assert/strict";
import { screenDrugInteractions } from "../app/lib/drug-interaction-engine";

test("a drug already on the active list is flagged when prescribed again", () => {
  const alerts = screenDrugInteractions("Lamotrigine (Lamictal)", ["Lamotrigine 150 mg daily", "Quetiapine 100 mg nightly"]);
  const same = alerts.filter((alert) => alert.id.startsWith("same-drug-"));
  assert.equal(same.length, 1);
  assert.equal(same[0].severity, "advisory");
  assert.deepEqual(same[0].drugsInvolved, ["Lamotrigine (Lamictal)", "Lamotrigine 150 mg daily"]);
});

test("a different drug, or a name that only contains the ingredient, is not flagged as the same drug", () => {
  assert.equal(screenDrugInteractions("Sertraline (Zoloft)", ["Lamotrigine 150 mg daily"]).filter((a) => a.id.startsWith("same-drug-")).length, 0);
  assert.equal(screenDrugInteractions("Lithium Carbonate (Lithobid)", ["Lithiumlike 1 mg"]).filter((a) => a.id.startsWith("same-drug-")).length, 0);
  assert.equal(screenDrugInteractions("Lithium Carbonate (Lithobid)", []).length, 0);
});
