import test from "node:test";
import assert from "node:assert/strict";
import {
  AVAILABLE_WORKSPACE_TOOLS,
  DEFAULT_PINS,
  WORKSPACE_TOOLS,
  isAvailableTool,
  pinnedTools,
} from "../app/lib/workspace-tools";

/**
 * Navigation hygiene (roadmap phase P1-E).
 *
 * Every destination a clinician can reach has to be worth reaching. A launcher tile
 * that opens an explanation of what a screen will someday do costs them a click to
 * learn the product cannot do the thing — which is worse than the tile not being
 * there, because the tile also implied it could.
 */

test("planned destinations are recorded but never offered", () => {
  const planned = WORKSPACE_TOOLS.filter((tool) => !isAvailableTool(tool));
  assert.ok(planned.length > 0, "the registry still records what is intended");

  for (const tool of planned) {
    assert.ok(
      !AVAILABLE_WORKSPACE_TOOLS.some((offered) => offered.id === tool.id),
      `${tool.id} is not built, so the launcher must not offer it`,
    );
    assert.ok(
      !DEFAULT_PINS.left.includes(tool.id) && !DEFAULT_PINS.right.includes(tool.id),
      `${tool.id} must not be pinned to a rail by default`,
    );
  }
});

test("a rail saved before a tool was withdrawn does not resurrect it", () => {
  const planned = WORKSPACE_TOOLS.find((tool) => !isAvailableTool(tool));
  assert.ok(planned, "this test needs at least one withdrawn tool");

  const stale = { left: ["today", planned.id, "inbox"], right: [] };
  const rendered = pinnedTools(stale, "left").map((tool) => tool.id);

  assert.deepEqual(
    rendered,
    ["today", "inbox"],
    "a clinician who pinned the tile before it was withdrawn gets the rail without it",
  );
});

test("every offered tool renders on at least one surface", () => {
  for (const tool of AVAILABLE_WORKSPACE_TOOLS) {
    assert.ok(
      tool.surfaces.length > 0,
      `${tool.id} is offered, so it has to open somewhere`,
    );
    assert.ok(tool.label.trim(), `${tool.id} needs a label`);
    assert.ok(tool.hint.trim(), `${tool.id} needs a hint explaining what it opens`);
  }
});
