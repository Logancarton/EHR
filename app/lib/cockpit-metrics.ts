/**
 * The Practice Cockpit's tiles, as data rather than four hardcoded cards.
 *
 * Which tiles are worth showing depends entirely on who is looking. A solo
 * clinician does not need to be told that someone is in the lobby or that a
 * visit is in progress — they are the one in the room. A front desk needs
 * exactly those. So the cockpit is a chosen, ordered list rather than a fixed
 * set, and the presets below are starting points to fork, not modes.
 */

export type CockpitMetricId = "scheduled" | "waiting" | "inVisit" | "upcoming" | "completed";

/** Drives the tile's accent. Tones map to tokens, never to raw colour. */
export type CockpitMetricTone = "neutral" | "urgent" | "active" | "positive";

export type CockpitMetric = {
  id: CockpitMetricId;
  label: string;
  /** Shown in the cockpit menu, to explain what the tile is for. */
  hint: string;
  /** Roster filter this tile selects when clicked. */
  filter: "all" | "waiting" | "in-visit" | "upcoming" | "completed";
  tone: CockpitMetricTone;
};

export const COCKPIT_METRICS: CockpitMetric[] = [
  { id: "scheduled", label: "Total Scheduled", hint: "Everything booked today", filter: "all", tone: "neutral" },
  { id: "waiting", label: "Waiting in Lobby", hint: "Arrived and not yet seen", filter: "waiting", tone: "urgent" },
  { id: "inVisit", label: "In Visit", hint: "Sessions in progress right now", filter: "in-visit", tone: "active" },
  { id: "upcoming", label: "Upcoming Visits", hint: "Still ahead of you today", filter: "upcoming", tone: "neutral" },
  { id: "completed", label: "Completed", hint: "Seen and closed out today", filter: "completed", tone: "positive" },
];

export const ALL_COCKPIT_METRIC_IDS = COCKPIT_METRICS.map((metric) => metric.id);

export type CockpitPreset = {
  id: string;
  name: string;
  description: string;
  tiles: CockpitMetricId[];
};

export const COCKPIT_PRESETS: CockpitPreset[] = [
  {
    id: "solo",
    name: "Solo provider",
    description: "You already know who is in the room. Just what is still ahead.",
    tiles: ["upcoming"],
  },
  {
    id: "front-desk",
    name: "Front desk",
    description: "Arrivals and flow, for whoever is working the lobby.",
    tiles: ["scheduled", "waiting", "inVisit"],
  },
  {
    id: "full",
    name: "Full cockpit",
    description: "Every counter, for a high-volume clinic day.",
    tiles: [...ALL_COCKPIT_METRIC_IDS],
  },
];

export function findCockpitMetric(id: string): CockpitMetric | undefined {
  return COCKPIT_METRICS.find((metric) => metric.id === id);
}

/** Stored ids resolved to tiles, in the clinician's order, ignoring unknowns. */
export function visibleCockpitMetrics(order: readonly string[]): CockpitMetric[] {
  return order
    .map((id) => findCockpitMetric(id))
    .filter((metric): metric is CockpitMetric => Boolean(metric));
}

/** Tiles not currently on the cockpit, in registry order, for the "add" list. */
export function hiddenCockpitMetrics(order: readonly string[]): CockpitMetric[] {
  return COCKPIT_METRICS.filter((metric) => !order.includes(metric.id));
}

export function hideCockpitMetric(order: readonly string[], id: string): CockpitMetricId[] {
  return order.filter((value) => value !== id) as CockpitMetricId[];
}

/** Restores a tile to the position it holds in the registry, not the end, so
 *  re-adding something does not scramble an order the clinician already set. */
export function showCockpitMetric(order: readonly string[], id: string): CockpitMetricId[] {
  if (order.includes(id)) return [...order] as CockpitMetricId[];
  const next = [...order, id] as CockpitMetricId[];
  return next.sort(
    (a, b) => ALL_COCKPIT_METRIC_IDS.indexOf(a) - ALL_COCKPIT_METRIC_IDS.indexOf(b),
  );
}

export function toggleCockpitMetric(order: readonly string[], id: string): CockpitMetricId[] {
  return order.includes(id) ? hideCockpitMetric(order, id) : showCockpitMetric(order, id);
}

/** Moves a tile one place left or right. Out-of-range moves are no-ops. */
export function moveCockpitMetric(
  order: readonly string[],
  id: string,
  direction: -1 | 1,
): CockpitMetricId[] {
  const list = [...order] as CockpitMetricId[];
  const from = list.indexOf(id as CockpitMetricId);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= list.length) return list;
  [list[from], list[to]] = [list[to], list[from]];
  return list;
}

/** The preset the current arrangement matches, if any, so the menu can mark it. */
export function matchingCockpitPreset(order: readonly string[]): CockpitPreset | undefined {
  return COCKPIT_PRESETS.find(
    (preset) =>
      preset.tiles.length === order.length &&
      preset.tiles.every((tile, index) => tile === order[index]),
  );
}
