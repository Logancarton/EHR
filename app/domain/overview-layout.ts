import type { OverviewCardId } from "../lib/preference-engine";

/** Now-row tiles first (Medications, Measures, Labs, Visits). "diagnoses" stays in
 * the order for saved-preference compatibility; the header Problems bar renders it. */
export const DEFAULT_OVERVIEW_CARD_ORDER: OverviewCardId[] = [
  "medications", "measures", "results", "snapshot", "diagnoses", "history", "timeline",
];
/** Untouched defaults from earlier layouts upgrade to the current default. */
const SUPERSEDED_DEFAULTS = [
  "snapshot,medications,diagnoses,timeline",
  "diagnoses,medications,snapshot,measures,results,history,timeline",
];

/** Upgrade untouched defaults; retain custom/pinned ordering and insert new
 * summaries before activity. All controls use this same resolved order. */
export function resolveOverviewCardOrder(order: OverviewCardId[], pinned: Record<string, boolean> = {}): OverviewCardId[] {
  const legacyDefault = SUPERSEDED_DEFAULTS.includes(order.join(","));
  if (legacyDefault && !Object.values(pinned).some(Boolean)) return [...DEFAULT_OVERVIEW_CARD_ORDER];
  const resolved = [...new Set(order)];
  for (const id of DEFAULT_OVERVIEW_CARD_ORDER) {
    if (resolved.includes(id)) continue;
    const activityIndex = resolved.indexOf("timeline");
    resolved.splice(activityIndex < 0 ? resolved.length : activityIndex, 0, id);
  }
  return resolved;
}
