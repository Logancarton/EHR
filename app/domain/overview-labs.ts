import type { ObservationRecord } from "./clinical-records";

/** Match known codes, bridging an absent code only when the exact name/units
 * identify one coded test. Ambiguous or conflicting codes remain separate. */
export function latestLaboratoryObservations(observations: readonly ObservationRecord[]): ObservationRecord[] {
  const normalize = (value: string | null) => (value || "").trim().toLowerCase();
  const nameKey = (item: ObservationRecord) => JSON.stringify([normalize(item.test_name), normalize(item.unit)]);
  const codeKey = (item: ObservationRecord) => JSON.stringify([item.coding_system, item.code]);
  const ordered = observations.filter((item) => item.category === "laboratory" && item.status !== "entered-in-error" && item.status !== "cancelled")
    .sort((a, b) => b.effective_at.localeCompare(a.effective_at));
  const codesByName = new Map<string, Set<string>>();
  for (const item of ordered) {
    if (!item.code) continue;
    const codes = codesByName.get(nameKey(item)) ?? new Set<string>();
    codes.add(codeKey(item));
    codesByName.set(nameKey(item), codes);
  }
  const seen = new Set<string>();
  return ordered.filter((item) => {
    const matchingCodes = codesByName.get(nameKey(item));
    const key = item.code ? `code:${codeKey(item)}`
      : matchingCodes?.size === 1 ? `code:${[...matchingCodes][0]}` : `name:${nameKey(item)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
