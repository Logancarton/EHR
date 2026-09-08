import type { MedicationRecord } from "./clinical-records";
import {
  buildMedicationReconciliationReview,
  type MedicationCandidateDelta,
  type MedicationMatchConfidence,
} from "./medication-reconciliation-intelligence";
import type { MedicationReconciliationCandidate } from "./medication-reconciliation";
import type { DeaSchedule, Pharmacy } from "./orders";

export type PrescriptionIntentSource = "clinician" | "ai" | "api";
export type PrescriptionIntentLifecycle = "draft" | "staged" | "authorized" | "transmitted" | "transmission_failed";
export type PrescriptionIntentRelationship = "unspecified" | "continue" | "change" | "replace" | "new";

export interface MedicationPrescriptionIntent {
  patientId: string;
  medicationName: string;
  genericName?: string;
  strength?: string;
  dose?: string;
  form?: string;
  route?: string;
  frequency?: string;
  quantity?: number;
  daysSupply?: number;
  refills?: number;
  substitutionAllowed?: boolean;
  sig?: string;
  startDate?: string;
  associatedMedicationRecordId?: string;
  relationship?: PrescriptionIntentRelationship;
  prescriber?: string;
  indication?: string;
  pharmacy?: Pharmacy;
  deaSchedule?: DeaSchedule;
  source: PrescriptionIntentSource;
  sourceReference?: string;
  lifecycle: PrescriptionIntentLifecycle;
}

export type PrescriptionValidationSeverity = "error" | "warning" | "advisory";

export interface PrescriptionValidationIssue {
  code:
    | "missing-medication-name"
    | "missing-dose"
    | "missing-route"
    | "missing-frequency"
    | "missing-sig"
    | "malformed-sig"
    | "invalid-quantity"
    | "invalid-days-supply"
    | "invalid-refills"
    | "quantity-days-supply-mismatch"
    | "duplicate-staged-prescription"
    | "patient-mismatch";
  severity: PrescriptionValidationSeverity;
  field?: string;
  message: string;
}

export type MedicationTruthImpactKind =
  | "no-change"
  | "likely-new-medication"
  | "likely-dose-change"
  | "likely-frequency-change"
  | "likely-replacement"
  | "unclear";

export interface MedicationTruthImpact {
  kind: MedicationTruthImpactKind;
  confidence: MedicationMatchConfidence;
  medicationId: string | null;
  medicationDisplay: string | null;
  summary: string;
  deltas: MedicationCandidateDelta[];
  alternatives: Array<{ medicationId: string; displayText: string }>;
}

export interface MedicationPrescriptionReview {
  intent: MedicationPrescriptionIntent;
  validationIssues: PrescriptionValidationIssue[];
  canAuthorize: boolean;
  truthImpact: MedicationTruthImpact;
}

export interface StagedMedicationOrderLike {
  id: string;
  patientId: string;
  status: string;
  details?: Record<string, any>;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function prescriptionIntentFromOrderInput(input: {
  patientId: string;
  name: string;
  details?: Record<string, any>;
  source: PrescriptionIntentSource;
  lifecycle?: PrescriptionIntentLifecycle;
}): MedicationPrescriptionIntent {
  const details = input.details || {};
  return {
    patientId: input.patientId,
    medicationName: text(details.medicationName) || text(details.medication) || input.name.trim(),
    genericName: text(details.genericName),
    strength: text(details.strength),
    dose: text(details.dose),
    form: text(details.form),
    route: text(details.route),
    frequency: text(details.frequency),
    quantity: numberValue(details.dispenseQuantity) ?? numberValue(details.quantity),
    daysSupply: numberValue(details.daysSupply),
    refills: numberValue(details.refills),
    substitutionAllowed: typeof details.substitutionAllowed === "boolean" ? details.substitutionAllowed : undefined,
    sig: text(details.sig),
    startDate: text(details.startDate),
    associatedMedicationRecordId: text(details.associatedMedicationRecordId),
    relationship: (text(details.relationship) as PrescriptionIntentRelationship | undefined) || "unspecified",
    prescriber: text(details.prescribedBy) || text(details.prescriber),
    indication: text(details.indication),
    pharmacy: details.pharmacy,
    deaSchedule: details.deaSchedule,
    source: input.source,
    sourceReference: text(details.sourceReference),
    lifecycle: input.lifecycle || "staged",
  };
}

function normalized(value: string | undefined): string {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function prescriptionFingerprint(intent: MedicationPrescriptionIntent): string {
  return [
    intent.patientId,
    normalized(intent.medicationName),
    normalized(intent.strength),
    normalized(intent.dose),
    normalized(intent.route),
    normalized(intent.frequency),
    normalized(intent.sig),
    String(intent.quantity ?? ""),
    String(intent.daysSupply ?? ""),
    String(intent.refills ?? ""),
  ].join("|");
}

function validationIssues(
  intent: MedicationPrescriptionIntent,
  stagedOrders: StagedMedicationOrderLike[],
  currentOrderId?: string,
): PrescriptionValidationIssue[] {
  const issues: PrescriptionValidationIssue[] = [];
  if (!intent.medicationName.trim()) issues.push({ code: "missing-medication-name", severity: "error", field: "medicationName", message: "Medication name is required." });
  if (!intent.dose) issues.push({ code: "missing-dose", severity: "warning", field: "dose", message: "Dose is not explicitly structured; clinician review is required." });
  if (!intent.route) issues.push({ code: "missing-route", severity: "warning", field: "route", message: "Route is not explicitly structured." });
  if (!intent.frequency) issues.push({ code: "missing-frequency", severity: "warning", field: "frequency", message: "Frequency is not explicitly structured." });
  if (!intent.sig) issues.push({ code: "missing-sig", severity: "error", field: "sig", message: "SIG is required before authorization." });
  else if (intent.sig.length < 6 || !/[a-z]/i.test(intent.sig)) issues.push({ code: "malformed-sig", severity: "error", field: "sig", message: "SIG does not appear to contain usable administration instructions." });
  if (intent.quantity !== undefined && (!Number.isInteger(intent.quantity) || intent.quantity <= 0)) issues.push({ code: "invalid-quantity", severity: "error", field: "quantity", message: "Quantity must be a positive whole number." });
  if (intent.daysSupply !== undefined && (!Number.isInteger(intent.daysSupply) || intent.daysSupply <= 0)) issues.push({ code: "invalid-days-supply", severity: "error", field: "daysSupply", message: "Days supply must be a positive whole number." });
  if (intent.refills !== undefined && (!Number.isInteger(intent.refills) || intent.refills < 0)) issues.push({ code: "invalid-refills", severity: "error", field: "refills", message: "Refills cannot be negative." });

  const dailyDose = intent.sig?.match(/take\s+(\d+)\s+.*?(?:once\s+daily|daily)/i);
  if (dailyDose && intent.quantity && intent.daysSupply) {
    const expected = Number(dailyDose[1]) * intent.daysSupply;
    if (expected !== intent.quantity) issues.push({ code: "quantity-days-supply-mismatch", severity: "warning", message: `SIG suggests about ${expected} dosage units for ${intent.daysSupply} days, but quantity is ${intent.quantity}.` });
  }

  const fingerprint = prescriptionFingerprint(intent);
  const duplicate = stagedOrders.find((order) => {
    if (order.id === currentOrderId || order.patientId !== intent.patientId || order.status !== "staged") return false;
    const storedIntent = order.details?.prescriptionIntent as MedicationPrescriptionIntent | undefined;
    return storedIntent ? prescriptionFingerprint(storedIntent) === fingerprint : false;
  });
  if (duplicate) issues.push({ code: "duplicate-staged-prescription", severity: "error", message: `An identical staged prescription already exists (${duplicate.id}).` });
  return issues;
}

function asCandidate(intent: MedicationPrescriptionIntent): MedicationReconciliationCandidate {
  const now = new Date().toISOString();
  return {
    id: "prescription-intent-review",
    patient_id: intent.patientId,
    source_type: "clinician-entered",
    source_system: "ehr-prescription-intent",
    source_ref: intent.sourceReference || null,
    evidence_type: "prescription-intent",
    raw_evidence_text: intent.sig || intent.medicationName,
    display_text: [intent.medicationName, intent.strength, intent.frequency].filter(Boolean).join(" "),
    medication_name: intent.medicationName,
    generic_name: intent.genericName || null,
    strength: intent.strength || null,
    dose: intent.dose || null,
    route: intent.route || null,
    frequency: intent.frequency || null,
    start_date: intent.startDate || null,
    end_date: null,
    prescriber: intent.prescriber || null,
    observed_at: now,
    status: "pending",
    linked_medication_id: intent.associatedMedicationRecordId || null,
    decision: null,
    resolved_by: null,
    resolved_at: null,
    created_by: intent.prescriber || "prescription-intent",
    created_at: now,
    updated_at: now,
  };
}

function truthImpact(intent: MedicationPrescriptionIntent, medications: MedicationRecord[]): MedicationTruthImpact {
  const review = buildMedicationReconciliationReview(asCandidate(intent), medications);
  const suggestion = review.suggestion;
  const alternatives = suggestion.alternatives.map((item) => ({ medicationId: item.medicationId, displayText: item.displayText }));

  if (alternatives.length > 1) return { kind: "unclear", confidence: suggestion.confidence, medicationId: null, medicationDisplay: null, summary: "More than one authoritative medication could match; no target was selected.", deltas: review.deltas, alternatives };
  if (!suggestion.medicationId) return { kind: "likely-new-medication", confidence: suggestion.confidence, medicationId: null, medicationDisplay: null, summary: "No safe exact relationship to an authoritative medication was found; this likely represents a new medication.", deltas: review.deltas, alternatives };

  if (intent.relationship === "replace") return { kind: "likely-replacement", confidence: suggestion.confidence, medicationId: suggestion.medicationId, medicationDisplay: suggestion.medicationDisplay, summary: `Prescription is marked as replacing ${suggestion.medicationDisplay}.`, deltas: review.deltas, alternatives };
  if (review.deltas.some((delta) => delta.kind === "dose-difference" || delta.kind === "strength-difference")) return { kind: "likely-dose-change", confidence: suggestion.confidence, medicationId: suggestion.medicationId, medicationDisplay: suggestion.medicationDisplay, summary: `Prescription likely changes dose/strength from ${suggestion.medicationDisplay}.`, deltas: review.deltas, alternatives };
  if (review.deltas.some((delta) => delta.kind === "frequency-difference")) return { kind: "likely-frequency-change", confidence: suggestion.confidence, medicationId: suggestion.medicationId, medicationDisplay: suggestion.medicationDisplay, summary: `Prescription likely changes frequency from ${suggestion.medicationDisplay}.`, deltas: review.deltas, alternatives };
  if (review.deltas.some((delta) => !["same-medication", "prescriber-difference"].includes(delta.kind))) return { kind: "unclear", confidence: suggestion.confidence, medicationId: suggestion.medicationId, medicationDisplay: suggestion.medicationDisplay, summary: "Prescription appears related to a current medication, but its chart implication is not limited to a clear dose/frequency change.", deltas: review.deltas, alternatives };
  return { kind: "no-change", confidence: suggestion.confidence, medicationId: suggestion.medicationId, medicationDisplay: suggestion.medicationDisplay, summary: `Prescription is consistent with ${suggestion.medicationDisplay}.`, deltas: review.deltas, alternatives };
}

export function reviewMedicationPrescriptionIntent(input: {
  intent: MedicationPrescriptionIntent;
  medications: MedicationRecord[];
  stagedOrders?: StagedMedicationOrderLike[];
  currentOrderId?: string;
}): MedicationPrescriptionReview {
  const samePatientMedications = input.medications.filter((medication) => medication.patient_id === input.intent.patientId && medication.status !== "entered-in-error");
  const issues = validationIssues(input.intent, input.stagedOrders || [], input.currentOrderId);
  return {
    intent: input.intent,
    validationIssues: issues,
    canAuthorize: !issues.some((issue) => issue.severity === "error"),
    truthImpact: truthImpact(input.intent, samePatientMedications),
  };
}
