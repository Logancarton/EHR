/**
 * One lab order — or one report typed in by hand — is one result set. Its
 * analytes are children of that set, so every lab surface shows them under one
 * heading instead of one card per analyte.
 *
 * Results are grouped only by an explicit link: the order they answer, the
 * document they were imported from, or the report reference they were entered
 * under. Two results that merely share a patient and a date are never guessed
 * into one set; an unlinked result stands alone.
 */

/** `source_ref` prefix for analytes entered together from one report. */
export const LAB_REPORT_REF_PREFIX = "report:";

export type LabResultLink = {
  id: string;
  patientId: string;
  orderId: string | null;
  documentId: string | null;
  sourceRef: string | null;
};

export function labResultSetKey(result: LabResultLink): string {
  const source = result.orderId
    ? `order:${result.orderId}`
    : result.documentId
      ? `document:${result.documentId}`
      : result.sourceRef?.startsWith(LAB_REPORT_REF_PREFIX)
        ? result.sourceRef
        : `observation:${result.id}`;
  return `${result.patientId}:${source}`;
}

/**
 * Groups results into result sets, keeping the order the caller sorted them
 * in: a set appears where its first result would have.
 */
export function groupLabResultSets<T>(
  results: readonly T[],
  link: (result: T) => LabResultLink,
): Array<{ key: string; results: T[] }> {
  return groupByResultSetKey(results, (result) => labResultSetKey(link(result)));
}

/** As above, for results that already carry their `labResultSetKey`. */
export function groupByResultSetKey<T>(
  results: readonly T[],
  keyOf: (result: T) => string,
): Array<{ key: string; results: T[] }> {
  const groups = new Map<string, T[]>();
  for (const result of results) {
    const key = keyOf(result);
    const group = groups.get(key);
    if (group) group.push(result);
    else groups.set(key, [result]);
  }
  return Array.from(groups, ([key, grouped]) => ({ key, results: grouped }));
}

/** How a result set was linked, for the line under its heading. */
export function labResultSetSource(key: string): "order" | "document" | "report" | "single" {
  if (key.includes(":order:")) return "order";
  if (key.includes(":document:")) return "document";
  if (key.includes(`:${LAB_REPORT_REF_PREFIX}`)) return "report";
  return "single";
}

/** A heading for a result set: the order's name when there is one, else its tests. */
export function labResultSetTitle(testNames: readonly string[], orderName?: string | null): string {
  if (orderName) return orderName;
  const unique = Array.from(new Set(testNames));
  if (unique.length <= 2) return unique.join(" · ");
  return `${unique.slice(0, 2).join(" · ")} +${unique.length - 2} more`;
}

export function newLabReportRef(): string {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `rpt-${random}`;
}
