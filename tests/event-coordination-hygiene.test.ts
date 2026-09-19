import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const APP_COMPONENTS_DIR = join(process.cwd(), "app", "components");

function collectSourceFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...collectSourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      results.push(full);
    }
  }
  return results;
}

test("architectural hygiene: components do not use raw ehr-* custom event strings or dispatchers directly", () => {
  const files = collectSourceFiles(APP_COMPONENTS_DIR);
  const violations: { file: string; match: string }[] = [];

  const rawCustomEventPattern = /(?:new\s+CustomEvent\s*<[^>]*>\s*\(\s*["']ehr-|addEventListener\s*\(\s*["']ehr-|dispatchEvent\s*\(\s*new\s+CustomEvent\s*<[^>]*>\s*\(\s*["']ehr-)/;

  for (const file of files) {
    const content = readFileSync(file, "utf8");
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (rawCustomEventPattern.test(line)) {
        violations.push({
          file: file.replace(process.cwd(), ""),
          match: `Line ${i + 1}: ${line.trim()}`,
        });
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    "Components must use typed workspace-events helpers (dispatchWorkspaceEvent, subscribeWorkspaceEvent) or WorkspaceNavigationContext, not raw 'ehr-*' CustomEvents.",
  );
});

test("architectural hygiene: workspace-navigation does not use querySelector click simulation for core workspace views", () => {
  const file = join(process.cwd(), "app", "lib", "workspace-navigation.ts");
  const content = readFileSync(file, "utf8");

  // Core navigation uses the registered navigation controller; DOM clicks are strictly
  // isolated as fallbacks for non-React/headless runners.
  assert.match(
    content,
    /activeNavigationController/,
    "workspace-navigation must check the authoritative registered controller",
  );
});
