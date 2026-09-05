"use client";

import { phqQuestions } from "../../domain/clinical-query";

export default function CalculatorPanel({
  answers,
  onAnswer,
  onInsertToNote,
  onClose,
}: {
  answers: Record<number, number>;
  onAnswer: (index: number, score: number) => void;
  onInsertToNote: (summary: string) => void;
  onClose: () => void;
}) {
  const totalScore = Object.values(answers).reduce((sum, val) => sum + val, 0);
  let severity = "Minimal depression";
  if (totalScore >= 20) severity = "Severe depression";
  else if (totalScore >= 15) severity = "Moderately severe depression";
  else if (totalScore >= 10) severity = "Moderate depression";
  else if (totalScore >= 5) severity = "Mild depression";

  const summary = `PHQ-9 Score: ${totalScore}/27 (${severity})`;

  return (
    <aside className="companion-panel">
      <div className="companion-panel-header">
        <div>
          <span className="spark" style={{ background: "#ceead6", color: "#137333" }}>🧮</span>
          <div>
            <strong>Clinical Calculator</strong>
            <small>PHQ-9 Depression Severity Scale</small>
          </div>
        </div>
        <button type="button" className="companion-close-btn" aria-label="Close" onClick={onClose}>
          ✕
        </button>
      </div>

      <div className="calc-container">
        <div className="calc-score-badge">
          <div>
            <strong style={{ fontSize: "20px" }}>{totalScore} / 27</strong>
            <div style={{ fontSize: "11px", marginTop: "2px", opacity: 0.9 }}>{severity}</div>
          </div>
          <button
            type="button"
            className="note-copy-btn"
            style={{ padding: "6px 12px" }}
            onClick={() => onInsertToNote(summary)}
          >
            📋 Insert score
          </button>
        </div>

        {phqQuestions.map((question, index) => (
          <div key={index} className="calc-question">
            <p>{question}</p>
            <div className="calc-options">
              {[
                { label: "0 (None)", val: 0 },
                { label: "1 (Few)", val: 1 },
                { label: "2 (> Half)", val: 2 },
                { label: "3 (Daily)", val: 3 },
              ].map((opt) => (
                <button
                  key={opt.val}
                  type="button"
                  className={answers[index] === opt.val ? "selected" : ""}
                  onClick={() => onAnswer(index, opt.val)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
