import test from "node:test";
import assert from "node:assert/strict";
import { createSectionHistory } from "../app/lib/section-history";

test("window navigation traverses both ways and replaces the forward branch", () => {
  const history = createSectionHistory();
  assert.equal(history.canBack, false);
  assert.equal(history.canForward, false);
  history.visit("Encounter", "Labs");
  history.visit("Labs", "Documents");
  assert.equal(history.move(-1), "Labs");
  assert.equal(history.move(-1), "Encounter");
  assert.equal(history.move(-1), undefined);
  assert.equal(history.move(1), "Labs");
  history.visit("Labs", "Labs");
  assert.equal(history.canForward, true);
  history.visit("Labs", "Meds");
  assert.equal(history.canForward, false);
  assert.equal(history.move(-1), "Labs");
  assert.equal(history.move(1), "Meds");
  assert.equal(history.move(1), undefined);
});

test("histories are window-local and begin at the restored section", () => {
  const a = createSectionHistory();
  const b = createSectionHistory();
  a.visit("History", "Labs");
  b.visit("Messages", "Documents");
  assert.equal(a.move(-1), "History");
  assert.equal(b.canForward, false);
  assert.equal(b.move(-1), "Messages");
  assert.equal(a.move(1), "Labs");
});

test("history is bounded and peeking does not consume a navigation entry", () => {
  const history = createSectionHistory();
  for (let i = 0; i < 100; i++) history.visit(String(i), String(i + 1));
  assert.equal(history.peek(-1), "99");
  assert.equal(history.peek(-1), "99");
  let count = 0;
  while (history.canBack) { history.move(-1); count++; }
  assert.equal(count, 79);
  assert.equal(history.canForward, true);
});
