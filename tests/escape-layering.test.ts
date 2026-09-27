import assert from "node:assert/strict";
import test from "node:test";
import { topmostLayer } from "../app/lib/use-dismissible";

test("CB-6f: Escape goes to the layer opened most recently, and only that one", () => {
  const moduleLayer = { order: 3, name: "module" };
  const companion = { order: 7, name: "companion" };
  const menu = { order: 5, name: "menu" };
  assert.equal(topmostLayer([moduleLayer, companion, menu])?.name, "companion");
  assert.equal(topmostLayer([moduleLayer, menu])?.name, "menu");
  assert.equal(topmostLayer([]), undefined);
});
