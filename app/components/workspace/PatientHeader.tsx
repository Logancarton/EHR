"use client";

import { type Patient } from "../../domain/patient";

export default function PatientHeader({
  patient,
  headerDensity = "full",
  onOpenCustomizer,
}: {
  patient: Patient;
  headerDensity?: "full" | "compact" | "minimal";
  onOpenCustomizer?: () => void;
}) {
  if (headerDensity === "minimal") {
    return (
      <div className="patient-header patient-header-minimal">
        <div className="patient-identity">
          <div className="avatar small" title={patient.name}>{patient.initials}</div>
          <div className="patient-name-line">
            <h1>{patient.name}</h1>
            <span className="status-pill">{patient.status}</span>
            <span className="minimal-meta">MRN {patient.mrn} · {patient.age} yrs</span>
          </div>
        </div>
        <div className="patient-actions">
          {onOpenCustomizer && (
            <button
              type="button"
              className="btn-icon-customizer"
              onClick={onOpenCustomizer}
              title="Customize workspace layout"
            >
              ⚙️ Layout
            </button>
          )}
          <button type="button" className="primary">＋ New encounter</button>
        </div>
      </div>
    );
  }

  if (headerDensity === "compact") {
    return (
      <div className="patient-header patient-header-compact">
        <div className="patient-identity">
          <div className="avatar compact" title={patient.name}>{patient.initials}</div>
          <div>
            <div className="patient-name-line">
              <h1>{patient.name}</h1>
              <span className="status-pill">{patient.status}</span>
            </div>
            <p>DOB {patient.dob} · {patient.age} yrs · {patient.pronouns} · MRN {patient.mrn}</p>
          </div>
        </div>
        <div className="patient-actions">
          {onOpenCustomizer && (
            <button
              type="button"
              className="btn-icon-customizer"
              onClick={onOpenCustomizer}
              title="Customize workspace layout"
            >
              ⚙️ Layout
            </button>
          )}
          <button type="button">✉ Message</button>
          <button type="button">📅 Schedule</button>
          <button type="button" className="primary">＋ New encounter</button>
        </div>
      </div>
    );
  }

  return (
    <div className="patient-header">
      <div className="patient-identity">
        <div className="avatar" title={patient.name}>{patient.initials}</div>
        <div>
          <div className="patient-name-line">
            <h1>{patient.name}</h1>
            <span className="status-pill">{patient.status}</span>
          </div>
          <p>
            <span>DOB {patient.dob}</span> · 
            <span> {patient.age} yrs</span> · 
            <span> {patient.pronouns}</span> · 
            <span> MRN {patient.mrn}</span>
          </p>
        </div>
      </div>
      <div className="patient-actions">
        {onOpenCustomizer && (
          <button
            type="button"
            className="btn-icon-customizer"
            onClick={onOpenCustomizer}
            title="Customize workspace layout"
          >
            ⚙️ Layout
          </button>
        )}
        <button type="button">✉ Message</button>
        <button type="button">📅 Schedule</button>
        <button type="button" className="primary">＋ New encounter</button>
      </div>
    </div>
  );
}
