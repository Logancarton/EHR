import { PatientRepository } from "../repositories/patient-repository";
import { EncounterRepository } from "../repositories/encounter-repository";
import { OrderRepository } from "../repositories/order-repository";
import { MessageRepository } from "../repositories/message-repository";
import { ClinicalRecordRepository } from "../repositories/clinical-record-repository";
import { ChartCommunicationRepository } from "../repositories/chart-communication-repository";
import { calculateMonitoringStatus, type LabObservation, type PatientMonitoringItem } from "../../lib/clinical-protocols";

export type ClinicalSurface =
  | "encounter-scribe"
  | "order-cart"
  | "patient-message"
  | "longitudinal-query"
  | "general";

export type UserRole = "provider" | "clinical-assistant" | "staff";

export interface AssembledClinicalContext {
  patient: { id: string; name: string; mrn: string; dob: string; age: number; pronouns: string; alert?: string };
  surface: ClinicalSurface;
  userRole: UserRole;
  allergies: string[];
  activeDiagnoses: string[];
  activeMedications: string[];
  vitals: { bp?: string; hr?: number; wt?: string; bmi?: string };
  recentLabs: Array<{ id: string; testName: string; date: string; value: string; unit: string; flag?: string; acknowledgedAt?: string }>;
  monitoringProtocols: PatientMonitoringItem[];
  recentEncounters: Array<{ encounterId: string; date: string; type: string; chiefComplaint: string; assessment: string; plan: string; provenanceRef: string }>;
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

export const ContextAssembler = {
  assemble(options: AssembleContextOptions): AssembledClinicalContext | null {
    const { patientId, surface = "general", userRole = "provider", tokenBudget = 2500 } = options;
    const patient = PatientRepository.getById(patientId);
    if (!patient) return null;

    const provenanceMap: Record<string, string> = { patient: `patients/${patient.id}` };

    const allergyRows = ClinicalRecordRepository.allergies(patient.id).filter(r => r.status === "active");
    const problemRows = ClinicalRecordRepository.problems(patient.id).filter(r => r.status === "active");
    const medicationRows = ClinicalRecordRepository.medications(patient.id).filter(r => r.status === "active");
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
      surface, userRole, allergies, activeDiagnoses, activeMedications, vitals,
      recentLabs, monitoringProtocols, recentEncounters, recentOrders, recentMessages, chartedCommunications,
      provenanceMap, estimatedTokens: 0, isTruncated: false, assembledAt: new Date().toISOString(),
    };

    bundle.estimatedTokens = Math.ceil(JSON.stringify(bundle).length / 4);
    if (bundle.estimatedTokens > tokenBudget && bundle.recentEncounters.length > 1) {
      bundle.recentEncounters = bundle.recentEncounters.slice(0, 1);
      bundle.isTruncated = true;
      bundle.estimatedTokens = Math.ceil(JSON.stringify(bundle).length / 4);
    }
    if (bundle.estimatedTokens > tokenBudget && bundle.chartedCommunications && bundle.chartedCommunications.length > 2) {
      bundle.chartedCommunications = bundle.chartedCommunications.slice(0, 2);
      bundle.isTruncated = true;
      bundle.estimatedTokens = Math.ceil(JSON.stringify(bundle).length / 4);
    }
    return bundle;
  },
};