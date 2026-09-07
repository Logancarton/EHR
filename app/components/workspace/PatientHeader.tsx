"use client";

import { useEffect, useState } from "react";
import { type Patient, type Section } from "../../domain/patient";
import OrderCartBadge from "../orders/OrderCartBadge";

export default function PatientHeader({
  patient,
  headerDensity = "full",
  onOpenCustomizer,
  stagedOrdersCount = 0,
  onOpenOrderCart,
  onNavigateSection,
  onNavigateView,
}: {
  patient: Patient;
  headerDensity?: "full" | "compact" | "minimal";
  onOpenCustomizer?: () => void;
  stagedOrdersCount?: number;
  onOpenOrderCart?: () => void;
  onNavigateSection?: (section: Section) => void;
  onNavigateView?: (view: "today" | "patient") => void;
}) {
  const [liveStagedOrdersCount, setLiveStagedOrdersCount] = useState(stagedOrdersCount);

  useEffect(() => {
    setLiveStagedOrdersCount(stagedOrdersCount);
  }, [patient.id, stagedOrdersCount]);

  useEffect(() => {
    function handleCartUpdated(event: Event) {
      const detail = (event as CustomEvent<{ patientId: string; remainingCount: number }>).detail;
      if (detail?.patientId === patient.id) {
        setLiveStagedOrdersCount(detail.remainingCount);
      }
    }
    window.addEventListener("ehr-order-cart-updated", handleCartUpdated);
    return () => window.removeEventListener("ehr-order-cart-updated", handleCartUpdated);
  }, [patient.id]);

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
          {onOpenOrderCart && (
            <OrderCartBadge count={liveStagedOrdersCount} onClick={onOpenOrderCart} />
          )}
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
          <button
            type="button"
            className="primary"
            onClick={() => onNavigateSection?.("Encounter")}
          >
            ＋ New encounter
          </button>
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
          {onOpenOrderCart && (
            <OrderCartBadge count={liveStagedOrdersCount} onClick={onOpenOrderCart} />
          )}
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
          <button type="button" onClick={() => onNavigateSection?.("Messages")}>✉ Message</button>
          <button type="button" onClick={() => onNavigateView?.("today")}>📅 Schedule</button>
          <button type="button" className="primary" onClick={() => onNavigateSection?.("Encounter")}>
            ＋ New encounter
          </button>
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
        {onOpenOrderCart && (
          <OrderCartBadge count={liveStagedOrdersCount} onClick={onOpenOrderCart} />
        )}
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
        <button type="button" onClick={() => onNavigateSection?.("Messages")}>✉ Message</button>
        <button type="button" onClick={() => onNavigateView?.("today")}>📅 Schedule</button>
        <button type="button" className="primary" onClick={() => onNavigateSection?.("Encounter")}>
          ＋ New encounter
        </button>
      </div>
    </div>
  );
}
