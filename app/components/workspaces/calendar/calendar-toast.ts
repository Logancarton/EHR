"use client";

import { useEffect, useState } from "react";

/**
 * The Calendar's one toast line, auto-dismissed after 4s. Shared because
 * navigation (jump confirmations), the event editor (booking results), and
 * appointment actions (status/cancel results) all need to report through the
 * same single-owner toast rather than each keeping its own.
 */
export function useCalendarToast() {
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!toastMessage) return;
    const t = setTimeout(() => setToastMessage(null), 4000);
    return () => clearTimeout(t);
  }, [toastMessage]);

  return { toastMessage, setToastMessage };
}
