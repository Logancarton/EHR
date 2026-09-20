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
  type LabObservation,
} from "../../lib/clinical-protocols";
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
      };
    });
  }, [observations]);

  // Surveillance monitoring is based only on the successfully loaded medication
  // and laboratory record. A failed snapshot never reaches this calculation.
  const monitoring = useMemo(() => {
    const activeMedicationNames = medications
      .filter((medication) => medication.status === "active")
      .map((medication) => medication.display_text || medication.medication_name);
    return calculateMonitoringStatus(activeMedicationNames, labHistory);
  }, [medications, labHistory]);

  const overdueItem = monitoring.find((m) => m.status === "overdue");

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

    // Overdue protocol surveillance
    if (overdueItem) {
      items.push({
        id: "alert-overdue-surveillance",
        category: "surveillance",
        severity: "warning",
        title: `Surveillance Overdue: ${overdueItem.requiredLab.split(" ")[0]}`,
        description: `${overdueItem.medication} protocol requires ${overdueItem.requiredLab} (${overdueItem.daysElapsed}d elapsed).`,
        actionLabel: "View in Labs",
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
  }, [assessments, vitals, overdueItem, allergies, encounters]);

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

  // 4. "What changed recently?" timeline events
  const recentChanges = useMemo(() => {
    type ChangeItem = {
      id: string;
      date: string;
      category: "visit" | "med" | "vital" | "scale" | "lab";
      title: string;
      detail: string;
    };

    const list: ChangeItem[] = [];

    // Recent encounters
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

    // Recent vitals shift
    if (vitals.length > 0) {
      const v = vitals[0];
      const weightFlag = v.flags.find((f) => f.type === "weight_change");
      list.push({
        id: `vital-${v.recordedAt}`,
        date: v.recordedAt.split("T")[0],
        category: "vital",
        title: `Vitals: BP ${v.bpText || `${v.systolic}/${v.diastolic}`}`,
        detail: `HR ${v.heartRate ?? "—"} bpm · BMI ${v.bmi ?? "—"} (${v.bmiCategory || ""})${
          weightFlag ? ` · ${weightFlag.detail}` : ""
        }`,
      });
    }

    // Recent rating scale trend
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

    // Recent lab
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

    return list;
  }, [encounters, vitals, assessments, labHistory]);

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

          // CARD 1: Snapshot ("What needs attention?" and "What is next?")
          if (cardId === "snapshot") {
            if (!preferences.overview.showSnapshot) return null;
            const isCollapsed = preferences.overview.collapsedCards.snapshot || false;
            return (
              <section
                key="snapshot"
                className={`card overview-card-container ${spanClass} ${isCollapsed ? "is-collapsed" : ""} ${isDragging ? "is-dragging" : ""} ${isDropTarget ? "drop-target-active" : ""}`}
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
                      <span className="eyebrow">Clinical snapshot</span>
                      <h2>What Needs Attention &amp; What Is Next</h2>
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
                  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    {/* Clinical Attention Queue */}
                    {attentionItems.length > 0 ? (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "8px",
                          padding: "12px",
                          borderRadius: "8px",
                          background: "var(--m3-surface-container-high, #f8fafc)",
                          border: "1px solid var(--m3-border, #e2e8f0)",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span style={{ color: "var(--m3-danger, #dc2626)", fontWeight: 700, fontSize: "12px" }}>
                            ⚠ CLINICAL ATTENTION REQUIRED ({attentionItems.length})
                          </span>
                        </div>
                        {attentionItems.map((item) => (
                          <div
                            key={item.id}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              gap: "12px",
                              padding: "8px 12px",
                              borderRadius: "6px",
                              background:
                                item.severity === "critical"
                                  ? "var(--m3-danger-container, #fef2f2)"
                                  : "var(--m3-surface, #ffffff)",
                              border:
                                item.severity === "critical"
                                  ? "1px solid var(--m3-danger, #f87171)"
                                  : "1px solid var(--m3-border, #e2e8f0)",
                            }}
                          >
                            <div>
                              <strong style={{ fontSize: "13px", color: "var(--m3-text-primary, #0f172a)" }}>
                                {item.title}
                              </strong>
                              <p style={{ margin: "2px 0 0 0", fontSize: "12px", color: "var(--m3-text-secondary, #64748b)" }}>
                                {item.description}
                              </p>
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
                    ) : (
                      <div
                        style={{
                          padding: "8px 12px",
                          borderRadius: "6px",
                          background: "var(--m3-success-container, #ecfdf5)",
                          color: "var(--m3-on-success-container, #065f46)",
                          fontSize: "12px",
                          fontWeight: 600,
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                        }}
                      >
                        <Icon name="check_circle" />
                        <span>All safety parameters, rating scales, and surveillance protocols are within expected limits.</span>
                      </div>
                    )}

                    {/* Snapshot Vitals & Next Step Grid */}
                    <div className="snapshot-grid">
                      <div>
                        <span>Last Visit</span>
                        <strong>{encounters[0]?.date || "No encounter on file"}</strong>
                        <small>{encounters[0]?.type || "No authoritative visit recorded"}</small>
                      </div>

                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span>{nextVisitInfo?.status === "tentative" ? "Tentative Hold" : "Next Scheduled Visit"}</span>
                          {onNavigateSection && nextVisitInfo && nextVisitInfo.status !== "tentative" && (
                            <button
                              type="button"
                              onClick={() => onNavigateSection("Encounter")}
                              style={{
                                background: "none",
                                border: "none",
                                color: "var(--m3-primary, #2563eb)",
                                fontSize: "11px",
                                fontWeight: 600,
                                cursor: "pointer",
                                padding: 0,
                              }}
                            >
                              Start Visit &rarr;
                            </button>
                          )}
                        </div>
                        {nextVisitInfo ? (
                          <>
                            <strong>{nextVisitInfo.date} · {nextVisitInfo.time}</strong>
                            <small>{nextVisitInfo.type} ({nextVisitInfo.provider})</small>
                          </>
                        ) : (
                          <>
                            <strong>Not scheduled</strong>
                            <small>No authoritative upcoming appointment on file.</small>
                          </>
                        )}
                      </div>

                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span>Vitals &amp; Metabolic</span>
                          <button
                            type="button"
                            onClick={() => setIsVitalsModalOpen(true)}
                            style={{
                              background: "none",
                              border: "none",
                              color: "var(--m3-primary, #2563eb)",
                              fontSize: "11px",
                              fontWeight: 600,
                              cursor: "pointer",
                              padding: 0,
                            }}
                          >
                            Flowsheet &rarr;
                          </button>
                        </div>
                        {vitals.length > 0 ? (
                          <div>
                            <strong>
                              {vitals[0].bpText ||
                                (vitals[0].systolic ? `${vitals[0].systolic}/${vitals[0].diastolic}` : "BP recorded")}
                            </strong>
                            <small>
                              HR {vitals[0].heartRate ?? "—"} bpm · BMI {vitals[0].bmi ?? "—"} ({vitals[0].bmiCategory || ""})
                            </small>
                            {vitals[0].flags && vitals[0].flags.length > 0 && (
                              <div style={{ marginTop: "4px" }}>
                                <span
                                  style={{
                                    fontSize: "10px",
                                    padding: "1px 5px",
                                    background: "var(--m3-warning-container, #fef3c7)",
                                    color: "var(--m3-on-warning-container, #92400e)",
                                    borderRadius: "4px",
                                    fontWeight: 600,
                                  }}
                                >
                                  {vitals[0].flags[0].label}
                                </span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div>
                            <strong>No vitals recorded</strong>
                            <small>No authoritative vital-sign measurement is on file.</small>
                          </div>
                        )}
                      </div>

                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span>Rating Scales</span>
                          <button
                            type="button"
                            onClick={() => setIsAssessmentsModalOpen(true)}
                            style={{
                              background: "none",
                              border: "none",
                              color: "var(--m3-primary, #2563eb)",
                              fontSize: "11px",
                              fontWeight: 600,
                              cursor: "pointer",
                              padding: 0,
                            }}
                          >
                            Scales &rarr;
                          </button>
                        </div>
                        {assessments.length > 0 ? (
                          <div>
                            <strong>
                              {assessments[0].title.split(" ")[0]} {assessments[0].totalScore}/{assessments[0].maxScore}
                            </strong>
                            <small>{assessments[0].severity}</small>
                            {assessments[0].flags.length > 0 && (
                              <div style={{ marginTop: "4px" }}>
                                <span
                                  style={{
                                    fontSize: "10px",
                                    padding: "1px 5px",
                                    background: "var(--m3-danger-container, #fee2e2)",
                                    color: "var(--m3-on-danger-container, #991b1b)",
                                    borderRadius: "4px",
                                    fontWeight: 600,
                                  }}
                                >
                                  Safety Alert
                                </span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div>
                            <strong>PHQ-9: 6 / 27</strong>
                            <small>Mild depression (Controlled)</small>
                          </div>
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
                      <h2>What Is Being Treated</h2>
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
                    {problemRecords && problemRecords.length > 0 ? (
                      problemRecords
                        .filter((p) => p.status === "active")
                        .map((problem) => (
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
                      <span className="eyebrow">Pharmacotherapy</span>
                      <h2>What Medications Are Active</h2>
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
                    {medications && medications.length > 0 ? (
                      medications
                        .filter((m) => m.status === "active")
                        .map((med) => (
                          <div key={med.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <span className="med-icon">Rx</span>
                              <div>
                                <strong>{med.medication_name}</strong>
                                <small style={{ display: "block", color: "var(--m3-text-secondary, #64748b)" }}>
                                  {[med.dose || med.strength, med.route, med.frequency].filter(Boolean).join(" · ") ||
                                    "Active regimen"}
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
                      <h2>What Changed Recently</h2>
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
