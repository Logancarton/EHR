import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * Puts `next-env.d.ts` back after the suite has run.
 *
 * The suite's dev server builds into its own directory so it can run beside a
 * developer's own (see next.config.ts), and `next dev` rewrites this generated
 * file to point at whichever directory it used. Left alone, every browser run
 * would dirty the working tree with a reference to a build directory that only
 * exists on the machine that ran the tests.
 *
 * The reference is not load-bearing — typecheck passes with no build directory at
 * all — so restoring it is purely about keeping the committed file honest.
 * `tests/repository-hygiene.test.ts` fails if a rewritten copy ever gets staged.
 */
const NEXT_ENV = path.resolve(__dirname, "../../next-env.d.ts");

export default function restoreNextEnv() {
  try {
    const current = readFileSync(NEXT_ENV, "utf8");
    const restored = current.replace(/\.next-playwright\//g, ".next/");
    if (restored !== current) writeFileSync(NEXT_ENV, restored);
  } catch {
    // Never fail a test run over a generated file.
  }
}
