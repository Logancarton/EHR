"use client";

import { useCallback, useEffect, useState } from "react";
import { type Patient, type Section } from "../../domain/patient";
import {
  CARE_COMPLETION_CHANGED_EVENT,
  announceCareCompletionChange,
  careCompletionApi,
} from "../../lib/care-completion-api";
import ClinicalFactsBar from "../patient/ClinicalFactsBar";
import Button from "../ui/Button";
import OrderCartBadge from "../orders/OrderCartBadge";
import Icon from "../ui/Icon";
import PatientPhotoSpot from "../patient/PatientPhotoSpot";
import PatientPhotoModal from "../patient/PatientPhotoModal";

export default function PatientHeader({
  patient,
  headerDensity = "full",
  onOpenCustomizer,
  stagedOrdersCount = 0,
  onOpenOrderCart,
  onNavigateSection,
  onNavigateView,
  onOpenPatientInformation,
}: {
  patient: Patient;
  headerDensity?: "full" | "compact" | "minimal";
  onOpenCustomizer?: () => void;
  stagedOrdersCount?: number;
  onOpenOrderCart?: () => void;
  onNavigateSection?: (section: Section) => void;
  onNavigateView?: (view: "today" | "patient") => void;
  /** Opens the administrative record beside the chart. */
  onOpenPatientInformation?: () => void;
}) {
  const [liveStagedOrdersCount, setLiveStagedOrdersCount] = useState(stagedOrdersCount);
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [livePatient, setLivePatient] = useState<Patient>(patient);

  useEffect(() => {
    setLivePatient(patient);
  }, [patient]);

  useEffect(() => {
    function handlePatientUpdated(event: Event) {
      const detail = (event as CustomEvent<{ patientId: string; patient: Patient }>).detail;
      if (detail?.patientId === patient.id && detail.patient) {
        setLivePatient((prev) => ({ ...prev, ...detail.patient }));
      }
    }
    window.addEventListener("ehr-patient-updated", handlePatientUpdated);
    return () => window.removeEventListener("ehr-patient-updated", handlePatientUpdated);
  }, [patient.id]);

  useEffect(() => {
    setLiveStagedOrdersCount(stagedOrdersCount);
  }, [patient.id, stagedOrdersCount]);

  /**
   * Whether this chart is on the signed-in clinician's own care-completion
   * board. Asked of the server rather than remembered locally: the pin belongs
   * to a user, not to a browser tab, and the answer has to survive a reload and
   * agree with whatever the dashboard is showing.
   */
  const [pinned, setPinned] = useState<boolean | null>(null);
  const [pinBusy, setPinBusy] = useState(false);

  const readPinState = useCallback(async (patientId: string) => {
    try {
      setPinned(await careCompletionApi.isPinned(patientId));
    } catch {
      // The header must not become an error surface for an optional view
      // preference. Unknown simply offers the action without claiming a state.
      setPinned(null);
    }
  }, []);

  useEffect(() => {
    setPinned(null);
    void readPinState(patient.id);
  }, [patient.id, readPinState]);

  useEffect(() => {
    const handler = () => void readPinState(patient.id);
    window.addEventListener(CARE_COMPLETION_CHANGED_EVENT, handler);
    return () => window.removeEventListener(CARE_COMPLETION_CHANGED_EVENT, handler);
  }, [patient.id, readPinState]);

  const togglePin = useCallback(async () => {
    setPinBusy(true);
    try {
      if (pinned) await careCompletionApi.unpin(patient.id);
      else await careCompletionApi.pin(patient.id, "chart-header");
      setPinned(!pinned);
      announceCareCompletionChange({ patientId: patient.id });
    } catch {
      await readPinState(patient.id);
    } finally {
      setPinBusy(false);
    }
  }, [pinned, patient.id, readPinState]);

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

  const worklistButton = (
    <Button
      size="sm"
      icon="push_pin"
      pressed={pinned === true}
      loading={pinBusy}
      loadingLabel="Updating worklist…"
      onClick={() => void togglePin()}
      title={
        pinned
          ? "On your care-completion worklist. Clearing it changes only your own board."
          : "Keep this patient on your personal care-completion worklist. This grants no access and changes no record."
      }
    >
      {pinned ? "On worklist" : "Worklist"}
    </Button>
  );

  if (headerDensity === "minimal") {
    return (
      <>
        <div className="patient-header patient-header-minimal">
          <div className="patient-identity">
            <PatientPhotoSpot
              patient={livePatient}
              size="sm"
              onOpenModal={() => setPhotoModalOpen(true)}
            />
            <div className="patient-name-line">
              <h1>{livePatient.name}</h1>
              <span className="status-pill">{livePatient.status}</span>
              <span className="minimal-meta">MRN {livePatient.mrn} · {livePatient.age} yrs</span>
            </div>
          </div>
          <div className="patient-actions">
            {onOpenPatientInformation && (
              <Button
                variant="icon"
                size="sm"
                icon="badge"
                aria-label="Patient information"
                title="Patient information"
                onClick={onOpenPatientInformation}
              />
            )}
            {onOpenOrderCart && (
              <OrderCartBadge count={liveStagedOrdersCount} onClick={onOpenOrderCart} />
            )}
            {onOpenCustomizer && (
              <Button
                className="btn-icon-customizer"
                size="sm"
                icon="settings"
                onClick={onOpenCustomizer}
                title="Customize workspace layout"
              >
                Layout
              </Button>
            )}
            <Button variant="primary" size="sm" onClick={() => onNavigateSection?.("Encounter")}>
              Open encounter
            </Button>
          </div>
        </div>
        <ClinicalFactsBar patientId={livePatient.id} />
        <PatientPhotoModal
          isOpen={photoModalOpen}
          onClose={() => setPhotoModalOpen(false)}
          patient={livePatient}
          onPhotoUpdated={(updated) => setLivePatient(updated)}
        />
      </>
    );
  }

  if (headerDensity === "compact") {
    return (
      <>
        <div className="patient-header patient-header-compact">
          <div className="patient-identity">
            <PatientPhotoSpot
              patient={livePatient}
              size="md"
              onOpenModal={() => setPhotoModalOpen(true)}
            />
            <div>
              <div className="patient-name-line">
                <h1>{livePatient.name}</h1>
                <span className="status-pill">{livePatient.status}</span>
              </div>
              <p>DOB {livePatient.dob} · {livePatient.age} yrs · {livePatient.pronouns} · MRN {livePatient.mrn}</p>
            </div>
          </div>
          <div className="patient-actions">
            {onOpenOrderCart && (
              <OrderCartBadge count={liveStagedOrdersCount} onClick={onOpenOrderCart} />
            )}
            {onOpenCustomizer && (
              <Button
                className="btn-icon-customizer"
                size="sm"
                icon="settings"
                onClick={onOpenCustomizer}
                title="Customize workspace layout"
              >
                Layout
              </Button>
            )}
            {onOpenPatientInformation && (
              <Button size="sm" icon="badge" onClick={onOpenPatientInformation}>Patient info</Button>
            )}
            {worklistButton}
            <Button size="sm" icon="mail" onClick={() => onNavigateSection?.("Messages")}>Message</Button>
            <Button size="sm" icon="calendar_month" onClick={() => onNavigateView?.("today")}>Schedule</Button>
            <Button variant="primary" size="sm" onClick={() => onNavigateSection?.("Encounter")}>
              Open encounter
            </Button>
          </div>
        </div>
        <ClinicalFactsBar patientId={livePatient.id} />
        <PatientPhotoModal
          isOpen={photoModalOpen}
          onClose={() => setPhotoModalOpen(false)}
          patient={livePatient}
          onPhotoUpdated={(updated) => setLivePatient(updated)}
        />
      </>
    );
  }

  return (
    <>
      <div className="patient-header">
        <div className="patient-identity">
          <PatientPhotoSpot
            patient={livePatient}
            size="md"
            onOpenModal={() => setPhotoModalOpen(true)}
          />
          <div>
            <div className="patient-name-line">
              <h1>{livePatient.name}</h1>
              <span className="status-pill">{livePatient.status}</span>
            </div>
            <p>
              <span>DOB {livePatient.dob}</span> ·
              <span> {livePatient.age} yrs</span> ·
              <span> {livePatient.pronouns}</span> ·
              <span> MRN {livePatient.mrn}</span>
            </p>
          </div>
        </div>
        <div className="patient-actions">
          {onOpenOrderCart && (
            <OrderCartBadge count={liveStagedOrdersCount} onClick={onOpenOrderCart} />
          )}
          {onOpenCustomizer && (
            <Button
              className="btn-icon-customizer"
              size="sm"
              icon="settings"
              onClick={onOpenCustomizer}
              title="Customize workspace layout"
            >
              Layout
            </Button>
          )}
          {onOpenPatientInformation && (
            <Button size="sm" icon="badge" onClick={onOpenPatientInformation}>Patient info</Button>
          )}
          {worklistButton}
          <Button size="sm" icon="mail" onClick={() => onNavigateSection?.("Messages")}>Message</Button>
          <Button size="sm" icon="calendar_month" onClick={() => onNavigateView?.("today")}>Schedule</Button>
          <Button variant="primary" size="sm" onClick={() => onNavigateSection?.("Encounter")}>
            Open encounter
          </Button>
        </div>
      </div>
      <ClinicalFactsBar patientId={livePatient.id} />
      <PatientPhotoModal
        isOpen={photoModalOpen}
        onClose={() => setPhotoModalOpen(false)}
        patient={livePatient}
        onPhotoUpdated={(updated) => setLivePatient(updated)}
      />
    </>
  );
}
