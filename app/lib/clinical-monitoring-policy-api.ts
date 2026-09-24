import type {
  MedicationProtocol,
  MonitoringPolicyOverride,
} from "./clinical-protocols";

export type MonitoringPolicyScope = "practice" | "provider" | "patient";

export type ClinicalMonitoringPolicyState = {
  organizationId: string;
  membershipRole: "owner" | "manager" | "member";
  patientId: string | null;
  canEditPractice: boolean;
  canEditProvider: boolean;
  canEditPatient: boolean;
  systemRules: MedicationProtocol[];
  practiceRules: MedicationProtocol[];
  providerRules: MedicationProtocol[];
  effectiveRules: MedicationProtocol[];
  practiceOverrides: MonitoringPolicyOverride[];
  providerOverrides: MonitoringPolicyOverride[];
  patientOverrides: MonitoringPolicyOverride[];
};

export const CLINICAL_MONITORING_POLICY_CHANGED_EVENT =
  "ehr:clinical-monitoring-policy-changed";

export function announceClinicalMonitoringPolicyChange(detail?: {
  patientId?: string;
  scope?: MonitoringPolicyScope;
}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(CLINICAL_MONITORING_POLICY_CHANGED_EVENT, { detail }),
  );
}

async function decode(response: Response): Promise<any> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(payload.error || "Clinical monitoring policy request failed.");
  }
  return payload;
}

export const clinicalMonitoringPolicyApi = {
  async get(patientId?: string): Promise<ClinicalMonitoringPolicyState> {
    const query = patientId ? `?patientId=${encodeURIComponent(patientId)}` : "";
    const response = await fetch(`/api/clinical-monitoring-policies${query}`, {
      cache: "no-store",
    });
    const payload = await decode(response);
    return payload.state as ClinicalMonitoringPolicyState;
  },

  async save(input: {
    scope: MonitoringPolicyScope;
    patientId?: string;
    ruleId: string;
    intervalDays: number;
    dueSoonDays: number;
    overdueGraceDays: number;
    enabled: boolean;
    reason?: string;
  }): Promise<ClinicalMonitoringPolicyState> {
    const response = await fetch("/api/clinical-monitoring-policies", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    const payload = await decode(response);
    announceClinicalMonitoringPolicyChange({
      patientId: input.patientId,
      scope: input.scope,
    });
    return payload.state as ClinicalMonitoringPolicyState;
  },

  async reset(input: {
    scope: MonitoringPolicyScope;
    patientId?: string;
    ruleId: string;
  }): Promise<ClinicalMonitoringPolicyState> {
    const params = new URLSearchParams({ scope: input.scope, ruleId: input.ruleId });
    if (input.patientId) params.set("patientId", input.patientId);
    const response = await fetch(`/api/clinical-monitoring-policies?${params.toString()}`, {
      method: "DELETE",
    });
    const payload = await decode(response);
    announceClinicalMonitoringPolicyChange({
      patientId: input.patientId,
      scope: input.scope,
    });
    return payload.state as ClinicalMonitoringPolicyState;
  },
};
