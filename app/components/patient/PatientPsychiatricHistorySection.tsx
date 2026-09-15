"use client";

import { useEffect, useState, useMemo } from "react";
import {
  type PsychiatricHistoryCategory,
  type PsychiatricHistoryItem,
  type PsychiatricHistoryStatus,
} from "../../domain/clinical-measurements";
import { clinicalRecordApi } from "../../lib/clinical-record-api";
import { formatClinicalDate } from "../../lib/clinical-date";
import Icon from "../ui/Icon";
import Button from "../ui/Button";

const CATEGORY_META: Record<
  PsychiatricHistoryCategory,
  { label: string; icon: string; toneColor: string; description: string }
> = {
  medication_trial: {
    label: "Medication Trials",
    icon: "medication",
    toneColor: "var(--m3-primary)",
    description: "Prior psychotropic medication trials, dosages, durations, and reasons for discontinuation.",
  },
  hospitalization: {
    label: "Hospitalizations",
    icon: "local_hospital",
    toneColor: "var(--m3-danger)",
    description: "Inpatient psychiatric admissions, voluntary status, length of stay, and admission reasons.",
  },
  safety_risk: {
    label: "Safety & Self-Harm",
    icon: "shield",
    toneColor: "#b06000",
    description: "Historical suicidal ideation, intent, attempts, self-injurious behavior, and protective factors.",
  },
  psychotherapy: {
    label: "Psychotherapy",
    icon: "psychology",
    toneColor: "#00639b",
    description: "Prior and ongoing therapy modalities (CBT, DBT, psychodynamic), frequency, and clinical response.",
  },
  family_history: {
    label: "Family Psychiatric History",
    icon: "family_restroom",
    toneColor: "#137333",
    description: "Heritable psychiatric conditions, family responses to pharmacotherapy, and risk alleles.",
  },
  substance_use: {
    label: "Substance Use",
    icon: "local_bar",
    toneColor: "#6750a4",
    description: "Alcohol, cannabis, stimulants, sedatives, tobacco, and recovery milestones.",
  },
  trauma: {
    label: "Trauma History",
    icon: "healing",
    toneColor: "#7d5260",
    description: "Adverse childhood experiences (ACEs), somatic trauma, PTSD triggers, and resilience factors.",
  },
  social: {
    label: "Social / Educational",
    icon: "school",
    toneColor: "#4a6572",
    description: "Occupational history, support networks, housing stability, and legal circumstances.",
  },
};

export default function PatientPsychiatricHistorySection({
  patientId,
  onInsertToNote,
  onToast,
}: {
  patientId: string;
  onInsertToNote?: (text: string) => void;
  onToast?: (msg: string) => void;
}) {
  const [items, setItems] = useState<PsychiatricHistoryItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<PsychiatricHistoryCategory | "all">("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New Item Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newCategory, setNewCategory] = useState<PsychiatricHistoryCategory>("medication_trial");
  const [newTitle, setNewTitle] = useState("");
  const [newStatus, setNewStatus] = useState<PsychiatricHistoryStatus>("historical");
  const [onsetDate, setOnsetDate] = useState("");
  const [resolvedDate, setResolvedDate] = useState("");

  // Category-specific structured fields
  const [medDrug, setMedDrug] = useState("");
  const [medMaxDose, setMedMaxDose] = useState("");
  const [medDuration, setMedDuration] = useState("");
  const [medOutcome, setMedOutcome] = useState("");
  const [hospFacility, setHospFacility] = useState("");
  const [hospDuration, setHospDuration] = useState("");
  const [hospVoluntary, setHospVoluntary] = useState(true);
  const [hospReason, setHospReason] = useState("");
  const [therapyModality, setTherapyModality] = useState("");
  const [therapyProvider, setTherapyProvider] = useState("");
  const [therapyResponse, setTherapyResponse] = useState("");
  const [familyRel, setFamilyRel] = useState("");
  const [familyCond, setFamilyCond] = useState("");
  const [substanceName, setSubstanceName] = useState("");
  const [substancePattern, setSubstancePattern] = useState("");
  const [generalDetails, setGeneralDetails] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setLoading(true);
    clinicalRecordApi
      .snapshot(patientId)
      .then((snap) => {
        setItems(snap.psychiatricHistory || []);
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setLoading(false));
  }, [patientId]);

  const filteredItems = useMemo(() => {
    if (selectedCategory === "all") return items;
    return items.filter((it) => it.category === selectedCategory);
  }, [items, selectedCategory]);

  function resetNewItemForm() {
    setNewTitle("");
    setNewStatus("historical");
    setOnsetDate("");
    setResolvedDate("");
    setMedDrug("");
    setMedMaxDose("");
    setMedDuration("");
    setMedOutcome("");
    setHospFacility("");
    setHospDuration("");
    setHospVoluntary(true);
    setHospReason("");
    setTherapyModality("");
    setTherapyProvider("");
    setTherapyResponse("");
    setFamilyRel("");
    setFamilyCond("");
    setSubstanceName("");
    setSubstancePattern("");
    setGeneralDetails("");
  }

  async function handleCreateItem(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) {
      setError("Title is required.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const details: Record<string, unknown> = {};
    if (newCategory === "medication_trial") {
      if (medDrug) details.drug = medDrug;
      if (medMaxDose) details.maxDose = medMaxDose;
      if (medDuration) details.duration = medDuration;
      if (medOutcome) details.outcome = medOutcome;
    } else if (newCategory === "hospitalization") {
      if (hospFacility) details.facility = hospFacility;
      if (hospDuration) details.duration = hospDuration;
      details.voluntary = hospVoluntary;
      if (hospReason) details.reason = hospReason;
    } else if (newCategory === "psychotherapy") {
      if (therapyModality) details.modality = therapyModality;
      if (therapyProvider) details.provider = therapyProvider;
      if (therapyResponse) details.response = therapyResponse;
    } else if (newCategory === "family_history") {
      if (familyRel) details.relationship = familyRel;
      if (familyCond) details.conditions = familyCond.split(",").map((c) => c.trim());
    } else if (newCategory === "substance_use") {
      if (substanceName) details.substance = substanceName;
      if (substancePattern) details.pattern = substancePattern;
    } else {
      if (generalDetails) details.description = generalDetails;
    }

    try {
      const created = await clinicalRecordApi.addPsychiatricHistory(patientId, {
        category: newCategory,
        title: newTitle.trim(),
        details,
        status: newStatus,
        onsetDate: onsetDate || null,
        resolvedDate: resolvedDate || null,
      });

      setItems((prev) => [created, ...prev]);
      setIsModalOpen(false);
      resetNewItemForm();
      if (onToast) onToast(`Recorded psychiatric history item: ${created.title}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record psychiatric history item.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="psychiatric-history-section" style={{ marginTop: "16px" }}>
      {/* Header and Controls */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "12px",
          marginBottom: "16px",
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 600, color: "var(--m3-text-primary)" }}>
            Structured Psychiatric History & Prior Care
          </h3>
          <p style={{ margin: 0, fontSize: "12px", color: "var(--m3-text-secondary)" }}>
            Normalized, versioned longitudinal records: medication trials, admissions, psychotherapy, and risk history.
          </p>
        </div>

        <Button
          variant="primary"
          size="sm"
          icon="add"
          onClick={() => {
            resetNewItemForm();
            setIsModalOpen(true);
          }}
        >
          Add Psychiatric History
        </Button>
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

      {/* Category Pills Filter */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          overflowX: "auto",
          paddingBottom: "8px",
          marginBottom: "16px",
        }}
      >
        <button
          type="button"
          onClick={() => setSelectedCategory("all")}
          style={{
            padding: "6px 12px",
            borderRadius: "20px",
            border: "1px solid var(--m3-border)",
            background: selectedCategory === "all" ? "var(--m3-primary)" : "var(--m3-surface)",
            color: selectedCategory === "all" ? "var(--m3-on-primary)" : "var(--m3-text-secondary)",
            fontSize: "12px",
            fontWeight: selectedCategory === "all" ? 600 : 500,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          All Categories ({items.length})
        </button>

        {(Object.keys(CATEGORY_META) as PsychiatricHistoryCategory[]).map((cat) => {
          const meta = CATEGORY_META[cat];
          const count = items.filter((it) => it.category === cat).length;
          const active = selectedCategory === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 12px",
                borderRadius: "20px",
                border: active ? `1px solid ${meta.toneColor}` : "1px solid var(--m3-border)",
                background: active ? meta.toneColor : "var(--m3-surface)",
                color: active ? "#ffffff" : "var(--m3-text-primary)",
                fontSize: "12px",
                fontWeight: active ? 600 : 500,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              <Icon name={meta.icon} size="sm" />
              <span>{meta.label}</span>
              <span style={{ opacity: 0.8 }}>({count})</span>
            </button>
          );
        })}
      </div>

      {/* Cards Feed */}
      {loading ? (
        <div style={{ padding: "30px", textAlign: "center", color: "var(--m3-text-secondary)" }}>
          Loading structured psychiatric history…
        </div>
      ) : filteredItems.length === 0 ? (
        <div
          style={{
            padding: "24px",
            textAlign: "center",
            color: "var(--m3-text-secondary)",
            background: "var(--m3-surface-container-low)",
            borderRadius: "8px",
            fontSize: "13px",
          }}
        >
          No history records under this category.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "12px" }}>
          {filteredItems.map((it) => {
            const meta = CATEGORY_META[it.category] || CATEGORY_META.social;
            return (
              <div
                key={it.id}
                style={{
                  background: "var(--m3-surface)",
                  border: "1px solid var(--m3-border)",
                  borderRadius: "10px",
                  padding: "14px 16px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  gap: "10px",
                }}
              >
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px" }}>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        fontSize: "11px",
                        fontWeight: 600,
                        color: meta.toneColor,
                      }}
                    >
                      <Icon name={meta.icon} size="sm" />
                      {meta.label}
                    </span>
                    <span
                      style={{
                        fontSize: "10px",
                        padding: "2px 6px",
                        borderRadius: "4px",
                        background: it.status === "active" ? "var(--m3-success-container)" : "var(--m3-surface-container)",
                        color: it.status === "active" ? "var(--m3-on-success-container)" : "var(--m3-text-secondary)",
                        fontWeight: 600,
                        textTransform: "uppercase",
                      }}
                    >
                      {it.status}
                    </span>
                  </div>

                  <h4 style={{ margin: "0 0 6px", fontSize: "14px", fontWeight: 600, color: "var(--m3-text-primary)" }}>
                    {it.title}
                  </h4>

                  {/* Render Structured Detail Fields */}
                  <div style={{ fontSize: "12px", color: "var(--m3-text-secondary)", display: "flex", flexDirection: "column", gap: "4px" }}>
                    {it.category === "medication_trial" && (
                      <>
                        {Boolean(it.details.drug) && <div><strong>Drug:</strong> {String(it.details.drug)}</div>}
                        {Boolean(it.details.maxDose) && <div><strong>Max Dose:</strong> {String(it.details.maxDose)}</div>}
                        {Boolean(it.details.duration) && <div><strong>Duration:</strong> {String(it.details.duration)}</div>}
                        {Boolean(it.details.outcome) && <div><strong>Outcome:</strong> {String(it.details.outcome)}</div>}
                        {Boolean(it.details.reasonForDiscontinuation) && (
                          <div><strong>Discontinuation Reason:</strong> {String(it.details.reasonForDiscontinuation)}</div>
                        )}
                      </>
                    )}

                    {it.category === "hospitalization" && (
                      <>
                        {Boolean(it.details.facility) && <div><strong>Facility:</strong> {String(it.details.facility)}</div>}
                        {Boolean(it.details.duration) && <div><strong>Duration:</strong> {String(it.details.duration)}</div>}
                        <div><strong>Admit Type:</strong> {it.details.voluntary ? "Voluntary" : "Involuntary"}</div>
                        {Boolean(it.details.reason) && <div><strong>Reason:</strong> {String(it.details.reason)}</div>}
                      </>
                    )}

                    {it.category === "psychotherapy" && (
                      <>
                        {Boolean(it.details.modality) && <div><strong>Modality:</strong> {String(it.details.modality)}</div>}
                        {Boolean(it.details.provider) && <div><strong>Provider:</strong> {String(it.details.provider)}</div>}
                        {Boolean(it.details.response) && <div><strong>Response:</strong> {String(it.details.response)}</div>}
                      </>
                    )}

                    {it.category === "family_history" && (
                      <>
                        {Boolean(it.details.relationship) && <div><strong>Relative:</strong> {String(it.details.relationship)}</div>}
                        {Boolean(it.details.conditions) && (
                          <div><strong>Conditions:</strong> {Array.isArray(it.details.conditions) ? it.details.conditions.join(", ") : String(it.details.conditions)}</div>
                        )}
                        {Boolean(it.details.responseNotes) && <div><strong>Treatment Notes:</strong> {String(it.details.responseNotes)}</div>}
                      </>
                    )}

                    {it.category === "safety_risk" && (
                      <>
                        {Boolean(it.details.description) && <div>{String(it.details.description)}</div>}
                        {Boolean(it.details.lethality) && <div><strong>Lethality:</strong> {String(it.details.lethality)}</div>}
                        {Boolean(it.details.protectiveFactors) && (
                          <div><strong>Protective Factors:</strong> {String(it.details.protectiveFactors)}</div>
                        )}
                      </>
                    )}

                    {["substance_use", "trauma", "social"].includes(it.category) && (
                      <div>{String(it.details.description || it.details.pattern || JSON.stringify(it.details))}</div>
                    )}
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    borderTop: "1px solid var(--m3-surface-container-high)",
                    paddingTop: "8px",
                    fontSize: "11px",
                    color: "var(--m3-text-secondary)",
                  }}
                >
                  <span>
                    {it.onsetDate ? `Onset: ${formatClinicalDate(it.onsetDate)}` : `Recorded: ${formatClinicalDate(it.recordedAt)}`}
                  </span>

                  {onInsertToNote && (
                    <Button
                      variant="tertiary"
                      size="sm"
                      icon="content_paste"
                      onClick={() =>
                        onInsertToNote(
                          `[Psychiatric History - ${meta.label}] ${it.title}: ${JSON.stringify(it.details)}`,
                        )
                      }
                      title="Insert history item into note"
                    >
                      Insert
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Psychiatric History Item Modal */}
      {isModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsModalOpen(false)} role="dialog" aria-modal="true">
          <div
            className="modal-card"
            style={{ maxWidth: "600px", width: "95%", maxHeight: "90vh", overflowY: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="modal-header"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                borderBottom: "1px solid var(--m3-border)",
                paddingBottom: "12px",
                marginBottom: "16px",
              }}
            >
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>Record Structured Psychiatric History</h3>
              <button
                type="button"
                className="btn-icon"
                onClick={() => setIsModalOpen(false)}
                style={{ background: "none", border: "none", cursor: "pointer" }}
              >
                <Icon name="close" />
              </button>
            </div>

            <form onSubmit={handleCreateItem}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 500, marginBottom: "4px" }}>
                    Category
                  </label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as PsychiatricHistoryCategory)}
                    style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid var(--m3-border)", fontSize: "13px" }}
                  >
                    {(Object.keys(CATEGORY_META) as PsychiatricHistoryCategory[]).map((cat) => (
                      <option key={cat} value={cat}>
                        {CATEGORY_META[cat].label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 500, marginBottom: "4px" }}>
                    Status
                  </label>
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value as PsychiatricHistoryStatus)}
                    style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid var(--m3-border)", fontSize: "13px" }}
                  >
                    <option value="historical">Historical</option>
                    <option value="active">Active</option>
                    <option value="in-remission">In Remission</option>
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 500, marginBottom: "4px" }}>
                  Title / Headline
                </label>
                <input
                  type="text"
                  placeholder="e.g. Escitalopram 20mg Trial (2024)"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid var(--m3-border)", fontSize: "13px" }}
                />
              </div>

              {/* Dynamic Category Specific Inputs */}
              {newCategory === "medication_trial" && (
                <div style={{ background: "var(--m3-surface-container-low)", padding: "12px", borderRadius: "8px", marginBottom: "12px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <div>
                    <label style={{ fontSize: "11px", fontWeight: 500 }}>Medication Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Sertraline"
                      value={medDrug}
                      onChange={(e) => setMedDrug(e.target.value)}
                      style={{ width: "100%", padding: "6px 8px", borderRadius: "4px", border: "1px solid var(--m3-border)", fontSize: "12px" }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "11px", fontWeight: 500 }}>Max Dose</label>
                    <input
                      type="text"
                      placeholder="e.g. 150 mg daily"
                      value={medMaxDose}
                      onChange={(e) => setMedMaxDose(e.target.value)}
                      style={{ width: "100%", padding: "6px 8px", borderRadius: "4px", border: "1px solid var(--m3-border)", fontSize: "12px" }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "11px", fontWeight: 500 }}>Trial Duration</label>
                    <input
                      type="text"
                      placeholder="e.g. 8 months"
                      value={medDuration}
                      onChange={(e) => setMedDuration(e.target.value)}
                      style={{ width: "100%", padding: "6px 8px", borderRadius: "4px", border: "1px solid var(--m3-border)", fontSize: "12px" }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "11px", fontWeight: 500 }}>Outcome / Reason Stopped</label>
                    <input
                      type="text"
                      placeholder="e.g. Inadequate response / insomnia"
                      value={medOutcome}
                      onChange={(e) => setMedOutcome(e.target.value)}
                      style={{ width: "100%", padding: "6px 8px", borderRadius: "4px", border: "1px solid var(--m3-border)", fontSize: "12px" }}
                    />
                  </div>
                </div>
              )}

              {newCategory === "hospitalization" && (
                <div style={{ background: "var(--m3-surface-container-low)", padding: "12px", borderRadius: "8px", marginBottom: "12px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <div>
                    <label style={{ fontSize: "11px", fontWeight: 500 }}>Facility Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Cedars Psychiatric Pavilion"
                      value={hospFacility}
                      onChange={(e) => setHospFacility(e.target.value)}
                      style={{ width: "100%", padding: "6px 8px", borderRadius: "4px", border: "1px solid var(--m3-border)", fontSize: "12px" }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "11px", fontWeight: 500 }}>Length of Stay</label>
                    <input
                      type="text"
                      placeholder="e.g. 7 days"
                      value={hospDuration}
                      onChange={(e) => setHospDuration(e.target.value)}
                      style={{ width: "100%", padding: "6px 8px", borderRadius: "4px", border: "1px solid var(--m3-border)", fontSize: "12px" }}
                    />
                  </div>
                  <div style={{ gridColumn: "span 2" }}>
                    <label style={{ fontSize: "11px", fontWeight: 500 }}>Admission Reason</label>
                    <input
                      type="text"
                      placeholder="e.g. Severe major depression with psychomotor slowing"
                      value={hospReason}
                      onChange={(e) => setHospReason(e.target.value)}
                      style={{ width: "100%", padding: "6px 8px", borderRadius: "4px", border: "1px solid var(--m3-border)", fontSize: "12px" }}
                    />
                  </div>
                </div>
              )}

              {newCategory === "psychotherapy" && (
                <div style={{ background: "var(--m3-surface-container-low)", padding: "12px", borderRadius: "8px", marginBottom: "12px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <div>
                    <label style={{ fontSize: "11px", fontWeight: 500 }}>Modality</label>
                    <input
                      type="text"
                      placeholder="e.g. CBT, DBT, Psychodynamic"
                      value={therapyModality}
                      onChange={(e) => setTherapyModality(e.target.value)}
                      style={{ width: "100%", padding: "6px 8px", borderRadius: "4px", border: "1px solid var(--m3-border)", fontSize: "12px" }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "11px", fontWeight: 500 }}>Provider / Clinic</label>
                    <input
                      type="text"
                      placeholder="e.g. Dr. Vance, PhD"
                      value={therapyProvider}
                      onChange={(e) => setTherapyProvider(e.target.value)}
                      style={{ width: "100%", padding: "6px 8px", borderRadius: "4px", border: "1px solid var(--m3-border)", fontSize: "12px" }}
                    />
                  </div>
                  <div style={{ gridColumn: "span 2" }}>
                    <label style={{ fontSize: "11px", fontWeight: 500 }}>Clinical Response / Key Techniques</label>
                    <input
                      type="text"
                      placeholder="e.g. Reduced panic frequency; utilizes thought records"
                      value={therapyResponse}
                      onChange={(e) => setTherapyResponse(e.target.value)}
                      style={{ width: "100%", padding: "6px 8px", borderRadius: "4px", border: "1px solid var(--m3-border)", fontSize: "12px" }}
                    />
                  </div>
                </div>
              )}

              {newCategory === "family_history" && (
                <div style={{ background: "var(--m3-surface-container-low)", padding: "12px", borderRadius: "8px", marginBottom: "12px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <div>
                    <label style={{ fontSize: "11px", fontWeight: 500 }}>Relationship</label>
                    <input
                      type="text"
                      placeholder="e.g. Mother, Father, Maternal Aunt"
                      value={familyRel}
                      onChange={(e) => setFamilyRel(e.target.value)}
                      style={{ width: "100%", padding: "6px 8px", borderRadius: "4px", border: "1px solid var(--m3-border)", fontSize: "12px" }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "11px", fontWeight: 500 }}>Conditions (comma-separated)</label>
                    <input
                      type="text"
                      placeholder="e.g. MDD, Bipolar I, ADHD"
                      value={familyCond}
                      onChange={(e) => setFamilyCond(e.target.value)}
                      style={{ width: "100%", padding: "6px 8px", borderRadius: "4px", border: "1px solid var(--m3-border)", fontSize: "12px" }}
                    />
                  </div>
                </div>
              )}

              {!["medication_trial", "hospitalization", "psychotherapy", "family_history"].includes(newCategory) && (
                <div style={{ marginBottom: "12px" }}>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 500, marginBottom: "4px" }}>
                    Clinical Description / Structured Details
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Enter detailed history notes..."
                    value={generalDetails}
                    onChange={(e) => setGeneralDetails(e.target.value)}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid var(--m3-border)", fontSize: "13px" }}
                  />
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 500, marginBottom: "4px" }}>
                    Onset Date (YYYY-MM-DD)
                  </label>
                  <input
                    type="date"
                    value={onsetDate}
                    onChange={(e) => setOnsetDate(e.target.value)}
                    style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid var(--m3-border)", fontSize: "13px" }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 500, marginBottom: "4px" }}>
                    Resolution Date (if applicable)
                  </label>
                  <input
                    type="date"
                    value={resolvedDate}
                    onChange={(e) => setResolvedDate(e.target.value)}
                    style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid var(--m3-border)", fontSize: "13px" }}
                  />
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                <Button variant="secondary" size="sm" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" size="sm" loading={isSubmitting} icon="save">
                  Save History Item
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
