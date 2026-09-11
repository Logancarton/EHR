"use client";

import { useEffect, useMemo, useState } from "react";
import { type Patient } from "../../domain/patient";
import { calculateMonitoringStatus, type LabObservation } from "../../lib/clinical-protocols";
import { formatClinicalDate } from "../../lib/clinical-date";
import AsyncSection, { EmptyState } from "../ui/AsyncSection";
import Button from "../ui/Button";
import Icon from "../ui/Icon";

type ObservationRow = {
  id: string;
  category: string;
  code?: string;
  test_name: string;
  effective_at: string;
  value_text: string;
  unit?: string;
  reference_range?: string;
  interpretation?: LabObservation["flag"];
  observed_by?: string;
  acknowledged_at?: string;
};

function toLab(row: ObservationRow): LabObservation {
  return {
    id: row.id,
    testName: row.test_name,
    code: row.code || "",
    date: row.effective_at,
    value: row.value_text,
    unit: row.unit || "",
    referenceRange: row.reference_range || "",
    flag: row.interpretation,
    orderedBy: row.observed_by || "Unknown",
  };
}

export default function PatientLabs({
  patient,
  onDraftOrder,
  onDraftAllOverdue,
  onOpenLabComposer,
}: {
  patient: Patient;
  onDraftOrder: (orderName: string) => void;
  onDraftAllOverdue?: (labs: string[]) => void;
  onOpenLabComposer?: () => void;
}) {
  const [labs, setLabs] = useState<LabObservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Held in state so a failed load has something to retry with. A result table that
  // can only be recovered by navigating away is not a recoverable failure.
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    fetch(`/api/clinical-records?patientId=${encodeURIComponent(patient.id)}`, { signal: controller.signal })
      .then(async response => {
        const payload = await response.json();
        if (!response.ok || !payload.success) throw new Error(payload.error || "Unable to load clinical record");
        const observations = (payload.record?.observations || []) as ObservationRow[];
        setLabs(observations.filter(row => row.category === "laboratory").map(toLab));
      })
      .catch(error => {
        if (error?.name !== "AbortError") setLoadError(error instanceof Error ? error.message : "Unable to load labs");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [patient.id, reloadToken]);

  const monitoringItems = useMemo(() => calculateMonitoringStatus(patient.meds, labs), [patient.meds, labs]);
  const overdueCount = monitoringItems.filter(i => i.status === "overdue").length;

  return (
    <div className="labs-container">
      {overdueCount > 0 ? (
        <div className="lab-banner alert-banner">
          <div>
            <strong><span><Icon name="warning" /></span> {overdueCount} Medication Surveillance Lab{overdueCount > 1 ? "s" : ""} Overdue</strong>
            <p>Provider protocol: Periodic metabolic &amp; organ surveillance required for active psychiatric pharmacotherapy.</p>
          </div>
          <button type="button" onClick={() => {
            const overdueLabs = monitoringItems.filter(i => i.status === "overdue").map(i => i.requiredLab);
            if (onDraftAllOverdue && overdueLabs.length > 0) onDraftAllOverdue(overdueLabs);
            else if (overdueLabs.length > 0) onDraftOrder(overdueLabs[0]);
          }}>＋ Draft Overdue Orders ({overdueCount})</button>
        </div>
      ) : (
        <div className="lab-banner current-banner">
          <div>
            <strong><span><Icon name="check" /></span> All Medication Surveillance Requirements Current</strong>
            <p>Provider protocol: Active psychiatric medications are aligned with surveillance guidelines.</p>
          </div>
          <button type="button" onClick={() => onOpenLabComposer ? onOpenLabComposer() : onDraftOrder("Routine Psychiatric Wellness Panel")}>＋ Routine Order</button>
        </div>
      )}

      <section className="card">
        <div className="card-heading">
          <div><span className="eyebrow">Provider Preference &amp; Protocol</span><h2>Medication Surveillance Schedule</h2></div>
          <span style={{ fontSize:"11px", color:"var(--m3-text-secondary)", fontWeight:500 }}>Protocol: Dr. Logan Carton Standard</span>
        </div>
        {monitoringItems.length === 0 ? (
          <EmptyState message="No specialized routine lab surveillance protocols configured for current medications." />
        ) : (
          <table className="lab-table">
            <thead><tr><th>Active Medication</th><th>Required Surveillance</th><th>Frequency</th><th>Last Done</th><th>Status</th><th>Protocol Rationale &amp; Action</th></tr></thead>
            <tbody>{monitoringItems.map((item, index) => (
              <tr key={index}>
                <td><strong>{item.medication}</strong></td>
                <td><span style={{ fontWeight:600 }}>{item.requiredLab}</span></td>
                <td>{item.intervalLabel}</td>
                <td>{item.lastDoneDate ? <div><span>{formatClinicalDate(item.lastDoneDate)}</span><small style={{ display:"block", color:"var(--m3-text-secondary)", fontSize:"10.5px" }}>{item.daysElapsed} days ago</small></div> : <span style={{ color:"var(--m3-text-tertiary)" }}>No record</span>}</td>
                <td><span className={`lab-status-badge status-${item.status}`}>{item.status === "overdue" && "Overdue"}{item.status === "due-soon" && "Due soon"}{item.status === "current" && "Current"}</span></td>
                <td><div className="lab-protocol-action"><span>{item.rationale}</span><Button size="sm" icon="add" onClick={() => onDraftOrder(item.requiredLab)}>Order</Button></div></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </section>

      <section className="card">
        <div className="card-heading">
          <div><span className="eyebrow">Diagnostic Flowsheet</span><h2>Longitudinal Lab Results</h2></div>
          <button type="button" className="primary" onClick={() => onOpenLabComposer ? onOpenLabComposer() : onDraftOrder("Comprehensive Panel")}>＋ New Lab Order</button>
        </div>
        <AsyncSection
          loading={loading}
          error={loadError}
          isEmpty={labs.length === 0}
          hasLoadedOnce={labs.length > 0}
          loadingMessage="Loading clinical results…"
          emptyMessage="No prior lab results recorded in this chart."
          onRetry={() => setReloadToken((token) => token + 1)}
        >
          <table className="lab-table">
            <thead><tr><th>Test Name / LOINC</th><th>Collected Date</th><th>Result Value</th><th>Reference Range</th><th>Ordering Provider</th></tr></thead>
            <tbody>{labs.map(lab => (
              <tr key={lab.id}>
                <td><strong>{lab.testName}</strong><small style={{ display:"block", color:"var(--m3-text-secondary)", fontSize:"10.5px" }}>LOINC {lab.code}</small></td>
                <td>{formatClinicalDate(lab.date)}</td>
                <td><strong>{lab.value}</strong> {lab.unit !== "multi" && <span>{lab.unit}</span>}{lab.flag && <span className={`lab-flag ${lab.flag}`}>{lab.flag}</span>}</td>
                <td>{lab.referenceRange}</td>
                <td>{lab.orderedBy}</td>
              </tr>
            ))}</tbody>
          </table>
        </AsyncSection>
      </section>
    </div>
  );
}
