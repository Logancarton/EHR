"use client";

import { useEffect, useRef } from "react";
import { api } from "./api-client";
import { useAuthSession } from "../components/auth/AuthSessionGate";

/**
 * DB-6: Ephemeral presence heartbeat hook.
 * Sends periodic client heartbeats (every 20s while window is active)
 * and on window focus, maintaining honest presence state without persisting
 * heartbeats to permanent audit logs or database rows.
 */
export function usePresenceHeartbeat(location: string = "schedule") {
  const { user } = useAuthSession();
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!user) return;

    function sendHeartbeat() {
      api.presence.heartbeat(location).catch(() => {
        // Ephemeral heartbeats fail silently during transient offline periods
      });
    }

    // Initial heartbeat on mount / session activation
    sendHeartbeat();

    // 20s periodic heartbeat interval while active
    timerRef.current = setInterval(() => {
      if (typeof document !== "undefined" && !document.hidden) {
        sendHeartbeat();
      }
    }, 20_000);

    function onFocus() {
      sendHeartbeat();
    }

    if (typeof window !== "undefined") {
      window.addEventListener("focus", onFocus);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("focus", onFocus);
      }
    };
  }, [user, location]);
}
