"use client";

import type { CalendarEventEditorDraft } from "./calendar-event-editor";
import type { CalendarViewType } from "./calendar-types";

export interface CalendarWorkspaceHandoff {
  date: string;
  viewMode: CalendarViewType;
  selectedAppointmentId: string | null;
  editorDraft: CalendarEventEditorDraft;
}

let pendingCalendarWorkspaceHandoff: CalendarWorkspaceHandoff | null = null;

export function saveCalendarWorkspaceHandoff(handoff: CalendarWorkspaceHandoff): void {
  pendingCalendarWorkspaceHandoff = handoff;
}

export function consumeCalendarWorkspaceHandoff(): CalendarWorkspaceHandoff | null {
  const handoff = pendingCalendarWorkspaceHandoff;
  pendingCalendarWorkspaceHandoff = null;
  return handoff;
}
