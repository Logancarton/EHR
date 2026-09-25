import test from "node:test";
import assert from "node:assert/strict";
import { describeToolBadge } from "../app/lib/workspace-tools";
import { initialScratchNotes } from "../app/domain/tasks";

test("rail badges say what they count", () => {
  // Labs counts orders — the same unit as the dashboard's Labs filter.
  assert.equal(describeToolBadge("labs", 4), "4 lab orders to review");
  assert.equal(describeToolBadge("labs", 1), "1 lab order to review");
  assert.equal(describeToolBadge("tasks", 3), "3 open tasks");
  assert.equal(describeToolBadge("prescribing", 2), "2 prescriptions needing attention");
  assert.equal(describeToolBadge("unknown-tool", 2), "2 items");
});

test("seeded scratchpad notes about a medication are tied to a patient", () => {
  for (const note of initialScratchNotes) {
    if (/mg|titration|differential/i.test(note.text)) {
      assert.ok(note.patientId, `clinical note "${note.id}" must name its patient`);
    }
  }
});
