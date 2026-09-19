"use client";

import { useEffect, useRef, useState } from "react";
import { type ScheduleItem } from "../../lib/schedule-data";
import { usePracticeSchedule } from "../../lib/schedule-store";
import { useAuthSession } from "../auth/AuthSessionGate";
import Icon from "../ui/Icon";
import PatientInformationDrawer from "../patient/PatientInformationDrawer";
import { useCalendarFilters } from "./calendar/calendar-filters";
import { useCalendarViewModel } from "./calendar/calendar-view-model";
import { useCalendarNavigation } from "./calendar/calendar-navigation";
import { useCalendarToast } from "./calendar/calendar-toast";
import CalendarHeader from "./calendar/CalendarHeader";
import CalendarSidebar from "./calendar/CalendarSidebar";
import CalendarViews from "./calendar/CalendarViews";
import CalendarEventDetails from "./calendar/CalendarEventDetails";
import CalendarEventEditor from "./calendar/CalendarEventEditor";
import { useCalendarAppointmentActions } from "./calendar/calendar-actions";
import { useCalendarEventEditor } from "./calendar/calendar-event-editor";

export type { CalendarViewType } from "./calendar/calendar-types";

interface CalendarWorkspaceProps {
  onClose?: () => void;
}

export default function CalendarWorkspace({ onClose }: CalendarWorkspaceProps) {
  const { appointments, syncStatus, refresh } = usePracticeSchedule();
  const { user, hasPermission } = useAuthSession();

  const { toastMessage, setToastMessage } = useCalendarToast();
  const navigation = useCalendarNavigation(setToastMessage);
  const {
    todayStr,
    currentDate,
    setCurrentDate,
    practiceNowMinutes,
    viewMode,
    setViewMode,
  } = navigation;
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);

  // Category filters (Google Calendar checkboxes) and search
  const filters = useCalendarFilters();
  const { searchQuery, setSearchQuery } = filters;

  // Detail Popover
  const [selectedAppointment, setSelectedAppointment] = useState<ScheduleItem | null>(null);

  const [intakePatient, setIntakePatient] = useState<{ id: string; name: string } | null>(null);
  const editor = useCalendarEventEditor({
    todayStr,
    userId: user.userId,
    hasPermission,
    refresh,
    showToast: setToastMessage,
    onPatientCreated: (id, name) => setIntakePatient({ id, name }),
  });
  const { handleOpenBooking } = editor;

  // Time grid scroll container
  const timeGridScrollRef = useRef<HTMLDivElement | null>(null);

  const {
    activeDates,
    appointmentsByDate,
    calendarGrid,
    headerTitle,
  } = useCalendarViewModel(appointments, filters, viewMode, currentDate);

  // Keep the initial working hours in view when changing grid modes.
  useEffect(() => {
    if (timeGridScrollRef.current) {
      timeGridScrollRef.current.scrollTop = calendarGrid.minuteTop(8 * 60 + 30);
    }
  }, [viewMode]);

  const { handleUpdateStatus, handleCancelAppointment, handleOpenChart, handleStartVisit } =
    useCalendarAppointmentActions(refresh, setSelectedAppointment, setToastMessage, onClose);

  const currentTimeTopPx = calendarGrid.minuteTop(practiceNowMinutes);

  return (
    <div className="gcal-root">
      <CalendarHeader
        nav={navigation}
        headerTitle={headerTitle}
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        syncStatus={syncStatus}
        onNewEvent={() => handleOpenBooking(currentDate, "10:30 AM", "appointment")}
      />

      {/* 2. BODY LAYOUT */}
      <div className="gcal-body">
        <CalendarSidebar
          collapsed={sidebarCollapsed}
          nav={navigation}
          filters={filters}
          appointmentsByDate={appointmentsByDate}
        />

        {/* MAIN VIEWPORT */}
        <main className="gcal-main-viewport">
          {/* Toast Notification */}
          {toastMessage && (
            <div
              style={{
                position: "absolute",
                bottom: 24,
                right: 24,
                background: "#323232",
                color: "#ffffff",
                padding: "10px 18px",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: 500,
                boxShadow: "var(--gcal-shadow-md)",
                zIndex: 200,
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <Icon name="check_circle" />
              <span>{toastMessage}</span>
            </div>
          )}

          <CalendarViews
            viewMode={viewMode}
            activeDates={activeDates}
            todayStr={todayStr}
            currentDate={currentDate}
            setCurrentDate={setCurrentDate}
            setViewMode={setViewMode}
            appointmentsByDate={appointmentsByDate}
            calendarGrid={calendarGrid}
            currentTimeTopPx={currentTimeTopPx}
            timeGridScrollRef={timeGridScrollRef}
            onSlotClick={handleOpenBooking}
            onSelectAppointment={setSelectedAppointment}
          />
        </main>
      </div>

      {/* 3. EVENT DETAIL POPOVER */}
      {selectedAppointment && (
        <CalendarEventDetails
          appointment={selectedAppointment}
          canEditPatient={hasPermission("edit_patient")}
          onClose={() => setSelectedAppointment(null)}
          onUpdateStatus={handleUpdateStatus}
          onCancel={handleCancelAppointment}
          onOpenChart={handleOpenChart}
          onStartVisit={handleStartVisit}
          onContinueIntake={(patientId, patientName) => {
            setIntakePatient({ id: patientId, name: patientName });
            setSelectedAppointment(null);
          }}
        />
      )}

      <CalendarEventEditor
        editor={editor}
        hasPermission={hasPermission}
        providerDisplayName={user.displayName}
      />
      {intakePatient && (
        <PatientInformationDrawer
          patientId={intakePatient.id}
          patientName={intakePatient.name}
          onClose={() => setIntakePatient(null)}
        />
      )}
    </div>
  );
}
