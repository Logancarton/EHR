import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

/**
 * Generated files that only make sense on the machine that generated them.
 *
 * The browser suite builds into its own directory so it can run beside a
 * developer's dev server, and `next dev` rewrites `next-env.d.ts` to name it. A
 * committed copy pointing at `.next-playwright` would describe a build directory
 * that exists on nobody else's checkout. Playwright's teardown restores the file;
 * this is the check that notices when it did not.
 */
test("next-env.d.ts names the ordinary build directory", () => {
  const contents = readFileSync(`${ROOT}next-env.d.ts`, "utf8");
  assert.ok(
    !contents.includes(".next-playwright"),
    "next-env.d.ts was left pointing at the browser suite's build directory — run `git checkout next-env.d.ts`",
  );
  // `.next/types/...` after a build and `.next/dev/types/...` after a dev server:
  // both are ordinary, and which one is committed depends on what ran last. Only
  // the suite's private directory is wrong.
  assert.match(contents, /"\.\/\.next\/(dev\/)?types\/routes\.d\.ts"/);
});
