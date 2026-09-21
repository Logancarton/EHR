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

test("UI-3: Migration invariant - Level 1 Team menu in ToolNavigation remains 100% intact", () => {
  const toolNav = readFileSync(join(APP_ROOT, "components", "ToolNavigation.tsx"), "utf8");

  // Team top-level group must be preserved
  assert.ok(toolNav.includes('id: "team"'), "Team group must remain in GROUPS");
  assert.ok(toolNav.includes('label: "Team"'), "Team label must remain in GROUPS");
  assert.ok(toolNav.includes('icon: "forum"'), "Team icon must remain forum");

  // All 6 sub-items must be preserved
  assert.ok(toolNav.includes('id: "inbox"'), "Inbox sub-item must remain under Team");
  assert.ok(toolNav.includes('id: "team"'), "Team collaboration sub-item must remain under Team");
  assert.ok(toolNav.includes('id: "patient_communication"'), "Patient communication sub-item must remain under Team");
  assert.ok(toolNav.includes('id: "email"'), "Email sub-item must remain under Team");
  assert.ok(toolNav.includes('id: "fax"'), "Fax sub-item must remain under Team");
  assert.ok(toolNav.includes('id: "community"'), "Community sub-item must remain under Team");
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
