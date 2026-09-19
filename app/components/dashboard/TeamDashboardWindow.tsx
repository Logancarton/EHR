"use client";

import { useEffect, useState } from "react";
import type {
  TeamPartner,
  TeamTaskAssignment,
  TeamWorkspaceSnapshot,
} from "../../domain/team-collaboration";
import { teamApi } from "../../lib/team-api";
import { useWorkspaceNavigation } from "../../lib/workspace-navigation-context";
import AsyncSection from "../ui/AsyncSection";
import Button from "../ui/Button";
import Icon from "../ui/Icon";

export type TeamDashboardWindowProps = {
  onOpenChart?: (patientId: string, targetSection?: string) => void;
  onOpenTeamDock?: () => void;
};

export default function TeamDashboardWindow({
  onOpenChart,
  onOpenTeamDock,
}: TeamDashboardWindowProps) {
  const nav = useWorkspaceNavigation();
  const [snapshot, setSnapshot] = useState<TeamWorkspaceSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadIndex, setReloadIndex] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    teamApi
      .snapshot()
      .then((data) => {
        if (!active) return;
        setSnapshot(data);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setLoading(false);
        setError(err instanceof Error ? err.message : "Failed to load team data.");
      });

    return () => {
      active = false;
    };
  }, [reloadIndex]);

  async function handleToggleTaskStatus(task: TeamTaskAssignment) {
    const nextStatus = task.status === "open" ? "done" : "open";
    try {
      const updated = await teamApi.updateTaskStatus(
        task.id,
        nextStatus,
        task.linkedPatient?.id,
      );
      setSnapshot((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          assignedTasks: prev.assignedTasks.map((t) =>
            t.id === updated.id ? updated : t,
          ),
        };
      });
    } catch {
      // Reload on failure to reconcile with server
      setReloadIndex((c) => c + 1);
    }
  }

  const partners = snapshot?.partners || [];
  const assignedTasks = snapshot?.assignedTasks || [];
  const openTasks = assignedTasks.filter((t) => t.status === "open");

  return (
    <div className="team-window-content">
      <AsyncSection
        loading={loading}
        error={error}
        isEmpty={partners.length === 0 && assignedTasks.length === 0}
        hasLoadedOnce={snapshot !== null}
        loadingMessage="Loading team presence and tasks…"
        emptyMessage="No team members or active tasks found."
        onRetry={() => setReloadIndex((c) => c + 1)}
      >
        {/* Team Members Strip */}
        <div className="team-window-section">
          <div className="team-window-subhead">
            <span className="eyebrow">Practice Team</span>
            <small>{partners.length} members</small>
          </div>
          <div className="team-members-grid">
            {partners.map((partner) => (
              <div key={partner.member.id} className="team-member-card">
                <div className="team-member-avatar-box">
                  <span className="team-member-avatar">{partner.member.initials}</span>
                  <span
                    className={`team-presence-dot presence-${partner.member.presence}`}
                    title={partner.member.presence}
                  />
                </div>
                <div className="team-member-info">
                  <strong>{partner.member.displayName}</strong>
                  <span className="team-member-role">
                    {partner.member.credentials || partner.member.role}
                  </span>
                </div>
                {partner.sharedPatients.length > 0 && (
                  <span className="team-shared-chip" title="Shared patients">
                    {partner.sharedPatients.length} shared
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Active Handoff Tasks */}
        <div className="team-window-section">
          <div className="team-window-subhead">
            <span className="eyebrow">Handoff Tasks</span>
            <small>{openTasks.length} pending</small>
          </div>
          {assignedTasks.length === 0 ? (
            <p className="team-empty-hint">No active handoff tasks assigned to you.</p>
          ) : (
            <div className="team-tasks-list">
              {assignedTasks.map((task) => (
                <div
                  key={task.id}
                  className={`team-task-item ${task.status === "done" ? "is-done" : ""}`}
                >
                  <button
                    type="button"
                    className="team-task-check-btn"
                    aria-label={`Mark task "${task.text}" as ${task.status === "open" ? "done" : "open"}`}
                    onClick={() => handleToggleTaskStatus(task)}
                  >
                    <Icon
                      name={task.status === "done" ? "check_circle" : "radio_button_unchecked"}
                      size="sm"
                    />
                  </button>
                  <div className="team-task-content">
                    <span className="team-task-text">{task.text}</span>
                    <div className="team-task-meta">
                      <span>From {task.assignerName}</span>
                      {task.linkedPatient && (
                        <button
                          type="button"
                          className="team-patient-link"
                          onClick={() =>
                            onOpenChart?.(task.linkedPatient!.id, "Encounter")
                          }
                        >
                          <Icon name="person" size="sm" />
                          {task.linkedPatient.name}
                        </button>
                      )}
                      {task.dueDate && <span className="team-task-due">Due {task.dueDate}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Launch Dock */}
        <div className="team-window-actions">
          <Button
            size="sm"
            variant="secondary"
            icon="forum"
            onClick={() => {
              if (onOpenTeamDock) {
                onOpenTeamDock();
              } else {
                nav.openCommunications();
              }
            }}
          >
            Open Team Collaboration Dock
          </Button>
        </div>
      </AsyncSection>
    </div>
  );
}
