"use client";

import type { MedicationPrescriptionReview } from "../../domain/medication-prescription-intent";
import type { PrescriptionTruthSelection } from "../../lib/medication-prescription-intent-api";

export default function PrescriptionIntentReview({
  review,
  selection,
  onSelectionChange,
}: {
  review: MedicationPrescriptionReview;
  selection?: PrescriptionTruthSelection;
  onSelectionChange: (selection?: PrescriptionTruthSelection) => void;
}) {
  const impact = review.truthImpact;
  const canOfferAdd = impact.kind === "likely-new-medication";
  const canOfferUpdate = Boolean(
    impact.medicationId &&
      (impact.kind === "likely-dose-change" ||
        impact.kind === "likely-frequency-change" ||
        impact.kind === "likely-replacement"),
  );

  return (
    <div className="prescription-intent-review" aria-label="Prescription intent review">
      <div className="prescription-review-grid">
        <div>
          <small>Current medication truth</small>
          <strong>{impact.medicationDisplay || "No single authoritative medication selected"}</strong>
        </div>
        <div>
          <small>Prescription intent</small>
          <strong>
            {[review.intent.medicationName, review.intent.strength, review.intent.frequency]
              .filter(Boolean)
              .join(" · ")}
          </strong>
        </div>
        <div>
          <small>Potential chart implication</small>
          <strong>{impact.summary}</strong>
        </div>
      </div>

      {review.validationIssues.length > 0 && (
        <div className="prescription-validation-list">
          {review.validationIssues.map((issue) => (
            <div key={`${issue.code}-${issue.message}`} className={`validation-${issue.severity}`}>
              <strong>{issue.severity === "error" ? "Needs correction:" : "Review:"}</strong> {issue.message}
            </div>
          ))}
        </div>
      )}

      {impact.alternatives.length > 1 && (
        <div className="prescription-ambiguity-note">
          Multiple chart medications could match. No medication target has been selected automatically.
        </div>
      )}

      <div className="prescription-truth-choice">
        <span>Medication list remains unchanged unless you explicitly choose a chart action.</span>
        {canOfferAdd && (
          <button
            type="button"
            className={selection?.operation === "add" ? "active" : ""}
            onClick={() => onSelectionChange(selection?.operation === "add" ? undefined : { operation: "add" })}
          >
            {selection?.operation === "add" ? "Add to medication list after authorization" : "Also add to medication list"}
          </button>
        )}
        {canOfferUpdate && impact.medicationId && (
          <button
            type="button"
            className={selection?.operation === "update" ? "active" : ""}
            onClick={() =>
              onSelectionChange(
                selection?.operation === "update"
                  ? undefined
                  : { operation: "update", medicationId: impact.medicationId! },
              )
            }
          >
            {selection?.operation === "update" ? "Update selected chart medication after authorization" : "Also update this chart medication"}
          </button>
        )}
      </div>
    </div>
  );
}
