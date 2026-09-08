"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { MedicationRecord } from "../../domain/clinical-records";
import type { MedicationReconciliationReview } from "../../domain/medication-reconciliation-intelligence";
import type { MedicationReconciliationCandidate } from "../../domain/medication-reconciliation";
import { medicationReconciliationApi } from "../../lib/medication-reconciliation-api";
import styles from "./MedicationReconciliationPanel.module.css";

function sourceLabel(candidate: MedicationReconciliationCandidate) {
  return candidate.source_type.replaceAll("-", " ");
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

type InterpretationDraft = {
  displayText: string;
  medicationName: string;
  genericName: string;
  strength: string;
  dose: string;
  route: string;
  frequency: string;
  startDate: string;
  endDate: string;
  prescriber: string;
};

function draftFrom(candidate: MedicationReconciliationCandidate): InterpretationDraft {
  return {
    displayText: candidate.display_text,
    medicationName: candidate.medication_name,
    genericName: candidate.generic_name || "",
    strength: candidate.strength || "",
    dose: candidate.dose || "",
    route: candidate.route || "",
    frequency: candidate.frequency || "",
    startDate: candidate.start_date || "",
    endDate: candidate.end_date || "",
    prescriber: candidate.prescriber || "",
  };
}

function relationshipLabel(review: MedicationReconciliationReview | undefined) {
  if (!review) return "Relationship not analyzed";
  const match = review.suggestion;
  if (match.medicationDisplay) {
    return `${match.confidence === "likely" ? "Likely" : "Possible"} match: ${match.medicationDisplay}`;
  }
  if (match.alternatives.length > 1) {
    return `Possible match: ${match.alternatives.length} authoritative records — clinician selection required`;
  }
  return "No clear medication match";
}

export default function MedicationReconciliationPanel({
  patientId,
  medications,
  onMedicationChanged,
}: {
  patientId: string;
  medications: MedicationRecord[];
  onMedicationChanged: () => Promise<void>;
}) {
  const [candidates, setCandidates] = useState<MedicationReconciliationCandidate[]>([]);
  const [reviews, setReviews] = useState<MedicationReconciliationReview[]>([]);
  const [patientReport, setPatientReport] = useState("");
  const [selectedMedication, setSelectedMedication] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<InterpretationDraft | null>(null);
  const [error, setError] = useState("");

  const pending = useMemo(
    () => candidates.filter((candidate) => candidate.status === "pending"),
    [candidates],
  );
  const resolved = useMemo(
    () => candidates.filter((candidate) => candidate.status !== "pending"),
    [candidates],
  );
  const activeMedications = useMemo(
    () => medications.filter((medication) => medication.status === "active"),
    [medications],
  );
  const reviewById = useMemo(
    () => new Map(reviews.map((review) => [review.candidate.id, review])),
    [reviews],
  );
  const medicationById = useMemo(
    () => new Map(medications.map((medication) => [medication.id, medication])),
    [medications],
  );

  async function refreshCandidates() {
    const loaded = await medicationReconciliationApi.load(patientId);
    setCandidates(loaded.candidates);
    setReviews(loaded.reviews);
  }

  useEffect(() => {
    let cancelled = false;
    setError("");
    medicationReconciliationApi.load(patientId)
      .then((loaded) => {
        if (!cancelled) {
          setCandidates(loaded.candidates);
          setReviews(loaded.reviews);
        }
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Unable to load medication review items.");
      });
    return () => { cancelled = true; };
  }, [patientId]);

  async function recordPatientReport(event: FormEvent) {
    event.preventDefault();
    const displayText = patientReport.trim();
    if (!displayText) return;
    setRecording(true);
    setError("");
    try {
      await medicationReconciliationApi.recordPatientReport(patientId, {
        displayText,
        medicationName: displayText,
        observedAt: new Date().toISOString(),
      });
      setPatientReport("");
      await refreshCandidates();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to record patient-reported medication evidence.");
    } finally {
      setRecording(false);
    }
  }

  function beginEdit(candidate: MedicationReconciliationCandidate) {
    setEditingId(candidate.id);
    setEditDraft(draftFrom(candidate));
    setError("");
  }

  async function saveInterpretation(candidate: MedicationReconciliationCandidate) {
    if (!editDraft || editingId !== candidate.id) return;
    if (!editDraft.displayText.trim() || !editDraft.medicationName.trim()) {
      setError("Medication label and medication name are required for the interpreted candidate.");
      return;
    }
    setBusyId(candidate.id);
    setError("");
    try {
      await medicationReconciliationApi.editInterpretation(patientId, candidate.id, {
        displayText: editDraft.displayText.trim(),
        medicationName: editDraft.medicationName.trim(),
        genericName: emptyToNull(editDraft.genericName),
        strength: emptyToNull(editDraft.strength),
        dose: emptyToNull(editDraft.dose),
        route: emptyToNull(editDraft.route),
        frequency: emptyToNull(editDraft.frequency),
        startDate: emptyToNull(editDraft.startDate),
        endDate: emptyToNull(editDraft.endDate),
        prescriber: emptyToNull(editDraft.prescriber),
      });
      setEditingId(null);
      setEditDraft(null);
      await refreshCandidates();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update the medication evidence interpretation.");
    } finally {
      setBusyId(null);
    }
  }

  async function reconcile(candidate: MedicationReconciliationCandidate, decision: "add" | "update" | "discontinue" | "ignore") {
    // Advisory matches deliberately never populate this selection. Update/discontinue
    // require the clinician to choose the authoritative target in this control.
    const selectedId = selectedMedication[candidate.id] || undefined;
    const medicationId = decision === "update" || decision === "discontinue" ? selectedId : undefined;
    if ((decision === "update" || decision === "discontinue") && !medicationId) {
      setError("Choose the existing medication you intend to change first.");
      return;
    }
    setBusyId(candidate.id);
    setError("");
    try {
      await medicationReconciliationApi.reconcile(patientId, candidate.id, decision, medicationId);
      setSelectedMedication((current) => {
        const next = { ...current };
        delete next[candidate.id];
        return next;
      });
      await Promise.all([refreshCandidates(), onMedicationChanged()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Medication reconciliation failed.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className={styles.panel} aria-label="Medication reconciliation">
      <div className={styles.heading}>
        <div>
          <span>Medication review</span>
          <strong>Pending reconciliation</strong>
        </div>
        <small>{pending.length} pending{resolved.length ? ` · ${resolved.length} resolved` : ""}</small>
      </div>

      <p className={styles.explainer}>
        Evidence and advisory interpretation stay separate from the authoritative medication list until you explicitly reconcile them.
      </p>

      <form className={styles.reportForm} onSubmit={recordPatientReport}>
        <input
          value={patientReport}
          onChange={(event) => setPatientReport(event.target.value)}
          placeholder="Record patient report, e.g. “I stopped sertraline two weeks ago.”"
          maxLength={500}
          aria-label="Patient-reported medication evidence"
        />
        <button type="submit" disabled={recording || !patientReport.trim()}>
          {recording ? "Recording…" : "Add report"}
        </button>
      </form>

      {error && <p className={styles.error}>{error}</p>}

      {pending.length === 0 ? (
        <p className={styles.empty}>No medication evidence is waiting for review.</p>
      ) : (
        <div className={styles.list}>
          {pending.map((candidate) => {
            const review = reviewById.get(candidate.id);
            const selected = selectedMedication[candidate.id] || "";
            const selectedRecord = activeMedications.find((medication) => medication.id === selected);
            const busy = busyId === candidate.id;
            const isEditing = editingId === candidate.id && editDraft;
            return (
              <article className={styles.candidate} key={candidate.id}>
                <div className={styles.candidateTop}>
                  <div>
                    <strong>{candidate.raw_evidence_text}</strong>
                    <small>
                      {sourceLabel(candidate)} · {candidate.source_system} · {candidate.evidence_type}
                      {candidate.observed_at ? ` · observed ${new Date(candidate.observed_at).toLocaleString()}` : ""}
                    </small>
                  </div>
                  <span>evidence</span>
                </div>

                <div className={styles.reviewSignal}>
                  <strong>{review?.conflictSignal || "Medication evidence requires review."}</strong>
                  <small>{relationshipLabel(review)} · advisory only</small>
                </div>

                <div className={styles.interpretationSummary}>
                  <span>
                    Interpreted: {candidate.display_text}
                    {candidate.dose ? ` · dose ${candidate.dose}` : ""}
                    {candidate.frequency ? ` · ${candidate.frequency}` : ""}
                  </span>
                  <button type="button" onClick={() => beginEdit(candidate)} disabled={busy}>
                    Review interpretation
                  </button>
                </div>

                {isEditing && (
                  <div className={styles.editor}>
                    <p>Original evidence remains unchanged. These fields control the structured candidate that would be accepted.</p>
                    <div className={styles.editorGrid}>
                      <label>Medication label<input value={editDraft.displayText} onChange={(event) => setEditDraft({ ...editDraft, displayText: event.target.value })} /></label>
                      <label>Medication name<input value={editDraft.medicationName} onChange={(event) => setEditDraft({ ...editDraft, medicationName: event.target.value })} /></label>
                      <label>Generic / alternate name<input value={editDraft.genericName} onChange={(event) => setEditDraft({ ...editDraft, genericName: event.target.value })} /></label>
                      <label>Strength<input value={editDraft.strength} onChange={(event) => setEditDraft({ ...editDraft, strength: event.target.value })} /></label>
                      <label>Dose<input value={editDraft.dose} onChange={(event) => setEditDraft({ ...editDraft, dose: event.target.value })} /></label>
                      <label>Route<input value={editDraft.route} onChange={(event) => setEditDraft({ ...editDraft, route: event.target.value })} /></label>
                      <label>Frequency<input value={editDraft.frequency} onChange={(event) => setEditDraft({ ...editDraft, frequency: event.target.value })} /></label>
                      <label>Start date<input type="date" value={editDraft.startDate} onChange={(event) => setEditDraft({ ...editDraft, startDate: event.target.value })} /></label>
                      <label>End date<input type="date" value={editDraft.endDate} onChange={(event) => setEditDraft({ ...editDraft, endDate: event.target.value })} /></label>
                      <label>Prescriber<input value={editDraft.prescriber} onChange={(event) => setEditDraft({ ...editDraft, prescriber: event.target.value })} /></label>
                    </div>
                    <div className={styles.editorActions}>
                      <button type="button" onClick={() => saveInterpretation(candidate)} disabled={busy}>Save interpretation</button>
                      <button type="button" onClick={() => { setEditingId(null); setEditDraft(null); }} disabled={busy}>Cancel</button>
                    </div>
                  </div>
                )}

                <label className={styles.linkChoice}>
                  Authoritative medication to update/discontinue
                  <select
                    value={selected}
                    onChange={(event) => setSelectedMedication((current) => ({
                      ...current,
                      [candidate.id]: event.target.value,
                    }))}
                    disabled={busy}
                  >
                    <option value="">Choose explicitly…</option>
                    {activeMedications.map((medication) => (
                      <option value={medication.id} key={medication.id}>{medication.display_text}</option>
                    ))}
                  </select>
                </label>

                <div className={styles.actions}>
                  <button type="button" onClick={() => reconcile(candidate, "add")} disabled={busy}>
                    Add to medication list
                  </button>
                  <button type="button" onClick={() => reconcile(candidate, "update")} disabled={busy || !selectedRecord}>
                    Update existing
                  </button>
                  <button type="button" onClick={() => reconcile(candidate, "discontinue")} disabled={busy || !selectedRecord}>
                    Discontinue existing
                  </button>
                  <button type="button" className={styles.ignore} onClick={() => reconcile(candidate, "ignore")} disabled={busy}>
                    Ignore
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {resolved.length > 0 && (
        <details className={styles.history}>
          <summary>Resolved reconciliation history ({resolved.length})</summary>
          <div className={styles.historyList}>
            {resolved.map((candidate) => {
              const affected = candidate.linked_medication_id
                ? medicationById.get(candidate.linked_medication_id)
                : undefined;
              return (
                <div key={candidate.id} className={styles.historyItem}>
                  <strong>{candidate.raw_evidence_text}</strong>
                  <small>
                    {candidate.decision || candidate.status}
                    {candidate.resolved_by ? ` · ${candidate.resolved_by}` : ""}
                    {candidate.resolved_at ? ` · ${new Date(candidate.resolved_at).toLocaleString()}` : ""}
                    {affected ? ` · ${affected.display_text}` : ""}
                  </small>
                </div>
              );
            })}
          </div>
        </details>
      )}
    </section>
  );
}
