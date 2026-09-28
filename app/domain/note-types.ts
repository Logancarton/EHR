/**
 * The kinds of note a clinician can start from the voice menu.
 *
 * A note type is what the clinician calls the note ("Phone call"), recorded as the
 * encounter's visit type, plus the built-in template whose sections and defaults
 * it opens with. Coding is still derived from what the note documents, never from
 * the type's name, so a type only chooses where writing starts.
 *
 * Custom types are the clinician's own names, kept in their preferences so they
 * are offered again. They open on the follow-up template until a template builder
 * exists; that is a named gap, not a coding claim.
 */

export type NoteStartMode = "dictate" | "scribe";

export type NoteType = {
  id: string;
  label: string;
  /** Recorded on the encounter as its type. */
  visitType: string;
  /** Built-in template the note opens with. */
  templateId: string;
  custom?: boolean;
};

export const FOLLOW_UP_TEMPLATE_ID = "psych-followup-99214";

export const BUILT_IN_NOTE_TYPES: readonly NoteType[] = Object.freeze([
  { id: "intake", label: "Intake", visitType: "Psychiatric Intake", templateId: "comprehensive-intake-90792" },
  { id: "follow-up", label: "Follow-up", visitType: "Psychiatric Follow-Up", templateId: FOLLOW_UP_TEMPLATE_ID },
  { id: "phone-call", label: "Phone call", visitType: "Phone Call", templateId: FOLLOW_UP_TEMPLATE_ID },
  { id: "psychotherapy", label: "Psychotherapy", visitType: "Psychotherapy", templateId: "psychotherapy-add-90833" },
]);

export const MAX_NOTE_TYPE_NAME_LENGTH = 60;
export const MAX_CUSTOM_NOTE_TYPES = 20;

function cleanName(name: string): string {
  return name.replace(/\s+/g, " ").trim().slice(0, MAX_NOTE_TYPE_NAME_LENGTH);
}

function sameName(left: string, right: string): boolean {
  return left.toLocaleLowerCase() === right.toLocaleLowerCase();
}

/** A one-off or saved type named by the clinician, or null for an empty name. */
export function namedNoteType(name: string): NoteType | null {
  const label = cleanName(name);
  if (!label) return null;
  const builtIn = BUILT_IN_NOTE_TYPES.find((type) => sameName(type.label, label));
  if (builtIn) return builtIn;
  return {
    id: `custom:${label.toLocaleLowerCase()}`,
    label,
    visitType: label,
    templateId: FOLLOW_UP_TEMPLATE_ID,
    custom: true,
  };
}

/** Stored custom names, cleaned: strings only, no blanks, duplicates or built-in names. */
export function normalizeCustomNoteTypes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const names: string[] = [];
  for (const value of raw) {
    if (typeof value !== "string") continue;
    const name = cleanName(value);
    if (!name) continue;
    if (BUILT_IN_NOTE_TYPES.some((type) => sameName(type.label, name))) continue;
    if (names.some((existing) => sameName(existing, name))) continue;
    names.push(name);
    if (names.length === MAX_CUSTOM_NOTE_TYPES) break;
  }
  return names;
}

/** The saved list with `name` added; unchanged when the name is empty or already offered. */
export function addCustomNoteType(existing: readonly string[], name: string): string[] {
  return normalizeCustomNoteTypes([...existing, name]);
}

/** Every type the menu offers, built-ins first. */
export function noteTypeChoices(customNames: readonly string[]): NoteType[] {
  return [
    ...BUILT_IN_NOTE_TYPES,
    ...normalizeCustomNoteTypes(customNames).flatMap((name) => namedNoteType(name) ?? []),
  ];
}

type NarrativeContent = {
  chiefComplaint?: string;
  intervalHistory?: string;
  reviewOfSymptoms?: string;
  treatmentResponse?: string;
  sideEffects?: string;
  assessment?: string;
  riskAssessment?: string;
  plan?: string;
  followUp?: string;
};

/**
 * Whether a draft has nothing the clinician wrote, so a requested type may be
 * applied to it. A note with any narrative is kept as it is: changing its type
 * would re-template work already done.
 */
export function isBlankNote(draft: NarrativeContent, templateDefaults: NarrativeContent = {}): boolean {
  return (Object.keys({
    chiefComplaint: 1, intervalHistory: 1, reviewOfSymptoms: 1, treatmentResponse: 1,
    sideEffects: 1, assessment: 1, riskAssessment: 1, plan: 1, followUp: 1,
  }) as Array<keyof NarrativeContent>).every((field) => {
    const value = (draft[field] ?? "").trim();
    return !value || value === (templateDefaults[field] ?? "").trim();
  });
}
