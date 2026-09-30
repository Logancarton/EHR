"use client";

import { useEffect, useState } from "react";
import {
  type CandidateAction,
  type TranscriptUtterance,
} from "../../lib/encounter-engine";
import { api } from "../../lib/api-client";
import Icon from "../ui/Icon";

export default function EncounterScribePane({
  scenarioKey,
  onScenarioChange,
  isLocked,
  isAmbientPlaying,
  onStartAmbient,
  onSynthesizeFromAmbient,
  micListening,
  onToggleLiveMic,
  ambientTranscript,
  onClearTranscript,
  candidateActions,
  onApplyCandidateAction,
  onDismissCandidateAction,
  onStageCandidateOrder,
  isSynthesizing,
}: {
  scenarioKey: string;
  onScenarioChange: (key: string) => void;
  isLocked: boolean;
  isAmbientPlaying: boolean;
  onStartAmbient: () => void;
  onSynthesizeFromAmbient: () => void;
  micListening: boolean;
  onToggleLiveMic: () => void;
  ambientTranscript: TranscriptUtterance[];
  onClearTranscript: () => void;
  candidateActions: CandidateAction[];
  onApplyCandidateAction: (action: CandidateAction) => void;
  onDismissCandidateAction: (actionId: string) => void;
  onStageCandidateOrder?: (action: CandidateAction) => void;
  isSynthesizing?: boolean;
}) {
  const [aiStatus, setAiStatus] = useState<{
    connected: boolean;
    activeModel: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.ai.status()
      .then((data) => {
        if (!cancelled && data.success) {
          setAiStatus({ connected: data.connected, activeModel: data.activeModel });
        }
      })
      .catch(() => {
        if (!cancelled) setAiStatus({ connected: false, activeModel: "transcript-only fallback" });
      });
    return () => { cancelled = true; };
  }, []);

  const hasTranscript = ambientTranscript.length > 0;

  return (
    <section className="tri-column scribe-column" aria-label="Ambient Scribe Window">
      <div className="pane-card-header scribe-header">
        <div className="header-badge-title">
          <span className="scribe-pulsing-icon"><Icon name="mic" /></span>
          <div>
            <h3>Encounter Scribe</h3>
            <small>
              Transcript-grounded draft &amp; candidate extraction
              {aiStatus?.connected ? (
                <span
                  style={{
                    marginLeft: "6px",
                    fontSize: "10px",
                    fontWeight: 600,
                    color: "#15803d",
                    background: "#dcfce7",
                    padding: "1px 5px",
                    borderRadius: "4px",
                  }}
                  title={`Local Ollama inference: ${aiStatus.activeModel}`}
                >
                  ⚡ {aiStatus.activeModel}
                </span>
              ) : aiStatus ? (
                <span
                  style={{
                    marginLeft: "6px",
                    fontSize: "10px",
                    fontWeight: 600,
                    color: "#6b7280",
                    background: "#f3f4f6",
                    padding: "1px 5px",
                    borderRadius: "4px",
                  }}
                  title="Ollama is unavailable. Clinical Bond will use the conservative transcript-only fallback and will not invent missing note sections."
                >
                  Local fallback
                </span>
              ) : null}
            </small>
          </div>
        </div>

        <div className="scribe-scenario-row">
          <select
            value={scenarioKey}
            onChange={(e) => onScenarioChange(e.target.value)}
            className="scribe-scenario-select"
            aria-label="Select synthetic demo transcript"
            disabled={isLocked}
          >
            <option value="maya-chen">Demo · Maya Chen · ADHD / Guanfacine</option>
            <option value="jordan-reed">Demo · Jordan Reed · Mood / Labs</option>
          </select>
        </div>

        <div className="scribe-action-buttons">
          <button
            type="button"
            className={`scribe-stream-btn ${isAmbientPlaying ? "is-active" : ""}`}
            onClick={onStartAmbient}
            disabled={isLocked}
            title="Run the selected synthetic conversation into the transcript for local scribe testing"
          >
            {isAmbientPlaying ? "⏸ Pause Demo" : "▶ Run Demo Transcript"}
          </button>
          <button
            type="button"
            className="scribe-synthesize-btn"
            onClick={onSynthesizeFromAmbient}
            disabled={isLocked || Boolean(isSynthesizing) || !hasTranscript}
            title={hasTranscript
              ? "Draft empty note sections from the captured transcript"
              : "Capture transcript evidence before synthesizing a note"}
          >
            <Icon name="auto_awesome" /> {isSynthesizing ? "Synthesizing…" : "Synthesize Note"}
          </button>
          <button
            type="button"
            className={`scribe-mic-btn ${micListening ? "mic-live" : ""}`}
            onClick={onToggleLiveMic}
            disabled={isLocked}
            title="Live clinician dictation into the active note section via Web Speech API"
          >
            {micListening ? "Live" : "Dictate"}
          </button>
        </div>

        {/* Audio Waveform Animation */}
        {(isAmbientPlaying || micListening) && (
          <div className="ambient-waveform-indicator">
            <div className="wave-bar bar-1"></div>
            <div className="wave-bar bar-2"></div>
            <div className="wave-bar bar-3"></div>
            <div className="wave-bar bar-4"></div>
            <div className="wave-bar bar-5"></div>
            <span>
              {isAmbientPlaying ? "Playing synthetic transcript demo..." : "Listening to clinician dictation..."}
            </span>
          </div>
        )}
      </div>

      {/* Transcript Scroll Area */}
      <div className="scribe-transcript-scroll">
        <div className="transcript-label-bar">
          <span>CONVERSATION TRANSCRIPT ({ambientTranscript.length} Utterances)</span>
          {ambientTranscript.length > 0 && !isLocked && (
            <button
              type="button"
              className="clear-btn"
              onClick={onClearTranscript}
            >
              Clear
            </button>
          )}
        </div>

        {ambientTranscript.length === 0 ? (
          <div className="scribe-empty-state">
            <p>
              No transcript evidence yet. <strong>Run Demo Transcript</strong> feeds a synthetic conversation into the local scribe for testing. <strong>Dictate</strong> writes your speech directly into the active note section and does not create an ambient transcript.
            </p>
          </div>
        ) : (
          <div className="transcript-bubbles-list">
            {ambientTranscript.map((utt) => (
              <div key={utt.id} className={`transcript-bubble bubble-${utt.speaker}`}>
                <div className="bubble-meta">
                  <strong>{utt.speakerName}</strong>
                  <time>{utt.timestamp}</time>
                </div>
                <p className="bubble-text">{utt.text}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Candidate Clinical Action Cards */}
      {candidateActions.length > 0 && (
        <div className="scribe-candidate-actions">
          <div className="candidate-header">
            <span className="spark"><Icon name="auto_awesome" /></span>
            <strong>AI Candidate Actions (Requires Review)</strong>
          </div>
          <div className="candidate-cards-list">
            {candidateActions.map((action) => (
              <div key={action.id} className={`candidate-action-card status-${action.status}`}>
                <div className="action-card-top">
                  <span className={`action-type-pill type-${action.type}`}>
                    {action.type === "medication-titration" && "Rx Titration"}
                    {action.type === "lab-order" && "Lab Order"}
                    {action.type === "referral" && "Intervention"}
                  </span>
                  <strong>{action.title}</strong>
                  {action.status === "accepted" && <span className="action-tag accepted"><Icon name="check" /> In Plan</span>}
                  {action.status === "dismissed" && <span className="action-tag dismissed">Dismissed</span>}
                </div>
                <p className="action-card-detail">{action.detail}</p>
                <div className="provenance-quote" title="Exact transcript citation">
                  <span><Icon name="chat_bubble" /> &ldquo;{action.provenanceSnippet}&rdquo;</span>
                </div>
                {action.status === "suggested" && !isLocked && (
                  <div className="action-buttons-row">
                    <button
                      type="button"
                      className="btn-apply-action"
                      onClick={() => onApplyCandidateAction(action)}
                    >
                      <Icon name="check" /> Apply to Plan
                    </button>
                    {onStageCandidateOrder && (action.type === "medication-titration" || action.type === "lab-order") && (
                      <button
                        type="button"
                        className="btn-stage-order-action"
                        onClick={() => onStageCandidateOrder(action)}
                      >
                        <Icon name="content_paste" /> Stage Order
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn-dismiss-action"
                      onClick={() => onDismissCandidateAction(action.id)}
                    >
                      Dismiss
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
