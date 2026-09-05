"use client";

import { type Patient } from "../../domain/patient";
import {
  calculateMonitoringStatus,
  patientLabHistory,
} from "../../lib/clinical-protocols";

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
  const labs = patientLabHistory[patient.id] || [];
  const monitoringItems = calculateMonitoringStatus(patient.meds, labs);
  const overdueCount = monitoringItems.filter((i) => i.status === "overdue").length;

  return (
    <div className="labs-container">
      {/* Surveillance Summary Banner */}
      {overdueCount > 0 ? (
        <div className="lab-banner alert-banner">
          <div>
            <strong>
              <span>⚠️</span> {overdueCount} Medication Surveillance Lab{overdueCount > 1 ? "s" : ""} Overdue
            </strong>
            <p>
              Provider protocol: Periodic metabolic &amp; organ surveillance required for active psychiatric pharmacotherapy.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              const overdueLabs = monitoringItems
                .filter((i) => i.status === "overdue")
                .map((i) => i.requiredLab);
              if (onDraftAllOverdue && overdueLabs.length > 0) {
                onDraftAllOverdue(overdueLabs);
              } else if (overdueLabs.length > 0) {
                onDraftOrder(overdueLabs[0]);
              }
            }}
          >
            ＋ Draft Overdue Orders ({overdueCount})
          </button>
        </div>
      ) : (
        <div className="lab-banner current-banner">
          <div>
            <strong>
              <span>✓</span> All Medication Surveillance Requirements Current
            </strong>
            <p>Provider protocol: Active psychiatric medications are aligned with surveillance guidelines.</p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (onOpenLabComposer) onOpenLabComposer();
              else onDraftOrder("Routine Psychiatric Wellness Panel");
            }}
          >
            ＋ Routine Order
          </button>
        </div>
      )}

      {/* Surveillance Protocols Table */}
      <section className="card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">Provider Preference &amp; Protocol</span>
            <h2>Medication Surveillance Schedule</h2>
          </div>
          <span style={{ fontSize: "11px", color: "var(--m3-text-secondary)", fontWeight: 500 }}>
            Protocol: Dr. Logan Carton Standard
          </span>
        </div>

        {monitoringItems.length === 0 ? (
          <p style={{ padding: "16px", color: "var(--m3-text-secondary)", fontSize: "12px" }}>
            No specialized routine lab surveillance protocols configured for current medications.
          </p>
        ) : (
          <table className="lab-table">
            <thead>
              <tr>
                <th>Active Medication</th>
                <th>Required Surveillance</th>
                <th>Frequency</th>
                <th>Last Done</th>
                <th>Status</th>
                <th>Protocol Rationale &amp; Action</th>
              </tr>
            </thead>
            <tbody>
              {monitoringItems.map((item, index) => (
                <tr key={index}>
                  <td>
                    <strong>{item.medication}</strong>
                  </td>
                  <td>
                    <span style={{ fontWeight: 600 }}>{item.requiredLab}</span>
                  </td>
                  <td>{item.intervalLabel}</td>
                  <td>
                    {item.lastDoneDate ? (
                      <div>
                        <span>{item.lastDoneDate}</span>
                        <small style={{ display: "block", color: "var(--m3-text-secondary)", fontSize: "10.5px" }}>
                          {item.daysElapsed} days ago
                        </small>
                      </div>
                    ) : (
                      <span style={{ color: "var(--m3-text-tertiary)" }}>No record</span>
                    )}
                  </td>
                  <td>
                    <span className={`lab-status-badge status-${item.status}`}>
                      {item.status === "overdue" && "⚠️ Overdue"}
                      {item.status === "due-soon" && "⏳ Due soon"}
                      {item.status === "current" && "✓ Current"}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                      <span style={{ fontSize: "11px", color: "var(--m3-text-secondary)" }}>{item.rationale}</span>
                      <button
                        type="button"
                        className="query-card-btn"
                        style={{ padding: "3px 8px", fontSize: "10px" }}
                        onClick={() => onDraftOrder(item.requiredLab)}
                      >
                        ＋ Order
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Longitudinal Results Table */}
      <section className="card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">Diagnostic Flowsheet</span>
            <h2>Longitudinal Lab Results</h2>
          </div>
          <button
            type="button"
            className="primary"
            onClick={() => (onOpenLabComposer ? onOpenLabComposer() : onDraftOrder("Comprehensive Panel"))}
          >
            ＋ New Lab Order
          </button>
        </div>

        {labs.length === 0 ? (
          <p style={{ padding: "16px", color: "var(--m3-text-secondary)", fontSize: "12px" }}>
            No prior lab results recorded in this chart.
          </p>
        ) : (
          <table className="lab-table">
            <thead>
              <tr>
                <th>Test Name / LOINC</th>
                <th>Collected Date</th>
                <th>Result Value</th>
                <th>Reference Range</th>
                <th>Ordering Provider</th>
              </tr>
            </thead>
            <tbody>
              {labs.map((lab) => (
                <tr key={lab.id}>
                  <td>
                    <strong>{lab.testName}</strong>
                    <small style={{ display: "block", color: "var(--m3-text-secondary)", fontSize: "10.5px" }}>
                      LOINC {lab.code}
                    </small>
                  </td>
                  <td>{lab.date}</td>
                  <td>
                    <strong>{lab.value}</strong> {lab.unit !== "multi" && <span>{lab.unit}</span>}
                    {lab.flag && (
                      <span className={`lab-flag ${lab.flag}`}>
                        {lab.flag}
                      </span>
                    )}
                  </td>
                  <td>{lab.referenceRange}</td>
                  <td>{lab.orderedBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
