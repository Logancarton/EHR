import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  WORKSPACE_TOOLS,
  DEFAULT_PINS,
  findTool,
  toolSupports,
  isAvailableTool,
  pinnedTools,
} from "../app/lib/workspace-tools";

const APP_ROOT = join(process.cwd(), "app");

test("UI-3: Communication is registered as an available companion panel tool", () => {
  const tool = findTool("communication");
  assert.ok(tool, "Communication tool must be registered in WORKSPACE_TOOLS");
  assert.equal(tool.label, "Communication");
  assert.equal(tool.icon, "forum");
  assert.ok(tool.surfaces.includes("panel"), "Communication must support panel surface");
  assert.ok(isAvailableTool(tool), "Communication must be available (not planned/withdrawn)");
  assert.equal(toolSupports("communication", "panel"), true);
});

test("UI-3: Communication is included in default right companion rail pins", () => {
  assert.ok(
    DEFAULT_PINS.right.includes("communication"),
    "DEFAULT_PINS.right must include communication",
  );

  const rightTools = pinnedTools(DEFAULT_PINS, "right");
  const comm = rightTools.find((t) => t.id === "communication");
  assert.ok(comm, "pinnedTools for right rail must include Communication");
  assert.equal(comm.icon, "forum");
});

test("UI-5: the Level 1 Team group and its channel plumbing are retired from ToolNavigation", () => {
  const toolNav = readFileSync(join(APP_ROOT, "components", "ToolNavigation.tsx"), "utf8");

  assert.ok(!/label: "Team"/.test(toolNav), "Team group must be retired from GROUPS");
  assert.ok(
    !/label: "Team collaboration"/.test(toolNav),
    "Team's channel destinations must be retired with it",
  );

  // The Team items were the only destinations that opened a communication channel from
  // the top bar. Leaving that dispatch behind would be an unreachable second route to a
  // surface the companion rail now owns.
  assert.ok(
    !toolNav.includes("WORKSPACE_OPEN_COMMUNICATIONS_EVENT"),
    "ToolNavigation must no longer dispatch the communications-open intent",
  );

  // What Team's retirement had to leave standing. `practice` and `clinical` were on
  // this list until UI-6 and UI-7 decomposed them child by child and removed each
  // group last; both are asserted absent below rather than dropped silently, so a
  // regression that restored either would fail here instead of quietly passing.
  for (const remaining of ["calendar", "intake", "today"]) {
    assert.ok(
      toolNav.includes(`id: "${remaining}"`),
      `${remaining} group must remain in GROUPS`,
    );
  }

  assert.ok(
    !/id: "practice"/.test(toolNav),
    "UI-6 retired the Practice group after rehoming every child",
  );
  assert.ok(
    !/id: "clinical"/.test(toolNav),
    "UI-7 retired the Clinical group after rehoming every child",
  );
});

test("UI-3: Communication companion panel implements all 6 migrated communication routes", () => {
  const panel = readFileSync(
    join(APP_ROOT, "components", "companion", "CommunicationCompanionPanel.tsx"),
    "utf8",
  );

  // All 6 channels must be supported
  assert.ok(panel.includes('data-channel="team"'), "Panel must have team channel tab");
  assert.ok(panel.includes('data-channel="inbox"'), "Panel must have inbox channel tab");
  assert.ok(panel.includes('data-channel="patient"'), "Panel must have patient SMS channel tab");
  assert.ok(panel.includes('data-channel="email"'), "Panel must have email channel tab");
  assert.ok(panel.includes('data-channel="fax"'), "Panel must have fax channel tab");
  assert.ok(panel.includes('data-channel="community"'), "Panel must have community channel tab");

  // Real internal team operations
  assert.ok(panel.includes("teamApi.sendMessage"), "Team messaging must be wired to teamApi");
  assert.ok(panel.includes("teamApi.assignTask"), "Team tasks must be wired to teamApi");
  assert.ok(panel.includes("teamApi.updateTaskStatus"), "Team task status must be wired to teamApi");

  // Real message queue
  assert.ok(panel.includes("api.messages.list"), "Inbox must query real messages list");

  // Honest containment banners
  assert.ok(
    panel.includes('data-sms-transport="unconfigured"'),
    "Patient SMS must declare unconfigured transport",
  );
  assert.ok(
    panel.includes('data-fax-transport="unconfigured"'),
    "Fax must declare unconfigured gateway",
  );
  assert.ok(
    panel.includes('data-email-transport="unconfigured"'),
    "Email must declare unconfigured integration",
  );
  assert.ok(
    panel.includes('data-community-network="unconfigured"'),
    "Community must declare demonstration mode",
  );

  // No fake success alerts
  assert.ok(!panel.includes("alert("), "Companion must not use alert() simulations");
});

test("UI-3: CompanionPanelHost renders CommunicationCompanionPanel when activeCompanionPanel is communication", () => {
  const host = readFileSync(
    join(APP_ROOT, "components", "workspace", "CompanionPanelHost.tsx"),
    "utf8",
  );

  assert.ok(
    host.includes('activeCompanionPanel === "communication"'),
    "CompanionPanelHost must handle activeCompanionPanel === 'communication'",
  );
  assert.ok(
    host.includes("<CommunicationCompanionPanel"),
    "CompanionPanelHost must render CommunicationCompanionPanel",
  );
});
