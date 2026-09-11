"use client";

import { type CodingRecommendation } from "../../lib/encounter-engine";
import Icon from "../ui/Icon";

export default function EncounterCodingDock({ codingRec }: { codingRec: CodingRecommendation }) {
  return (
    <footer className="coding-engine-dock" aria-label="Dynamic E/M Coding & Encounter Goals">
      <details className="encounter-coding-details">
        <summary>
          <span className="coding-summary-label">Documentation &amp; coding <span aria-hidden="true"><Icon name="expand_less" /></span></span>
          <span className="coding-summary-progress">{codingRec.goalsMetCount} of {codingRec.goalsTotalCount} items documented</span>
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
              </details>
            ))}
          </div>
          <p className="coding-review-rationale">{codingRec.mdmReasoning}</p>
          <p className="coding-review-note">Coding is a suggestion based on documented content. Review the supporting information before signing.</p>
        </div>
      </details>
    </footer>
  );
}
