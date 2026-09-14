"use client";

import { useState } from "react";
import Icon from "../ui/Icon";
import type { AutosaveConflictInfo, AutosaveStatus } from "../../lib/useDashboardAutosave";

export interface AutosaveStatusBadgeProps {
  status: AutosaveStatus;
  errorMessage: string | null;
  lastSavedAt: string | null;
  isModified: boolean;
  activePresetName: string;
  conflictInfo: AutosaveConflictInfo | null;
  onRetry: () => void;
  onRevert: () => void;
  onOpenPresetsModal: () => void;
  onResolveConflict: (resolution: "reload" | "overwrite") => void;
}

export default function AutosaveStatusBadge({
  status,
  errorMessage,
  lastSavedAt,
  isModified,
  activePresetName,
  conflictInfo,
  onRetry,
  onRevert,
  onOpenPresetsModal,
  onResolveConflict,
}: AutosaveStatusBadgeProps) {
  const [showConflictDialog, setShowConflictDialog] = useState(false);

  return (
    <div className="autosave-status-container" role="status" aria-live="polite">
      {/* 1. Autosave State Indicator */}
      {status === "saving" && (
        <span className="autosave-badge autosave-badge-saving" title="Saving layout changes...">
          <Icon name="sync" size="sm" className="autosave-spinner" />
          <span className="autosave-text">Saving...</span>
        </span>
      )}

      {status === "saved" && (
        <span
          className="autosave-badge autosave-badge-saved"
          title={lastSavedAt ? `Saved to profile at ${lastSavedAt}` : "All layout changes saved"}
        >
          <Icon name="check_circle" size="sm" className="autosave-icon-saved" />
          <span className="autosave-text">Saved</span>
        </span>
      )}

      {status === "error" && (
        <div className="autosave-badge autosave-badge-error" title={errorMessage || "Failed to save layout preferences"}>
          <Icon name="error" size="sm" className="autosave-icon-error" />
          <span className="autosave-text">Save failed</span>
          <button
            type="button"
            className="autosave-action-btn"
            onClick={onRetry}
            aria-label="Retry saving preferences"
          >
            Retry
          </button>
        </div>
      )}

      {(status === "conflict" || conflictInfo) && (
        <div className="autosave-badge autosave-badge-conflict">
          <Icon name="warning" size="sm" className="autosave-icon-conflict" />
          <span className="autosave-text">Session conflict</span>
          <button
            type="button"
            className="autosave-action-btn autosave-action-conflict"
            onClick={() => setShowConflictDialog(true)}
          >
            Resolve
          </button>
        </div>
      )}

      {/* 2. Modified from Preset Indicator */}
      {isModified && (
        <div className="autosave-modified-pill">
          <span className="modified-label" title={`Layout modified from ${activePresetName}`}>
            Modified from {activePresetName}
          </span>
          <button
            type="button"
            className="modified-revert-btn"
            onClick={onRevert}
            title={`Discard changes and revert to original ${activePresetName} preset`}
          >
            Revert
          </button>
          <button
            type="button"
            className="modified-save-btn"
            onClick={onOpenPresetsModal}
            title="Save as a new preset or update preset"
          >
            Save Preset...
          </button>
        </div>
      )}

      {/* 3. Conflict Resolution Modal */}
      {showConflictDialog && conflictInfo && (
        <div className="autosave-conflict-overlay" role="dialog" aria-modal="true" aria-labelledby="conflict-title">
          <div className="autosave-conflict-card">
            <div className="autosave-conflict-header">
              <Icon name="warning" size="md" className="autosave-icon-conflict" />
              <h3 id="conflict-title">Workspace Layout Conflict</h3>
            </div>
            <p className="autosave-conflict-body">
              Your layout preferences were updated from another active session or tab (server revision #{conflictInfo.serverRevision}).
              How would you like to resolve this difference?
            </p>
            <div className="autosave-conflict-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setShowConflictDialog(false);
                  onResolveConflict("reload");
                }}
              >
                Reload from server
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setShowConflictDialog(false);
                  onResolveConflict("overwrite");
                }}
              >
                Overwrite with this layout
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
