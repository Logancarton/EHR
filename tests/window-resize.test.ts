import assert from "node:assert/strict";
import test from "node:test";
import { resizeDirectionAtPoint, type ResizeDirection } from "../app/lib/window-resize";

const rect = { left: 100, top: 100, right: 660, bottom: 780 };
const perimeter: [number, number, ResizeDirection][] = [
  [100, 100, "nw"], [660, 100, "ne"], [100, 780, "sw"], [660, 780, "se"],
  [380, 100, "n"], [380, 780, "s"], [100, 440, "w"], [660, 440, "e"],
];

test("all eight window perimeter directions remain available", () => {
  for (const [x, y, direction] of perimeter) {
    assert.equal(resizeDirectionAtPoint(x, y, rect), direction);
  }
  assert.equal(resizeDirectionAtPoint(110, 440, rect), "w");
  assert.equal(resizeDirectionAtPoint(111, 440, rect), null);
  assert.equal(resizeDirectionAtPoint(380, 440, rect), null);
});

test("clinical controls take precedence over resizing at every edge and corner", () => {
  for (const [x, y] of perimeter) {
    assert.equal(resizeDirectionAtPoint(x, y, rect, true), null);
  }
});

test("overflow content outside the window cannot initiate a resize", () => {
  for (const [x, y] of [[99, 440], [661, 440], [380, 99], [380, 781], [NaN, 100], [100, Infinity]]) {
    assert.equal(resizeDirectionAtPoint(x, y, rect), null);
  }
});
