"use client";

import { useMemo } from "react";
import type { ScheduleItem, AppointmentStatus } from "../../lib/schedule-data";
import Button from "../ui/Button";
import Icon from "../ui/Icon";

export type ArrivalsDashboardWindowProps = {
  appointments: readonly ScheduleItem[];
  onStartVisit: (patientId: string, patientName: string, appointmentId: string) => void;
  onOpenChart: (patientId: string, targetSection?: string) => void;
  onStatusChange?: (appointmentId: string, status: AppointmentStatus) => void;
};

/**
 * Calculates estimated wait time or duration string given a scheduled time
 * (e.g. "09:30 AM") vs now.
 */
function calculateElapsedWait(scheduledTime: string): string {
  try {
    const [time, period] = scheduledTime.split(" ");
    if (!time || !period) return "Just arrived";
    const [hoursStr, minsStr] = time.split(":");
    let hours = parseInt(hoursStr, 10);
    const mins = parseInt(minsStr, 10);
    if (period.toUpperCase() === "PM" && hours !== 12) hours += 12;
    if (period.toUpperCase() === "AM" && hours === 12) hours = 0;

    const now = new Date();
    const scheduledDate = new Date();
    scheduledDate.setHours(hours, mins, 0, 0);

    const diffMinutes = Math.floor((now.getTime() - scheduledDate.getTime()) / (1000 * 60));
    if (diffMinutes <= 0) return "Just arrived";
    if (diffMinutes < 60) return `Waiting ${diffMinutes}m`;
    const h = Math.floor(diffMinutes / 60);
    const m = diffMinutes % 60;
    return `Waiting ${h}h ${m}m`;
  } catch {
    return "In office";
  }
}

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
          const waitDisplay = isWaiting ? calculateElapsedWait(apt.time) : "Active Encounter";

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
                </div>
                <div className="arrival-room-badge">
                  <Icon name="door_front" size="sm" />
                  <span>{apt.room || "No room assigned"}</span>
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
