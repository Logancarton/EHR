"use client";

import { useEffect, useState } from "react";
import {
  calculateBmi,
  bmiCategory,
  evaluateVitalFlags,
  type VitalSignSummary,
  type VitalAttentionFlag,
} from "../../domain/clinical-measurements";
import { clinicalRecordApi } from "../../lib/clinical-record-api";
import { formatClinicalDate, formatClinicalDateTime } from "../../lib/clinical-date";
import Icon from "../ui/Icon";
import Button from "../ui/Button";

export default function PatientVitalsModal({
  patientId,
  isOpen,
  onClose,
  onVitalsRecorded,
}: {
  patientId: string;
  isOpen: boolean;
  onClose: () => void;
  onVitalsRecorded?: (vitals: VitalSignSummary) => void;
}) {
  const [systolic, setSystolic] = useState<string>("");
  const [diastolic, setDiastolic] = useState<string>("");
  const [heartRate, setHeartRate] = useState<string>("");
  const [weightLbs, setWeightLbs] = useState<string>("");
  const [heightIn, setHeightIn] = useState<string>("65");
  const [respiratoryRate, setRespiratoryRate] = useState<string>("");
  const [temperatureF, setTemperatureF] = useState<string>("");
  const [oxygenSaturation, setOxygenSaturation] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<VitalSignSummary[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setLoadingHistory(true);
    clinicalRecordApi
      .snapshot(patientId)
      .then((snap) => {
        const vitals = snap.vitals || [];
        setHistory(vitals);
        // Pre-fill height from last reading if available
        const lastWithHeight = vitals.find((v) => v.heightIn);
        if (lastWithHeight?.heightIn) {
          setHeightIn(String(lastWithHeight.heightIn));
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setLoadingHistory(false));
  }, [isOpen, patientId]);

  if (!isOpen) return null;

  const numSystolic = systolic ? Number(systolic) : undefined;
  const numDiastolic = diastolic ? Number(diastolic) : undefined;
  const numHeartRate = heartRate ? Number(heartRate) : undefined;
  const numWeight = weightLbs ? Number(weightLbs) : undefined;
  const numHeight = heightIn ? Number(heightIn) : undefined;

  const liveBmi = numWeight && numHeight && numHeight > 0 ? calculateBmi(numWeight, numHeight) : null;
  const liveBmiCat = liveBmi ? bmiCategory(liveBmi) : null;

  const priorWeight = history.find((h) => h.weightLbs)?.weightLbs ?? null;
  const liveFlags: VitalAttentionFlag[] = evaluateVitalFlags(
    {
      systolic: numSystolic,
      diastolic: numDiastolic,
      heartRate: numHeartRate,
      weightLbs: numWeight,
      heightIn: numHeight,
      bmi: liveBmi,
    },
    priorWeight,
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      const summary = await clinicalRecordApi.recordVitals(patientId, {
        systolic: numSystolic,
        diastolic: numDiastolic,
        heartRate: numHeartRate,
        weightLbs: numWeight,
        heightIn: numHeight,
        respiratoryRate: respiratoryRate ? Number(respiratoryRate) : undefined,
        temperatureF: temperatureF ? Number(temperatureF) : undefined,
        oxygenSaturation: oxygenSaturation ? Number(oxygenSaturation) : undefined,
        notes: notes.trim() || undefined,
      });

      setHistory((prev) => [summary, ...prev]);
      if (onVitalsRecorded) onVitalsRecorded(summary);

      // Reset entry form
      setSystolic("");
      setDiastolic("");
      setHeartRate("");
      setWeightLbs("");
      setRespiratoryRate("");
      setTemperatureF("");
      setOxygenSaturation("");
      setNotes("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record vitals.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="modal-card vitals-modal-container"
        style={{ maxWidth: "780px", width: "95%", maxHeight: "90vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--m3-border)", paddingBottom: "14px", marginBottom: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span className="spark" style={{ background: "var(--m3-primary-container)", color: "var(--m3-primary)", width: "36px", height: "36px", display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "8px" }}>
              <Icon name="monitor_heart" />
            </span>
            <div>
              <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 600 }}>Longitudinal Vitals & Metabolic Surveillance</h2>
              <p style={{ margin: 0, fontSize: "12px", color: "var(--m3-text-secondary)" }}>
                Track blood pressure, heart rate, BMI, and metabolic shifts under psychotropic therapy.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="btn-icon"
            onClick={onClose}
            aria-label="Close vitals modal"
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--m3-text-secondary)" }}
          >
            <Icon name="close" />
          </button>
        </div>

        {error && (
          <div style={{ padding: "10px 14px", background: "var(--m3-danger-container)", color: "var(--m3-on-danger-container)", borderRadius: "8px", marginBottom: "16px", fontSize: "13px" }}>
            {error}
          </div>
        )}

        {/* Live Safety Alerts Preview */}
        {liveFlags.length > 0 && (
          <div style={{ padding: "12px", background: "var(--m3-warning-container)", border: "1px solid #ffcc80", borderRadius: "8px", marginBottom: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: 600, color: "var(--m3-on-warning-container)", fontSize: "13px", marginBottom: "4px" }}>
              <Icon name="warning" size="sm" />
              <span>Active Vital Signs Attention Flags</span>
            </div>
            {liveFlags.map((flag, i) => (
              <div key={i} style={{ fontSize: "12px", color: "var(--m3-on-warning-container)", marginTop: "2px" }}>
                <strong>• {flag.label}:</strong> {flag.detail}
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ background: "var(--m3-surface-container-low)", padding: "16px", borderRadius: "10px", border: "1px solid var(--m3-border)", marginBottom: "20px" }}>
          <div style={{ fontSize: "14px", fontWeight: 600, marginBottom: "12px", color: "var(--m3-text-primary)" }}>
            Record New Measurement Set
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "12px", marginBottom: "12px" }}>
            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 500, color: "var(--m3-text-secondary)", marginBottom: "4px" }}>
                Systolic BP (mmHg)
              </label>
              <input
                type="number"
                min="50"
                max="300"
                placeholder="120"
                value={systolic}
                onChange={(e) => setSystolic(e.target.value)}
                style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid var(--m3-border)", fontSize: "14px" }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 500, color: "var(--m3-text-secondary)", marginBottom: "4px" }}>
                Diastolic BP (mmHg)
              </label>
              <input
                type="number"
                min="30"
                max="200"
                placeholder="80"
                value={diastolic}
                onChange={(e) => setDiastolic(e.target.value)}
                style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid var(--m3-border)", fontSize: "14px" }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 500, color: "var(--m3-text-secondary)", marginBottom: "4px" }}>
                Heart Rate (bpm)
              </label>
              <input
                type="number"
                min="30"
                max="250"
                placeholder="72"
                value={heartRate}
                onChange={(e) => setHeartRate(e.target.value)}
                style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid var(--m3-border)", fontSize: "14px" }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 500, color: "var(--m3-text-secondary)", marginBottom: "4px" }}>
                Weight (lbs)
              </label>
              <input
                type="number"
                step="0.1"
                min="30"
                max="600"
                placeholder="150"
                value={weightLbs}
                onChange={(e) => setWeightLbs(e.target.value)}
                style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid var(--m3-border)", fontSize: "14px" }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 500, color: "var(--m3-text-secondary)", marginBottom: "4px" }}>
                Height (in)
              </label>
              <input
                type="number"
                step="0.5"
                min="20"
                max="96"
                placeholder="65"
                value={heightIn}
                onChange={(e) => setHeightIn(e.target.value)}
                style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid var(--m3-border)", fontSize: "14px" }}
              />
            </div>
          </div>

          {/* Real-time Derived BMI Panel */}
          {liveBmi !== null && (
            <div style={{ display: "flex", alignItems: "center", gap: "12px", background: "var(--m3-surface)", padding: "8px 12px", borderRadius: "6px", border: "1px solid var(--m3-border)", marginBottom: "12px", fontSize: "13px" }}>
              <span style={{ fontWeight: 600 }}>Derived BMI:</span>
              <span style={{ fontSize: "15px", fontWeight: 700, color: "var(--m3-primary)" }}>{liveBmi} kg/m²</span>
              <span style={{ padding: "2px 8px", background: "var(--m3-surface-container-high)", borderRadius: "4px", fontSize: "11px", fontWeight: 500 }}>
                {liveBmiCat}
              </span>
              {priorWeight && (
                <span style={{ fontSize: "12px", color: "var(--m3-text-secondary)", marginLeft: "auto" }}>
                  Prior weight: {priorWeight} lbs ({(((numWeight! - priorWeight) / priorWeight) * 100).toFixed(1)}% shift)
                </span>
              )}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "12px", marginBottom: "12px" }}>
            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 500, color: "var(--m3-text-secondary)", marginBottom: "4px" }}>
                SpO2 (%)
              </label>
              <input
                type="number"
                min="50"
                max="100"
                placeholder="98"
                value={oxygenSaturation}
                onChange={(e) => setOxygenSaturation(e.target.value)}
                style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid var(--m3-border)", fontSize: "14px" }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 500, color: "var(--m3-text-secondary)", marginBottom: "4px" }}>
                Temp (°F)
              </label>
              <input
                type="number"
                step="0.1"
                min="90"
                max="110"
                placeholder="98.6"
                value={temperatureF}
                onChange={(e) => setTemperatureF(e.target.value)}
                style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid var(--m3-border)", fontSize: "14px" }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 500, color: "var(--m3-text-secondary)", marginBottom: "4px" }}>
                Resp. Rate (/min)
              </label>
              <input
                type="number"
                min="5"
                max="60"
                placeholder="16"
                value={respiratoryRate}
                onChange={(e) => setRespiratoryRate(e.target.value)}
                style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid var(--m3-border)", fontSize: "14px" }}
              />
            </div>

            <div style={{ gridColumn: "span 2" }}>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 500, color: "var(--m3-text-secondary)", marginBottom: "4px" }}>
                Clinical Notes / Circumstances
              </label>
              <input
                type="text"
                placeholder="e.g. Sitting, right arm, post-titration"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid var(--m3-border)", fontSize: "14px" }}
              />
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
            {!systolic && !diastolic && !heartRate && !weightLbs ? (
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled
                disabledReason="Enter at least one measurement before saving."
                icon="save"
              >
                Record Measurements
              </Button>
            ) : (
              <Button
                type="submit"
                variant="primary"
                size="sm"
                loading={isSubmitting}
                icon="save"
              >
                Record Measurements
              </Button>
            )}
          </div>
        </form>

        {/* Longitudinal History Table */}
        <div>
          <div style={{ fontSize: "14px", fontWeight: 600, marginBottom: "8px", color: "var(--m3-text-primary)" }}>
            Longitudinal Measurement History ({history.length} sets)
          </div>

          {loadingHistory ? (
            <div style={{ padding: "20px", textAlign: "center", color: "var(--m3-text-secondary)" }}>
              Loading vital signs trajectory…
            </div>
          ) : history.length === 0 ? (
            <div style={{ padding: "20px", textAlign: "center", color: "var(--m3-text-secondary)", background: "var(--m3-surface-container-low)", borderRadius: "8px" }}>
              No longitudinal measurements recorded yet.
            </div>
          ) : (
            <div style={{ border: "1px solid var(--m3-border)", borderRadius: "8px", overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", textAlign: "left" }}>
                <thead>
                  <tr style={{ background: "var(--m3-surface-container)", borderBottom: "1px solid var(--m3-border)" }}>
                    <th style={{ padding: "8px 12px" }}>Date & Time</th>
                    <th style={{ padding: "8px 12px" }}>BP (mmHg)</th>
                    <th style={{ padding: "8px 12px" }}>HR</th>
                    <th style={{ padding: "8px 12px" }}>Weight</th>
                    <th style={{ padding: "8px 12px" }}>BMI</th>
                    <th style={{ padding: "8px 12px" }}>Other</th>
                    <th style={{ padding: "8px 12px" }}>Clinical Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h, index) => (
                    <tr
                      key={index}
                      style={{
                        borderBottom: "1px solid var(--m3-border)",
                        background: h.flags && h.flags.length > 0 ? "rgba(255, 179, 0, 0.06)" : "transparent",
                      }}
                    >
                      <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                        {formatTimelineDate(h.recordedAt)}
                      </td>
                      <td style={{ padding: "8px 12px", fontWeight: 600 }}>
                        {h.bpText || (h.systolic && h.diastolic ? `${h.systolic}/${h.diastolic}` : "—")}
                      </td>
                      <td style={{ padding: "8px 12px" }}>{h.heartRate ? `${h.heartRate} bpm` : "—"}</td>
                      <td style={{ padding: "8px 12px" }}>{h.weightLbs ? `${h.weightLbs} lbs` : "—"}</td>
                      <td style={{ padding: "8px 12px" }}>
                        {h.bmi ? `${h.bmi} (${h.bmiCategory || ""})` : "—"}
                      </td>
                      <td style={{ padding: "8px 12px", color: "var(--m3-text-secondary)" }}>
                        {[
                          h.oxygenSaturation ? `SpO2: ${h.oxygenSaturation}%` : null,
                          h.temperatureF ? `T: ${h.temperatureF}°F` : null,
                          h.respiratoryRate ? `RR: ${h.respiratoryRate}` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </td>
                      <td style={{ padding: "8px 12px" }}>
                        {h.flags && h.flags.length > 0 ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                            {h.flags.map((f, fi) => (
                              <span
                                key={fi}
                                style={{
                                  display: "inline-block",
                                  padding: "2px 6px",
                                  borderRadius: "4px",
                                  background: f.severity === "critical" ? "var(--m3-danger-container)" : "var(--m3-warning-container)",
                                  color: f.severity === "critical" ? "var(--m3-on-danger-container)" : "var(--m3-on-warning-container)",
                                  fontSize: "11px",
                                  fontWeight: 500,
                                }}
                              >
                                {f.label}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span style={{ color: "var(--m3-success)", fontSize: "11px" }}>Normal</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "16px", paddingTop: "12px", borderTop: "1px solid var(--m3-border)" }}>
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
