import { PatientRepository, type PatientRecord } from "../repositories/patient-repository";
import { EncounterRepository, type EncounterRecord } from "../repositories/encounter-repository";
import { OrderRepository } from "../repositories/order-repository";
import { MessageRepository } from "../repositories/message-repository";
import { patientLabHistory, calculateMonitoringStatus, type LabObservation, type PatientMonitoringItem } from "../../lib/clinical-protocols";

export type ClinicalSurface =
  | "encounter-scribe"
  | "order-cart"
  | "patient-message"
  | "longitudinal-query"
  | "general";

export type UserRole = "provider" | "clinical-assistant" | "staff";

export interface AssembledClinicalContext {
  patient: {
    id: string;
    name: string;
    mrn: string;
    dob: string;
    age: number;
    pronouns: string;
    alert?: string;
  };
  surface: ClinicalSurface;
  userRole: UserRole;
  allergies: string[];
  activeDiagnoses: string[];
  activeMedications: string[];
  vitals: { bp?: string; hr?: number; wt?: string; bmi?: string };
  recentLabs: Array<{
    id: string;
    testName: string;
    date: string;
    value: string;
    unit: string;
    flag?: string;
  }>;
  monitoringProtocols: PatientMonitoringItem[];
  recentEncounters: Array<{
    encounterId: string;
    date: string;
    type: string;
    chiefComplaint: string;
    assessment: string;
    plan: string;
    provenanceRef: string;
  }>;
  recentOrders?: Array<{
    id: string;
    name: string;
    type: string;
    status: string;
    createdAt: string;
  }>;
  recentMessages?: Array<{
    id: string;
    subject: string;
    category: string;
    urgency: string;
    summary?: string;
  }>;
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

export const ContextAssembler = {
  assemble(options: AssembleContextOptions): AssembledClinicalContext | null {
    const {
      patientId,
      surface = "general",
      userRole = "provider",
      tokenBudget = 2500,
      searchQuery,
    } = options;

    const patient = PatientRepository.getById(patientId);
    if (!patient) return null;

    const provenanceMap: Record<string, string> = {
      patient: `patients/${patient.id}`,
    };

    // 1. Allergies & Vitals (High clinical safety priority)
    const allergies = patient.allergies || [];
    const vitals = patient.vitals || {};

    // 2. Active Diagnoses & Meds (Filtered by role)
    let activeDiagnoses: string[] = [];
    let activeMedications: string[] = [];

    if (userRole === "provider" || userRole === "clinical-assistant") {
      activeDiagnoses = patient.diagnoses || [];
      activeMedications = patient.meds || [];
    }

    // 3. Labs & Surveillance Protocols
    const allLabs: LabObservation[] = patientLabHistory[patient.id] || [];
    const recentLabs = allLabs.slice(0, surface === "order-cart" ? 10 : 5).map((l) => {
      provenanceMap[`lab-${l.id}`] = `labs/${l.id}`;
      return {
        id: l.id,
        testName: l.testName,
        date: l.date,
        value: l.value,
        unit: l.unit,
        flag: l.flag,
      };
    });

    const monitoringProtocols = calculateMonitoringStatus(patient.meds, allLabs);

    // 4. Encounters (Role & Surface Scoped)
    let recentEncounters: AssembledClinicalContext["recentEncounters"] = [];
    if (userRole === "provider") {
      const dbEncounters = EncounterRepository.getByPatientId(patient.id);
      const limit = surface === "encounter-scribe" ? 2 : surface === "longitudinal-query" ? 5 : 3;

      recentEncounters = dbEncounters.slice(0, limit).map((e) => {
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

    // 5. Orders (if applicable to surface)
    let recentOrders: AssembledClinicalContext["recentOrders"];
    if (surface === "order-cart" || surface === "general") {
      const orders = OrderRepository.getByPatient(patient.id);
      recentOrders = orders.slice(0, 5).map((o) => {
        provenanceMap[`order-${o.id}`] = `orders/${o.id}`;
        return {
          id: o.id,
          name: o.name,
          type: o.type,
          status: o.status,
          createdAt: o.createdAt,
        };
      });
    }

    // 6. Messages (if applicable to surface)
    let recentMessages: AssembledClinicalContext["recentMessages"];
    if (surface === "patient-message" || surface === "general") {
      const threads = MessageRepository.getThreadsByPatient(patient.id);
      recentMessages = threads.slice(0, 3).map((t) => {
        provenanceMap[`msg-thread-${t.id}`] = `messages/threads/${t.id}`;
        return {
          id: t.id,
          subject: t.subject,
          category: t.category,
          urgency: t.urgency,
          summary: t.aiTriageSummary || undefined,
        };
      });
    }

    // 7. Estimate tokens and apply truncation if exceeding budget
    const bundle: AssembledClinicalContext = {
      patient: {
        id: patient.id,
        name: patient.name,
        mrn: patient.mrn,
        dob: patient.dob,
        age: patient.age,
        pronouns: patient.pronouns,
        alert: patient.alert,
      },
      surface,
      userRole,
      allergies,
      activeDiagnoses,
      activeMedications,
      vitals,
      recentLabs,
      monitoringProtocols,
      recentEncounters,
      recentOrders,
      recentMessages,
      provenanceMap,
      estimatedTokens: 0,
      isTruncated: false,
      assembledAt: new Date().toISOString(),
    };

    const rawJson = JSON.stringify(bundle);
    const approxTokens = Math.ceil(rawJson.length / 4);
    bundle.estimatedTokens = approxTokens;

    if (approxTokens > tokenBudget && bundle.recentEncounters.length > 1) {
      bundle.recentEncounters = bundle.recentEncounters.slice(0, 1);
      bundle.isTruncated = true;
      bundle.estimatedTokens = Math.ceil(JSON.stringify(bundle).length / 4);
    }

    return bundle;
  },
};
