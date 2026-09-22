import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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

test("no top-bar menu offers a destination the companion owns", () => {
  // UI-7d took Clinical's last child and the group with it; this read the remaining
  // `ToolNavigation.tsx` for the group's absence. UI-8 removed the row itself, so the
  // assertion moves up a level: the shell renders no work navigation at all, which is
  // the only form of this invariant that cannot be regressed by re-adding a group.
  assert.ok(
    !existsSync(`${ROOT}app/components/ToolNavigation.tsx`),
    "the top-bar work navigation is gone, so it cannot offer a rehomed destination",
  );

  const topBar = read("app/components/workspace/WorkspaceTopBar.tsx");
  assert.doesNotMatch(
    topBar,
    /ToolNavigation|topbar-navigation-slot/,
    "the top bar renders no work-navigation row and reserves no slot for one",
  );
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
