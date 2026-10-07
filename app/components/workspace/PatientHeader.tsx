"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
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
import {
  chartHeaderAccountSummary,
  formatDateOfBirth,
} from "../../domain/patient-administration";
import { api } from "../../lib/api-client";

type AccountSummaryState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; summary: ReturnType<typeof chartHeaderAccountSummary> };

/**
 * Phone and payment method for the header, read from the administrative record.
 * Re-read when an administrative save for this patient is announced; a response
 * for a patient this header no longer shows is dropped.
 */
function useChartHeaderAccount(patientId: string): AccountSummaryState {
  const [state, setState] = useState<AccountSummaryState>({ status: "loading" });

  useEffect(() => {
    let current = true;
    let request = 0;
    const load = () => {
      const mine = ++request;
      api.patientAdministration
        .get(patientId)
        .then((record) => {
          if (current && mine === request) {
            setState({ status: "ready", summary: chartHeaderAccountSummary(record) });
          }
        })
        .catch(() => {
          if (current && mine === request) setState({ status: "error" });
        });
    };
    setState({ status: "loading" });
    load();
    const unsubscribe = subscribeWorkspaceEvent(WORKSPACE_PATIENT_UPDATED_EVENT, (detail) => {
      if (detail.patientId === patientId) load();
    });
    return () => {
      current = false;
      unsubscribe();
    };
  }, [patientId]);

  return state;
}

/**
 * Phone, payment method and balance. Balance is a labeled gap: charges carry
 * fee-schedule prices but no payments, adjustments or remittances exist (roadmap
 * P9), so any amount owed shown here would be invented.
 */
function ChartHeaderAccountItems({ account }: { account: AccountSummaryState }) {
  if (account.status === "error") {
    return (
      <span className="demographic-item">
        <span className="demographic-value demographic-value-muted">
          Phone and coverage could not be loaded
        </span>
      </span>
    );
  }
  const summary = account.status === "ready" ? account.summary : null;
  const pending = account.status === "loading" ? "…" : null;
  return (
    <>
      <span className="demographic-item">
        <span className="demographic-label">Phone</span>
        {summary?.phone ? (
          <a className="demographic-value demographic-phone" href={`tel:${summary.phone.replace(/[^\d+]/g, "")}`}>
            {summary.phone}
          </a>
        ) : (
          <span className="demographic-value demographic-value-muted">{pending ?? "Not recorded"}</span>
        )}
      </span>
      <span className="demographic-sep" aria-hidden="true">·</span>
      <span className="demographic-item">
        <span className="demographic-label">Coverage</span>
        {summary?.coverage ? (
          <>
            <span className="demographic-value">{summary.coverage}</span>
            {summary.coverageDetail && <span className="demographic-sub">({summary.coverageDetail})</span>}
          </>
        ) : (
          <span className="demographic-value demographic-value-muted">{pending ?? "Not recorded"}</span>
        )}
      </span>
      <span className="demographic-sep" aria-hidden="true">·</span>
      <span
        className="demographic-item"
        title="No patient ledger exists yet: payments, insurance adjustments and remittances are not recorded, so an amount owed cannot be shown."
      >
        <span className="demographic-label">Balance</span>
        <span className="demographic-value demographic-value-muted">Not tracked yet</span>
      </span>
    </>
  );
}

export default function PatientHeader({
  patient,
  headerActions,
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
  headerActions?: ReactNode;
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
  const account = useChartHeaderAccount(patient.id);

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
          {headerActions}
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
                  <span className="demographic-value">{formatDateOfBirth(livePatient.dob)}</span>
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
                <span className="demographic-sep" aria-hidden="true">·</span>
                <ChartHeaderAccountItems account={account} />
              </div>
            </div>
          </div>
          {headerActions}
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
                <span className="demographic-value">{formatDateOfBirth(livePatient.dob)}</span>
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

            {/* Row 3: How to reach the patient and how the visit is paid */}
            <div className="patient-demographics-row patient-account-row">
              <ChartHeaderAccountItems account={account} />
            </div>

            {/* Row 4: Safety / Allergy Alert Strip */}
            <div className="patient-safety-row">
              {allergyBadge}
            </div>
          </div>
        </div>
        {headerActions}
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
