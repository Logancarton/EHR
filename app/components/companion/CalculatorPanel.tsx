"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  ASSESSMENT_INSTRUMENTS,
  type AssessmentInstrumentType,
  type AssessmentRecord,
} from "../../domain/clinical-measurements";
import { clinicalRecordApi } from "../../lib/clinical-record-api";
import Icon from "../ui/Icon";
import CompanionPanelHeader from "./CompanionPanelHeader";
import PatientToolScopeBanner from "./PatientToolScopeBanner";
import { derivePatientToolScope, type PatientToolBinding } from "../../lib/companion-tool-scope";
import type { WorkspaceCanvasContext } from "../../lib/workspace-canvas-context";

export default function CalculatorPanel({
  answers: externalPhqAnswers,
  onAnswer: externalOnAnswer,
  onInsertToNote,
  onClose,
  onUnpin,
  patientId,
  patientName,
  workspaceContext,
  onAssessmentSaved,
}: {
  answers: Record<number, number>;
  onAnswer: (index: number, score: number) => void;
  onInsertToNote: (summary: string) => void;
  onClose: () => void;
  onUnpin?: () => void;
  patientId?: string;
  patientName?: string;
  workspaceContext?: WorkspaceCanvasContext;
  onAssessmentSaved?: (record: AssessmentRecord) => void;
}) {
  const [activeInstrument, setActiveInstrument] = useState<AssessmentInstrumentType>("phq-9");
  const [internalAnswers, setInternalAnswers] = useState<Record<string, Record<number, number>>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const [boundPatient, setBoundPatient] = useState<PatientToolBinding | null>(() =>
    patientId ? { patientId, patientName: patientName || patientId } : null,
  );

  // Practice workspaces park this tool instead of silently retargeting its answers.
  useEffect(() => {
    if (!boundPatient && patientId) {
      setBoundPatient({ patientId, patientName: patientName || patientId });
    }
  }, [boundPatient, patientId, patientName]);

  const effectiveWorkspaceContext = useMemo<WorkspaceCanvasContext>(
    () =>
      workspaceContext ??
      (patientId
        ? {
            tabId: `patient:${patientId}`,
            kind: "patient",
            label: `${patientName || "Patient chart"} · Overview`,
            patientId,
            section: "Overview",
            customizerTab: "overview",
          }
        : {
            tabId: "workspace:unknown",
            kind: "workspace",
            label: "Practice workspace",
            customizerTab: "density",
          }),
    [patientId, patientName, workspaceContext],
  );

  const toolScope = derivePatientToolScope({
    workspaceContext: effectiveWorkspaceContext,
    boundPatient,
  });

  const instrumentDef = ASSESSMENT_INSTRUMENTS[activeInstrument];

  // For PHQ-9, bridge to external answers for full backward compatibility; for others use internal state
  const currentAnswers =
    activeInstrument === "phq-9"
      ? externalPhqAnswers
      : internalAnswers[activeInstrument] || {};

  function handleScore(qId: number, val: number) {
    if (!toolScope.canMutate) return;
    if (activeInstrument === "phq-9") {
      externalOnAnswer(qId, val);
    } else {
      setInternalAnswers((prev) => ({
        ...prev,
        [activeInstrument]: {
          ...(prev[activeInstrument] || {}),
          [qId]: val,
        },
      }));
    }
  }

  const answeredCount = Object.keys(currentAnswers).length;
  const isComplete = answeredCount === instrumentDef.questions.length;
  const totalScore = Object.values(currentAnswers).reduce((sum, val) => sum + (typeof val === "number" ? val : 0), 0);
  const interpretation = instrumentDef.interpret(totalScore, currentAnswers);
  const displayedSeverity = isComplete
    ? interpretation.severity
    : `Incomplete · ${answeredCount}/${instrumentDef.questions.length} answered`;

  async function handleSaveToChart() {
    if (!boundPatient || !toolScope.canMutate || !isComplete) return;
    setIsSaving(true);
    try {
      const record = await clinicalRecordApi.recordAssessment(boundPatient.patientId, {
        instrument: activeInstrument,
        responses: currentAnswers,
        source: "clinician",
        notes: "Administered via Clinical Companion Calculator",
      });
      setSavedSuccess(true);
      if (onAssessmentSaved) onAssessmentSaved(record);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch {
      // Keep UI responsive
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <aside className="companion-panel" data-patient-tool="rating-scales" data-tool-scope-status={toolScope.status}>
      <CompanionPanelHeader
        title="Clinical Rating Scales"
        context={instrumentDef.title}
        icon="calculate"
        iconStyle={{ background: "#ceead6", color: "#137333" }}
        onClose={onClose}
        onUnpin={onUnpin}
        unpinLabel="Unpin Calculator"
      />

      <PatientToolScopeBanner scope={toolScope} />

      {/* Quick scale switcher */}
      <div style={{ display: "flex", gap: "4px", padding: "8px 12px", borderBottom: "1px solid var(--m3-border)", background: "var(--m3-surface-container-low)", overflowX: "auto" }}>
        {(
          [
            ["phq-9", "PHQ-9"],
            ["gad-7", "GAD-7"],
            ["asrs-v1.1", "ASRS"],
            ["cssrs", "C-SSRS"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveInstrument(key)}
            style={{
              padding: "4px 8px",
              borderRadius: "4px",
              border: "none",
              fontSize: "11px",
              fontWeight: activeInstrument === key ? 700 : 500,
              background: activeInstrument === key ? "var(--m3-primary)" : "transparent",
              color: activeInstrument === key ? "#fff" : "var(--m3-text-secondary)",
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className={`calc-container ${toolScope.canMutate ? "" : "patient-tool-parked"}`}>
        <div className="calc-score-badge">
          <div>
            <strong style={{ fontSize: "20px" }}>
              {totalScore} / {instrumentDef.maxScore}
            </strong>
            <div style={{ fontSize: "11px", marginTop: "2px", opacity: 0.9 }}>
              {displayedSeverity}
            </div>
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            <button
              type="button"
              className="note-copy-btn"
              style={{ padding: "6px 10px", fontSize: "11px" }}
              onClick={() => onInsertToNote(interpretation.summary)}
              disabled={!isComplete || !toolScope.canMutate}
              title={
                !toolScope.canMutate
                  ? "Return to the pinned patient chart before inserting"
                  : isComplete
                    ? "Insert completed assessment summary"
                    : "Answer all questions before inserting"
              }
            >
              <Icon name="content_paste" size="sm" /> Insert
            </button>
            {boundPatient && (
              <button
                type="button"
                className="note-copy-btn"
                style={{
                  padding: "6px 10px",
                  fontSize: "11px",
                  background: savedSuccess ? "var(--m3-success)" : undefined,
                  color: savedSuccess ? "#fff" : undefined,
                }}
                onClick={handleSaveToChart}
                disabled={isSaving || !isComplete || !toolScope.canMutate}
                title={
                  !toolScope.canMutate
                    ? "Return to the pinned patient chart before saving"
                    : isComplete
                      ? "Save completed assessment to chart"
                      : "Answer all questions before saving"
                }
              >
                <Icon name={savedSuccess ? "check" : "save"} size="sm" />
                {savedSuccess ? "Saved!" : isSaving ? "Saving…" : "Save to Chart"}
              </button>
            )}
          </div>
        </div>

        {isComplete && interpretation.flags.length > 0 && (
          <div
            style={{
              padding: "8px 10px",
              background: "var(--m3-danger-container)",
              color: "var(--m3-on-danger-container)",
              borderRadius: "6px",
              marginBottom: "12px",
              fontSize: "11px",
              fontWeight: 600,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <Icon name="warning" size="sm" />
              <span>Safety Risk Alert:</span>
            </div>
            {interpretation.flags.map((f, i) => (
              <div key={i} style={{ marginTop: "2px", fontWeight: 400 }}>
                • {f}
              </div>
            ))}
          </div>
        )}

        {instrumentDef.questions.map((q) => (
          <Fragment key={q.id}>
            {q.sectionTitle && (
              <div
                style={{
                  margin: q.id === 1 ? "2px 0 10px" : "16px 0 10px",
                  paddingTop: q.id === 1 ? 0 : "12px",
                  borderTop: q.id === 1 ? "none" : "1px solid var(--m3-border)",
                }}
              >
                <strong style={{ display: "block", fontSize: "12px" }}>{q.sectionTitle}</strong>
                {q.sectionDescription && (
                  <span
                    style={{
                      display: "block",
                      marginTop: "3px",
                      fontSize: "10.5px",
                      color: "var(--m3-text-secondary)",
                      lineHeight: 1.4,
                    }}
                  >
                    {q.sectionDescription}
                  </span>
                )}
              </div>
            )}
            <div className="calc-question">
            <p style={{ fontSize: "12px", margin: "0 0 6px" }}>
              <strong>{q.id}.</strong> {q.text}
            </p>
            <div className="calc-options" style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
              {q.options.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={currentAnswers[q.id] === opt.value ? "selected" : ""}
                  onClick={() => handleScore(q.id, opt.value)}
                  disabled={!toolScope.canMutate}
                  style={{ fontSize: "11px", padding: "4px 8px" }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          </Fragment>
        ))}
      </div>
    </aside>
  );
}
