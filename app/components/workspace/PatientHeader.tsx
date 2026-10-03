"use client";

import { useEffect, useMemo, useState } from "react";
import { type Patient, type Section } from "../../domain/patient";
import { clinicalRecordApi } from "../../lib/clinical-record-api";
import type { AllergyRecord } from "../../domain/clinical-records";
import {
  WORKSPACE_PATIENT_UPDATED_EVENT,
  subscribeWorkspaceEvent,
} from "../../lib/workspace-events";
import ClinicalFactsBar from "../patient/ClinicalFactsBar";
import PatientPhotoModal from "../patient/PatientPhotoModal";
import {
  SYNTHETIC_PATIENT_PROFILES,
  SYNTHETIC_PATIENT_PORTRAITS,
} from "../../lib/patient-id-card-generator";

export default function PatientHeader({
  patient,
  headerDensity = "full",
  currentSection: _currentSection,
  onOpenCustomizer,
  stagedOrdersCount: _stagedOrdersCount,
  onOpenOrderCart: _onOpenOrderCart,
  onNavigateSection: _onNavigateSection,
  onNavigateView: _onNavigateView,
  onOpenPatientInformation: _onOpenPatientInformation,
}: {
  patient: Patient;
  headerDensity?: "full" | "compact" | "minimal";
  currentSection?: Section;
  onOpenCustomizer?: () => void;
  stagedOrdersCount?: number;
  onOpenOrderCart?: () => void;
  onNavigateSection?: (section: Section) => void;
  onNavigateView?: (view: "today" | "patient") => void;
  /** Opens the administrative record beside the chart. */
  onOpenPatientInformation?: () => void;
}) {
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [livePatient, setLivePatient] = useState<Patient>(patient);

  useEffect(() => {
    setLivePatient(patient);
  }, [patient]);

  useEffect(() => {
    return subscribeWorkspaceEvent(WORKSPACE_PATIENT_UPDATED_EVENT, (detail) => {
      if (detail.patientId === patient.id && detail.patient) {
        setLivePatient((prev) => ({ ...prev, ...detail.patient }));
      }
    });
  }, [patient.id]);


  const [allergies, setAllergies] = useState<AllergyRecord[]>([]);

  useEffect(() => {
    let cancelled = false;
    clinicalRecordApi
      .snapshot(patient.id)
      .then((snap) => {
        if (!cancelled) setAllergies(snap.allergies || []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [patient.id]);

  const activeAllergies = useMemo(
    () => allergies.filter((a) => a.status === "active"),
    [allergies],
  );

  const initials =
    livePatient.initials ||
    (livePatient.name
      ? livePatient.name
          .split(" ")
          .map((n) => n[0])
          .join("")
          .slice(0, 2)
          .toUpperCase()
      : "PT");

  const allergyText = useMemo(() => {
    if (activeAllergies.length > 0) {
      const nonNkda = activeAllergies.filter((a) => !a.is_nkda);
      if (nonNkda.length === 0) return "NKDA";
      return nonNkda
        .map((a) => `${a.substance}${a.reaction ? ` (${a.reaction})` : ""}`)
        .join(", ");
    }
    if (patient.id === "maya-chen") {
      return "Penicillin (Rash)";
    }
    return null;
  }, [activeAllergies, patient.id]);

  const baseProfile = useMemo(() => {
    return SYNTHETIC_PATIENT_PROFILES[livePatient.id];
  }, [livePatient.id]);

  const photoUrl = useMemo(() => {
    return (
      livePatient.photoUrl ||
      baseProfile?.photoUrl ||
      SYNTHETIC_PATIENT_PORTRAITS[livePatient.id] ||
      null
    );
  }, [livePatient.photoUrl, livePatient.id, baseProfile]);

  const rawSex = livePatient.idCard?.sex || baseProfile?.idCard?.sex;
  const sexLabel = useMemo(() => {
    if (rawSex === "F" || rawSex?.toLowerCase() === "female") return "Female";
    if (rawSex === "M" || rawSex?.toLowerCase() === "male") return "Male";
    if (rawSex) return rawSex;
    if (livePatient.pronouns?.toLowerCase().includes("she")) return "Female";
    if (livePatient.pronouns?.toLowerCase().includes("he")) return "Male";
    return null;
  }, [rawSex, livePatient.pronouns]);

  const allergyBadge = useMemo(() => {
    if (allergyText && allergyText !== "NKDA") {
      return (
        <span
          className="patient-allergy-badge"
          title={`Allergies: ${allergyText}`}
        >
          <span className="allergy-dot" aria-hidden="true" />
          <span className="allergy-prefix">Allergies:</span>
          <span className="allergy-content">{allergyText}</span>
        </span>
      );
    }
    if (allergyText === "NKDA") {
      return (
        <span
          className="patient-nkda-badge"
          title="Clinician verified: No Known Drug Allergies (NKDA)"
        >
          <span className="nkda-dot" aria-hidden="true" />
          <span>NKDA</span>
          <span className="nkda-sub">(No Known Drug Allergies)</span>
        </span>
      );
    }
    return (
      <span
        className="patient-no-allergies-badge"
        title="No active allergies recorded in chart"
      >
        <span className="demographic-label">Allergies:</span>
        <span>None recorded</span>
      </span>
    );
  }, [allergyText]);

  if (headerDensity === "minimal") {
    return (
      <div className="patient-header-container">
        <div className="patient-header patient-header-minimal">
          <div className="patient-identity">
            <button
              type="button"
              className="patient-avatar-square h-8 w-8 rounded-md bg-slate-100 border border-slate-200 text-slate-700 font-semibold text-xs flex items-center justify-center cursor-pointer hover:border-blue-400 transition-colors shrink-0 overflow-hidden"
              onClick={() => setPhotoModalOpen(true)}
              title={`${livePatient.name} — Click to view ID & photo`}
              aria-label={`Patient initials: ${initials}`}
            >
              {photoUrl ? (
                <img src={photoUrl} alt={livePatient.name} className="w-full h-full object-cover object-top" />
              ) : (
                initials
              )}
            </button>
            <div className="patient-name-line">
              <h1>{livePatient.name}</h1>
              {allergyBadge}
              <span className="minimal-meta">MRN {livePatient.mrn} · {livePatient.age} yrs</span>
            </div>
          </div>
        </div>
        <ClinicalFactsBar patientId={livePatient.id} density="minimal" onOpenCustomizer={onOpenCustomizer} />
        <PatientPhotoModal
          isOpen={photoModalOpen}
          onClose={() => setPhotoModalOpen(false)}
          patient={livePatient}
          onPhotoUpdated={(updated) => setLivePatient(updated)}
        />
      </div>
    );
  }

  if (headerDensity === "compact") {
    return (
      <div className="patient-header-container">
        <div className="patient-header patient-header-compact">
          <div className="patient-identity">
            <button
              type="button"
              className="patient-avatar-square h-10 w-10 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 font-semibold text-sm flex items-center justify-center cursor-pointer hover:border-blue-400 transition-colors shrink-0 overflow-hidden shadow-2xs"
              onClick={() => setPhotoModalOpen(true)}
              title={`${livePatient.name} — Click to view ID & photo`}
              aria-label={`Patient initials: ${initials}`}
            >
              {photoUrl ? (
                <img src={photoUrl} alt={livePatient.name} className="w-full h-full object-cover object-top" />
              ) : (
                initials
              )}
            </button>
            <div className="patient-identity-details">
              <div className="patient-name-line">
                <h1>{livePatient.name}</h1>
                {allergyBadge}
              </div>
              <div className="patient-demographics-row">
                <span className="demographic-item">
                  <span className="demographic-label">DOB</span>
                  <span className="demographic-value">{livePatient.dob}</span>
                  <span className="demographic-sub">({livePatient.age} yrs)</span>
                </span>
                <span className="demographic-sep" aria-hidden="true">·</span>
                <span className="demographic-item">
                  <span className="demographic-label">Sex</span>
                  <span className="demographic-value">{sexLabel ?? "Not recorded"}</span>
                  {livePatient.pronouns && <span className="demographic-sub">({livePatient.pronouns})</span>}
                </span>
                <span className="demographic-sep" aria-hidden="true">·</span>
                <span className="demographic-item">
                  <span className="demographic-label">MRN</span>
                  <span className="demographic-value font-mono">{livePatient.mrn}</span>
                </span>
              </div>
            </div>
          </div>
        </div>
        <ClinicalFactsBar patientId={livePatient.id} density="compact" onOpenCustomizer={onOpenCustomizer} />
        <PatientPhotoModal
          isOpen={photoModalOpen}
          onClose={() => setPhotoModalOpen(false)}
          patient={livePatient}
          onPhotoUpdated={(updated) => setLivePatient(updated)}
        />
      </div>
    );
  }

  return (
    <div className="patient-header-container">
      <div className="patient-header">
        <div className="patient-identity">
          <button
            type="button"
            className="patient-avatar-square h-12 w-12 rounded-xl bg-slate-100 border border-slate-200/90 text-slate-700 font-semibold text-sm flex items-center justify-center cursor-pointer hover:border-blue-400 hover:ring-2 hover:ring-blue-100 transition-all shrink-0 overflow-hidden shadow-2xs group relative"
            onClick={() => setPhotoModalOpen(true)}
            title={`Verified ID & photo: ${livePatient.name} (Click to view)`}
            aria-label={`View photo and verified ID for ${livePatient.name}`}
          >
            {photoUrl ? (
              <img
                src={photoUrl}
                alt={livePatient.name}
                className="w-full h-full object-contain transition-transform group-hover:scale-105"
              />
            ) : (
              <span className="text-slate-600 font-bold">{initials}</span>
            )}
          </button>
          <div className="patient-identity-details">
            {/* Row 1: Patient Name */}
            <div className="patient-name-line">
              <h1>{livePatient.name}</h1>
            </div>

            {/* Row 2: Clinical Demographics Key-Value */}
            <div className="patient-demographics-row">
              <span className="demographic-item">
                <span className="demographic-label">DOB</span>
                <span className="demographic-value">{livePatient.dob}</span>
                <span className="demographic-sub">({livePatient.age} yrs)</span>
              </span>

              <span className="demographic-sep" aria-hidden="true">·</span>

              <span className="demographic-item">
                <span className="demographic-label">Sex</span>
                <span className="demographic-value">{sexLabel ?? "Not recorded"}</span>
                {livePatient.pronouns && (
                  <span className="demographic-sub">({livePatient.pronouns})</span>
                )}
              </span>

              <span className="demographic-sep" aria-hidden="true">·</span>

              <span className="demographic-item">
                <span className="demographic-label">MRN</span>
                <span className="demographic-value font-mono">{livePatient.mrn}</span>
              </span>
            </div>

            {/* Row 3: Safety / Allergy Alert Strip */}
            <div className="patient-safety-row">
              {allergyBadge}
            </div>
          </div>
        </div>
      </div>
      <ClinicalFactsBar patientId={livePatient.id} density="full" onOpenCustomizer={onOpenCustomizer} />
      <PatientPhotoModal
        isOpen={photoModalOpen}
        onClose={() => setPhotoModalOpen(false)}
        patient={livePatient}
        onPhotoUpdated={(updated) => setLivePatient(updated)}
      />
    </div>
  );
}
