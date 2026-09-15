"use client";

import { useEffect, useMemo, useState } from "react";
import { type Patient } from "../../domain/patient";
import {
  patientEncounterHistory,
  patientLabHistory,
  type PastEncounter,
  type LabObservation,
} from "../../lib/clinical-protocols";
import {
  CHART_COMMUNICATIONS_UPDATED_EVENT,
  chartCommunicationApi,
  type ChartCommunication,
} from "../../lib/chart-communication-api";
import { clinicalRecordApi } from "../../lib/clinical-record-api";
import type {
  ProblemRecord,
  MedicationRecord,
  PatientEncounterSummary,
  ClinicalDocumentSummary,
} from "../../domain/clinical-records";
import type { VitalSignSummary, AssessmentRecord } from "../../domain/clinical-measurements";

import { formatClinicalDate, formatClinicalDateTime } from "../../lib/clinical-date";
import { InlineError } from "../ui/AsyncSection";
import Button from "../ui/Button";
import Icon from "../ui/Icon";
import PatientVitalsModal from "./PatientVitalsModal";
import PatientAssessmentsModal from "./PatientAssessmentsModal";
import PatientPsychiatricHistorySection from "./PatientPsychiatricHistorySection";

type HistoryViewMode = "timeline" | "psych_history" | "assessments";
type HistoryStreamType =
  | "all"
  | "encounters"
  | "meds"
  | "diagnoses"
  | "assessments"
  | "vitals"
  | "labs"
  | "communications";

type MedicationMilestone = {
  id: string;
  date: string;
  medication: string;
  action: "Started" | "Titrated" | "Continued" | "Adjusted";
  detail: string;
};

const patientMedicationMilestones: Record<string, MedicationMilestone[]> = {
  "maya-chen": [
    {
      id: "med-m-1",
      date: "Aug 12, 2026",
      medication: "Guanfacine ER",
      action: "Titrated",
      detail:
        "Increased from 1 mg to 2 mg nightly at bedtime. Good response for sleep onset latency and evening ADHD emotional dysregulation.",
    },
    {
      id: "med-m-2",
      date: "Jul 15, 2026",
      medication: "Guanfacine ER",
      action: "Started",
      detail: "Initiated 1 mg nightly at bedtime for evening restlessness and sleep phase delay.",
    },
    {
      id: "med-m-3",
      date: "May 19, 2026",
      medication: "Sertraline (Zoloft)",
      action: "Titrated",
      detail: "Titrated from 50 mg to 100 mg daily for panic attacks and generalized anxiety.",
    },
  ],
  "elena-rostova": [
    {
      id: "med-er-1",
      date: "Aug 05, 2026",
      medication: "Bupropion XL",
      action: "Titrated",
      detail: "Increased to 300 mg daily. Improved morning drive and motivation.",
    },
    {
      id: "med-er-2",
      date: "Jun 20, 2026",
      medication: "Bupropion XL",
      action: "Started",
      detail: "Initiated 150 mg morning augmentation for persistent lethargy.",
    },
    {
      id: "med-er-3",
      date: "Apr 10, 2026",
      medication: "Escitalopram",
      action: "Continued",
      detail: "Maintained at 10 mg daily. Panic symptoms suppressed.",
    },
  ],
  "david-kim": [
    {
      id: "med-dk-1",
      date: "Aug 10, 2026",
      medication: "Lithium Carbonate",
      action: "Continued",
      detail: "Maintained at 600 mg BID. Therapeutic level stable at 0.68 mEq/L.",
    },
    {
      id: "med-dk-2",
      date: "May 14, 2026",
      medication: "Trazodone",
      action: "Started",
      detail: "50 mg nightly PRN for shift-work related sleep onset difficulty.",
    },
  ],
  "marcus-vance": [
    {
      id: "med-mv-1",
      date: "Aug 04, 2026",
      medication: "Lisdexamfetamine",
      action: "Continued",
      detail: "Refilled 40 mg morning dosing. Smooth 10-12 hour attention coverage.",
    },
    {
      id: "med-mv-2",
      date: "Jun 02, 2026",
      medication: "Lisdexamfetamine",
      action: "Titrated",
      detail: "Stepped up from 30 mg to 40 mg daily.",
    },
  ],
  "jordan-reed": [
    {
      id: "med-jr-1",
      date: "Aug 21, 2026",
      medication: "Lamotrigine (Lamictal)",
      action: "Continued",
      detail: "Maintained at 150 mg daily. Mood stable, denies rash or adverse effects.",
    },
    {
      id: "med-jr-2",
      date: "Jun 10, 2026",
      medication: "Lamotrigine (Lamictal)",
      action: "Titrated",
      detail: "Stepped up from 100 mg to 150 mg daily for mood stabilization.",
    },
    {
      id: "med-jr-3",
      date: "Jun 10, 2026",
      medication: "Quetiapine (Seroquel)",
      action: "Continued",
      detail: "Maintained at 100 mg nightly. Reliable sleep maintenance.",
    },
  ],
  "sofia-martinez": [
    {
      id: "med-sm-1",
      date: "Jul 29, 2026",
      medication: "Fluoxetine (Prozac)",
      action: "Continued",
      detail: "Maintained at 30 mg daily with breakfast for adolescent depression.",
    },
  ],
};

function dateSortValue(value: string) {
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function formatTimelineDate(value: string) {
  if (value.includes("T")) return formatClinicalDateTime(value);
  return formatClinicalDate(value);
}

function communicationTypeLabel(type: ChartCommunication["communicationType"]) {
  if (type === "message") return "Single message";
  if (type === "conversation") return "Conversation snapshot";
  return "Clinical summary";
}

export type TimelineEvent =
  | { type: "encounter"; id: string; date: string; data: PastEncounter | PatientEncounterSummary }
  | { type: "med"; id: string; date: string; data: MedicationMilestone | MedicationRecord }
  | { type: "diagnosis"; id: string; date: string; data: ProblemRecord }
  | { type: "assessment"; id: string; date: string; data: AssessmentRecord }
  | { type: "vitals"; id: string; date: string; data: VitalSignSummary }
  | { type: "lab"; id: string; date: string; data: LabObservation }
  | { type: "document"; id: string; date: string; data: ClinicalDocumentSummary }
  | { type: "communication"; id: string; date: string; data: ChartCommunication };

export default function PatientHistory({
  patient,
  onInsertText,
  onToast,
  onNavigateSection,
}: {
  patient: Patient;
  onInsertText?: (text: string) => void;
  onToast?: (msg: string) => void;
  onNavigateSection?: (section: "Overview" | "Encounter" | "Meds" | "Labs" | "Documents" | "Messages" | "History") => void;
}) {
  const [viewMode, setViewMode] = useState<HistoryViewMode>("timeline");
  const [isVitalsModalOpen, setIsVitalsModalOpen] = useState(false);
  const [isAssessmentsModalOpen, setIsAssessmentsModalOpen] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [activeStream, setActiveStream] = useState<HistoryStreamType>("all");
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [intervalSummary, setIntervalSummary] = useState<string | null>(null);

  // Authoritative clinical snapshot states
  const [problemRecords, setProblemRecords] = useState<ProblemRecord[]>([]);
  const [vitalsList, setVitalsList] = useState<VitalSignSummary[]>([]);
  const [assessmentsList, setAssessmentsList] = useState<AssessmentRecord[]>([]);
  const [encountersList, setEncountersList] = useState<PatientEncounterSummary[]>([]);
  const [documentsList, setDocumentsList] = useState<ClinicalDocumentSummary[]>([]);
  const [chartedCommunications, setChartedCommunications] = useState<ChartCommunication[]>([]);
  const [communicationsLoading, setCommunicationsLoading] = useState(false);
  const [communicationsError, setCommunicationsError] = useState<string | null>(null);

  const pastEncounters = useMemo(() => patientEncounterHistory[patient.id] || [], [patient.id]);
  const labs = useMemo(() => patientLabHistory[patient.id] || [], [patient.id]);
  const medMilestones = useMemo(() => patientMedicationMilestones[patient.id] || [], [patient.id]);

  useEffect(() => {
    let cancelled = false;

    clinicalRecordApi
      .snapshot(patient.id)
      .then((snapshot) => {
        if (!cancelled) {
          setProblemRecords(snapshot.problems || []);
          setVitalsList(snapshot.vitals || []);
          setAssessmentsList(snapshot.assessments || []);
          setEncountersList(snapshot.encounters || []);
          setDocumentsList(snapshot.documents || []);
        }
      })
      .catch(() => {
        // Fallback gracefully
      });

    return () => {
      cancelled = true;
    };
  }, [patient.id]);

  async function refreshChartedCommunications() {
    setCommunicationsLoading(true);
    try {
      const communications = await chartCommunicationApi.list(patient.id);
      setChartedCommunications(communications);
      setCommunicationsError(null);
    } catch (error) {
      setCommunicationsError(error instanceof Error ? error.message : String(error));
    } finally {
      setCommunicationsLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setCommunicationsLoading(true);
      try {
        const communications = await chartCommunicationApi.list(patient.id);
        if (!cancelled) {
          setChartedCommunications(communications);
          setCommunicationsError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setCommunicationsError(error instanceof Error ? error.message : String(error));
        }
      } finally {
        if (!cancelled) setCommunicationsLoading(false);
      }
    }

    function handleChartUpdated(event: Event) {
      const detail = (event as CustomEvent<{ patientId?: string }>).detail;
      if (!detail?.patientId || detail.patientId === patient.id) void load();
    }

    function handleFocus() {
      void load();
    }

    void load();
    window.addEventListener(CHART_COMMUNICATIONS_UPDATED_EVENT, handleChartUpdated);
    window.addEventListener("focus", handleFocus);

    return () => {
      cancelled = true;
      window.removeEventListener(CHART_COMMUNICATIONS_UPDATED_EVENT, handleChartUpdated);
      window.removeEventListener("focus", handleFocus);
    };
  }, [patient.id]);

  // Unified chronological timeline events across all 8 clinical domains
  const allEvents = useMemo(() => {
    const list: TimelineEvent[] = [];

    // 1. Encounters (prefer live store, fallback to protocol seed)
    if (encountersList.length > 0) {
      encountersList.forEach((enc) =>
        list.push({ type: "encounter", id: enc.id, date: enc.date, data: enc }),
      );
    } else {
      pastEncounters.forEach((enc) =>
        list.push({ type: "encounter", id: enc.id, date: enc.date, data: enc }),
      );
    }

    // 2. Medication milestones
    medMilestones.forEach((m) => list.push({ type: "med", id: m.id, date: m.date, data: m }));

    // 3. Problem list onsets / additions
    problemRecords.forEach((p) => {
      list.push({
        type: "diagnosis",
        id: `prob-${p.id}`,
        date: p.onset_date || p.recorded_at.split("T")[0],
        data: p,
      });
    });

    // 4. Standardized clinical rating scales
    assessmentsList.forEach((a) => {
      list.push({
        type: "assessment",
        id: `scale-${a.id}`,
        date: a.administeredAt.split("T")[0],
        data: a,
      });
    });

    // 5. Flowsheet vitals & metabolic shifts
    vitalsList.forEach((v) => {
      list.push({
        type: "vitals",
        id: `vital-${v.recordedAt}`,
        date: v.recordedAt.split("T")[0],
        data: v,
      });
    });

    // 6. Diagnostic labs
    labs.forEach((l) => list.push({ type: "lab", id: l.id, date: l.date, data: l }));

    // 7. Clinical documents
    documentsList.forEach((doc) => {
      list.push({
        type: "document",
        id: `doc-${doc.id}`,
        date: doc.createdAt.split("T")[0],
        data: doc,
      });
    });

    // 8. Charted communications
    chartedCommunications.forEach((communication) =>
      list.push({
        type: "communication",
        id: communication.id,
        date: communication.createdAt || communication.occurredAt,
        data: communication,
      }),
    );

    return list.sort((a, b) => dateSortValue(b.date) - dateSortValue(a.date));
  }, [
    encountersList,
    pastEncounters,
    medMilestones,
    problemRecords,
    assessmentsList,
    vitalsList,
    labs,
    documentsList,
    chartedCommunications,
  ]);

  const filteredEvents = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    return allEvents.filter((evt) => {
      if (activeStream !== "all") {
        if (activeStream === "encounters" && evt.type !== "encounter") return false;
        if (activeStream === "meds" && evt.type !== "med") return false;
        if (activeStream === "diagnoses" && evt.type !== "diagnosis") return false;
        if (activeStream === "assessments" && evt.type !== "assessment") return false;
        if (activeStream === "vitals" && evt.type !== "vitals") return false;
        if (activeStream === "labs" && evt.type !== "lab") return false;
        if (activeStream === "communications" && evt.type !== "communication" && evt.type !== "document")
          return false;
      }

      if (!q) return true;

      if (evt.type === "encounter") {
        const d = evt.data as any;
        return (
          (d.chiefComplaint || "").toLowerCase().includes(q) ||
          (d.hpi || "").toLowerCase().includes(q) ||
          (d.assessment || "").toLowerCase().includes(q) ||
          (d.plan || "").toLowerCase().includes(q) ||
          (d.type || "").toLowerCase().includes(q)
        );
      }
      if (evt.type === "med") {
        const d = evt.data as any;
        return (
          (d.medication || d.medication_name || "").toLowerCase().includes(q) ||
          (d.detail || "").toLowerCase().includes(q) ||
          (d.action || "").toLowerCase().includes(q)
        );
      }
      if (evt.type === "diagnosis") {
        return (
          evt.data.display_text.toLowerCase().includes(q) ||
          (evt.data.code || "").toLowerCase().includes(q)
        );
      }
      if (evt.type === "assessment") {
        return (
          evt.data.title.toLowerCase().includes(q) ||
          evt.data.severity.toLowerCase().includes(q) ||
          evt.data.instrument.toLowerCase().includes(q)
        );
      }
      if (evt.type === "vitals") {
        return (
          (evt.data.bpText || "").toLowerCase().includes(q) ||
          (evt.data.bmiCategory || "").toLowerCase().includes(q) ||
          evt.data.flags.some((f) => f.label.toLowerCase().includes(q))
        );
      }
      if (evt.type === "lab") {
        return (
          evt.data.testName.toLowerCase().includes(q) ||
          evt.data.value.toLowerCase().includes(q) ||
          evt.data.code.toLowerCase().includes(q)
        );
      }
      if (evt.type === "document") {
        return (
          evt.data.title.toLowerCase().includes(q) ||
          evt.data.documentType.toLowerCase().includes(q)
        );
      }
      if (evt.type === "communication") {
        return (
          evt.data.title.toLowerCase().includes(q) ||
          evt.data.body.toLowerCase().includes(q) ||
          evt.data.communicationType.toLowerCase().includes(q) ||
          (evt.data.channel || "").toLowerCase().includes(q) ||
          evt.data.createdBy.toLowerCase().includes(q) ||
          evt.data.sourceRef.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [allEvents, activeStream, searchQuery]);

  function handleSynthesizeInterval() {
    setIsSynthesizing(true);
    setTimeout(() => {
      let text = "";
      if (patient.id === "maya-chen") {
        text = `• Interval Trajectory: Sleep onset latency decreased from 90 min to 25 min following Guanfacine ER titration (1mg -> 2mg nightly). No daytime drowsiness.\n• Medication Adherence: Sertraline 100mg maintained; panic symptoms well-controlled.\n• Outstanding Surveillance: Blood pressure & pulse check recommended (last checked Aug 12: 116/74, HR 68).`;
      } else if (patient.id === "jordan-reed") {
        text = `• Interval Trajectory: Mood stabilized on Lamotrigine 150mg daily; sleep maintained on Quetiapine 100mg bedtime.\n• Metabolic Protocol Alert: Overdue for annual fasting lipid panel & HbA1c (last done June 2025; >365 days elapsed).\n• Weight change: +6 lbs noted over past year; monitoring recommended.`;
      } else {
        text = `• Interval Trajectory: Fluoxetine 30mg daily well-tolerated with breakfast; mild transient afternoon fatigue resolving.\n• Affective Status: Depressive symptoms in partial remission; academic transition underway.\n• Follow-up: Re-evaluate PHQ-9 score at upcoming session.`;
      }
      setIntervalSummary(text);
      setIsSynthesizing(false);
      if (onToast) onToast("AI synthesized interval trajectory from past visits and labs!");
    }, 450);
  }

  function handleInsertIntervalToNote() {
    if (!intervalSummary) return;
    if (onInsertText) onInsertText(`[Interval Change Synthesis]:\n${intervalSummary}`);
    if (onToast) onToast("Inserted interval briefing into active encounter note!");
  }

  return (
    <div className="patient-history-container">
      <div className="history-top-header">
        <div className="history-title-col">
          <span className="eyebrow">Longitudinal flowsheet</span>
          <h2>Patient Timeline &amp; Trajectory</h2>
        </div>

        <div className="history-search-bar">
          <span className="search-icon">
            <Icon name="search" />
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search visits, medications, diagnoses, rating scales, vitals, labs, communications..."
          />
          {searchQuery && (
            <Button
              className="clear-search-btn"
              variant="icon"
              size="sm"
              aria-label="Clear search"
              onClick={() => setSearchQuery("")}
            >
              <Icon name="close" />
            </Button>
          )}
        </div>

        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <Button
            size="sm"
            variant="secondary"
            icon="monitor_heart"
            onClick={() => setIsVitalsModalOpen(true)}
          >
            Record Vitals
          </Button>
          <Button
            size="sm"
            variant="secondary"
            icon="assignment"
            onClick={() => setIsAssessmentsModalOpen(true)}
          >
            Administer Scale
          </Button>
        </div>
      </div>

      {/* Top View Mode Tabs */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          borderBottom: "1px solid var(--m3-border)",
          paddingBottom: "12px",
          marginBottom: "16px",
        }}
      >
        <button
          type="button"
          onClick={() => setViewMode("timeline")}
          style={{
            padding: "8px 16px",
            borderRadius: "8px",
            border: "none",
            cursor: "pointer",
            fontSize: "13px",
            fontWeight: viewMode === "timeline" ? 600 : 500,
            background: viewMode === "timeline" ? "var(--m3-primary-container)" : "transparent",
            color: viewMode === "timeline" ? "var(--m3-on-primary-container)" : "var(--m3-text-secondary)",
          }}
        >
          Longitudinal Timeline ({allEvents.length})
        </button>
        <button
          type="button"
          onClick={() => setViewMode("psych_history")}
          style={{
            padding: "8px 16px",
            borderRadius: "8px",
            border: "none",
            cursor: "pointer",
            fontSize: "13px",
            fontWeight: viewMode === "psych_history" ? 600 : 500,
            background: viewMode === "psych_history" ? "var(--m3-primary-container)" : "transparent",
            color: viewMode === "psych_history" ? "var(--m3-on-primary-container)" : "var(--m3-text-secondary)",
          }}
        >
          Structured Psychiatric History
        </button>
        <button
          type="button"
          onClick={() => setViewMode("assessments")}
          style={{
            padding: "8px 16px",
            borderRadius: "8px",
            border: "none",
            cursor: "pointer",
            fontSize: "13px",
            fontWeight: viewMode === "assessments" ? 600 : 500,
            background: viewMode === "assessments" ? "var(--m3-primary-container)" : "transparent",
            color: viewMode === "assessments" ? "var(--m3-on-primary-container)" : "var(--m3-text-secondary)",
          }}
        >
          Clinical Rating Scales ({assessmentsList.length})
        </button>
      </div>

      {viewMode === "psych_history" ? (
        <PatientPsychiatricHistorySection
          patientId={patient.id}
          onInsertToNote={onInsertText}
          onToast={onToast}
        />
      ) : viewMode === "assessments" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>Standardized Clinical Rating Scales</h3>
              <p style={{ margin: 0, fontSize: "12px", color: "var(--m3-text-secondary)" }}>
                PHQ-9, GAD-7, ASRS v1.1, and C-SSRS tracking, automated scoring, and safety alert surveillance.
              </p>
            </div>
            <Button
              variant="primary"
              size="sm"
              icon="add"
              onClick={() => setIsAssessmentsModalOpen(true)}
            >
              Administer New Scale
            </Button>
          </div>

          {assessmentsList.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {assessmentsList.map((a) => (
                <div
                  key={a.id}
                  style={{
                    padding: "16px",
                    background: "var(--m3-surface)",
                    border: "1px solid var(--m3-border)",
                    borderRadius: "10px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <strong style={{ fontSize: "15px" }}>{a.title}</strong>
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: "4px",
                          fontSize: "12px",
                          fontWeight: 700,
                          background: "var(--m3-primary-container)",
                          color: "var(--m3-on-primary-container)",
                        }}
                      >
                        Score: {a.totalScore} / {a.maxScore}
                      </span>
                      <span style={{ fontSize: "12px", color: "var(--m3-text-secondary)" }}>
                        ({a.severity})
                      </span>
                    </div>
                    <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "var(--m3-text-secondary)" }}>
                      Administered {formatClinicalDate(a.administeredAt.split("T")[0])} · Source: {a.source}
                      {a.reviewedBy && ` · Reviewed by ${a.reviewedBy}`}
                    </p>
                    {a.flags && a.flags.length > 0 && (
                      <div style={{ marginTop: "6px" }}>
                        {a.flags.map((f, idx) => (
                          <span
                            key={idx}
                            style={{
                              fontSize: "11px",
                              padding: "2px 6px",
                              background: "var(--m3-danger-container)",
                              color: "var(--m3-on-danger-container)",
                              borderRadius: "4px",
                              fontWeight: 600,
                            }}
                          >
                            ⚠ {f}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: "8px" }}>
                    {onInsertText && (
                      <Button
                        size="sm"
                        variant="secondary"
                        icon="content_paste"
                        onClick={() => {
                          onInsertText(`[${a.title} - ${a.administeredAt.split("T")[0]}]: Score ${a.totalScore}/${a.maxScore} (${a.severity})`);
                          if (onToast) onToast(`Inserted ${a.instrument.toUpperCase()} score into active note!`);
                        }}
                      >
                        Insert to Note
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => setIsAssessmentsModalOpen(true)}
                    >
                      Inspect Scale
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div
              style={{
                background: "var(--m3-surface)",
                border: "1px solid var(--m3-border)",
                borderRadius: "10px",
                padding: "32px",
                textAlign: "center",
              }}
            >
              <p style={{ fontSize: "14px", color: "var(--m3-text-secondary)", marginBottom: "16px" }}>
                No rating scale administrations recorded yet for {patient.name}.
              </p>
              <Button
                variant="secondary"
                size="md"
                icon="assignment"
                onClick={() => setIsAssessmentsModalOpen(true)}
              >
                Launch Scale Questionnaire
              </Button>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Ambient AI Interval Synthesis */}
          <div className="ai-interval-card">
            <div className="interval-card-header">
              <div className="interval-header-left">
                <span className="spark">
                  <Icon name="auto_awesome" />
                </span>
                <div>
                  <strong>Ambient AI Interval Synthesis</strong>
                  <p>Compares prior visits, medication titrations, and labs to summarize what changed over time.</p>
                </div>
              </div>
              <Button
                className="btn-synthesize-interval"
                size="sm"
                loading={isSynthesizing}
                loadingLabel="Analyzing history…"
                onClick={handleSynthesizeInterval}
              >
                What Changed Since Last Visit?
              </Button>
            </div>

            {intervalSummary && (
              <div className="interval-summary-box">
                <pre className="interval-summary-text">{intervalSummary}</pre>
                <div className="interval-action-bar">
                  <Button
                    className="btn-insert-interval"
                    size="sm"
                    icon="content_paste"
                    onClick={handleInsertIntervalToNote}
                  >
                    Insert Interval Summary into Active Encounter Draft
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Stream Filter Tabs */}
          <div className="history-stream-tabs" role="group" aria-label="Filter the longitudinal record">
            {([
              ["all", "All Events", undefined, allEvents.length],
              ["encounters", "Visits", "content_paste", encountersList.length || pastEncounters.length],
              ["meds", "Medications", "medication", medMilestones.length],
              ["diagnoses", "Diagnoses", "coronavirus", problemRecords.length],
              ["assessments", "Scales", "assignment", assessmentsList.length],
              ["vitals", "Vitals", "monitor_heart", vitalsList.length],
              ["labs", "Labs", "biotech", labs.length],
              [
                "communications",
                "Messages & Docs",
                "chat_bubble",
                chartedCommunications.length + documentsList.length,
              ],
            ] as const).map(([value, label, icon, count]) => (
              <Button
                key={value}
                className="stream-tab"
                size="sm"
                icon={icon}
                pressed={activeStream === value}
                onClick={() => setActiveStream(value)}
              >
                {label} ({count})
              </Button>
            ))}
          </div>

          {communicationsError && (
            <InlineError
              message={`Chart communications could not be refreshed. ${communicationsError}`}
              onRetry={() => void refreshChartedCommunications()}
            />
          )}

          {/* Longitudinal Timeline Feed */}
          <div className="timeline-feed">
            {communicationsLoading &&
            activeStream === "communications" &&
            chartedCommunications.length === 0 ? (
              <div className="no-events-box">Loading official charted communications…</div>
            ) : filteredEvents.length === 0 ? (
              <div className="no-events-box">No events found matching current filters.</div>
            ) : (
              filteredEvents.map((evt) => (
                <div key={`${evt.type}-${evt.id}`} className={`timeline-card stream-${evt.type}`}>
                  {/* ENCOUNTER EVENT */}
                  {evt.type === "encounter" && (
                    <div className="event-content">
                      <div className="event-header-row">
                        <span className="event-type-badge encounter">Clinical Visit</span>
                        <strong className="event-title">{(evt.data as any).type}</strong>
                        <time className="event-date">{evt.date}</time>
                      </div>
                      <div className="event-meta-line">
                        <span>Provider: {(evt.data as any).provider || (evt.data as any).signedBy || "Treating Clinician"}</span>
                        {(evt.data as any).status && (
                          <span> · Status: {(evt.data as any).status === "signed" ? "Signed Note" : "Draft"}</span>
                        )}
                      </div>
                      {(evt.data as any).chiefComplaint && (
                        <div className="event-body-section">
                          <strong>Chief Complaint:</strong> {(evt.data as any).chiefComplaint}
                        </div>
                      )}
                      {(evt.data as any).hpi && (
                        <div className="event-body-section">
                          <strong>HPI:</strong> {(evt.data as any).hpi}
                        </div>
                      )}
                      {(evt.data as any).assessment && (
                        <div className="event-body-section">
                          <strong>Assessment:</strong> {(evt.data as any).assessment}
                        </div>
                      )}
                      {(evt.data as any).plan && (
                        <div className="event-body-section plan-box">
                          <strong>Plan:</strong>
                          <pre>{(evt.data as any).plan}</pre>
                        </div>
                      )}
                      <div className="event-actions" style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
                        {onInsertText && (evt.data as any).plan && (
                          <Button
                            className="btn-event-action"
                            size="sm"
                            onClick={() => {
                              onInsertText(`[Prior Plan ${evt.date}]:\n${(evt.data as any).plan}`);
                              if (onToast) onToast(`Copied ${evt.date} plan into active note!`);
                            }}
                          >
                            Insert Prior Plan to Current Encounter
                          </Button>
                        )}
                        {onNavigateSection && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => onNavigateSection("Encounter")}
                          >
                            Open Encounter Note &rarr;
                          </Button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* MEDICATION EVENT */}
                  {evt.type === "med" && (
                    <div className="event-content">
                      <div className="event-header-row">
                        <span className="event-type-badge med">Rx Titration</span>
                        <strong className="event-title">
                          {(evt.data as any).action || "Prescribed"}: {(evt.data as any).medication || (evt.data as any).medication_name}
                        </strong>
                        <time className="event-date">{evt.date}</time>
                      </div>
                      <p className="event-body-text">
                        {(evt.data as any).detail || [(evt.data as any).dose, (evt.data as any).route, (evt.data as any).frequency].filter(Boolean).join(" · ")}
                      </p>
                      <div className="event-actions" style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
                        {onNavigateSection && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => onNavigateSection("Meds")}
                          >
                            View in Meds Workspace &rarr;
                          </Button>
                        )}
                        {onInsertText && (
                          <Button
                            size="sm"
                            variant="tertiary"
                            onClick={() => {
                              onInsertText(`[Medication Milestone ${evt.date}]: ${(evt.data as any).medication || (evt.data as any).medication_name}`);
                              if (onToast) onToast("Inserted medication note!");
                            }}
                          >
                            Insert to Note
                          </Button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* DIAGNOSIS / PROBLEM EVENT */}
                  {evt.type === "diagnosis" && (
                    <div className="event-content">
                      <div className="event-header-row">
                        <span className="event-type-badge encounter" style={{ background: "var(--m3-primary-container)", color: "var(--m3-on-primary-container)" }}>
                          Diagnosis
                        </span>
                        <strong className="event-title">
                          {evt.data.code ? `${evt.data.code} — ` : ""}{evt.data.display_text}
                        </strong>
                        <time className="event-date">{evt.date}</time>
                      </div>
                      <p className="event-body-text">
                        Status: <strong>{evt.data.status}</strong> · Documented in problem list
                        {evt.data.onset_date && ` · Clinical onset: ${evt.data.onset_date}`}
                      </p>
                      <div className="event-actions" style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
                        {onNavigateSection && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => onNavigateSection("Encounter")}
                          >
                            Address in Encounter &rarr;
                          </Button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ASSESSMENT / RATING SCALE EVENT */}
                  {evt.type === "assessment" && (
                    <div className="event-content">
                      <div className="event-header-row">
                        <span
                          className="event-type-badge"
                          style={{
                            background:
                              evt.data.flags.length > 0
                                ? "var(--m3-danger-container)"
                                : "var(--m3-primary-container)",
                            color:
                              evt.data.flags.length > 0
                                ? "var(--m3-on-danger-container)"
                                : "var(--m3-on-primary-container)",
                          }}
                        >
                          {evt.data.flags.length > 0 ? "⚠ Safety Alert" : "Rating Scale"}
                        </span>
                        <strong className="event-title">
                          {evt.data.title}: Score {evt.data.totalScore}/{evt.data.maxScore}
                        </strong>
                        <time className="event-date">{evt.date}</time>
                      </div>
                      <p className="event-body-text">
                        Severity: <strong>{evt.data.severity}</strong> · Source: {evt.data.source}
                        {evt.data.flags.length > 0 && (
                          <span style={{ display: "block", marginTop: "4px", color: "var(--m3-danger)", fontWeight: 600 }}>
                            Flag: {evt.data.flags[0]}
                          </span>
                        )}
                      </p>
                      <div className="event-actions" style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setIsAssessmentsModalOpen(true)}
                        >
                          Inspect Responses &rarr;
                        </Button>
                        {onInsertText && (
                          <Button
                            size="sm"
                            variant="tertiary"
                            onClick={() => {
                              onInsertText(`[${evt.data.title} ${evt.date}]: Score ${evt.data.totalScore}/${evt.data.maxScore} (${evt.data.severity})`);
                              if (onToast) onToast("Inserted rating scale score!");
                            }}
                          >
                            Insert Score to Note
                          </Button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* VITALS EVENT */}
                  {evt.type === "vitals" && (
                    <div className="event-content">
                      <div className="event-header-row">
                        <span className="event-type-badge" style={{ background: "var(--m3-secondary-container)", color: "var(--m3-on-secondary-container)" }}>
                          Vitals Flowsheet
                        </span>
                        <strong className="event-title">
                          BP {evt.data.bpText || (evt.data.systolic ? `${evt.data.systolic}/${evt.data.diastolic} mmHg` : "Recorded")}
                        </strong>
                        <time className="event-date">{evt.date}</time>
                      </div>
                      <p className="event-body-text">
                        Pulse: <strong>{evt.data.heartRate ?? "—"} bpm</strong> · Weight: <strong>{evt.data.weightLbs ? `${((evt.data.weightLbs) * 0.453592).toFixed(1)} kg (${evt.data.weightLbs} lbs)` : "—"}</strong> · BMI: <strong>{evt.data.bmi ?? "—"}</strong> ({evt.data.bmiCategory || ""})
                        {evt.data.flags.find((f) => f.type === "weight_change") && (
                          <span style={{ display: "block", marginTop: "4px", color: "var(--m3-warning)", fontWeight: 600 }}>
                            Trajectory Alert: {evt.data.flags.find((f) => f.type === "weight_change")?.detail}
                          </span>
                        )}
                      </p>
                      <div className="event-actions" style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setIsVitalsModalOpen(true)}
                        >
                          Open Vitals Flowsheet &rarr;
                        </Button>
                        {onInsertText && (
                          <Button
                            size="sm"
                            variant="tertiary"
                            onClick={() => {
                              onInsertText(`[Vitals ${evt.date}]: BP ${evt.data.bpText || `${evt.data.systolic}/${evt.data.diastolic}`}, HR ${evt.data.heartRate || "N/A"} bpm, BMI ${evt.data.bmi || "N/A"}`);
                              if (onToast) onToast("Inserted vitals into note!");
                            }}
                          >
                            Insert to Note
                          </Button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* LAB EVENT */}
                  {evt.type === "lab" && (
                    <div className="event-content">
                      <div className="event-header-row">
                        <span className="event-type-badge lab">Lab Result</span>
                        <strong className="event-title">{evt.data.testName}</strong>
                        <time className="event-date">{evt.date}</time>
                      </div>
                      <div className="event-lab-values">
                        <span>
                          Result: <strong>{evt.data.value}</strong> {evt.data.unit !== "multi" && evt.data.unit}
                        </span>
                        <span>Ref Range: {evt.data.referenceRange}</span>
                        {evt.data.flag && (
                          <span className={`lab-flag ${evt.data.flag}`}>{evt.data.flag}</span>
                        )}
                        <span className="lab-loinc-meta">LOINC {evt.data.code}</span>
                      </div>
                      <div className="event-actions" style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
                        {onNavigateSection && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => onNavigateSection("Labs")}
                          >
                            View in Labs &rarr;
                          </Button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* DOCUMENT EVENT */}
                  {evt.type === "document" && (
                    <div className="event-content">
                      <div className="event-header-row">
                        <span className="event-type-badge" style={{ background: "var(--m3-surface-container-high)", color: "var(--m3-text-secondary)" }}>
                          Document
                        </span>
                        <strong className="event-title">{evt.data.title}</strong>
                        <time className="event-date">{evt.date}</time>
                      </div>
                      <p className="event-body-text">
                        Type: <strong>{evt.data.documentType}</strong> · Created by: {evt.data.createdBy} · Version {evt.data.currentVersion}
                      </p>
                      <div className="event-actions" style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
                        {onNavigateSection && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => onNavigateSection("Documents")}
                          >
                            Open Documents &rarr;
                          </Button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* COMMUNICATION EVENT */}
                  {evt.type === "communication" && (
                    <div className="event-content">
                      <div className="event-header-row">
                        <span className="event-type-badge encounter">Official Chart Communication</span>
                        <strong className="event-title">{evt.data.title}</strong>
                        <time className="event-date">{formatTimelineDate(evt.data.createdAt)}</time>
                      </div>
                      <div className="event-meta-line" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                        <span>
                          <strong>{communicationTypeLabel(evt.data.communicationType)}</strong>
                        </span>
                        {evt.data.channel && <span>Channel: {evt.data.channel}</span>}
                        <span>Charted by: {evt.data.createdBy}</span>
                        <span>Immutable chart record</span>
                      </div>
                      <div className="event-body-section">
                        <pre style={{ whiteSpace: "pre-wrap", margin: 0, fontFamily: "inherit" }}>
                          {evt.data.body}
                        </pre>
                      </div>
                      <div className="event-body-section" style={{ opacity: 0.78, fontSize: 12 }}>
                        <strong>Source:</strong> {evt.data.sourceRef}
                        {evt.data.sourceMessageIds.length > 0 && (
                          <span>
                            {" "}
                            · {evt.data.sourceMessageIds.length} source message
                            {evt.data.sourceMessageIds.length === 1 ? "" : "s"}
                          </span>
                        )}
                        <span> · Integrity SHA-256 {evt.data.contentSha256.slice(0, 12)}…</span>
                      </div>
                      <div className="event-actions" style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
                        {onNavigateSection && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => onNavigateSection("Messages")}
                          >
                            Open Messages &rarr;
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
            {filteredEvents.length > 0 && (
              <div className="timeline-end-marker">
                <span className="end-marker-dot">●</span>
                <span>Initial chart record · Beginning of documented psychiatric history</span>
              </div>
            )}
          </div>
        </>
      )}

      {/* Modals */}
      <PatientVitalsModal
        patientId={patient.id}
        isOpen={isVitalsModalOpen}
        onClose={() => setIsVitalsModalOpen(false)}
        onVitalsRecorded={(v) => {
          setVitalsList((prev) => [v, ...prev]);
          if (onToast) onToast(`Recorded vitals: BP ${v.bpText || "N/A"}, HR ${v.heartRate || "N/A"}`);
        }}
      />

      <PatientAssessmentsModal
        patientId={patient.id}
        isOpen={isAssessmentsModalOpen}
        onClose={() => setIsAssessmentsModalOpen(false)}
        onAssessmentRecorded={(a) => {
          setAssessmentsList((prev) => [a, ...prev]);
          if (onToast) onToast(`Recorded ${a.title}: Score ${a.totalScore}/${a.maxScore}`);
        }}
        onInsertToNote={onInsertText}
      />
    </div>
  );
}
