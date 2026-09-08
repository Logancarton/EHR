"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { ClinicalRecordHistory, MedicationRecord } from "../../domain/clinical-records";
import { type Patient } from "../../domain/patient";
import { clinicalRecordApi } from "../../lib/clinical-record-api";
import { calculateMonitoringStatus, patientLabHistory } from "../../lib/clinical-protocols";
import styles from "./PatientMedications.module.css";

type MedicationDraft = {
  displayText: string;
  medicationName: string;
  genericName: string;
  strength: string;
  dose: string;
  route: string;
  frequency: string;
  startDate: string;
  prescriber: string;
};

const emptyMedication: MedicationDraft = {
  displayText: "",
  medicationName: "",
  genericName: "",
  strength: "",
  dose: "",
  route: "",
  frequency: "",
  startDate: "",
  prescriber: "",
};

function statusLabel(status: MedicationRecord["status"]) {
  return status.replaceAll("-", " ");
}

function medicationMeta(medication: MedicationRecord) {
  const dosing = [medication.strength, medication.dose, medication.route, medication.frequency].filter(Boolean).join(" · ");
  const dates = [
    medication.start_date ? `started ${medication.start_date}` : null,
    medication.end_date ? `ended ${medication.end_date}` : null,
  ].filter(Boolean).join(" · ");
  return [dosing, dates, medication.prescriber ? `prescriber ${medication.prescriber}` : null]
    .filter(Boolean)
    .join(" · ") || `Recorded ${new Date(medication.recorded_at).toLocaleDateString()}`;
}

export default function PatientMedications({
  patient,
  onDraftOrder,
}: {
  patient: Patient;
  onDraftOrder?: (orderName: string) => void;
  onOpenPrescribe?: () => void;
}) {
  const [medications, setMedications] = useState<MedicationRecord[]>([]);
  const [draft, setDraft] = useState<MedicationDraft>(emptyMedication);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [history, setHistory] = useState<{ title: string; data: ClinicalRecordHistory } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const labs = patientLabHistory[patient.id] || [];

  async function refresh() {
    const snapshot = await clinicalRecordApi.snapshot(patient.id);
    setMedications(snapshot.medications);
  }

  useEffect(() => {
    let cancelled = false;
    setError("");
    clinicalRecordApi.snapshot(patient.id)
      .then((snapshot) => {
        if (!cancelled) setMedications(snapshot.medications);
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Unable to load medications.");
      });
    return () => { cancelled = true; };
  }, [patient.id]);

  const activeMedications = useMemo(
    () => medications.filter((medication) => medication.status === "active"),
    [medications],
  );
  const historicalMedications = useMemo(
    () => medications.filter((medication) => medication.status !== "active"),
    [medications],
  );

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Medication update failed.");
    } finally {
      setBusy(false);
    }
  }

  function startAdd() {
    setEditingId(null);
    setDraft(emptyMedication);
    setShowForm(true);
  }

  function startEdit(medication: MedicationRecord) {
    setEditingId(medication.id);
    setDraft({
      displayText: medication.display_text,
      medicationName: medication.medication_name,
      genericName: medication.generic_name || "",
      strength: medication.strength || "",
      dose: medication.dose || "",
      route: medication.route || "",
      frequency: medication.frequency || "",
      startDate: medication.start_date || "",
      prescriber: medication.prescriber || "",
    });
    setShowForm(true);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const displayText = draft.displayText.trim();
    if (!displayText) return setError("Medication display text is required.");

    await run(async () => {
      if (editingId) {
        await clinicalRecordApi.updateMedication(patient.id, editingId, {
          displayText,
          medicationName: draft.medicationName.trim() || displayText,
          genericName: draft.genericName.trim() || null,
          strength: draft.strength.trim() || null,
          dose: draft.dose.trim() || null,
          route: draft.route.trim() || null,
          frequency: draft.frequency.trim() || null,
        });
      } else {
        await clinicalRecordApi.addMedication(patient.id, {
          displayText,
          medicationName: draft.medicationName.trim() || undefined,
          genericName: draft.genericName.trim() || undefined,
          strength: draft.strength.trim() || undefined,
          dose: draft.dose.trim() || undefined,
          route: draft.route.trim() || undefined,
          frequency: draft.frequency.trim() || undefined,
          startDate: draft.startDate || undefined,
          prescriber: draft.prescriber.trim() || undefined,
        });
      }
      setShowForm(false);
      setEditingId(null);
      setDraft(emptyMedication);
    });
  }

  async function showHistory(medication: MedicationRecord) {
    setBusy(true);
    setError("");
    try {
      const data = await clinicalRecordApi.history(patient.id, "medication", medication.id);
      setHistory({ title: medication.display_text, data });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load medication history.");
    } finally {
      setBusy(false);
    }
  }

  function medicationActions(medication: MedicationRecord) {
    return (
      <div className={styles.actions}>
        {medication.status !== "entered-in-error" && (
          <button type="button" onClick={() => startEdit(medication)} disabled={busy}>Edit</button>
        )}
        {medication.status === "active" && (
          <>
            <button type="button" onClick={() => run(() => clinicalRecordApi.updateMedication(patient.id, medication.id, { status: "discontinued" }))} disabled={busy}>Discontinue</button>
            <button type="button" onClick={() => run(() => clinicalRecordApi.updateMedication(patient.id, medication.id, { status: "completed" }))} disabled={busy}>Complete</button>
          </>
        )}
        {(medication.status === "discontinued" || medication.status === "completed") && (
          <button type="button" onClick={() => run(() => clinicalRecordApi.updateMedication(patient.id, medication.id, { status: "active" }))} disabled={busy}>Reactivate</button>
        )}
        <button type="button" onClick={() => showHistory(medication)} disabled={busy}>History</button>
        {medication.status !== "entered-in-error" && (
          <button
            type="button"
            className={styles.danger}
            disabled={busy}
            onClick={() => {
              if (window.confirm(`Mark “${medication.display_text}” as entered in error? History will be retained.`)) {
                run(() => clinicalRecordApi.updateMedication(patient.id, medication.id, { status: "entered-in-error" }));
              }
            }}
          >
            Entered in error
          </button>
        )}
      </div>
    );
  }

  return (
    <section className={`card ${styles.card}`}>
      <div className={styles.heading}>
        <div>
          <span className="eyebrow">Authoritative medication record</span>
          <h2>Current medications</h2>
          <p>Clinical truth is maintained here. External prescribing data will be reconciled into this record rather than replacing it.</p>
        </div>
        <button type="button" className="primary" onClick={startAdd} disabled={busy}>＋ Add medication</button>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      {showForm && (
        <form className={styles.form} onSubmit={submit}>
          <label className={styles.wide}>Clinical display text
            <input value={draft.displayText} onChange={(event) => setDraft({ ...draft, displayText: event.target.value })} maxLength={500} autoFocus />
          </label>
          <label>Medication name
            <input value={draft.medicationName} onChange={(event) => setDraft({ ...draft, medicationName: event.target.value })} maxLength={300} />
          </label>
          <label>Generic name
            <input value={draft.genericName} onChange={(event) => setDraft({ ...draft, genericName: event.target.value })} maxLength={300} />
          </label>
          <label>Strength
            <input value={draft.strength} onChange={(event) => setDraft({ ...draft, strength: event.target.value })} maxLength={100} placeholder="e.g. 100 mg" />
          </label>
          <label>Dose
            <input value={draft.dose} onChange={(event) => setDraft({ ...draft, dose: event.target.value })} maxLength={100} />
          </label>
          <label>Route
            <input value={draft.route} onChange={(event) => setDraft({ ...draft, route: event.target.value })} maxLength={100} placeholder="e.g. oral" />
          </label>
          <label>Frequency
            <input value={draft.frequency} onChange={(event) => setDraft({ ...draft, frequency: event.target.value })} maxLength={200} />
          </label>
          {!editingId && (
            <>
              <label>Start date
                <input type="date" value={draft.startDate} onChange={(event) => setDraft({ ...draft, startDate: event.target.value })} />
              </label>
              <label>Prescriber / source clinician
                <input value={draft.prescriber} onChange={(event) => setDraft({ ...draft, prescriber: event.target.value })} maxLength={300} placeholder="Optional" />
              </label>
            </>
          )}
          <div className={styles.formActions}>
            <button type="button" onClick={() => { setShowForm(false); setEditingId(null); }} disabled={busy}>Cancel</button>
            <button type="submit" className="primary" disabled={busy}>{editingId ? "Save correction" : "Add medication"}</button>
          </div>
        </form>
      )}

      <div className={styles.sectionHeader}>
        <strong>Active</strong>
        <span>{activeMedications.length}</span>
      </div>
      <div className={styles.list}>
        {activeMedications.length === 0 && <p className={styles.empty}>No active medications recorded.</p>}
        {activeMedications.map((medication) => {
          const protocol = calculateMonitoringStatus([medication.display_text], labs)[0];
          return (
            <article className={styles.row} key={medication.id}>
              <div className={styles.rowTop}>
                <div>
                  <strong>{medication.display_text}</strong>
                  <small>{medicationMeta(medication)}</small>
                  <small>Source: {medication.source_type} · {medication.source_system}</small>
                </div>
                <span className={`${styles.status} ${styles.activeStatus}`}>active</span>
              </div>
              {protocol && (
                <div className={styles.monitoring}>
                  <span><strong>{protocol.requiredLab}</strong> · {protocol.status.replaceAll("-", " ")} · {protocol.intervalLabel}</span>
                  {onDraftOrder && <button type="button" onClick={() => onDraftOrder(protocol.requiredLab)}>{protocol.status === "overdue" ? "Draft lab" : "Reorder lab"}</button>}
                </div>
              )}
              {medicationActions(medication)}
            </article>
          );
        })}
      </div>

      <div className={styles.sectionHeader}>
        <strong>Historical / non-active</strong>
        <span>{historicalMedications.length}</span>
      </div>
      <div className={styles.list}>
        {historicalMedications.length === 0 && <p className={styles.empty}>No historical medication records.</p>}
        {historicalMedications.map((medication) => (
          <article className={styles.row} key={medication.id}>
            <div className={styles.rowTop}>
              <div>
                <strong>{medication.display_text}</strong>
                <small>{medicationMeta(medication)}</small>
                <small>Source: {medication.source_type} · {medication.source_system}</small>
              </div>
              <span className={`${styles.status} ${medication.status === "entered-in-error" ? styles.errorStatus : ""}`}>{statusLabel(medication.status)}</span>
            </div>
            {medicationActions(medication)}
          </article>
        ))}
      </div>

      {history && (
        <div className={styles.history}>
          <div className={styles.historyHeading}>
            <div>
              <strong>History · {history.title}</strong>
              <span>{history.data.versions.length} versions · {history.data.provenance.length} provenance events</span>
            </div>
            <button type="button" onClick={() => setHistory(null)}>Close</button>
          </div>
          {history.data.versions.map((version) => (
            <div className={styles.historyRow} key={version.id}>
              <strong>v{version.version_number} · {version.operation}</strong>
              <span>{String(version.snapshot.status || "unknown")} · {version.actor_name} · {new Date(version.created_at).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
