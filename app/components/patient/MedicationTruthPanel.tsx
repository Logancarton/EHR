"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { ClinicalRecordHistory, ClinicalRecordSnapshot, MedicationRecord } from "../../domain/clinical-records";
import { type Patient } from "../../domain/patient";
import { clinicalRecordApi } from "../../lib/clinical-record-api";
import { calculateMonitoringStatus, monitoringEvidenceFromRecord, type LabObservation } from "../../lib/clinical-protocols";
import { doseTrajectory, summarizeMedicationTrajectory } from "../../domain/medication-trajectory";
import MedicationReconciliationPanel from "./MedicationReconciliationPanel";
import styles from "./PatientMedications.module.css";
import Button from "../ui/Button";

type MedicationDraft = {
  displayText: string;
  medicationName: string;
  genericName: string;
  strength: string;
  dose: string;
  route: string;
  frequency: string;
  indication: string;
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
  indication: "",
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
  return [
    dosing,
    // P3-C asks for indication "where useful": it is useful whenever it is
    // recorded, and absent rather than guessed at when it is not.
    medication.indication ? `for ${medication.indication}` : null,
    dates,
    medication.prescriber ? `prescriber ${medication.prescriber}` : null,
  ]
    .filter(Boolean)
    .join(" · ") || `Recorded ${new Date(medication.recorded_at).toLocaleDateString()}`;
}

export default function PatientMedications({
  patient,
  onDraftOrder,
  onOpenPrescribe,
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
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  // Monitoring evidence comes from this patient's record, like the Labs section;
  // it used to be read from fixture labs, so a result charted today never
  // changed the status shown next to the medication.
  const [labs, setLabs] = useState<LabObservation[]>([]);

  function applySnapshot(snapshot: ClinicalRecordSnapshot) {
    setLoadState("ready");
    setMedications(snapshot.medications);
    setLabs(
      monitoringEvidenceFromRecord(
        (snapshot.observations ?? [])
          .filter((row) => row.category === "laboratory")
          .map((row) => ({ ...row, recorded_at: row.effective_at })),
        snapshot.vitals ?? [],
      ),
    );
  }

  async function refresh() {
    applySnapshot(await clinicalRecordApi.snapshot(patient.id));
  }

  useEffect(() => {
    let cancelled = false;
    setError("");
    setLoadState("loading");
    clinicalRecordApi.snapshot(patient.id)
      .then((snapshot) => {
        if (!cancelled) applySnapshot(snapshot);
      })
      .catch((cause) => {
        if (!cancelled) {
          setLoadState("error");
          setError(cause instanceof Error ? cause.message : "Unable to load medications.");
        }
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
      indication: medication.indication || "",
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
          indication: draft.indication.trim() || null,
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
          indication: draft.indication.trim() || undefined,
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
          <Button size="sm" busy={busy} onClick={() => startEdit(medication)}>Edit</Button>
        )}
        {medication.status === "active" && (
          <>
            <Button size="sm" busy={busy} onClick={() => run(() => clinicalRecordApi.updateMedication(patient.id, medication.id, { status: "discontinued" }))}>Discontinue</Button>
            <Button size="sm" busy={busy} onClick={() => run(() => clinicalRecordApi.updateMedication(patient.id, medication.id, { status: "completed" }))}>Complete</Button>
          </>
        )}
        {(medication.status === "discontinued" || medication.status === "completed") && (
          <Button size="sm" busy={busy} onClick={() => run(() => clinicalRecordApi.updateMedication(patient.id, medication.id, { status: "active" }))}>Reactivate</Button>
        )}
        <Button size="sm" busy={busy} onClick={() => showHistory(medication)}>History</Button>
        {medication.status !== "entered-in-error" && (
          <Button variant="destructive" size="sm"
            busy={busy}
            onClick={() => {
              if (window.confirm(`Mark “${medication.display_text}” as entered in error? History will be retained.`)) {
                void run(() => clinicalRecordApi.updateMedication(patient.id, medication.id, { status: "entered-in-error" }));
              }
            }}
          >
            Entered in error
          </Button>
        )}
      </div>
    );
  }

  return (
    <section className={`card ${styles.card}`}>
      <div className={styles.heading}>
        <div>
          <h2>Current medications</h2>
        </div>
        <div className={styles.headingActions}>
          <Button variant="primary" icon="add" busy={busy} onClick={startAdd}>Add medication</Button>
          {onOpenPrescribe && <Button icon="add" onClick={onOpenPrescribe}>New prescription</Button>}
        </div>
      </div>

      {error && <p className={styles.error} role="alert">{error}</p>}
      {loadState === "loading" && <p role="status">Loading medications…</p>}
      {loadState === "error" && <Button onClick={() => {
        setLoadState("loading");
        setError("");
        void refresh().catch((cause) => {
          setLoadState("error");
          setError(cause instanceof Error ? cause.message : "Unable to load medications.");
        });
      }}>Retry medications</Button>}

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
          <label>Indication
            <input
              value={draft.indication}
              onChange={(event) => setDraft({ ...draft, indication: event.target.value })}
              maxLength={300}
              placeholder="e.g. Bipolar II maintenance"
            />
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
            <Button size="sm" busy={busy} onClick={() => { setShowForm(false); setEditingId(null); }}>Cancel</Button>
            <Button type="submit" variant="primary" loading={busy} loadingLabel="Saving…">{editingId ? "Save correction" : "Add medication"}</Button>
          </div>
        </form>
      )}

      <div className={styles.sectionHeader}>
        <strong>Active</strong>
        {loadState === "ready" && <span>{activeMedications.length}</span>}
      </div>
      <div className={styles.list}>
        {loadState === "ready" && activeMedications.length === 0 && <p className={styles.empty}>No active medications recorded.</p>}
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
                  {onDraftOrder && <Button size="sm" onClick={() => onDraftOrder(protocol.requiredLab)}>{protocol.status === "overdue" ? "Draft lab" : "Reorder lab"}</Button>}
                </div>
              )}
              {medicationActions(medication)}
            </article>
          );
        })}
      </div>

      <MedicationReconciliationPanel
        patientId={patient.id}
        medications={medications}
        onMedicationChanged={refresh}
      />

      <details className={styles.recordHelp}>
        <summary>About this medication record</summary>
        <p>Clinical truth is maintained here. External prescribing data is reconciled into this record rather than replacing it. Adding a medication does not send a prescription.</p>
      </details>

      <div className={styles.sectionHeader}>
        <strong>Historical / non-active</strong>
        {loadState === "ready" && <span>{historicalMedications.length}</span>}
      </div>
      <div className={styles.list}>
        {loadState === "ready" && historicalMedications.length === 0 && <p className={styles.empty}>No historical medication records.</p>}
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

      {history && (() => {
        /**
         * What the history actually says, rather than that it exists.
         *
         * This listed `v3 · update` and the status from each snapshot, so three
         * dose titrations rendered as three identical lines reading "active".
         * P3-C's last clinician task is "review prior dose trajectory", and the
         * snapshots had held the answer all along without anything showing it.
         */
        const entries = summarizeMedicationTrajectory(history.data.versions);
        const doses = doseTrajectory(history.data.versions);

        return (
          <div className={styles.history}>
            <div className={styles.historyHeading}>
              <div>
                <strong>History · {history.title}</strong>
                <span>{history.data.versions.length} versions · {history.data.provenance.length} provenance events</span>
              </div>
              <Button variant="tertiary" size="sm" onClick={() => setHistory(null)}>Close</Button>
            </div>

            {/*
              The dose line on its own, oldest first, because "has this been up and
              down before?" should not require reading a change list backwards. Only
              writes that moved the dose appear. One point means the dose never
              changed — which is a fact, and different from having no history.
            */}
            {doses.length > 1 && (
              <div className={styles.doseTrajectory} data-dose-trajectory={doses.length}>
                <strong>Dose trajectory</strong>
                <ol>
                  {doses.map((point) => (
                    <li key={point.versionNumber}>
                      <span>{point.dose || point.strength || "not recorded"}</span>
                      <small>{new Date(point.at).toLocaleDateString()} · {point.actorName}</small>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {entries.map((entry) => (
              <div className={styles.historyRow} key={`${entry.versionNumber}-${entry.createdAt}`}>
                <strong>v{entry.versionNumber} · {entry.initial ? "recorded" : entry.operation}</strong>
                <span>{entry.actorName} · {new Date(entry.createdAt).toLocaleString()}</span>
                {entry.unreadable ? (
                  <em className={styles.historyNote}>
                    This version&apos;s snapshot could not be read, so what changed is unknown.
                  </em>
                ) : entry.changes.length === 0 ? (
                  <em className={styles.historyNote}>No change to the prescription itself.</em>
                ) : (
                  <ul className={styles.historyChanges}>
                    {entry.changes.map((change) => (
                      <li key={change.field}>
                        <strong>{change.label}</strong>{" "}
                        {entry.initial
                          ? change.to
                          : <>{change.from ?? "not recorded"} → {change.to ?? "not recorded"}</>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        );
      })()}
    </section>
  );
}
