"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  ASSESSMENT_INSTRUMENTS,
  type AssessmentInstrumentType,
  type AssessmentRecord,
} from "../../domain/clinical-measurements";
import { clinicalRecordApi } from "../../lib/clinical-record-api";
import Icon from "../ui/Icon";
import CompanionPanelFrame from "./CompanionPanelFrame";
import PatientToolScopeBanner from "./PatientToolScopeBanner";
import { derivePatientToolScope, type PatientToolBinding } from "../../lib/companion-tool-scope";
import type { WorkspaceCanvasContext } from "../../lib/workspace-canvas-context";

export default function CalculatorPanel({
  answersByKey,
  onAnswer,
  onInsertToNote,
  onClose,
  onUnpin,
  patientId,
  patientName,
  workspaceContext,
  onAssessmentSaved,
  isExpanded = false,
  onExpand,
  onRedock,
}: {
  /** Answers keyed by `patientId:instrument`; a missing key is a blank scale. */
  answersByKey: Record<string, Record<number, number>>;
  onAnswer: (key: string, questionId: number, score: number) => void;
  onInsertToNote: (summary: string) => void;
  onClose: () => void;
  onUnpin?: () => void;
  patientId?: string;
  patientName?: string;
  workspaceContext?: WorkspaceCanvasContext;
  onAssessmentSaved?: (record: AssessmentRecord) => void;
  isExpanded?: boolean;
  onExpand?: () => void;
  onRedock?: () => void;
}) {
  const [activeInstrument, setActiveInstrument] = useState<AssessmentInstrumentType>("phq-9");
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [saveError, setSaveError] = useState("");

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
  // Answers belong to one patient and one scale. Nothing is pre-filled: a score
  // exists only once the clinician has answered every item for this patient.
  const answerKey = `${boundPatient?.patientId ?? "unbound"}:${activeInstrument}`;
  const currentAnswers = answersByKey[answerKey] ?? {};

  function handleScore(qId: number, val: number) {
    if (!toolScope.canMutate || !boundPatient) return;
    onAnswer(answerKey, qId, val);
  }

  const questionCount = instrumentDef.questions.length;
  const answeredCount = instrumentDef.questions.filter(
    (q) => typeof currentAnswers[q.id] === "number",
  ).length;
  const isComplete = answeredCount === questionCount;
  const totalScore = Object.values(currentAnswers).reduce((sum, val) => sum + (typeof val === "number" ? val : 0), 0);
  const interpretation = instrumentDef.interpret(totalScore, currentAnswers);

  async function handleSaveToChart() {
    if (!boundPatient || !toolScope.canMutate || !isComplete) return;
    setIsSaving(true);
    setSaveError("");
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
      setSaveError("The assessment was not saved. Try again.");
    } finally {
      setIsSaving(false);
    }
  }

  const blockedReason = !toolScope.canMutate
    ? "Return to the pinned patient chart first"
    : !isComplete
      ? `Answer all ${questionCount} questions first`
      : "";

  return (
    <CompanionPanelFrame
      className="calc-panel"
      rootProps={{
        "data-patient-tool": "rating-scales",
        "data-tool-scope-status": toolScope.status,
        "data-companion-panel": "calc",
        "data-companion-presentation": isExpanded ? "expanded" : "docked",
      }}
      title="Clinical Rating Scales"
      context={instrumentDef.title}
      icon="calculate"
      iconStyle={{ background: "#ceead6", color: "#137333" }}
      onClose={onClose}
      onUnpin={onUnpin}
      unpinLabel="Unpin Calculator"
      isExpanded={isExpanded}
      onExpand={onExpand}
      onRedock={onRedock}
      toolbar={
        <>
          <PatientToolScopeBanner scope={toolScope} />
          <div className="calc-scale-switcher" role="group" aria-label="Rating scale">
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
                aria-pressed={activeInstrument === key}
                className={activeInstrument === key ? "active" : ""}
                onClick={() => setActiveInstrument(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      }
      footer={
        <div className="calc-footer">
          <div className="calc-footer-score" data-calc-complete={isComplete ? "true" : "false"}>
            {isComplete ? (
              <>
                <strong>
                  {totalScore} / {instrumentDef.maxScore}
                </strong>
                <span>{interpretation.severity}</span>
              </>
            ) : (
              <>
                <strong>
                  {answeredCount} of {questionCount} answered
                </strong>
                <span>No score until every item is answered</span>
              </>
            )}
          </div>
          <div className="calc-footer-actions">
            <button
              type="button"
              className="companion-btn"
              onClick={() => onInsertToNote(interpretation.summary)}
              disabled={Boolean(blockedReason)}
              title={blockedReason || "Insert completed assessment summary"}
            >
              <Icon name="content_paste" size="sm" /> Insert
            </button>
            {boundPatient && (
              <button
                type="button"
                className={`companion-btn is-primary ${savedSuccess ? "is-success" : ""}`}
                onClick={handleSaveToChart}
                disabled={isSaving || Boolean(blockedReason)}
                title={blockedReason || "Save completed assessment to chart"}
              >
                <Icon name={savedSuccess ? "check" : "save"} size="sm" />
                {savedSuccess ? "Saved" : isSaving ? "Saving…" : "Save to Chart"}
              </button>
            )}
          </div>
        </div>
      }
    >
      <div className={`calc-container ${toolScope.canMutate ? "" : "patient-tool-parked"}`}>
        {saveError ? (
          <p className="calc-save-error" role="alert">
            {saveError}
          </p>
        ) : null}

        {isComplete && interpretation.flags.length > 0 && (
          <div className="calc-safety-alert" role="alert">
            <div>
              <Icon name="warning" size="sm" />
              <span>Safety Risk Alert:</span>
            </div>
            {interpretation.flags.map((f, i) => (
              <p key={i}>• {f}</p>
            ))}
          </div>
        )}

        {instrumentDef.questions.map((q) => (
          <Fragment key={q.id}>
            {q.sectionTitle && (
              <div className={`calc-section-heading ${q.id === 1 ? "is-first" : ""}`}>
                <strong>{q.sectionTitle}</strong>
                {q.sectionDescription && <span>{q.sectionDescription}</span>}
              </div>
            )}
            <div className="calc-question">
              <p>
                <strong>{q.id}.</strong> {q.text}
              </p>
              <div className="calc-options">
                {q.options.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={currentAnswers[q.id] === opt.value ? "selected" : ""}
                    aria-pressed={currentAnswers[q.id] === opt.value}
                    onClick={() => handleScore(q.id, opt.value)}
                    disabled={!toolScope.canMutate}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </Fragment>
        ))}
      </div>
    </CompanionPanelFrame>
  );
}
