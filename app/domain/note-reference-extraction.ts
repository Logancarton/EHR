import type { NoteReferenceEntityType } from "../server/repositories/note-reference-repository";

/**
 * The contract an extractor works under.
 *
 * Extraction is a *selection over a supplied set*, never open-ended generation.
 * The model is handed the patient's own records and may only point at them; it
 * cannot mint an identifier, invent a diagnosis, or produce a code. That is what
 * makes the implementation replaceable — a hosted model and the local
 * deterministic one answer the same narrow question — and it is what keeps an
 * extraction pass incapable of adding a clinical fact to the chart.
 *
 * See docs/NOTE_REFERENCES.md §2.5.
 */

const PAYLOAD_LIMIT = 64_000;
const MAX_SELECTIONS = 50;

export type ExtractionCandidate = {
  entityType: NoteReferenceEntityType;
  entityId: string;
  /** How the record reads in the chart. */
  display: string;
  /** Other forms the note might use — a generic name, an abbreviation. */
  aliases?: string[];
};

export type ExtractionRequest = {
  section: string;
  text: string;
  candidates: ExtractionCandidate[];
};

export type ExtractionSelection = {
  entityId: string;
  spanStart: number | null;
  spanEnd: number | null;
  confidence: number;
};

export type DiscardedSelection = {
  reason: string;
  value: unknown;
};

export type ValidatedExtraction = {
  selections: ExtractionSelection[];
  /**
   * Selections that failed validation. Discarded rather than repaired: a model
   * naming a record that was never offered is a fault to record, not a value to
   * guess at.
   */
  discarded: DiscardedSelection[];
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function allowedKeysOnly(value: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function validSpan(value: unknown, textLength: number): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= textLength
  );
}

/**
 * Validate an extractor's raw output against the candidate set it was given.
 *
 * Structural faults throw: a response that is not the agreed shape cannot be
 * partially trusted. Individual selections that name an unknown record, or carry a
 * nonsensical span or confidence, are discarded and reported.
 */
export function validateExtractionOutput(
  value: unknown,
  request: ExtractionRequest,
): ValidatedExtraction {
  let serialized = "";
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new Error("Note reference extractor returned a non-serializable response.");
  }
  if (!serialized || serialized.length > PAYLOAD_LIMIT) {
    throw new Error("Note reference extractor response exceeded the allowed payload size.");
  }
  if (!isObject(value) || !allowedKeysOnly(value, ["selections"])) {
    throw new Error("Note reference extractor returned an invalid response shape.");
  }
  if (!Array.isArray(value.selections)) {
    throw new Error("Note reference extractor response requires a selections array.");
  }
  if (value.selections.length > MAX_SELECTIONS) {
    throw new Error("Note reference extractor returned more selections than a note section may carry.");
  }

  const offered = new Map(request.candidates.map((candidate) => [candidate.entityId, candidate]));
  const textLength = request.text.length;
  const selections: ExtractionSelection[] = [];
  const discarded: DiscardedSelection[] = [];
  const seen = new Set<string>();

  for (const raw of value.selections) {
    if (!isObject(raw) || !allowedKeysOnly(raw, ["entityId", "spanStart", "spanEnd", "confidence"])) {
      discarded.push({ reason: "malformed-selection", value: raw });
      continue;
    }
    if (typeof raw.entityId !== "string" || !offered.has(raw.entityId)) {
      // The single most important rejection: a record that was never offered.
      discarded.push({ reason: "entity-not-in-candidate-set", value: raw });
      continue;
    }
    if (seen.has(raw.entityId)) {
      discarded.push({ reason: "duplicate-entity", value: raw });
      continue;
    }
    const confidence = raw.confidence;
    if (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      discarded.push({ reason: "invalid-confidence", value: raw });
      continue;
    }

    // A span that does not describe a stretch of this text is dropped, but the
    // selection survives: the reference is the finding, the span only decorates it.
    let spanStart: number | null = null;
    let spanEnd: number | null = null;
    if (raw.spanStart !== undefined && raw.spanStart !== null && raw.spanEnd !== undefined && raw.spanEnd !== null) {
      if (validSpan(raw.spanStart, textLength) && validSpan(raw.spanEnd, textLength) && raw.spanStart < raw.spanEnd) {
        spanStart = raw.spanStart;
        spanEnd = raw.spanEnd;
      } else {
        discarded.push({ reason: "invalid-span", value: raw });
      }
    }

    seen.add(raw.entityId);
    selections.push({ entityId: raw.entityId, spanStart, spanEnd, confidence });
  }

  return { selections, discarded };
}

/** The entity type of a validated selection, resolved from the candidate set. */
export function entityTypeFor(
  request: ExtractionRequest,
  entityId: string,
): NoteReferenceEntityType | null {
  return request.candidates.find((candidate) => candidate.entityId === entityId)?.entityType ?? null;
}
