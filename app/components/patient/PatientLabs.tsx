"use client";

import { useEffect, useMemo, useState } from "react";
import { type Patient } from "../../domain/patient";
import { calculateMonitoringStatus, type LabObservation } from "../../lib/clinical-protocols";

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
  }, [patient.id]);

  const monitoringItems = useMemo(() => calculateMonitoringStatus(patient.meds, labs), [patient.meds, labs]);
  const overdueCount = monitoringItems.filter(i => i.status === "overdue").length;

  return (
    <div className="labs-container">
      {loadError && (
        <div className="lab-banner alert-banner">
          <div><strong>Unable to load authoritative lab record</strong><p>{loadError}</p></div>
        </div>
      )}

      {overdueCount > 0 ? (
        <div className="lab-banner alert-banner">
          <div>
            <strong><span>⚠️</span> {overdueCount} Medication Surveillance Lab{overdueCount > 1 ? "s" : ""} Overdue</strong>
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
            <strong><span>✓</span> All Medication Surveillance Requirements Current</strong>
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
          <p style={{ padding:"16px", color:"var(--m3-text-secondary)", fontSize:"12px" }}>No specialized routine lab surveillance protocols configured for current medications.</p>
        ) : (
          <table className="lab-table">
            <thead><tr><th>Active Medication</th><th>Required Surveillance</th><th>Frequency</th><th>Last Done</th><th>Status</th><th>Protocol Rationale &amp; Action</th></tr></thead>
            <tbody>{monitoringItems.map((item, index) => (
              <tr key={index}>
                <td><strong>{item.medication}</strong></td>
                <td><span style={{ fontWeight:600 }}>{item.requiredLab}</span></td>
                <td>{item.intervalLabel}</td>
                <td>{item.lastDoneDate ? <div><span>{item.lastDoneDate}</span><small style={{ display:"block", color:"var(--m3-text-secondary)", fontSize:"10.5px" }}>{item.daysElapsed} days ago</small></div> : <span style={{ color:"var(--m3-text-tertiary)" }}>No record</span>}</td>
                <td><span className={`lab-status-badge status-${item.status}`}>{item.status === "overdue" && "⚠️ Overdue"}{item.status === "due-soon" && "⏳ Due soon"}{item.status === "current" && "✓ Current"}</span></td>
                <td><div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:"8px" }}><span style={{ fontSize:"11px", color:"var(--m3-text-secondary)" }}>{item.rationale}</span><button type="button" className="query-card-btn" style={{ padding:"3px 8px", fontSize:"10px" }} onClick={() => onDraftOrder(item.requiredLab)}>＋ Order</button></div></td>
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
        {loading ? (
          <p style={{ padding:"16px", color:"var(--m3-text-secondary)", fontSize:"12px" }}>Loading clinical results…</p>
        ) : labs.length === 0 ? (
          <p style={{ padding:"16px", color:"var(--m3-text-secondary)", fontSize:"12px" }}>No prior lab results recorded in this chart.</p>
        ) : (
          <table className="lab-table">
            <thead><tr><th>Test Name / LOINC</th><th>Collected Date</th><th>Result Value</th><th>Reference Range</th><th>Ordering Provider</th></tr></thead>
            <tbody>{labs.map(lab => (
              <tr key={lab.id}>
                <td><strong>{lab.testName}</strong><small style={{ display:"block", color:"var(--m3-text-secondary)", fontSize:"10.5px" }}>LOINC {lab.code}</small></td>
                <td>{lab.date}</td>
                <td><strong>{lab.value}</strong> {lab.unit !== "multi" && <span>{lab.unit}</span>}{lab.flag && <span className={`lab-flag ${lab.flag}`}>{lab.flag}</span>}</td>
                <td>{lab.referenceRange}</td>
                <td>{lab.orderedBy}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </section>
    </div>
  );
}
