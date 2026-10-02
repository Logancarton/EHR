import type { OverviewCardId } from "../lib/preference-engine";

export const DEFAULT_OVERVIEW_CARD_ORDER: OverviewCardId[] = [
  "diagnoses", "medications", "snapshot", "measures", "results", "history", "timeline",
];

/** Upgrade untouched defaults; retain custom/pinned ordering and insert new
 * summaries before activity. All controls use this same resolved order. */
export function resolveOverviewCardOrder(order: OverviewCardId[], pinned: Record<string, boolean> = {}): OverviewCardId[] {
  const legacyDefault = order.join(",") === "snapshot,medications,diagnoses,timeline";
  if (legacyDefault && !Object.values(pinned).some(Boolean)) return [...DEFAULT_OVERVIEW_CARD_ORDER];
  const resolved = [...new Set(order)];
  for (const id of DEFAULT_OVERVIEW_CARD_ORDER) {
    if (resolved.includes(id)) continue;
    const activityIndex = resolved.indexOf("timeline");
    resolved.splice(activityIndex < 0 ? resolved.length : activityIndex, 0, id);
  }
  return resolved;
}
