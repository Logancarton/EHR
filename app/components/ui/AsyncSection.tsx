"use client";

import type { ReactNode } from "react";
import { resolveAsyncView } from "../../lib/ui-system";
import Button from "./Button";
import Icon from "./Icon";

/**
 * The lifecycle every list-shaped surface owes the clinician:
 *
 *   idle -> loading -> ready | empty
 *   idle -> loading -> error -> retry
 *
 * Written out by hand in eight surfaces before this, usually as
 * `loading ? … : rows.length === 0 ? … : rows` with no error branch — so a queue
 * that failed to load looked exactly like a queue with nothing in it. In a practice
 * inbox those two mean opposite things, which is why the error branch is not
 * optional here and why it always carries a way to try again.
 *
 * A refresh over content already on screen keeps the content and marks the region
 * busy, rather than blanking a list the clinician is reading.
 */
export function EmptyState({ message, children }: { message: string; children?: ReactNode }) {
  return (
    <div className="ui-state ui-state-empty">
      <p>{message}</p>
      {children}
    </div>
  );
}

export function LoadingState({ message }: { message: string }) {
  return (
    <div className="ui-state ui-state-loading" role="status">
      <span className="ui-state-spinner" aria-hidden="true" />
      <p>{message}</p>
    </div>
  );
}

export function InlineError({
  message,
  onRetry,
  retryLabel = "Try again",
}: {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div className="ui-state ui-state-error" role="alert">
      <Icon name="error" />
      <p>{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </div>
  );
}

export default function AsyncSection({
  loading,
  error,
  isEmpty,
  hasLoadedOnce,
  loadingMessage,
  emptyMessage,
  emptyAction,
  onRetry,
  className,
  children,
}: {
  loading: boolean;
  error?: string | null;
  isEmpty: boolean;
  hasLoadedOnce?: boolean;
  loadingMessage: string;
  emptyMessage: string;
  /** Optional next step offered when there is nothing yet, e.g. "Add a task". */
  emptyAction?: ReactNode;
  onRetry?: () => void;
  className?: string;
  children: ReactNode;
}) {
  const view = resolveAsyncView({ loading, error, isEmpty, hasLoadedOnce });

  return (
    <div className={["ui-async", className].filter(Boolean).join(" ")} aria-busy={view.busy || undefined}>
      {view.phase === "loading" && <LoadingState message={loadingMessage} />}
      {view.phase === "error" && <InlineError message={error || "This could not be loaded."} onRetry={onRetry} />}
      {view.phase === "empty" && <EmptyState message={emptyMessage}>{emptyAction}</EmptyState>}
      {view.phase === "ready" && children}
    </div>
  );
}
