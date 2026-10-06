import assert from "node:assert/strict";
import test from "node:test";
import { browserFileKey, selectedBrowserFiles } from "../scripts/lib/browser-run-plan";

test("browser manifest grouping preserves distinct selected files and nested/project duplicates", () => {
  assert.deepEqual(selectedBrowserFiles([
    { suites: [{ specs: [{ file: "clinic/visit.spec.ts" }, { file: "clinic/visit.spec.ts" }] }] },
    { specs: [{ file: "billing/visit.spec.ts" }] },
    { specs: [{ file: "clinic/visit.spec.ts" }] },
  ]), ["billing/visit.spec.ts", "clinic/visit.spec.ts"]);
  assert.deepEqual(selectedBrowserFiles([{ file: "unselected.spec.ts", specs: [] }]), []);
});

test("browser evidence keys keep equal basenames in different directories separate", () => {
  assert.notEqual(browserFileKey("billing/visit.spec.ts"), browserFileKey("clinic/visit.spec.ts"));
  assert.match(browserFileKey("clinic/visit.spec.ts"), /^[a-zA-Z0-9._-]+$/);
});
