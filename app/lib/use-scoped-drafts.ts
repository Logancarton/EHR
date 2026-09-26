"use client";

import { useCallback, useState } from "react";

/**
 * Drafts that belong to a patient (CB-6c).
 *
 * A right-rail companion stays open while the clinician moves between charts, so
 * any text typed into it outlives the chart it was typed for. Held as one string,
 * that text silently changes owner the moment another chart comes forward: a task
 * typed about Maya is filed against Jordan, a reply typed to Maya is sent in
 * Jordan's thread. Nothing on screen says so; the words are unchanged and only
 * the header moved.
 *
 * So a companion keeps one draft per scope: the patient it was typed for, or the
 * practice when no chart is in front. Changing charts changes which draft is
 * shown; it never moves a draft to another patient. Coming back brings it back.
 */

/** The scope for work that belongs to no patient. */
export const PRACTICE_DRAFT_SCOPE = "practice";

export function draftScopeFor(patientId: string | null | undefined): string {
  return patientId ? `patient:${patientId}` : PRACTICE_DRAFT_SCOPE;
}

export type ScopedDraftUpdate<T> = T | undefined | ((current: T | undefined) => T | undefined);

/** Writes one scope's draft; `undefined` discards it. Unchanged input returns `drafts`. */
export function writeScopedDraft<T>(
  drafts: Readonly<Record<string, T>>,
  scope: string,
  value: T | undefined,
): Record<string, T> {
  if (value === undefined) {
    if (!(scope in drafts)) return drafts as Record<string, T>;
    const next = { ...drafts };
    delete next[scope];
    return next;
  }
  if (drafts[scope] === value) return drafts as Record<string, T>;
  return { ...drafts, [scope]: value };
}

/** Empty text is no draft at all, so it does not linger as a scope entry. */
export function textDraft(value: string): string | undefined {
  return value === "" ? undefined : value;
}

export function useScopedDrafts<T>() {
  const [drafts, setDrafts] = useState<Record<string, T>>({});
  const write = useCallback((scope: string, update: ScopedDraftUpdate<T>) => {
    setDrafts((current) =>
      writeScopedDraft(
        current,
        scope,
        typeof update === "function"
          ? (update as (value: T | undefined) => T | undefined)(current[scope])
          : update,
      ),
    );
  }, []);
  return { drafts, write };
}
