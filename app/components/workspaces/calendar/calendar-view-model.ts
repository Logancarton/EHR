"use client";

import { useMemo } from "react";
import {
  type ScheduleItem,
  formatDateHeading,
  formatShortDate,
  parseDateString,
  getWeekDates,
} from "../../../lib/schedule-data";
import { buildCalendarGridLayout } from "../../../lib/calendar-grid-layout";
import type { CalendarFilters } from "./calendar-filters";
import type { CalendarViewType } from "./calendar-types";

const CLINIC_START_HOUR = 7;
const CLINIC_END_HOUR = 20; // 8:00 PM

/**
 * Derives everything the Calendar renders from the canonical schedule
 * snapshot plus navigation/filter state — filtering, grouping, grid geometry,
 * and the header title. Pure derivation only: nothing here fetches, persists,
 * or owns state of its own. `calendar-grid-layout.ts` remains the sole
 * geometry authority; this only calls it.
 */
export function useCalendarViewModel(
  appointments: readonly ScheduleItem[],
  filters: CalendarFilters,
  viewMode: CalendarViewType,
  currentDate: string,
) {
  const {
    searchQuery,
    showInPerson,
    showTelehealth,
    showMeetings,
    showBreaks,
    showCompleted,
    showWaiting,
  } = filters;

  const filteredAppointments = useMemo(() => {
    return appointments.filter((apt) => {
      const isMeeting =
        apt.type === "Team Meeting" ||
        apt.type === "Case Conference" ||
        apt.type === "Supervision" ||
        apt.mrn === "MEETING" ||
        apt.patientId?.startsWith("event-meeting");

      const isBreakOrBlock =
        apt.type === "Break" ||
        apt.type === "Time Off" ||
        apt.type === "Schedule Block" ||
        apt.mrn === "BREAK" ||
        apt.mrn === "TIME-OFF" ||
        apt.mrn === "SCHEDULE" ||
        apt.patientId?.startsWith("event-break") ||
        apt.patientId?.startsWith("event-block") ||
        apt.patientId?.startsWith("event-timeoff");

      if (isMeeting && !showMeetings) return false;
      if (isBreakOrBlock && !showBreaks) return false;

      // Clinical visit filters
      if (!isMeeting && !isBreakOrBlock) {
        if (apt.modality === "video" && !showTelehealth) return false;
        if (apt.modality !== "video" && !showInPerson) return false;
        if (apt.status === "completed" && !showCompleted) return false;
        if (apt.status === "waiting" && !showWaiting) return false;
      }

      // Text search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = apt.patientName.toLowerCase().includes(q);
        const matchComplaint = apt.chiefComplaint?.toLowerCase().includes(q);
        const matchType = apt.type.toLowerCase().includes(q);
        if (!matchName && !matchComplaint && !matchType) return false;
      }
      return true;
    });
  }, [appointments, showInPerson, showTelehealth, showMeetings, showBreaks, showCompleted, showWaiting, searchQuery]);

  // Active dates for the main view
  const activeDates = useMemo(() => {
    if (viewMode === "day") return [currentDate];
    if (viewMode === "week") return getWeekDates(currentDate);
    return [currentDate];
  }, [viewMode, currentDate]);

  // Appointments grouped by date
  const appointmentsByDate = useMemo(() => {
    const map = new Map<string, ScheduleItem[]>();
    for (const apt of filteredAppointments) {
      const list = map.get(apt.date) || [];
      list.push(apt);
      map.set(apt.date, list);
    }
    return map;
  }, [filteredAppointments]);

  const calendarGrid = useMemo(
    () => buildCalendarGridLayout(activeDates, appointmentsByDate, CLINIC_START_HOUR, CLINIC_END_HOUR),
    [activeDates, appointmentsByDate],
  );

  // Header Title
  const headerTitle = useMemo(() => {
    if (viewMode === "day") {
      return formatDateHeading(currentDate);
    }
    if (viewMode === "week") {
      const week = getWeekDates(currentDate);
      const start = parseDateString(week[0]);
      const end = parseDateString(week[6]);
      if (start.getMonth() === end.getMonth()) {
        const monthName = start.toLocaleDateString("en-US", { month: "long" });
        return `${monthName} ${start.getDate()} – ${end.getDate()}, ${start.getFullYear()}`;
      }
      return `${formatShortDate(week[0])} – ${formatShortDate(week[6])}, ${end.getFullYear()}`;
    }
    if (viewMode === "month") {
      const d = parseDateString(currentDate);
      return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    }
    return `Schedule (${filteredAppointments.length} visits)`;
  }, [viewMode, currentDate, filteredAppointments.length]);

  return {
    filteredAppointments,
    activeDates,
    appointmentsByDate,
    calendarGrid,
    headerTitle,
    CLINIC_START_HOUR,
    CLINIC_END_HOUR,
  };
}

/** Which visual family an event chip belongs to, for both grid chips and the detail popover. */
export function getEventChipClass(item: ScheduleItem): string {
  let typeClass = "type-med-check";
  if (item.type.includes("Therapy")) typeClass = "type-therapy";
  else if (item.type.includes("Intake")) typeClass = "type-intake";
  else if (item.type.includes("Urgent")) typeClass = "type-urgent";
  else if (
    item.type === "Team Meeting" ||
    item.type === "Case Conference" ||
    item.type === "Supervision" ||
    item.mrn === "MEETING" ||
    item.patientId?.startsWith("event-meeting")
  ) {
    typeClass = "type-meeting";
  } else if (
    item.type === "Schedule Block" ||
    item.mrn === "SCHEDULE" ||
    item.patientId?.startsWith("event-block")
  ) {
    typeClass = "type-schedule";
  } else if (
    item.type === "Break" ||
    item.mrn === "BREAK" ||
    item.patientId?.startsWith("event-break")
  ) {
    typeClass = "type-break";
  } else if (
    item.type === "Time Off" ||
    item.mrn === "TIME-OFF" ||
    item.patientId?.startsWith("event-timeoff")
  ) {
    typeClass = "type-time-off";
  }

  const statusClass = `status-${item.status}`;
  return `gcal-event-chip ${typeClass} ${statusClass}`;
}
