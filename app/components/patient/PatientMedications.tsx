"use client";

import { type Patient } from "../../domain/patient";
import {
  calculateMonitoringStatus,
  patientLabHistory,
} from "../../lib/clinical-protocols";

export default function PatientMedications({
  patient,
  onDraftOrder,
  onOpenPrescribe,
}: {
  patient: Patient;
  onDraftOrder?: (orderName: string) => void;
  onOpenPrescribe?: () => void;
}) {
  const labs = patientLabHistory[patient.id] || [];

  return (
    <section className="card medication-card">
      <div className="card-heading">
        <div>
          <span className="eyebrow">Medication list · Surescripts NCPDP Network</span>
          <h2>Active prescriptions &amp; surveillance</h2>
        </div>
        <button
          type="button"
          className="primary"
          onClick={onOpenPrescribe}
        >
          ＋ Prescribe
        </button>
      </div>
      <div className="med-table">
        {patient.meds.map((medication) => {
          const monitoringItems = calculateMonitoringStatus([medication], labs);
          const protocol = monitoringItems[0];

          return (
            <div className="med-row-wrap" key={medication}>
              <div className="med-row">
                <div className="med-icon">Rx</div>
                <div>
                  <strong>{medication}</strong>
                  <small>Active · Oral</small>
                </div>
                <span>Last reviewed {patient.lastVisit}</span>
                <button type="button">•••</button>
              </div>

              {protocol && (
                <div className={`med-surveillance-tag ${protocol.status}`}>
                  <span>
                    {protocol.status === "overdue" && "⚠️ Protocol Alert: "}
                    {protocol.status === "due-soon" && "⏳ Protocol Notice: "}
                    {protocol.status === "current" && "✓ Surveillance Current: "}
                    <strong>{protocol.requiredLab}</strong>
                    {protocol.lastDoneDate ? ` (Last: ${protocol.lastDoneDate})` : " (Never recorded)"}
                    {" — "}
                    <span>{protocol.intervalLabel}</span>
                  </span>
                  {onDraftOrder && (
                    <button
                      type="button"
                      onClick={() => onDraftOrder(protocol.requiredLab)}
                    >
                      {protocol.status === "overdue" ? "Draft Order" : "Reorder"}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
