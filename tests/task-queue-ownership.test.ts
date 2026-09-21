import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (path: string) => readFileSync(`${ROOT}${path}`, "utf8");

/**
 * Who owns the practice task queue (UI-7b, D-089).
 *
 * The Clinical menu's Tasks opened the queue as a module workspace. Its replacement
 * is the right companion, whose expanded presentation renders the queue itself —
 * which is only an honest claim while both surfaces render *the same* queue. Two
 * lookalike task lists would drift, and the first thing to drift is what a count
 * means; UI-7a is the record of what that costs.
 *
 * These read source because the invariant is about ownership rather than about what
 * any one render produces. The behaviour is exercised in
 * `tests/browser/clinical-decomposition.spec.ts`.
 */

test("the Clinical menu no longer offers a destination the companion owns", () => {
  const navigation = read("app/components/ToolNavigation.tsx");

  // UI-7d took the last child. The group is asserted gone rather than asserted to
  // hold nothing, because an empty group is not a state this menu should reach: it
  // would render a trigger that opens a panel with no destinations in it.
  assert.doesNotMatch(
    navigation,
    /id: "clinical",/,
    "Clinical is removed once its last child has an owner, not before",
  );
  for (const rehomed of ["patients", "documents", "tasks", "labs", "prescribing"]) {
    assert.doesNotMatch(
      navigation,
      new RegExp(`\\{ id: "${rehomed}", label:`),
      `${rehomed} is reached from the surface that owns it, not from this menu`,
    );
  }
});

test("the module workspace and the companion render one queue, not two", () => {
  const shell = read("app/components/GlobalWorkspaceShell.tsx");
  const companion = read("app/components/companion/TasksPanel.tsx");

  for (const [name, source] of [
    ["the module shell", shell],
    ["the companion", companion],
  ] as const) {
    assert.match(
      source,
      /import PracticeTaskQueue/,
      `${name} must render the shared queue rather than its own copy`,
    );
    assert.doesNotMatch(
      source,
      /className=\{?`?global-task-row/,
      `${name} must not grow a second set of queue rows`,
    );
  }
});

test("a change to the queue reaches every surface showing it", () => {
  const queue = read("app/components/workspace/PracticeTaskQueue.tsx");
  const working = read("app/lib/use-companion-working-data.ts");
  const shell = read("app/components/GlobalWorkspaceShell.tsx");

  // Completing or removing announces rather than reporting back to one caller, so
  // the docked companion, the expanded companion and the module cannot disagree.
  assert.match(
    queue,
    /await action\(\);\s*\n\s*dispatchWorkspaceEvent\(WORKSPACE_TASKS_UPDATED_EVENT\)/,
    "a saved task change must be announced, and only after the server saved it",
  );

  for (const [name, source] of [
    ["the companion's working data", working],
    ["the module shell", shell],
  ] as const) {
    assert.match(
      source,
      /subscribeWorkspaceEvent\(\s*WORKSPACE_TASKS_UPDATED_EVENT/,
      `${name} must reload when the queue changes elsewhere`,
    );
  }

  // Reloading must not announce, or the listeners would feed each other forever.
  const reload = /const loadTasks = useCallback\([\s\S]*?\n  \}, \[\]\);/.exec(working)?.[0];
  assert.ok(reload, "the companion's task loader should still be readable");
  assert.doesNotMatch(
    reload,
    /dispatchWorkspaceEvent\(WORKSPACE_TASKS_UPDATED_EVENT\)/,
    "a reload that re-announces would make the surfaces reload each other without end",
  );
});

test("the open-task count follows Tasks onto the companion rail", () => {
  const rail = read("app/components/workspace/WorkspaceCompanionRail.tsx");
  assert.match(
    rail,
    /useWorkspaceBadgeCounts\(\)/,
    "the rail reads the same published counts the menu read, rather than counting for itself",
  );
  assert.match(
    rail,
    /companion-rail-count/,
    "and renders the count beside the destination that carries it",
  );
});
