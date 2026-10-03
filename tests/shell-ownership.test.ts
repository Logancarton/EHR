import test from "node:test";
import assert from "node:assert/strict";
import { canonicalToolId, companionToolIdsFor, findTool, normalizeToolPins, pinnedTools, togglePin } from "../app/lib/workspace-tools";
import { mergeStoredPreferences, defaultPreferences } from "../app/lib/preference-engine";
import { getLauncherWorkspaceDestinations } from "../app/lib/workspace-catalog";
import { COMMUNICATION_MODULE_CHANNELS, isTabEligibleModule } from "../app/lib/workspace-navigation";

test("D-117 legacy pins restore right tools once without global left navigation", () => {
  const legacy = { left: ["today", "calendar", "messages"], right: ["messages", "communication", "schedule", "labs", "unknown"] };
  const pins = normalizeToolPins(legacy);
  assert.deepEqual(pins.left, []);
  assert.equal(pins.right.filter((id) => id === "communication").length, 1);
  assert.equal(pins.right.includes("messages"), false);
  assert.equal(pins.right.includes("calendar"), true);
  assert.equal(pins.right.includes("unknown"), false);
  assert.deepEqual(pinnedTools(legacy, "left"), []);
  assert.deepEqual(togglePin(pins, "left", "calendar"), pins);
  assert.equal(findTool("messages"), findTool("communication"));
  assert.equal(canonicalToolId("messages"), "communication");
  assert.equal(companionToolIdsFor(legacy).filter((id) => id === "communication").length, 1);
});

test("D-117 saved active Messages panel restores open as Communication", () => {
  const restored = mergeStoredPreferences({ ...defaultPreferences, rails: { ...defaultPreferences.rails, left: ["today"], right: ["messages"], activeRightPanel: "messages", rightPanelOpen: true } });
  assert.deepEqual(restored.rails.left, []);
  assert.equal(restored.rails.activeRightPanel, "communication");
  assert.equal(restored.rails.rightPanelOpen, true);
  assert.equal(restored.rails.right.includes("messages"), false);
  for (const id of ["medications", "labs", "documents", "communication", "history", "orders"]) assert.ok(restored.rails.right.includes(id));
});

test("D-117 practice queues have distinct names and legacy communication modules share the companion", () => {
  const entries = getLauncherWorkspaceDestinations();
  assert.equal(entries.find((entry) => entry.id === "labs")?.label, "Results Queue");
  assert.equal(entries.find((entry) => entry.id === "documents")?.label, "Document Inbox");
  assert.equal(findTool("labs")?.label, "Labs");
  assert.equal(findTool("documents")?.label, "Documents");
  for (const id of ["inbox", "email", "fax", "community", "patient_communication"] as const) {
    assert.ok(COMMUNICATION_MODULE_CHANNELS[id]);
    assert.equal(isTabEligibleModule(id), false);
  }
});
