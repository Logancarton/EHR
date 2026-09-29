"use client";

import { useEffect, useState } from "react";
import type { MedicationRecord } from "../../domain/clinical-records";
import type { Patient } from "../../domain/patient";
import { clinicalRecordApi } from "../../lib/clinical-record-api";
import {
  summarizePrescribingContext,
  type PrescribingMedicationContext as Context,
} from "../../lib/prescribing-medication-context";

function activeMedicationMeta(medication: MedicationRecord): string {
  return [
    [medication.strength, medication.dose, medication.route, medication.frequency].filter(Boolean).join(" "),
    medication.indication ? `for ${medication.indication}` : "",
    medication.start_date ? `since ${medication.start_date}` : "",
  ].filter(Boolean).join(" · ");
}

type Load =
  | { status: "loading"; patientId: string }
  | { status: "loaded"; patientId: string; context: Context }
  | { status: "failed"; patientId: string; message: string };

/**
 * Allergies, active medications and past trials for the patient being
 * prescribed for — read-only, so the clinician does not have to leave the
 * companion for the chart to check them.
 *
 * Editing stays in the chart's Medications and History sections; this is a view
 * onto the same record, not a second place to change it. A failed load is shown
 * as unverified and never as "none recorded": not-known is not the same as none.
 */
export default function PrescribingMedicationContext({
  patient,
  revision = 0,
}: {
  patient: Patient;
  revision?: number;
}) {
  const [load, setLoad] = useState<Load>({ status: "loading", patientId: patient.id });

  useEffect(() => {
    let cancelled = false;
    setLoad({ status: "loading", patientId: patient.id });
    clinicalRecordApi
      .snapshot(patient.id)
      .then((snapshot) => {
        if (cancelled) return;
        setLoad({ status: "loaded", patientId: patient.id, context: summarizePrescribingContext(snapshot, patient.id) });
      })
      .catch((cause) => {
        if (cancelled) return;
        setLoad({
          status: "failed",
          patientId: patient.id,
          message: cause instanceof Error ? cause.message : "Unable to load the medication record.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [patient.id, revision]);

  // A load for another patient is never shown under this one's name.
  const current = load.patientId === patient.id ? load : { status: "loading" as const };

  if (current.status === "loading") {
    return (
      <section className="prescribing-med-context" aria-label="Medication context" aria-busy="true">
        <p className="prescribing-med-context-note">Loading allergies and medications…</p>
      </section>
    );
  }

  if (current.status === "failed") {
    return (
      <section className="prescribing-med-context" aria-label="Medication context">
        <p className="prescribing-med-context-note is-error" role="alert">
          Allergies and medications could not be loaded, so they are unverified — check the chart
          before prescribing. ({current.message})
        </p>
      </section>
    );
  }

  const { allergies, nkdaAssessed, activeMedications, pastTrials } = current.context;

  return (
    <section className="prescribing-med-context" aria-label="Medication context">
      <div className="prescribing-med-block" data-med-context="allergies">
        <h3>
          Allergies <span>{allergies.length}</span>
        </h3>
        {allergies.length > 0 ? (
          <ul>
            {allergies.map((allergy) => (
              <li key={allergy.id} className="is-allergy">
                <strong>{allergy.substance}</strong>
                <span>
                  {[
                    allergy.reaction || "reaction not recorded",
                    `severity ${allergy.severity || "unknown"}`,
                  ].join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        ) : nkdaAssessed ? (
          <p className="prescribing-med-context-note">No known drug allergies (NKDA, clinician-assessed).</p>
        ) : (
          <p className="prescribing-med-context-note is-warning">
            No allergy assessment on record — an empty list does not mean NKDA.
          </p>
        )}
      </div>

      <div className="prescribing-med-block" data-med-context="active">
        <h3>
          Active medications <span>{activeMedications.length}</span>
        </h3>
        {activeMedications.length > 0 ? (
          <ul>
            {activeMedications.map((medication) => (
              <li key={medication.id}>
                <strong>{medication.display_text || medication.medication_name}</strong>
                {/* The display text often already carries the dose, so no placeholder when these are empty. */}
                {activeMedicationMeta(medication) && <span>{activeMedicationMeta(medication)}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="prescribing-med-context-note">No active medications recorded.</p>
        )}
      </div>

      <details className="prescribing-med-block" data-med-context="trials" open={pastTrials.length > 0 && pastTrials.length <= 4}>
        <summary>
          <h3>
            Past medication trials <span>{pastTrials.length}</span>
          </h3>
        </summary>
        {pastTrials.length > 0 ? (
          <ul>
            {pastTrials.map((trial) => (
              <li key={trial.id}>
                <strong>{trial.title}</strong>
                <span>
                  {trial.detail || "No details recorded"}
                  {" · "}
                  <em>{trial.source === "medication-record" ? "medication record" : "psychiatric history"}</em>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="prescribing-med-context-note">No past medication trials recorded.</p>
        )}
      </details>
    </section>
  );
}
