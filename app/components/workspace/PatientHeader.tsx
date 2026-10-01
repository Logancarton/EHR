"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { markEscapeHandled } from "../../lib/use-dismissible";
import { type Patient, type Section } from "../../domain/patient";
import { clinicalRecordApi } from "../../lib/clinical-record-api";
import type { AllergyRecord } from "../../domain/clinical-records";
import {
  CARE_COMPLETION_CHANGED_EVENT,
  announceCareCompletionChange,
  careCompletionApi,
} from "../../lib/care-completion-api";
import {
  WORKSPACE_PATIENT_UPDATED_EVENT,
  WORKSPACE_ORDER_CART_UPDATED_EVENT,
  subscribeWorkspaceEvent,
} from "../../lib/workspace-events";
import ClinicalFactsBar from "../patient/ClinicalFactsBar";
import Button from "../ui/Button";
import OrderCartBadge from "../orders/OrderCartBadge";
import Icon from "../ui/Icon";
import PatientPhotoModal from "../patient/PatientPhotoModal";

export default function PatientHeader({
  patient,
  headerDensity = "full",
  currentSection,
  onOpenCustomizer,
  stagedOrdersCount = 0,
  onOpenOrderCart,
  onNavigateSection,
  onNavigateView,
  onOpenPatientInformation,
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
  const [liveStagedOrdersCount, setLiveStagedOrdersCount] = useState(stagedOrdersCount);
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [livePatient, setLivePatient] = useState<Patient>(patient);
  const moreMenuRef = useRef<HTMLDetailsElement | null>(null);

  const closeMoreMenu = useCallback(() => {
    if (moreMenuRef.current) moreMenuRef.current.open = false;
  }, []);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const menu = moreMenuRef.current;
      if (!menu?.open) return;
      const target = event.target;
      if (target instanceof Node && !menu.contains(target)) closeMoreMenu();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || !moreMenuRef.current?.open) return;
      // Handled: the layer stack must not also close what is underneath (CB-6f).
      markEscapeHandled(event);
      closeMoreMenu();
      moreMenuRef.current?.querySelector<HTMLElement>("summary")?.focus();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeMoreMenu]);

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

  useEffect(() => {
    setLiveStagedOrdersCount(stagedOrdersCount);
  }, [patient.id, stagedOrdersCount]);

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
    return subscribeWorkspaceEvent(WORKSPACE_ORDER_CART_UPDATED_EVENT, (detail) => {
      if (detail.patientId === patient.id) {
        setLiveStagedOrdersCount(detail.remainingCount ?? 0);
      }
    });
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

  // Keep the chart header clinically readable. High-frequency actions stay visible;
  // secondary workspace/navigation actions remain one click away instead of competing
  // with patient identity for horizontal space.
  const moreActionsMenu = (
    <details className="patient-header-more" ref={moreMenuRef}>
      <summary aria-label="More patient actions" title="More patient actions">
        <Icon name="more_horiz" size="sm" />
        <span>More</span>
      </summary>
      <div className="patient-header-more-menu" role="menu" aria-label="More patient actions">
        {onOpenPatientInformation && (
          <Button
            className="patient-more-narrow-only"
            size="sm"
            icon="badge"
            role="menuitem"
            onClick={() => {
              closeMoreMenu();
              onOpenPatientInformation();
            }}
          >
            Patient info
          </Button>
        )}
        <Button
          className="patient-more-narrow-only"
          size="sm"
          icon="mail"
          role="menuitem"
          onClick={() => {
            closeMoreMenu();
            onNavigateSection?.("Messages");
          }}
        >
          Message
        </Button>
        <Button
          size="sm"
          icon="push_pin"
          role="menuitem"
          pressed={pinned === true}
          loading={pinBusy}
          loadingLabel="Updating worklist…"
          onClick={() => {
            closeMoreMenu();
            void togglePin();
          }}
          title={
            pinned
              ? "On your care-completion worklist. Clearing it changes only your own board."
              : "Keep this patient on your personal care-completion worklist. This grants no access and changes no record."
          }
        >
          {pinned ? "On worklist" : "Worklist"}
        </Button>
        {onNavigateView && (
          <Button
            size="sm"
            icon="calendar_month"
            role="menuitem"
            onClick={() => {
              closeMoreMenu();
              onNavigateView("today");
            }}
          >
            Schedule
          </Button>
        )}
        {onOpenCustomizer && (
          <Button
            size="sm"
            icon="settings"
            role="menuitem"
            onClick={() => {
              closeMoreMenu();
              onOpenCustomizer();
            }}
          >
            Layout
          </Button>
        )}
      </div>
    </details>
  );

  if (headerDensity === "minimal") {
    return (
      <div className="patient-header-container">
        <div className="patient-header patient-header-minimal">
          <div className="patient-identity">
            <button
              type="button"
              className="patient-avatar-square h-8 w-8 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 font-semibold text-xs flex items-center justify-center cursor-pointer hover:bg-slate-200 transition-colors shrink-0"
              onClick={() => setPhotoModalOpen(true)}
              title={`${livePatient.name} (${initials})`}
              aria-label={`Patient initials: ${initials}`}
            >
              {initials}
            </button>
            <div className="patient-name-line">
              <h1>{livePatient.name}</h1>
              <span className="status-pill">{livePatient.status}</span>
              {allergyText && (
                <span
                  className="patient-allergy-badge bg-rose-50 text-rose-700 border border-rose-200 font-semibold text-xs px-2.5 py-0.5 rounded-full inline-flex items-center gap-1"
                  title={`Allergies: ${allergyText}`}
                >
                  <span className="font-bold">ALLERGIES</span>{" "}
                  <span>{allergyText}</span>
                </span>
              )}
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
            {currentSection === "Encounter" ? (
              <Button
                variant="secondary"
                size="sm"
                className="btn-in-encounter"
                title="Currently viewing encounter note"
                aria-current="page"
                onClick={() => onNavigateSection?.("Encounter")}
              >
                <span className="encounter-active-dot" aria-hidden="true" />
                In encounter
              </Button>
            ) : (
              <button
                type="button"
                className="bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm px-4 py-2 rounded-lg shadow-sm transition-colors cursor-pointer inline-flex items-center gap-1.5"
                onClick={() => onNavigateSection?.("Encounter")}
              >
                Open encounter
              </button>
            )}
          </div>
        </div>
        <ClinicalFactsBar patientId={livePatient.id} density="minimal" />
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
              className="patient-avatar-square h-10 w-10 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 font-semibold text-sm flex items-center justify-center cursor-pointer hover:bg-slate-200 transition-colors shrink-0"
              onClick={() => setPhotoModalOpen(true)}
              title={`${livePatient.name} (${initials})`}
              aria-label={`Patient initials: ${initials}`}
            >
              {initials}
            </button>
            <div>
              <div className="patient-name-line">
                <h1>{livePatient.name}</h1>
                <span className="status-pill">{livePatient.status}</span>
                {allergyText && (
                  <span
                    className="patient-allergy-badge bg-rose-50 text-rose-700 border border-rose-200 font-semibold text-xs px-2.5 py-0.5 rounded-full inline-flex items-center gap-1"
                    title={`Allergies: ${allergyText}`}
                  >
                    <span className="font-bold">ALLERGIES</span>{" "}
                    <span>{allergyText}</span>
                  </span>
                )}
              </div>
              <p>DOB {livePatient.dob} · {livePatient.age} yrs · {livePatient.pronouns} · MRN {livePatient.mrn}</p>
            </div>
          </div>
          <div className="patient-actions">
            {onOpenOrderCart && (
              <OrderCartBadge count={liveStagedOrdersCount} onClick={onOpenOrderCart} />
            )}
            {onOpenPatientInformation && (
              <button
                type="button"
                className="patient-action-responsive border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium px-3 py-2 rounded-lg inline-flex items-center gap-2 cursor-pointer transition-colors"
                onClick={onOpenPatientInformation}
              >
                <Icon name="badge" size="sm" />
                <span>Patient info</span>
              </button>
            )}
            <button
              type="button"
              className="patient-action-responsive border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium px-3 py-2 rounded-lg inline-flex items-center gap-2 cursor-pointer transition-colors"
              onClick={() => onNavigateSection?.("Messages")}
            >
              <Icon name="mail" size="sm" />
              <span>Message</span>
            </button>
            {moreActionsMenu}
            {currentSection === "Encounter" ? (
              <Button
                variant="secondary"
                size="sm"
                className="btn-in-encounter"
                title="Currently viewing encounter note"
                aria-current="page"
                onClick={() => onNavigateSection?.("Encounter")}
              >
                <span className="encounter-active-dot" aria-hidden="true" />
                In encounter
              </Button>
            ) : (
              <button
                type="button"
                className="bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm px-4 py-2 rounded-lg shadow-sm transition-colors cursor-pointer inline-flex items-center gap-1.5"
                onClick={() => onNavigateSection?.("Encounter")}
              >
                Open encounter
              </button>
            )}
          </div>
        </div>
        <ClinicalFactsBar patientId={livePatient.id} density="compact" />
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
            className="patient-avatar-square h-10 w-10 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 font-semibold text-sm flex items-center justify-center cursor-pointer hover:bg-slate-200 transition-colors shrink-0"
            onClick={() => setPhotoModalOpen(true)}
            title={`${livePatient.name} (${initials})`}
            aria-label={`Patient initials: ${initials}`}
          >
            {initials}
          </button>
          <div>
            <div className="patient-name-line">
              <h1>{livePatient.name}</h1>
              <span className="status-pill">{livePatient.status}</span>
              {allergyText && (
                <span
                  className="patient-allergy-badge bg-rose-50 text-rose-700 border border-rose-200 font-semibold text-xs px-2.5 py-0.5 rounded-full inline-flex items-center gap-1"
                  title={`Allergies: ${allergyText}`}
                >
                  <span className="font-bold">ALLERGIES</span>{" "}
                  <span>{allergyText}</span>
                </span>
              )}
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
          {onOpenPatientInformation && (
            <button
              type="button"
              className="patient-action-responsive border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium px-3 py-2 rounded-lg inline-flex items-center gap-2 cursor-pointer transition-colors"
              onClick={onOpenPatientInformation}
            >
              <Icon name="badge" size="sm" />
              <span>Patient info</span>
            </button>
          )}
          <button
            type="button"
            className="patient-action-responsive border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium px-3 py-2 rounded-lg inline-flex items-center gap-2 cursor-pointer transition-colors"
            onClick={() => onNavigateSection?.("Messages")}
          >
            <Icon name="mail" size="sm" />
            <span>Message</span>
          </button>
          {moreActionsMenu}
          {currentSection === "Encounter" ? (
            <Button
              variant="secondary"
              size="sm"
              className="btn-in-encounter"
              title="Currently viewing encounter note"
              aria-current="page"
              onClick={() => onNavigateSection?.("Encounter")}
            >
              <span className="encounter-active-dot" aria-hidden="true" />
              In encounter
            </Button>
          ) : (
            <button
              type="button"
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm px-4 py-2 rounded-lg shadow-sm transition-colors cursor-pointer inline-flex items-center gap-1.5"
              onClick={() => onNavigateSection?.("Encounter")}
            >
              Open encounter
            </button>
          )}
        </div>
      </div>
      <ClinicalFactsBar patientId={livePatient.id} density="full" />
      <PatientPhotoModal
        isOpen={photoModalOpen}
        onClose={() => setPhotoModalOpen(false)}
        patient={livePatient}
        onPhotoUpdated={(updated) => setLivePatient(updated)}
      />
    </div>
  );
}
