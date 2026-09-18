"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { type ProviderPreferences, savePreferences as saveLocalPreferences } from "./preference-engine";
import { api } from "./api-client";
import { ApiError } from "./api-error";

export type AutosaveStatus = "idle" | "saving" | "saved" | "error" | "conflict";

export interface AutosaveConflictInfo {
  serverRevision: number;
  serverPreferences: ProviderPreferences;
}

export interface UseDashboardAutosaveOptions {
  preferences: ProviderPreferences;
  onUpdatePreferences?: (updated: ProviderPreferences) => void;
  debounceMs?: number;
}

export interface UseDashboardAutosaveResult {
  status: AutosaveStatus;
  errorMessage: string | null;
  conflictInfo: AutosaveConflictInfo | null;
  lastSavedAt: string | null;
  hasPendingChanges: boolean;
  scheduleAutosave: (updated: ProviderPreferences) => void;
  flushImmediate: () => Promise<void>;
  retrySave: () => Promise<void>;
  resolveConflict: (resolution: "reload" | "overwrite") => Promise<void>;
}

export function useDashboardAutosave({
  preferences,
  onUpdatePreferences,
  debounceMs = 600,
}: UseDashboardAutosaveOptions): UseDashboardAutosaveResult {
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [conflictInfo, setConflictInfo] = useState<AutosaveConflictInfo | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  const pendingPrefsRef = useRef<ProviderPreferences | null>(null);
  const currentPrefsRef = useRef<ProviderPreferences>(preferences);
  currentPrefsRef.current = preferences;

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const savedStatusTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Perform actual API save
  const executeSave = useCallback(
    async (prefsToSave: ProviderPreferences, expectedRevisionOverride?: number) => {
      setStatus("saving");
      setErrorMessage(null);

      // Save locally to localStorage immediately for instant local resilience
      saveLocalPreferences(prefsToSave);

      try {
        const expectedRev = expectedRevisionOverride !== undefined
          ? expectedRevisionOverride
          : prefsToSave.revision;

        const updated = await api.preferences.save(prefsToSave, expectedRev);

        // Core state protection: preferences write never alters clinical chart or draft state
        pendingPrefsRef.current = null;
        setStatus("saved");
        setLastSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
        setConflictInfo(null);

        if (onUpdatePreferences) {
          onUpdatePreferences(updated);
        }

        // Return to idle after 2.5 seconds
        if (savedStatusTimeoutRef.current) clearTimeout(savedStatusTimeoutRef.current);
        savedStatusTimeoutRef.current = setTimeout(() => {
          setStatus((prev) => (prev === "saved" ? "idle" : prev));
        }, 2500);
      } catch (err: unknown) {
        if (err instanceof ApiError && err.status === 409) {
          const conflictData = err.data as { serverRevision?: number; serverPreferences?: ProviderPreferences } | undefined;
          if (conflictData?.serverPreferences) {
            setConflictInfo({
              serverRevision: conflictData.serverRevision ?? 1,
              serverPreferences: conflictData.serverPreferences,
            });
            setStatus("conflict");
            setErrorMessage("Conflict: Preferences were updated in another session.");
            return;
          }
        }

        const msg = err instanceof Error ? err.message : "Network error saving layout preferences";
        setStatus("error");
        setErrorMessage(msg);
      }
    },
    [onUpdatePreferences],
  );

  const scheduleAutosave = useCallback(
    (updated: ProviderPreferences) => {
      pendingPrefsRef.current = updated;

      // Immediately propagate to local state so UI updates instantaneously
      if (onUpdatePreferences) {
        onUpdatePreferences(updated);
      }
      saveLocalPreferences(updated);

      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      timerRef.current = setTimeout(() => {
        if (pendingPrefsRef.current) {
          void executeSave(pendingPrefsRef.current);
        }
      }, debounceMs);
    },
    [debounceMs, executeSave, onUpdatePreferences],
  );

  const flushImmediate = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const target = pendingPrefsRef.current || currentPrefsRef.current;
    if (target) {
      await executeSave(target);
    }
  }, [executeSave]);

  const retrySave = useCallback(async () => {
    const target = pendingPrefsRef.current || currentPrefsRef.current;
    if (target) {
      await executeSave(target);
    }
  }, [executeSave]);

  const resolveConflict = useCallback(
    async (resolution: "reload" | "overwrite") => {
      if (!conflictInfo) return;

      if (resolution === "reload") {
        pendingPrefsRef.current = null;
        setConflictInfo(null);
        setStatus("idle");
        setErrorMessage(null);
        saveLocalPreferences(conflictInfo.serverPreferences);
        if (onUpdatePreferences) {
          onUpdatePreferences(conflictInfo.serverPreferences);
        }
      } else {
        // overwrite: send current local layout with the latest server revision
        const toSave = pendingPrefsRef.current || currentPrefsRef.current;
        setConflictInfo(null);
        await executeSave(toSave, conflictInfo.serverRevision);
      }
    },
    [conflictInfo, executeSave, onUpdatePreferences],
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (savedStatusTimeoutRef.current) clearTimeout(savedStatusTimeoutRef.current);
    };
  }, []);

  return {
    status,
    errorMessage,
    conflictInfo,
    lastSavedAt,
    hasPendingChanges: pendingPrefsRef.current !== null,
    scheduleAutosave,
    flushImmediate,
    retrySave,
    resolveConflict,
  };
}
