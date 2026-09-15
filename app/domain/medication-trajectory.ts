import type { ClinicalRecordVersion } from "./clinical-records";

/**
 * What a medication record's history actually says (roadmap P3-C).
 *
 * Every write to `patient_medications` stamps a full snapshot into
 * `record_versions`, so a medication's dose trajectory has been recorded all
 * along. It was just never readable: the history panel rendered
 * `v3 · update · Dr. Taylor · 14 Sep` and, from the snapshot, only the status —
 * so three dose titrations displayed as three identical lines saying "active".
 * The last clinician task P3-C names is "review prior dose trajectory", and it
 * could not be done from any surface.
 *
 * This turns consecutive snapshots into the thing a clinician is actually asking
 * for: what changed, when, and who changed it. It is pure over data the caller
 * already has, so the trajectory can be asserted without a browser.
 *
 * Two rules it holds to:
 *
 * 1. **Only recorded facts.** A field is reported as changed when two snapshots
 *    disagree about it. Nothing is inferred from the gap between them, and a
 *    version whose snapshot is missing or unreadable is reported as unreadable
 *    rather than skipped — a silent omission in a dose history is the kind of
 *    absence that reads as "no change".
 * 2. **A version that changed nothing tracked says so.** Display text and
 *    provenance move without the prescription changing; rendering those as blank
 *    rows would suggest a titration that did not happen.
 */

/** The fields whose change is clinically meaningful, in the order a reader wants them. */
export const TRACKED_MEDICATION_FIELDS = [
  { field: "medication_name", label: "Medication" },
  { field: "strength", label: "Strength" },
  { field: "dose", label: "Dose" },
  { field: "route", label: "Route" },
  { field: "frequency", label: "Frequency" },
  { field: "indication", label: "Indication" },
  { field: "status", label: "Status" },
  { field: "start_date", label: "Started" },
  { field: "end_date", label: "Stopped" },
  { field: "prescriber", label: "Prescriber" },
] as const;

export type MedicationFieldChange = {
  field: string;
  label: string;
  /** Null means the field held nothing at that point, not that it is unknown. */
  from: string | null;
  to: string | null;
};

export type MedicationTrajectoryEntry = {
  versionNumber: number;
  operation: string;
  actorName: string;
  createdAt: string;
  /** True for the version that created the record; its changes are its initial values. */
  initial: boolean;
  changes: MedicationFieldChange[];
  /** Set when the snapshot could not be read, so the entry is not silently empty. */
  unreadable: boolean;
};

function readField(snapshot: unknown, field: string): string | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const value = (snapshot as Record<string, unknown>)[field];
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function isReadable(snapshot: unknown): boolean {
  return Boolean(snapshot) && typeof snapshot === "object" && Object.keys(snapshot as object).length > 0;
}

/**
 * Newest first, each entry describing what that write changed.
 *
 * `versions` is expected in the order the repository returns them — descending by
 * version number — but the order is re-established here rather than assumed,
 * because a caller that sorted them the other way would otherwise produce a
 * trajectory that reads backwards while looking entirely plausible.
 */
export function summarizeMedicationTrajectory(
  versions: readonly ClinicalRecordVersion[],
): MedicationTrajectoryEntry[] {
  const ordered = [...versions].sort((a, b) => b.version_number - a.version_number);

  return ordered.map((version, index) => {
    // The next entry in a descending list is the state this one changed *from*.
    const previous = ordered[index + 1];
    const initial = !previous;
    const readable = isReadable(version.snapshot);

    if (!readable) {
      return {
        versionNumber: version.version_number,
        operation: version.operation,
        actorName: version.actor_name,
        createdAt: version.created_at,
        initial,
        changes: [],
        unreadable: true,
      };
    }

    const changes: MedicationFieldChange[] = [];
    for (const { field, label } of TRACKED_MEDICATION_FIELDS) {
      const to = readField(version.snapshot, field);
      const from = initial ? null : readField(previous.snapshot, field);

      if (initial) {
        // A creation has no "from"; its tracked values are what it started as.
        if (to !== null) changes.push({ field, label, from: null, to });
        continue;
      }
      if (from !== to) changes.push({ field, label, from, to });
    }

    return {
      versionNumber: version.version_number,
      operation: version.operation,
      actorName: version.actor_name,
      createdAt: version.created_at,
      initial,
      changes,
      unreadable: false,
    };
  });
}

/**
 * The dose line on its own, oldest first.
 *
 * "Has this dose been up and down before?" is a different question from "what
 * happened on the 14th", and answering it by reading a change list backwards is
 * work the reader should not have to do. Only writes that actually moved the dose
 * appear, so a record edited ten times for other reasons still shows the two
 * titrations it had.
 */
export type DoseTrajectoryPoint = {
  versionNumber: number;
  at: string;
  dose: string | null;
  strength: string | null;
  actorName: string;
};

export function doseTrajectory(versions: readonly ClinicalRecordVersion[]): DoseTrajectoryPoint[] {
  const ascending = [...versions]
    .filter((version) => isReadable(version.snapshot))
    .sort((a, b) => a.version_number - b.version_number);

  const points: DoseTrajectoryPoint[] = [];
  for (const version of ascending) {
    const dose = readField(version.snapshot, "dose");
    const strength = readField(version.snapshot, "strength");
    const last = points[points.length - 1];
    if (last && last.dose === dose && last.strength === strength) continue;
    points.push({
      versionNumber: version.version_number,
      at: version.created_at,
      dose,
      strength,
      actorName: version.actor_name,
    });
  }

  // A single point is a medication that never changed dose. That is a fact about
  // the record, and the caller decides whether it is worth drawing; it is not
  // suppressed here, because "no titrations" and "no data" must stay distinct.
  return points;
}
