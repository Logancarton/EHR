import {
  DURABLE_WORKSPACE_SCROLL_SECTIONS,
  type WorkspacePatientScrollPositions,
  type WorkspaceScrollPosition,
  type WorkspaceSection,
} from "./workspace-state";

export const WORKSPACE_SCROLL_STATE_HYDRATED_EVENT = "ehr:workspace-scroll-state-hydrated";
const STORAGE_PREFIX = "ehr-scroll-position-v3:";

export function patientContentScrollIdentity(patientId: string, section: WorkspaceSection) {
  return JSON.stringify(["patient-content", patientId, section]);
}

function storageKey(identity: string, axis: "top" | "left") {
  return `${STORAGE_PREFIX}${identity}:${axis}`;
}

export function readScrollPosition(identity: string, axis: "top" | "left") {
  try {
    const value = Number(window.sessionStorage.getItem(storageKey(identity, axis)));
    return Number.isFinite(value) && value >= 0 ? value : 0;
  } catch {
    return 0;
  }
}

function readStoredScrollPosition(identity: string, axis: "top" | "left") {
  try {
    const raw = window.sessionStorage.getItem(storageKey(identity, axis));
    if (raw === null) return null;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? value : null;
  } catch {
    return null;
  }
}

export function writeScrollPosition(identity: string, axis: "top" | "left", value: number) {
  try {
    window.sessionStorage.setItem(
      storageKey(identity, axis),
      String(Math.max(0, Math.round(value))),
    );
  } catch {
    // Scroll memory is a progressive enhancement.
  }
}

export function captureWorkspaceScrollPositions(patientIds: Iterable<string>): WorkspacePatientScrollPositions {
  const positions: WorkspacePatientScrollPositions = {};

  for (const patientId of patientIds) {
    const patientPositions: Partial<Record<WorkspaceSection, WorkspaceScrollPosition>> = {};
    for (const section of DURABLE_WORKSPACE_SCROLL_SECTIONS) {
      const identity = patientContentScrollIdentity(patientId, section);
      const top = readStoredScrollPosition(identity, "top");
      const left = readStoredScrollPosition(identity, "left");
      if (top === null && left === null) continue;
      patientPositions[section] = { top: top ?? 0, left: left ?? 0 };
    }
    if (Object.keys(patientPositions).length) positions[patientId] = patientPositions;
  }

  return positions;
}

export function hydrateWorkspaceScrollPositions(positions: WorkspacePatientScrollPositions | undefined) {
  if (!positions) return;

  for (const [patientId, patientPositions] of Object.entries(positions)) {
    for (const section of DURABLE_WORKSPACE_SCROLL_SECTIONS) {
      const position = patientPositions[section];
      if (!position) continue;
      const identity = patientContentScrollIdentity(patientId, section);
      writeScrollPosition(identity, "top", position.top);
      writeScrollPosition(identity, "left", position.left);
    }
  }

  window.dispatchEvent(new Event(WORKSPACE_SCROLL_STATE_HYDRATED_EVENT));
}
