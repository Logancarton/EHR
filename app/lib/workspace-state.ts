export type WorkspaceView =
  | "home"
  | "today"
  | "calendar"
  | "intake"
  | "patient"
  | "inbox"
  | "tasks"
  | "documents"
  | "labs"
  | "prescribing"
  | "billing"
  | "reports"
  | "settings"
  | "website"
  | "social_media"
  | "email"
  | "hr"
  | "patient_communication"
  | "financial_integration";
export type WorkspaceSection = "Overview" | "Encounter" | "Meds" | "Labs" | "Documents" | "Messages" | "History";
export type WorkspaceCompanionPanel = "ai" | "scratchpad" | "tasks" | "calc" | null;
export type WorkspaceSnapTarget =
  | "left"
  | "right"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "full";

export type WorkspaceWindowState = {
  leftRatio: number;
  topRatio: number;
  widthRatio: number;
  heightRatio: number;
  snapTarget?: WorkspaceSnapTarget;
  minimized?: boolean;
  maximized?: boolean;
};

export type WorkspaceScrollPosition = {
  top: number;
  left: number;
};

export type WorkspacePatientScrollPositions = Record<
  string,
  Partial<Record<WorkspaceSection, WorkspaceScrollPosition>>
>;

export const DURABLE_WORKSPACE_SCROLL_SECTIONS = [
  "Overview",
  "Meds",
  "Labs",
  "Documents",
  "Messages",
  "History",
] as const satisfies readonly WorkspaceSection[];

export type ProviderWorkspaceState = {
  version: 1;
  activeView: WorkspaceView;
  dockedPatientIds: string[];
  detachedPatientIds: string[];
  activePatientId: string | null;
  activeSection: WorkspaceSection;
  detachedSections: Record<string, WorkspaceSection>;
  patientSections?: Record<string, WorkspaceSection>;
  patientScrollPositions?: WorkspacePatientScrollPositions;
  activeCompanionPanel: WorkspaceCompanionPanel;
  sidebarToolIds: string[];
  windowStates: Record<string, WorkspaceWindowState>;
  savedAt: string;
};

const VIEW_VALUES = new Set<WorkspaceView>([
  "home",
  "today",
  "calendar",
  "intake",
  "patient",
  "inbox",
  "tasks",
  "documents",
  "labs",
  "prescribing",
  "billing",
  "reports",
  "settings",
  "website",
  "social_media",
  "email",
  "hr",
  "patient_communication",
  "financial_integration",
]);

/**
 * How a rendered workspace is recognised, and which control switches to a view.
 *
 * `WorkspaceStateManager` used to key both halves of this off the `.home-tab`
 * class. That class named the tab-strip button that opened Today until the Zen
 * home launcher took it over (b2c1eed) and pointed it at `home` instead. Neither
 * side of the class change was wrong on its own; what broke was that capture and
 * restore each kept trusting a CSS class to mean a view.
 *
 * The result: sitting on the launcher saved `today`, and restoring a saved `today`
 * clicked the launcher — so a clinician's dashboard never came back after a reload,
 * and `home` was never persisted at all.
 *
 * So the contract is explicit and declared by the markup: a control that switches to
 * a view carries `data-workspace-view`, and a view is recognised by the pane it
 * renders. Both are plain data here so they can be tested without a browser.
 */
export const WORKSPACE_VIEW_ATTRIBUTE = "data-workspace-view";

export type RenderedWorkspaceProbe = {
  /** The Today dashboard pane is on screen. */
  hasTodayDashboard: boolean;
  /** A first-class calendar surface is on screen. */
  hasCalendar?: boolean;
  /** The Zen home launcher pane is on screen. */
  hasZenHome: boolean;
};

/** The view the clinician is actually looking at, for an honest autosave. */
export function renderedWorkspaceView(probe: RenderedWorkspaceProbe): WorkspaceView {
  if (probe.hasCalendar) return "calendar";
  if (probe.hasTodayDashboard) return "today";
  if (probe.hasZenHome) return "home";
  return "patient";
}

/**
 * The control that puts a view back, or null when the view needs no control —
 * `patient` is restored by clicking the chart's own tab, which is per-patient.
 */
export function workspaceViewControlSelector(view: WorkspaceView): string | null {
  if (view === "today" || view === "home" || view === "calendar") {
    return `[${WORKSPACE_VIEW_ATTRIBUTE}="${view}"]`;
  }
  return null;
}

/** The pane that proves a view finished rendering, so a restore can wait for it. */
export function workspaceViewPaneSelector(view: WorkspaceView): string | null {
  if (view === "today") return ".today-dashboard";
  if (view === "calendar") return ".gcal-root";
  if (view === "home") return ".zen-home-pane";
  return null;
}

const SECTION_VALUES = new Set<WorkspaceSection>([
  "Overview",
  "Encounter",
  "Meds",
  "Labs",
  "Documents",
  "Messages",
  "History",
]);

const COMPANION_VALUES = new Set<Exclude<WorkspaceCompanionPanel, null>>([
  "ai",
  "scratchpad",
  "tasks",
  "calc",
]);

const SNAP_VALUES = new Set<WorkspaceSnapTarget>([
  "left",
  "right",
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
  "full",
]);

const SIDEBAR_TOOL_VALUES = new Set([
  "today",
  "schedule",
  "inbox",
  "tasks",
  "documents",
  "labs",
  "prescribing",
  "billing",
  "reports",
  "settings",
]);

const MAX_PATIENT_WINDOWS = 24;
const MAX_ID_LENGTH = 160;
const MAX_SCROLL_OFFSET = 10_000_000;

function boundedNumber(value: unknown, fallback: number, min = 0, max = 1) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

function patientId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_ID_LENGTH) return null;
  return trimmed;
}

function patientIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const unique = new Set<string>();
  for (const candidate of value) {
    const id = patientId(candidate);
    if (!id) continue;
    unique.add(id);
    if (unique.size >= MAX_PATIENT_WINDOWS) break;
  }
  return [...unique];
}

function workspaceSection(value: unknown, fallback: WorkspaceSection = "Overview"): WorkspaceSection {
  return typeof value === "string" && SECTION_VALUES.has(value as WorkspaceSection)
    ? (value as WorkspaceSection)
    : fallback;
}

function workspaceView(value: unknown): WorkspaceView {
  return typeof value === "string" && VIEW_VALUES.has(value as WorkspaceView)
    ? value as WorkspaceView
    : "today";
}

function sanitizeWindowState(value: unknown): WorkspaceWindowState | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const state: WorkspaceWindowState = {
    leftRatio: boundedNumber(source.leftRatio, 0.1),
    topRatio: boundedNumber(source.topRatio, 0.08),
    widthRatio: boundedNumber(source.widthRatio, 0.48, 0.15, 1),
    heightRatio: boundedNumber(source.heightRatio, 0.75, 0.15, 1),
  };

  if (typeof source.snapTarget === "string" && SNAP_VALUES.has(source.snapTarget as WorkspaceSnapTarget)) {
    state.snapTarget = source.snapTarget as WorkspaceSnapTarget;
  }
  if (source.minimized === true) state.minimized = true;
  if (source.maximized === true) state.maximized = true;
  return state;
}

function sanitizeScrollPosition(value: unknown): WorkspaceScrollPosition | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  if (typeof source.top !== "number" && typeof source.left !== "number") return null;
  return {
    top: Math.round(boundedNumber(source.top, 0, 0, MAX_SCROLL_OFFSET)),
    left: Math.round(boundedNumber(source.left, 0, 0, MAX_SCROLL_OFFSET)),
  };
}

export function sanitizeWorkspaceState(value: unknown): ProviderWorkspaceState | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;

  const dockedPatientIds = patientIds(source.dockedPatientIds);
  const detachedPatientIds = patientIds(source.detachedPatientIds).filter((id) => !dockedPatientIds.includes(id));
  const allPatientIds = new Set([...dockedPatientIds, ...detachedPatientIds]);

  const activeCandidate = patientId(source.activePatientId);
  const activePatientId = activeCandidate && allPatientIds.has(activeCandidate)
    ? activeCandidate
    : dockedPatientIds[0] ?? detachedPatientIds[0] ?? null;

  const detachedSections: Record<string, WorkspaceSection> = {};
  if (source.detachedSections && typeof source.detachedSections === "object") {
    for (const id of detachedPatientIds) {
      const section = (source.detachedSections as Record<string, unknown>)[id];
      detachedSections[id] = workspaceSection(section);
    }
  }

  // Migrate legacy snapshots without assigning the active section to every chart.
  const patientSections: Record<string, WorkspaceSection> = {};
  const storedSections = source.patientSections && typeof source.patientSections === "object"
    ? source.patientSections as Record<string, unknown> : {};
  for (const id of allPatientIds) {
    const fallback = detachedPatientIds.includes(id)
      ? detachedSections[id] ?? "Overview"
      : id === activePatientId ? workspaceSection(source.activeSection) : "Overview";
    patientSections[id] = workspaceSection(
      Object.prototype.hasOwnProperty.call(storedSections, id) ? storedSections[id] : undefined,
      fallback,
    );
    if (detachedPatientIds.includes(id)) detachedSections[id] = patientSections[id];
  }

  const patientScrollPositions: WorkspacePatientScrollPositions = {};
  if (source.patientScrollPositions && typeof source.patientScrollPositions === "object") {
    const storedScrollPositions = source.patientScrollPositions as Record<string, unknown>;
    for (const id of allPatientIds) {
      const patientPositions = storedScrollPositions[id];
      if (!patientPositions || typeof patientPositions !== "object") continue;
      const sanitized: Partial<Record<WorkspaceSection, WorkspaceScrollPosition>> = {};
      for (const section of DURABLE_WORKSPACE_SCROLL_SECTIONS) {
        const position = sanitizeScrollPosition((patientPositions as Record<string, unknown>)[section]);
        if (position) sanitized[section] = position;
      }
      if (Object.keys(sanitized).length) patientScrollPositions[id] = sanitized;
    }
  }

  const windowStates: Record<string, WorkspaceWindowState> = {};
  if (source.windowStates && typeof source.windowStates === "object") {
    for (const id of detachedPatientIds) {
      const state = sanitizeWindowState((source.windowStates as Record<string, unknown>)[id]);
      if (state) windowStates[id] = state;
    }
  }

  const sidebarToolIds = Array.isArray(source.sidebarToolIds)
    ? [...new Set(source.sidebarToolIds.filter(
        (tool): tool is string => typeof tool === "string" && SIDEBAR_TOOL_VALUES.has(tool),
      ))]
    : [];

  let activeCompanionPanel: WorkspaceCompanionPanel = null;
  if (typeof source.activeCompanionPanel === "string" && COMPANION_VALUES.has(source.activeCompanionPanel as Exclude<WorkspaceCompanionPanel, null>)) {
    activeCompanionPanel = source.activeCompanionPanel as Exclude<WorkspaceCompanionPanel, null>;
  }

  return {
    version: 1,
    activeView: workspaceView(source.activeView),
    dockedPatientIds,
    detachedPatientIds,
    activePatientId,
    activeSection: activePatientId ? patientSections[activePatientId] : workspaceSection(source.activeSection),
    detachedSections,
    patientSections,
    patientScrollPositions,
    activeCompanionPanel,
    sidebarToolIds,
    windowStates,
    savedAt: typeof source.savedAt === "string" && source.savedAt.length <= 64
      ? source.savedAt
      : new Date().toISOString(),
  };
}
