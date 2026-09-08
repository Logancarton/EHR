import type {
  MedicationReconciliationCandidate,
  ReconcileMedicationCandidateInput,
  RecordMedicationCandidateInput,
} from "../../domain/medication-reconciliation";
import { assertPermission, providerLabel, type ProviderContext } from "../auth/provider-context";
import { getDatabase } from "../db/connection";
import { AuditRepository } from "../repositories/audit-repository";
import { clinicalRecordService } from "./clinical-record-service";
import { MedicationReconciliationRepository } from "../repositories/medication-reconciliation-repository";
import type { ClinicalExecutionContext } from "./clinical-service";

function actorRef(actor: ProviderContext) {
  return { userId: actor.userId, displayName: providerLabel(actor) };
}

function auditActor(actor: ProviderContext) {
  return { userId: actor.userId, userName: providerLabel(actor), userRole: actor.role };
}

function metadata(context: ClinicalExecutionContext, extra: Record<string, unknown> = {}) {
  return { source: context.source, requestId: context.requestId, ...extra };
}

function medicationPatient(medicationId: string): string {
  const row = getDatabase().prepare("SELECT patient_id FROM patient_medications WHERE id = ?")
    .get(medicationId) as { patient_id: string } | undefined;
  if (!row) throw new Error(`Medication record not found: ${medicationId}`);
  return row.patient_id;
}

function assertMedicationBelongsToPatient(medicationId: string, patientId: string) {
  const boundPatientId = medicationPatient(medicationId);
  if (boundPatientId !== patientId) {
    throw new Error(
      `Patient binding mismatch: medication ${medicationId} belongs to ${boundPatientId}, not ${patientId}.`,
    );
  }
}

function medicationSource(candidate: MedicationReconciliationCandidate) {
  return {
    type: "reconciliation",
    system: "ehr-local",
    ref: `medication-candidate/${candidate.id}`,
  };
}

function addInput(candidate: MedicationReconciliationCandidate) {
  return {
    patientId: candidate.patient_id,
    displayText: candidate.display_text,
    medicationName: candidate.medication_name,
    genericName: candidate.generic_name || undefined,
    strength: candidate.strength || undefined,
    dose: candidate.dose || undefined,
    route: candidate.route || undefined,
    frequency: candidate.frequency || undefined,
    startDate: candidate.start_date || undefined,
    prescriber: candidate.prescriber || undefined,
  };
}

function updatePatch(candidate: MedicationReconciliationCandidate) {
  return {
    displayText: candidate.display_text,
    medicationName: candidate.medication_name,
    ...(candidate.generic_name !== null ? { genericName: candidate.generic_name } : {}),
    ...(candidate.strength !== null ? { strength: candidate.strength } : {}),
    ...(candidate.dose !== null ? { dose: candidate.dose } : {}),
    ...(candidate.route !== null ? { route: candidate.route } : {}),
    ...(candidate.frequency !== null ? { frequency: candidate.frequency } : {}),
    ...(candidate.start_date !== null ? { startDate: candidate.start_date } : {}),
    ...(candidate.prescriber !== null ? { prescriber: candidate.prescriber } : {}),
  };
}

export const medicationReconciliationService = {
  list(patientId: string, actor: ProviderContext) {
    assertPermission(actor, "read_clinical");
    return MedicationReconciliationRepository.list(patientId);
  },

  recordCandidate(
    input: RecordMedicationCandidateInput,
    actor: ProviderContext,
    context: ClinicalExecutionContext,
  ) {
    assertPermission(actor, "manage_clinical_record");
    if (input.linkedMedicationId) {
      assertMedicationBelongsToPatient(input.linkedMedicationId, input.patientId);
    }

    const db = getDatabase();
    db.exec("BEGIN IMMEDIATE");
    try {
      const candidate = MedicationReconciliationRepository.record(input, actorRef(actor));
      AuditRepository.log({
        ...auditActor(actor),
        eventType: "medication_candidate_recorded",
        patientId: input.patientId,
        description: `Recorded non-authoritative medication candidate ${candidate.display_text}.`,
        metadata: metadata(context, {
          candidateId: candidate.id,
          sourceType: candidate.source_type,
          sourceSystem: candidate.source_system,
          evidenceType: candidate.evidence_type,
          linkedMedicationId: candidate.linked_medication_id,
        }),
      });
      db.exec("COMMIT");
      return candidate;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  },

  reconcile(
    input: ReconcileMedicationCandidateInput,
    actor: ProviderContext,
    context: ClinicalExecutionContext,
  ) {
    assertPermission(actor, "manage_clinical_record");
    const candidate = MedicationReconciliationRepository.getById(input.candidateId);
    if (!candidate) throw new Error(`Medication candidate not found: ${input.candidateId}`);
    if (candidate.status !== "pending") {
      throw new Error(`Medication candidate ${input.candidateId} is already resolved as ${candidate.status}.`);
    }

    if ((input.decision === "update" || input.decision === "discontinue") && !input.medicationId) {
      throw new Error(`${input.decision} reconciliation requires an authoritative medicationId.`);
    }
    if ((input.decision === "add" || input.decision === "ignore") && input.medicationId) {
      throw new Error(`${input.decision} reconciliation does not accept medicationId.`);
    }
    if (input.medicationId) {
      assertMedicationBelongsToPatient(input.medicationId, candidate.patient_id);
    }

    const db = getDatabase();
    db.exec("BEGIN IMMEDIATE");
    try {
      let medication: any = null;
      const source = medicationSource(candidate);

      if (input.decision === "add") {
        medication = clinicalRecordService.addMedication(addInput(candidate), actor, context, source);
      } else if (input.decision === "update") {
        medication = clinicalRecordService.updateMedication(
          input.medicationId!,
          updatePatch(candidate),
          actor,
          context,
          source,
        );
      } else if (input.decision === "discontinue") {
        medication = clinicalRecordService.updateMedication(
          input.medicationId!,
          {
            status: "discontinued",
            ...(candidate.end_date ? { endDate: candidate.end_date } : {}),
          },
          actor,
          context,
          source,
        );
      }

      const resolved = MedicationReconciliationRepository.resolve(
        candidate.id,
        input.decision,
        medication?.id || input.medicationId || null,
        actorRef(actor),
      );

      AuditRepository.log({
        ...auditActor(actor),
        eventType: "medication_reconciled",
        patientId: candidate.patient_id,
        description: input.decision === "ignore"
          ? `Ignored medication candidate ${candidate.display_text}; authoritative medication state was unchanged.`
          : `Reconciled medication candidate ${candidate.display_text} with decision ${input.decision}.`,
        metadata: metadata(context, {
          candidateId: candidate.id,
          decision: input.decision,
          resultingMedicationId: medication?.id || input.medicationId || null,
        }),
      });

      db.exec("COMMIT");
      return { candidate: resolved, medication };
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  },
};
