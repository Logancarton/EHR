import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";

/**
 * The complete browser gate, run as a few chunks of spec files.
 *
 * Each chunk goes through the standard isolated runner (`run-browser-tests.ts`),
 * so every file still gets its own synthetic database and server. Chunks run one
 * after another because each file owns the test server's port. Splitting only
 * changes how results are reported: a failure is visible when its chunk ends,
 * and a single chunk can be rerun on its own.
 *
 *   npm run test:browser:chunks              all chunks (the full gate)
 *   npm run test:browser:chunks -- --only=3  chunk 3 only
 *   npm run test:browser:chunks -- --chunks=8
 *
 * Files are dealt round-robin over a sorted list, so a chunk's contents are stable
 * for a given set of spec files.
 */

function option(name: string, fallback: number): number {
  const raw = process.argv.find((arg) => arg.startsWith(`--${name}=`))?.split("=")[1];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    process.stderr.write(`--${name} must be a positive whole number.\n`);
    process.exit(2);
  }
  return value;
}

const chunkCount = option("chunks", 5);
const only = process.argv.some((arg) => arg.startsWith("--only=")) ? option("only", 1) : null;
if (only !== null && only > chunkCount) {
  process.stderr.write(`--only=${only} is past the last chunk (${chunkCount}).\n`);
  process.exit(2);
}

const specDir = path.resolve("tests/browser");
const specs = readdirSync(specDir)
  .filter((name) => name.endsWith(".spec.ts"))
  .sort()
  .map((name) => path.join("tests/browser", name));
const chunks: string[][] = Array.from({ length: chunkCount }, () => []);
specs.forEach((spec, index) => chunks[index % chunkCount].push(spec));

const runner = path.resolve("scripts/run-browser-tests.ts");
const tsx = path.resolve("node_modules/.bin/tsx");
const summary: string[] = [];
let failedChunks = 0;

for (const [index, files] of chunks.entries()) {
  const number = index + 1;
  if (only !== null && number !== only) continue;
  if (!files.length) continue;
  process.stdout.write(`\n=== Chunk ${number}/${chunkCount}: ${files.length} files ===\n`);
  const result = spawnSync(tsx, [runner, ...files], { stdio: "inherit" });
  if (result.signal === "SIGINT") process.exit(130);
  const passed = result.status === 0;
  if (!passed) failedChunks += 1;
  summary.push(`Chunk ${number}/${chunkCount} (${files.length} files): ${passed ? "passed" : "FAILED"}`);
}

process.stdout.write(`\n${summary.join("\n")}\n`);
process.stdout.write(
  failedChunks
    ? `${failedChunks} chunk(s) failed. Each chunk's "Isolated browser files" line above names its failing files.\n`
    : "All chunks passed.\n",
);
process.exit(failedChunks ? 1 : 0);
