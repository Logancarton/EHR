"use client";

import type { MedicationPrescriptionReview } from "../../domain/medication-prescription-intent";
import type { PrescriptionTruthSelection } from "../../lib/medication-prescription-intent-api";
import Button from "../ui/Button";

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

  // The patient already has this medication active. That is either the intended
  // continuation/refill or an unintended duplicate; only the clinician knows,
  // so it is stated before anything else and nothing is offered to the chart.
  const alreadyOnChart = impact.kind === "no-change" && Boolean(impact.medicationId);

  return (
    <section className="prescription-intent-review" aria-label="Prescription intent review">
      {alreadyOnChart && (
        <div className="prescription-existing-medication" role="note" data-testid="rx-existing-medication">
          <strong>Already on the medication list: {impact.medicationDisplay}</strong>
          <span>Possible duplicate or continuation. Confirm this is an intended refill or continuation before authorizing.</span>
        </div>
      )}
      <dl className="prescription-review-grid">
        <div>
          <dt>Current medication truth</dt>
          <dd>{impact.medicationDisplay || "No single authoritative medication selected"}</dd>
        </div>
        <div>
          <dt>Prescription intent</dt>
          <dd>
            {[review.intent.medicationName, review.intent.strength, review.intent.frequency]
              .filter(Boolean)
              .join(" · ")}
          </dd>
        </div>
        <div className="prescription-review-implication">
          <dt>Potential chart implication</dt>
          <dd>{impact.summary}</dd>
        </div>
      </dl>

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
          <Button
            variant="secondary"
            size="sm"
            pressed={selection?.operation === "add"}
            onClick={() => onSelectionChange(selection?.operation === "add" ? undefined : { operation: "add" })}
          >
            {selection?.operation === "add" ? "Add to medication list after authorization" : "Also add to medication list"}
          </Button>
        )}
        {canOfferUpdate && impact.medicationId && (
          <Button
            variant="secondary"
            size="sm"
            pressed={selection?.operation === "update"}
            onClick={() =>
              onSelectionChange(
                selection?.operation === "update"
                  ? undefined
                  : { operation: "update", medicationId: impact.medicationId! },
              )
            }
          >
            {selection?.operation === "update" ? "Update selected chart medication after authorization" : "Also update this chart medication"}
          </Button>
        )}
      </div>
    </section>
  );
}
