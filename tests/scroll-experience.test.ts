import assert from "node:assert/strict";
import test from "node:test";
import { boundedScrollOffset, scrollIdentity } from "../app/components/ScrollExperienceManager";

function region(kind: string, patientId?: string, section?: string) {
  return {
    classList: { contains: (name: string) => name === kind },
    matches: () => true,
    closest: () => ({ dataset: { scrollPatientId: patientId, scrollSection: section } }),
  } as unknown as HTMLElement;
}

test("patient section scroll identity survives docking and distinguishes patients and sections", () => {
  const docked = scrollIdentity(region("content-area", "a", "Documents"));
  assert.equal(docked, scrollIdentity(region("detached-content", "a", "Documents")));
  assert.notEqual(docked, scrollIdentity(region("content-area", "b", "Documents")));
  assert.notEqual(docked, scrollIdentity(region("content-area", "a", "History")));
  assert.notEqual(scrollIdentity(region("content-area", "a|b", "c")),
    scrollIdentity(region("content-area", "a", "b|c")));
});

test("tab strip scrolling is patient-specific and independent of section content", () => {
  const tabs = scrollIdentity(region("compact-section-tabs", "a", "Documents"));
  assert.equal(tabs, scrollIdentity(region("compact-section-tabs", "a", "History")));
  assert.notEqual(tabs, scrollIdentity(region("compact-section-tabs", "b", "Documents")));
  assert.notEqual(tabs, scrollIdentity(region("detached-content", "a", "Documents")));
});

test("unbound chart regions cannot share a fallback scroll position", () => {
  assert.equal(scrollIdentity(region("content-area")), null);
  assert.equal(scrollIdentity(region("content-area", "a")), null);
});

test("late-loading content can progressively reach the original saved scroll offset", () => {
  assert.equal(boundedScrollOffset(640, 320, 300), 20);
  assert.equal(boundedScrollOffset(640, 700, 300), 400);
  assert.equal(boundedScrollOffset(640, 1000, 300), 640);
  assert.equal(boundedScrollOffset(40, 100, 200), 0);
});
