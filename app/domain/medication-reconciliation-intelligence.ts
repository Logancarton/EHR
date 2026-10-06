import type { MedicationRecord } from "./clinical-records";
import type { MedicationReconciliationCandidate } from "./medication-reconciliation";

export type MedicationMatchConfidence = "likely" | "possible" | "unclear";

export type MedicationDeltaKind =
  | "same-medication"
  | "strength-difference"
  | "dose-difference"
  | "route-difference"
  | "frequency-difference"
  | "start-date-difference"
  | "end-date-difference"
  | "prescriber-difference"
  | "active-vs-stopped-conflict"
  | "possible-new-medication"
  | "ambiguous-match";

export interface MedicationCandidateDelta {
  kind: MedicationDeltaKind;
  field?: string;
  candidateValue?: string;
  authoritativeValue?: string;
  summary: string;
}

export interface MedicationMatchAlternative {
  medicationId: string;
  displayText: string;
  status: MedicationRecord["status"];
}

export interface MedicationMatchSuggestion {
  confidence: MedicationMatchConfidence;
  medicationId: string | null;
  medicationDisplay: string | null;
  medicationStatus: MedicationRecord["status"] | null;
  reasons: string[];
  alternatives: MedicationMatchAlternative[];
}

export interface MedicationReconciliationReview {
  candidate: MedicationReconciliationCandidate;
  suggestion: MedicationMatchSuggestion;
  deltas: MedicationCandidateDelta[];
  conflictSignal: string;
}

function normalize(value: string | null | undefined): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nameKeys(...values: Array<string | null | undefined>): Set<string> {
  const keys = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    const pieces = [value, ...value.split(/\s*(?:\/|\(|\)|\bor\b)\s*/i)];
    for (const piece of pieces) {
      const key = normalize(piece);
      if (key.length >= 3) keys.add(key);
    }
  }
  return keys;
}

function medicationNameKeys(medication: MedicationRecord): Set<string> {
  return nameKeys(medication.medication_name, medication.generic_name);
}

function candidateNameKeys(candidate: MedicationReconciliationCandidate): Set<string> {
  return nameKeys(candidate.medication_name, candidate.generic_name);
}

function intersects(left: Set<string>, right: Set<string>): boolean {
  for (const value of left) if (right.has(value)) return true;
  return false;
}

function reportsStopped(candidate: MedicationReconciliationCandidate): boolean {
  if (candidate.end_date) return true;
  const text = normalize(`${candidate.evidence_type} ${candidate.raw_evidence_text} ${candidate.display_text}`);
  return /\b(stopped|discontinued|ceased|not taking|no longer taking)\b/.test(text);
}

function advisoryMatch(
  candidate: MedicationReconciliationCandidate,
  medications: MedicationRecord[],
): MedicationMatchSuggestion {
  const explicit = candidate.linked_medication_id
    ? medications.find((medication) => medication.id === candidate.linked_medication_id)
    : undefined;
  if (explicit) {
    return {
      confidence: "likely",
      medicationId: explicit.id,
      medicationDisplay: explicit.display_text,
      medicationStatus: explicit.status,
      reasons: ["Candidate contains an explicit medication link."],
      alternatives: [],
    };
  }

  const candidateNames = candidateNameKeys(candidate);
  const exactNameMatches = candidateNames.size
    ? medications.filter((medication) => intersects(candidateNames, medicationNameKeys(medication)))
    : [];

  if (exactNameMatches.length === 1) {
    const match = exactNameMatches[0];
    return {
      confidence: "likely",
      medicationId: match.id,
      medicationDisplay: match.display_text,
      medicationStatus: match.status,
      reasons: ["Exact normalized medication or generic name match."],
      alternatives: [],
    };
  }

  if (exactNameMatches.length > 1) {
    return {
      confidence: "possible",
      medicationId: null,
      medicationDisplay: null,
      medicationStatus: null,
      reasons: ["More than one authoritative medication has the same normalized medication or generic name."],
      alternatives: exactNameMatches.map((match) => ({
        medicationId: match.id,
        displayText: match.display_text,
        status: match.status,
      })),
    };
  }

  const displayKey = normalize(candidate.display_text);
  const exactDisplayMatches = displayKey
    ? medications.filter((medication) => normalize(medication.display_text) === displayKey)
    : [];
  if (exactDisplayMatches.length === 1) {
    const match = exactDisplayMatches[0];
    return {
      confidence: "possible",
      medicationId: match.id,
      medicationDisplay: match.display_text,
      medicationStatus: match.status,
      reasons: ["Exact normalized display-text match; medication-name fields did not establish the relationship."],
      alternatives: [],
    };
  }

  /**
   * Legacy chart entries were backfilled with the whole display string as the
   * medication name ("Sertraline 100 mg daily") and no structured name, strength
   * or frequency. Exact name matching cannot see them, so a prescription for a
   * drug the patient is already taking used to read as a new medication. A record
   * whose text *begins* with the candidate's drug name is surfaced as a possible
   * relationship for clinician review. It never raises confidence to "likely".
   */
  const leadingNameMatches = candidateNames.size
    ? medications.filter((medication) => leadingNameMatch(candidateNames, medication))
    : [];
  if (leadingNameMatches.length === 1) {
    const match = leadingNameMatches[0];
    return {
      confidence: "possible",
      medicationId: match.id,
      medicationDisplay: match.display_text,
      medicationStatus: match.status,
      reasons: ["Chart entry text begins with the same medication name; the entry has no structured medication-name fields."],
      alternatives: [],
    };
  }
  if (leadingNameMatches.length > 1) {
    return {
      confidence: "possible",
      medicationId: null,
      medicationDisplay: null,
      medicationStatus: null,
      reasons: ["More than one chart entry begins with the same medication name."],
      alternatives: leadingNameMatches.map((match) => ({
        medicationId: match.id,
        displayText: match.display_text,
        status: match.status,
      })),
    };
  }

  return {
    confidence: "unclear",
    medicationId: null,
    medicationDisplay: null,
    medicationStatus: null,
    reasons: ["No safe exact medication-name relationship was established."],
    alternatives: [],
  };
}

function leadingNameMatch(candidateNames: Set<string>, medication: MedicationRecord): boolean {
  // Do not let display text override a separately recorded medication identity.
  const recordedName = normalize(medication.medication_name);
  const display = normalize(medication.display_text);
  if (medication.generic_name || (recordedName && recordedName != display)) return false;
  const texts = [recordedName, display].filter(Boolean);
  for (const name of candidateNames) {
    // A whole-word prefix only: "sertraline 100 mg" matches "sertraline", while
    // "lithium" must not match "lithiumx" and a mid-string mention never counts.
    if (texts.some((value) => value.startsWith(`${name} `))) return true;
  }
  return false;
}

const STRENGTH_PATTERN = /(\d+(?:\.\d+)?)\s*(mcg|mg|g|ml|units?|iu)\b(?:\s*\/\s*(\d+(?:\.\d+)?)?\s*(mcg|mg|g|ml|units?|iu)\b)?/i;

function strengthKey(value: string | null | undefined): string | null {
  const match = String(value || "").match(STRENGTH_PATTERN);
  if (!match) return null;
  const denominator = match[4] ? `/${Number(match[3] || 1)} ${match[4].toLowerCase()}` : "";
  return `${Number(match[1])} ${match[2].toLowerCase()}${denominator}`;
}

/**
 * Strength stated in a legacy entry's display text, used only when the entry has
 * no structured strength field.
 */
function strengthFromText(medication: MedicationRecord): string | null {
  const match = String(medication.display_text || "").match(STRENGTH_PATTERN);
  return match ? match[0] : null;
}

function different(
  deltas: MedicationCandidateDelta[],
  kind: MedicationDeltaKind,
  field: string,
  candidateValue: string | null,
  authoritativeValue: string | null,
) {
  if (!candidateValue || !authoritativeValue) return;
  if (normalize(candidateValue) === normalize(authoritativeValue)) return;
  deltas.push({
    kind,
    field,
    candidateValue,
    authoritativeValue,
    summary: `${field}: evidence reports ${candidateValue}; authoritative record has ${authoritativeValue}.`,
  });
}

function candidateDeltas(
  candidate: MedicationReconciliationCandidate,
  medications: MedicationRecord[],
  suggestion: MedicationMatchSuggestion,
): MedicationCandidateDelta[] {
  if (suggestion.confidence === "possible" && suggestion.alternatives.length > 1) {
    return [{
      kind: "ambiguous-match",
      summary: `Multiple authoritative medications could match this evidence; no target was selected.`,
    }];
  }

  const target = suggestion.medicationId
    ? medications.find((medication) => medication.id === suggestion.medicationId)
    : undefined;
  if (!target) {
    return [{
      kind: "possible-new-medication",
      summary: "No clear authoritative medication match was found; this may be new or unrecorded medication evidence.",
    }];
  }

  const deltas: MedicationCandidateDelta[] = [{
    kind: "same-medication",
    summary: `Evidence appears related to ${target.display_text}.`,
  }];

  if (target.strength) {
    different(deltas, "strength-difference", "Strength", candidate.strength, target.strength);
  } else {
    const textStrength = strengthFromText(target);
    if (candidate.strength && textStrength && strengthKey(candidate.strength) !== strengthKey(textStrength)) {
      deltas.push({
        kind: "strength-difference",
        field: "Strength",
        candidateValue: candidate.strength,
        authoritativeValue: textStrength,
        summary: `Strength: evidence reports ${candidate.strength}; authoritative record text states ${textStrength}.`,
      });
    }
  }
  different(deltas, "dose-difference", "Dose", candidate.dose, target.dose);
  different(deltas, "route-difference", "Route", candidate.route, target.route);
  different(deltas, "frequency-difference", "Frequency", candidate.frequency, target.frequency);
  different(deltas, "start-date-difference", "Start date", candidate.start_date, target.start_date);
  different(deltas, "end-date-difference", "End date", candidate.end_date, target.end_date);
  different(deltas, "prescriber-difference", "Prescriber", candidate.prescriber, target.prescriber);

  if (target.status === "active" && reportsStopped(candidate)) {
    deltas.push({
      kind: "active-vs-stopped-conflict",
      field: "Status",
      candidateValue: "stopped",
      authoritativeValue: "active",
      summary: "Evidence indicates the medication was stopped, while the authoritative record remains active.",
    });
  }

  return deltas;
}

function conflictSignal(
  candidate: MedicationReconciliationCandidate,
  suggestion: MedicationMatchSuggestion,
  deltas: MedicationCandidateDelta[],
): string {
  const stopped = deltas.find((delta) => delta.kind === "active-vs-stopped-conflict");
  if (stopped) return "Patient/evidence reports medication stopped; chart still lists it active.";

  const dose = deltas.find((delta) => delta.kind === "dose-difference");
  if (dose) return `Possible dose discrepancy: ${dose.candidateValue} reported vs ${dose.authoritativeValue} recorded.`;

  const strength = deltas.find((delta) => delta.kind === "strength-difference");
  if (strength) return `Possible strength discrepancy: ${strength.candidateValue} reported vs ${strength.authoritativeValue} recorded.`;

  const frequency = deltas.find((delta) => delta.kind === "frequency-difference");
  if (frequency) return `Possible frequency discrepancy: ${frequency.candidateValue} reported vs ${frequency.authoritativeValue} recorded.`;

  if (deltas.some((delta) => delta.kind === "ambiguous-match")) {
    return "More than one medication could match this evidence; clinician selection is required.";
  }

  if (suggestion.confidence === "unclear") {
    return candidate.source_type === "external-vendor" || candidate.source_type === "imported-record"
      ? "External evidence may represent a medication not currently on the chart."
      : "Unclear relationship to current medications; review is required.";
  }

  if (suggestion.medicationDisplay) {
    return `Possible relationship to ${suggestion.medicationDisplay}; no structured conflict was identified.`;
  }
  return "Medication evidence requires clinician review.";
}

export function buildMedicationReconciliationReview(
  candidate: MedicationReconciliationCandidate,
  medications: MedicationRecord[],
): MedicationReconciliationReview {
  const samePatientMedications = medications.filter((medication) => medication.patient_id === candidate.patient_id);
  const suggestion = advisoryMatch(candidate, samePatientMedications);
  const deltas = candidateDeltas(candidate, samePatientMedications, suggestion);
  return {
    candidate,
    suggestion,
    deltas,
    conflictSignal: conflictSignal(candidate, suggestion, deltas),
  };
}

export function buildMedicationReconciliationReviews(
  candidates: MedicationReconciliationCandidate[],
  medications: MedicationRecord[],
): MedicationReconciliationReview[] {
  return candidates.map((candidate) => buildMedicationReconciliationReview(candidate, medications));
}
