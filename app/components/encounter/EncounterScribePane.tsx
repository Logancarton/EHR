"use client";

import {
  type CandidateAction,
  type TranscriptUtterance,
} from "../../lib/encounter-engine";

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
}) {
  return (
    <section className="tri-column scribe-column" aria-label="Ambient Scribe Window">
      <div className="pane-card-header scribe-header">
        <div className="header-badge-title">
          <span className="scribe-pulsing-icon">🎙️</span>
          <div>
            <h3>Encounter Scribe</h3>
            <small>Ambient conversation &amp; AI extraction</small>
          </div>
        </div>

        <div className="scribe-scenario-row">
          <select
            value={scenarioKey}
            onChange={(e) => onScenarioChange(e.target.value)}
            className="scribe-scenario-select"
            aria-label="Select Clinical Scenario"
            disabled={isLocked}
          >
            <option value="maya-chen">Maya Chen · ADHD / Guanfacine</option>
            <option value="jordan-reed">Jordan Reed · Mood / Labs</option>
          </select>
        </div>

        <div className="scribe-action-buttons">
          <button
            type="button"
            className={`scribe-stream-btn ${isAmbientPlaying ? "is-active" : ""}`}
            onClick={onStartAmbient}
            disabled={isLocked}
          >
            {isAmbientPlaying ? "⏸ Pause Stream" : "▶ Start Ambient Stream"}
          </button>
          <button
            type="button"
            className="scribe-synthesize-btn"
            onClick={onSynthesizeFromAmbient}
            disabled={isLocked}
            title="Synthesize and populate template fields from ambient stream"
          >
            ✦ Synthesize Note
          </button>
          <button
            type="button"
            className={`scribe-mic-btn ${micListening ? "mic-live" : ""}`}
            onClick={onToggleLiveMic}
            disabled={isLocked}
            title="Live microphone dictation via Web Speech API"
          >
            {micListening ? "🔴 Live" : "🎙️ Dictate"}
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
              {isAmbientPlaying ? "Streaming ambient room dialogue..." : "Listening to clinician dictation..."}
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
              No active transcript recorded yet. Click <strong>“Start Ambient Stream”</strong> to run the room dialogue simulation, or use <strong>“Dictate”</strong> to speak directly.
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
            <span className="spark">✦</span>
            <strong>AI Staged Actions (Requires Sign-off)</strong>
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
                  {action.status === "accepted" && <span className="action-tag accepted">✓ In Plan</span>}
                  {action.status === "dismissed" && <span className="action-tag dismissed">Dismissed</span>}
                </div>
                <p className="action-card-detail">{action.detail}</p>
                <div className="provenance-quote" title="Exact transcript citation">
                  <span>💬 &ldquo;{action.provenanceSnippet}&rdquo;</span>
                </div>
                {action.status === "suggested" && !isLocked && (
                  <div className="action-buttons-row">
                    <button
                      type="button"
                      className="btn-apply-action"
                      onClick={() => onApplyCandidateAction(action)}
                    >
                      ✓ Apply to Plan
                    </button>
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
