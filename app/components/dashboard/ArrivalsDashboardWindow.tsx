"use client";

import { useMemo } from "react";
import {
  calculateElapsedWait,
  type ScheduleItem,
  type AppointmentStatus,
} from "../../lib/schedule-data";
import Button from "../ui/Button";
import Icon from "../ui/Icon";

export type ArrivalsDashboardWindowProps = {
  appointments: readonly ScheduleItem[];
  onStartVisit: (patientId: string, patientName: string, appointmentId: string) => void;
  onOpenChart: (patientId: string, targetSection?: string) => void;
  onStatusChange?: (appointmentId: string, status: AppointmentStatus) => void;
};

export default function ArrivalsDashboardWindow({
  appointments,
  onStartVisit,
  onOpenChart,
  onStatusChange,
}: ArrivalsDashboardWindowProps) {
  // Only show patients who have physically arrived: status === 'waiting' | 'in-visit'
  const activeArrivals = useMemo(() => {
    return appointments
      .filter((apt) => apt.status === "waiting" || apt.status === "in-visit")
      .sort((a, b) => {
        // 'waiting' patients come first, ordered by time
        if (a.status === "waiting" && b.status !== "waiting") return -1;
        if (a.status !== "waiting" && b.status === "waiting") return 1;
        return a.time.localeCompare(b.time);
      });
  }, [appointments]);

  if (activeArrivals.length === 0) {
    return (
      <div className="arrivals-empty-state">
        <div className="arrivals-empty-icon">
          <Icon name="meeting_room" size="lg" />
        </div>
        <p className="arrivals-empty-title">No patients currently waiting in office</p>
        <p className="arrivals-empty-desc">
          When a patient arrives and check-in status is marked as &ldquo;In Office&rdquo; or &ldquo;In Visit&rdquo;,
          their live wait time, assigned room, and call-in action will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="arrivals-window-body">
      <div className="arrivals-list">
        {activeArrivals.map((apt) => {
          const isWaiting = apt.status === "waiting";
          const waitDisplay = isWaiting ? calculateElapsedWait(apt.arrivedAt || apt.time) : "Active Encounter";
          const formattedArrivalTime = apt.arrivedAt
            ? new Date(apt.arrivedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
            : null;

          return (
            <div
              key={apt.id}
              className={`arrival-card ${isWaiting ? "arrival-waiting" : "arrival-in-visit"}`}
            >
              <div className="arrival-card-top">
                <div className="arrival-badge-group">
                  <span
                    className={`arrival-status-pill ${
                      isWaiting ? "pill-waiting" : "pill-in-visit"
                    }`}
                  >
                    <Icon name={isWaiting ? "hourglass_empty" : "play_circle"} size="sm" />
                    {isWaiting ? "In Office" : "In Visit"}
                  </span>
                  <span className="arrival-wait-time">{waitDisplay}</span>
                  {formattedArrivalTime && (
                    <span className="arrival-exact-time" style={{ fontSize: "11px", color: "var(--m3-text-secondary, #64748b)" }}>
                      · In at {formattedArrivalTime}
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  {apt.intakeStatus && apt.intakeStatus !== "exempt" && (
                    <span
                      className={`arrival-intake-badge intake-${apt.intakeStatus}`}
                      style={{
                        fontSize: "11px",
                        padding: "2px 7px",
                        borderRadius: "10px",
                        fontWeight: 600,
                        background: apt.intakeStatus === "completed" ? "rgba(16, 185, 129, 0.12)" : "rgba(245, 158, 11, 0.12)",
                        color: apt.intakeStatus === "completed" ? "#059669" : "#d97706",
                      }}
                      title="Schedule intake marker; linked form evidence is not available yet"
                    >
                      {apt.intakeStatus === "completed" ? "Intake Marked Done" : "Intake Pending"}
                    </span>
                  )}
                  <div className="arrival-room-badge">
                    <Icon name="door_front" size="sm" />
                    <span>{apt.room || "No room assigned"}</span>
                  </div>
                </div>
              </div>

              <div className="arrival-card-body">
                <div className="arrival-patient-row">
                  <div className="arrival-avatar">
                    <Icon name="person" size="md" />
                  </div>
                  <div className="arrival-patient-info">
                    <button
                      type="button"
                      className="arrival-patient-name"
                      onClick={() => onOpenChart(apt.patientId)}
                      title={`Open chart for ${apt.patientName}`}
                    >
                      {apt.patientName}
                    </button>
                    <div className="arrival-meta">
                      <span className="arrival-time">{apt.time}</span>
                      <span className="arrival-meta-sep">·</span>
                      <span className="arrival-type">{apt.type}</span>
                      {apt.providerName && (
                        <>
                          <span className="arrival-meta-sep">·</span>
                          <span className="arrival-provider">{apt.providerName}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {apt.chiefComplaint && (
                  <p className="arrival-complaint">
                    <strong>Reason:</strong> {apt.chiefComplaint}
                  </p>
                )}
              </div>

              <div className="arrival-card-actions">
                {isWaiting ? (
                  <Button
                    variant="primary"
                    size="sm"
                    icon="play_arrow"
                    onClick={() => {
                      if (onStatusChange) {
                        onStatusChange(apt.id, "in-visit");
                      }
                      onStartVisit(apt.patientId, apt.patientName, apt.id);
                    }}
                  >
                    Call In / Start Visit
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    size="sm"
                    icon="play_arrow"
                    onClick={() => onOpenChart(apt.patientId, "Encounter")}
                  >
                    Resume Visit
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={() => onOpenChart(apt.patientId)}
                >
                  Open Chart
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
