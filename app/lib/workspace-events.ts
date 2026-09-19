/**
 * Typed application-shell coordination events.
 *
 * Sibling surfaces under AppChrome (and within PatientWorkspace) coordinate using
 * browser CustomEvents. This module centralizes the event names, payload types,
 * runtime guards, dispatchers, and subscriber helpers so call sites do not use
 * scattered string literals or unsafe casts.
 *
 * Browser event names are preserved exactly to keep compatibility with existing
 * tests and DOM automation contracts.
 */

export const WORKSPACE_SWITCH_VIEW_EVENT = "ehr-switch-view";
export const WORKSPACE_GLOBAL_MODULE_CLOSE_EVENT = "ehr-global-module-close";
export const WORKSPACE_CALENDAR_JUMP_DATE_EVENT = "ehr-calendar-jump-date";
export const WORKSPACE_INSERT_TO_NOTE_EVENT = "ehr-insert-to-note";
export const WORKSPACE_ENCOUNTER_SIGNED_EVENT = "ehr-encounter-signed";
export const WORKSPACE_APPOINTMENT_UPDATED_EVENT = "ehr-appointment-updated";
export const WORKSPACE_ORDER_CART_UPDATED_EVENT = "ehr-order-cart-updated";
export const WORKSPACE_TASKS_UPDATED_EVENT = "ehr-tasks-updated";
export const WORKSPACE_SELECT_DOCUMENT_EVENT = "ehr-select-document";
export const WORKSPACE_DOCUMENT_WORKFLOW_UPDATED_EVENT = "ehr-document-workflow-updated";
export const WORKSPACE_PATIENT_UPDATED_EVENT = "ehr-patient-updated";
export const WORKSPACE_SIDEBAR_CLEAR_ACTIVE_EVENT = "ehr-sidebar-clear-active";
export const WORKSPACE_SIDEBAR_BADGES_EVENT = "ehr-sidebar-badges";
export const WORKSPACE_SIDEBAR_VISIBILITY_EVENT = "ehr-sidebar-visibility";
export const WORKSPACE_SIDEBAR_VISIBILITY_REQUEST_EVENT = "ehr-sidebar-visibility-request";
export const WORKSPACE_NAVIGATION_MENU_OPEN_EVENT = "ehr-navigation-menu-open";
export const WORKSPACE_OPEN_COMMUNICATIONS_EVENT = "ehr-open-communications";
export const WORKSPACE_NAVIGATION_COMPLETE_EVENT = "ehr-navigation-complete";
export const WORKSPACE_NAVIGATION_HISTORY_STATE_EVENT = "ehr-navigation-history-state";
export const WORKSPACE_ORDER_CREATED_EVENT = "ehr-order-created";
export const WORKSPACE_CARE_COMPLETION_CHANGED_EVENT = "ehr-care-completion-changed";
export const WORKSPACE_TOOL_PINS_CHANGED_EVENT = "ehr-tool-pins-changed";

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

export type WorkspaceAppointmentUpdatedDetail = {
  appointmentId: string;
  status?: string;
};

export type WorkspaceOrderCartUpdatedDetail = {
  patientId: string;
  remainingCount?: number;
};

export type WorkspaceTasksUpdatedDetail = {
  patientId?: string;
};

export type WorkspaceSelectDocumentDetail = {
  patientId: string;
  documentId: string;
};

export type WorkspaceDocumentWorkflowUpdatedDetail = {
  patientId: string;
  documentId: string;
};

export type WorkspacePatientUpdatedDetail = {
  patientId: string;
  photoUrl?: string;
  name?: string;
  patient?: Record<string, unknown>;
};

export type WorkspaceSidebarBadgesDetail = Record<string, number>;

export type WorkspaceSidebarVisibilityDetail = {
  visible: boolean;
};

export type WorkspaceSidebarVisibilityRequestDetail = {
  visible: boolean;
};

export type WorkspaceNavigationMenuOpenDetail = {
  id: string;
};

export type WorkspaceOpenCommunicationsDetail = {
  channel?: string;
};

export type WorkspaceNavigationHistoryStateDetail = {
  canBack: boolean;
  canForward: boolean;
};

export type WorkspaceOrderCreatedDetail = {
  patientId?: string;
  name?: string;
  order?: unknown;
};

export type WorkspaceCareCompletionChangedDetail = Record<string, unknown>;
export type WorkspaceToolPinsChangedDetail = Record<string, unknown>;

export interface WorkspaceEventMap {
  [WORKSPACE_SWITCH_VIEW_EVENT]: WorkspaceSwitchViewDetail;
  [WORKSPACE_GLOBAL_MODULE_CLOSE_EVENT]: void;
  [WORKSPACE_CALENDAR_JUMP_DATE_EVENT]: WorkspaceCalendarJumpDateDetail;
  [WORKSPACE_INSERT_TO_NOTE_EVENT]: WorkspaceInsertToNoteDetail;
  [WORKSPACE_ENCOUNTER_SIGNED_EVENT]: WorkspaceEncounterSignedDetail;
  [WORKSPACE_APPOINTMENT_UPDATED_EVENT]: WorkspaceAppointmentUpdatedDetail;
  [WORKSPACE_ORDER_CART_UPDATED_EVENT]: WorkspaceOrderCartUpdatedDetail;
  [WORKSPACE_TASKS_UPDATED_EVENT]: void;
  [WORKSPACE_SELECT_DOCUMENT_EVENT]: WorkspaceSelectDocumentDetail;
  [WORKSPACE_DOCUMENT_WORKFLOW_UPDATED_EVENT]: WorkspaceDocumentWorkflowUpdatedDetail;
  [WORKSPACE_PATIENT_UPDATED_EVENT]: WorkspacePatientUpdatedDetail;
  [WORKSPACE_SIDEBAR_CLEAR_ACTIVE_EVENT]: void;
  [WORKSPACE_SIDEBAR_BADGES_EVENT]: WorkspaceSidebarBadgesDetail;
  [WORKSPACE_SIDEBAR_VISIBILITY_EVENT]: WorkspaceSidebarVisibilityDetail;
  [WORKSPACE_SIDEBAR_VISIBILITY_REQUEST_EVENT]: WorkspaceSidebarVisibilityRequestDetail;
  [WORKSPACE_NAVIGATION_MENU_OPEN_EVENT]: WorkspaceNavigationMenuOpenDetail;
  [WORKSPACE_OPEN_COMMUNICATIONS_EVENT]: WorkspaceOpenCommunicationsDetail;
  [WORKSPACE_NAVIGATION_COMPLETE_EVENT]: void;
  [WORKSPACE_NAVIGATION_HISTORY_STATE_EVENT]: WorkspaceNavigationHistoryStateDetail;
  [WORKSPACE_ORDER_CREATED_EVENT]: WorkspaceOrderCreatedDetail;
  [WORKSPACE_CARE_COMPLETION_CHANGED_EVENT]: WorkspaceCareCompletionChangedDetail;
  [WORKSPACE_TOOL_PINS_CHANGED_EVENT]: WorkspaceToolPinsChangedDetail;
}

// Runtime Type Guards

export function isSwitchViewDetail(value: unknown): value is WorkspaceSwitchViewDetail {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.view === "string" && v.view.trim().length > 0;
}

export function isCalendarJumpDetail(value: unknown): value is WorkspaceCalendarJumpDateDetail {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (typeof v.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v.date)) return false;
  if (v.daysLater !== undefined && (typeof v.daysLater !== "number" || !Number.isFinite(v.daysLater))) return false;
  return true;
}

export function isEncounterSignedDetail(value: unknown): value is WorkspaceEncounterSignedDetail {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (typeof v.patientId !== "string" || v.patientId.trim().length === 0) return false;
  if (v.appointmentId !== undefined && typeof v.appointmentId !== "string") return false;
  return true;
}

export function isAppointmentUpdatedDetail(value: unknown): value is WorkspaceAppointmentUpdatedDetail {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (typeof v.appointmentId !== "string" || v.appointmentId.trim().length === 0) return false;
  if (v.status !== undefined && typeof v.status !== "string") return false;
  return true;
}

export function isInsertToNoteDetail(value: unknown): value is WorkspaceInsertToNoteDetail {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.patientId === "string" && v.patientId.trim().length > 0 && typeof v.text === "string";
}

export function isSelectDocumentDetail(value: unknown): value is WorkspaceSelectDocumentDetail {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.patientId === "string" &&
    v.patientId.trim().length > 0 &&
    typeof v.documentId === "string" &&
    v.documentId.trim().length > 0
  );
}

export function isDocumentWorkflowUpdatedDetail(value: unknown): value is WorkspaceDocumentWorkflowUpdatedDetail {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.patientId === "string" &&
    v.patientId.trim().length > 0 &&
    typeof v.documentId === "string" &&
    v.documentId.trim().length > 0
  );
}

export function isPatientUpdatedDetail(value: unknown): value is WorkspacePatientUpdatedDetail {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.patientId === "string" && v.patientId.trim().length > 0;
}

export function isOrderCartUpdatedDetail(value: unknown): value is WorkspaceOrderCartUpdatedDetail {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.patientId === "string" && v.patientId.trim().length > 0;
}

export function isSidebarBadgesDetail(value: unknown): value is WorkspaceSidebarBadgesDetail {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value as Record<string, unknown>).every((val) => typeof val === "number" && Number.isFinite(val));
}

export function isNavigationMenuOpenDetail(value: unknown): value is WorkspaceNavigationMenuOpenDetail {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === "string" && v.id.trim().length > 0;
}

export function isOpenCommunicationsDetail(value: unknown): value is WorkspaceOpenCommunicationsDetail {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return v.channel === undefined || typeof v.channel === "string";
}

export function isNavigationHistoryStateDetail(value: unknown): value is WorkspaceNavigationHistoryStateDetail {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.canBack === "boolean" && typeof v.canForward === "boolean";
}

const DETAIL_GUARDS: Partial<Record<keyof WorkspaceEventMap, (value: unknown) => boolean>> = {
  [WORKSPACE_SWITCH_VIEW_EVENT]: isSwitchViewDetail,
  [WORKSPACE_CALENDAR_JUMP_DATE_EVENT]: isCalendarJumpDetail,
  [WORKSPACE_INSERT_TO_NOTE_EVENT]: isInsertToNoteDetail,
  [WORKSPACE_ENCOUNTER_SIGNED_EVENT]: isEncounterSignedDetail,
  [WORKSPACE_APPOINTMENT_UPDATED_EVENT]: isAppointmentUpdatedDetail,
  [WORKSPACE_ORDER_CART_UPDATED_EVENT]: isOrderCartUpdatedDetail,
  [WORKSPACE_SELECT_DOCUMENT_EVENT]: isSelectDocumentDetail,
  [WORKSPACE_DOCUMENT_WORKFLOW_UPDATED_EVENT]: isDocumentWorkflowUpdatedDetail,
  [WORKSPACE_PATIENT_UPDATED_EVENT]: isPatientUpdatedDetail,
  [WORKSPACE_SIDEBAR_BADGES_EVENT]: isSidebarBadgesDetail,
  [WORKSPACE_NAVIGATION_MENU_OPEN_EVENT]: isNavigationMenuOpenDetail,
  [WORKSPACE_OPEN_COMMUNICATIONS_EVENT]: isOpenCommunicationsDetail,
  [WORKSPACE_NAVIGATION_HISTORY_STATE_EVENT]: isNavigationHistoryStateDetail,
};

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
 * Performs lightweight runtime validation so malformed payloads cannot crash consumers.
 * Returns an unsubscription function suitable for React useEffect cleanups.
 */
export function subscribeWorkspaceEvent<K extends keyof WorkspaceEventMap>(
  type: K,
  handler: (detail: WorkspaceEventMap[K], event: CustomEvent<WorkspaceEventMap[K]>) => void,
  options?: { guard?: (value: unknown) => value is WorkspaceEventMap[K] },
): () => void {
  if (typeof window === "undefined") return () => {};
  const guard = options?.guard ?? DETAIL_GUARDS[type];
  const listener = (event: Event) => {
    const custom = event as CustomEvent<WorkspaceEventMap[K]>;
    if (guard && !guard(custom.detail)) {
      return;
    }
    handler(custom.detail, custom);
  };
  window.addEventListener(type, listener);
  return () => {
    window.removeEventListener(type, listener);
  };
}
