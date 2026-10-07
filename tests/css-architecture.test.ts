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


test("feature roots keep local stacking contexts and Intake keeps its dock contract", () => {
  const calendar = read("app/google-calendar.css");
  const encounter = read("app/encounter-note.css");
  const intake = read("app/intake-workspace.css");

  assert.match(
    calendar,
    /\.gcal-root\s*\{[\s\S]*?isolation:\s*isolate;/,
    "Calendar local z-index values must remain trapped inside the Calendar root",
  );
  assert.match(
    encounter,
    /\.encounter-workspace-root\s*\{[\s\S]*?isolation:\s*isolate;/,
    "Encounter toolbar/dock chrome must remain trapped inside the encounter root",
  );
  // New Intake fills the Intake module shell; the shell is what sits below the
  // measured chrome and stops at a docked companion and the rail.
  assert.match(
    read("app/global-workspaces.css"),
    /\.global-module-shell\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?inset:\s*var\(--workspace-chrome-h,[^;]+;/,
    "The module shell must stay docked below measured workspace chrome",
  );
  assert.match(
    intake,
    /\.intake-new-modal-overlay\s*\{[\s\S]*?position:\s*absolute;\s*inset:\s*0;[\s\S]*?z-index:\s*var\(--z-modal-elevated\);/,
    "New Intake must stay inside the module shell on the elevated modal layer",
  );
});
