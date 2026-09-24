"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { type Patient } from "../../domain/patient";
import type {
  ProblemRecord,
  AllergyRecord,
  MedicationRecord,
  ObservationRecord,
  PatientEncounterSummary,
  UpcomingAppointmentSummary,
  ClinicalDocumentSummary,
  OverviewAttentionItem,
} from "../../domain/clinical-records";
import { clinicalRecordApi } from "../../lib/clinical-record-api";
import { COMMON_ICD_REGISTRY } from "../../domain/smart-canvas";
import {
  type ProviderPreferences,
  type OverviewCardId,
  defaultPreferences,
  savePreferences,
} from "../../lib/preference-engine";
import {
  calculateMonitoringStatus,
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
import PatientVitalsModal from "./PatientVitalsModal";
import PatientAssessmentsModal from "./PatientAssessmentsModal";
import type { VitalSignSummary, AssessmentRecord } from "../../domain/clinical-measurements";

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
  hideKey: "showSnapshot" | "showDiagnoses" | "showMedications" | "showTimeline";
  onTogglePin: (cardId: OverviewCardId) => void;
  onToggleSpan: (cardId: OverviewCardId) => void;
  onToggleCollapse: (cardId: OverviewCardId) => void;
  onHide: (key: "showSnapshot" | "showDiagnoses" | "showMedications" | "showTimeline") => void;
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

export default function PatientOverview({
  patient,
  preferences = defaultPreferences,
  onUpdatePreferences,
  onNavigateSection,
  onOpenAdminDrawer,
  onToast,
}: {
  patient: Patient;
  preferences?: ProviderPreferences;
  onUpdatePreferences?: (updated: ProviderPreferences) => void;
  onNavigateSection?: (section: "Overview" | "Encounter" | "Meds" | "Labs" | "Documents" | "Messages" | "History") => void;
  onOpenAdminDrawer?: () => void;
  onToast?: (msg: string) => void;
}) {
  const [draggedCardId, setDraggedCardId] = useState<OverviewCardId | null>(null);
  const [dropTargetCardId, setDropTargetCardId] = useState<OverviewCardId | null>(null);

  // Authoritative clinical snapshot states
  const [problemRecords, setProblemRecords] = useState<ProblemRecord[] | null>(null);
  const [allergies, setAllergies] = useState<AllergyRecord[]>([]);
  const [medications, setMedications] = useState<MedicationRecord[]>([]);
  const [observations, setObservations] = useState<ObservationRecord[]>([]);
  const [vitals, setVitals] = useState<VitalSignSummary[]>([]);
  const [assessments, setAssessments] = useState<AssessmentRecord[]>([]);
  const [encounters, setEncounters] = useState<PatientEncounterSummary[]>([]);
  const [upcomingAppointments, setUpcomingAppointments] = useState<UpcomingAppointmentSummary[]>([]);
  const [documents, setDocuments] = useState<ClinicalDocumentSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [snapshotReloadKey, setSnapshotReloadKey] = useState(0);
  const [monitoringRules, setMonitoringRules] = useState<MedicationProtocol[] | null>(null);
  const [monitoringPolicyError, setMonitoringPolicyError] = useState<string | null>(null);
  const [monitoringPolicyReloadKey, setMonitoringPolicyReloadKey] = useState(0);

  // Modals
  const [isVitalsModalOpen, setIsVitalsModalOpen] = useState(false);
  const [isAssessmentsModalOpen, setIsAssessmentsModalOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setSnapshotError(null);
    setProblemRecords(null);
    setAllergies([]);
    setMedications([]);
    setObservations([]);
    setVitals([]);
    setAssessments([]);
    setEncounters([]);
    setUpcomingAppointments([]);
    setDocuments([]);

    clinicalRecordApi
      .snapshot(patient.id)
      .then((snapshot) => {
        if (!cancelled) {
          setProblemRecords(snapshot.problems || []);
          setAllergies(snapshot.allergies || []);
          setMedications(snapshot.medications || []);
          setObservations(snapshot.observations || []);
          setVitals(snapshot.vitals || []);
          setAssessments(snapshot.assessments || []);
          setEncounters(snapshot.encounters || []);
          setUpcomingAppointments(snapshot.upcomingAppointments || []);
          setDocuments(snapshot.documents || []);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSnapshotError("The clinical overview could not be loaded. No empty or fixture chart state was substituted.");
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [patient.id, snapshotReloadKey]);

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
  function hideCard(key: "showSnapshot" | "showDiagnoses" | "showMedications" | "showTimeline") {
    if (!onUpdatePreferences) return;
    const next = {
      ...preferences,
      overview: { ...preferences.overview, [key]: false },
    };
    savePreferences(next);
    onUpdatePreferences(next);
  }

  function showCard(key: "showSnapshot" | "showDiagnoses" | "showMedications" | "showTimeline") {
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
        cardOrder: ["snapshot", "diagnoses", "medications", "timeline"],
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
    let nextOrder = [...preferences.overview.cardOrder];

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

    const currentOrder = [...preferences.overview.cardOrder];
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

  const labHistory = useMemo<LabObservation[]>(() => {
    return observations.map((observation) => {
      const interpretation = (observation.interpretation || "").toLowerCase();
      const flag: LabObservation["flag"] =
        interpretation.includes("high") ? "high"
          : interpretation.includes("low") ? "low"
          : interpretation.includes("abnormal") ? "abnormal"
          : interpretation.includes("normal") ? "normal"
          : undefined;
      return {
        id: observation.id,
        testName: observation.test_name,
        code: observation.code || "",
        date: (observation.effective_at || observation.recorded_at).split("T")[0],
        value: observation.value_text || (observation.value_num != null ? String(observation.value_num) : ""),
        unit: observation.unit || "",
        referenceRange: observation.reference_range || "Not provided",
        flag,
        orderedBy: observation.observed_by || observation.recorded_by || "Clinical record",
        kind: "lab",
      };
    });
  }, [observations]);

  const monitoringEvidence = useMemo<LabObservation[]>(() => {
    const vitalEvidence: LabObservation[] = vitals.map((vital, index) => ({
      id: `vital-${vital.recordedAt}-${index}`,
      testName: "Resting Blood Pressure & Pulse / Vital Signs",
      code: "vitals",
      date: vital.recordedAt.split("T")[0],
      value: [
        vital.bpText || (vital.systolic ? `${vital.systolic}/${vital.diastolic ?? "—"}` : null),
        vital.heartRate != null ? `HR ${vital.heartRate}` : null,
      ].filter(Boolean).join(" · "),
      unit: "",
      referenceRange: "Clinical vital-sign record",
      orderedBy: "Clinical record",
      kind: "vital",
    }));
    return [...labHistory, ...vitalEvidence];
  }, [labHistory, vitals]);

  // Surveillance is asserted only after the effective persisted policy has loaded.
  // A policy fetch failure is not silently replaced by system defaults.
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

    // Safety flags from assessments (e.g. PHQ-9 Q9 suicide ideation or C-SSRS intent)
    assessments.forEach((a) => {
      if (a.flags && a.flags.length > 0) {
        a.flags.forEach((f, idx) => {
          items.push({
            id: `alert-assessment-${a.id}-${idx}`,
            category: "safety",
            severity: "critical",
            title: `Safety Alert: ${a.title} (${a.administeredAt.split("T")[0]})`,
            description: f,
            actionLabel: "Review Scale",
            targetModal: "assessments",
          });
        });
      }
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

    // Medication surveillance is grouped by active medication so three lithium
    // measures do not become three unrelated warning cards.
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

    // Unassessed allergies status (safety requirement: empty means unassessed)
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

    // Unsigned encounter drafts
    const unsigned = encounters.find((e) => e.status === "draft");
    if (unsigned) {
      items.push({
        id: `alert-unsigned-${unsigned.id}`,
        category: "unsigned",
        severity: "warning",
        title: `Unsigned Draft: ${unsigned.type}`,
        description: `Encounter from ${unsigned.date} awaits clinician review and signature.`,
        actionLabel: "Resume Note",
        targetSection: "Encounter",
      });
    }

    return items;
  }, [assessments, vitals, monitoring, monitoringPolicyError, allergies, encounters]);

  // 3. "What is next?" evaluation
  const nextVisitInfo = useMemo(() => {
    const apt = upcomingAppointments.find(
      (appointment) =>
        appointment.status === "tentative" ||
        appointment.status === "scheduled" ||
        appointment.status === "confirmed",
    );
    if (!apt) return null;
    return {
      date: apt.date,
      time: apt.time,
      type: apt.type,
      provider: apt.provider,
      status: apt.status,
      room: apt.room,
    };
  }, [upcomingAppointments]);

  // 4. "What changed recently?" timeline events.
  // This stays a compact projection over authoritative source records rather than
  // becoming a second activity store.
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
        date: recent.date,
        category: "visit",
        title: `${recent.type} (${recent.status === "signed" ? "Signed" : "Draft"})`,
        detail: recent.chiefComplaint || recent.assessment.slice(0, 90) + "...",
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
        date: recentMedication.updated_at.split("T")[0],
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
        date: v.recordedAt.split("T")[0],
        category: "vital",
        title: `Vitals: BP ${v.bpText || `${v.systolic}/${v.diastolic}`}`,
        detail: `HR ${v.heartRate ?? "—"} bpm · BMI ${v.bmi ?? "—"} (${v.bmiCategory || ""})${weightFlag ? ` · ${weightFlag.detail}` : ""}`,
      });
    }

    if (assessments.length > 0) {
      const a = assessments[0];
      list.push({
        id: `scale-${a.id}`,
        date: a.administeredAt.split("T")[0],
        category: "scale",
        title: `${a.title}: Score ${a.totalScore}/${a.maxScore}`,
        detail: `${a.severity}${a.flags.length > 0 ? " (Safety Alert flagged)" : ""}`,
      });
    }

    if (labHistory.length > 0) {
      const lab = labHistory[0];
      list.push({
        id: `lab-${lab.id}`,
        date: lab.date,
        category: "lab",
        title: `Lab Result: ${lab.testName}`,
        detail: `${lab.value} ${lab.unit}${lab.flag ? ` (${lab.flag})` : ""}`,
      });
    }

    const recentDocument = [...documents].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    if (recentDocument) {
      list.push({
        id: `doc-${recentDocument.id}`,
        date: recentDocument.updatedAt.split("T")[0],
        category: "document",
        title: recentDocument.title,
        detail: `${recentDocument.documentType} · ${recentDocument.status}`,
      });
    }

    return list.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  }, [encounters, medications, vitals, assessments, labHistory, documents]);

  const activeMedications = medications.filter((medication) => medication.status === "active");
  const activeProblems = (problemRecords || []).filter((problem) => problem.status === "active");
  const latestLab = labHistory[0] || null;

  const hasHiddenCards =
    !preferences.overview.showSnapshot ||
    !preferences.overview.showDiagnoses ||
    !preferences.overview.showMedications ||
    !preferences.overview.showTimeline;

  if (isLoading || snapshotError) {
    return (
      <div className="overview-container">
        <AsyncSection
          loading={isLoading}
          error={snapshotError}
          isEmpty={false}
          hasLoadedOnce={false}
          loadingMessage="Loading clinical overview…"
          emptyMessage=""
          onRetry={() => setSnapshotReloadKey((value) => value + 1)}
        >
          <div />
        </AsyncSection>
      </div>
    );
  }

  return (
    <div className="overview-container" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Grid of 4 Workspace Cards */}
      <div className="overview-grid">
        {preferences.overview.cardOrder.map((cardId) => {
          const isDragging = draggedCardId === cardId;
          const isDropTarget = dropTargetCardId === cardId && draggedCardId !== cardId;
          const isPinned = preferences.overview.pinnedCards?.[cardId] || false;
          const defaultSpan = cardId === "snapshot" || cardId === "timeline" ? 2 : 1;
          const span = preferences.overview.cardSpans?.[cardId] ?? defaultSpan;
          const spanClass = span === 2 ? "col-span-2 wide-card" : "";

          // CARD 1: Visit readiness — compact first-viewport clinical command center.
          if (cardId === "snapshot") {
            if (!preferences.overview.showSnapshot) return null;
            const isCollapsed = preferences.overview.collapsedCards.snapshot || false;
            const latestAssessment = assessments[0] || null;
            const latestVitals = vitals[0] || null;
            const latestEncounter = encounters[0] || null;
            const firstActiveMedication = activeMedications[0] || null;

            return (
              <section
                key="snapshot"
                className={`card overview-card-container overview-visit-readiness ${spanClass} ${isCollapsed ? "is-collapsed" : ""} ${isDragging ? "is-dragging" : ""} ${isDropTarget ? "drop-target-active" : ""}`}
                onDragOver={(e) => handleDragOver("snapshot", e)}
                onDrop={(e) => handleDrop("snapshot", e)}
              >
                <div className="card-heading">
                  <div className="card-heading-title">
                    <span
                      className="card-drag-handle"
                      draggable
                      onDragStart={(e) => handleDragStart("snapshot", e)}
                      onDragEnd={handleDragEnd}
                      title="Drag to rearrange card"
                    >
                      <Icon name="drag_indicator" />
                    </span>
                    <div>
                      <span className="eyebrow">Visit readiness</span>
                      <h2>What Matters for This Visit</h2>
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
                  <div className="overview-snapshot-body">
                    {attentionItems.length > 0 ? (
                      <section className="overview-attention-panel" aria-label="Clinical attention">
                        <div className="overview-attention-heading">
                          <div>
                            <span className="overview-attention-kicker">Needs attention</span>
                            <strong>
                              {attentionItems.length} unresolved {attentionItems.length === 1 ? "item" : "items"}
                            </strong>
                          </div>
                          <span className="overview-attention-count" aria-label={`${attentionItems.length} attention items`}>
                            {attentionItems.length}
                          </span>
                        </div>
                        <div className="overview-attention-list">
                          {attentionItems.map((item) => (
                            <div className="overview-attention-row" key={item.id}>
                              <span className={`overview-attention-severity ${item.severity}`} aria-hidden="true">
                                <Icon name={item.severity === "critical" ? "error" : "warning"} />
                              </span>
                              <div className="overview-attention-copy">
                                <strong>{item.title}</strong>
                                <span>{item.description}</span>
                              </div>
                              <Button
                                size="sm"
                                variant={item.severity === "critical" ? "destructive" : "secondary"}
                                onClick={() => {
                                  if (item.targetModal === "vitals") setIsVitalsModalOpen(true);
                                  else if (item.targetModal === "assessments") setIsAssessmentsModalOpen(true);
                                  else if (item.targetModal === "admin" && onOpenAdminDrawer) onOpenAdminDrawer();
                                  else if (item.targetSection && onNavigateSection) onNavigateSection(item.targetSection);
                                }}
                              >
                                {item.actionLabel}
                              </Button>
                            </div>
                          ))}
                        </div>
                      </section>
                    ) : (
                      <div className="overview-clear-state">
                        <Icon name="check_circle" />
                        <div>
                          <strong>No active attention items</strong>
                          <span>Nothing in the loaded clinical record currently requires an attention flag.</span>
                        </div>
                      </div>
                    )}

                    <div className="clinical-pulse-grid" aria-label="Clinical pulse">
                      <div className="clinical-pulse-cell">
                        <span className="clinical-pulse-label"><Icon name="history" />Last visit</span>
                        <strong>{latestEncounter?.date || "None recorded"}</strong>
                        <small>{latestEncounter ? `${latestEncounter.type} · ${latestEncounter.status}` : "No authoritative encounter on file"}</small>
                      </div>

                      <div className="clinical-pulse-cell">
                        <span className="clinical-pulse-label"><Icon name="event" />Next visit</span>
                        <strong>{nextVisitInfo ? `${nextVisitInfo.date} · ${nextVisitInfo.time}` : "Not scheduled"}</strong>
                        <small>{nextVisitInfo ? `${nextVisitInfo.type} · ${nextVisitInfo.status}` : "No upcoming appointment on file"}</small>
                      </div>

                      <div className="clinical-pulse-cell">
                        <span className="clinical-pulse-label"><Icon name="medication" />Active meds</span>
                        <strong>{activeMedications.length}</strong>
                        <small>
                          {firstActiveMedication
                            ? `${firstActiveMedication.medication_name}${activeMedications.length > 1 ? ` +${activeMedications.length - 1} more` : ""}`
                            : "No active medication record"}
                        </small>
                        {onNavigateSection && (
                          <button type="button" className="clinical-pulse-action" onClick={() => onNavigateSection("Meds")}>
                            Review meds
                          </button>
                        )}
                      </div>

                      <div className="clinical-pulse-cell">
                        <span className="clinical-pulse-label"><Icon name="monitor_heart" />Vitals</span>
                        <strong>
                          {latestVitals
                            ? latestVitals.bpText || (latestVitals.systolic ? `${latestVitals.systolic}/${latestVitals.diastolic}` : "Recorded")
                            : "Not recorded"}
                        </strong>
                        <small>
                          {latestVitals
                            ? `HR ${latestVitals.heartRate ?? "—"} · BMI ${latestVitals.bmi ?? "—"}`
                            : "No authoritative vital-sign measurement is on file."}
                        </small>
                        <button type="button" className="clinical-pulse-action" onClick={() => setIsVitalsModalOpen(true)}>
                          Flowsheet
                        </button>
                      </div>

                      <div className="clinical-pulse-cell">
                        <span className="clinical-pulse-label"><Icon name="fact_check" />Rating scale</span>
                        <strong>
                          {latestAssessment ? `${latestAssessment.title}: ${latestAssessment.totalScore}/${latestAssessment.maxScore}` : "Not recorded"}
                        </strong>
                        <small>{latestAssessment ? latestAssessment.severity : "No completed scale in the loaded record"}</small>
                        <button type="button" className="clinical-pulse-action" onClick={() => setIsAssessmentsModalOpen(true)}>
                          Review scales
                        </button>
                      </div>

                      <div className="clinical-pulse-cell">
                        <span className="clinical-pulse-label"><Icon name="science" />Latest lab</span>
                        <strong>{latestLab ? latestLab.testName : "Not recorded"}</strong>
                        <small>
                          {latestLab
                            ? `${latestLab.value} ${latestLab.unit}${latestLab.flag ? ` · ${latestLab.flag}` : ""}`
                            : "No laboratory result in the loaded record"}
                        </small>
                        {onNavigateSection && (
                          <button type="button" className="clinical-pulse-action" onClick={() => onNavigateSection("Labs")}>
                            Review labs
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </section>
            );
          }

          // CARD 2: Diagnoses ("What is being treated?")
          if (cardId === "diagnoses") {
            if (!preferences.overview.showDiagnoses) return null;
            const isCollapsed = preferences.overview.collapsedCards.diagnoses || false;
            return (
              <section
                key="diagnoses"
                className={`card overview-card-container ${spanClass} ${isCollapsed ? "is-collapsed" : ""} ${isDragging ? "is-dragging" : ""} ${isDropTarget ? "drop-target-active" : ""}`}
                onDragOver={(e) => handleDragOver("diagnoses", e)}
                onDrop={(e) => handleDrop("diagnoses", e)}
              >
                <div className="card-heading">
                  <div className="card-heading-title">
                    <span
                      className="card-drag-handle"
                      draggable
                      onDragStart={(e) => handleDragStart("diagnoses", e)}
                      onDragEnd={handleDragEnd}
                      title="Drag to rearrange card"
                    >
                      <Icon name="drag_indicator" />
                    </span>
                    <div>
                      <span className="eyebrow">Problem list</span>
                      <h2>Active Diagnoses</h2>
                    </div>
                  </div>
                  <div className="overview-card-header-actions">
                    {onNavigateSection && (
                      <button
                        type="button"
                        className="card-primary-action-btn"
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
                  <div className="stack-list">
                    {activeProblems.length > 0 ? (
                      activeProblems.map((problem) => (
                          <div
                            key={problem.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 8,
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span
                                className="code"
                                style={{
                                  minWidth: 62,
                                  textAlign: "center",
                                  fontFamily: "var(--font-mono, monospace)",
                                  fontWeight: 700,
                                }}
                              >
                                {problem.code || "Uncoded"}
                              </span>
                              <strong>{problem.display_text}</strong>
                            </div>
                            {problem.onset_date && (
                              <small style={{ color: "var(--m3-on-surface-variant, #64748b)" }}>
                                Onset: {problem.onset_date}
                              </small>
                            )}
                          </div>
                        ))
                    ) : patient.diagnoses.length > 0 ? (
                      patient.diagnoses.map((diagnosis) => {
                        const match = COMMON_ICD_REGISTRY[diagnosis.toLowerCase().trim()];
                        return (
                          <div key={diagnosis} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span
                              className="code"
                              style={{
                                minWidth: 62,
                                textAlign: "center",
                                fontFamily: "var(--font-mono, monospace)",
                                fontWeight: 700,
                              }}
                            >
                              {match?.code || "Uncoded"}
                            </span>
                            <strong>{diagnosis}</strong>
                          </div>
                        );
                      })
                    ) : (
                      <div
                        style={{
                          color: "var(--m3-on-surface-variant, #64748b)",
                          fontStyle: "italic",
                          padding: "8px 0",
                        }}
                      >
                        No active diagnoses documented on problem list.
                      </div>
                    )}
                  </div>
                )}
              </section>
            );
          }

          // CARD 3: Medications ("What medications are active?")
          if (cardId === "medications") {
            if (!preferences.overview.showMedications) return null;
            const isCollapsed = preferences.overview.collapsedCards.medications || false;
            return (
              <section
                key="medications"
                className={`card overview-card-container ${spanClass} ${isCollapsed ? "is-collapsed" : ""} ${isDragging ? "is-dragging" : ""} ${isDropTarget ? "drop-target-active" : ""}`}
                onDragOver={(e) => handleDragOver("medications", e)}
                onDrop={(e) => handleDrop("medications", e)}
              >
                <div className="card-heading">
                  <div className="card-heading-title">
                    <span
                      className="card-drag-handle"
                      draggable
                      onDragStart={(e) => handleDragStart("medications", e)}
                      onDragEnd={handleDragEnd}
                      title="Drag to rearrange card"
                    >
                      <Icon name="drag_indicator" />
                    </span>
                    <div>
                      <span className="eyebrow">Current regimen</span>
                      <h2>Active Medications</h2>
                    </div>
                  </div>
                  <div className="overview-card-header-actions">
                    {onNavigateSection && (
                      <button
                        type="button"
                        className="card-primary-action-btn"
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
                  <div className="stack-list">
                    {activeMedications.length > 0 ? (
                      activeMedications.map((med) => (
                          <div key={med.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <span className="med-icon">Rx</span>
                              <div>
                                <strong>{med.medication_name}</strong>
                                <small style={{ display: "block", color: "var(--m3-text-secondary, #64748b)" }}>
                                  {[
                                    med.dose || med.strength,
                                    med.route,
                                    med.frequency,
                                    med.indication ? `for ${med.indication}` : null,
                                  ]
                                    .filter(Boolean)
                                    .join(" · ") || "Active regimen"}
                                </small>
                              </div>
                            </div>
                            <small style={{ color: "var(--m3-text-secondary, #64748b)" }}>
                              {med.prescriber ? `Prescriber: ${med.prescriber}` : "Active"}
                            </small>
                          </div>
                        ))
                    ) : (
                      patient.meds.map((medication) => (
                        <div key={medication}>
                          <span className="med-icon">Rx</span>
                          <strong>{medication}</strong>
                          <small>Active</small>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </section>
            );
          }

          // CARD 4: Timeline ("What changed recently?")
          if (cardId === "timeline") {
            if (!preferences.overview.showTimeline) return null;
            const isCollapsed = preferences.overview.collapsedCards.timeline || false;
            return (
              <section
                key="timeline"
                className={`card overview-card-container ${spanClass} ${isCollapsed ? "is-collapsed" : ""} ${isDragging ? "is-dragging" : ""} ${isDropTarget ? "drop-target-active" : ""}`}
                onDragOver={(e) => handleDragOver("timeline", e)}
                onDrop={(e) => handleDrop("timeline", e)}
              >
                <div className="card-heading">
                  <div className="card-heading-title">
                    <span
                      className="card-drag-handle"
                      draggable
                      onDragStart={(e) => handleDragStart("timeline", e)}
                      onDragEnd={handleDragEnd}
                      title="Drag to rearrange card"
                    >
                      <Icon name="drag_indicator" />
                    </span>
                    <div>
                      <span className="eyebrow">Longitudinal activity</span>
                      <h2>Recent Clinical Changes</h2>
                    </div>
                  </div>
                  <div className="overview-card-header-actions">
                    {onNavigateSection && (
                      <button
                        type="button"
                        className="card-primary-action-btn"
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
                  <div className="timeline">
                    {recentChanges.map((item) => (
                      <div key={item.id}>
                        <span className="timeline-dot" data-timeline-type={item.category} aria-hidden="true" />
                        <time>{item.date}</time>
                        <p>
                          <span className="timeline-type" style={{ textTransform: "capitalize" }}>
                            {item.category}
                          </span>
                          <strong>{item.title}</strong>
                          <br />
                          {item.detail}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          }

          return null;
        })}
      </div>

      {hasHiddenCards && (
        <div className="overview-restore-bar">
          <span>Hidden cards:</span>
          {!preferences.overview.showSnapshot && (
            <Button
              className="overview-restore-pill"
              size="sm"
              icon="add"
              onClick={() => showCard("showSnapshot")}
            >
              Show Snapshot
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
          <Button className="overview-reset-pill" size="sm" onClick={resetCards}>
            Reset layout
          </Button>
        </div>
      )}

      {/* Modals */}
      <PatientVitalsModal
        patientId={patient.id}
        isOpen={isVitalsModalOpen}
        onClose={() => setIsVitalsModalOpen(false)}
        onVitalsRecorded={(v) => {
          setVitals((prev) => [v, ...prev]);
          if (onToast) onToast(`Recorded vitals: BP ${v.bpText || "N/A"}, HR ${v.heartRate || "N/A"}`);
        }}
      />

      <PatientAssessmentsModal
        patientId={patient.id}
        isOpen={isAssessmentsModalOpen}
        onClose={() => setIsAssessmentsModalOpen(false)}
        onAssessmentRecorded={(a) => {
          setAssessments((prev) => [a, ...prev]);
          if (onToast) onToast(`Recorded ${a.title}: Score ${a.totalScore}/${a.maxScore}`);
        }}
        onInsertToNote={(text) => {
          if (onToast) onToast("Inserted assessment into active note!");
        }}
      />
    </div>
  );
}
