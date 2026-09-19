import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (path: string) => readFileSync(`${ROOT}${path}`, "utf8");

test("application stacking contract remains semantic", () => {
  const globals = read("app/globals.css");
  for (const token of [
    "--z-chrome",
    "--z-global-workspace",
    "--z-popover",
    "--z-floating-pane",
    "--z-toast",
    "--z-menu",
    "--z-modal",
    "--z-modal-elevated",
    "--z-submodal",
    "--z-command",
    "--z-system",
  ]) {
    assert.ok(globals.includes(token), `missing application stacking token ${token}`);
  }
  assert.match(
    globals,
    /Scope first, layer second, number last/,
    "the root stacking contract should stay documented beside the tokens",
  );
});

test("feature-owned shell CSS stays with its feature stylesheet", () => {
  const globals = read("app/globals.css");
  const commandBar = read("app/command-bar.css");
  const workspaceSplit = read("app/workspace-split.css");
  const sidebar = read("app/sidebar.css");

  assert.doesNotMatch(globals, /\.patient-search-wrap/);
  assert.match(commandBar, /\.patient-search-wrap\s*\{/);

  assert.ok(
    !globals.includes(".workspace {\n  grid-column: 2;"),
    "base workspace geometry belongs in workspace-split.css, not globals.css",
  );
  assert.ok(
    workspaceSplit.includes(".workspace {\n  grid-column: 2;"),
    "workspace-split.css must own base workspace geometry",
  );

  assert.doesNotMatch(globals, /\.dynamic-left-rail\.revealed/);
  assert.doesNotMatch(globals, /@keyframes shortcut-rail-in/);
  assert.match(sidebar, /\.dynamic-left-rail\.revealed/);
  assert.match(sidebar, /@keyframes shortcut-rail-in/);
});
