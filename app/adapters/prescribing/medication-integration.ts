export type ExternalMedicationEvidenceType =
  | "prescription"
  | "dispense"
  | "medication-history"
  | "other";

/**
 * Non-authoritative medication information produced by an external integration adapter.
 * A candidate is evidence for reconciliation, not an EHR MedicationRecord and never becomes
 * clinical truth merely because a vendor returned it.
 */
export interface ExternalMedicationCandidate {
  providerId: string;
  externalReferenceId: string;
  evidenceType: ExternalMedicationEvidenceType;
  displayText: string;
  medicationName: string;
  genericName?: string;
  strength?: string;
  dose?: string;
  route?: string;
  frequency?: string;
  startDate?: string;
  endDate?: string;
  prescriber?: string;
  observedAt?: string;
}

/**
 * Thin vendor-neutral seam for translating external medication payloads into reconciliation
 * candidates. It intentionally has no clinical-record mutation method. Future launch, network,
 * history-fetch, formulary, EPCS, and transmission capabilities stay in vendor-owned adapters
 * rather than leaking into the authoritative medication domain.
 */
export interface MedicationIntegrationProvider<TExternalPayload = unknown> {
  readonly id: string;
  toMedicationCandidate(payload: TExternalPayload): ExternalMedicationCandidate | null;
}

export function mapExternalMedicationCandidate<TExternalPayload>(
  provider: MedicationIntegrationProvider<TExternalPayload>,
  payload: TExternalPayload,
): ExternalMedicationCandidate | null {
  const candidate = provider.toMedicationCandidate(payload);
  if (!candidate) return null;
  if (candidate.providerId !== provider.id) {
    throw new Error(`Medication candidate provider mismatch: expected ${provider.id}.`);
  }
  if (!candidate.externalReferenceId.trim() || !candidate.displayText.trim() || !candidate.medicationName.trim()) {
    throw new Error("External medication candidates require reference, display text, and medication name.");
  }
  return Object.freeze({ ...candidate });
}
