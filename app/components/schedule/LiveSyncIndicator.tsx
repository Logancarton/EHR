"use client";

import { useEffect, useState } from "react";
import Icon from "../ui/Icon";
import { useScheduleSyncStatus } from "../../lib/schedule-store";

export interface LiveSyncIndicatorProps {
  className?: string;
  onManualRefresh?: () => void | Promise<any>;
}

export default function LiveSyncIndicator({
  className = "",
  onManualRefresh,
}: LiveSyncIndicatorProps) {
  const { syncStatus, loadedAt, error, refresh } = useScheduleSyncStatus();
  const [secondsAgo, setSecondsAgo] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    function updateSeconds() {
      if (!loadedAt) {
        setSecondsAgo(0);
        return;
      }
      const elapsed = Math.max(0, Math.floor((Date.now() - new Date(loadedAt).getTime()) / 1000));
      setSecondsAgo(elapsed);
    }

    updateSeconds();
    const interval = setInterval(updateSeconds, 2000);
    return () => clearInterval(interval);
  }, [loadedAt]);

  async function handleManualRefresh() {
    setIsRefreshing(true);
    try {
      if (onManualRefresh) {
        await onManualRefresh();
      } else {
        await refresh();
      }
    } finally {
      setIsRefreshing(false);
    }
  }

  let freshnessText = "Synced just now";
  if (secondsAgo >= 60) {
    freshnessText = `Synced ${Math.floor(secondsAgo / 60)}m ago`;
  } else if (secondsAgo >= 5) {
    freshnessText = `Synced ${secondsAgo}s ago`;
  }

  const isStale = secondsAgo > 30 && syncStatus === "live";
  const displayStatus = isStale ? "stale" : syncStatus;

  return (
    <div
      className={`live-sync-indicator-container ${className}`}
      role="status"
      aria-live="polite"
      title="Live updates poll every 10s · Not instantaneous"
    >
      <div className={`live-sync-badge status-${displayStatus}`}>
        {displayStatus === "syncing" || isRefreshing ? (
          <>
            <Icon name="sync" size="sm" className="sync-spinner" />
            <span className="sync-text">Syncing...</span>
          </>
        ) : displayStatus === "offline" ? (
          <>
            <span className="sync-dot dot-offline" />
            <span className="sync-text">Offline</span>
          </>
        ) : displayStatus === "error" ? (
          <>
            <Icon name="error_outline" size="sm" className="sync-icon-error" />
            <span className="sync-text">Sync failed</span>
            <button
              type="button"
              className="sync-action-btn"
              onClick={handleManualRefresh}
              title={error || "Retry loading schedule"}
            >
              Retry
            </button>
          </>
        ) : displayStatus === "stale" ? (
          <>
            <span className="sync-dot dot-stale" />
            <span className="sync-text">Stale · {freshnessText}</span>
            <button
              type="button"
              className="sync-action-btn"
              onClick={handleManualRefresh}
              title="Refresh schedule now"
            >
              Refresh
            </button>
          </>
        ) : (
          <>
            <span className="sync-dot dot-live" />
            <span className="sync-text">Live · {freshnessText}</span>
            <button
              type="button"
              className="sync-refresh-btn"
              onClick={handleManualRefresh}
              title="Poll every 10s · Click to refresh now"
              aria-label="Refresh schedule now"
            >
              <Icon name="refresh" size="sm" />
            </button>
          </>
        )}
      </div>
      <span className="live-sync-disclaimer" aria-hidden="true">
        Polls 10s
      </span>
    </div>
  );
}
