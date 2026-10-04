"use client";

import type { Patient } from "../../domain/patient";
import CalendarWorkspace from "../workspaces/CalendarWorkspace";
import CompanionPanelFrame from "./CompanionPanelFrame";

interface CalendarCompanionPanelProps {
  activePatient?: Patient | null;
  roster: readonly Patient[];
  initialDate?: string;
  onClose: () => void;
  onUnpin?: () => void;
  onOpenFullCalendar: () => void;
  isExpanded?: boolean;
  onExpand?: () => void;
  onRedock?: () => void;
}

/**
 * The companion Calendar is intentionally the same CalendarWorkspace used by
 * the main Calendar tab, rendered in presentation="companion" when docked and
 * full workspace presentation when expanded. This avoids a second booking
 * system with different data, actions, validation, or state.
 */
export default function CalendarCompanionPanel({
  initialDate,
  onClose,
  onUnpin,
  onOpenFullCalendar,
  isExpanded = false,
  onExpand,
  onRedock,
}: CalendarCompanionPanelProps) {
  return (
    <CompanionPanelFrame
      className="companion-calendar-panel"
      ariaLabel="Calendar and scheduling"
      title="Calendar"
      context="Full interactive schedule"
      icon="calendar_month"
      iconStyle={{ background: "#e8f0fe", color: "#1a73e8" }}
      onClose={onClose}
      onUnpin={onUnpin}
      unpinLabel="Unpin Calendar"
      isExpanded={isExpanded}
      onExpand={onExpand}
      onRedock={onRedock}
      containBody
      bodyClassName="companion-calendar-workspace"
    >
      <CalendarWorkspace
        presentation={isExpanded ? "workspace" : "companion"}
        initialDate={initialDate}
        initialViewMode="day"
        onExpand={onOpenFullCalendar}
      />
    </CompanionPanelFrame>
  );
}
