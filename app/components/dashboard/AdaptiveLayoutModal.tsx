"use client";

import { useEffect, useRef } from "react";
import Button from "../ui/Button";
import Icon from "../ui/Icon";
import { type UseAdaptiveLayoutReturn } from "../../lib/useAdaptiveLayout";
import { type AdaptiveRule } from "../../lib/adaptive-layout-engine";

export interface AdaptiveLayoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  adaptiveState: UseAdaptiveLayoutReturn;
}

function formatTriggerSummary(rule: AdaptiveRule): string {
  switch (rule.trigger.type) {
    case "time_window":
      return `Practice hours ${rule.trigger.startHour.toString().padStart(2, "0")}:00 – ${rule.trigger.endHour.toString().padStart(2, "0")}:00`;
    case "waiting_threshold":
      return `In-office waiting count ≥ ${rule.trigger.minWaiting} patients`;
    case "urgent_queue_threshold":
      return `Urgent pending work items ≥ ${rule.trigger.minUrgent}`;
    default:
      return "Custom condition";
  }
}

export default function AdaptiveLayoutModal({
  isOpen,
  onClose,
  adaptiveState,
}: AdaptiveLayoutModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const {
    isEnabled,
    isPaused,
    activeRule,
    rules,
    priorLayoutExists,
    toggleAdaptiveMode,
    togglePause,
    restorePriorLayoutNow,
    toggleRuleEnabled,
  } = adaptiveState;

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="adaptive-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        className="adaptive-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="adaptive-modal-title"
        ref={modalRef}
      >
        <header className="adaptive-modal-header">
          <div className="adaptive-modal-title-group">
            <Icon name="tune" className="adaptive-modal-title-icon" />
            <div>
              <h2 id="adaptive-modal-title" className="adaptive-modal-title">
                Adaptive Workspace Layouts
              </h2>
              <p className="adaptive-modal-subtitle">
                Deterministic, workload-aware density and window arrangements. Strictly opt-in.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="adaptive-modal-close-btn"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <Icon name="close" />
          </button>
        </header>

        <div className="adaptive-modal-body">
          {/* Master Activation Card */}
          <div className="adaptive-master-card">
            <div className="adaptive-master-info">
              <div className="adaptive-master-header">
                <span className="adaptive-master-title">Adaptive Mode</span>
                <span className={`adaptive-status-pill ${isEnabled ? (isPaused ? "paused" : "active") : "off"}`}>
                  {isEnabled ? (isPaused ? "Paused" : "Active") : "Off by default"}
                </span>
              </div>
              <p className="adaptive-master-desc">
                When enabled, your workspace automatically adjusts density and highlights relevant
                windows based on clinic schedule and volume. Clinical focus protection ensures your
                screen never shifts while typing or viewing clinical records.
              </p>
            </div>
            <div className="adaptive-master-actions">
              <Button
                variant={isEnabled ? "secondary" : "primary"}
                size="sm"
                onClick={() => toggleAdaptiveMode()}
              >
                {isEnabled ? "Turn Off" : "Enable Adaptive Mode"}
              </Button>
              {isEnabled && (
                <Button
                  variant="tertiary"
                  size="sm"
                  onClick={() => togglePause()}
                >
                  {isPaused ? "Resume" : "Pause"}
                </Button>
              )}
            </div>
          </div>

          {/* Prior Layout Restore Banner */}
          {priorLayoutExists && (
            <div className="adaptive-restore-card">
              <div className="adaptive-restore-info">
                <Icon name="history" className="adaptive-restore-icon" />
                <div>
                  <strong>Prior Layout Snapshot Available</strong>
                  <p>Restore the exact layout you were using before the current adaptation triggered.</p>
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                icon="undo"
                onClick={restorePriorLayoutNow}
              >
                Restore Prior Layout
              </Button>
            </div>
          )}

          {/* Rules Section */}
          <section className="adaptive-rules-section">
            <div className="adaptive-rules-header">
              <h3>Inspectable Adaptive Rules</h3>
              <span className="adaptive-rules-count">
                {rules.filter((r) => r.enabled).length} of {rules.length} rules active
              </span>
            </div>

            <div className="adaptive-rules-list">
              {rules.map((rule) => {
                const isCurrentActive = activeRule?.id === rule.id;
                return (
                  <div
                    key={rule.id}
                    className={`adaptive-rule-card ${isCurrentActive ? "current-active" : ""} ${!rule.enabled ? "disabled" : ""}`}
                  >
                    <div className="adaptive-rule-header">
                      <div className="adaptive-rule-name-group">
                        <span className="adaptive-rule-name">{rule.name}</span>
                        {isCurrentActive && (
                          <span className="adaptive-rule-active-badge">Active Now</span>
                        )}
                        {!rule.enabled && (
                          <span className="adaptive-rule-disabled-badge">Disabled</span>
                        )}
                      </div>
                      <label className="adaptive-rule-toggle-label">
                        <input
                          type="checkbox"
                          checked={rule.enabled}
                          onChange={(e) => toggleRuleEnabled(rule.id, e.target.checked)}
                          aria-label={`Enable ${rule.name}`}
                        />
                        <span className="adaptive-toggle-text">
                          {rule.enabled ? "Enabled" : "Disabled"}
                        </span>
                      </label>
                    </div>

                    <p className="adaptive-rule-desc">{rule.description}</p>

                    <div className="adaptive-rule-meta">
                      <div className="adaptive-meta-item">
                        <Icon name="bolt" className="meta-icon" />
                        <span><strong>Trigger:</strong> {formatTriggerSummary(rule)}</span>
                      </div>
                      {rule.density && (
                        <div className="adaptive-meta-item">
                          <Icon name="aspect_ratio" className="meta-icon" />
                          <span><strong>Density:</strong> {rule.density}</span>
                        </div>
                      )}
                      {rule.pinnedWidgets && rule.pinnedWidgets.length > 0 && (
                        <div className="adaptive-meta-item">
                          <Icon name="push_pin" className="meta-icon" />
                          <span><strong>Pinned Windows:</strong> {rule.pinnedWidgets.join(", ")}</span>
                        </div>
                      )}
                      {rule.returnBehavior === "restore_prior" && (
                        <div className="adaptive-meta-item">
                          <Icon name="replay" className="meta-icon" />
                          <span>Restores prior layout when condition ends</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <footer className="adaptive-modal-footer">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Done
          </Button>
        </footer>
      </div>
    </div>
  );
}
