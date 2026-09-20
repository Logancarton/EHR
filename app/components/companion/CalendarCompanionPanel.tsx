"use client";

import type { Patient } from "../../domain/patient";
import CalendarWorkspace from "../workspaces/CalendarWorkspace";
import CompanionPanelHeader from "./CompanionPanelHeader";

interface CalendarCompanionPanelProps {
  activePatient?: Patient | null;
  roster: readonly Patient[];
  initialDate?: string;
  onClose: () => void;
  onUnpin?: () => void;
  onOpenFullCalendar: () => void;
}

/**
 * The companion Calendar is intentionally the same CalendarWorkspace used by
 * the main Calendar tab, rendered in a compact presentation. This avoids a
 * second booking system with different data, actions, validation, or state.
 */
export default function CalendarCompanionPanel({
  initialDate,
  onClose,
  onUnpin,
  onOpenFullCalendar,
}: CalendarCompanionPanelProps) {
  return (
    <aside
      className="companion-panel companion-calendar-panel"
      aria-label="Calendar and scheduling"
    >
      <CompanionPanelHeader
        title="Calendar"
        context="Full interactive schedule"
        icon="calendar_month"
        iconStyle={{ background: "#e8f0fe", color: "#1a73e8" }}
        onClose={onClose}
        onUnpin={onUnpin}
        unpinLabel="Unpin Calendar"
      />

      <div className="companion-calendar-workspace">
        <CalendarWorkspace
          presentation="companion"
          initialDate={initialDate}
          initialViewMode="day"
          onExpand={onOpenFullCalendar}
        />
      </div>
    </aside>
  );
}
