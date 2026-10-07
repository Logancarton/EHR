import test from "node:test";
import assert from "node:assert/strict";
import {
  groupLabResultSets,
  labResultSetKey,
  labResultSetSource,
  labResultSetTitle,
  LAB_REPORT_REF_PREFIX,
} from "../app/domain/lab-result-groups";
import { organizeRecords, inRecordWindow, DEFAULT_RECORD_ORGANIZATION } from "../app/lib/record-organization";
import { validateClinicalRecordAction } from "../app/server/actions/clinical-record-validation";

const link = (id: string, patientId: string, extra: Partial<{ orderId: string; documentId: string; sourceRef: string }> = {}) => ({
  id,
  patientId,
  orderId: extra.orderId ?? null,
  documentId: extra.documentId ?? null,
  sourceRef: extra.sourceRef ?? null,
});

test("lab results group by order, then document, then entered report; unlinked results stand alone", () => {
  const rows = [
    link("o1", "p1", { orderId: "ord-a" }),
    link("o2", "p1", { orderId: "ord-a" }),
    link("o3", "p1", { sourceRef: `${LAB_REPORT_REF_PREFIX}rpt-1` }),
    link("o4", "p1", { sourceRef: `${LAB_REPORT_REF_PREFIX}rpt-1` }),
    link("o5", "p1"),
    link("o6", "p1"),
    // Same order id on another chart is another set.
    link("o7", "p2", { orderId: "ord-a" }),
    // An outside system's source_ref is not a report key.
    link("o8", "p1", { sourceRef: "hl7:ABC" }),
    link("o9", "p1", { documentId: "doc-1" }),
    link("o10", "p1", { documentId: "doc-1" }),
  ];
  const sets = groupLabResultSets(rows, (row) => row);
  assert.deepEqual(
    sets.map((set) => set.results.map((row) => row.id)),
    [["o1", "o2"], ["o3", "o4"], ["o5"], ["o6"], ["o7"], ["o8"], ["o9", "o10"]],
  );
  assert.equal(labResultSetSource(labResultSetKey(rows[0])), "order");
  assert.equal(labResultSetSource(labResultSetKey(rows[2])), "report");
  assert.equal(labResultSetSource(labResultSetKey(rows[8])), "document");
  assert.equal(labResultSetSource(labResultSetKey(rows[4])), "single");
  assert.equal(labResultSetTitle(["Sodium", "Potassium", "Chloride", "Sodium"]), "Sodium · Potassium +1 more");
});

test("hand-entered results may share a report reference, and it is validated", () => {
  const base = {
    type: "add_observation",
    payload: { patientId: "p1", category: "laboratory", testName: "Sodium", valueText: "138", effectiveAt: "2026-01-02" },
  };
  const grouped = validateClinicalRecordAction({ ...base, payload: { ...base.payload, reportRef: "rpt-abc123" } }) as any;
  assert.equal(grouped.payload.source.ref, `${LAB_REPORT_REF_PREFIX}rpt-abc123`);
  const plain = validateClinicalRecordAction(base) as any;
  assert.equal(plain.payload.source, undefined, "no report reference, no source override");
  assert.throws(
    () => validateClinicalRecordAction({ ...base, payload: { ...base.payload, reportRef: "bad ref; drop" } }),
    /Report reference/,
  );
});

test("documents are validated: the server sets provenance and only known file types are accepted", () => {
  const doc = (payload: Record<string, unknown>) =>
    validateClinicalRecordAction({ type: "create_document", payload: { patientId: "p1", documentType: "consult_note", title: "Consult", ...payload } }) as any;
  const text = doc({ contentText: "Synthetic note", source: { system: "forged" }, storageKey: "s3://x" });
  assert.equal(text.payload.mimeType, "text/plain");
  assert.equal(text.payload.source, undefined, "a request cannot set provenance");
  assert.equal(text.payload.storageKey, undefined, "a request cannot set a storage key");
  assert.equal(doc({ mimeType: "image/png", contentText: "data:image/png;base64,AAAA" }).payload.mimeType, "image/png");
  assert.throws(() => doc({ mimeType: "application/x-msdownload", contentText: "MZ" }), /Unsupported document file type/);
  assert.throws(() => doc({ mimeType: "application/pdf", contentText: "data:image/png;base64,AAAA" }), /data URL of its declared type/);
  assert.throws(() => doc({ contentText: "" }), /Document content is required/);
});

test("long chart lists can be windowed, sorted and grouped without losing count of what is hidden", () => {
  const items = [
    { date: "2026-10-01T15:00:00Z", title: "Bravo", typeLabel: "Lab" },
    { date: "2026-09-02", title: "Alpha", typeLabel: "Visit" },
    { date: "2025-01-15", title: "Charlie", typeLabel: "Lab" },
  ];
  const today = "2026-10-06";
  const byMonth = organizeRecords(items, (item) => item, { ...DEFAULT_RECORD_ORGANIZATION, group: "month" }, today);
  assert.deepEqual(byMonth.groups.map((group) => [group.label, group.items.length]), [
    ["October 2026", 1],
    ["September 2026", 1],
    ["January 2025", 1],
  ]);
  const recent = organizeRecords(items, (item) => item, { ...DEFAULT_RECORD_ORGANIZATION, window: "90d" }, today);
  assert.equal(recent.shown, 2);
  assert.equal(recent.hiddenByWindow, 1, "the date window says how many it left out");
  const byType = organizeRecords(items, (item) => item, { ...DEFAULT_RECORD_ORGANIZATION, group: "type", sort: "oldest" }, today);
  assert.deepEqual(byType.groups.map((group) => [group.label, group.items.map((item) => item.title)]), [
    ["Lab", ["Charlie", "Bravo"]],
    ["Visit", ["Alpha"]],
  ]);
  const byTitle = organizeRecords(items, (item) => item, { ...DEFAULT_RECORD_ORGANIZATION, sort: "title" }, today);
  assert.deepEqual(byTitle.groups[0].items.map((item) => item.title), ["Alpha", "Bravo", "Charlie"]);
  assert.equal(inRecordWindow("2025-01-15", "older", today), true);
  assert.equal(inRecordWindow("2026-10-05", "older", today), false);
});
