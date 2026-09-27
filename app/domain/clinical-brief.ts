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

function latestAfter<T>(items: readonly T[], getDate: (item: T) => string, cutoff: string): T | null {
  return (
    items
      .filter((item) => {
        const date = calendarKey(getDate(item));
        return Boolean(date && cutoff && date > cutoff);
      })
      .sort((left, right) => calendarKey(getDate(right)).localeCompare(calendarKey(getDate(left))))[0] || null
  );
}

export function buildClinicalBrief({
  encounters,
  assessments,
  vitals,
  medications,
  observations,
}: {
  encounters: readonly PatientEncounterSummary[];
  assessments: readonly AssessmentRecord[];
  vitals: readonly VitalSignSummary[];
  medications: readonly MedicationRecord[];
  observations: readonly ObservationRecord[];
}): ClinicalBrief {
  const previousVisit =
    [...encounters]
      .filter((encounter) => encounter.status === "signed")
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
    const assessment = latestAfter(assessments, (item) => item.administeredAt, cutoff);
    if (assessment) {
      changes.push({
        id: `assessment-${assessment.id}`,
        date: calendarKey(assessment.administeredAt),
        text: `${instrumentLabel(assessment.instrument)} ${assessment.totalScore}/${assessment.maxScore} · ${assessment.severity}`,
      });
    }

    const vital = latestAfter(vitals, (item) => item.recordedAt, cutoff);
    if (vital) {
      const parts = [
        vital.bpText ? `BP ${vital.bpText}` : null,
        vital.heartRate != null ? `HR ${vital.heartRate}` : null,
        vital.weightLbs != null ? `Wt ${vital.weightLbs} lb` : null,
      ].filter(Boolean);
      changes.push({
        id: `vital-${vital.recordedAt}`,
        date: calendarKey(vital.recordedAt),
        text: `Vitals · ${parts.join(" · ") || "new measurement"}`,
      });
    }

    const medication = latestAfter(medications, (item) => item.updated_at, cutoff);
    if (medication) {
      changes.push({
        id: `medication-${medication.id}`,
        date: calendarKey(medication.updated_at),
        text: `Medication updated · ${compactText(medication.display_text || medication.medication_name, 90)}`,
      });
    }

    const lab = latestAfter(observations, (item) => item.effective_at, cutoff);
    if (lab) {
      const value = [lab.value_text, lab.unit].filter(Boolean).join(" ");
      changes.push({
        id: `lab-${lab.id}`,
        date: calendarKey(lab.effective_at),
        text: `${lab.test_name} · ${value || "new result"}${lab.interpretation ? ` · ${lab.interpretation}` : ""}`,
      });
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
      .sort((left, right) => right.date.localeCompare(left.date))
      .slice(0, 3),
    trajectories,
  };
}
