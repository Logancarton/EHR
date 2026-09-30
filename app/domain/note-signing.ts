/**
 * The least a note must document before it can become the legal record.
 *
 * Signing freezes the note and produces a charge, so a note with no clinical
 * decision in it must not be signable: it would bill a visit that the record does
 * not describe. The rule is deliberately small — an assessment or a plan — because
 * a psychotherapy-only or phone note may legitimately document one without the
 * other. Everything else stays a readiness prompt, not a gate.
 *
 * The browser uses this to explain why Sign is unavailable; the server applies the
 * same rule so a direct API call cannot sign an empty note either.
 */

export type SignableNoteContent = {
  assessment?: string | null;
  plan?: string | null;
};

export const EMPTY_NOTE_SIGNING_REFUSAL =
  "This note documents no assessment or plan. Add at least one before signing — a signed note is the legal record and produces a charge.";

function hasText(value?: string | null): boolean {
  return Boolean(value && value.trim().length > 0);
}

/** Why this note cannot be signed yet, or null when it may be. */
export function noteSigningBlocker(note: SignableNoteContent): string | null {
  if (hasText(note.assessment) || hasText(note.plan)) return null;
  return EMPTY_NOTE_SIGNING_REFUSAL;
}
