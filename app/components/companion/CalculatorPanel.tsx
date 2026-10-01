"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  ASSESSMENT_INSTRUMENTS,
  type AssessmentInstrumentType,
  type AssessmentRecord,
} from "../../domain/clinical-measurements";
import {
  calculateCockcroftGault,
  calculateBmiAndMetabolic,
  calculateQtc,
  calculateDaysLater,
} from "../../domain/medical-calculators";
import { clinicalRecordApi } from "../../lib/clinical-record-api";
import Icon from "../ui/Icon";
import CompanionPanelFrame from "./CompanionPanelFrame";
import PatientToolScopeBanner from "./PatientToolScopeBanner";
import { derivePatientToolScope, type PatientToolBinding } from "../../lib/companion-tool-scope";
import type { WorkspaceCanvasContext } from "../../lib/workspace-canvas-context";

export type CalculatorCategory = "scales" | "medical";
export type MedicalCalculatorType = "crcl" | "bmi" | "qtc" | "days-later";

export default function CalculatorPanel({
  answersByKey,
  onAnswer,
  onInsertToNote,
  onClose,
  onUnpin,
  patientId,
  patientName,
  patientAge,
  patientSex,
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
  patientAge?: number;
  patientSex?: "male" | "female";
  workspaceContext?: WorkspaceCanvasContext;
  onAssessmentSaved?: (record: AssessmentRecord) => void;
  isExpanded?: boolean;
  onExpand?: () => void;
  onRedock?: () => void;
}) {
  const [calcCategory, setCalcCategory] = useState<CalculatorCategory>("scales");
  const [activeInstrument, setActiveInstrument] = useState<AssessmentInstrumentType>("phq-9");
  const [activeMedicalCalc, setActiveMedicalCalc] = useState<MedicalCalculatorType>("crcl");

  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [copiedNotification, setCopiedNotification] = useState("");

  const [boundPatient, setBoundPatient] = useState<PatientToolBinding | null>(() =>
    patientId ? { patientId, patientName: patientName || patientId } : null,
  );

  // Auto-bind when first mounting with an active patient
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

  // -------------------------------------------------------------------------
  // Rating Scales State & Scoring
  // -------------------------------------------------------------------------
  const instrumentDef = ASSESSMENT_INSTRUMENTS[activeInstrument];
  // Answers belong to one patient and one scale. Nothing is pre-filled: a score
  // exists only once the clinician has answered every item for this patient.
  const answerKey = `${boundPatient?.patientId ?? "unbound"}:${activeInstrument}`;
  const currentAnswers = answersByKey[answerKey] ?? {};

  function handleScore(qId: number, val: number) {
    // Only park input when explicitly pinned to a background chart (D-098)
    if (toolScope.status === "inactive") return;
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

  function handleCopy(text: string) {
    if (!text) return;
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopiedNotification(text);
    setTimeout(() => setCopiedNotification(""), 2200);
  }

  const blockedReason =
    toolScope.status === "inactive"
      ? "Return to the pinned patient chart first"
      : !isComplete
        ? `Answer all ${questionCount} questions first`
        : "";

  // -------------------------------------------------------------------------
  // Medical Calculators State
  // -------------------------------------------------------------------------
  // CrCl inputs
  const [crclAge, setCrclAge] = useState<number>(() => patientAge || 52);
  const [crclSex, setCrclSex] = useState<"male" | "female">(() => patientSex || "male");
  const [crclWeight, setCrclWeight] = useState<number>(70);
  const [crclWeightUnit, setCrclWeightUnit] = useState<"kg" | "lbs">("kg");
  const [crclScr, setCrclScr] = useState<number>(1.0);

  // BMI inputs
  const [bmiWeight, setBmiWeight] = useState<number>(165);
  const [bmiWeightUnit, setBmiWeightUnit] = useState<"lbs" | "kg">("lbs");
  const [bmiHeight, setBmiHeight] = useState<number>(68);
  const [bmiHeightUnit, setBmiHeightUnit] = useState<"in" | "cm">("in");

  // QTc inputs
  const [qtcMs, setQtcMs] = useState<number>(410);
  const [qtcHr, setQtcHr] = useState<number>(72);
  const [qtcSex, setQtcSex] = useState<"male" | "female">(() => patientSex || "female");

  // Days-Later inputs
  const [daysLaterBase, setDaysLaterBase] = useState<string>(() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  });
  const [daysLaterCount, setDaysLaterCount] = useState<number>(28);

  // Derived medical results
  const crclResult = useMemo(() => {
    const weightKg = crclWeightUnit === "kg" ? crclWeight : crclWeight * 0.453592;
    return calculateCockcroftGault({
      age: crclAge,
      sex: crclSex,
      weightKg,
      serumCreatinineMgDl: crclScr,
    });
  }, [crclAge, crclSex, crclWeight, crclWeightUnit, crclScr]);

  const bmiResult = useMemo(() => {
    return calculateBmiAndMetabolic({
      weightLbs: bmiWeightUnit === "lbs" ? bmiWeight : undefined,
      weightKg: bmiWeightUnit === "kg" ? bmiWeight : undefined,
      heightIn: bmiHeightUnit === "in" ? bmiHeight : undefined,
      heightCm: bmiHeightUnit === "cm" ? bmiHeight : undefined,
    });
  }, [bmiWeight, bmiWeightUnit, bmiHeight, bmiHeightUnit]);

  const qtcResult = useMemo(() => {
    return calculateQtc({
      qtMs: qtcMs,
      heartRateBpm: qtcHr,
      sex: qtcSex,
    });
  }, [qtcMs, qtcHr, qtcSex]);

  const daysLaterResult = useMemo(() => {
    return calculateDaysLater({
      baseDate: daysLaterBase,
      days: daysLaterCount,
    });
  }, [daysLaterBase, daysLaterCount]);

  return (
    <CompanionPanelFrame
      className="calc-panel"
      rootProps={{
        "data-patient-tool": "rating-scales",
        "data-tool-scope-status": toolScope.status,
        "data-companion-panel": "calc",
        "data-companion-presentation": isExpanded ? "expanded" : "docked",
      }}
      title={calcCategory === "scales" ? "Clinical Rating Scales" : "Medical & Dosing Calculators"}
      context={calcCategory === "scales" ? instrumentDef.title : "Renal, Metabolic & QTc Guidance"}
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

          {/* Quick chart re-bind / unbind controls */}
          {patientId && patientId !== boundPatient?.patientId ? (
            <div className="calc-rebind-bar" role="status">
              <span>Active chart: <strong>{patientName}</strong></span>
              <div className="calc-rebind-actions">
                <button
                  type="button"
                  onClick={() => setBoundPatient({ patientId, patientName: patientName || patientId })}
                >
                  Bind to {patientName}
                </button>
                <button type="button" onClick={() => setBoundPatient(null)}>
                  Unbind
                </button>
              </div>
            </div>
          ) : boundPatient && !patientId ? (
            <div className="calc-rebind-bar" role="status">
              <span>Pinned: <strong>{boundPatient.patientName}</strong> (Inactive)</span>
              <div className="calc-rebind-actions">
                <button type="button" onClick={() => setBoundPatient(null)}>
                  Unbind (Quick Calc)
                </button>
              </div>
            </div>
          ) : null}

          {/* Primary Category Switcher: Rating Scales vs Medical Calculators */}
          <div className="calc-mode-segmented" role="tablist" aria-label="Calculator Category">
            <button
              type="button"
              role="tab"
              aria-selected={calcCategory === "scales"}
              className={calcCategory === "scales" ? "active" : ""}
              onClick={() => setCalcCategory("scales")}
            >
              Rating Scales
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={calcCategory === "medical"}
              className={calcCategory === "medical" ? "active" : ""}
              onClick={() => setCalcCategory("medical")}
            >
              Medical &amp; Dosing
            </button>
          </div>

          {/* Scale or Calculator Sub-switcher */}
          {calcCategory === "scales" ? (
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
          ) : (
            <div className="calc-scale-switcher" role="group" aria-label="Medical calculator">
              {(
                [
                  ["crcl", "CrCl / eGFR"],
                  ["bmi", "BMI & Metabolic"],
                  ["qtc", "QTc Interval"],
                  ["days-later", "Follow-up / Days"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={activeMedicalCalc === key}
                  className={activeMedicalCalc === key ? "active" : ""}
                  onClick={() => setActiveMedicalCalc(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </>
      }
      footer={
        calcCategory === "scales" ? (
          <div className="calc-footer">
            <div className="calc-footer-score" data-calc-complete={isComplete ? "true" : "false"}>
              {isComplete ? (
                <>
                  <strong>
                    {totalScore} / {instrumentDef.maxScore}
                  </strong>
                  <span
                    className={`calc-severity-badge ${
                      interpretation.flags.length > 0 ||
                      interpretation.severity.toLowerCase().includes("positive") ||
                      interpretation.severity.toLowerCase().includes("severe")
                        ? "is-positive"
                        : interpretation.severity.toLowerCase().includes("moderate")
                          ? "is-moderate"
                          : "is-minimal"
                    }`}
                  >
                    {interpretation.severity}
                  </span>
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
                aria-label="Insert"
                title={blockedReason || "Insert completed assessment summary into clinical encounter note"}
              >
                <Icon name="content_paste" size="sm" /> Insert
              </button>
              <button
                type="button"
                className="companion-btn"
                onClick={() => handleCopy(interpretation.summary)}
                disabled={!isComplete}
                title="Copy assessment summary to clipboard"
              >
                <Icon name={copiedNotification === interpretation.summary ? "check" : "content_copy"} size="sm" />
                {copiedNotification === interpretation.summary ? "Copied" : "Copy"}
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
        ) : null
      }
    >
      {calcCategory === "scales" ? (
        <div className={`calc-container ${toolScope.status === "inactive" ? "patient-tool-parked" : ""}`}>
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
                  {q.options.map((opt) => {
                    const isAsrsThreshold =
                      activeInstrument === "asrs-v1.1" &&
                      q.id >= 1 &&
                      q.id <= 6 &&
                      ((q.id <= 3 && opt.value >= 2) || (q.id >= 4 && opt.value >= 3));

                    return (
                      <button
                        key={opt.value}
                        type="button"
                        className={`${currentAnswers[q.id] === opt.value ? "selected" : ""} ${isAsrsThreshold ? "is-threshold-option" : ""}`.trim()}
                        aria-pressed={currentAnswers[q.id] === opt.value}
                        onClick={() => handleScore(q.id, opt.value)}
                        disabled={toolScope.status === "inactive"}
                        title={isAsrsThreshold ? `${opt.label} — ASRS Part A threshold criteria` : opt.label}
                      >
                        {opt.label}
                        {isAsrsThreshold && (
                          <span className="calc-threshold-marker" title="Part A Threshold" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </Fragment>
          ))}
        </div>
      ) : (
        /* Medical & Dosing Calculators Body */
        <div className="calc-med-container">
          {/* 1. CrCl / Cockcroft-Gault */}
          {activeMedicalCalc === "crcl" && (
            <>
              <div className="calc-med-form">
                <div className="calc-form-row">
                  <div className="calc-field-group">
                    <label htmlFor="crcl-age">Patient Age (yrs)</label>
                    <input
                      id="crcl-age"
                      type="number"
                      min="18"
                      max="120"
                      value={crclAge}
                      onChange={(e) => setCrclAge(Number(e.target.value) || 0)}
                    />
                  </div>
                  <div className="calc-field-group">
                    <label>Biological Sex</label>
                    <div className="calc-toggle-group">
                      <button
                        type="button"
                        className={crclSex === "male" ? "active" : ""}
                        onClick={() => setCrclSex("male")}
                      >
                        Male
                      </button>
                      <button
                        type="button"
                        className={crclSex === "female" ? "active" : ""}
                        onClick={() => setCrclSex("female")}
                      >
                        Female (×0.85)
                      </button>
                    </div>
                  </div>
                </div>

                <div className="calc-form-row">
                  <div className="calc-field-group">
                    <label htmlFor="crcl-weight">Weight</label>
                    <div className="calc-input-with-units">
                      <input
                        id="crcl-weight"
                        type="number"
                        min="20"
                        max="400"
                        value={crclWeight}
                        onChange={(e) => setCrclWeight(Number(e.target.value) || 0)}
                      />
                      <div className="calc-unit-toggle">
                        <button
                          type="button"
                          className={crclWeightUnit === "kg" ? "active" : ""}
                          onClick={() => setCrclWeightUnit("kg")}
                        >
                          kg
                        </button>
                        <button
                          type="button"
                          className={crclWeightUnit === "lbs" ? "active" : ""}
                          onClick={() => setCrclWeightUnit("lbs")}
                        >
                          lbs
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="calc-field-group">
                    <label htmlFor="crcl-scr">Serum Creatinine (mg/dL)</label>
                    <input
                      id="crcl-scr"
                      type="number"
                      step="0.1"
                      min="0.2"
                      max="15.0"
                      value={crclScr}
                      onChange={(e) => setCrclScr(Number(e.target.value) || 0)}
                    />
                  </div>
                </div>
              </div>

              {crclResult && (
                <div className="calc-result-card">
                  <div className="calc-result-header">
                    <div className="calc-result-value">
                      <strong>{crclResult.crClMlMin}</strong>
                      <span>mL/min (Cockcroft-Gault)</span>
                    </div>
                    <span className={`calc-severity-badge is-${crclResult.severity === "normal" ? "minimal" : crclResult.severity}`}>
                      {crclResult.stage}
                    </span>
                  </div>

                  <div className={`calc-guidance-box is-${crclResult.severity}`}>
                    <strong>
                      <Icon name="medication" size="sm" /> Lithium Dosing Guidance:
                    </strong>
                    <span>{crclResult.lithiumGuidance}</span>
                  </div>

                  <div className="calc-guidance-box is-normal">
                    <strong>
                      <Icon name="info" size="sm" /> Gabapentin / Psychotropic Guidance:
                    </strong>
                    <span>{crclResult.gabapentinGuidance}</span>
                  </div>

                  <div className="calc-footer-actions" style={{ marginTop: "4px" }}>
                    <button
                      type="button"
                      className="companion-btn"
                      onClick={() => onInsertToNote(crclResult.summary)}
                      aria-label="Insert"
                      title="Insert CrCl calculation and dosing guidance into clinical note"
                    >
                      <Icon name="content_paste" size="sm" /> Insert
                    </button>
                    <button
                      type="button"
                      className="companion-btn"
                      onClick={() => handleCopy(crclResult.summary)}
                      title="Copy summary to clipboard"
                    >
                      <Icon name={copiedNotification === crclResult.summary ? "check" : "content_copy"} size="sm" />
                      {copiedNotification === crclResult.summary ? "Copied" : "Copy"}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* 2. BMI & Metabolic Surveillance */}
          {activeMedicalCalc === "bmi" && (
            <>
              <div className="calc-med-form">
                <div className="calc-form-row">
                  <div className="calc-field-group">
                    <label htmlFor="bmi-weight">Weight</label>
                    <div className="calc-input-with-units">
                      <input
                        id="bmi-weight"
                        type="number"
                        min="40"
                        max="600"
                        value={bmiWeight}
                        onChange={(e) => setBmiWeight(Number(e.target.value) || 0)}
                      />
                      <div className="calc-unit-toggle">
                        <button
                          type="button"
                          className={bmiWeightUnit === "lbs" ? "active" : ""}
                          onClick={() => setBmiWeightUnit("lbs")}
                        >
                          lbs
                        </button>
                        <button
                          type="button"
                          className={bmiWeightUnit === "kg" ? "active" : ""}
                          onClick={() => setBmiWeightUnit("kg")}
                        >
                          kg
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="calc-field-group">
                    <label htmlFor="bmi-height">Height</label>
                    <div className="calc-input-with-units">
                      <input
                        id="bmi-height"
                        type="number"
                        min="30"
                        max="250"
                        value={bmiHeight}
                        onChange={(e) => setBmiHeight(Number(e.target.value) || 0)}
                      />
                      <div className="calc-unit-toggle">
                        <button
                          type="button"
                          className={bmiHeightUnit === "in" ? "active" : ""}
                          onClick={() => setBmiHeightUnit("in")}
                        >
                          in
                        </button>
                        <button
                          type="button"
                          className={bmiHeightUnit === "cm" ? "active" : ""}
                          onClick={() => setBmiHeightUnit("cm")}
                        >
                          cm
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {bmiResult && (
                <div className="calc-result-card">
                  <div className="calc-result-header">
                    <div className="calc-result-value">
                      <strong>{bmiResult.bmi}</strong>
                      <span>kg/m² (BMI)</span>
                    </div>
                    <span className={`calc-severity-badge is-${bmiResult.severity === "normal" ? "minimal" : bmiResult.severity}`}>
                      {bmiResult.category}
                    </span>
                  </div>

                  <div className={`calc-guidance-box is-${bmiResult.severity}`}>
                    <strong>
                      <Icon name="monitor_heart" size="sm" /> Antipsychotic Metabolic Surveillance:
                    </strong>
                    <span>{bmiResult.monitoringGuidance}</span>
                  </div>

                  <div className="calc-footer-actions" style={{ marginTop: "4px" }}>
                    <button
                      type="button"
                      className="companion-btn"
                      onClick={() => onInsertToNote(bmiResult.summary)}
                      aria-label="Insert"
                      title="Insert BMI and metabolic surveillance into clinical note"
                    >
                      <Icon name="content_paste" size="sm" /> Insert
                    </button>
                    <button
                      type="button"
                      className="companion-btn"
                      onClick={() => handleCopy(bmiResult.summary)}
                      title="Copy summary to clipboard"
                    >
                      <Icon name={copiedNotification === bmiResult.summary ? "check" : "content_copy"} size="sm" />
                      {copiedNotification === bmiResult.summary ? "Copied" : "Copy"}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* 3. QTc Interval Calculator */}
          {activeMedicalCalc === "qtc" && (
            <>
              <div className="calc-med-form">
                <div className="calc-form-row">
                  <div className="calc-field-group">
                    <label htmlFor="qtc-qt">QT Interval (ms)</label>
                    <input
                      id="qtc-qt"
                      type="number"
                      min="200"
                      max="700"
                      value={qtcMs}
                      onChange={(e) => setQtcMs(Number(e.target.value) || 0)}
                    />
                  </div>
                  <div className="calc-field-group">
                    <label htmlFor="qtc-hr">Heart Rate (bpm)</label>
                    <input
                      id="qtc-hr"
                      type="number"
                      min="30"
                      max="220"
                      value={qtcHr}
                      onChange={(e) => setQtcHr(Number(e.target.value) || 0)}
                    />
                  </div>
                </div>

                <div className="calc-field-group">
                  <label>Biological Sex</label>
                  <div className="calc-toggle-group">
                    <button
                      type="button"
                      className={qtcSex === "male" ? "active" : ""}
                      onClick={() => setQtcSex("male")}
                    >
                      Male (normal ≤ 450 ms)
                    </button>
                    <button
                      type="button"
                      className={qtcSex === "female" ? "active" : ""}
                      onClick={() => setQtcSex("female")}
                    >
                      Female (normal ≤ 460 ms)
                    </button>
                  </div>
                </div>
              </div>

              {qtcResult && (
                <div className="calc-result-card">
                  <div className="calc-result-header">
                    <div className="calc-result-value">
                      <strong>{qtcResult.qtcBazettMs} ms</strong>
                      <span>Bazett (QTcF: {qtcResult.qtcFridericiaMs} ms)</span>
                    </div>
                    <span className={`calc-severity-badge is-${qtcResult.severity === "normal" ? "minimal" : qtcResult.severity}`}>
                      {qtcResult.riskCategory}
                    </span>
                  </div>

                  <div className={`calc-guidance-box is-${qtcResult.severity}`}>
                    <strong>
                      <Icon name="warning" size="sm" /> Psychotropic Risk Analysis:
                    </strong>
                    <span>{qtcResult.clinicalAlert}</span>
                  </div>

                  <div className="calc-footer-actions" style={{ marginTop: "4px" }}>
                    <button
                      type="button"
                      className="companion-btn"
                      onClick={() => onInsertToNote(qtcResult.summary)}
                      aria-label="Insert"
                      title="Insert QTc calculation into clinical note"
                    >
                      <Icon name="content_paste" size="sm" /> Insert
                    </button>
                    <button
                      type="button"
                      className="companion-btn"
                      onClick={() => handleCopy(qtcResult.summary)}
                      title="Copy summary to clipboard"
                    >
                      <Icon name={copiedNotification === qtcResult.summary ? "check" : "content_copy"} size="sm" />
                      {copiedNotification === qtcResult.summary ? "Copied" : "Copy"}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* 4. Days-Later / Follow-up & Refill Interval */}
          {activeMedicalCalc === "days-later" && (
            <>
              <div className="calc-med-form">
                <div className="calc-form-row">
                  <div className="calc-field-group">
                    <label htmlFor="days-base">Base Date</label>
                    <input
                      id="days-base"
                      type="date"
                      value={daysLaterBase}
                      onChange={(e) => setDaysLaterBase(e.target.value)}
                    />
                  </div>
                  <div className="calc-field-group">
                    <label htmlFor="days-count">Interval (Days)</label>
                    <input
                      id="days-count"
                      type="number"
                      min="1"
                      max="365"
                      value={daysLaterCount}
                      onChange={(e) => setDaysLaterCount(Number(e.target.value) || 0)}
                    />
                  </div>
                </div>

                <div className="calc-field-group">
                  <label>Quick Presets</label>
                  <div className="calc-preset-chips">
                    {[
                      [14, "+14d (Titration)"],
                      [28, "+28d (4-Wk)"],
                      [30, "+30d (1-Mo)"],
                      [60, "+60d (2-Mo)"],
                      [90, "+90d (3-Mo)"],
                    ].map(([days, label]) => (
                      <button
                        key={days}
                        type="button"
                        className={daysLaterCount === days ? "active" : ""}
                        onClick={() => setDaysLaterCount(days as number)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {daysLaterResult && (
                <div className="calc-result-card">
                  <div className="calc-result-header">
                    <div className="calc-result-value">
                      <strong>{daysLaterResult.formattedDate}</strong>
                      <span>({daysLaterCount} days later)</span>
                    </div>
                    <span className={`calc-severity-badge is-${daysLaterResult.isWeekend ? "moderate" : "minimal"}`}>
                      {daysLaterResult.dayOfWeek}
                    </span>
                  </div>

                  {daysLaterResult.weekendWarning ? (
                    <div className="calc-guidance-box is-moderate">
                      <strong>
                        <Icon name="event_busy" size="sm" /> Weekend Notice:
                      </strong>
                      <span>{daysLaterResult.weekendWarning}</span>
                    </div>
                  ) : (
                    <div className="calc-guidance-box is-normal">
                      <strong>
                        <Icon name="event_available" size="sm" /> Clinic Day:
                      </strong>
                      <span>Lands on a regular business day ({daysLaterResult.dayOfWeek}).</span>
                    </div>
                  )}

                  <div className="calc-footer-actions" style={{ marginTop: "4px" }}>
                    <button
                      type="button"
                      className="companion-btn"
                      onClick={() => onInsertToNote(daysLaterResult.summary)}
                      aria-label="Insert"
                      title="Insert follow-up date into clinical note"
                    >
                      <Icon name="content_paste" size="sm" /> Insert
                    </button>
                    <button
                      type="button"
                      className="companion-btn"
                      onClick={() => handleCopy(daysLaterResult.summary)}
                      title="Copy date to clipboard"
                    >
                      <Icon name={copiedNotification === daysLaterResult.summary ? "check" : "content_copy"} size="sm" />
                      {copiedNotification === daysLaterResult.summary ? "Copied" : "Copy"}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </CompanionPanelFrame>
  );
}
