"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import type {
  AllergyRecord,
  AllergySeverity,
  ClinicalRecordHistory,
  ProblemRecord,
} from "../../domain/clinical-records";
import { clinicalRecordApi } from "../../lib/clinical-record-api";
import { presentClinicalFacts, type FactsLoad } from "../../lib/clinical-facts-presentation";
import styles from "./ClinicalFactsBar.module.css";
import Button from "../ui/Button";

type Tab = "problems" | "allergies";
type ProblemDraft = { displayText: string; code: string; codingSystem: string; onsetDate: string };
type AllergyDraft = { substance: string; reaction: string; severity: AllergySeverity };

const emptyProblem: ProblemDraft = { displayText: "", code: "", codingSystem: "", onsetDate: "" };
const emptyAllergy: AllergyDraft = { substance: "", reaction: "", severity: "unknown" };

function problemMeta(problem: ProblemRecord) {
  const parts = [problem.code, problem.onset_date ? `onset ${problem.onset_date}` : null, problem.resolved_date ? `resolved ${problem.resolved_date}` : null];
  return parts.filter(Boolean).join(" · ") || `Recorded ${new Date(problem.recorded_at).toLocaleDateString()}`;
}

function allergyMeta(allergy: AllergyRecord) {
  const parts = [allergy.severity || "unknown", allergy.reaction || "reaction not recorded"];
  return parts.join(" · ");
}

function statusClass(status: string) {
  if (status === "active") return `${styles.status} ${styles.activeStatus}`;
  if (status === "entered-in-error") return `${styles.status} ${styles.errorStatus}`;
  return styles.status;
}

const EMPTY_PROBLEMS: ProblemRecord[] = [];
const EMPTY_ALLERGIES: AllergyRecord[] = [];

export default function ClinicalFactsBar({ patientId }: { patientId: string }) {
  const [load, setLoad] = useState<FactsLoad>({ status: "loading", patientId });
  const [reloadToken, setReloadToken] = useState(0);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("problems");
  const [problemDraft, setProblemDraft] = useState<ProblemDraft>(emptyProblem);
  const [allergyDraft, setAllergyDraft] = useState<AllergyDraft>(emptyAllergy);
  const [editingProblemId, setEditingProblemId] = useState<string | null>(null);
  const [editingAllergyId, setEditingAllergyId] = useState<string | null>(null);
  const [showProblemForm, setShowProblemForm] = useState(false);
  const [showAllergyForm, setShowAllergyForm] = useState(false);
  const [history, setHistory] = useState<{ title: string; data: ClinicalRecordHistory } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function refresh() {
    const snapshot = await clinicalRecordApi.snapshot(patientId);
    setLoad({ status: "loaded", patientId, problems: snapshot.problems, allergies: snapshot.allergies });
  }

  useEffect(() => {
    let cancelled = false;
    setError("");
    setLoad({ status: "loading", patientId });
    clinicalRecordApi.snapshot(patientId)
      .then((snapshot) => {
        if (cancelled) return;
        setLoad({ status: "loaded", patientId, problems: snapshot.problems, allergies: snapshot.allergies });
      })
      .catch((cause) => {
        if (cancelled) return;
        setLoad({
          status: "failed",
          patientId,
          message: cause instanceof Error ? cause.message : "Unable to load clinical facts.",
        });
      });
    return () => { cancelled = true; };
  }, [patientId, reloadToken]);

  // Derived against the *current* patientId rather than stored separately, so a
  // patient switch can never render the previous patient's problems/allergies --
  // not even for the single frame before the reload effect runs.
  const presentation = presentClinicalFacts(load, patientId);
  const problems = presentation.kind === "facts" ? presentation.problems : EMPTY_PROBLEMS;
  const allergies = presentation.kind === "facts" ? presentation.allergies : EMPTY_ALLERGIES;

  const activeProblems = useMemo(() => problems.filter((problem) => problem.status === "active"), [problems]);
  const activeAllergies = useMemo(() => allergies.filter((allergy) => allergy.status === "active"), [allergies]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Clinical record update failed.");
    } finally {
      setBusy(false);
    }
  }

  function startProblemAdd() {
    setEditingProblemId(null);
    setProblemDraft(emptyProblem);
    setShowProblemForm(true);
  }

  function startProblemEdit(problem: ProblemRecord) {
    setEditingProblemId(problem.id);
    setProblemDraft({
      displayText: problem.display_text,
      code: problem.code || "",
      codingSystem: problem.coding_system || "",
      onsetDate: problem.onset_date || "",
    });
    setShowProblemForm(true);
  }

  async function submitProblem(event: FormEvent) {
    event.preventDefault();
    const displayText = problemDraft.displayText.trim();
    if (!displayText) return setError("Problem name is required.");
    await run(async () => {
      if (editingProblemId) {
        await clinicalRecordApi.updateProblem(patientId, editingProblemId, {
          displayText,
          code: problemDraft.code.trim() || null,
          codingSystem: problemDraft.codingSystem.trim() || null,
          onsetDate: problemDraft.onsetDate || null,
        });
      } else {
        await clinicalRecordApi.addProblem(patientId, {
          displayText,
          code: problemDraft.code.trim() || undefined,
          codingSystem: problemDraft.codingSystem.trim() || undefined,
          onsetDate: problemDraft.onsetDate || undefined,
        });
      }
      setShowProblemForm(false);
      setEditingProblemId(null);
      setProblemDraft(emptyProblem);
    });
  }

  function startAllergyAdd() {
    setEditingAllergyId(null);
    setAllergyDraft(emptyAllergy);
    setShowAllergyForm(true);
  }

  function startAllergyEdit(allergy: AllergyRecord) {
    setEditingAllergyId(allergy.id);
    setAllergyDraft({
      substance: allergy.substance,
      reaction: allergy.reaction || "",
      severity: allergy.severity || "unknown",
    });
    setShowAllergyForm(true);
  }

  async function submitAllergy(event: FormEvent) {
    event.preventDefault();
    const substance = allergyDraft.substance.trim();
    if (!editingAllergyId && !substance) return setError("Allergy substance is required.");
    await run(async () => {
      if (editingAllergyId) {
        await clinicalRecordApi.updateAllergy(patientId, editingAllergyId, {
          reaction: allergyDraft.reaction.trim() || null,
          severity: allergyDraft.severity,
        });
      } else {
        await clinicalRecordApi.addAllergy(patientId, {
          substance,
          reaction: allergyDraft.reaction.trim() || undefined,
          severity: allergyDraft.severity,
        });
      }
      setShowAllergyForm(false);
      setEditingAllergyId(null);
      setAllergyDraft(emptyAllergy);
    });
  }

  async function showHistory(entityType: "problem" | "allergy", entityId: string, title: string) {
    setBusy(true);
    setError("");
    try {
      const data = await clinicalRecordApi.history(patientId, entityType, entityId);
      setHistory({ title, data });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load record history.");
    } finally {
      setBusy(false);
    }
  }

  function confirmEnteredInError(label: string) {
    return window.confirm(`Mark ${label} as entered in error? The history will be retained and the fact will no longer be treated as active.`);
  }

  // "None active"/"None recorded" are clinical assertions. Only render them once
  // this patient's facts have actually loaded; otherwise say what is true.
  function factsPlaceholder(emptyLabel: string) {
    if (presentation.kind === "pending") {
      return <span className={styles.muted}>Checking…</span>;
    }
    if (presentation.kind === "unverified") {
      return (
        <Button
          className={styles.unverified}
          size="sm"
          icon="error"
          title={`${presentation.message} — select to retry.`}
          onClick={() => setReloadToken((token) => token + 1)}
        >
          Unable to verify · retry
        </Button>
      );
    }
    return <span className={styles.muted}>{emptyLabel}</span>;
  }

  return (
    <>
      <div className={styles.bar} aria-label="Active problems and allergies">
        <div className={styles.factGroup}>
          <span className={styles.label}>Problems</span>
          <div className={styles.chips}>
            {activeProblems.length === 0 && factsPlaceholder("None active")}
            {activeProblems.slice(0, 3).map((problem) => (
              <span key={problem.id} className={styles.chip} title={problem.display_text}>{problem.display_text}</span>
            ))}
            {activeProblems.length > 3 && <span className={styles.muted}>+{activeProblems.length - 3}</span>}
          </div>
        </div>
        <div className={styles.factGroup}>
          <span className={styles.label}>Allergies</span>
          <div className={styles.chips}>
            {activeAllergies.length === 0 && factsPlaceholder("None recorded")}
            {activeAllergies.slice(0, 3).map((allergy) => (
              <span key={allergy.id} className={styles.allergyChip} title={allergyMeta(allergy)}>{allergy.substance}</span>
            ))}
            {activeAllergies.length > 3 && <span className={styles.muted}>+{activeAllergies.length - 3}</span>}
          </div>
        </div>
        <Button size="sm" className={styles.manageButton} onClick={() => setOpen(true)}>Manage clinical facts</Button>
      </div>

      {open && (
        <div className={styles.overlay} role="presentation" onMouseDown={(event) => {
          if (event.currentTarget === event.target) setOpen(false);
        }}>
          <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="clinical-facts-title">
            <div className={styles.dialogHeader}>
              <div>
                <h2 id="clinical-facts-title">Problems & allergies</h2>
                <p>Lifecycle changes retain version history and provenance.</p>
              </div>
              <Button variant="tertiary" size="sm" onClick={() => setOpen(false)}>Close</Button>
            </div>

            <div className={styles.tabs}>
              <Button size="sm" pressed={tab === "problems"} onClick={() => { setTab("problems"); setHistory(null); }}>Problems ({problems.length})</Button>
              <Button size="sm" pressed={tab === "allergies"} onClick={() => { setTab("allergies"); setHistory(null); }}>Allergies / reactions ({allergies.length})</Button>
            </div>

            <div className={styles.body}>
              {error && <p className={styles.error}>{error}</p>}

              {tab === "problems" && (
                <>
                  <div className={styles.toolbar}>
                    <div className={styles.toolbarText}>
                      <strong>Problem list</strong>
                      <span>{activeProblems.length} active · {problems.length - activeProblems.length} historical/inactive</span>
                    </div>
                    <Button variant="primary" icon="add" busy={busy} onClick={startProblemAdd}>Add problem</Button>
                  </div>

                  {showProblemForm && (
                    <form className={styles.form} onSubmit={submitProblem}>
                      <label className={styles.formWide}>Clinical display text
                        <input value={problemDraft.displayText} onChange={(event) => setProblemDraft({ ...problemDraft, displayText: event.target.value })} maxLength={500} autoFocus />
                      </label>
                      <label>Code (optional)
                        <input value={problemDraft.code} onChange={(event) => setProblemDraft({ ...problemDraft, code: event.target.value })} maxLength={100} />
                      </label>
                      <label>Coding system (optional)
                        <input value={problemDraft.codingSystem} onChange={(event) => setProblemDraft({ ...problemDraft, codingSystem: event.target.value })} maxLength={100} placeholder="e.g. ICD-10-CM" />
                      </label>
                      <label>Onset date (optional)
                        <input type="date" value={problemDraft.onsetDate} onChange={(event) => setProblemDraft({ ...problemDraft, onsetDate: event.target.value })} />
                      </label>
                      <div className={styles.formActions}>
                        <Button size="sm" onClick={() => setShowProblemForm(false)}>Cancel</Button>
                        <Button type="submit" variant="primary" loading={busy} loadingLabel="Saving…">{editingProblemId ? "Save correction" : "Add problem"}</Button>
                      </div>
                    </form>
                  )}

                  <div className={styles.list}>
                    {problems.map((problem) => (
                      <div key={problem.id} className={styles.row}>
                        <div className={styles.rowTop}>
                          <div className={styles.rowTitle}>
                            <strong>{problem.display_text}</strong>
                            <small>{problemMeta(problem)}</small>
                          </div>
                          <span className={statusClass(problem.status)}>{problem.status.replaceAll("-", " ")}</span>
                        </div>
                        <div className={styles.actions}>
                          {problem.status !== "entered-in-error" && <Button size="sm" onClick={() => startProblemEdit(problem)}>Edit</Button>}
                          {problem.status === "active" && <Button size="sm" busy={busy} onClick={() => run(() => clinicalRecordApi.updateProblem(patientId, problem.id, { status: "resolved" }))}>Resolve</Button>}
                          {problem.status === "active" && <Button size="sm" busy={busy} onClick={() => run(() => clinicalRecordApi.updateProblem(patientId, problem.id, { status: "inactive" }))}>Inactivate</Button>}
                          {(problem.status === "resolved" || problem.status === "inactive") && <Button size="sm" busy={busy} onClick={() => run(() => clinicalRecordApi.updateProblem(patientId, problem.id, { status: "active" }))}>Reactivate</Button>}
                          <Button size="sm" busy={busy} onClick={() => showHistory("problem", problem.id, problem.display_text)}>History</Button>
                          {problem.status !== "entered-in-error" && <Button variant="destructive" size="sm" busy={busy} onClick={() => {
                            if (confirmEnteredInError(`problem “${problem.display_text}”`)) run(() => clinicalRecordApi.updateProblem(patientId, problem.id, { status: "entered-in-error" }));
                          }}>Entered in error</Button>}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {tab === "allergies" && (
                <>
                  <div className={styles.toolbar}>
                    <div className={styles.toolbarText}>
                      <strong>Allergies & adverse reactions</strong>
                      <span>{activeAllergies.length} active · severity is structured and defaults to unknown</span>
                    </div>
                    <Button variant="primary" icon="add" busy={busy} onClick={startAllergyAdd}>Add allergy / reaction</Button>
                  </div>

                  {showAllergyForm && (
                    <form className={styles.form} onSubmit={submitAllergy}>
                      <label className={styles.formWide}>Substance
                        <input value={allergyDraft.substance} onChange={(event) => setAllergyDraft({ ...allergyDraft, substance: event.target.value })} maxLength={300} disabled={Boolean(editingAllergyId)} autoFocus />
                      </label>
                      <label>Reaction
                        <input value={allergyDraft.reaction} onChange={(event) => setAllergyDraft({ ...allergyDraft, reaction: event.target.value })} maxLength={500} placeholder="e.g. rash, angioedema" />
                      </label>
                      <label>Severity
                        <select value={allergyDraft.severity} onChange={(event) => setAllergyDraft({ ...allergyDraft, severity: event.target.value as AllergySeverity })}>
                          <option value="unknown">Unknown</option>
                          <option value="mild">Mild</option>
                          <option value="moderate">Moderate</option>
                          <option value="severe">Severe</option>
                        </select>
                      </label>
                      <div className={styles.formActions}>
                        <Button size="sm" onClick={() => setShowAllergyForm(false)}>Cancel</Button>
                        <Button type="submit" variant="primary" loading={busy} loadingLabel="Saving…">{editingAllergyId ? "Save reaction" : "Add allergy / reaction"}</Button>
                      </div>
                    </form>
                  )}

                  <div className={styles.list}>
                    {allergies.map((allergy) => (
                      <div key={allergy.id} className={styles.row}>
                        <div className={styles.rowTop}>
                          <div className={styles.rowTitle}>
                            <strong>{allergy.substance}</strong>
                            <small>{allergyMeta(allergy)}</small>
                          </div>
                          <span className={statusClass(allergy.status)}>{allergy.status.replaceAll("-", " ")}</span>
                        </div>
                        <div className={styles.actions}>
                          {allergy.status !== "entered-in-error" && <Button size="sm" onClick={() => startAllergyEdit(allergy)}>Edit reaction</Button>}
                          {allergy.status === "active" && <Button size="sm" busy={busy} onClick={() => run(() => clinicalRecordApi.updateAllergy(patientId, allergy.id, { status: "inactive" }))}>Inactivate</Button>}
                          {allergy.status === "inactive" && <Button size="sm" busy={busy} onClick={() => run(() => clinicalRecordApi.updateAllergy(patientId, allergy.id, { status: "active" }))}>Reactivate</Button>}
                          <Button size="sm" busy={busy} onClick={() => showHistory("allergy", allergy.id, allergy.substance)}>History</Button>
                          {allergy.status !== "entered-in-error" && <Button variant="destructive" size="sm" busy={busy} onClick={() => {
                            if (confirmEnteredInError(`allergy/reaction “${allergy.substance}”`)) run(() => clinicalRecordApi.updateAllergy(patientId, allergy.id, { status: "entered-in-error" }));
                          }}>Entered in error</Button>}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {history && (
                <section className={styles.history} aria-label={`History for ${history.title}`}>
                  <div className={styles.toolbar}>
                    <div className={styles.toolbarText}><strong>History: {history.title}</strong><span>{history.data.versions.length} retained version(s) · {history.data.provenance.length} provenance event(s)</span></div>
                    <Button variant="tertiary" size="sm" onClick={() => setHistory(null)}>Hide history</Button>
                  </div>
                  {history.data.versions.map((version) => (
                    <div key={version.id} className={styles.historyItem}>
                      <strong>v{version.version_number}</strong>
                      <span>{version.operation} · {version.actor_name}</span>
                      <small>{new Date(version.created_at).toLocaleString()}</small>
                    </div>
                  ))}
                </section>
              )}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
