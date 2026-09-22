import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  WORKSPACE_TOOLS,
  DEFAULT_PINS,
  findTool,
  toolSupports,
  isAvailableTool,
  pinnedTools,
} from "../app/lib/workspace-tools";
import { getLauncherWorkspaceDestinations } from "../app/lib/workspace-catalog";

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

test("UI-5/UI-8: the top bar carries no work navigation, so Team's channel plumbing has no route back", () => {
  // UI-5 asserted this against `ToolNavigation.tsx`: Team's group gone, its
  // channel-opening destinations gone with it, and the three direct destinations that
  // outlived it still listed. UI-6 and UI-7 then decomposed Practice and Clinical child
  // by child, and UI-8 removed the row itself once Dashboard — the last destination the
  // `+` launcher did not offer — had a launcher entry.
  //
  // The subject of the assertion is therefore gone, and the assertion gets stronger
  // rather than weaker: there is no work navigation in the top bar at all, so no group
  // can be restored to it and no destination can dispatch a communications intent from
  // it. `TeamCollaborationDock` still owns that intent from its own control, which UI-5
  // deferred deliberately and this does not touch.
  assert.ok(
    !existsSync(join(APP_ROOT, "components", "ToolNavigation.tsx")),
    "the top-bar work navigation component must be gone, not merely emptied",
  );

  const topBar = readFileSync(
    join(APP_ROOT, "components", "workspace", "WorkspaceTopBar.tsx"),
    "utf8",
  );
  assert.ok(
    !topBar.includes("ToolNavigation") && !topBar.includes("topbar-navigation-slot"),
    "the top bar must not render a work-navigation row or reserve a slot for one",
  );
  assert.ok(
    !topBar.includes("WORKSPACE_OPEN_COMMUNICATIONS_EVENT"),
    "the top bar must not dispatch the communications-open intent",
  );

  const shell = readFileSync(
    join(APP_ROOT, "components", "PatientWorkspace.tsx"),
    "utf8",
  );
  assert.ok(
    !shell.includes("ToolNavigation"),
    "the shell must not construct a work-navigation row to pass into the top bar",
  );

  // Every destination the row carried is reachable from the `+` launcher's catalog.
  const launcherIds = getLauncherWorkspaceDestinations().map((entry) => entry.id);
  for (const destination of ["calendar", "intake", "dashboard"]) {
    assert.ok(
      launcherIds.includes(destination as (typeof launcherIds)[number]),
      `${destination} must be offered by the '+' launcher now that the row is gone`,
    );
  }
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
