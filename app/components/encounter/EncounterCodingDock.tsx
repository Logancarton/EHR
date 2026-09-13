"use client";

import { type CodingRecommendation, type EvidenceClass } from "../../lib/encounter-engine";
import Icon from "../ui/Icon";

/**
 * How a satisfied goal was established.
 *
 * A 99214 built on referenced records and one built on reading the note text are
 * different claims, and the clinician is the one signing the difference. The class
 * is shown rather than folded away.
 */
const EVIDENCE_LABEL: Record<EvidenceClass, string> = {
  "action-derived": "From this visit's orders",
  "clinician-authored": "Linked by clinician",
  "ai-extracted": "Proposed from the note",
  inferred: "Read from note text",
};

const BASIS_LABEL: Record<CodingRecommendation["evidenceBasis"], string> = {
  structured: "Supported by clinical records",
  mixed: "Partly supported by clinical records",
  inferred: "Read from note text only",
};

export default function EncounterCodingDock({ codingRec }: { codingRec: CodingRecommendation }) {
  return (
    <footer className="coding-engine-dock" aria-label="Dynamic E/M Coding & Encounter Goals">
      <details className="encounter-coding-details">
        <summary>
          <span className="coding-summary-label">Documentation &amp; coding <span aria-hidden="true"><Icon name="expand_less" /></span></span>
          <span className="coding-summary-progress">{codingRec.goalsMetCount} of {codingRec.goalsTotalCount} items documented</span>
          <span className={`coding-evidence-basis basis-${codingRec.evidenceBasis}`}>
            {BASIS_LABEL[codingRec.evidenceBasis]}
          </span>
          <span className="coding-summary-code">Suggested {codingRec.primaryCode}{codingRec.addonCodes.map((code) => ` + ${code}`)}</span>
        </summary>
        <div className="coding-review-panel">
          <div className="coding-review-heading"><strong>Documentation review</strong><span>Confirm at signing</span></div>
          <div className="coding-review-goals">
            {codingRec.goals.map((goal) => (
              <details key={goal.id} className="coding-review-goal">
                <summary><span className={goal.met ? "goal-complete" : "goal-outstanding"}>{goal.met ? <Icon name="check" /> : "○"}</span>{goal.label}</summary>
                <p>{goal.detail}</p>
                <p>{goal.codeImpact}</p>
                {goal.evidence && (
                  <p className={`coding-goal-evidence evidence-${goal.evidence}`}>
                    {EVIDENCE_LABEL[goal.evidence]}
                    {goal.sourceRefs.length > 0 && (
                      <span className="coding-goal-sources"> · {goal.sourceRefs.length} record{goal.sourceRefs.length === 1 ? "" : "s"}</span>
                    )}
                  </p>
                )}
              </details>
            ))}
          </div>
          <p className="coding-review-rationale">{codingRec.mdmReasoning}</p>
          {codingRec.unconfirmedReferenceCount > 0 && (
            <p className="coding-review-pending">
              {codingRec.unconfirmedReferenceCount} proposed reference{codingRec.unconfirmedReferenceCount === 1 ? "" : "s"} awaiting confirmation. Proposals do not count toward this code until you confirm them at signing.
            </p>
          )}
          <p className="coding-review-note">Coding is a suggestion based on documented content. Review the supporting information before signing.</p>
        </div>
      </details>
    </footer>
  );
}
