"use client";

import { Fragment, useEffect, useState } from "react";
import {
  ASSESSMENT_INSTRUMENTS,
  type AssessmentInstrumentType,
  type AssessmentRecord,
} from "../../domain/clinical-measurements";
import { clinicalRecordApi } from "../../lib/clinical-record-api";
import { formatClinicalDate, formatClinicalDateTime } from "../../lib/clinical-date";
import Icon from "../ui/Icon";
import Button from "../ui/Button";

export default function PatientAssessmentsModal({
  patientId,
  isOpen,
  onClose,
  initialInstrument = "phq-9",
  onAssessmentRecorded,
  onInsertToNote,
}: {
  patientId: string;
  isOpen: boolean;
  onClose: () => void;
  initialInstrument?: AssessmentInstrumentType;
  onAssessmentRecorded?: (assessment: AssessmentRecord) => void;
  onInsertToNote?: (text: string) => void;
}) {
  const [selectedInstrument, setSelectedInstrument] = useState<AssessmentInstrumentType>(initialInstrument);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [notes, setNotes] = useState<string>("");
  const [source, setSource] = useState<"clinician" | "patient" | "staff">("clinician");

  const [history, setHistory] = useState<AssessmentRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    clinicalRecordApi
      .snapshot(patientId)
      .then((snap) => {
        setHistory(snap.assessments || []);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setLoading(false));
  }, [isOpen, patientId]);

  useEffect(() => {
    // Reset answers when switching instrument
    setAnswers({});
  }, [selectedInstrument]);

  if (!isOpen) return null;

  const currentDef = ASSESSMENT_INSTRUMENTS[selectedInstrument];
  const answeredCount = Object.keys(answers).length;
  const isComplete = answeredCount === currentDef.questions.length;

  const liveTotalScore = Object.values(answers).reduce((sum, val) => sum + val, 0);
  const liveInterpretation = currentDef.interpret(liveTotalScore, answers);

  function handleSelectOption(qId: number, val: number) {
    setAnswers((prev) => ({ ...prev, [qId]: val }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isComplete) {
      setError(`Please answer all ${currentDef.questions.length} questions before saving.`);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const record = await clinicalRecordApi.recordAssessment(patientId, {
        instrument: selectedInstrument,
        responses: answers,
        source,
        notes: notes.trim() || undefined,
      });

      setHistory((prev) => [record, ...prev]);
      if (onAssessmentRecorded) onAssessmentRecorded(record);
      setAnswers({});
      setNotes("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record assessment.");
    } finally {
      setSubmitting(false);
    }
  }

  const filteredHistory = history.filter((h) => h.instrument === selectedInstrument);

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="modal-card assessment-modal-container"
        style={{ maxWidth: "840px", width: "95%", maxHeight: "90vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="modal-header"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderBottom: "1px solid var(--m3-border)",
            paddingBottom: "14px",
            marginBottom: "16px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span
              className="spark"
              style={{
                background: "var(--m3-primary-container)",
                color: "var(--m3-primary)",
                width: "36px",
                height: "36px",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "8px",
              }}
            >
              <Icon name="assignment" />
            </span>
            <div>
              <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 600 }}>
                Standardized Clinical Rating Scales
              </h2>
              <p style={{ margin: 0, fontSize: "12px", color: "var(--m3-text-secondary)" }}>
                Itemized administration, automated severity scoring, and longitudinal clinical tracking.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="btn-icon"
            onClick={onClose}
            aria-label="Close assessments modal"
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--m3-text-secondary)" }}
          >
            <Icon name="close" />
          </button>
        </div>

        {error && (
          <div
            style={{
              padding: "10px 14px",
              background: "var(--m3-danger-container)",
              color: "var(--m3-on-danger-container)",
              borderRadius: "8px",
              marginBottom: "16px",
              fontSize: "13px",
            }}
          >
            {error}
          </div>
        )}

        {/* Instrument Selector Tabs */}
        <div style={{ display: "flex", gap: "8px", borderBottom: "1px solid var(--m3-border)", paddingBottom: "12px", marginBottom: "16px", overflowX: "auto" }}>
          {(
            [
              ["phq-9", "PHQ-9 (Depression)"],
              ["gad-7", "GAD-7 (Anxiety)"],
              ["asrs-v1.1", "ASRS v1.1 (Adult ADHD)"],
              ["cssrs", "C-SSRS (Columbia Suicide)"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSelectedInstrument(key)}
              style={{
                padding: "6px 14px",
                borderRadius: "6px",
                border: "none",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: selectedInstrument === key ? 600 : 500,
                background: selectedInstrument === key ? "var(--m3-primary)" : "var(--m3-surface-container)",
                color: selectedInstrument === key ? "var(--m3-on-primary)" : "var(--m3-text-secondary)",
                transition: "var(--transition-smooth)",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Active Instrument Banner & Live Score */}
        <div
          style={{
            background: "var(--m3-surface-container-low)",
            border: "1px solid var(--m3-border)",
            borderRadius: "10px",
            padding: "14px 16px",
            marginBottom: "20px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <div>
            <div style={{ fontSize: "15px", fontWeight: 600, color: "var(--m3-text-primary)" }}>
              {currentDef.title}
            </div>
            <div style={{ fontSize: "12px", color: "var(--m3-text-secondary)" }}>
              {currentDef.description} · {answeredCount}/{currentDef.questions.length} questions answered
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "20px", fontWeight: 700, color: "var(--m3-primary)" }}>
                {liveTotalScore} <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--m3-text-secondary)" }}>/ {currentDef.maxScore}</span>
              </div>
              <div style={{ fontSize: "12px", fontWeight: 600, color: liveInterpretation.flags.length > 0 ? "var(--m3-danger)" : "var(--m3-text-primary)" }}>
                {isComplete ? liveInterpretation.severity : "Incomplete"}
              </div>
            </div>

            {onInsertToNote && isComplete && (
              <Button
                variant="secondary"
                size="sm"
                icon="content_paste"
                onClick={() => onInsertToNote(liveInterpretation.summary)}
                title="Insert score summary into current note"
              >
                Insert Score
              </Button>
            )}
          </div>
        </div>

        {/* Critical Safety Flag Banner */}
        {isComplete && liveInterpretation.flags.length > 0 && (
          <div
            style={{
              padding: "12px 16px",
              background: "var(--m3-danger-container)",
              border: "1px solid #ef9a9a",
              borderRadius: "8px",
              marginBottom: "20px",
              color: "var(--m3-on-danger-container)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 700, fontSize: "14px", marginBottom: "4px" }}>
              <Icon name="warning" />
              <span>SAFETY RISK ALERT TRIGGERED</span>
            </div>
            {liveInterpretation.flags.map((flag, idx) => (
              <div key={idx} style={{ fontSize: "12px", marginTop: "2px", fontWeight: 500 }}>
                • {flag}
              </div>
            ))}
          </div>
        )}

        {/* Questionnaire Form */}
        <form onSubmit={handleSubmit} style={{ marginBottom: "28px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "20px" }}>
            {currentDef.questions.map((q) => {
              const isSelected = answers[q.id] !== undefined;
              const isFlaggedItem = (selectedInstrument === "phq-9" && q.id === 9 && answers[9] && answers[9] > 0);

              return (
                <Fragment key={q.id}>
                  {q.sectionTitle && (
                    <div
                      style={{
                        marginTop: q.id === 1 ? 0 : "10px",
                        padding: "10px 12px",
                        borderRadius: "8px",
                        background: "var(--m3-surface-container-low)",
                        border: "1px solid var(--m3-border)",
                      }}
                    >
                      <strong style={{ display: "block", fontSize: "13px" }}>{q.sectionTitle}</strong>
                      {q.sectionDescription && (
                        <span
                          style={{
                            display: "block",
                            marginTop: "3px",
                            color: "var(--m3-text-secondary)",
                            fontSize: "11px",
                            lineHeight: 1.4,
                          }}
                        >
                          {q.sectionDescription}
                        </span>
                      )}
                    </div>
                  )}
                <div
                  style={{
                    background: isFlaggedItem ? "rgba(239, 83, 80, 0.08)" : "var(--m3-surface)",
                    border: isFlaggedItem ? "1px solid var(--m3-danger)" : "1px solid var(--m3-border)",
                    borderRadius: "8px",
                    padding: "12px 14px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", marginBottom: "8px" }}>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "22px",
                        height: "22px",
                        borderRadius: "50%",
                        background: isSelected ? "var(--m3-primary-container)" : "var(--m3-surface-container)",
                        color: isSelected ? "var(--m3-primary)" : "var(--m3-text-secondary)",
                        fontSize: "11px",
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      {q.id}
                    </span>
                    <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--m3-text-primary)", flexGrow: 1 }}>
                      {q.text}
                    </span>
                    {isFlaggedItem && (
                      <span style={{ padding: "2px 6px", background: "var(--m3-danger)", color: "#fff", borderRadius: "4px", fontSize: "10px", fontWeight: 700 }}>
                        CRITICAL SAFETY ITEM
                      </span>
                    )}
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginLeft: "30px" }}>
                    {q.options.map((opt) => {
                      const active = answers[q.id] === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => handleSelectOption(q.id, opt.value)}
                          style={{
                            padding: "6px 12px",
                            borderRadius: "6px",
                            border: active ? "1px solid var(--m3-primary)" : "1px solid var(--m3-border)",
                            background: active ? "var(--m3-primary-container)" : "var(--m3-surface)",
                            color: active ? "var(--m3-on-primary-container)" : "var(--m3-text-primary)",
                            fontSize: "12px",
                            fontWeight: active ? 600 : 400,
                            cursor: "pointer",
                            transition: "var(--transition-smooth)",
                          }}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                </Fragment>
              );
            })}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "12px", alignItems: "flex-end" }}>
            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 500, color: "var(--m3-text-secondary)", marginBottom: "4px" }}>
                Administration Notes / Clinical Commentary
              </label>
              <input
                type="text"
                placeholder="e.g. Completed during routine medication follow-up; denies active intent on item 9."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid var(--m3-border)", fontSize: "13px" }}
              />
            </div>

            {!isComplete ? (
              <Button
                type="submit"
                variant="primary"
                size="md"
                disabled
                disabledReason="Answer all questions before saving."
                icon="save"
              >
                Save to Medical Record
              </Button>
            ) : (
              <Button
                type="submit"
                variant="primary"
                size="md"
                loading={submitting}
                icon="save"
              >
                Save to Medical Record
              </Button>
            )}
          </div>
        </form>

        {/* Longitudinal History Section */}
        <div style={{ borderTop: "1px solid var(--m3-border)", paddingTop: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <div style={{ fontSize: "15px", fontWeight: 600, color: "var(--m3-text-primary)" }}>
              Longitudinal Assessment Trajectory ({filteredHistory.length} administrations)
            </div>
          </div>

          {loading ? (
            <div style={{ padding: "20px", textAlign: "center", color: "var(--m3-text-secondary)" }}>
              Loading assessment history…
            </div>
          ) : filteredHistory.length === 0 ? (
            <div
              style={{
                padding: "20px",
                textAlign: "center",
                color: "var(--m3-text-secondary)",
                background: "var(--m3-surface-container-low)",
                borderRadius: "8px",
                fontSize: "13px",
              }}
            >
              No past {currentDef.title} records found for this patient.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {filteredHistory.map((item) => (
                <div
                  key={item.id}
                  style={{
                    border: item.flags.length > 0 ? "1px solid #ff8a80" : "1px solid var(--m3-border)",
                    background: item.flags.length > 0 ? "rgba(255, 235, 238, 0.5)" : "var(--m3-surface)",
                    borderRadius: "8px",
                    padding: "12px 16px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "10px",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <strong style={{ fontSize: "14px" }}>{item.title}</strong>
                      <span style={{ fontSize: "12px", color: "var(--m3-text-secondary)" }}>
                        {formatTimelineDate(item.administeredAt)}
                      </span>
                      <span style={{ fontSize: "11px", padding: "2px 6px", background: "var(--m3-surface-container)", borderRadius: "4px", color: "var(--m3-text-secondary)" }}>
                        By {item.administeredBy}
                      </span>
                    </div>

                    <div style={{ fontSize: "12px", color: "var(--m3-text-secondary)", marginTop: "4px" }}>
                      {item.notes ? item.notes : "No clinical notes attached."}
                    </div>

                    {item.flags.length > 0 && (
                      <div style={{ display: "flex", gap: "4px", marginTop: "6px" }}>
                        {item.flags.map((f, fi) => (
                          <span
                            key={fi}
                            style={{
                              padding: "2px 6px",
                              borderRadius: "4px",
                              background: "var(--m3-danger-container)",
                              color: "var(--m3-on-danger-container)",
                              fontSize: "11px",
                              fontWeight: 600,
                            }}
                          >
                            {f}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div style={{ textAlign: "right", display: "flex", alignItems: "center", gap: "12px" }}>
                    <div>
                      <div style={{ fontSize: "18px", fontWeight: 700, color: "var(--m3-primary)" }}>
                        {item.totalScore} / {item.maxScore}
                      </div>
                      <div style={{ fontSize: "12px", fontWeight: 500, color: "var(--m3-text-secondary)" }}>
                        {item.severity}
                      </div>
                    </div>

                    {onInsertToNote && (
                      <Button
                        variant="tertiary"
                        size="sm"
                        icon="content_paste"
                        onClick={() =>
                          onInsertToNote(
                            `${item.title} (${formatTimelineDate(item.administeredAt)}): Score ${item.totalScore}/${item.maxScore} (${item.severity})`,
                          )
                        }
                        title="Copy to note"
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginTop: "20px",
            paddingTop: "12px",
            borderTop: "1px solid var(--m3-border)",
          }}
        >
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

function formatTimelineDate(value: string) {
  if (!value) return "—";
  if (value.includes("T")) return formatClinicalDateTime(value);
  return formatClinicalDate(value);
}
