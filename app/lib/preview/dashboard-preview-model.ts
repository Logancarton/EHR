/**
 * The dashboard prototype's layout model (roadmap §21, DB-1).
 *
 * This is a *preview*: it exists so Logan can use the proposed dashboard before any
 * of it replaces the real home, per DASH-12. Everything here is presentation shape —
 * which windows exist, what a persona starts with, what a personal rearrangement
 * does to that. It holds no clinical state, reads no record and authorizes nothing.
 *
 * Two rules are load-bearing and are asserted in `tests/dashboard-preview-model.test.ts`
 * rather than left to the components:
 *
 * 1. **A persona is a starting layout, never a permission** (DASH-06). `availableTo`
 *    shapes which windows a persona is *offered*; it is not an access decision, and
 *    the real boundary is server-side and belongs to DB-2. The row actions a persona
 *    lists are inert previews of a menu, not a capability grant.
 * 2. **The schedule dominates and cannot be dismissed** (DASH-01). Every other window
 *    is optional and addable; arrivals and the waiting room are off in the clinician
 *    previews because a prescriber running their own day is not the front desk.
 */

import type { PreviewVisit } from "./dashboard-preview-fixtures";

export type PreviewPersonaId = "pmhnp" | "owner" | "manager";

export type PreviewWindowId =
  | "schedule"
  | "arrivals"
  | "prep"
  | "followups"
  | "medwork"
  | "messages"
  | "intake"
  | "handoffs"
  | "billing"
  | "business";

export type PreviewWindowCategory = "schedule" | "clinical" | "communication" | "operations" | "business";

export type PreviewWindowSpan = "half" | "full";

export type PreviewDensity = "comfortable" | "compact";

export type PreviewScheduleView = "roster" | "timeline";

/** The states DASH-11 requires every window to tell apart. Demonstrated, not faked. */
export type PreviewWindowPhase = "loading" | "ready" | "empty" | "error" | "stale";

export type PreviewWindowDefinition = {
  id: PreviewWindowId;
  title: string;
  icon: string;
  /** One line explaining what the window is for, shown in the Add window menu. */
  summary: string;
  category: PreviewWindowCategory;
  /** The schedule is the home surface; it may be reordered around, never removed. */
  permanent?: boolean;
  /**
   * Carries sample money. Every figure in these windows is marked "Demo" so nothing
   * in a screenshot can be mistaken for this practice's actual finances.
   */
  financialDemo?: boolean;
  /** Which persona previews offer this window. A starting point, never a permission. */
  availableTo: readonly PreviewPersonaId[];
};

const ALL_PERSONAS: readonly PreviewPersonaId[] = ["pmhnp", "owner", "manager"];
const CLINICAL_PERSONAS: readonly PreviewPersonaId[] = ["pmhnp", "owner"];
const OPERATIONS_PERSONAS: readonly PreviewPersonaId[] = ["owner", "manager"];

export const PREVIEW_WINDOWS: readonly PreviewWindowDefinition[] = [
  {
    id: "schedule",
    title: "Today's schedule",
    icon: "calendar_month",
    summary: "The clinic day as a roster, with an optional time-based timeline.",
    category: "schedule",
    permanent: true,
    availableTo: ALL_PERSONAS,
  },
  {
    id: "arrivals",
    title: "Arrivals & waiting room",
    icon: "how_to_reg",
    summary: "Who has arrived, who is roomed, and how long they have been waiting.",
    category: "schedule",
    availableTo: ALL_PERSONAS,
  },
  {
    id: "prep",
    title: "Pre-visit preparation",
    icon: "assignment_ind",
    summary: "What to read before the next few visits, drawn from the chart.",
    category: "clinical",
    availableTo: CLINICAL_PERSONAS,
  },
  {
    id: "followups",
    title: "Unsigned work & follow-ups",
    icon: "draw",
    summary: "Drafts still to sign and results still to acknowledge, today's list or not.",
    category: "clinical",
    availableTo: CLINICAL_PERSONAS,
  },
  {
    id: "medwork",
    title: "Medication, lab & refill work",
    icon: "medication",
    summary: "Refill requests, monitoring that is due, and pending prescription work.",
    category: "clinical",
    availableTo: CLINICAL_PERSONAS,
  },
  {
    id: "messages",
    title: "Messages & calls",
    icon: "forum",
    summary: "Patient messages and call-backs waiting on a person.",
    category: "communication",
    availableTo: ALL_PERSONAS,
  },
  {
    id: "intake",
    title: "Intake, coverage & forms",
    icon: "fact_check",
    summary: "New-patient paperwork, eligibility and authorizations.",
    category: "operations",
    availableTo: OPERATIONS_PERSONAS,
  },
  {
    id: "handoffs",
    title: "Team handoffs",
    icon: "swap_horiz",
    summary: "What one member is handing to another, and who has picked it up.",
    category: "operations",
    availableTo: ALL_PERSONAS,
  },
  {
    id: "billing",
    title: "Billing & payments",
    icon: "payments",
    summary: "Claims and balances that need a person. Sample figures only.",
    category: "business",
    financialDemo: true,
    availableTo: OPERATIONS_PERSONAS,
  },
  {
    id: "business",
    title: "Practice performance",
    icon: "insights",
    summary: "Visit volume and collections at a glance. Sample figures only.",
    category: "business",
    financialDemo: true,
    availableTo: ["owner"],
  },
];

const WINDOW_BY_ID = new Map(PREVIEW_WINDOWS.map((window) => [window.id, window]));

export function previewWindow(id: PreviewWindowId): PreviewWindowDefinition {
  const definition = WINDOW_BY_ID.get(id);
  if (!definition) throw new Error(`Unknown preview window: ${id}`);
  return definition;
}

/* -------------------------------------------------------------------------- */
/* Roster fields                                                               */
/* -------------------------------------------------------------------------- */

export type PreviewRosterFieldId =
  | "time"
  | "photo"
  | "visitType"
  | "reason"
  | "room"
  | "mrn"
  | "insurance"
  | "status";

export const PREVIEW_ROSTER_FIELDS: readonly { id: PreviewRosterFieldId; label: string }[] = [
  { id: "time", label: "Time & duration" },
  { id: "photo", label: "Patient photo" },
  { id: "visitType", label: "Visit type" },
  { id: "reason", label: "Reason for visit" },
  { id: "room", label: "Room" },
  { id: "mrn", label: "MRN" },
  { id: "insurance", label: "Coverage" },
  { id: "status", label: "Status" },
];

/* -------------------------------------------------------------------------- */
/* Layout                                                                      */
/* -------------------------------------------------------------------------- */

export type PreviewWindowState = {
  id: PreviewWindowId;
  visible: boolean;
  collapsed: boolean;
  span: PreviewWindowSpan;
};

export type PreviewLayout = {
  windows: PreviewWindowState[];
  density: PreviewDensity;
  scheduleView: PreviewScheduleView;
  rosterFields: PreviewRosterFieldId[];
};

export type PreviewPresetId = "calm" | "dense";

export type PreviewPersona = {
  id: PreviewPersonaId;
  label: string;
  /** What this person is responsible for. Not a role string the server would trust. */
  roleLine: string;
  description: string;
  /** Actions the row menu would offer this person. Inert in the preview. */
  rowActions: readonly string[];
  presets: Record<PreviewPresetId, { label: string; layout: PreviewLayout }>;
};

function layout(
  windows: ReadonlyArray<[PreviewWindowId, Partial<Omit<PreviewWindowState, "id">>]>,
  options: {
    density?: PreviewDensity;
    scheduleView?: PreviewScheduleView;
    rosterFields: PreviewRosterFieldId[];
  },
): PreviewLayout {
  return {
    windows: windows.map(([id, state]) => ({
      id,
      visible: state.visible ?? true,
      collapsed: state.collapsed ?? false,
      span: state.span ?? "half",
    })),
    density: options.density ?? "comfortable",
    scheduleView: options.scheduleView ?? "roster",
    rosterFields: options.rosterFields,
  };
}

/** The calm first-run field set: enough to run the day, nothing to read past. */
const CALM_FIELDS: PreviewRosterFieldId[] = ["time", "photo", "visitType", "status"];
/** What someone who has deliberately asked for density turns on. */
const DENSE_FIELDS: PreviewRosterFieldId[] = [
  "time",
  "photo",
  "visitType",
  "reason",
  "room",
  "mrn",
  "insurance",
  "status",
];

export const PREVIEW_PERSONAS: readonly PreviewPersona[] = [
  {
    id: "pmhnp",
    label: "PMHNP / prescriber",
    roleLine: "Sees their own clinic day and their own unfinished clinical work.",
    description:
      "A balanced clinical cockpit. The schedule dominates; preparation and unfinished work sit beside it. Arrivals and the waiting room are off — a prescriber running their own day is not the front desk.",
    rowActions: [
      "Open visit information",
      "Open the chart",
      "Open medications",
      "Start the visit",
      "Reschedule",
      "Mark no-show",
    ],
    presets: {
      calm: {
        label: "Calm start",
        layout: layout(
          [
            ["schedule", { span: "full" }],
            ["prep", {}],
            ["followups", {}],
            ["medwork", { visible: false }],
            ["messages", { visible: false }],
            ["arrivals", { visible: false }],
            ["handoffs", { visible: false }],
          ],
          { rosterFields: CALM_FIELDS },
        ),
      },
      dense: {
        label: "Dense clinic day",
        layout: layout(
          [
            ["schedule", { span: "full" }],
            ["prep", {}],
            ["medwork", {}],
            ["followups", {}],
            ["messages", {}],
            ["arrivals", { visible: false }],
            ["handoffs", { visible: false }],
          ],
          { density: "compact", rosterFields: DENSE_FIELDS },
        ),
      },
    },
  },
  {
    id: "owner",
    label: "Owner who also sees patients",
    roleLine: "Holds clinical and ownership responsibility at the same time.",
    description:
      "Starts clinically, on the same schedule as any prescriber. The business windows exist and are off until asked for — this is not a finance-first home. Every figure in them is sample data marked Demo.",
    rowActions: [
      "Open visit information",
      "Open the chart",
      "Open medications",
      "Start the visit",
      "Reschedule",
      "Mark no-show",
      "Open billing detail (Demo)",
    ],
    presets: {
      calm: {
        label: "Calm start",
        layout: layout(
          [
            ["schedule", { span: "full" }],
            ["followups", {}],
            ["prep", {}],
            ["medwork", { visible: false }],
            ["messages", { visible: false }],
            ["handoffs", { visible: false }],
            ["intake", { visible: false }],
            ["billing", { visible: false }],
            ["business", { visible: false }],
            ["arrivals", { visible: false }],
          ],
          { rosterFields: CALM_FIELDS },
        ),
      },
      dense: {
        label: "Clinic + business",
        layout: layout(
          [
            ["schedule", { span: "full" }],
            ["followups", {}],
            ["medwork", {}],
            ["business", {}],
            ["billing", {}],
            ["prep", { visible: false }],
            ["messages", { visible: false }],
            ["handoffs", { visible: false }],
            ["intake", { visible: false }],
            ["arrivals", { visible: false }],
          ],
          { density: "compact", rosterFields: DENSE_FIELDS },
        ),
      },
    },
  },
  {
    id: "manager",
    label: "Practice manager / billing",
    roleLine: "Runs the day's operations and the money that follows it.",
    description:
      "The same shared schedule, read for operations rather than for clinical work: who has arrived, what is handed to whom, what coverage is missing. Clinical windows are not offered here; the real boundary is enforced on the server and is DB-2's work, not this layout's.",
    rowActions: [
      "Open visit information",
      "Check the patient in",
      "Assign a room",
      "Reschedule",
      "Mark no-show",
      "Verify coverage",
      "Open billing detail (Demo)",
    ],
    presets: {
      calm: {
        label: "Front-desk start",
        layout: layout(
          [
            ["schedule", { span: "full" }],
            ["arrivals", {}],
            ["intake", {}],
            ["handoffs", { visible: false }],
            ["billing", { visible: false }],
            ["messages", { visible: false }],
          ],
          { rosterFields: ["time", "photo", "visitType", "room", "status"] },
        ),
      },
      dense: {
        label: "Operations + revenue",
        layout: layout(
          [
            ["schedule", { span: "full" }],
            ["arrivals", {}],
            ["intake", {}],
            ["billing", {}],
            ["handoffs", {}],
            ["messages", {}],
          ],
          { density: "compact", rosterFields: DENSE_FIELDS },
        ),
      },
    },
  },
];

const PERSONA_BY_ID = new Map(PREVIEW_PERSONAS.map((persona) => [persona.id, persona]));

export function previewPersona(id: PreviewPersonaId): PreviewPersona {
  const persona = PERSONA_BY_ID.get(id);
  if (!persona) throw new Error(`Unknown preview persona: ${id}`);
  return persona;
}

export function presetLayout(personaId: PreviewPersonaId, preset: PreviewPresetId): PreviewLayout {
  return cloneLayout(previewPersona(personaId).presets[preset].layout);
}

export function cloneLayout(source: PreviewLayout): PreviewLayout {
  return {
    windows: source.windows.map((window) => ({ ...window })),
    density: source.density,
    scheduleView: source.scheduleView,
    rosterFields: [...source.rosterFields],
  };
}

/* -------------------------------------------------------------------------- */
/* Rearrangement                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Whether a window may be taken off the dashboard at all.
 *
 * Only the schedule may not: DASH-01 makes it the surface the home exists for, and a
 * dashboard a clinician can accidentally empty is not a personalization feature.
 */
export function canHide(id: PreviewWindowId): boolean {
  return !previewWindow(id).permanent;
}

export function visibleWindows(source: PreviewLayout): PreviewWindowState[] {
  return source.windows.filter((window) => window.visible);
}

export function hiddenWindows(source: PreviewLayout): PreviewWindowState[] {
  return source.windows.filter((window) => !window.visible);
}

/** Windows this persona is offered that are not currently on the dashboard. */
export function addableWindows(
  source: PreviewLayout,
  personaId: PreviewPersonaId,
): PreviewWindowDefinition[] {
  const present = new Set(source.windows.filter((window) => window.visible).map((window) => window.id));
  return PREVIEW_WINDOWS.filter(
    (definition) => definition.availableTo.includes(personaId) && !present.has(definition.id),
  );
}

/**
 * Moves a window one place among the *visible* ones.
 *
 * Reordering against the visible list rather than the raw array is what makes the
 * keyboard path match what the eye sees: a hidden window between two visible ones
 * would otherwise swallow a press with nothing appearing to happen. This is the
 * keyboard alternative to dragging that DASH-10 requires, not a convenience.
 */
export function moveWindow(
  source: PreviewLayout,
  id: PreviewWindowId,
  direction: "up" | "down",
): PreviewLayout {
  const next = cloneLayout(source);
  const order = next.windows.filter((window) => window.visible).map((window) => window.id);
  const at = order.indexOf(id);
  if (at === -1) return next;
  const target = direction === "up" ? at - 1 : at + 1;
  if (target < 0 || target >= order.length) return next;

  const fromIndex = next.windows.findIndex((window) => window.id === id);
  const toIndex = next.windows.findIndex((window) => window.id === order[target]);
  const [moved] = next.windows.splice(fromIndex, 1);
  next.windows.splice(toIndex, 0, moved);
  return next;
}

export function canMove(
  source: PreviewLayout,
  id: PreviewWindowId,
  direction: "up" | "down",
): boolean {
  const order = source.windows.filter((window) => window.visible).map((window) => window.id);
  const at = order.indexOf(id);
  if (at === -1) return false;
  return direction === "up" ? at > 0 : at < order.length - 1;
}

export function setWindowVisible(
  source: PreviewLayout,
  id: PreviewWindowId,
  visible: boolean,
): PreviewLayout {
  if (!visible && !canHide(id)) return cloneLayout(source);
  const next = cloneLayout(source);
  const existing = next.windows.find((window) => window.id === id);
  if (existing) {
    existing.visible = visible;
    // Restoring a window that was hidden while folded shut would otherwise come back
    // as an empty strip, which reads as a failure to restore it.
    if (visible) existing.collapsed = false;
    return next;
  }
  if (visible) next.windows.push({ id, visible: true, collapsed: false, span: "half" });
  return next;
}

export function toggleCollapse(source: PreviewLayout, id: PreviewWindowId): PreviewLayout {
  const next = cloneLayout(source);
  const existing = next.windows.find((window) => window.id === id);
  if (existing) existing.collapsed = !existing.collapsed;
  return next;
}

/** Resize, keyboard-first: half-width and full-width are the two snap positions. */
export function cycleSpan(source: PreviewLayout, id: PreviewWindowId): PreviewLayout {
  const next = cloneLayout(source);
  const existing = next.windows.find((window) => window.id === id);
  if (existing) existing.span = existing.span === "half" ? "full" : "half";
  return next;
}

export function toggleRosterField(
  source: PreviewLayout,
  field: PreviewRosterFieldId,
): PreviewLayout {
  const next = cloneLayout(source);
  next.rosterFields = next.rosterFields.includes(field)
    ? next.rosterFields.filter((candidate) => candidate !== field)
    : [...next.rosterFields, field];
  return next;
}

export function setDensity(source: PreviewLayout, density: PreviewDensity): PreviewLayout {
  return { ...cloneLayout(source), density };
}

export function setScheduleView(source: PreviewLayout, scheduleView: PreviewScheduleView): PreviewLayout {
  return { ...cloneLayout(source), scheduleView };
}

/**
 * Whether the arrangement still matches the named preset it started from.
 *
 * The preview says "Calm start" or "Calm start · edited" rather than silently
 * showing a preset name over an arrangement that is no longer it (DASH-08).
 */
export function matchesPreset(
  source: PreviewLayout,
  personaId: PreviewPersonaId,
  preset: PreviewPresetId,
): boolean {
  return layoutSignature(source) === layoutSignature(presetLayout(personaId, preset));
}

export function layoutSignature(source: PreviewLayout): string {
  return JSON.stringify({
    windows: source.windows.map((window) => [window.id, window.visible, window.collapsed, window.span]),
    density: source.density,
    scheduleView: source.scheduleView,
    rosterFields: [...source.rosterFields].sort(),
  });
}



/* -------------------------------------------------------------------------- */
/* The active day, and what came off it                                        */
/* -------------------------------------------------------------------------- */

/**
 * The roster is the day's *work*. A cancelled visit is not work.
 *
 * Logan's DB-1 review: "cancel to be removed from the active schedule but there
 * should be a option to click on cancelled apts with an option to put why canceled
 * or a note of some sort." So it leaves the roster and keeps its own list, rather
 * than being deleted — a slot that was booked and released is a fact about the day,
 * and the reason it was released is the part worth having.
 *
 * A no-show stays on the roster. It is an outcome of a visit that was still on the
 * schedule, not a visit that came off it.
 */
export function activeVisits(visits: readonly PreviewVisit[]): PreviewVisit[] {
  return visits.filter((visit) => visit.status !== "cancelled");
}

export function cancelledVisits(visits: readonly PreviewVisit[]): PreviewVisit[] {
  return visits.filter((visit) => visit.status === "cancelled");
}

/* -------------------------------------------------------------------------- */
/* Saved layouts                                                               */
/* -------------------------------------------------------------------------- */

/**
 * A layout the person saved themselves, beside the two each persona starts with.
 *
 * Logan's DB-1 review asked for more than a pair of built-ins: "User should be able
 * to save multiple dashboard preferences." A saved layout belongs to one persona —
 * a clinical arrangement is meaningless in the practice-manager view, and offering
 * it there would be the "layout implies access" confusion again.
 *
 * In the prototype these live in the preview's own session storage. The durable
 * version is the clinician preference record and is DB-5's work.
 */
export type PreviewSavedLayout = {
  id: string;
  name: string;
  personaId: PreviewPersonaId;
  layout: PreviewLayout;
};

/** Which named layout is currently applied: one of the built-ins, or a saved one. */
export type PreviewLayoutRef =
  | { kind: "preset"; preset: PreviewPresetId }
  | { kind: "saved"; id: string };

export function savedLayoutsFor(
  saved: readonly PreviewSavedLayout[],
  personaId: PreviewPersonaId,
): PreviewSavedLayout[] {
  return saved.filter((entry) => entry.personaId === personaId);
}

/** Trims, rejects an empty name, and replaces a same-named layout for that persona. */
export function saveLayout(
  saved: readonly PreviewSavedLayout[],
  entry: { name: string; personaId: PreviewPersonaId; layout: PreviewLayout },
  id: string = `saved-${Math.random().toString(36).slice(2, 10)}`,
): { saved: PreviewSavedLayout[]; id: string } | null {
  const name = entry.name.trim();
  if (!name) return null;

  // Saving over a name the person already used is what they meant by reusing it;
  // two entries reading "Busy Tuesday" would be worse than one that updated.
  const existing = saved.find(
    (candidate) => candidate.personaId === entry.personaId && candidate.name.toLowerCase() === name.toLowerCase(),
  );
  if (existing) {
    return {
      saved: saved.map((candidate) =>
        candidate.id === existing.id ? { ...existing, layout: cloneLayout(entry.layout) } : candidate,
      ),
      id: existing.id,
    };
  }

  return {
    saved: [...saved, { id, name, personaId: entry.personaId, layout: cloneLayout(entry.layout) }],
    id,
  };
}

export function deleteSavedLayout(
  saved: readonly PreviewSavedLayout[],
  id: string,
): PreviewSavedLayout[] {
  return saved.filter((entry) => entry.id !== id);
}

export function findSavedLayout(
  saved: readonly PreviewSavedLayout[],
  id: string,
): PreviewSavedLayout | undefined {
  return saved.find((entry) => entry.id === id);
}

/**
 * Whether the arrangement on screen still matches the named layout it came from.
 *
 * The chip reads "edited" rather than continuing to claim a name the arrangement no
 * longer has (DASH-08). The saved case is why this cannot just compare against a
 * preset: a saved layout is its own baseline.
 */
export function matchesLayoutRef(
  source: PreviewLayout,
  personaId: PreviewPersonaId,
  ref: PreviewLayoutRef,
  saved: readonly PreviewSavedLayout[],
): boolean {
  const baseline =
    ref.kind === "preset"
      ? presetLayout(personaId, ref.preset)
      : findSavedLayout(saved, ref.id)?.layout;
  if (!baseline) return false;
  return layoutSignature(source) === layoutSignature(baseline);
}

/**
 * Rebuilds an arrangement for a different persona.
 *
 * Switching persona in the preview shows that person's starting layout. It carries
 * nothing across, because carrying a clinical window into the manager preview would
 * be exactly the "layout grants access" confusion DASH-06 forbids — and in the real
 * product the server would refuse the data behind it regardless of the layout.
 */
export function layoutForPersona(personaId: PreviewPersonaId, preset: PreviewPresetId): PreviewLayout {
  return presetLayout(personaId, preset);
}
