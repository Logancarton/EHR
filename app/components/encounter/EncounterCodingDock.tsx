"use client";

import { type CodingRecommendation } from "../../lib/encounter-engine";

export default function EncounterCodingDock({
  codingRec,
}: {
  codingRec: CodingRecommendation;
}) {
  return (
    <footer className="coding-engine-dock" aria-label="Dynamic E/M Coding & Encounter Goals">
      {/* Left Half: 6 Encounter Goals Checklist */}
      <div className="dock-goals-section">
        <div className="dock-goals-header">
          <strong>APPOINTMENT GOALS CHECKLIST</strong>
          <span className="goals-count-badge">
            {codingRec.goalsMetCount} / {codingRec.goalsTotalCount} Met ({Math.round((codingRec.goalsMetCount / codingRec.goalsTotalCount) * 100)}%)
          </span>
        </div>

        <div className="goals-chips-row">
          {codingRec.goals.map((goal) => (
            <div
              key={goal.id}
              className={`goal-chip ${goal.met ? "is-met" : "is-pending"}`}
              title={`${goal.detail} · ${goal.codeImpact}`}
            >
              <span className="goal-check-icon">{goal.met ? "✓" : "○"}</span>
              <span className="goal-label">{goal.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Right Half: Dynamic E/M Code Progression Engine */}
      <div className="dock-coding-section">
        <div className="coding-stepper-row">
          <span className="coding-stepper-label">DYNAMIC E/M PROGRESSION:</span>
          <div className="stepper-bar">
            <span className={`stepper-node ${codingRec.primaryCode === "99212" ? "active" : "passed"}`}>
              99212
            </span>
            <span className="stepper-line" />
            <span className={`stepper-node ${codingRec.primaryCode === "99213" ? "active" : codingRec.primaryCode === "99214" || codingRec.primaryCode === "99215" ? "passed" : ""}`}>
              99213
            </span>
            <span className="stepper-line" />
            <span className={`stepper-node ${codingRec.primaryCode === "99214" ? "active glow" : codingRec.primaryCode === "99215" ? "passed" : ""}`}>
              99214
            </span>
            <span className="stepper-line" />
            <span className={`stepper-node ${codingRec.primaryCode === "99215" ? "active glow" : ""}`}>
              99215
            </span>
          </div>
        </div>

        <div className="coding-qualified-banner">
          <div className="active-code-pill">
            <strong>{codingRec.primaryCode}</strong>
            {codingRec.addonCodes.map((c) => (
              <span key={c} className="addon-pill">{c}</span>
            ))}
          </div>
          <div className="coding-explanation-text">
            <div className="rationale-line">{codingRec.mdmReasoning}</div>
            <small className="next-step-hint">{codingRec.nextStepRecommendation}</small>
          </div>
        </div>
      </div>
    </footer>
  );
}
