"use client";

import { useState } from "react";
import type { EncounterState } from "../../lib/encounter-engine";
import {
  guidanceTargets,
  sectionCoverage,
  coverageLabels,
  type ProviderGuidance,
  type GuidanceTarget,
  type GuidanceKind,
} from "../../domain/live-encounter";
import type { OmniboxEvidenceReference } from "../../domain/omnibox";
import { omniboxPlanFailureMessage, requestOmniboxPlan } from "../../lib/omnibox-plan-client";

export default function EncounterCopilot({
  patientId,
  draft,
  live,
  micListening,
  medicationFocus,
  locked,
  onGuide,
  onAttest,
  onStart,
  onStop,
  onCapture,
}: {
  patientId: string;
  draft: EncounterState;
  live: boolean;
  micListening: boolean;
  medicationFocus: boolean;
  locked: boolean;
  onGuide: (entry: ProviderGuidance) => void;
  onAttest: (target: GuidanceTarget, explicitSafety: boolean) => void;
  onStart: () => void;
  onStop: () => void;
  onCapture: () => void;
}) {
  const [kind, setKind] = useState<GuidanceKind>("correction");
  const [target, setTarget] = useState<GuidanceTarget>("mse.moodAffect");
  const [text, setText] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const [safetyAssessed, setSafetyAssessed] = useState(false);
  const [guidanceMode, setGuidanceMode] = useState("Light");
  const [dismissedQuestion, setDismissedQuestion] = useState(false);
  const [aiBusy, setAiBusy] = useState<string | null>(null);
  const [aiError, setAiError] = useState("");
  const [aiResult, setAiResult] = useState<{
    label: string;
    answer: string;
    evidence: OmniboxEvidenceReference[];
    bounded: boolean;
  } | null>(null);
  const coverage = sectionCoverage(draft, target);

  async function runClinicalAssist(label: string, query: string) {
    setAiBusy(label);
    setAiError("");
    setAiResult(null);
    try {
      const plan = await requestOmniboxPlan({
        query,
        activePatientId: patientId,
        activeSurface: "encounter",
      });
      if (plan.patient.resolved?.id !== patientId) {
        throw new Error("Clinical AI did not preserve the active patient binding.");
      }
      if (!plan.answer) {
        setAiError(
          plan.clarification?.message ||
            "Clinical AI could not produce a grounded read-only answer for this request.",
        );
        return;
      }
      setAiResult({
        label,
        answer: plan.answer,
        evidence: plan.evidence.slice(0, 6),
        bounded: Boolean(plan.context?.isTruncated),
      });
    } catch (error) {
      setAiError(omniboxPlanFailureMessage(error));
    } finally {
      setAiBusy(null);
    }
  }
  const relevantCoverage: GuidanceTarget[] = [
    "chiefComplaint",
    "intervalHistory",
    ...(medicationFocus ? (["treatmentResponse", "sideEffects"] as const) : []),
    "mse.moodAffect",
    "riskAssessment",
    "assessment",
    "plan",
  ];
  const observation = (value: string) =>
    onGuide({
      id: crypto.randomUUID(),
      kind: "observation",
      target,
      text: value,
      createdAt: new Date().toISOString(),
      needsClarification: false,
    });

  return (
    <section className="encounter-copilot" aria-label="Provider copilot">
      <h3>Provider Copilot</h3>
      <p>
        {live
          ? "Guide the live draft. Prose is read-only during capture."
          : "Final-review assistance. Edit the document directly."}
      </p>
      <div className="copilot-ai-assist" aria-label="Chart-aware AI">
        <div>
          <strong>Chart-aware AI</strong>
          <small>Read-only answers use the same patient-bound planner and source provenance as the global omnibox.</small>
        </div>
        <div className="copilot-actions" role="group" aria-label="Chart AI actions">
          <button
            type="button"
            disabled={Boolean(aiBusy)}
            onClick={() => void runClinicalAssist("Chart recap", "Summarize this patient chart.")}
          >
            {aiBusy === "Chart recap" ? "Reading chart…" : "Chart recap"}
          </button>
          <button
            type="button"
            disabled={Boolean(aiBusy)}
            onClick={() => void runClinicalAssist("Since last visit", "What changed since the last visit?")}
          >
            {aiBusy === "Since last visit" ? "Comparing…" : "Since last visit"}
          </button>
          <button
            type="button"
            disabled={Boolean(aiBusy)}
            onClick={() => void runClinicalAssist("Medication review", "What medications is this patient taking?")}
          >
            {aiBusy === "Medication review" ? "Reviewing…" : "Medication review"}
          </button>
        </div>
        {aiError ? <p role="alert">{aiError}</p> : null}
        {aiResult ? (
          <div className="copilot-ai-result" aria-live="polite">
            <strong>{aiResult.label}</strong>
            <p>{aiResult.answer}</p>
            {aiResult.evidence.length ? (
              <details>
                <summary>Sources · {aiResult.evidence.length}</summary>
                <ul>
                  {aiResult.evidence.map((item) => (
                    <li key={`${item.sourceRef}:${item.label}`}>
                      <strong>{item.label}</strong>
                      <small>{item.sourceRef}</small>
                      {item.excerpt ? <span>{item.excerpt}</span> : null}
                    </li>
                  ))}
                </ul>
              </details>
            ) : (
              <small>No citeable source rows were returned with this answer.</small>
            )}
            <small>
              Read only · no clinical mutation{aiResult.bounded ? " · context was token-bounded" : ""}
            </small>
          </div>
        ) : null}
      </div>
      <div className="copilot-actions">
        <button
          type="button"
          disabled={locked}
          onClick={live ? onStop : onStart}
        >
          {live ? "Stop capture · Review" : "Start synthetic capture"}
        </button>
        <button
          type="button"
          disabled={locked || (live && !micListening)}
          onClick={onCapture}
        >
          {" "}
          {micListening ? "Stop microphone" : "Capture microphone"}
        </button>
      </div>
      <small>
        Deterministic transcript draft · synthetic demo or browser speech
        recognition. No production ambient service.
      </small>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!text.trim()) return;
          onGuide({
            id: crypto.randomUUID(),
            kind,
            target,
            text: text.trim(),
            createdAt: new Date().toISOString(),
            needsClarification: uncertain || kind === "clinical-thought",
          });
          setText("");
          setUncertain(false);
        }}
      >
        <label>
          Guidance type
          <select
            aria-label="Guidance type"
            value={kind}
            disabled={locked}
            onChange={(event) => setKind(event.target.value as GuidanceKind)}
          >
            <option value="correction">Correction</option>
            <option value="observation">Observation</option>
            <option value="clinical-thought">Clinical Thought</option>
          </select>
        </label>
        <label>
          Note section
          <select
            aria-label="Guidance section"
            value={target}
            disabled={locked}
            onChange={(event) => {
              setTarget(event.target.value as GuidanceTarget);
              setSafetyAssessed(false);
            }}
          >
            {Object.entries(guidanceTargets).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Guide Clinical Bond
          <textarea
            aria-label="Guide Clinical Bond"
            rows={3}
            value={text}
            maxLength={20000}
            disabled={locked}
            onChange={(event) => setText(event.target.value)}
            placeholder={
              kind === "clinical-thought"
                ? "Consideration only; never an established diagnosis."
                : "Your wording for this section…"
            }
          />
        </label>
        <label className="copilot-check">
          <input
            type="checkbox"
            checked={uncertain}
            disabled={locked}
            onChange={(event) => setUncertain(event.target.checked)}
          />{" "}
          Withhold this section until clarified
        </label>
        <small>
          {kind === "correction"
            ? "Replaces this section's interpretation; prior wording and transcript are retained. Withhold keeps this guidance out of prose."
            : kind === "observation"
              ? "Adds your observed finding to the selected section."
              : "Retained for review; excluded from note prose and diagnosis truth."}
        </small>
        <button type="submit" disabled={locked || !text.trim()}>
          Submit guidance
        </button>
      </form>
      <details>
        <summary>+ Observation</summary>
        <p>Select an MSE section above, then add an observed finding.</p>
        <div className="copilot-actions">
          {(target === "mse.moodAffect"
            ? [
                "Restricted affect",
                "Blunted affect",
                "Full affect",
                "Labile affect",
              ]
            : target === "mse.behavior"
              ? ["Restless", "Intermittent facial motor tic", "Tremor"]
              : []
          ).map((value) => (
            <button
              key={value}
              type="button"
              disabled={locked}
              onClick={() => observation(value)}
            >
              {value}
            </button>
          ))}
          <button
            type="button"
            disabled={locked}
            onClick={() => {
              setKind("observation");
              setTarget("mse.behavior");
            }}
          >
            Motor / movement
          </button>
          <button
            type="button"
            disabled={locked}
            onClick={() => setKind("observation")}
          >
            Other observation
          </button>
        </div>
      </details>
      <details>
        <summary>
          Guidance history · {draft.liveSupport?.guidance.length ?? 0}
        </summary>
        <ol>
          {draft.liveSupport?.guidance.map((entry) => (
            <li key={entry.id}>
              <strong>
                {entry.kind === "clinical-thought"
                  ? "Clinical Thought · consideration only"
                  : entry.kind}
              </strong>{" "}
              · {guidanceTargets[entry.target]}
              <p>{entry.text}</p>
              <small>
                {entry.createdAt}
                {entry.actorId ? ` · ${entry.actorId}` : " · provider entry"}
              </small>
              {entry.replaces && (
                <details>
                  <summary>Prior interpretation preserved</summary>
                  <p>{entry.replaces}</p>
                </details>
              )}
            </li>
          ))}
        </ol>
      </details>
      <label>
        Guidance
        <select
          aria-label="Interview guidance"
          value={guidanceMode}
          onChange={(event) => setGuidanceMode(event.target.value)}
        >
          <option>Off</option>
          <option>Light</option>
          <option>Guided</option>
        </select>
      </label>
      {guidanceMode !== "Off" && (
        <>
          <h4>Coverage · clinician-reviewed</h4>
          <div className="copilot-coverage-list">
            {relevantCoverage.map((section) => (
              <button
                type="button"
                key={section}
                onClick={() => {
                  setTarget(section);
                  setSafetyAssessed(false);
                }}
              >
                <span>{guidanceTargets[section]}</span>
                <small>
                  {coverageLabels[sectionCoverage(draft, section).state]}
                </small>
              </button>
            ))}
          </div>
          <p>
            {guidanceTargets[target]}: {coverageLabels[coverage.state]}
          </p>
          <details>
            <summary>Evidence for selected section</summary>
            <p>{coverage.evidence || "No encounter evidence documented."}</p>
          </details>
          {target === "riskAssessment" && (
            <label className="copilot-check">
              <input
                type="checkbox"
                checked={safetyAssessed}
                disabled={locked}
                onChange={(event) => setSafetyAssessed(event.target.checked)}
              />{" "}
              SI, HI and self-harm explicitly assessed and documented
            </label>
          )}
          <button
            type="button"
            disabled={
              locked ||
              !coverage.evidence ||
              (target === "riskAssessment" && !safetyAssessed)
            }
            onClick={() => onAttest(target, safetyAssessed)}
          >
            Mark sufficient
          </button>
          <p>
            Safety:{" "}
            {coverageLabels[sectionCoverage(draft, "riskAssessment").state]}.
            Absence of concerning speech does not establish assessment.
          </p>
          {guidanceMode === "Guided" && !dismissedQuestion && (
            <div>
              <p>
                Suggested next question:{" "}
                {sectionCoverage(draft, "riskAssessment").state !== "covered"
                  ? "Have you had thoughts of suicide, harming yourself, or harming someone else?"
                  : "What else should we clarify before agreeing on today's plan?"}
              </p>
              <button type="button" onClick={() => setDismissedQuestion(true)}>
                Dismiss suggestion
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
