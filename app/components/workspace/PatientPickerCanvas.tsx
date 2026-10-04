"use client";

import { useEffect, useRef, useState } from "react";
import type { Patient } from "../../domain/patient";
import type { PatientRosterStatus } from "../../lib/patient-roster";
import { markEscapeHandled } from "../../lib/use-dismissible";
import styles from "./PatientPickerCanvas.module.css";

/** Selection only: the shared roster and navigation controller retain authority. */
export default function PatientPickerCanvas({
  patients, status, onRetry, onClose, onSelect, onNewIntake,
}: {
  patients: readonly Patient[];
  status: PatientRosterStatus;
  onRetry: () => void;
  onClose: () => void;
  onSelect: (patientId: string) => void;
  onNewIntake: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const restoreLauncherFocus = useRef(true);
  const [query, setQuery] = useState("");
  useEffect(() => {
    const dialog = dialogRef.current;
    const fitViewport = () => {
      if (!dialog) return;
      const zoom = Number.parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
      dialog.style.maxWidth = `${window.innerWidth / zoom - 32}px`;
      dialog.style.maxHeight = `${window.innerHeight / zoom - 48}px`;
    };
    fitViewport();
    dialog?.showModal();
    searchRef.current?.focus();
    window.addEventListener("resize", fitViewport);
    return () => {
      window.removeEventListener("resize", fitViewport);
      dialog?.close();
      if (restoreLauncherFocus.current) {
        document.querySelector<HTMLButtonElement>("[data-workspace-control='open-workspace-launcher']")?.focus();
      }
    };
  }, []);

  const search = query.trim().toLowerCase();
  const matches = patients.filter((patient) =>
    [patient.name, patient.mrn, patient.dob].some((value) => value.toLowerCase().includes(search)),
  );

  return (
    <dialog ref={dialogRef} className={styles.canvas} aria-labelledby="patient-picker-title"
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        markEscapeHandled(event.nativeEvent);
        onClose();
      }}
      onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <header className={styles.header}>
        <div>
          <h2 id="patient-picker-title">Find a patient</h2>
          <p>Choose a patient to open their chart. Your open workspaces stay available.</p>
        </div>
        <button type="button" onClick={onClose}>Close</button>
      </header>
      <div className={styles.newIntake}>
        <button type="button" onClick={() => {
          // Release native modality before Intake mounts and focuses its form.
          restoreLauncherFocus.current = false;
          dialogRef.current?.close();
          onNewIntake();
        }}>New patient / Start intake</button>
        <span>Start with contact details. Create the clinical chart after identity review.</span>
      </div>
      <label className={styles.search}>
        Search by name, MRN, or date of birth
        <input ref={searchRef} type="search" value={query} onChange={(event) => {
          setQuery(event.target.value);
          resultsRef.current?.scrollTo({ top: 0 });
        }}
          placeholder="Find a patient…" />
      </label>
      <div ref={resultsRef} className={styles.results} aria-live="polite" aria-busy={status === "loading"}>
        {status === "idle" || status === "loading" ? <p>Loading patients…</p>
          : status === "error" ? <div role="alert">
            <p>Patients could not be loaded. Try again to choose a chart.</p>
            <button type="button" onClick={onRetry}>Retry loading patients</button>
          </div>
          : matches.length === 0 ? <p>{search ? "No patients match your search." : "No accessible patients are available."}</p>
          : <>
            <p>{matches.length} {matches.length === 1 ? "patient" : "patients"}</p>
            <ul className={styles.list}>
              {matches.map((patient) => <li key={patient.id}>
                <button type="button" className={styles.patient} onClick={() => onSelect(patient.id)}>
                  <span><strong>{patient.name}</strong><span className={styles.identity}>DOB {patient.dob} · MRN {patient.mrn}</span></span>
                  <span className={styles.open}>Open chart</span>
                </button>
              </li>)}
            </ul>
          </>}
      </div>
    </dialog>
  );
}
