"use client";

import { useEffect, useState } from "react";
import Button from "../ui/Button";
import Icon from "../ui/Icon";
import {
  HANDOFF_REASONS,
  type HandoffReason,
  type ScheduleItem,
  type VisitHandoff,
} from "../../lib/schedule-data";
import { api } from "../../lib/api-client";
import { teamApi } from "../../lib/team-api";
import type { TeamMember } from "../../domain/team-collaboration";
import { useAuthSession } from "../auth/AuthSessionGate";

export interface VisitHandoffModalProps {
  appointment: ScheduleItem;
  isOpen: boolean;
  onClose: () => void;
  onHandoffCompleted?: () => void;
}

export default function VisitHandoffModal({
  appointment,
  isOpen,
  onClose,
  onHandoffCompleted,
}: VisitHandoffModalProps) {
  const { user } = useAuthSession();
  const currentUserId = user?.userId || "dr-carton";

  const [activeHandoff, setActiveHandoff] = useState<VisitHandoff | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form states for initiating
  const [selectedToUserId, setSelectedToUserId] = useState<string>("");
  const [selectedReason, setSelectedReason] = useState<HandoffReason>("Coverage handover");
  const [clinicalSummary, setClinicalSummary] = useState<string>("");

  // Form states for declining
  const [showDeclinePrompt, setShowDeclinePrompt] = useState(false);
  const [declineReason, setDeclineReason] = useState<string>("");

  // Load existing handoff and team members
  useEffect(() => {
    if (!isOpen) return;

    let active = true;
    setLoading(true);
    setError(null);
    setShowDeclinePrompt(false);
    setDeclineReason("");

    Promise.all([
      api.handoffs.list({ appointmentId: appointment.id }),
      teamApi.snapshot().catch(() => null),
    ])
      .then(([handoffs, snapshot]) => {
        if (!active) return;
        // Check for active pending handoff, or most recent
        const pending = handoffs.find((h) => h.status === "pending") || handoffs[0] || null;
        setActiveHandoff(pending);

        if (snapshot?.partners) {
          const members = snapshot.partners
            .map((p) => p.member)
            .filter((m) => m.id !== currentUserId);
          setTeamMembers(members);
          if (members.length > 0 && !selectedToUserId) {
            setSelectedToUserId(members[0].id);
          }
        }
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setLoading(false);
        setError(err instanceof Error ? err.message : "Failed to load handoff details.");
      });

    return () => {
      active = false;
    };
  }, [isOpen, appointment.id, currentUserId, selectedToUserId]);

  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isPending = activeHandoff?.status === "pending";
  const isRecipient = isPending && activeHandoff?.toUserId === currentUserId;
  const isSender = isPending && activeHandoff?.fromUserId === currentUserId;

  async function handleInitiateHandoff(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedToUserId) {
      setError("Please select a team member to hand off to.");
      return;
    }

    const targetMember = teamMembers.find((m) => m.id === selectedToUserId);
    setSubmitting(true);
    setError(null);

    try {
      const created = await api.handoffs.initiate({
        appointmentId: appointment.id,
        patientId: appointment.patientId,
        toUserId: selectedToUserId,
        toUserName: targetMember ? targetMember.displayName : selectedToUserId,
        reason: selectedReason,
        clinicalSummary: clinicalSummary.trim() || "No additional clinical notes provided.",
      });
      setActiveHandoff(created);
      setSubmitting(false);
      onHandoffCompleted?.();
    } catch (err) {
      setSubmitting(false);
      setError(err instanceof Error ? err.message : "Failed to initiate handoff.");
    }
  }

  async function handleAccept() {
    if (!activeHandoff) return;
    setSubmitting(true);
    setError(null);

    try {
      const accepted = await api.handoffs.accept(activeHandoff.id);
      setActiveHandoff(accepted);
      setSubmitting(false);
      onHandoffCompleted?.();
    } catch (err) {
      setSubmitting(false);
      setError(err instanceof Error ? err.message : "Failed to accept handoff.");
    }
  }

  async function handleDecline() {
    if (!activeHandoff) return;
    if (!declineReason.trim()) {
      setError("Please provide a reason for declining responsibility.");
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      const declined = await api.handoffs.decline(activeHandoff.id, declineReason.trim());
      setActiveHandoff(declined);
      setSubmitting(false);
      setShowDeclinePrompt(false);
      onHandoffCompleted?.();
    } catch (err) {
      setSubmitting(false);
      setError(err instanceof Error ? err.message : "Failed to decline handoff.");
    }
  }

  async function handleCancel() {
    if (!activeHandoff) return;
    setSubmitting(true);
    setError(null);

    try {
      const cancelled = await api.handoffs.cancel(activeHandoff.id);
      setActiveHandoff(cancelled);
      setSubmitting(false);
      onHandoffCompleted?.();
    } catch (err) {
      setSubmitting(false);
      setError(err instanceof Error ? err.message : "Failed to cancel handoff.");
    }
  }

  return (
    <div
      className="handoff-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="handoff-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="handoff-modal-panel">
        <header className="handoff-modal-header">
          <div className="handoff-title-group">
            <Icon name="swap_horiz" size="md" />
            <div>
              <h2 id="handoff-modal-title" className="handoff-modal-title">
                Visit Handoff & Care Continuity
              </h2>
              <span className="handoff-modal-subhead">
                {appointment.patientName} · {appointment.time} ({appointment.type})
              </span>
            </div>
          </div>
          <Button variant="icon" size="sm" icon="close" aria-label="Close" onClick={onClose} />
        </header>

        <div className="handoff-modal-body">
          {/* Reassurance Banner (DB-6) */}
          <div className="handoff-safety-notice" role="note">
            <Icon name="shield" size="sm" />
            <span>
              <strong>Mutual Agreement Protocol:</strong> Handing off responsibility requires explicit
              acceptance. Merely viewing this appointment never accepts responsibility. Workflow
              assignment does not alter chart access permissions.
            </span>
          </div>

          {error && (
            <div className="handoff-error-banner" role="alert">
              <Icon name="error" size="sm" />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="handoff-loading-state">
              <Icon name="sync" size="md" className="sync-spinner" />
              <span>Checking handoff state...</span>
            </div>
          ) : isPending ? (
            /* Pending Handoff Review Mode */
            <div className="handoff-pending-card">
              <div className="handoff-pending-header">
                <span className="handoff-status-chip is-pending">Pending Acceptance</span>
                <span className="handoff-date">
                  Initiated {new Date(activeHandoff.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>

              <dl className="handoff-details-grid">
                <div>
                  <dt>From</dt>
                  <dd><strong>{activeHandoff.fromUserName}</strong></dd>
                </div>
                <div>
                  <dt>To</dt>
                  <dd><strong>{activeHandoff.toUserName}</strong></dd>
                </div>
                <div>
                  <dt>Reason</dt>
                  <dd>{activeHandoff.reason}</dd>
                </div>
                <div className="handoff-summary-block">
                  <dt>Clinical Summary & Context</dt>
                  <dd className="handoff-summary-text">{activeHandoff.clinicalSummary}</dd>
                </div>
              </dl>

              {/* Action Buttons */}
              <div className="handoff-action-bar">
                {isRecipient ? (
                  showDeclinePrompt ? (
                    <div className="handoff-decline-form">
                      <label htmlFor="decline-reason-input">Reason for declining:</label>
                      <input
                        id="decline-reason-input"
                        type="text"
                        className="handoff-input"
                        placeholder="e.g., In another visit, coverage unavailable..."
                        value={declineReason}
                        onChange={(e) => setDeclineReason(e.target.value)}
                        autoFocus
                      />
                      <div className="handoff-inline-actions">
                        <Button
                          variant="destructive"
                          size="sm"
                          loading={submitting}
                          loadingLabel="Declining…"
                          onClick={handleDecline}
                        >
                          Confirm Decline
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          busy={submitting}
                          onClick={() => setShowDeclinePrompt(false)}
                        >
                          Back
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="handoff-recipient-actions">
                      <Button
                        variant="primary"
                        icon="check_circle"
                        loading={submitting}
                        loadingLabel="Accepting…"
                        onClick={handleAccept}
                      >
                        Accept Responsibility
                      </Button>
                      <Button
                        variant="secondary"
                        icon="cancel"
                        busy={submitting}
                        onClick={() => setShowDeclinePrompt(true)}
                      >
                        Decline
                      </Button>
                    </div>
                  )
                ) : isSender ? (
                  <div className="handoff-sender-actions">
                    <span className="handoff-waiting-hint">
                      Waiting for {activeHandoff.toUserName} to accept responsibility.
                    </span>
                    <Button
                      variant="destructive"
                      size="sm"
                      icon="close"
                      loading={submitting}
                      loadingLabel="Cancelling…"
                      onClick={handleCancel}
                    >
                      Cancel Handoff
                    </Button>
                  </div>
                ) : (
                  <div className="handoff-observer-hint">
                    Handoff in progress between {activeHandoff.fromUserName} and {activeHandoff.toUserName}.
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Initiate New Handoff Form */
            <form className="handoff-initiate-form" onSubmit={handleInitiateHandoff}>
              <div className="handoff-form-group">
                <label htmlFor="handoff-recipient-select">Transfer Responsibility To:</label>
                <select
                  id="handoff-recipient-select"
                  className="handoff-select"
                  value={selectedToUserId}
                  onChange={(e) => setSelectedToUserId(e.target.value)}
                  required
                >
                  {teamMembers.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.displayName} ({member.role}) — {member.presence}
                    </option>
                  ))}
                  {teamMembers.length === 0 && (
                    <option value="">No other team members available</option>
                  )}
                </select>
              </div>

              <div className="handoff-form-group">
                <label htmlFor="handoff-reason-select">Handoff Reason:</label>
                <select
                  id="handoff-reason-select"
                  className="handoff-select"
                  value={selectedReason}
                  onChange={(e) => setSelectedReason(e.target.value as HandoffReason)}
                >
                  {HANDOFF_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div className="handoff-form-group">
                <label htmlFor="handoff-summary-input">
                  Clinical Summary & Context (Required):
                </label>
                <textarea
                  id="handoff-summary-input"
                  className="handoff-textarea"
                  rows={4}
                  placeholder="Key clinical facts: presenting issues, active vitals, pending lab orders, medication changes, or specific follow-up needed..."
                  value={clinicalSummary}
                  onChange={(e) => setClinicalSummary(e.target.value)}
                  required
                />
              </div>

              <div className="handoff-form-actions">
                {teamMembers.length === 0 ? (
                  <Button
                    variant="primary"
                    type="submit"
                    icon="send"
                    disabled
                    disabledReason="No colleagues available to receive handoff"
                  >
                    Initiate Handoff
                  </Button>
                ) : submitting ? (
                  <Button
                    variant="primary"
                    type="submit"
                    icon="send"
                    loading
                    loadingLabel="Initiating…"
                  >
                    Initiate Handoff
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    type="submit"
                    icon="send"
                  >
                    Initiate Handoff
                  </Button>
                )}
                <Button
                  variant="secondary"
                  type="button"
                  busy={submitting}
                  onClick={onClose}
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}

          {/* Previous Handoff History (if accepted or declined) */}
          {activeHandoff && !isPending && (
            <div className="handoff-resolved-block">
              <div className="handoff-resolved-header">
                <span className={`handoff-status-chip is-${activeHandoff.status}`}>
                  {activeHandoff.status.toUpperCase()}
                </span>
                <span className="handoff-resolved-title">
                  {activeHandoff.status === "accepted"
                    ? `Accepted by ${activeHandoff.toUserName}`
                    : activeHandoff.status === "declined"
                      ? `Declined by ${activeHandoff.toUserName} (${activeHandoff.declineReason || "No reason specified"})`
                      : "Cancelled"}
                </span>
              </div>
              <p className="handoff-resolved-summary">{activeHandoff.clinicalSummary}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
