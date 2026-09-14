"use client";

import { useState } from "react";
import Button from "../ui/Button";
import Icon from "../ui/Icon";
import { type UseAdaptiveLayoutReturn } from "../../lib/useAdaptiveLayout";

export interface AdaptiveLayoutBadgeProps {
  adaptiveState: UseAdaptiveLayoutReturn;
  onOpenModal: () => void;
}

export default function AdaptiveLayoutBadge({
  adaptiveState,
  onOpenModal,
}: AdaptiveLayoutBadgeProps) {
  const {
    isEnabled,
    isPaused,
    activeRule,
    pendingAdaptation,
    priorLayoutExists,
    togglePause,
    restorePriorLayoutNow,
    applyPendingNow,
    dismissPending,
  } = adaptiveState;

  // 1. Pending deferred adaptation notice (clinical focus protection)
  if (pendingAdaptation) {
    return (
      <div
        className="adaptive-pending-pill"
        role="status"
        aria-live="polite"
        title="A layout transition is ready but was deferred to protect your active typing or open dialog."
      >
        <Icon name="pending_actions" className="adaptive-pending-icon" />
        <span className="adaptive-pending-label">
          Adaptation deferred: <strong>{pendingAdaptation.rule.name}</strong>
        </span>
        <button
          type="button"
          className="adaptive-pill-action primary"
          onClick={applyPendingNow}
          title="Apply this layout transition now"
        >
          Apply Now
        </button>
        <button
          type="button"
          className="adaptive-pill-action dismiss"
          onClick={dismissPending}
          title="Dismiss this pending transition"
        >
          Dismiss
        </button>
      </div>
    );
  }

  // 2. OFF State (Default)
  if (!isEnabled) {
    return (
      <Button
        variant="tertiary"
        size="sm"
        icon="tune"
        className="adaptive-status-btn off"
        onClick={onOpenModal}
        title="Adaptive layouts are currently OFF. Click to configure."
      >
        Adaptive: Off
      </Button>
    );
  }

  // 3. Paused State
  if (isPaused) {
    return (
      <div className="adaptive-badge-container paused" role="status">
        <button
          type="button"
          className="adaptive-badge-main"
          onClick={onOpenModal}
          title="Adaptive layout is paused. Click to open settings."
        >
          <Icon name="pause_circle" className="adaptive-status-icon paused" />
          <span className="adaptive-badge-text">Adaptive: Paused</span>
        </button>
        <button
          type="button"
          className="adaptive-quick-action"
          onClick={() => togglePause(false)}
          title="Resume adaptive layouts"
        >
          Resume
        </button>
        {priorLayoutExists && (
          <button
            type="button"
            className="adaptive-quick-action revert"
            onClick={restorePriorLayoutNow}
            title="Restore layout snapshot from before adaptation"
          >
            Restore Prior
          </button>
        )}
      </div>
    );
  }

  // 4. Active Adapted State
  return (
    <div className="adaptive-badge-container active" role="status">
      <button
        type="button"
        className="adaptive-badge-main"
        onClick={onOpenModal}
        title={`Adaptive layout active: ${activeRule?.name || "Evaluating conditions"}. Click to view rules.`}
      >
        <span className="adaptive-active-dot" aria-hidden="true" />
        <Icon name="auto_awesome" className="adaptive-status-icon active" />
        <span className="adaptive-badge-text">
          Adaptive: <strong>{activeRule ? activeRule.name : "Monitoring"}</strong>
        </span>
      </button>
      <button
        type="button"
        className="adaptive-quick-action"
        onClick={() => togglePause(true)}
        title="Pause adaptive transitions"
      >
        Pause
      </button>
      {priorLayoutExists && (
        <button
          type="button"
          className="adaptive-quick-action revert"
          onClick={restorePriorLayoutNow}
          title="Restore layout snapshot from before adaptation"
        >
          Restore Prior
        </button>
      )}
    </div>
  );
}
