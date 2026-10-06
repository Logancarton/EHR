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

const EMPTY_CLINICAL_SNAPSHOT: Required<ClinicalRecordSnapshot> = {
  problems: [], allergies: [], medications: [], observations: [], vitals: [], psychiatricHistory: [],
  assessments: [], encounters: [], upcomingAppointments: [], documents: [],
};

function OverviewCardMenu({
  cardId,
  isPinned,
  span,
  isCollapsed,
  hideKey,
  onTogglePin,
  onToggleSpan,
  onToggleCollapse,
  onHide,
}: {
  cardId: OverviewCardId;
  isPinned: boolean;
  span: number;
  isCollapsed: boolean;
  hideKey: OverviewVisibilityKey;
  onTogglePin: (cardId: OverviewCardId) => void;
  onToggleSpan: (cardId: OverviewCardId) => void;
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

  const closeMenu = () => {
    if (detailsRef.current) detailsRef.current.open = false;
  };

  return (
    <details ref={detailsRef} className="overview-card-menu">
      <summary
        className="card-header-btn"
        aria-label="Card layout and display options"
        title="Card options"
      >
        <Icon name="more_vert" />
      </summary>
      <div className="overview-card-menu-dropdown" role="menu">
        <button
          type="button"
          className="overview-card-menu-item"
          role="menuitem"
          onClick={() => {
            closeMenu();
            onTogglePin(cardId);
          }}
        >
          <Icon name="push_pin" />
          <span>{isPinned ? "Unpin card" : "Pin to top"}</span>
        </button>
        <button
          type="button"
          className="overview-card-menu-item"
          role="menuitem"
          onClick={() => {
            closeMenu();
            onToggleSpan(cardId);
          }}
        >
          <Icon name={span === 2 ? "close_fullscreen" : "open_in_full"} />
          <span>{span === 2 ? "Narrow (1 column)" : "Expand (full width)"}</span>
        </button>
        <button
          type="button"
          className="overview-card-menu-item"
          role="menuitem"
          onClick={() => {
            closeMenu();
            onToggleCollapse(cardId);
          }}
        >
          <Icon name={isCollapsed ? "expand_more" : "expand_less"} />
          <span>{isCollapsed ? "Expand card" : "Collapse card"}</span>
        </button>
        <button
          type="button"
          className="overview-card-menu-item danger"
          role="menuitem"
          onClick={() => {
            closeMenu();
            onHide(hideKey);
          }}
        >
          <Icon name="visibility_off" />
          <span>Hide card</span>
        </button>
      </div>
    </details>
  );
}

/** Zero-padded minutes past midnight, so "09:00 AM" sorts before "10:00 AM" and "01:00 PM". */
function timeSortKey(time: string): string {
  return String(timeStringToMinutes(time)).padStart(4, "0");
}

/** Classifies whether a clinical diagnosis is psychiatric or medical. */
function isPsychProblem(code?: string | null, text?: string): boolean {
  if (code && /^F\d+/i.test(code.trim())) return true;
  const lower = (text || "").toLowerCase();
  const psychTerms = [
    "anxiety", "adhd", "depression", "depressive", "bipolar", "ptsd", "panic", "schizo",
    "ocd", "obsessive", "insomnia", "sleep", "eating disorder", "anorexia", "bulimia",
    "borderline", "personality", "substance", "alcohol", "cannabis", "opioid", "mood",
    "phobia", "trauma", "dysthymia", "cyclothymia", "psychosis", "autism", "neurodevelopmental"
  ];
  return psychTerms.some((t) => lower.includes(t));
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
  const [draggedCardId, setDraggedCardId] = useState<OverviewCardId | null>(null);
  const [dropTargetCardId, setDropTargetCardId] = useState<OverviewCardId | null>(null);
  const [timelineFilter, setTimelineFilter] = useState<"all" | "visit" | "med" | "vital" | "scale" | "lab" | "document">("all");

  const clinical = usePatientClinicalSnapshot(patient.id);
  const snapshot = clinical.snapshot;
  const problemRecords = snapshot?.problems ?? null;
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

  function toggleCardSpan(cardId: OverviewCardId) {
    if (!onUpdatePreferences) return;
    const currentSpan =
      preferences.overview.cardSpans?.[cardId] ?? (cardId === "snapshot" || cardId === "timeline" ? 2 : 1);
    const nextSpan = currentSpan === 2 ? 1 : 2;
    const next = {
      ...preferences,
      overview: {
        ...preferences.overview,
        cardSpans: {
          ...(preferences.overview.cardSpans || {}),
          [cardId]: nextSpan as 1 | 2,
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

  function handleDragStart(cardId: OverviewCardId, event: React.DragEvent) {
    setDraggedCardId(cardId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", cardId);
  }

  function handleDragOver(cardId: OverviewCardId, event: React.DragEvent) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (dropTargetCardId !== cardId) {
      setDropTargetCardId(cardId);
    }
  }

  function handleDrop(targetCardId: OverviewCardId, event: React.DragEvent) {
    event.preventDefault();
    const sourceCardId = event.dataTransfer.getData("text/plain") as OverviewCardId;
    setDraggedCardId(null);
    setDropTargetCardId(null);

    if (!sourceCardId || sourceCardId === targetCardId || !onUpdatePreferences) return;

    const currentOrder = [...resolvedCardOrder];
    const sourceIndex = currentOrder.indexOf(sourceCardId);
    const targetIndex = currentOrder.indexOf(targetCardId);

    if (sourceIndex === -1 || targetIndex === -1) return;

    currentOrder.splice(sourceIndex, 1);
    currentOrder.splice(targetIndex, 0, sourceCardId);

    const next = {
      ...preferences,
      overview: {
        ...preferences.overview,
        cardOrder: currentOrder,
      },
    };
    savePreferences(next);
    onUpdatePreferences(next);
  }

  function handleDragEnd() {
    setDraggedCardId(null);
    setDropTargetCardId(null);
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
        title: `Safety Alert: ${f.title} (${formatClinicalDate(f.administeredAt)})`,
        description: f.flag,
        actionLabel: "Review Scale",
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
          title: `Vitals Alert: ${f.label}`,
          description: f.detail,
          actionLabel: "View Flowsheet",
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
        title: `Monitoring ${statusLabel}: ${highest.canonicalMedication}`,
        description: `${medication}: ${detail}`,
        actionLabel: onlyVitals ? "View Flowsheet" : "Review Labs",
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
        actionLabel: "Review Labs",
        targetSection: "Labs",
      });
    }

    // Unassessed allergies status
    if (allergies.length === 0) {
      items.push({
        id: "alert-unassessed-allergies",
        category: "allergy",
        severity: "warning",
        title: "Allergies Unassessed",
        description: "No allergies or NKDA status currently documented in patient chart.",
        actionLabel: "Assess Allergies",
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
        title: `Unsigned Draft: ${unsigned.type}`,
        description: `Encounter from ${formatCalendarDate(unsigned.date)} awaits clinician review and signature.`,
        actionLabel: "Resume Note",
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
        detail: `${lab.value} ${lab.unit}${lab.flag ? ` (${lab.flag})` : ""}`,
      });
    }

    const recentDocument = [...documents].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    if (recentDocument) {
      list.push({
        id: `doc-${recentDocument.id}`,
        date: toCalendarDate(recentDocument.updatedAt) ?? recentDocument.updatedAt,
        category: "document",
        title: recentDocument.title,
        detail: `${recentDocument.documentType} · ${recentDocument.status}`,
      });
    }

    return list.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
  }, [encounters, medications, vitals, assessments, labHistory, documents]);

  const filteredTimelineChanges = useMemo(() => {
    if (timelineFilter === "all") return recentChanges;
    return recentChanges.filter((item) => item.category === timelineFilter);
  }, [recentChanges, timelineFilter]);

  const activeMedications = medications.filter((medication) => medication.status === "active");
  const activeProblems = (problemRecords || []).filter((problem) => problem.status === "active");
  const latestVitals = vitals[0] || null;


  // Group problems into Psychiatric Primary vs Medical Comorbidities
  const psychProblems = useMemo(
    () => activeProblems.filter((p) => isPsychProblem(p.code, p.display_text)),
    [activeProblems]
  );
  const medicalProblems = useMemo(
    () => activeProblems.filter((p) => !isPsychProblem(p.code, p.display_text)),
    [activeProblems]
  );

  // Each rule belongs to the medication string used by the monitoring evaluator.
  // Surface the most urgent requirement instead of the first matching protocol.
  function findMedicationMonitoring(medication: MedicationRecord) {
    const name = medication.display_text || medication.medication_name;
    const rank = { overdue: 3, due: 2, "due-soon": 1, current: 0 } as const;
    return monitoring.filter((entry) => entry.medication === name)
      .sort((a, b) => rank[b.status] - rank[a.status])[0];
  }

  const hasHiddenCards =
    !preferences.overview.showSnapshot ||
    !preferences.overview.showDiagnoses ||
    !preferences.overview.showMedications ||
    !preferences.overview.showTimeline ||
    [preferences.overview.showMeasures, preferences.overview.showResults, preferences.overview.showHistory].some((value) => (value ?? preferences.headerDensity !== "minimal") === false);

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
  // Visit continuity and trajectory
  // =========================================================================
  function renderSnapshotCard() {
    if (!preferences.overview.showSnapshot) return null;
    const isCollapsed = preferences.overview.collapsedCards.snapshot || false;
    const isPinned = preferences.overview.pinnedCards?.snapshot || false;
    const span = preferences.overview.cardSpans?.snapshot ?? 1;
    const isDragging = draggedCardId === "snapshot";
    const isDropTarget = dropTargetCardId === "snapshot" && draggedCardId !== "snapshot";

    return (
      <section
        key="snapshot"
        className={`card overview-card-container ${span === 2 ? "col-span-2" : ""} bg-white rounded-xl border border-slate-200 shadow-xs p-5 flex flex-col gap-6 ${isCollapsed ? "is-collapsed" : ""} ${isDragging ? "is-dragging" : ""} ${isDropTarget ? "drop-target-active" : ""}`}
        onDragOver={(e) => handleDragOver("snapshot", e)}
        onDrop={(e) => handleDrop("snapshot", e)}
      >
        <div className="card-heading flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="card-heading-title flex items-center gap-2">
            <span
              className="card-drag-handle text-slate-400 cursor-grab"
              draggable
              onDragStart={(e) => handleDragStart("snapshot", e)}
              onDragEnd={handleDragEnd}
              title="Drag to rearrange card"
            >
              <Icon name="drag_indicator" />
            </span>
            <div>
              <span className="eyebrow text-xs uppercase tracking-wider text-slate-400 font-bold block mb-0.5">
                Visit continuity
              </span>
              <h2 className="text-base font-bold text-slate-900 m-0">Last Visit & Follow-up</h2>
            </div>
          </div>
          <div className="overview-card-header-actions">
            <OverviewCardMenu
              cardId="snapshot"
              isPinned={isPinned}
              span={span}
              isCollapsed={isCollapsed}
              hideKey="showSnapshot"
              onTogglePin={togglePinCard}
              onToggleSpan={toggleCardSpan}
              onToggleCollapse={toggleCollapse}
              onHide={hideCard}
            />
          </div>
        </div>

        {!isCollapsed && (
          <div className="overview-snapshot-content">
            {/* 2. Last Treatment Plan & Carry-Forward */}
            <div className="overview-continuity-section flex flex-col gap-3" aria-label="Last treatment plan">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="text-blue-600"><Icon name="assignment" /></span>
                  <span className="font-semibold text-sm text-slate-900">Last Treatment Plan & Carry-Forward</span>
                </div>
                <span className="text-xs font-medium text-slate-600 bg-slate-50 border border-slate-200 px-2.5 py-0.5 rounded-full">
                  {clinicalBrief.previousVisit
                    ? `Visit ${formatCalendarDate(clinicalBrief.previousVisit.date)} · Signed`
                    : "No signed prior visit on file"}
                </span>
              </div>
              <div>
                {clinicalBrief.previousVisit ? (
                  <div className="flex flex-col gap-2">
                    <strong className="text-sm font-semibold text-slate-900">
                      {clinicalBrief.previousVisit.type}
                    </strong>
                    <p className="text-sm text-slate-700 leading-relaxed m-0" title={clinicalBrief.carryForward || undefined}>
                      {clinicalBrief.carryForward ||
                        "No explicit next-visit instructions documented in the signed encounter."}
                    </p>
                    <span className="inline-flex items-center gap-1.5 text-xs text-slate-400 font-medium pt-1">
                      <Icon name="history_edu" size="sm" />
                      {clinicalBrief.carryForwardSource === "follow-up"
                        ? "Source: Signed next-visit follow-up plan"
                        : "Source: Signed encounter treatment plan"}
                    </span>
                    {onNavigateSection && <Button size="sm" variant="secondary" onClick={() => onNavigateSection("History")}>Review signed visit</Button>}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500 m-0 italic">
                    A signed encounter will become the continuity source for the next visit.
                  </p>
                )}
              </div>
            </div>

          {/* Next Visit & schedule CTA */}
          <div className="flex items-start justify-between gap-3 pt-3 border-t border-slate-100">
            <div className="flex items-start gap-3">
              <span className="text-slate-500 mt-0.5"><Icon name="event_available" /></span>
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-slate-500">Next Visit</span>
                <strong className="text-sm font-semibold text-slate-900">
                  {nextVisitInfo
                    ? `${formatCalendarDate(nextVisitInfo.date)} · ${nextVisitInfo.time}`
                    : "Not scheduled"}
                </strong>
                <span className="text-xs text-slate-500">
                  {nextVisitInfo ? `${nextVisitInfo.type} (${nextVisitInfo.status})` : "No upcoming appointment on file"}
                </span>
              </div>
            </div>
            {onNavigateView && (
              <button
                type="button"
                className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer transition-colors shrink-0"
                onClick={() => onNavigateView("today")}
              >
                Schedule
              </button>
            )}
          </div>
          </div>
        )}
      </section>
    );
  }

  function renderSupportingCard(cardId: "measures" | "results" | "history", title: string, visibilityKey: OverviewVisibilityKey, content: ReactNode) {
    const visible = preferences.overview[visibilityKey] ?? preferences.headerDensity !== "minimal";
    if (!visible) return null;
    const isCollapsed = preferences.overview.collapsedCards[cardId] || false;
    const isPinned = preferences.overview.pinnedCards?.[cardId] || false;
    const span = preferences.overview.cardSpans?.[cardId] ?? (cardId === "measures" ? 1 : 2);
    return <section key={cardId} className={`card overview-card-container ${span === 2 ? "col-span-2" : ""} ${isCollapsed ? "is-collapsed" : ""} ${dropTargetCardId === cardId ? "drop-target-active" : ""}`}
      onDragOver={(event) => handleDragOver(cardId, event)} onDrop={(event) => handleDrop(cardId, event)}>
      <div className="card-heading flex items-center justify-between">
        <div className="card-heading-title flex items-center gap-2">
          <span className="card-drag-handle" draggable onDragStart={(event) => handleDragStart(cardId, event)} onDragEnd={handleDragEnd} title="Drag to rearrange card"><Icon name="drag_indicator" /></span>
          <h2>{title}</h2>
        </div>
        <OverviewCardMenu cardId={cardId} isPinned={isPinned} span={span} isCollapsed={isCollapsed} hideKey={visibilityKey}
          onTogglePin={togglePinCard} onToggleSpan={toggleCardSpan} onToggleCollapse={toggleCollapse} onHide={hideCard} />
      </div>
      {!isCollapsed && content}
    </section>;
  }

  function renderMeasuresCard() {
    return renderSupportingCard("measures", "Symptoms & Measurements", "showMeasures", <>
            {/* 3. Measure Trajectories & Trends */}
            <div className="overview-continuity-section flex flex-col gap-3" aria-label="Measure trajectories">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="text-blue-600"><Icon name="trending_up" /></span>
                  <span className="font-semibold text-sm text-slate-900">Measure Trajectories & Trends</span>
                </div>
                <button
                  type="button"
                  className="overview-inline-action"
                  onClick={() => setIsAssessmentsModalOpen(true)}
                >
                  Review Scales &rarr;
                </button>
              </div>
              <div className="overview-measure-grid">
                  {clinicalBrief.trajectories.length === 0 && (
                    <p className="text-sm text-slate-500 m-0 italic">No PHQ-9, GAD-7, or ASRS trajectory is available yet.</p>
                  )}
                  {clinicalBrief.trajectories.map((trajectory) => {
                    const latest = trajectory.scores[trajectory.scores.length - 1];
                    const previous = trajectory.scores.length > 1 ? trajectory.scores[trajectory.scores.length - 2] : null;
                    const delta = previous != null ? latest.score - previous.score : null;
                    const deltaText =
                      delta !== null
                        ? delta < 0
                          ? `↓ ${Math.abs(delta)} pts vs previous score`
                          : delta > 0
                            ? `↑ ${delta} pts vs previous score`
                            : "→ Stable (no change)"
                        : "Baseline";
                    const deltaPillClass =
                      delta !== null && delta < 0
                        ? "bg-emerald-50 text-emerald-700"
                        : delta !== null && delta > 0
                          ? "bg-amber-50 text-amber-700"
                          : "bg-slate-100 text-slate-600";

                    return (
                      <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/50 flex flex-col gap-3" key={trajectory.instrument}>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-slate-800">{trajectory.label}</span>
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                            {trajectory.latestSeverity}
                          </span>
                        </div>
                        <div className="flex items-baseline gap-3">
                          <span className="text-3xl font-bold text-slate-900">{latest?.score ?? "—"}</span>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${deltaPillClass}`}>
                            {deltaText}
                          </span>
                        </div>
                        <span className="text-xs text-slate-600">Recorded {formatClinicalDate(latest?.date)}</span>
                        <div className="overview-score-history text-xs text-slate-400">
                          {trajectory.scores.map((s, idx) => (
                            <span key={idx} className="inline-flex items-center gap-1">
                              <span className="text-slate-600 font-medium">{formatClinicalDate(s.date)}: {s.score}</span>
                              {idx < trajectory.scores.length - 1 && <span className="text-slate-300">&rarr;</span>}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}

                  {/* Vitals / Metabolic Trend Card */}
                  {latestVitals ? (
                    <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/50 flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-slate-800">Latest vitals</span>
                        <button
                          type="button"
                          className="overview-inline-action"
                          onClick={() => setIsVitalsModalOpen(true)}
                        >
                          Flowsheet &rarr;
                        </button>
                      </div>
                      <div className="flex items-baseline gap-3">
                        <span className="text-3xl font-bold text-slate-900">
                          {latestVitals.bpText || (latestVitals.systolic ? `${latestVitals.systolic}/${latestVitals.diastolic}` : "BP recorded")}
                        </span>
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                          BP {latestVitals.recordedAt ? `· ${formatClinicalDate(latestVitals.recordedAt)}` : ""}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 flex items-center gap-2 pt-2 border-t border-slate-100">
                        <span>HR: <strong className="text-slate-700 font-medium">{latestVitals.heartRate ?? "—"} bpm</strong></span>
                        <span>&bull;</span>
                        <span>Wt: <strong className="text-slate-700 font-medium">{latestVitals.weightLbs ? `${latestVitals.weightLbs} lb` : "—"}</strong></span>
                        <span>&bull;</span>
                        <span>BMI: <strong className="text-slate-700 font-medium">{latestVitals.bmi ?? "—"}</strong></span>
                      </div>
                    </div>
                  ) : (
                    <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/50 flex flex-col gap-2">
                      <span className="text-sm font-semibold text-slate-800">Latest vitals</span>
                      <span className="text-xs text-slate-500 italic">No authoritative vital-sign measurement is on file.</span>
                    </div>
                  )}
              </div>
            </div>
    </>);
  }

  function renderAttention() {
    const clinical = attentionItems.filter((item) => item.category !== "unsigned").sort((a, b) => Number(b.severity === "critical") - Number(a.severity === "critical"));
    const workflow = attentionItems.filter((item) => item.category === "unsigned");
    return <section className="overview-attention-strip" aria-label="Clinical attention">
      <h2>Needs attention</h2>
      {attentionItems.length === 0 && <p>{monitoringPolicyError ? "Monitoring status unavailable" : monitoringRules === null ? "Monitoring status unavailable while policy loads" : "No attention items identified in the loaded records"}</p>}
      {([ ["Clinical", clinical], ["Visit tasks", workflow] ] as const).map(([label, items]) => items.length > 0 && <div key={label}>
        <h3>{label}</h3>
        {items.map((item) => <div className={`overview-attention-row ${item.severity}`} key={item.id}>
          <details open={item.severity === "critical"}>
            <summary><Icon name={item.severity === "critical" ? "error" : item.category === "unsigned" ? "edit_note" : "warning"} /><strong>{item.title}</strong></summary>
            <p>{item.description}</p>
          </details>
          <Button size="sm" variant={item.severity === "critical" ? "destructive" : "secondary"} onClick={() => {
            if (item.targetModal === "vitals") setIsVitalsModalOpen(true);
            else if (item.targetModal === "assessments") setIsAssessmentsModalOpen(true);
            else if (item.targetModal === "admin" && onOpenAdminDrawer) onOpenAdminDrawer();
            else if (item.targetSection && onNavigateSection) onNavigateSection(item.targetSection);
          }}>{item.actionLabel}</Button>
        </div>)}
      </div>)}
    </section>;
  }

  function renderTimelineCard() {
    if (!preferences.overview.showTimeline) return null;
    const isCollapsed = preferences.overview.collapsedCards.timeline || false;
    const isPinned = preferences.overview.pinnedCards?.timeline || false;
    const span = preferences.overview.cardSpans?.timeline ?? 2;
    const isDragging = draggedCardId === "timeline";
    const isDropTarget = dropTargetCardId === "timeline" && draggedCardId !== "timeline";

    return (
      <section
        key="timeline"
        className={`card overview-card-container ${span === 2 ? "col-span-2" : ""} bg-white rounded-xl border border-slate-200 shadow-xs p-5 flex flex-col gap-4 ${isCollapsed ? "is-collapsed" : ""} ${isDragging ? "is-dragging" : ""} ${isDropTarget ? "drop-target-active" : ""}`}
        onDragOver={(e) => handleDragOver("timeline", e)}
        onDrop={(e) => handleDrop("timeline", e)}
      >
        <div className="card-heading flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="card-heading-title flex items-center gap-2">
            <span
              className="card-drag-handle text-slate-400 cursor-grab"
              draggable
              onDragStart={(e) => handleDragStart("timeline", e)}
              onDragEnd={handleDragEnd}
              title="Drag to rearrange card"
            >
              <Icon name="drag_indicator" />
            </span>
            <div>
              <span className="eyebrow text-xs uppercase tracking-wider text-slate-400 font-bold block mb-0.5">
                Longitudinal activity
              </span>
              <h2 className="text-base font-bold text-slate-900 m-0">Recent Clinical Changes</h2>
            </div>
          </div>
          <div className="overview-card-header-actions flex items-center gap-2">
            {onNavigateSection && (
              <button
                type="button"
                className="card-primary-action-btn text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer transition-colors"
                onClick={() => onNavigateSection("History")}
              >
                Full Timeline &rarr;
              </button>
            )}
            <OverviewCardMenu
              cardId="timeline"
              isPinned={isPinned}
              span={span}
              isCollapsed={isCollapsed}
              hideKey="showTimeline"
              onTogglePin={togglePinCard}
              onToggleSpan={toggleCardSpan}
              onToggleCollapse={toggleCollapse}
              onHide={hideCard}
            />
          </div>
        </div>

        {!isCollapsed && (
          <div className="flex flex-col gap-3">
            {/* Category Filter Chips */}
            <div className="overview-timeline-filter-bar flex items-center gap-1.5 overflow-x-auto pb-1">
              <button
                type="button"
                className={`overview-timeline-filter-btn ${timelineFilter === "all" ? "active" : ""}`}
                onClick={() => setTimelineFilter("all")}
              >
                All ({recentChanges.length})
              </button>
              <button
                type="button"
                className={`overview-timeline-filter-btn ${timelineFilter === "visit" ? "active" : ""}`}
                onClick={() => setTimelineFilter("visit")}
              >
                Visits
              </button>
              <button
                type="button"
                className={`overview-timeline-filter-btn ${timelineFilter === "med" ? "active" : ""}`}
                onClick={() => setTimelineFilter("med")}
              >
                Meds
              </button>
              <button
                type="button"
                className={`overview-timeline-filter-btn ${timelineFilter === "vital" ? "active" : ""}`}
                onClick={() => setTimelineFilter("vital")}
              >
                Vitals
              </button>
              <button
                type="button"
                className={`overview-timeline-filter-btn ${timelineFilter === "scale" ? "active" : ""}`}
                onClick={() => setTimelineFilter("scale")}
              >
                Scales
              </button>
              <button
                type="button"
                className={`overview-timeline-filter-btn ${timelineFilter === "lab" ? "active" : ""}`}
                onClick={() => setTimelineFilter("lab")}
              >
                Labs
              </button>
            </div>

            <div className="divide-y divide-slate-100">
              {filteredTimelineChanges.length > 0 ? (
                filteredTimelineChanges.map((item) => (
                  <div key={item.id} className="py-3 flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                      <span className="timeline-dot shrink-0 mt-1" data-timeline-type={item.category} aria-hidden="true" />
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                            {item.category}
                          </span>
                          <strong className="text-sm font-semibold text-slate-900 truncate">{item.title}</strong>
                        </div>
                        <p className="text-xs text-slate-600 mt-1 m-0 line-clamp-2">{item.detail}</p>
                      </div>
                    </div>
                    <time className="text-xs text-slate-400 whitespace-nowrap shrink-0" dateTime={item.date}>
                      {formatCalendarDate(item.date)}
                    </time>
                  </div>
                ))
              ) : (
                <div className="text-xs text-slate-500 italic py-3">
                  No recent clinical events match the selected category.
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    );
  }

  // =========================================================================
  // Current clinical facts
  // =========================================================================
  function renderDiagnosesCard() {
    if (!preferences.overview.showDiagnoses) return null;
    const isCollapsed = preferences.overview.collapsedCards.diagnoses || false;
    const isPinned = preferences.overview.pinnedCards?.diagnoses || false;
    const span = preferences.overview.cardSpans?.diagnoses ?? 1;
    const isDragging = draggedCardId === "diagnoses";
    const isDropTarget = dropTargetCardId === "diagnoses" && draggedCardId !== "diagnoses";

    return (
      <section
        key="diagnoses"
        className={`card overview-card-container ${span === 2 ? "col-span-2" : ""} bg-white rounded-xl border border-slate-200 shadow-xs p-5 flex flex-col gap-4 ${isCollapsed ? "is-collapsed" : ""} ${isDragging ? "is-dragging" : ""} ${isDropTarget ? "drop-target-active" : ""}`}
        onDragOver={(e) => handleDragOver("diagnoses", e)}
        onDrop={(e) => handleDrop("diagnoses", e)}
      >
        <div className="card-heading flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="card-heading-title flex items-center gap-2">
            <span
              className="card-drag-handle text-slate-400 cursor-grab"
              draggable
              onDragStart={(e) => handleDragStart("diagnoses", e)}
              onDragEnd={handleDragEnd}
              title="Drag to rearrange card"
            >
              <Icon name="drag_indicator" />
            </span>
            <div>
              <span className="eyebrow text-xs uppercase tracking-wider text-slate-400 font-bold block mb-0.5">
                Problem list & formulation
              </span>
              <h2 className="text-base font-bold text-slate-900 m-0">Active Diagnoses</h2>
            </div>
          </div>
          <div className="overview-card-header-actions flex items-center gap-2">
            {onNavigateSection && (
              <button
                type="button"
                className="card-primary-action-btn text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer transition-colors"
                onClick={() => onNavigateSection("Encounter")}
              >
                Address in Note &rarr;
              </button>
            )}
            <OverviewCardMenu
              cardId="diagnoses"
              isPinned={isPinned}
              span={span}
              isCollapsed={isCollapsed}
              hideKey="showDiagnoses"
              onTogglePin={togglePinCard}
              onToggleSpan={toggleCardSpan}
              onToggleCollapse={toggleCollapse}
              onHide={hideCard}
            />
          </div>
        </div>

        {!isCollapsed && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Psychiatric & Behavioral Health ({psychProblems.length})
              </span>
              <div className="flex flex-wrap gap-1.5">
                {psychProblems.length > 0 ? (
                  psychProblems.map((problem) => (
                    <span
                      key={problem.id}
                      className="overview-diagnosis text-slate-700 font-medium inline-flex items-center gap-1.5"
                      title={problem.onset_date ? `Onset: ${problem.onset_date}` : undefined}
                    >
                      {problem.code && <span className="font-mono text-slate-500 text-[11px]">{problem.code}</span>}
                      <span>{problem.display_text}</span>
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-slate-500 italic">No active psychiatric conditions on problem list.</span>
                )}
              </div>
            </div>

            {(medicalProblems.length > 0) && (
              <div className="flex flex-col gap-2 pt-3 border-t border-slate-100">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Medical Comorbidities ({medicalProblems.length})
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {medicalProblems.map((problem) => (
                      <span
                        key={problem.id}
                        className="overview-diagnosis text-slate-700 font-medium inline-flex items-center gap-1.5"
                        title={problem.onset_date ? `Onset: ${problem.onset_date}` : undefined}
                      >
                        {problem.code && <span className="font-mono text-slate-500 text-[11px]">{problem.code}</span>}
                        <span>{problem.display_text}</span>
                      </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    );
  }

  function renderMedicationsCard() {
    if (!preferences.overview.showMedications) return null;
    const isCollapsed = preferences.overview.collapsedCards.medications || false;
    const isPinned = preferences.overview.pinnedCards?.medications || false;
    const span = preferences.overview.cardSpans?.medications ?? 1;
    const isDragging = draggedCardId === "medications";
    const isDropTarget = dropTargetCardId === "medications" && draggedCardId !== "medications";

    return (
      <section
        key="medications"
        className={`card overview-card-container ${span === 2 ? "col-span-2" : ""} bg-white rounded-xl border border-slate-200 shadow-xs p-5 flex flex-col gap-4 ${isCollapsed ? "is-collapsed" : ""} ${isDragging ? "is-dragging" : ""} ${isDropTarget ? "drop-target-active" : ""}`}
        onDragOver={(e) => handleDragOver("medications", e)}
        onDrop={(e) => handleDrop("medications", e)}
      >
        <div className="card-heading flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="card-heading-title flex items-center gap-2">
            <span
              className="card-drag-handle text-slate-400 cursor-grab"
              draggable
              onDragStart={(e) => handleDragStart("medications", e)}
              onDragEnd={handleDragEnd}
              title="Drag to rearrange card"
            >
              <Icon name="drag_indicator" />
            </span>
            <div>
              <span className="eyebrow text-xs uppercase tracking-wider text-slate-400 font-bold block mb-0.5">
                Current regimen & surveillance
              </span>
              <h2 className="text-base font-bold text-slate-900 m-0">Active Medications</h2>
            </div>
          </div>
          <div className="overview-card-header-actions flex items-center gap-2">
            {onNavigateSection && (
              <button
                type="button"
                className="card-primary-action-btn text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer transition-colors"
                onClick={() => onNavigateSection("Meds")}
              >
                Manage Rx &rarr;
              </button>
            )}
            <OverviewCardMenu
              cardId="medications"
              isPinned={isPinned}
              span={span}
              isCollapsed={isCollapsed}
              hideKey="showMedications"
              onTogglePin={togglePinCard}
              onToggleSpan={toggleCardSpan}
              onToggleCollapse={toggleCollapse}
              onHide={hideCard}
            />
          </div>
        </div>

        {!isCollapsed && (
          <div className="flex flex-col gap-3">
            {activeMedications.length > 0 ? (
              activeMedications.map((med) => {
                const monitoringItem = findMedicationMonitoring(med);
                const isOverdue = monitoringItem?.status === "overdue";
                const isDue = monitoringItem?.status === "due" || monitoringItem?.status === "due-soon";

                return (
                  <div key={med.id} className="border border-slate-200 rounded-lg p-3 bg-white flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-col min-w-0">
                        <strong className="text-sm font-semibold text-slate-900 truncate">{med.medication_name}</strong>
                        <span className="text-xs text-slate-600">
                          {[
                            med.dose || med.strength,
                            med.route,
                            med.frequency,
                            med.indication ? `for ${med.indication}` : null,
                          ]
                            .filter(Boolean)
                            .join(" · ") || "Dosing instructions not recorded"}
                        </span>
                      </div>
                      <span className="text-xs text-slate-400 whitespace-nowrap shrink-0">
                        {med.prescriber ? `Prescriber: ${med.prescriber}` : "Active"}
                      </span>
                    </div>

                    <div className="pt-1">
                      {monitoringItem ? (
                        <button
                          type="button"
                          className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full border cursor-pointer ${
                            isOverdue
                              ? "bg-rose-50 text-rose-700 border-rose-200"
                              : isDue
                                ? "bg-amber-50 text-amber-700 border-amber-200"
                                : "bg-emerald-50 text-emerald-700 border-emerald-200"
                          }`}
                          onClick={() => {
                            if (monitoringItem.measureKind === "vital") setIsVitalsModalOpen(true);
                            else if (onNavigateSection) onNavigateSection("Labs");
                          }}
                          title={monitoringItem.measureKind === "vital" ? "Open flowsheet" : "Review labs"}
                        >
                          <Icon name={isOverdue ? "warning" : isDue ? "schedule" : "check_circle"} size="sm" />
                          <span>
                            {isOverdue
                              ? `Surveillance: ${monitoringItem.requiredMeasure} Overdue`
                              : isDue
                                ? `Surveillance: ${monitoringItem.requiredMeasure} ${monitoringItem.status === "due-soon" ? "Due soon" : "Due"}`
                                : `Monitoring: Current (${monitoringItem.requiredMeasure})`}
                          </span>
                        </button>
                      ) : (
                        <span className="text-xs text-slate-600">
                          {monitoringPolicyError ? "Monitoring unavailable" : monitoringRules === null ? "Loading monitoring policy…" : "No matching monitoring rule"}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-slate-500">No active medications recorded.</p>
            )}
          </div>
        )}
      </section>
    );
  }

  function renderCareCoordinationCard() {
    return (
      <div key="care-coordination" className="card overview-card-container bg-white rounded-xl border border-slate-200 shadow-xs p-5 flex flex-col gap-4">
        <div className="card-heading pb-3 border-b border-slate-100">
          <div>
            <span className="eyebrow text-xs uppercase tracking-wider text-slate-400 font-bold block mb-1">
              Care coordination
            </span>
            <h2 className="text-base font-bold text-slate-900 m-0">Care Team & Logistics</h2>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <AsyncSection
            loading={!administration && !administrationError}
            error={administrationError}
            isEmpty={false}
            hasLoadedOnce={Boolean(administration)}
            loadingMessage="Loading care details…"
            emptyMessage=""
            onRetry={() => setAdministrationReloadKey((value) => value + 1)}
          >
            {administration && (() => {
              const pharmacy = preferredPharmacy(administration.pharmacies);
              const members = administration.careNetwork.filter((member) => member.status === "active");
              const emergencyContacts = administration.relatedPeople
                .filter((person) => person.status === "active" && person.role === "emergency-contact")
                .sort((a, b) => a.priority - b.priority);
              return (
                <dl className="overview-care-details">
                  <div>
                    <dt>Care team</dt>
                    <dd>{members.length > 0 ? members.map((member) => (
                      <div key={member.id}>{member.name} · {careNetworkRoleLabel(member.role)}</div>
                    )) : "No active care-team members recorded"}</dd>
                  </div>
                  <div>
                    <dt>Preferred pharmacy</dt>
                    <dd>{pharmacy?.name || "Not recorded"}</dd>
                    {pharmacy?.phone && <dd>{pharmacy.phone}</dd>}
                  </div>
                  <div>
                    <dt>Emergency contact</dt>
                    <dd>{emergencyContacts.length > 0 ? emergencyContacts.map((contact) => (
                      <div key={contact.id}>
                        {contact.name}{contact.relationship ? ` · ${contact.relationship}` : ""}
                        {contact.phone ? ` · ${contact.phone}` : " · Phone not recorded"}
                      </div>
                    )) : "Not recorded"}</dd>
                  </div>
                </dl>
              );
            })()}
          </AsyncSection>
          {onOpenAdminDrawer && (
            <Button size="sm" variant="secondary" onClick={onOpenAdminDrawer}>Review patient information</Button>
          )}



        </div>
      </div>
    );
  }

  return (
    <div className="overview-container bg-slate-50 min-h-screen text-slate-900">
      <div className="overview-canvas">
        {renderAttention()}
        {(!preferences.overview.showSnapshot || preferences.overview.collapsedCards.snapshot) && (
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
        <div className="overview-grid items-start">
          {resolvedCardOrder.map((cardId) => {
            switch (cardId) {
              case "snapshot": return renderSnapshotCard();
              case "diagnoses": return renderDiagnosesCard();
              case "medications": return renderMedicationsCard();
              case "measures": return renderMeasuresCard();
              case "results": return renderSupportingCard("results", "Results & Outstanding Orders", "showResults", <OverviewResultsSummary patientId={patient.id} observations={observations} onReview={() => onNavigateSection?.("Labs")} />);
              case "history": return renderSupportingCard("history", "Psychiatric History & Treatment Trials", "showHistory", <OverviewHistorySummary items={psychiatricHistory} assessments={assessments} onDocuments={() => onNavigateSection?.("Documents")} onReview={() => onNavigateSection?.("History")} />);
              case "timeline": return renderTimelineCard();
            }
          })}
          {renderCareCoordinationCard()}
        </div>

        {hasHiddenCards && (
          <div className="overview-restore-bar mt-6">
            <span>Hidden cards:</span>
            {!preferences.overview.showSnapshot && (
              <Button
                className="overview-restore-pill"
                size="sm"
                icon="add"
                onClick={() => showCard("showSnapshot")}
              >
                Show Visit Continuity
              </Button>
            )}
            {!preferences.overview.showDiagnoses && (
              <Button
                className="overview-restore-pill"
                size="sm"
                icon="add"
                onClick={() => showCard("showDiagnoses")}
              >
                Show Diagnoses
              </Button>
            )}
            {!preferences.overview.showMedications && (
              <Button
                className="overview-restore-pill"
                size="sm"
                icon="add"
                onClick={() => showCard("showMedications")}
              >
                Show Medications
              </Button>
            )}
            {!preferences.overview.showTimeline && (
              <Button
                className="overview-restore-pill"
                size="sm"
                icon="add"
                onClick={() => showCard("showTimeline")}
              >
                Show Activity Timeline
              </Button>
            )}
            {([ ["showMeasures", "Symptoms & Measurements"], ["showResults", "Results & Outstanding Orders"], ["showHistory", "Psychiatric History & Treatment Trials"] ] as const).map(([key, label]) => (preferences.overview[key] ?? preferences.headerDensity !== "minimal") === false && <Button key={key} size="sm" onClick={() => showCard(key)}>Show {label}</Button>)}
            <Button className="overview-reset-pill" size="sm" onClick={resetCards}>
              Reset layout
            </Button>
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
