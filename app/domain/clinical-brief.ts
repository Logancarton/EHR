import type {
  MedicationRecord,
  ObservationRecord,
  PatientEncounterSummary,
} from "./clinical-records";
import type {
  AssessmentInstrumentType,
  AssessmentRecord,
  VitalSignSummary,
} from "./clinical-measurements";

export type ClinicalBriefTrajectory = {
  instrument: AssessmentInstrumentType;
  label: string;
  scores: Array<{ score: number; maxScore: number; date: string }>;
  direction: "up" | "down" | "flat" | "single";
  latestSeverity: string;
};

export type ClinicalBriefChange = {
  id: string;
  date: string;
  text: string;
};

export type ClinicalBrief = {
  previousVisit: PatientEncounterSummary | null;
  carryForward: string | null;
  carryForwardSource: "follow-up" | "plan" | null;
  sinceLastVisit: ClinicalBriefChange[];
  trajectories: ClinicalBriefTrajectory[];
};

const TRAJECTORY_ORDER: AssessmentInstrumentType[] = ["phq-9", "gad-7", "asrs-v1.1"];

function calendarKey(value: string | null | undefined): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  const iso = value.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  return iso || "";
}

function compactText(value: string | null | undefined, maxLength = 220): string | null {
  const compact = (value || "").replace(/\s+/g, " ").trim();
  if (!compact) return null;
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength - 1).trimEnd()}…`;
}

function instrumentLabel(instrument: AssessmentInstrumentType): string {
  if (instrument === "phq-9") return "PHQ-9";
  if (instrument === "gad-7") return "GAD-7";
  if (instrument === "asrs-v1.1") return "ASRS";
  return "C-SSRS";
}

/** Snapshot dates are calendar dates in the source encounter projection. Same-day
 * events cannot be ordered reliably against a visit time, so are not asserted as later. */
function after(date: string, cutoff: string): boolean {
  const key = calendarKey(date);
  return Boolean(key && cutoff && key > cutoff);
}

export function vitalContext(vitals: readonly VitalSignSummary[]): { latest: VitalSignSummary | null; comparison: string | null } {
  const ordered = [...vitals].filter((item) => calendarKey(item.recordedAt))
    .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  const latest = ordered.at(-1) ?? null;
  const prior = ordered.at(-2);
  if (!latest || !prior) return { latest, comparison: null };
  const changes = [
    latest.systolic != null && prior.systolic != null ? `systolic ${signedDelta(latest.systolic - prior.systolic)} mmHg` : null,
    latest.diastolic != null && prior.diastolic != null ? `diastolic ${signedDelta(latest.diastolic - prior.diastolic)} mmHg` : null,
    latest.heartRate != null && prior.heartRate != null ? `HR ${signedDelta(latest.heartRate - prior.heartRate)} bpm` : null,
    latest.weightLbs != null && prior.weightLbs != null ? `weight ${signedDelta(latest.weightLbs - prior.weightLbs)} lb` : null,
  ].filter(Boolean);
  return { latest, comparison: changes.length ? `${changes.join(" · ")} vs ${calendarKey(prior.recordedAt)}` : null };
}

function signedDelta(value: number): string {
  return `${value > 0 ? "+" : ""}${Math.round(value * 10) / 10}`;
}

export function buildClinicalBrief({
  patientId,
  excludeEncounterId,
  encounters,
  assessments,
  vitals,
  medications,
  observations,
}: {
  patientId: string;
  excludeEncounterId?: string;
  encounters: readonly PatientEncounterSummary[];
  assessments: readonly AssessmentRecord[];
  vitals: readonly VitalSignSummary[];
  medications: readonly MedicationRecord[];
  observations: readonly ObservationRecord[];
}): ClinicalBrief {
  if (!patientId.trim()) throw new Error("Clinical brief requires patient scope.");
  // Additional protection for callers outside the shared snapshot lifecycle.
  encounters = encounters.filter((item) => item.patientId === patientId);
  assessments = assessments.filter((item) => item.patientId == null || item.patientId === patientId);
  medications = medications.filter((item) => item.patient_id === patientId);
  observations = observations.filter((item) => (item.patient_id === patientId)
    && item.category === "laboratory" && !["entered-in-error", "cancelled"].includes(item.status));
  const previousVisit =
    [...encounters]
      .filter((encounter) => encounter.status === "signed" && encounter.id !== excludeEncounterId)
      .sort(
        (left, right) =>
          calendarKey(right.date).localeCompare(calendarKey(left.date)) ||
          String(right.signedAt || right.updatedAt).localeCompare(String(left.signedAt || left.updatedAt)),
      )[0] || null;

  const followUp = compactText(previousVisit?.followUp);
  const plan = compactText(previousVisit?.plan);
  const carryForward = followUp || plan;
  const carryForwardSource = followUp ? "follow-up" : plan ? "plan" : null;
  const cutoff = calendarKey(previousVisit?.date);

  const changes: ClinicalBriefChange[] = [];
  if (previousVisit && cutoff) {
    for (const assessment of assessments.filter((item) => after(item.administeredAt, cutoff))) {
      const prior = assessments.filter((item) => item.instrument === assessment.instrument && item.administeredAt < assessment.administeredAt)
        .sort((a, b) => b.administeredAt.localeCompare(a.administeredAt))[0];
      changes.push({ id: `assessment-${assessment.id}`, date: calendarKey(assessment.administeredAt),
        text: `${instrumentLabel(assessment.instrument)} ${assessment.totalScore}/${assessment.maxScore} · ${assessment.severity}${prior ? ` · ${signedDelta(assessment.totalScore - prior.totalScore)} from ${prior.totalScore}` : ""}` });
    }
    const { latest: vital, comparison } = vitalContext(vitals);
    if (vital && after(vital.recordedAt, cutoff)) {
      const parts = [vital.bpText ? `BP ${vital.bpText}` : null,
        vital.heartRate != null ? `HR ${vital.heartRate}` : null,
        vital.weightLbs != null ? `Wt ${vital.weightLbs} lb` : null].filter(Boolean);
      changes.push({ id: `vital-${vital.recordedAt}`, date: calendarKey(vital.recordedAt),
        text: `Vitals · ${parts.join(" · ") || "new measurement"}${comparison ? ` · ${comparison}` : ""}` });
    }
    for (const medication of medications.filter((item) => item.status !== "entered-in-error" && after(item.updated_at, cutoff))) {
      // Current rows prove an update and its present status, not the old dose.
      changes.push({ id: `medication-${medication.id}`, date: calendarKey(medication.updated_at),
        text: `Medication updated (${medication.status}) · ${compactText(medication.display_text || medication.medication_name, 90)}` });
    }
    for (const lab of observations.filter((item) => after(item.effective_at, cutoff))) {
      const value = [lab.value_text, lab.unit].filter(Boolean).join(" ");
      changes.push({ id: `lab-${lab.id}`, date: calendarKey(lab.effective_at),
        text: `${lab.test_name} · ${value || "new result"}${lab.interpretation ? ` · ${lab.interpretation}` : ""}` });
    }
  }

  const trajectories = TRAJECTORY_ORDER.flatMap((instrument) => {
    const records = assessments
      .filter((assessment) => assessment.instrument === instrument)
      .sort((left, right) => left.administeredAt.localeCompare(right.administeredAt))
      .slice(-3);
    if (records.length === 0) return [];

    const latest = records[records.length - 1];
    const prior = records.length > 1 ? records[records.length - 2] : null;
    const direction =
      !prior
        ? "single"
        : latest.totalScore > prior.totalScore
          ? "up"
          : latest.totalScore < prior.totalScore
            ? "down"
            : "flat";

    return [
      {
        instrument,
        label: instrumentLabel(instrument),
        scores: records.map((record) => ({
          score: record.totalScore,
          maxScore: record.maxScore,
          date: calendarKey(record.administeredAt),
        })),
        direction,
        latestSeverity: latest.severity,
      } satisfies ClinicalBriefTrajectory,
    ];
  });

  return {
    previousVisit,
    carryForward,
    carryForwardSource,
    sinceLastVisit: changes
      .filter((change) => Boolean(change.date))
      .sort((left, right) => right.date.localeCompare(left.date)),
    trajectories,
  };
}
