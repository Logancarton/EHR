/**
 * Typed application-shell coordination events.
 *
 * Sibling surfaces under AppChrome (and within PatientWorkspace) coordinate using
 * browser CustomEvents. This module centralizes the event names, payload types,
 * dispatchers, and subscriber helpers so call sites do not use scattered string
 * literals or unsafe casts.
 *
 * Browser event names are preserved exactly to keep compatibility with existing
 * tests and DOM automation contracts.
 */

export const WORKSPACE_SWITCH_VIEW_EVENT = "ehr-switch-view";
export const WORKSPACE_GLOBAL_MODULE_CLOSE_EVENT = "ehr-global-module-close";
export const WORKSPACE_CALENDAR_JUMP_DATE_EVENT = "ehr-calendar-jump-date";
export const WORKSPACE_INSERT_TO_NOTE_EVENT = "ehr-insert-to-note";
export const WORKSPACE_ENCOUNTER_SIGNED_EVENT = "ehr-encounter-signed";
export const WORKSPACE_SELECT_DOCUMENT_EVENT = "ehr-select-document";
export const WORKSPACE_NAVIGATION_COMPLETE_EVENT = "ehr-navigation-complete";
export const WORKSPACE_SIDEBAR_CLEAR_ACTIVE_EVENT = "ehr-sidebar-clear-active";
export const WORKSPACE_SIDEBAR_BADGES_EVENT = "ehr-sidebar-badges";
export const WORKSPACE_SIDEBAR_VISIBILITY_EVENT = "ehr-sidebar-visibility";
export const WORKSPACE_NAVIGATION_MENU_OPEN_EVENT = "ehr-navigation-menu-open";

export type WorkspaceSwitchViewDetail = {
  view: string;
};

export type WorkspaceCalendarJumpDateDetail = {
  date: string;
  daysLater?: number;
};

export type WorkspaceInsertToNoteDetail = {
  text: string;
  patientId: string;
};

export type WorkspaceEncounterSignedDetail = {
  patientId: string;
  appointmentId?: string;
};

export type WorkspaceSelectDocumentDetail = {
  patientId: string;
  documentId: string;
};

export type WorkspaceSidebarBadgesDetail = Record<string, number>;

export type WorkspaceSidebarVisibilityDetail = {
  visible: boolean;
};

export type WorkspaceNavigationMenuOpenDetail = {
  id: string;
};

export interface WorkspaceEventMap {
  [WORKSPACE_SWITCH_VIEW_EVENT]: WorkspaceSwitchViewDetail;
  [WORKSPACE_GLOBAL_MODULE_CLOSE_EVENT]: void;
  [WORKSPACE_CALENDAR_JUMP_DATE_EVENT]: WorkspaceCalendarJumpDateDetail;
  [WORKSPACE_INSERT_TO_NOTE_EVENT]: WorkspaceInsertToNoteDetail;
  [WORKSPACE_ENCOUNTER_SIGNED_EVENT]: WorkspaceEncounterSignedDetail;
  [WORKSPACE_SELECT_DOCUMENT_EVENT]: WorkspaceSelectDocumentDetail;
  [WORKSPACE_NAVIGATION_COMPLETE_EVENT]: void;
  [WORKSPACE_SIDEBAR_CLEAR_ACTIVE_EVENT]: void;
  [WORKSPACE_SIDEBAR_BADGES_EVENT]: WorkspaceSidebarBadgesDetail;
  [WORKSPACE_SIDEBAR_VISIBILITY_EVENT]: WorkspaceSidebarVisibilityDetail;
  [WORKSPACE_NAVIGATION_MENU_OPEN_EVENT]: WorkspaceNavigationMenuOpenDetail;
}

/**
 * Type-safe dispatcher for workspace CustomEvents.
 */
export function dispatchWorkspaceEvent<K extends keyof WorkspaceEventMap>(
  type: K,
  ...args: WorkspaceEventMap[K] extends void ? [detail?: undefined] : [detail: WorkspaceEventMap[K]]
): void {
  if (typeof window === "undefined") return;
  const detail = args[0];
  const event =
    detail !== undefined
      ? new CustomEvent(type, { detail })
      : new CustomEvent(type);
  window.dispatchEvent(event);
}

/**
 * Type-safe subscription helper for workspace CustomEvents.
 * Returns an unsubscription function suitable for React useEffect cleanups.
 */
export function subscribeWorkspaceEvent<K extends keyof WorkspaceEventMap>(
  type: K,
  handler: (detail: WorkspaceEventMap[K], event: CustomEvent<WorkspaceEventMap[K]>) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const listener = (event: Event) => {
    const custom = event as CustomEvent<WorkspaceEventMap[K]>;
    handler(custom.detail, custom);
  };
  window.addEventListener(type, listener);
  return () => {
    window.removeEventListener(type, listener);
  };
}
