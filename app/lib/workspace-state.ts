export type WorkspaceView =
  | "today"
  | "patient"
  | "inbox"
  | "tasks"
  | "documents"
  | "labs"
  | "billing"
  | "reports"
  | "settings";
export type WorkspaceSection = "Overview" | "Encounter" | "Meds" | "Labs" | "Messages" | "History";
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

export type ProviderWorkspaceState = {
  version: 1;
  activeView: WorkspaceView;
  dockedPatientIds: string[];
  detachedPatientIds: string[];
  activePatientId: string | null;
  activeSection: WorkspaceSection;
  detachedSections: Record<string, WorkspaceSection>;
  activeCompanionPanel: WorkspaceCompanionPanel;
  sidebarToolIds: string[];
  windowStates: Record<string, WorkspaceWindowState>;
  savedAt: string;
};

const VIEW_VALUES = new Set<WorkspaceView>([
  "today",
  "patient",
  "inbox",
  "tasks",
  "documents",
  "labs",
  "billing",
  "reports",
  "settings",
]);

const SECTION_VALUES = new Set<WorkspaceSection>([
  "Overview",
  "Encounter",
  "Meds",
  "Labs",
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
  "billing",
  "reports",
  "settings",
]);

const MAX_PATIENT_WINDOWS = 24;
const MAX_ID_LENGTH = 160;

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
    activeSection: workspaceSection(source.activeSection),
    detachedSections,
    activeCompanionPanel,
    sidebarToolIds,
    windowStates,
    savedAt: typeof source.savedAt === "string" && source.savedAt.length <= 64
      ? source.savedAt
      : new Date().toISOString(),
  };
}
