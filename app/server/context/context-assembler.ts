import type { MedicationRecord } from "../../domain/clinical-records";
import type { MedicationPrescriptionReview } from "../../domain/medication-prescription-intent";
import { buildMedicationReconciliationReviews } from "../../domain/medication-reconciliation-intelligence";
import { PatientRepository } from "../repositories/patient-repository";
import { EncounterRepository } from "../repositories/encounter-repository";
import { OrderRepository } from "../repositories/order-repository";
import { MessageRepository } from "../repositories/message-repository";
import { ClinicalRecordRepository } from "../repositories/clinical-record-repository";
import { ClinicalSearchRepository } from "../repositories/clinical-search-repository";
import { ChartCommunicationRepository } from "../repositories/chart-communication-repository";
import { MedicationReconciliationRepository } from "../repositories/medication-reconciliation-repository";
import { calculateMonitoringStatus, type LabObservation, type PatientMonitoringItem } from "../../lib/clinical-protocols";

export type ClinicalSurface =
  | "encounter-scribe"
  | "order-cart"
  | "patient-message"
  | "longitudinal-query"
  | "medication-review"
  | "general";

export type UserRole = "provider" | "clinical-assistant" | "staff";

export interface AssembledClinicalContext {
  patient: { id: string; name: string; mrn: string; dob: string; age: number; pronouns: string; alert?: string };
  surface: ClinicalSurface;
  userRole: UserRole;
  allergies: string[];
  activeDiagnoses: string[];
  activeMedications: string[];
  pendingMedicationCandidates?: Array<{
    authority: "evidence";
    candidateId: string;
    status: "pending";
    source: {
      type: string;
      system: string;
      ref: string | null;
      evidenceType: string;
    };
    rawEvidenceText: string;
    interpretation: {
      displayText: string;
      medicationName: string;
      genericName: string | null;
      strength: string | null;
      dose: string | null;
      route: string | null;
      frequency: string | null;
      startDate: string | null;
      endDate: string | null;
      prescriber: string | null;
    };
    observedAt: string | null;
    createdAt: string;
    linkedMedicationId: string | null;
    advisory: {
      authority: "advisory";
      matchConfidence: "likely" | "possible" | "unclear";
      suggestedMedicationId: string | null;
      suggestedMedicationDisplay: string | null;
      conflictSignal: string;
      deltas: string[];
    };
    provenanceRef: string;
  }>;
  pendingPrescriptionIntents?: Array<{
    authority: "proposal";
    orderId: string;
    status: string;
    source: string;
    intent: {
      medicationName: string;
      genericName?: string;
      strength?: string;
      dose?: string;
      route?: string;
      frequency?: string;
      quantity?: number;
      daysSupply?: number;
      refills?: number;
      sig?: string;
      indication?: string;
      associatedMedicationRecordId?: string;
    };
    validation: Array<{ code: string; severity: string; message: string }>;
    advisory: {
      authority: "advisory";
      impact: string;
      matchConfidence: string;
      medicationId: string | null;
      medicationDisplay: string | null;
      summary: string;
      alternatives: Array<{ medicationId: string; displayText: string }>;
    };
    provenanceRef: string;
  }>;
  vitals: { bp?: string; hr?: number; wt?: string; bmi?: string };
  recentLabs: Array<{ id: string; testName: string; date: string; value: string; unit: string; flag?: string; acknowledgedAt?: string }>;
  monitoringProtocols: PatientMonitoringItem[];
  recentEncounters: Array<{ encounterId: string; date: string; type: string; chiefComplaint: string; assessment: string; plan: string; provenanceRef: string }>;
  searchMatches?: Array<{ encounterId: string; date: string; chiefComplaint: string; snippet: string; provenanceRef: string }>;
  recentOrders?: Array<{ id: string; name: string; type: string; status: string; createdAt: string }>;
  recentMessages?: Array<{ id: string; subject: string; category: string; urgency: string; summary?: string }>;
  chartedCommunications?: Array<{ id: string; type: string; title: string; body: string; createdAt: string; sourceRef: string }>;
  provenanceMap: Record<string, string>;
  estimatedTokens: number;
  isTruncated: boolean;
  assembledAt: string;
}

export interface AssembleContextOptions {
  patientId: string;
  surface?: ClinicalSurface;
  userRole?: UserRole;
  tokenBudget?: number;
  searchQuery?: string;
}

function vitalProjection(rows: any[]) {
  const result: { bp?: string; hr?: number; wt?: string; bmi?: string } = {};
  for (const r of rows) {
    const code = String(r.code || "").toLowerCase();
    if (!result.bp && (code === "bp" || code.includes("blood-pressure"))) result.bp = r.value_text;
    if (result.hr === undefined && (code === "hr" || code.includes("pulse"))) result.hr = Number(r.value_num ?? r.value_text);
    if (!result.wt && (code === "wt" || code.includes("weight"))) result.wt = r.value_text;
    if (!result.bmi && code === "bmi") result.bmi = r.value_text;
  }
  return result;
}

function estimateTokens(bundle: AssembledClinicalContext): number {
  return Math.ceil(JSON.stringify(bundle).length / 4);
}

function medicationEvidenceLimit(surface: ClinicalSurface): number {
  if (surface === "medication-review") return 10;
  if (surface === "longitudinal-query") return 5;
  if (surface === "encounter-scribe" || surface === "order-cart") return 3;
  return 2;
}

function surfaceUsesMedicationEvidence(surface: ClinicalSurface): boolean {
  return surface === "medication-review"
    || surface === "longitudinal-query"
    || surface === "encounter-scribe"
    || surface === "order-cart"
    || surface === "general";
}

function prescriptionIntentsForContext(
  patientId: string,
  surface: ClinicalSurface,
  userRole: UserRole,
  provenanceMap: Record<string, string>,
): AssembledClinicalContext["pendingPrescriptionIntents"] {
  if (!(userRole === "provider" || userRole === "clinical-assistant")) return undefined;
  if (!(surface === "order-cart" || surface === "medication-review" || surface === "general" || surface === "longitudinal-query")) return undefined;

  const limit = surface === "order-cart" || surface === "medication-review" ? 5 : 3;
  return OrderRepository.getByPatient(patientId)
    .filter((order) => order.type === "medication" && order.status !== "transmitted")
    .slice(0, limit)
    .flatMap((order) => {
      const review = order.details?.prescriptionReview as MedicationPrescriptionReview | undefined;
      if (!review?.intent || !review?.truthImpact) return [];
      const provenanceRef = `orders/${order.id}`;
      provenanceMap[`prescription-intent-${order.id}`] = provenanceRef;
      return [{
        authority: "proposal" as const,
        orderId: order.id,
        status: order.status,
        source: review.intent.source,
        intent: {
          medicationName: review.intent.medicationName,
          genericName: review.intent.genericName,
          strength: review.intent.strength,
          dose: review.intent.dose,
          route: review.intent.route,
          frequency: review.intent.frequency,
          quantity: review.intent.quantity,
          daysSupply: review.intent.daysSupply,
          refills: review.intent.refills,
          sig: review.intent.sig,
          indication: review.intent.indication,
          associatedMedicationRecordId: review.intent.associatedMedicationRecordId,
        },
        validation: review.validationIssues.map((issue) => ({
          code: issue.code,
          severity: issue.severity,
          message: issue.message,
        })),
        advisory: {
          authority: "advisory" as const,
          impact: review.truthImpact.kind,
          matchConfidence: review.truthImpact.confidence,
          medicationId: review.truthImpact.medicationId,
          medicationDisplay: review.truthImpact.medicationDisplay,
          summary: review.truthImpact.summary,
          alternatives: review.truthImpact.alternatives,
        },
        provenanceRef,
      }];
    });
}

export const ContextAssembler = {
  assemble(options: AssembleContextOptions): AssembledClinicalContext | null {
    const { patientId, surface = "general", userRole = "provider", tokenBudget = 2500 } = options;
    const patient = PatientRepository.getById(patientId);
    if (!patient) return null;

    const provenanceMap: Record<string, string> = { patient: `patients/${patient.id}` };

    const allergyRows = ClinicalRecordRepository.allergies(patient.id).filter(r => r.status === "active");
    const problemRows = ClinicalRecordRepository.problems(patient.id).filter(r => r.status === "active");
    const allMedicationRows = ClinicalRecordRepository.medications(patient.id) as MedicationRecord[];
    const medicationRows = allMedicationRows.filter(r => r.status === "active");
    const vitalRows = ClinicalRecordRepository.observations(patient.id, "vital-signs", 20);
    const labRows = ClinicalRecordRepository.observations(patient.id, "laboratory", surface === "order-cart" ? 50 : 25);

    const allergies = allergyRows.map(r => String(r.substance));
    const activeDiagnoses = userRole === "provider" || userRole === "clinical-assistant"
      ? problemRows.map(r => String(r.display_text)) : [];
    const activeMedications = userRole === "provider" || userRole === "clinical-assistant"
      ? medicationRows.map(r => String(r.display_text)) : [];
    const vitals = vitalProjection(vitalRows);

    allergyRows.forEach(r => provenanceMap[`allergy-${r.id}`] = `allergies/${r.id}`);
    problemRows.forEach(r => provenanceMap[`problem-${r.id}`] = `problems/${r.id}`);
    medicationRows.forEach(r => provenanceMap[`medication-${r.id}`] = `medications/${r.id}`);
    vitalRows.forEach(r => provenanceMap[`observation-${r.id}`] = `observations/${r.id}`);

    let pendingMedicationCandidates: AssembledClinicalContext["pendingMedicationCandidates"];
    if (
      surfaceUsesMedicationEvidence(surface)
      && (userRole === "provider" || userRole === "clinical-assistant")
    ) {
      const pending = MedicationReconciliationRepository.list(patient.id, "pending")
        .slice(0, medicationEvidenceLimit(surface));
      pendingMedicationCandidates = buildMedicationReconciliationReviews(pending, allMedicationRows).map((review) => {
        const candidate = review.candidate;
        const provenanceRef = `medication-candidates/${candidate.id}`;
        provenanceMap[`medication-candidate-${candidate.id}`] = provenanceRef;
        return {
          authority: "evidence" as const,
          candidateId: candidate.id,
          status: "pending" as const,
          source: {
            type: candidate.source_type,
            system: candidate.source_system,
            ref: candidate.source_ref,
            evidenceType: candidate.evidence_type,
          },
          rawEvidenceText: candidate.raw_evidence_text,
          interpretation: {
            displayText: candidate.display_text,
            medicationName: candidate.medication_name,
            genericName: candidate.generic_name,
            strength: candidate.strength,
            dose: candidate.dose,
            route: candidate.route,
            frequency: candidate.frequency,
            startDate: candidate.start_date,
            endDate: candidate.end_date,
            prescriber: candidate.prescriber,
          },
          observedAt: candidate.observed_at,
          createdAt: candidate.created_at,
          linkedMedicationId: candidate.linked_medication_id,
          advisory: {
            authority: "advisory" as const,
            matchConfidence: review.suggestion.confidence,
            suggestedMedicationId: review.suggestion.medicationId,
            suggestedMedicationDisplay: review.suggestion.medicationDisplay,
            conflictSignal: review.conflictSignal,
            deltas: review.deltas.map((delta) => delta.summary),
          },
          provenanceRef,
        };
      });
    }

    const pendingPrescriptionIntents = prescriptionIntentsForContext(patient.id, surface, userRole, provenanceMap);

    const allLabs: LabObservation[] = labRows.map(r => ({
      id: r.id,
      testName: r.test_name,
      code: r.code || "",
      date: r.effective_at,
      value: r.value_text,
      unit: r.unit || "",
      referenceRange: r.reference_range || "",
      flag: r.interpretation || undefined,
      orderedBy: r.observed_by || "Unknown",
    }));

    const recentLabs = labRows.slice(0, surface === "order-cart" ? 10 : 5).map(r => {
      provenanceMap[`lab-${r.id}`] = `observations/${r.id}`;
      return {
        id: r.id,
        testName: r.test_name,
        date: r.effective_at,
        value: r.value_text,
        unit: r.unit || "",
        flag: r.interpretation || undefined,
        acknowledgedAt: r.acknowledged_at || undefined,
      };
    });

    const monitoringProtocols = calculateMonitoringStatus(activeMedications, allLabs);

    let recentEncounters: AssembledClinicalContext["recentEncounters"] = [];
    if (userRole === "provider") {
      const limit = surface === "encounter-scribe" ? 2 : surface === "longitudinal-query" ? 5 : 3;
      recentEncounters = EncounterRepository.getByPatientId(patient.id).slice(0, limit).map(e => {
        const ref = `encounters/${e.id}`;
        provenanceMap[`enc-${e.id}`] = ref;
        return {
          encounterId: e.id,
          date: e.date,
          type: e.type,
          chiefComplaint: e.chiefComplaint,
          assessment: e.assessment.slice(0, 300),
          plan: e.plan.slice(0, 300),
          provenanceRef: ref,
        };
      });
    }

    let searchMatches: AssembledClinicalContext["searchMatches"];
    const boundedSearchQuery = options.searchQuery?.trim().slice(0, 500);
    if (surface === "longitudinal-query" && userRole === "provider" && boundedSearchQuery) {
      searchMatches = ClinicalSearchRepository.searchEncounters(boundedSearchQuery, patient.id, 5).map(match => {
        const ref = `encounters/${match.encounterId}`;
        provenanceMap[`search-enc-${match.encounterId}`] = ref;
        return {
          encounterId: match.encounterId,
          date: match.date,
          chiefComplaint: match.chiefComplaint,
          snippet: match.snippet.slice(0, 600),
          provenanceRef: ref,
        };
      });
    }

    let recentOrders: AssembledClinicalContext["recentOrders"];
    if (surface === "order-cart" || surface === "general") {
      recentOrders = OrderRepository.getByPatient(patient.id).slice(0, 5).map(o => {
        provenanceMap[`order-${o.id}`] = `orders/${o.id}`;
        return { id: o.id, name: o.name, type: o.type, status: o.status, createdAt: o.createdAt };
      });
    }

    let recentMessages: AssembledClinicalContext["recentMessages"];
    if (surface === "patient-message" || surface === "general") {
      recentMessages = MessageRepository.getThreadsByPatient(patient.id).slice(0, 3).map(t => {
        provenanceMap[`msg-thread-${t.id}`] = `messages/threads/${t.id}`;
        return { id: t.id, subject: t.subject, category: t.category, urgency: t.urgency, summary: t.aiTriageSummary || undefined };
      });
    }

    let chartedCommunications: AssembledClinicalContext["chartedCommunications"];
    if (userRole === "provider" || userRole === "clinical-assistant") {
      const rows = ChartCommunicationRepository.listByPatient(patient.id, surface === "longitudinal-query" ? 10 : 5);
      chartedCommunications = rows.map(row => {
        const ref = `chart-communications/${row.id}`;
        provenanceMap[`charted-communication-${row.id}`] = ref;
        return {
          id: row.id,
          type: row.communicationType,
          title: row.title,
          body: row.body.slice(0, surface === "longitudinal-query" ? 1200 : 600),
          createdAt: row.createdAt,
          sourceRef: row.sourceRef,
        };
      });
    }

    const bundle: AssembledClinicalContext = {
      patient: { id: patient.id, name: patient.name, mrn: patient.mrn, dob: patient.dob, age: patient.age, pronouns: patient.pronouns, alert: patient.alert },
      surface, userRole, allergies, activeDiagnoses, activeMedications, pendingMedicationCandidates, pendingPrescriptionIntents, vitals,
      recentLabs, monitoringProtocols, recentEncounters, searchMatches, recentOrders, recentMessages, chartedCommunications,
      provenanceMap, estimatedTokens: 0, isTruncated: false, assembledAt: new Date().toISOString(),
    };

    bundle.estimatedTokens = estimateTokens(bundle);
    if (bundle.estimatedTokens > tokenBudget && bundle.recentEncounters.length > 1) {
      bundle.recentEncounters = bundle.recentEncounters.slice(0, 1);
      bundle.isTruncated = true;
      bundle.estimatedTokens = estimateTokens(bundle);
    }
    if (bundle.estimatedTokens > tokenBudget && bundle.searchMatches && bundle.searchMatches.length > 2) {
      bundle.searchMatches = bundle.searchMatches.slice(0, 2);
      bundle.isTruncated = true;
      bundle.estimatedTokens = estimateTokens(bundle);
    }
    if (bundle.estimatedTokens > tokenBudget && bundle.chartedCommunications && bundle.chartedCommunications.length > 2) {
      bundle.chartedCommunications = bundle.chartedCommunications.slice(0, 2);
      bundle.isTruncated = true;
      bundle.estimatedTokens = estimateTokens(bundle);
    }
    if (bundle.estimatedTokens > tokenBudget && bundle.pendingMedicationCandidates && bundle.pendingMedicationCandidates.length > 2) {
      bundle.pendingMedicationCandidates = bundle.pendingMedicationCandidates.slice(0, 2);
      bundle.isTruncated = true;
      bundle.estimatedTokens = estimateTokens(bundle);
    }
    if (bundle.estimatedTokens > tokenBudget && bundle.pendingPrescriptionIntents && bundle.pendingPrescriptionIntents.length > 2) {
      bundle.pendingPrescriptionIntents = bundle.pendingPrescriptionIntents.slice(0, 2);
      bundle.isTruncated = true;
      bundle.estimatedTokens = estimateTokens(bundle);
    }
    if (bundle.estimatedTokens > tokenBudget && bundle.pendingMedicationCandidates && bundle.pendingMedicationCandidates.length > 1) {
      bundle.pendingMedicationCandidates = bundle.pendingMedicationCandidates.slice(0, 1);
      bundle.isTruncated = true;
      bundle.estimatedTokens = estimateTokens(bundle);
    }
    if (bundle.estimatedTokens > tokenBudget && bundle.pendingPrescriptionIntents && bundle.pendingPrescriptionIntents.length > 1) {
      bundle.pendingPrescriptionIntents = bundle.pendingPrescriptionIntents.slice(0, 1);
      bundle.isTruncated = true;
      bundle.estimatedTokens = estimateTokens(bundle);
    }
    return bundle;
  },
};
