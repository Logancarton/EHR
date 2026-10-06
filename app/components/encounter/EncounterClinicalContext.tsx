"use client";

import type { ClinicalRecordSnapshot } from "../../domain/clinical-records";
import { buildClinicalBrief, vitalContext } from "../../domain/clinical-brief";
import { latestLaboratoryObservations } from "../../domain/overview-labs";
import type { ReadinessGroup } from "../../domain/visit-readiness";
import { formatClinicalDate } from "../../lib/clinical-date";
import styles from "./EncounterClinicalContext.module.css";
import { formatLabValue } from "../../lib/lab-value-presentation";

export default function EncounterClinicalContext({ patientId, encounterId, snapshot, status, error, onRefresh,
  labs, onOpenPrior, onPrescribe, onOrderLabs, onReviewLabs, onManageMedications,
}: {
  patientId: string;
  encounterId?: string;
  snapshot: ClinicalRecordSnapshot | null;
  status: "loading" | "loaded" | "error";
  error: string | null;
  onRefresh: () => void;
  labs?: ReadinessGroup;
  onOpenPrior: () => void;
  onPrescribe?: () => void;
  onOrderLabs?: (prefill?: string) => void;
  onReviewLabs?: () => void;
  onManageMedications?: () => void;
}) {
  if (status !== "loaded" || !snapshot) return <div className={styles.context}>
    <p role="status">{status === "loading" ? "Loading clinical context…" : error}</p>
    {status === "error" && <button type="button" onClick={onRefresh}>Retry clinical context</button>}
  </div>;

  const brief = buildClinicalBrief({ patientId, excludeEncounterId: encounterId, encounters: snapshot.encounters ?? [],
    assessments: snapshot.assessments ?? [], vitals: snapshot.vitals ?? [],
    medications: snapshot.medications, observations: snapshot.observations ?? [] });
  const medications = snapshot.medications.filter((item) => item.status === "active");
  const problems = snapshot.problems.filter((item) => item.status === "active");
  const { latest: vital, comparison } = vitalContext(snapshot.vitals ?? []);
  const results = latestLaboratoryObservations(snapshot.observations ?? []);
  const monitoring = labs?.items.filter((item) => item.id.startsWith("monitoring:") && item.state !== "complete") ?? [];
  const previous = brief.previousVisit;
  const changeRows = (changes: typeof brief.sinceLastVisit) => <ul>{changes.map((item) =>
    <li key={item.id}><span>{item.text}</span><small>{formatClinicalDate(item.date)}</small></li>)}</ul>;

  return <div className={styles.context} data-clinical-patient={patientId}>
    <details open>
      <summary>Since Last Visit <span>{brief.sinceLastVisit.length}</span></summary>
      <p className={styles.caption}>{previous ? `Since signed visit ${formatClinicalDate(previous.date)}; later calendar dates only.` : "No prior signed encounter to compare."}</p>
      {previous && (brief.sinceLastVisit.length ? <>
        {changeRows(brief.sinceLastVisit.slice(0, 3))}
        {brief.sinceLastVisit.length > 3 && <details><summary>Show {brief.sinceLastVisit.length - 3} more changes</summary>{changeRows(brief.sinceLastVisit.slice(3))}</details>}
      </> : <p>No later structured changes on record.</p>)}
    </details>
    <details>
      <summary>Previous Assessment / Plan</summary>
      {previous ? <>
        <small>{formatClinicalDate(previous.date)} · Signed</small>
        <p><strong>Assessment</strong><br />{previous.assessment || "Not recorded."}</p>
        <p><strong>Plan</strong><br />{previous.plan || "Not recorded."}</p>
        {previous.followUp && <p><strong>Follow-up / next-visit focus</strong><br />{previous.followUp}</p>}
        <p className={styles.caption}>Historical reference. Nothing is copied into today’s note automatically.</p>
        <button type="button" onClick={onOpenPrior}>Inspect signed encounter</button>
      </> : <p>No signed encounter on record.</p>}
    </details>
    <details>
      <summary>Current Medications <span>{medications.length}</span></summary>
      {medications.length ? <ul>{medications.map((item) => <li key={item.id}>{item.display_text || item.medication_name}{item.indication && <small>{item.indication}</small>}</li>)}</ul> : <p>No active medications on record.</p>}
      {onPrescribe && <button type="button" onClick={onPrescribe}>Prescribe</button>}
      {onManageMedications && <button type="button" onClick={onManageMedications}>Manage medications</button>}
    </details>
    <details>
      <summary>Measures <span>{brief.trajectories.length}</span></summary>
      {brief.trajectories.length ? <ul>{brief.trajectories.map((trajectory) => {
        const latest = trajectory.scores.at(-1)!;
        const prior = trajectory.scores.at(-2);
        const delta = prior ? latest.score - prior.score : null;
        return <li key={trajectory.instrument}><strong>{trajectory.label} {latest.score}/{latest.maxScore}</strong>
          <small>{formatClinicalDate(latest.date)} · {trajectory.latestSeverity}</small>
          <span>{delta == null ? "Single score on record" : `${delta > 0 ? "+" : ""}${delta} from ${prior!.score} (${formatClinicalDate(prior!.date)})`}</span>
        </li>;
      })}</ul> : <p>No PHQ-9, GAD-7 or ASRS scores on record.</p>}
    </details>
    <details>
      <summary>Vitals</summary>
      {vital ? <>
        <p>{[vital.bpText ? `BP ${vital.bpText}` : null, vital.heartRate != null ? `HR ${vital.heartRate} bpm` : null,
          vital.weightLbs != null ? `Weight ${vital.weightLbs} lb` : null, vital.bmi != null ? `BMI ${vital.bmi}` : null].filter(Boolean).join(" · ") || "Measurement on record"}</p>
        <small>{formatClinicalDate(vital.recordedAt)}</small>
        {comparison && <p>{comparison}</p>}
        {vital.flags.map((flag) => <p key={flag.type}><strong>{flag.label}</strong><br />{flag.detail}</p>)}
      </> : <p>No vitals on record.</p>}
    </details>
    <details>
      <summary>Labs / Monitoring {monitoring.length > 0 && <span>{monitoring.length} due / upcoming</span>}</summary>
      {labs?.error ? <p role="status">Labs / monitoring context unavailable: {labs.error}</p> : labs?.loading || !labs ? <p role="status">Checking monitoring…</p>
        : monitoring.length ? <ul>{monitoring.map((item) => <li key={item.id}><strong>{item.label}</strong><span>{item.detail}</span>
          {item.state === "open" && item.action?.kind === "open-lab-composer" && onOrderLabs && <button type="button" onClick={() => onOrderLabs(item.action?.kind === "open-lab-composer" ? item.action.prefill : undefined)}>Order monitoring labs</button>}
        </li>)}</ul> : <p>No due or upcoming monitoring in the current policy projection.</p>}
      {results.length ? <ul>{results.slice(0, 3).map((item) => <li key={item.id}><strong>{item.test_name}</strong>
        <span>{formatLabValue(item.value_text, item.unit)} {item.interpretation && `· ${item.interpretation}`}</span><small>{formatClinicalDate(item.effective_at)} · {item.status}</small>
      </li>)}</ul> : <p>No laboratory results on record.</p>}
      {results.length > 3 && <details><summary>More recent results ({results.length - 3})</summary><ul>{results.slice(3).map((item) => <li key={item.id}>{item.test_name} · {formatLabValue(item.value_text, item.unit)}<small>{formatClinicalDate(item.effective_at)} · {item.interpretation} · {item.status}</small></li>)}</ul></details>}
      {onOrderLabs && <button type="button" onClick={() => onOrderLabs()}>Order labs</button>}
      {onReviewLabs && <button type="button" onClick={onReviewLabs}>Review lab chart</button>}
    </details>
    <details>
      <summary>Diagnoses / Problems <span>{problems.length}</span></summary>
      {problems.length ? <ul>{problems.map((item) => <li key={item.id}>{item.display_text}{item.code && <small>{item.code}</small>}</li>)}</ul> : <p>No active problems on record.</p>}
    </details>
    <button type="button" onClick={onRefresh}>Refresh clinical context</button>
  </div>;
}
