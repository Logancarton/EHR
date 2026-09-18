"use client";

import type { AppointmentStatus, ScheduleItem } from "../../../lib/schedule-data";
import { api } from "../../../lib/api-client";
import { navigateToPatientLocation } from "../../../lib/workspace-navigation";

/**
 * Status/cancel/chart/start-visit actions for the selected appointment.
 * Preserves the appointment `version` on every mutation (optimistic
 * concurrency — a stale version is refused server-side, HTTP 409) and the
 * patient binding each api.appointments.* call requires.
 */
export function useCalendarAppointmentActions(
  refresh: () => Promise<readonly ScheduleItem[]>,
  setSelectedAppointment: (updater: ScheduleItem | null | ((prev: ScheduleItem | null) => ScheduleItem | null)) => void,
  showToast: (message: string) => void,
  onClose?: () => void,
) {
  async function handleUpdateStatus(apt: ScheduleItem, newStatus: AppointmentStatus) {
    try {
      await api.appointments.updateStatus(apt.id, newStatus, apt.patientId, apt.version);
      await refresh();
      setSelectedAppointment((prev) => (prev && prev.id === apt.id ? { ...prev, status: newStatus } : prev));
      showToast(`Status updated to ${newStatus}`);
    } catch {
      showToast("Failed to update status");
    }
  }

  async function handleCancelAppointment(apt: ScheduleItem) {
    if (!confirm(`Are you sure you want to cancel the appointment for ${apt.patientName}?`)) return;
    try {
      await api.appointments.cancel(apt.id, "Patient cancelled", undefined, apt.patientId, apt.version);
      await refresh();
      setSelectedAppointment(null);
      showToast(`Cancelled appointment for ${apt.patientName}`);
    } catch {
      showToast("Failed to cancel appointment");
    }
  }

  async function handleOpenChart(patientId: string) {
    setSelectedAppointment(null);
    if (onClose) onClose();
    await navigateToPatientLocation(patientId, "Overview");
  }

  async function handleStartVisit(apt: ScheduleItem) {
    try {
      await api.appointments.startVisit(apt.id, apt.version);
      await refresh();
    } catch {
      // Best effort
    }
    setSelectedAppointment(null);
    if (onClose) onClose();
    await navigateToPatientLocation(apt.patientId, "Encounter");
  }

  return { handleUpdateStatus, handleCancelAppointment, handleOpenChart, handleStartVisit };
}

export type CalendarAppointmentActions = ReturnType<typeof useCalendarAppointmentActions>;
