import type {
  MedicationCandidateSourceType,
  MedicationReconciliationDecision,
  ReconcileMedicationCandidateInput,
  RecordMedicationCandidateInput,
} from "../../domain/medication-reconciliation";
import type { ClinicalAction } from "./clinical-action-gateway";

const sourceTypes = new Set<MedicationCandidateSourceType>([
  "patient-reported",
  "clinician-entered",
  "external-vendor",
  "imported-record",
  "other",
]);
const decisions = new Set<MedicationReconciliationDecision>(["add", "update", "discontinue", "ignore"]);

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function requiredText(value: unknown, label: string, max = 500): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required.`);
  const text = value.trim();
  if (text.length > max) throw new Error(`${label} is too long.`);
  return text;
}

function optionalText(value: unknown, label: string, max = 500): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return requiredText(value, label, max);
}

function dateValue(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const text = requiredText(value, label, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error(`${label} must use YYYY-MM-DD.`);
  const parsed = Date.parse(`${text}T00:00:00Z`);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== text) {
    throw new Error(`${label} is invalid.`);
  }
  return text;
}

function timestampValue(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const text = requiredText(value, label, 100);
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a valid timestamp.`);
  return new Date(parsed).toISOString();
}

export function validateMedicationReconciliationAction(body: unknown): ClinicalAction | null {
  const envelope = object(body, "Medication reconciliation action");
  const type = envelope.type;
  if (typeof type !== "string") throw new Error("Medication reconciliation action type is required.");
  const payload = object(envelope.payload ?? {}, "Medication reconciliation payload");

  if (type === "record_medication_candidate") {
    const sourceType = requiredText(payload.sourceType, "Candidate source type", 50) as MedicationCandidateSourceType;
    if (!sourceTypes.has(sourceType)) throw new Error(`Unsupported medication candidate source: ${sourceType}`);

    const input: RecordMedicationCandidateInput = {
      patientId: requiredText(payload.patientId, "patientId", 200),
      sourceType,
      sourceSystem: optionalText(payload.sourceSystem, "Source system", 200),
      sourceRef: optionalText(payload.sourceRef, "Source reference", 500),
      evidenceType: optionalText(payload.evidenceType, "Evidence type", 100),
      displayText: requiredText(payload.displayText, "Medication candidate display text", 500),
      medicationName: optionalText(payload.medicationName, "Medication name", 300),
      genericName: optionalText(payload.genericName, "Generic name", 300),
      strength: optionalText(payload.strength, "Strength", 100),
      dose: optionalText(payload.dose, "Dose", 100),
      route: optionalText(payload.route, "Route", 100),
      frequency: optionalText(payload.frequency, "Frequency", 200),
      startDate: dateValue(payload.startDate, "Start date"),
      endDate: dateValue(payload.endDate, "End date"),
      prescriber: optionalText(payload.prescriber, "Prescriber", 300),
      observedAt: timestampValue(payload.observedAt, "Observed timestamp"),
      linkedMedicationId: optionalText(payload.linkedMedicationId, "Linked medication ID", 200),
    };
    return { type, payload: input };
  }

  if (type === "reconcile_medication_candidate") {
    const decision = requiredText(payload.decision, "Reconciliation decision", 50) as MedicationReconciliationDecision;
    if (!decisions.has(decision)) throw new Error(`Unsupported medication reconciliation decision: ${decision}`);
    const medicationId = optionalText(payload.medicationId, "Medication ID", 200);
    if ((decision === "update" || decision === "discontinue") && !medicationId) {
      throw new Error(`${decision} reconciliation requires medicationId.`);
    }
    if ((decision === "add" || decision === "ignore") && medicationId) {
      throw new Error(`${decision} reconciliation does not accept medicationId.`);
    }
    const input: ReconcileMedicationCandidateInput = {
      candidateId: requiredText(payload.candidateId, "Candidate ID", 200),
      decision,
      medicationId,
    };
    return { type, payload: input };
  }

  return null;
}
