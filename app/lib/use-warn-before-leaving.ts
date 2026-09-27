"use client";

import { useEffect } from "react";

/**
 * Asks before a refresh or close throws away unsent companion work (CB-6h).
 *
 * Companion drafts live in memory (CB-6c/d), so a refresh loses them. The owner
 * chose a warning over keeping draft clinical text in browser storage: nothing is
 * written anywhere, and the browser's own "Leave site?" prompt gives the clinician
 * the chance to go back and send or save first. Same mechanism as the encounter
 * editor's unsaved-note guard (`encounter-save-lifecycle`).
 */
export function useWarnBeforeLeaving(hasUnsentWork: boolean): void {
  useEffect(() => {
    if (!hasUnsentWork) return;
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsentWork]);
}

/** Any scope holds text that has not been sent or saved. */
export function hasUnsentDraft(drafts: Readonly<Record<string, string>>): boolean {
  return Object.values(drafts).some((text) => text.trim() !== "");
}
