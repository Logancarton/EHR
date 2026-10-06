import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import path from "node:path";
import { browserFileKey, selectedBrowserFiles, type BrowserManifestSuite } from "./lib/browser-run-plan";

const cli = path.resolve("node_modules/@playwright/test/cli.js");
const args = process.argv.slice(2);
// Interactive inspection and last-run/shard selection have different lifecycles.
// Refuse them rather than silently change their meaning across child invocations.
const unsupported = args.find((arg) => /^(--ui(?:=|-|$)|--debug(?:=|$)|--last-failed(?:=|$)|--shard(?:=|$)|--global-timeout(?:=|$)|--max-failures(?:=|$)|--output(?:=|$)|--reporter(?:=|$)|--config(?:=|$)|-c$)/.test(arg));
if (unsupported) {
  process.stderr.write(`${unsupported} requires direct npx playwright test; the standard command isolates spec files.\n`);
  process.exit(2);
}
if (args.includes("--list") || args.includes("--help") || args.includes("-h")) {
  const result = spawnSync(process.execPath, [cli, "test", ...args], { stdio: "inherit" });
  process.exit(result.status ?? 1);
}

const listed = spawnSync(process.execPath, [cli, "test", ...args, "--list", "--reporter=json"], {
  encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
});
if (listed.status !== 0) {
  process.stderr.write(listed.stderr || listed.stdout || String(listed.error));
  process.exit(listed.status ?? 1);
}
const manifest = JSON.parse(listed.stdout) as {
  config: { rootDir: string };
  suites: BrowserManifestSuite[];
  errors?: unknown[];
};
const files = selectedBrowserFiles(manifest.suites);
if (manifest.errors?.length || !files.length) {
  process.stderr.write("Browser collection produced errors or no selected tests.\n");
  process.exit(1);
}

const databaseRoot = path.resolve("test-results/browser-runs");
mkdirSync(databaseRoot, { recursive: true });
const runRoot = mkdtempSync(path.join(databaseRoot, "run-"));
const runKey = path.basename(runRoot);
const results: { file: string; status: number | null; signal: string | null }[] = [];
for (const [index, file] of files.entries()) {
  const key = browserFileKey(file);
  const fileRoot = path.join(runRoot, key);
  mkdirSync(fileRoot);
  const selection = path.join(fileRoot, "selection.txt");
  // --test-list intersects the original CLI filters. A plain file entry selects
  // that whole file without rebuilding or weakening any behavioral assertion.
  writeFileSync(selection, `${file.replaceAll("\\", "/")}\n`);
  process.stdout.write(`\nIsolated browser file ${index + 1}/${files.length}: ${file}\n`);
  const result = spawnSync(process.execPath, [cli, "test", ...args, "--test-list", selection], {
    stdio: "inherit",
    env: {
      ...process.env,
      EHR_BROWSER_DATABASE_PATH: path.join(fileRoot, "clinical.db"),
      EHR_BROWSER_OUTPUT_DIR: path.resolve("test-results/playwright", runKey, key),
      EHR_BROWSER_HTML_DIR: path.resolve("playwright-report", runKey, key),
      PLAYWRIGHT_HTML_OUTPUT_DIR: path.resolve("playwright-report", runKey, key),
    },
  });
  results.push({ file, status: result.status, signal: result.signal });
  writeFileSync(path.join(runRoot, "summary.json"), JSON.stringify({ results }, null, 2));
  if (result.error || result.signal) {
    process.stderr.write(`Browser invocation interrupted: ${result.error?.message || result.signal}\n`);
    process.exit(result.signal === "SIGINT" ? 130 : 1);
  }
}
const failed = results.filter((result) => result.status !== 0);
process.stdout.write(`\nIsolated browser files: ${results.length - failed.length} passed, ${failed.length} failed.\nEvidence: ${runRoot}\n`);
process.exit(failed.length ? 1 : 0);
