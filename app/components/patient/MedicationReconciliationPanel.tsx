"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { MedicationRecord } from "../../domain/clinical-records";
import type { MedicationReconciliationCandidate } from "../../domain/medication-reconciliation";
import { medicationReconciliationApi } from "../../lib/medication-reconciliation-api";
import styles from "./MedicationReconciliationPanel.module.css";

function sourceLabel(candidate: MedicationReconciliationCandidate) {
  return candidate.source_type.replaceAll("-", " ");
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
  const [patientReport, setPatientReport] = useState("");
  const [selectedMedication, setSelectedMedication] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState("");

  const pending = useMemo(
    () => candidates.filter((candidate) => candidate.status === "pending"),
    [candidates],
  );
  const resolvedCount = candidates.length - pending.length;
  const activeMedications = useMemo(
    () => medications.filter((medication) => medication.status === "active"),
    [medications],
  );

  async function refreshCandidates() {
    setCandidates(await medicationReconciliationApi.list(patientId));
  }

  useEffect(() => {
    let cancelled = false;
    setError("");
    medicationReconciliationApi.list(patientId)
      .then((rows) => { if (!cancelled) setCandidates(rows); })
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

  async function reconcile(candidate: MedicationReconciliationCandidate, decision: "add" | "update" | "discontinue" | "ignore") {
    const medicationId = selectedMedication[candidate.id] || candidate.linked_medication_id || undefined;
    if ((decision === "update" || decision === "discontinue") && !medicationId) {
      setError("Choose the existing medication you intend to change first.");
      return;
    }
    setBusyId(candidate.id);
    setError("");
    try {
      await medicationReconciliationApi.reconcile(patientId, candidate.id, decision, medicationId);
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
        <small>{pending.length} pending{resolvedCount ? ` · ${resolvedCount} resolved` : ""}</small>
      </div>

      <p className={styles.explainer}>
        These are non-authoritative reports or external evidence. Nothing changes the medication list until you explicitly reconcile it.
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
            const selected = selectedMedication[candidate.id] || candidate.linked_medication_id || "";
            const selectedRecord = activeMedications.find((medication) => medication.id === selected);
            const busy = busyId === candidate.id;
            return (
              <article className={styles.candidate} key={candidate.id}>
                <div className={styles.candidateTop}>
                  <div>
                    <strong>{candidate.display_text}</strong>
                    <small>
                      {sourceLabel(candidate)} · {candidate.source_system} · {candidate.evidence_type}
                      {candidate.observed_at ? ` · observed ${new Date(candidate.observed_at).toLocaleString()}` : ""}
                    </small>
                  </div>
                  <span>evidence</span>
                </div>

                <label className={styles.linkChoice}>
                  Existing active medication for update/discontinue
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
    </section>
  );
}
