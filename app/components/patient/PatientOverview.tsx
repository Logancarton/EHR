"use client";

import { useState, useMemo, useEffect, useRef, type ReactNode } from "react";
import { type Patient } from "../../domain/patient";
import type {
  ClinicalRecordSnapshot,
  MedicationRecord,
  OverviewAttentionItem,
} from "../../domain/clinical-records";
import { api } from "../../lib/api-client";
import { preferredPharmacy, careNetworkRoleLabel, type PatientAdministrativeRecord } from "../../domain/patient-administration";
import { subscribeWorkspaceEvent, WORKSPACE_PATIENT_UPDATED_EVENT } from "../../lib/workspace-events";
import { usePatientClinicalSnapshot } from "../../lib/use-patient-clinical-snapshot";
import {
  type ProviderPreferences,
  type OverviewCardId,
  type OverviewVisibilityKey,
  defaultPreferences,
  savePreferences,
} from "../../lib/preference-engine";
import {
  calculateMonitoringStatus,
  monitoringEvidenceFromRecord,
  monitoringPolicySourceLabel,
  type LabObservation,
  type MedicationProtocol,
} from "../../lib/clinical-protocols";
import {
  CLINICAL_MONITORING_POLICY_CHANGED_EVENT,
  clinicalMonitoringPolicyApi,
} from "../../lib/clinical-monitoring-policy-api";
import AsyncSection from "../ui/AsyncSection";
import Button from "../ui/Button";
import Icon from "../ui/Icon";
import { formatCalendarDate, formatClinicalDate, toCalendarDate } from "../../lib/clinical-date";
import { practiceToday } from "../../lib/practice-calendar";
import { timeStringToMinutes } from "../../lib/schedule-data";
import PatientVitalsModal from "./PatientVitalsModal";
import PatientAssessmentsModal from "./PatientAssessmentsModal";
import { currentSafetyFlags } from "../../domain/clinical-measurements";
import { buildClinicalBrief } from "../../domain/clinical-brief";

import { latestLaboratoryObservations } from "../../domain/overview-labs";
import { DEFAULT_OVERVIEW_CARD_ORDER, resolveOverviewCardOrder } from "../../domain/overview-layout";
import OverviewHistorySummary from "./OverviewHistorySummary";
import OverviewResultsSummary from "./OverviewResultsSummary";
import { OverviewCard, OverviewLine, SourceNote } from "./OverviewParts";
import { formatLabValue } from "../../lib/lab-value-presentation";
import { documentTypeLabel } from "../../lib/document-type-presentation";

const EMPTY_CLINICAL_SNAPSHOT: Required<ClinicalRecordSnapshot> = {
  problems: [], allergies: [], medications: [], observations: [], vitals: [], psychiatricHistory: [],
  assessments: [], encounters: [], upcomingAppointments: [], documents: [],
};

function OverviewCardMenu({
  cardId,
  isPinned,
  isCollapsed,
  hideKey,
  onTogglePin,
  onMove,
  onToggleCollapse,
  onHide,
}: {
  cardId: OverviewCardId;
  isPinned?: boolean;
  isCollapsed: boolean;
  hideKey: OverviewVisibilityKey;
  onTogglePin?: (cardId: OverviewCardId) => void;
  /** Reordering lives in the menu so no drag handle competes with the content. */
  onMove?: { earlier: (() => void) | null; later: (() => void) | null };
  onToggleCollapse: (cardId: OverviewCardId) => void;
  onHide: (key: OverviewVisibilityKey) => void;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && detailsRef.current?.open) {
        detailsRef.current.open = false;
      }
    }
    function handleClickOutside(e: MouseEvent) {
      if (detailsRef.current?.open && !detailsRef.current.contains(e.target as Node)) {
        detailsRef.current.open = false;
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  function item(icon: string, label: string, action: () => void, danger = false) {
    return (
      <button
        type="button"
        className={`overview-card-menu-item ${danger ? "danger" : ""}`}
        role="menuitem"
        onClick={() => {
          if (detailsRef.current) detailsRef.current.open = false;
          action();
        }}
      >
        <Icon name={icon} />
        <span>{label}</span>
      </button>
    );
  }

  return (
    <details ref={detailsRef} className="overview-card-menu">
      <summary className="card-header-btn" aria-label="Card layout and display options" title="Card options">
        <Icon name="more_vert" />
      </summary>
      <div className="overview-card-menu-dropdown" role="menu">
        {onTogglePin && item("push_pin", isPinned ? "Unpin card" : "Pin to top", () => onTogglePin(cardId))}
        {onMove?.earlier && item("arrow_back", "Move earlier", onMove.earlier)}
        {onMove?.later && item("arrow_forward", "Move later", onMove.later)}
        {item(isCollapsed ? "expand_more" : "expand_less", isCollapsed ? "Expand card" : "Collapse card", () => onToggleCollapse(cardId))}
        {item("visibility_off", "Hide card", () => onHide(hideKey), true)}
      </div>
    </details>
  );
}

/** Zero-padded minutes past midnight, so "09:00 AM" sorts before "10:00 AM" and "01:00 PM". */
function timeSortKey(time: string): string {
  return String(timeStringToMinutes(time)).padStart(4, "0");
}

export default function PatientOverview({
  patient,
  preferences = defaultPreferences,
  onUpdatePreferences,
  onNavigateSection,
  onNavigateView,
  onOpenAdminDrawer,
  onToast,
}: {
  patient: Patient;
  preferences?: ProviderPreferences;
  onUpdatePreferences?: (updated: ProviderPreferences) => void;
  onNavigateSection?: (section: "Overview" | "Encounter" | "Meds" | "Labs" | "Documents" | "Messages" | "History") => void;
  onNavigateView?: (view: "today" | "week" | "roster") => void;
  onOpenAdminDrawer?: () => void;
  onToast?: (msg: string) => void;
}) {
  const [timelineFilter, setTimelineFilter] = useState<"all" | "visit" | "med" | "vital" | "scale" | "lab" | "document">("all");

  const clinical = usePatientClinicalSnapshot(patient.id);
  const snapshot = clinical.snapshot;
  const allergies = snapshot?.allergies ?? EMPTY_CLINICAL_SNAPSHOT.allergies;
  const medications = snapshot?.medications ?? EMPTY_CLINICAL_SNAPSHOT.medications;
  const observations = snapshot?.observations ?? EMPTY_CLINICAL_SNAPSHOT.observations;
  const vitals = snapshot?.vitals ?? EMPTY_CLINICAL_SNAPSHOT.vitals;
  const psychiatricHistory = snapshot?.psychiatricHistory ?? EMPTY_CLINICAL_SNAPSHOT.psychiatricHistory;
  const assessments = snapshot?.assessments ?? EMPTY_CLINICAL_SNAPSHOT.assessments;
  const encounters = snapshot?.encounters ?? EMPTY_CLINICAL_SNAPSHOT.encounters;
  const upcomingAppointments = snapshot?.upcomingAppointments ?? EMPTY_CLINICAL_SNAPSHOT.upcomingAppointments;
  const documents = snapshot?.documents ?? EMPTY_CLINICAL_SNAPSHOT.documents;
  const isLoading = clinical.status === "loading";
  const snapshotError = clinical.error ? "The clinical overview could not be loaded. No empty or fixture chart state was substituted." : null;
  const snapshotPatientId = snapshot ? clinical.patientId : null;
  const resolvedCardOrder = resolveOverviewCardOrder(preferences.overview.cardOrder, preferences.overview.pinnedCards);
  const [monitoringRules, setMonitoringRules] = useState<MedicationProtocol[] | null>(null);
  const [monitoringPolicyError, setMonitoringPolicyError] = useState<string | null>(null);
  const [monitoringPolicyReloadKey, setMonitoringPolicyReloadKey] = useState(0);

  const [administration, setAdministration] = useState<PatientAdministrativeRecord | null>(null);
  const [administrationError, setAdministrationError] = useState<string | null>(null);
  const [administrationReloadKey, setAdministrationReloadKey] = useState(0);

  useEffect(() => subscribeWorkspaceEvent(WORKSPACE_PATIENT_UPDATED_EVENT, ({ patientId }) => {
    if (patientId === patient.id) {
      setAdministrationReloadKey((value) => value + 1);
    }
  }), [patient.id]);

  useEffect(() => {
    let cancelled = false;
    setAdministration(null);
    setAdministrationError(null);
    api.patientAdministration.get(patient.id).then((record) => {
      if (!cancelled) {
        if (record.patientId !== patient.id) {
          setAdministrationError("Care details returned for a different patient were rejected.");
        } else {
          setAdministration(record);
        }
      }
    }).catch(() => {
      if (!cancelled) setAdministrationError("Care details could not be loaded.");
    });
    return () => { cancelled = true; };
  }, [patient.id, administrationReloadKey]);

  // Modals
  const [isVitalsModalOpen, setIsVitalsModalOpen] = useState(false);
  const [isAssessmentsModalOpen, setIsAssessmentsModalOpen] = useState(false);

  useEffect(() => {
    const handlePolicyChange = () => setMonitoringPolicyReloadKey((value) => value + 1);
    window.addEventListener(CLINICAL_MONITORING_POLICY_CHANGED_EVENT, handlePolicyChange);
    return () =>
      window.removeEventListener(CLINICAL_MONITORING_POLICY_CHANGED_EVENT, handlePolicyChange);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setMonitoringRules(null);
    setMonitoringPolicyError(null);
    clinicalMonitoringPolicyApi
      .get(patient.id)
      .then((state) => {
        if (!cancelled) setMonitoringRules(state.effectiveRules);
      })
      .catch(() => {
        if (!cancelled) {
          setMonitoringPolicyError(
            "Clinical Bond could not load this patient's monitoring policy, so medication surveillance status is not being asserted.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [patient.id, monitoringPolicyReloadKey]);

  // Card layout management
  function hideCard(key: OverviewVisibilityKey) {
    if (!onUpdatePreferences) return;
    const next = {
      ...preferences,
      overview: { ...preferences.overview, [key]: false },
    };
    savePreferences(next);
    onUpdatePreferences(next);
  }

  function showCard(key: OverviewVisibilityKey) {
    if (!onUpdatePreferences) return;
    const next = {
      ...preferences,
      overview: { ...preferences.overview, [key]: true },
    };
    savePreferences(next);
    onUpdatePreferences(next);
  }

  function resetCards() {
    if (!onUpdatePreferences) return;
    const next: ProviderPreferences = {
      ...preferences,
      overview: {
        ...preferences.overview,
        showSnapshot: true,
        showDiagnoses: true,
        showMedications: true,
        showTimeline: true,
        cardOrder: [...DEFAULT_OVERVIEW_CARD_ORDER],
        showMeasures: true, showResults: true, showHistory: true,
        collapsedCards: {},
        cardSpans: {},
        pinnedCards: {},
      },
    };
    savePreferences(next);
    onUpdatePreferences(next);
  }

  function toggleCollapse(cardId: OverviewCardId) {
    if (!onUpdatePreferences) return;
    const isCollapsed = preferences.overview.collapsedCards[cardId] || false;
    const next = {
      ...preferences,
      overview: {
        ...preferences.overview,
        collapsedCards: {
          ...preferences.overview.collapsedCards,
          [cardId]: !isCollapsed,
        },
      },
    };
    savePreferences(next);
    onUpdatePreferences(next);
  }

  function togglePinCard(cardId: OverviewCardId) {
    if (!onUpdatePreferences) return;
    const isPinned = preferences.overview.pinnedCards?.[cardId] || false;
    let nextOrder = [...resolvedCardOrder];

    if (!isPinned) {
      nextOrder = [cardId, ...nextOrder.filter((id) => id !== cardId)];
    }

    const next = {
      ...preferences,
      overview: {
        ...preferences.overview,
        cardOrder: nextOrder,
        pinnedCards: {
          ...(preferences.overview.pinnedCards || {}),
          [cardId]: !isPinned,
        },
      },
    };
    savePreferences(next);
    onUpdatePreferences(next);
  }

  /** Swap a Now tile with its visible neighbour; the saved card order stays the single source. */
  function moveCard(cardId: OverviewCardId, neighbourId: OverviewCardId) {
    if (!onUpdatePreferences) return;
    const order = [...resolvedCardOrder];
    const from = order.indexOf(cardId);
    const to = order.indexOf(neighbourId);
    if (from === -1 || to === -1) return;
    [order[from], order[to]] = [order[to], order[from]];
    const next = { ...preferences, overview: { ...preferences.overview, cardOrder: order } };
    savePreferences(next);
    onUpdatePreferences(next);
  }

  const monitoringEvidence = useMemo<LabObservation[]>(
    () => monitoringEvidenceFromRecord(observations, vitals),
    [observations, vitals],
  );
  const labHistory = useMemo<LabObservation[]>(
    () => monitoringEvidence.filter((entry) => entry.kind !== "vital"),
    [monitoringEvidence],
  );

  const monitoring = useMemo(() => {
    if (!monitoringRules) return [];
    const activeMedicationNames = medications
      .filter((medication) => medication.status === "active")
      .map((medication) => medication.display_text || medication.medication_name);
    return calculateMonitoringStatus(activeMedicationNames, monitoringEvidence, {
      protocols: monitoringRules,
    });
  }, [medications, monitoringEvidence, monitoringRules]);

  // "What needs attention?" evaluation
  const attentionItems = useMemo<OverviewAttentionItem[]>(() => {
    const items: OverviewAttentionItem[] = [];

    // Safety flags from the latest administration of each instrument
    currentSafetyFlags(assessments).forEach((f, idx) => {
      items.push({
        id: `alert-assessment-${f.assessmentId}-${idx}`,
        category: "safety",
        severity: "critical",
        title: f.title,
        description: f.flag,
        when: formatClinicalDate(f.administeredAt),
        actionLabel: "Review scale",
        targetModal: "assessments",
      });
    });

    // Metabolic / Vitals alerts (e.g. AHA stage 2/crisis, tachycardia, >= 7% weight shift)
    if (vitals.length > 0 && vitals[0].flags && vitals[0].flags.length > 0) {
      vitals[0].flags.forEach((f, idx) => {
        items.push({
          id: `alert-vital-${f.type}-${idx}`,
          category: "metabolic",
          severity: f.severity === "critical" ? "critical" : "warning",
          title: f.label,
          description: f.detail,
          actionLabel: "View flowsheet",
          targetModal: "vitals",
        });
      });
    }

    // Medication surveillance grouped by active medication
    const attentionMonitoring = monitoring.filter((entry) => entry.status !== "current");
    const byMedication = new Map<string, typeof attentionMonitoring>();
    for (const entry of attentionMonitoring) {
      const group = byMedication.get(entry.medication) ?? [];
      group.push(entry);
      byMedication.set(entry.medication, group);
    }

    for (const [medication, entries] of byMedication) {
      const rank = { overdue: 3, due: 2, "due-soon": 1, current: 0 } as const;
      const highest = [...entries].sort((a, b) => rank[b.status] - rank[a.status])[0];
      const statusLabel =
        highest.status === "overdue" ? "Overdue" :
          highest.status === "due" ? "Due" : "Due soon";
      const onlyVitals = entries.every((entry) => entry.measureKind === "vital");
      const summary = entries
        .map((entry) => {
          const timing =
            entry.lastDoneDate == null
              ? "none on file"
              : entry.daysRemaining != null && entry.daysRemaining >= 0
                ? `due in ${entry.daysRemaining}d`
                : `${Math.abs(entry.daysRemaining ?? 0)}d past due`;
          return `${entry.requiredMeasure} ${timing}`;
        })
        .join(" · ");
      const detail = entries
        .map((entry) => {
          const timing =
            entry.lastDoneDate == null
              ? "no qualifying result on file"
              : entry.daysRemaining != null && entry.daysRemaining >= 0
                ? `${entry.daysRemaining}d remaining`
                : `${Math.abs(entry.daysRemaining ?? 0)}d past due`;
          const reason =
            entry.policySource === "patient" && entry.policyReason
              ? ` · reason: ${entry.policyReason}`
              : "";
          return `${entry.requiredMeasure} — ${entry.intervalLabel}, ${timing}, ${monitoringPolicySourceLabel(entry.policySource)}${reason}`;
        })
        .join(" · ");

      items.push({
        id: `alert-monitoring-${highest.ruleId}`,
        category: "surveillance",
        severity: highest.status === "due-soon" ? "info" : "warning",
        title: `${highest.canonicalMedication} monitoring ${statusLabel.toLowerCase()}`,
        description: summary,
        detail: `${medication}: ${detail}`,
        actionLabel: onlyVitals ? "View flowsheet" : "Review labs",
        ...(onlyVitals ? { targetModal: "vitals" as const } : { targetSection: "Labs" as const }),
      });
    }

    if (monitoringPolicyError) {
      items.push({
        id: "alert-monitoring-policy-unavailable",
        category: "surveillance",
        severity: "info",
        title: "Monitoring policy unavailable",
        description: monitoringPolicyError,
        actionLabel: "Review labs",
        targetSection: "Labs",
      });
    }

    // Unassessed allergies status
    if (allergies.length === 0) {
      items.push({
        id: "alert-unassessed-allergies",
        category: "allergy",
        severity: "warning",
        title: "Allergies unassessed",
        description: "No allergies or NKDA status currently documented in patient chart.",
        actionLabel: "Assess allergies",
        targetModal: "admin",
      });
    }

    // Project recorded abnormal/critical lab flags, never infer a clinical
    // diagnosis or completed review from values or the absence of other alerts.
    for (const result of latestLaboratoryObservations(observations)) {
      const flag = result.interpretation?.trim().toLowerCase();
      if (result.acknowledged_at || !flag || !["critical", "abnormal", "high", "low"].includes(flag)) continue;
      items.push({ id: `alert-result-${result.id}`, category: "unreviewed", severity: flag === "critical" ? "critical" : "warning",
        title: `Recorded result flagged ${flag}: ${result.test_name}`,
        description: `${formatClinicalDate(result.effective_at)} · ${result.status}. No review recorded.`,
        actionLabel: "Review result", targetSection: "Labs" });
    }

    // Unsigned encounter drafts
    const unsigned = encounters.find((e) => e.status === "draft");
    if (unsigned) {
      items.push({
        id: `alert-unsigned-${unsigned.id}`,
        category: "unsigned",
        severity: "warning",
        title: `${unsigned.type} — unsigned draft`,
        description: "Awaits clinician review and signature.",
        when: formatCalendarDate(unsigned.date),
        actionLabel: "Resume note",
        targetSection: "Encounter",
      });
    }

    return items;
  }, [assessments, vitals, monitoring, monitoringPolicyError, allergies, encounters, observations]);

  // "What is next?" evaluation
  const today = practiceToday();
  const nextVisitInfo = useMemo(() => {
    const apt = upcomingAppointments
      .filter(
        (appointment) =>
          (appointment.status === "tentative" ||
            appointment.status === "scheduled" ||
            appointment.status === "confirmed") &&
          (toCalendarDate(appointment.date) ?? "") >= today,
      )
      .sort((left, right) =>
        `${toCalendarDate(left.date)} ${timeSortKey(left.time)}`.localeCompare(`${toCalendarDate(right.date)} ${timeSortKey(right.time)}`),
      )[0];
    if (!apt) return null;
    return {
      date: apt.date,
      time: apt.time,
      type: apt.type,
      provider: apt.provider,
      status: apt.status,
      room: apt.room,
    };
  }, [upcomingAppointments, today]);

  const clinicalBrief = useMemo(
    () =>
      buildClinicalBrief({
        patientId: patient.id,
        encounters,
        assessments,
        vitals,
        medications,
        observations,
      }),
    [patient.id, encounters, assessments, vitals, medications, observations],
  );

  // One timeline entry per source record; the continuity brief is another view of these same records.
  const recentChanges = useMemo(() => {
    type ChangeItem = {
      id: string;
      date: string;
      category: "visit" | "med" | "vital" | "scale" | "lab" | "document";
      title: string;
      detail: string;
    };

    const list: ChangeItem[] = [];

    if (encounters.length > 0) {
      const recent = encounters[0];
      list.push({
        id: `enc-${recent.id}`,
        date: toCalendarDate(recent.date) ?? recent.date,
        category: "visit",
        title: `${recent.type} (${recent.status === "signed" ? "Signed" : "Draft"})`,
        detail: recent.chiefComplaint || (recent.assessment ? `${recent.assessment.slice(0, 90)}${recent.assessment.length > 90 ? "…" : ""}` : "No visit summary recorded."),
      });
    }

    const recentMedication = [...medications].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
    if (recentMedication) {
      const regimen = [
        recentMedication.dose || recentMedication.strength,
        recentMedication.route,
        recentMedication.frequency,
        recentMedication.indication ? `for ${recentMedication.indication}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      list.push({
        id: `med-${recentMedication.id}`,
        date: toCalendarDate(recentMedication.updated_at) ?? recentMedication.updated_at,
        category: "med",
        title: `${recentMedication.status === "active" ? "Medication active" : "Medication updated"}: ${recentMedication.medication_name}`,
        detail: regimen || "Medication record updated.",
      });
    }

    if (vitals.length > 0) {
      const v = vitals[0];
      const weightFlag = v.flags.find((f) => f.type === "weight_change");
      list.push({
        id: `vital-${v.recordedAt}`,
        date: toCalendarDate(v.recordedAt) ?? v.recordedAt,
        category: "vital",
        title: `Vitals: BP ${v.bpText || `${v.systolic}/${v.diastolic}`}`,
        detail: `HR ${v.heartRate ?? "—"} bpm · Weight ${v.weightLbs != null ? `${v.weightLbs} lb` : "—"} · BMI ${v.bmi ?? "—"}${v.bmiCategory ? ` (${v.bmiCategory})` : ""}${weightFlag ? ` · ${weightFlag.detail}` : ""}`,
      });
    }

    if (assessments.length > 0) {
      const a = assessments[0];
      list.push({
        id: `scale-${a.id}`,
        date: toCalendarDate(a.administeredAt) ?? a.administeredAt,
        category: "scale",
        title: `${a.title}: Score ${a.totalScore}/${a.maxScore}`,
        detail: `${a.severity}${a.flags.length > 0 ? " (Safety Alert flagged)" : ""}`,
      });
    }

    if (labHistory.length > 0) {
      const lab = labHistory[0];
      list.push({
        id: `lab-${lab.id}`,
        date: toCalendarDate(lab.date) ?? lab.date,
        category: "lab",
        title: `Lab Result: ${lab.testName}`,
        detail: `${formatLabValue(lab.value, lab.unit)}${lab.flag ? ` (${lab.flag})` : ""}`,
      });
    }

    const recentDocument = [...documents].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    if (recentDocument) {
      list.push({
        id: `doc-${recentDocument.id}`,
        date: toCalendarDate(recentDocument.updatedAt) ?? recentDocument.updatedAt,
        category: "document",
        title: recentDocument.title,
        detail: `${documentTypeLabel(recentDocument.documentType)} · ${recentDocument.status}`,
      });
    }

    return list.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
  }, [encounters, medications, vitals, assessments, labHistory, documents]);

  const filteredTimelineChanges = useMemo(() => {
    if (timelineFilter === "all") return recentChanges;
    return recentChanges.filter((item) => item.category === timelineFilter);
  }, [recentChanges, timelineFilter]);

  const activeMedications = medications.filter((medication) => medication.status === "active");
  const latestVitals = vitals[0] || null;

  // Each rule belongs to the medication string used by the monitoring evaluator.
  // Surface the most urgent requirement instead of the first matching protocol.
  function findMedicationMonitoring(medication: MedicationRecord) {
    const name = medication.display_text || medication.medication_name;
    const rank = { overdue: 3, due: 2, "due-soon": 1, current: 0 } as const;
    return monitoring.filter((entry) => entry.medication === name)
      .sort((a, b) => rank[b.status] - rank[a.status])[0];
  }

  if (isLoading || snapshotError || snapshotPatientId !== patient.id) {
    return (
      <div className="overview-container bg-slate-50 min-h-screen text-slate-900">
        <AsyncSection
          loading={isLoading || (!snapshotError && snapshotPatientId !== patient.id)}
          error={snapshotError}
          isEmpty={false}
          hasLoadedOnce={false}
          loadingMessage="Loading clinical overview…"
          emptyMessage=""
          onRetry={clinical.refresh}
        >
          <div />
        </AsyncSection>
      </div>
    );
  }

  // =========================================================================
  // Sections. Every section shares the OverviewCard anatomy, and every line
  // shows its highlight with the source detail one click away.
  // =========================================================================
  const TILE_IDS = ["medications", "measures", "results", "snapshot"] as const;
  type TileId = (typeof TILE_IDS)[number];
  const tileVisibility: Record<TileId, OverviewVisibilityKey> = {
    medications: "showMedications", measures: "showMeasures", results: "showResults", snapshot: "showSnapshot",
  };
  const isShown = (key: OverviewVisibilityKey) => preferences.overview[key] ?? preferences.headerDensity !== "minimal";
  const isTile = (id: OverviewCardId): id is TileId => (TILE_IDS as readonly string[]).includes(id);
  const orderedTiles = resolvedCardOrder.filter(isTile).filter((id) => isShown(tileVisibility[id]));
  const collapsed = (cardId: OverviewCardId) => preferences.overview.collapsedCards[cardId] || false;

  function tileMenu(cardId: TileId) {
    const index = orderedTiles.indexOf(cardId);
    const earlier = orderedTiles[index - 1];
    const later = orderedTiles[index + 1];
    return <OverviewCardMenu cardId={cardId} isPinned={preferences.overview.pinnedCards?.[cardId] || false} isCollapsed={collapsed(cardId)}
      hideKey={tileVisibility[cardId]} onTogglePin={togglePinCard} onToggleCollapse={toggleCollapse} onHide={hideCard}
      onMove={{ earlier: earlier ? () => moveCard(cardId, earlier) : null, later: later ? () => moveCard(cardId, later) : null }} />;
  }

  function monitoringTiming(entry: (typeof monitoring)[number]) {
    if (entry.lastDoneDate == null) return "no qualifying result on file";
    if (entry.daysRemaining != null && entry.daysRemaining >= 0) return `${entry.daysRemaining}d remaining`;
    return `${Math.abs(entry.daysRemaining ?? 0)}d past due`;
  }

  function renderMedicationsTile() {
    return <OverviewCard key="medications" cardId="medications" title="Medications" collapsed={collapsed("medications")} menu={tileMenu("medications")}
      action={onNavigateSection ? { label: "Meds", onClick: () => onNavigateSection("Meds") } : null}>
      {activeMedications.length === 0 ? <p className="ov-empty">No active medications recorded.</p> : activeMedications.map((med) => {
        const name = med.display_text || med.medication_name;
        const entries = monitoring.filter((entry) => entry.medication === name);
        const top = findMedicationMonitoring(med);
        const regimen = [med.dose || med.strength, med.route, med.frequency, med.indication ? `for ${med.indication}` : null].filter(Boolean).join(" · ");
        const flagged = top && top.status !== "current";
        const statusText = top
          ? top.status === "overdue" ? `${top.requiredMeasure} Overdue`
            : top.status === "due" ? `${top.requiredMeasure} Due`
              : top.status === "due-soon" ? `${top.requiredMeasure} Due soon` : `${top.requiredMeasure} current`
          : monitoringPolicyError ? "Monitoring unavailable" : monitoringRules === null ? "Loading monitoring policy…" : null;
        return <OverviewLine key={med.id} tone={flagged ? "warning" : undefined} data-medication-id={med.id} detail={<>
          <p>{regimen || "Dosing instructions not recorded"}{med.prescriber ? ` · Prescriber: ${med.prescriber}` : ""}</p>
          {entries.length > 0
            ? <ul className="ov-detail-list">{entries.map((entry) => <li key={entry.ruleId}>
              {entry.requiredMeasure} — {entry.intervalLabel}, {monitoringTiming(entry)}, {monitoringPolicySourceLabel(entry.policySource)}
              {entry.policySource === "patient" && entry.policyReason ? ` · reason: ${entry.policyReason}` : ""}
            </li>)}</ul>
            : monitoringRules && !monitoringPolicyError && <p>No monitoring rule applies to this medication.</p>}
          {top && <Button size="sm" variant="secondary" onClick={() => {
            if (top.measureKind === "vital") setIsVitalsModalOpen(true);
            else onNavigateSection?.("Labs");
          }}>{top.measureKind === "vital" ? "Open flowsheet" : "Review labs"}</Button>}
        </>}>
          <strong>{med.medication_name}</strong>
          {regimen && <span className="ov-muted"> {regimen}</span>}
          {statusText && <span className={`ov-status ${flagged ? "is-flagged" : ""}`}>
            <Icon name={flagged ? "warning" : top ? "check_circle" : "info"} size="sm" />{statusText}
          </span>}
        </OverviewLine>;
      })}
    </OverviewCard>;
  }

  function renderMeasuresTile() {
    return <OverviewCard key="measures" cardId="measures" title="Measures" collapsed={collapsed("measures")} menu={tileMenu("measures")}
      action={{ label: "Scales", onClick: () => setIsAssessmentsModalOpen(true) }}>
      {clinicalBrief.trajectories.length === 0 && <p className="ov-empty">No PHQ-9, GAD-7, or ASRS trajectory is available yet.</p>}
      {clinicalBrief.trajectories.map((trajectory) => {
        const latest = trajectory.scores[trajectory.scores.length - 1];
        const previous = trajectory.scores.length > 1 ? trajectory.scores[trajectory.scores.length - 2] : null;
        const delta = previous && latest ? latest.score - previous.score : null;
        return <OverviewLine key={trajectory.instrument} meta={formatClinicalDate(latest?.date)} detail={<>
          <p>{trajectory.scores.map((score) => `${formatClinicalDate(score.date)}: ${score.score}`).join(" → ")}</p>
          <p>{delta === null ? "Baseline — no earlier score on file." : delta === 0 ? "No change from the previous score." : `${delta > 0 ? "Up" : "Down"} ${Math.abs(delta)} points from the previous score.`}</p>
        </>}>
          <strong>{trajectory.label}</strong> <span className="ov-value-lg">{latest?.score ?? "—"}</span>
          <span className="ov-muted"> {trajectory.latestSeverity}</span>
          {delta !== null && delta !== 0 && <span className="ov-delta">{delta > 0 ? "↑" : "↓"}{Math.abs(delta)}</span>}
        </OverviewLine>;
      })}
      {latestVitals ? <OverviewLine meta={formatClinicalDate(latestVitals.recordedAt)} tone={latestVitals.flags.length > 0 ? "warning" : undefined} detail={<>
        {latestVitals.flags.map((flag) => <p key={`${flag.type}-${flag.label}`}>{flag.label}: {flag.detail}</p>)}
        {latestVitals.bmiCategory && <p>BMI category: {latestVitals.bmiCategory}</p>}
        <Button size="sm" variant="secondary" onClick={() => setIsVitalsModalOpen(true)}>Open flowsheet</Button>
      </>}>
        <strong>Vitals</strong> <span className="ov-value">
          BP {latestVitals.bpText || (latestVitals.systolic ? `${latestVitals.systolic}/${latestVitals.diastolic}` : "—")}
          {" · "}HR {latestVitals.heartRate ?? "—"}
          {" · "}Wt {latestVitals.weightLbs != null ? `${latestVitals.weightLbs} lb` : "—"}
          {" · "}BMI {latestVitals.bmi ?? "—"}
        </span>
      </OverviewLine> : <p className="ov-empty">No authoritative vital-sign measurement is on file.</p>}
    </OverviewCard>;
  }

  function renderLabsTile() {
    return <OverviewCard key="results" cardId="results" title="Labs" collapsed={collapsed("results")} menu={tileMenu("results")}
      action={onNavigateSection ? { label: "Labs", onClick: () => onNavigateSection("Labs") } : null}>
      <OverviewResultsSummary patientId={patient.id} observations={observations} />
    </OverviewCard>;
  }

  function renderVisitsTile() {
    const previous = clinicalBrief.previousVisit;
    return <OverviewCard key="snapshot" cardId="snapshot" title="Visits" collapsed={collapsed("snapshot")} menu={tileMenu("snapshot")}
      action={onNavigateView ? { label: "Schedule", onClick: () => onNavigateView("today") } : null}>
      {previous ? <OverviewLine meta={formatCalendarDate(previous.date)} detail={<>
        <p>{clinicalBrief.carryForward || "No explicit next-visit instructions documented in the signed encounter."}</p>
        <SourceNote>{clinicalBrief.carryForwardSource === "follow-up" ? "Source: Signed next-visit follow-up plan" : "Source: Signed encounter treatment plan"}</SourceNote>
        {onNavigateSection && <Button size="sm" variant="secondary" onClick={() => onNavigateSection("History")}>Review signed visit</Button>}
      </>}>
        <span className="ov-field">Last visit</span>
        <strong>{previous.type}</strong>
        {clinicalBrief.carryForward && <span className="ov-clamp">{clinicalBrief.carryForward}</span>}
      </OverviewLine> : <OverviewLine>
        <span className="ov-field">Last visit</span>
        <span className="ov-muted">No signed prior visit on file</span>
      </OverviewLine>}
      <OverviewLine meta={nextVisitInfo?.time}>
        <span className="ov-field">Next visit</span>
        <strong>{nextVisitInfo ? formatCalendarDate(nextVisitInfo.date) : "Not scheduled"}</strong>
        {nextVisitInfo && <span className="ov-muted"> {nextVisitInfo.type} ({nextVisitInfo.status})</span>}
      </OverviewLine>
    </OverviewCard>;
  }

  function renderAttention() {
    // Color carries urgency only; the category is a visible word so nothing
    // depends on remembering what a color means.
    const severityRank = { critical: 0, warning: 1, info: 2 } as const;
    const categoryOrder: OverviewAttentionItem["category"][] = ["safety", "allergy", "surveillance", "unreviewed", "metabolic", "unsigned"];
    const categoryLabel: Record<OverviewAttentionItem["category"], { label: string; icon: string }> = {
      safety: { label: "Safety", icon: "emergency_home" },
      allergy: { label: "Allergy", icon: "allergy" },
      surveillance: { label: "Meds", icon: "medication" },
      unreviewed: { label: "Labs", icon: "science" },
      metabolic: { label: "Vitals", icon: "monitor_heart" },
      unsigned: { label: "Notes", icon: "edit_note" },
    };
    const ordered = [...attentionItems].sort((a, b) =>
      severityRank[a.severity] - severityRank[b.severity] || categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category));
    const urgent = ordered.filter((item) => item.severity === "critical").length;
    return <section className="overview-attention-strip" aria-label="Clinical attention">
      <header className="overview-attention-header">
        <h2>Needs attention</h2>
        {ordered.length > 0 && <span className="overview-attention-summary">
          {ordered.length} {ordered.length === 1 ? "item" : "items"}
          {urgent > 0 && <span className="overview-attention-urgent">{urgent} urgent</span>}
        </span>}
      </header>
      {ordered.length === 0 && <p>{monitoringPolicyError ? "Monitoring status unavailable" : monitoringRules === null ? "Monitoring status unavailable while policy loads" : "No attention items identified in the loaded records"}</p>}
      {ordered.length > 0 && <ul className="overview-attention-list">
        {ordered.map((item) => {
          const category = categoryLabel[item.category];
          return <li className={`overview-attention-row ${item.severity}`} key={item.id} data-attention-category={item.category}>
            <span className="overview-attention-category"><Icon name={category.icon} size="sm" />{category.label}</span>
            <div className="overview-attention-body">
              <div className="overview-attention-title">
                <strong>{item.title}</strong>
                {item.when && <span className="overview-attention-when">{item.when}</span>}
              </div>
              <p>{item.description}</p>
              {item.detail && <details className="overview-attention-detail"><summary>Policy details</summary><p>{item.detail}</p></details>}
            </div>
            <Button size="sm" variant="secondary" onClick={() => {
              if (item.targetModal === "vitals") setIsVitalsModalOpen(true);
              else if (item.targetModal === "assessments") setIsAssessmentsModalOpen(true);
              else if (item.targetModal === "admin" && onOpenAdminDrawer) onOpenAdminDrawer();
              else if (item.targetSection && onNavigateSection) onNavigateSection(item.targetSection);
            }}>{item.actionLabel}</Button>
          </li>;
        })}
      </ul>}
    </section>;
  }

  function renderTimelineCard() {
    if (!preferences.overview.showTimeline) return null;
    const filters = [["all", `All (${recentChanges.length})`], ["visit", "Visits"], ["med", "Meds"], ["vital", "Vitals"], ["scale", "Scales"], ["lab", "Labs"]] as const;
    const categoryLabel = { visit: "Visit", med: "Med", vital: "Vital", scale: "Scale", lab: "Lab", document: "Document" } as const;
    return <OverviewCard cardId="timeline" title="Recent changes" collapsed={collapsed("timeline")}
      menu={<OverviewCardMenu cardId="timeline" isCollapsed={collapsed("timeline")} hideKey="showTimeline" onToggleCollapse={toggleCollapse} onHide={hideCard} />}
      action={onNavigateSection ? { label: "Timeline", onClick: () => onNavigateSection("History") } : null}>
      <div className="overview-timeline-filter-bar" role="group" aria-label="Filter recent changes">
        {filters.map(([value, label]) => <button key={value} type="button" aria-pressed={timelineFilter === value}
          className={`overview-timeline-filter-btn ${timelineFilter === value ? "active" : ""}`} onClick={() => setTimelineFilter(value)}>{label}</button>)}
      </div>
      {filteredTimelineChanges.length === 0
        ? <p className="ov-empty">No recent clinical events match the selected category.</p>
        : filteredTimelineChanges.map((item) => <OverviewLine key={item.id} label={categoryLabel[item.category]} data-timeline-type={item.category}
          meta={<time dateTime={item.date}>{formatCalendarDate(item.date)}</time>}>
          <strong>{item.title}</strong>
          <span className="ov-sub">{item.detail}</span>
        </OverviewLine>)}
    </OverviewCard>;
  }

  function renderCareTeamLine() {
    return <div className="ov-line ov-line--labeled" data-care-team="">
      <div className="ov-line-summary">
        <span className="ov-line-label">Care team</span>
        <div className="ov-line-main">
          <AsyncSection loading={!administration && !administrationError} error={administrationError} isEmpty={false}
            hasLoadedOnce={Boolean(administration)} loadingMessage="Loading care details…" emptyMessage=""
            onRetry={() => setAdministrationReloadKey((value) => value + 1)}>
            {administration && (() => {
              const pharmacy = preferredPharmacy(administration.pharmacies);
              const members = administration.careNetwork.filter((member) => member.status === "active");
              const contacts = administration.relatedPeople
                .filter((person) => person.status === "active" && person.role === "emergency-contact")
                .sort((a, b) => a.priority - b.priority);
              const recorded: string[] = [];
              const missing: string[] = [];
              if (members.length > 0) recorded.push(members.map((member) => `${member.name} (${careNetworkRoleLabel(member.role)})`).join(", "));
              else missing.push("care team");
              if (pharmacy) recorded.push(`Pharmacy: ${pharmacy.name}${pharmacy.phone ? ` ${pharmacy.phone}` : ""}`);
              else missing.push("pharmacy");
              if (contacts.length > 0) recorded.push(`Emergency: ${contacts.map((contact) => `${contact.name}${contact.relationship ? ` (${contact.relationship})` : ""}${contact.phone ? ` ${contact.phone}` : " · phone not recorded"}`).join(", ")}`);
              else missing.push("emergency contact");
              return <>
                {recorded.join(" · ")}
                {missing.length > 0 && <span className="ov-muted">{recorded.length > 0 ? " · " : ""}Not recorded: {missing.join(", ")}</span>}
              </>;
            })()}
          </AsyncSection>
        </div>
        {onOpenAdminDrawer && <span className="ov-line-meta">
          <button type="button" className="ov-link" onClick={onOpenAdminDrawer}>Patient info →</button>
        </span>}
      </div>
    </div>;
  }

  function renderBackgroundCard() {
    const showHistory = isShown("showHistory");
    return <OverviewCard cardId="history" title={showHistory ? "Background" : "Care team"} collapsed={showHistory && collapsed("history")}
      menu={showHistory ? <OverviewCardMenu cardId="history" isCollapsed={collapsed("history")} hideKey="showHistory" onToggleCollapse={toggleCollapse} onHide={hideCard} /> : null}
      action={showHistory && onNavigateSection ? { label: "History", onClick: () => onNavigateSection("History") } : null}>
      <OverviewHistorySummary items={psychiatricHistory} assessments={assessments} showHistory={showHistory}
        onDocuments={() => onNavigateSection?.("Documents")} careTeam={renderCareTeamLine()} />
    </OverviewCard>;
  }

  const tileRenderers: Record<TileId, () => ReactNode> = {
    medications: renderMedicationsTile, measures: renderMeasuresTile, results: renderLabsTile, snapshot: renderVisitsTile,
  };
  const hiddenSections = ([
    ["showMedications", "Medications"], ["showMeasures", "Measures"], ["showResults", "Labs"], ["showSnapshot", "Visits"],
    ["showTimeline", "Recent changes"], ["showHistory", "Background"],
  ] as const).filter(([key]) => !isShown(key));

  return (
    <div className="overview-container bg-slate-50 min-h-screen text-slate-900">
      <div className="overview-canvas ov-page">
        {renderAttention()}
        {(!isShown("showSnapshot") || collapsed("snapshot")) && (
          <div className="overview-attention-recovery" role="status">
            <span>Visit continuity hidden</span>
            <Button size="sm" variant="secondary" onClick={() => {
              if (!onUpdatePreferences) return;
              const next = { ...preferences, overview: {
                ...preferences.overview, showSnapshot: true,
                collapsedCards: { ...preferences.overview.collapsedCards, snapshot: false },
              } };
              savePreferences(next);
              onUpdatePreferences(next);
            }}>Review visit summary</Button>
          </div>
        )}
        {orderedTiles.length > 0 && <div className="ov-now" aria-label="Current clinical state">
          {orderedTiles.map((id) => tileRenderers[id]())}
        </div>}
        {renderTimelineCard()}
        {renderBackgroundCard()}

        {hiddenSections.length > 0 && (
          <div className="overview-restore-bar">
            <span>Hidden:</span>
            {hiddenSections.map(([key, label]) => (
              <Button key={key} className="overview-restore-pill" size="sm" icon="add" onClick={() => showCard(key)}>Show {label}</Button>
            ))}
            <Button className="overview-reset-pill" size="sm" onClick={resetCards}>Reset layout</Button>
          </div>
        )}

        {/* Modals */}
        <PatientVitalsModal
          patient={patient}
          isOpen={isVitalsModalOpen}
          onClose={() => setIsVitalsModalOpen(false)}
          onVitalsRecorded={(v) => {
            clinical.refresh();
            if (onToast) onToast(`Recorded vitals: BP ${v.bpText || "N/A"}, HR ${v.heartRate || "N/A"}`);
          }}
        />

        <PatientAssessmentsModal
          patient={patient}
          isOpen={isAssessmentsModalOpen}
          onClose={() => setIsAssessmentsModalOpen(false)}
          onAssessmentRecorded={(a) => {
            clinical.refresh();
            if (onToast) onToast(`Recorded ${a.title}: Score ${a.totalScore}/${a.maxScore}`);
          }}
          onInsertToNote={() => {
            if (onToast) onToast("Inserted assessment into active note!");
          }}
        />
      </div>
    </div>
  );
}
