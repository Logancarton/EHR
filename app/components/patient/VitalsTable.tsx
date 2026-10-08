"use client";

import type { VitalSignSummary } from "../../domain/clinical-measurements";
import { formatClinicalDateTime } from "../../lib/clinical-date";

/**
 * Every recorded vitals reading as a table, newest first, so trends read
 * across a row of columns instead of from separate timeline cards. A blank
 * cell means the measurement was not taken at that reading.
 */
export default function VitalsTable({ vitals }: { vitals: readonly VitalSignSummary[] }) {
  if (vitals.length === 0) {
    return <p className="vitals-table-empty">No vitals have been recorded for this patient.</p>;
  }
  const rows = [...vitals].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
  const show = (value: number | null | undefined, unit = "") => (value === null || value === undefined ? "" : `${value}${unit}`);
  const height = (inches: number | null | undefined) =>
    inches ? `${Math.floor(inches / 12)}′ ${Math.round((inches % 12) * 10) / 10}″` : "";
  return (
    <div className="vitals-table-wrap">
      <table className="vitals-table">
        <thead>
          <tr>
            <th scope="col">Recorded</th>
            <th scope="col">BP (mmHg)</th>
            <th scope="col">HR (bpm)</th>
            <th scope="col">RR (/min)</th>
            <th scope="col">Temp (°F)</th>
            <th scope="col">SpO₂ (%)</th>
            <th scope="col">Weight (lb)</th>
            <th scope="col">Height</th>
            <th scope="col">BMI</th>
            <th scope="col">Comments</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((reading) => {
            const flagged = new Set(reading.flags.map((flag) => flag.type));
            return (
              <tr key={reading.recordedAt}>
                <th scope="row">{formatClinicalDateTime(reading.recordedAt)}</th>
                <td className={flagged.has("blood_pressure") ? "vitals-flag" : undefined}>
                  {reading.bpText || (reading.systolic && reading.diastolic ? `${reading.systolic}/${reading.diastolic}` : "")}
                </td>
                <td className={flagged.has("heart_rate") ? "vitals-flag" : undefined}>{show(reading.heartRate)}</td>
                <td>{show(reading.respiratoryRate)}</td>
                <td>{show(reading.temperatureF)}</td>
                <td>{show(reading.oxygenSaturation)}</td>
                <td className={flagged.has("weight_change") ? "vitals-flag" : undefined}>{show(reading.weightLbs)}</td>
                <td>{height(reading.heightIn)}</td>
                <td className={flagged.has("bmi") ? "vitals-flag" : undefined}>
                  {reading.bmi ? `${reading.bmi}${reading.bmiCategory ? ` · ${reading.bmiCategory}` : ""}` : ""}
                </td>
                <td>{reading.notes || ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="vitals-table-note">Highlighted cells were flagged when recorded. Blank cells were not measured.</p>
    </div>
  );
}
