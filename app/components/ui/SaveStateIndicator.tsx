"use client";

import { type SaveStatus, saveStateView } from "../../lib/ui-system";
import Button from "./Button";
import Icon from "./Icon";

/**
 * What a background save is doing, in the same words everywhere.
 *
 * The encounter note settled this first: a clinician needs to know whether what they
 * typed is in the record, and a failed save must say so and offer a way back rather
 * than fading out of a toast. "Saved" is only ever shown once the server confirmed
 * it — an indicator that runs ahead of persistence is worse than none.
 */
export default function SaveStateIndicator({
  status,
  savedAt,
  error,
  onRetry,
  label,
}: {
  status: SaveStatus;
  savedAt?: string;
  error?: string;
  onRetry?: () => void;
  /** Overrides the status word, e.g. "Signed" for a record that can no longer change. */
  label?: string;
}) {
  const view = saveStateView({ status, savedAt, error });

  return (
    <span
      className={`ui-save-state tone-${view.tone}`}
      data-save-status={status}
      role="status"
      aria-live={view.politeness}
      title={view.title}
    >
      {status === "saved" && <Icon name="check" size="sm" />}
      {status === "failed" && <Icon name="error" size="sm" />}
      <span className="ui-save-state-label">{label ?? view.label}</span>
      {view.canRetry && onRetry && (
        <Button variant="tertiary" size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </span>
  );
}
