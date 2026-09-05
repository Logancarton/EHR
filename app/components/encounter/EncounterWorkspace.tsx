"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { type Patient } from "../../domain/patient";
import {
  type ProviderPreferences,
  defaultPreferences,
} from "../../lib/preference-engine";
import {
  type EncounterState,
  type CandidateAction,
  type MentalStatusExam,
  type CodingRecommendation,
  defaultMse,
  builtInTemplates,
  calculateEncounterCoding,
  getSavedTemplatePreference,
  saveTemplatePreference,
  ambientScenarios,
  loadEncounterDraft,
  saveEncounterDraft,
  signEncounterDraft,
} from "../../lib/encounter-engine";
import {
  patientEncounterHistory,
  type PastEncounter,
} from "../../lib/clinical-protocols";
import {
  type SpeechRecognitionEventLike,
  type BrowserSpeechRecognition,
} from "../../domain/speech";

import EncounterToolbar from "./EncounterToolbar";
import EncounterScribePane from "./EncounterScribePane";
import EncounterTemplatePane from "./EncounterTemplatePane";
import EncounterCleanNotePane from "./EncounterCleanNotePane";
import EncounterCodingDock from "./EncounterCodingDock";
import EncounterSignModal from "./EncounterSignModal";

type FieldName = "chiefComplaint" | "intervalHistory" | "treatmentResponse" | "sideEffects" | "assessment" | "plan";

export default function EncounterWorkspace({
  patient,
  preferences = defaultPreferences,
  onUpdatePreferences,
  onInsertText,
  onEncounterSigned,
  onDraftOrder,
  onOpenOrderCart,
}: {
  patient: Patient;
  preferences?: ProviderPreferences;
  onUpdatePreferences?: (updated: ProviderPreferences) => void;
  onInsertText?: (text: string) => void;
  onEncounterSigned?: (patientId: string) => void;
  onDraftOrder?: (orderName: string) => void;
  onOpenOrderCart?: (tab?: "cart" | "prescribe" | "labs", prefill?: string) => void;
}) {
  const [draft, setDraft] = useState<EncounterState>(() => loadEncounterDraft(patient.id));
  const [searchTerm, setSearchTerm] = useState("");
  const [showPastNotes, setShowPastNotes] = useState(false);
  const [scenarioKey, setScenarioKey] = useState<string>(
    patient.id in ambientScenarios ? patient.id : "maya-chen"
  );
  const scenario = ambientScenarios[scenarioKey] || ambientScenarios["maya-chen"];
  const [isAmbientPlaying, setIsAmbientPlaying] = useState(false);
  const [ambientCursor, setAmbientCursor] = useState(0);
  const [micListening, setMicListening] = useState(false);
  const [activeMicField, setActiveMicField] = useState<
    "intervalHistory" | "treatmentResponse" | "sideEffects" | "assessment" | "plan"
  >("intervalHistory");
  const [mseOpen, setMseOpen] = useState(true);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [toastNotice, setToastNotice] = useState<string | null>(null);
  const [attestationChecked, setAttestationChecked] = useState(false);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);

  // Note Preference Template
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(() => {
    return draft.selectedTemplateId || getSavedTemplatePreference();
  });

  const activeTemplate = useMemo(() => {
    return (
      builtInTemplates.find((t) => t.id === selectedTemplateId) || builtInTemplates[0]
    );
  }, [selectedTemplateId]);

  // Psychotherapy Duration (Minutes)
  const [psychotherapyMinutes, setPsychotherapyMinutes] = useState<number>(() => {
    return draft.psychotherapyMinutes !== undefined
      ? draft.psychotherapyMinutes
      : activeTemplate.defaultPsychotherapyMinutes;
  });

  const pastEncounters = patientEncounterHistory[patient.id] || [];

  // Reload draft when patient changes
  useEffect(() => {
    const loaded = loadEncounterDraft(patient.id);
    setDraft(loaded);
    setScenarioKey(patient.id in ambientScenarios ? patient.id : "maya-chen");
    setIsAmbientPlaying(false);
    setAmbientCursor(0);
    const tmplId = loaded.selectedTemplateId || getSavedTemplatePreference();
    setSelectedTemplateId(tmplId);
    const tmpl = builtInTemplates.find((t) => t.id === tmplId) || builtInTemplates[0];
    setPsychotherapyMinutes(
      loaded.psychotherapyMinutes !== undefined
        ? loaded.psychotherapyMinutes
        : tmpl.defaultPsychotherapyMinutes
    );
  }, [patient.id]);

  // Autosave draft on edits
  useEffect(() => {
    saveEncounterDraft({
      ...draft,
      selectedTemplateId,
      psychotherapyMinutes,
    });
  }, [draft, selectedTemplateId, psychotherapyMinutes]);

  function showToast(msg: string) {
    setToastNotice(msg);
    setTimeout(() => {
      setToastNotice((prev) => (prev === msg ? null : prev));
    }, 3200);
  }

  // Dynamic AMA/CMS Coding Engine Calculation
  const codingRec: CodingRecommendation = useMemo(() => {
    return calculateEncounterCoding(draft, psychotherapyMinutes);
  }, [draft, psychotherapyMinutes]);

  // Clickable Chips Helper: Appends or toggles chip text in specific field
  function toggleChip(field: FieldName, text: string) {
    if (draft.status === "signed") return;
    setDraft((prev) => {
      const currentVal = prev[field] || "";
      if (currentVal.includes(text)) {
        // Remove chip text
        const cleaned = currentVal
          .replace(text, "")
          .replace(/\s*;\s*;\s*/g, "; ")
          .replace(/\s*,\s*,\s*/g, ", ")
          .replace(/^\s*;\s*/, "")
          .replace(/\s*;\s*$/, "")
          .replace(/\n\s*•\s*$/, "")
          .trim();
        return { ...prev, [field]: cleaned };
      } else {
        // Append chip text
        if (!currentVal.trim()) {
          return { ...prev, [field]: text };
        }
        if (field === "plan" || field === "assessment") {
          return { ...prev, [field]: `${currentVal}\n• ${text}` };
        }
        return { ...prev, [field]: `${currentVal}; ${text}` };
      }
    });
  }

  function isChipActive(field: FieldName, text: string): boolean {
    const currentVal = draft[field] || "";
    return currentVal.includes(text);
  }

  // Template Switching & Preference Saving
  function handleSelectTemplate(templateId: string) {
    const tmpl = builtInTemplates.find((t) => t.id === templateId);
    if (!tmpl) return;
    setSelectedTemplateId(tmpl.id);
    setPsychotherapyMinutes(tmpl.defaultPsychotherapyMinutes);
    setDraft((prev) => ({
      ...prev,
      selectedTemplateId: tmpl.id,
      psychotherapyMinutes: tmpl.defaultPsychotherapyMinutes,
      chiefComplaint: prev.chiefComplaint || tmpl.defaultChiefComplaint,
      mse: { ...(tmpl.defaultMse || defaultMse) },
    }));
    showToast(`Switched note template to "${tmpl.name}"`);
  }

  function handleSaveAsDefaultTemplate() {
    saveTemplatePreference(selectedTemplateId);
    showToast(`★ Saved "${activeTemplate.name}" as your default note template!`);
  }

  function handleApplyTemplateDefaults() {
    setDraft((prev) => ({
      ...prev,
      chiefComplaint: activeTemplate.defaultChiefComplaint,
      mse: { ...(activeTemplate.defaultMse || defaultMse) },
    }));
    showToast(`Applied default baseline from "${activeTemplate.name}".`);
  }

  // Psychotherapy Duration Controller
  function handlePsychotherapyChange(minutes: number) {
    const next = Math.max(0, Math.min(120, minutes));
    setPsychotherapyMinutes(next);
    setDraft((prev) => ({ ...prev, psychotherapyMinutes: next }));
    if (next >= 16 && next <= 37) {
      showToast(`+90833 Psychotherapy Add-on qualified (${next} min documented)`);
    } else if (next >= 38 && next <= 52) {
      showToast(`+90836 Psychotherapy Add-on qualified (${next} min documented)`);
    } else if (next >= 53) {
      showToast(`+90838 Psychotherapy Add-on qualified (${next} min documented)`);
    }
  }

  // Simulated ambient dialogue stream
  useEffect(() => {
    if (!isAmbientPlaying) return;
    if (ambientCursor >= scenario.utterances.length) {
      setIsAmbientPlaying(false);
      showToast("Ambient conversation stream complete. Ready for note synthesis.");
      return;
    }

    const timer = setTimeout(() => {
      const nextUtterance = scenario.utterances[ambientCursor];
      setDraft((prev) => ({
        ...prev,
        ambientTranscript: [...prev.ambientTranscript, nextUtterance],
      }));
      setAmbientCursor((c) => c + 1);
    }, 1100);

    return () => clearTimeout(timer);
  }, [isAmbientPlaying, ambientCursor, scenario.utterances]);

  // Live Speech Recognition Web API
  function toggleLiveMic(
    field: "intervalHistory" | "treatmentResponse" | "sideEffects" | "assessment" | "plan" = "intervalHistory"
  ) {
    if (typeof window === "undefined") return;

    if (micListening) {
      recognitionRef.current?.stop();
      setMicListening(false);
      showToast("Microphone paused.");
      return;
    }

    const SpeechRecognitionConstructor =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognitionConstructor) {
      showToast("Speech recognition is not supported in this browser.");
      return;
    }

    try {
      const recognition = new SpeechRecognitionConstructor();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onresult = (event: SpeechRecognitionEventLike) => {
        let finalChunk = "";
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const item = event.results[i];
          if (item?.isFinal) {
            finalChunk += item[0]?.transcript + " ";
          }
        }
        if (finalChunk.trim()) {
          setDraft((prev) => ({
            ...prev,
            [field]: (prev[field] ? prev[field] + " " : "") + finalChunk.trim(),
          }));
        }
      };

      recognition.onerror = () => setMicListening(false);
      recognition.onend = () => setMicListening(false);

      recognition.start();
      recognitionRef.current = recognition;
      setActiveMicField(field);
      setMicListening(true);
      showToast(`🎙️ Dictating live into ${field}...`);
    } catch {
      showToast("Could not access microphone.");
      setMicListening(false);
    }
  }

  function handleStartAmbient() {
    setDraft((prev) => ({
      ...prev,
      ambientTranscript: [],
    }));
    setAmbientCursor(0);
    setIsAmbientPlaying(true);
    showToast(`Started ambient clinical dialogue for ${scenario.title}`);
  }

  function handleSynthesizeFromAmbient() {
    setIsAmbientPlaying(false);
    const sNote = scenario.synthesizedNote;

    setDraft((prev) => ({
      ...prev,
      chiefComplaint: sNote.chiefComplaint,
      intervalHistory: sNote.intervalHistory,
      treatmentResponse: sNote.treatmentResponse,
      sideEffects: sNote.sideEffects,
      mse: { ...sNote.mse },
      assessment: sNote.assessment,
      plan: sNote.plan,
      candidateActions: [...sNote.candidateActions],
      ambientTranscript:
        prev.ambientTranscript.length > 0 ? prev.ambientTranscript : [...scenario.utterances],
    }));

    showToast("✦ Synthesized note blocks from ambient stream with exact source quotes.");
  }

  function handleApplyCandidateAction(action: CandidateAction) {
    const addition = `\n• ${action.title}: ${action.detail}`;
    setDraft((prev) => ({
      ...prev,
      plan: (prev.plan ? prev.plan + "\n" : "") + addition.trim(),
      candidateActions: prev.candidateActions.map((a) =>
        a.id === action.id ? { ...a, status: "accepted" as const } : a
      ),
    }));
    showToast(`Applied "${action.title}" to active plan.`);
  }

  function handleStageCandidateOrder(action: CandidateAction) {
    handleApplyCandidateAction(action);
    if (action.type === "lab-order") {
      if (onDraftOrder) onDraftOrder(action.title);
      if (onOpenOrderCart) onOpenOrderCart("labs", action.title);
    } else if (action.type === "medication-titration") {
      if (onOpenOrderCart) onOpenOrderCart("prescribe");
    }
  }

  function handleDismissCandidateAction(actionId: string) {
    setDraft((prev) => ({
      ...prev,
      candidateActions: prev.candidateActions.map((a) =>
        a.id === actionId ? { ...a, status: "dismissed" as const } : a
      ),
    }));
    showToast("Dismissed candidate action.");
  }

  function handleApplyMseTemplate(templateName: string) {
    let updatedMse: MentalStatusExam = { ...draft.mse };

    if (templateName === "normal") {
      updatedMse = {
        appearance: "Well-groomed, casual attire, appears stated age.",
        behavior: "Calm, engaged, cooperative, appropriate eye contact.",
        speech: "Normal rate, rhythm, and volume. Non-pressured.",
        moodAffect: "Mood: 'Good, stable.' Affect: Broad, appropriate, euthymic.",
        thoughtProcess: "Linear, logical, goal-directed. No tangentiality.",
        thoughtContent: "No delusions, hallucinations, suicidal ideation, or homicidal ideation.",
        cognition: "Alert and oriented x4. Attention and concentration intact.",
        insightJudgment: "Insight good; judgment intact regarding medications and safety.",
      };
    } else if (templateName === "anxious") {
      updatedMse = {
        appearance: "Neatly dressed, subtle psychomotor restlessness, fidgeting with hands.",
        behavior: "Cooperative but slightly guarded; frequent rapid scanning of room.",
        speech: "Mildly accelerated rate, normal volume and articulation.",
        moodAffect: "Mood: 'Nervous, on edge.' Affect: Anxious, constricted range, congruent with mood.",
        thoughtProcess: "Goal-directed but hyper-focused on anticipated work and family stressors.",
        thoughtContent: "Prominent worries and somatic tension; denies panic attacks, SI/HI, or psychosis.",
        cognition: "Grossly oriented x4; mild difficulty with serial subtractions secondary to anxiety.",
        insightJudgment: "Insight fair to good regarding anxiety triggers; judgment preserved.",
      };
    } else if (templateName === "depressed") {
      updatedMse = {
        appearance: "Casual, slight dishevelment, slowed gait and psychomotor deceleration.",
        behavior: "Tired appearance, poor eye contact, intermittent sighing.",
        speech: "Soft, monotone, increased latency of response.",
        moodAffect: "Mood: 'Depressed, exhausted.' Affect: Blunted, constricted, tearful at times.",
        thoughtProcess: "Slowed thought processing; linear and coherent without looseness.",
        thoughtContent: "Feelings of guilt, worthlessness, and helplessness. Denies active SI/intent/plan.",
        cognition: "Oriented x4; subjective complaints of brain fog and memory lapses.",
        insightJudgment: "Insight intact regarding depressive episode; judgment preserved.",
      };
    } else if (templateName === "hypomanic") {
      updatedMse = {
        appearance: "Brightly dressed, vivacious, elevated motor energy.",
        behavior: "Charming, restless, slightly intrusive but reciprocal rapport maintained.",
        speech: "Rapid, voluminous, mildly pressured but easily interruptible.",
        moodAffect: "Mood: 'Fantastic, never better.' Affect: Expansive, elevated, labile.",
        thoughtProcess: "Circumstantial, flight of ideas, rapid association switching.",
        thoughtContent: "Grandiose ambitions, multiple simultaneous new projects. Denies overt delusions or SI.",
        cognition: "Alert, hyper-vigilant, distractible.",
        insightJudgment: "Insight poor to partial regarding hypomania; judgment mildly impaired regarding sleep.",
      };
    }

    setDraft((prev) => ({ ...prev, mse: updatedMse }));
    showToast(`Applied ${templateName.toUpperCase()} MSE template.`);
  }

  function handleCopyCleanNote() {
    const fullText = `
ANTIGRAVITY PSYCHIATRIC MEDICINE
OUTPATIENT CLINICAL PROGRESS NOTE

PATIENT: ${patient.name} | MRN: ${patient.mrn} | DOB: ${patient.dob} (${patient.age}y)
DATE OF SERVICE: Sep 4, 2026 | PROVIDER: Dr. Logan Carton, MD (NPI: 1948201948)
VISIT TYPE: ${draft.visitType} | CPT CODING: ${codingRec.primaryCode} ${codingRec.addonCodes.join(" ")}

CHIEF COMPLAINT:
${draft.chiefComplaint || "Routine psychiatric follow-up."}

INTERVAL HISTORY (HPI):
${draft.intervalHistory || "None documented."}

RESPONSE TO TREATMENT:
${draft.treatmentResponse || "None reported."}

SIDE EFFECTS & TOLERABILITY:
${draft.sideEffects || "Denies adverse effects."}

MENTAL STATUS EXAMINATION:
• Appearance: ${draft.mse.appearance}
• Behavior & Rapport: ${draft.mse.behavior}
• Speech: ${draft.mse.speech}
• Mood & Affect: ${draft.mse.moodAffect}
• Thought Process: ${draft.mse.thoughtProcess}
• Thought Content (Safety/SI): ${draft.mse.thoughtContent}
• Cognition: ${draft.mse.cognition}
• Insight & Judgment: ${draft.mse.insightJudgment}

CLINICAL ASSESSMENT & MDM:
${draft.assessment || "Clinical assessment pending."}
Medical Decision Making Level: ${codingRec.mdmLevel.toUpperCase()} (${codingRec.mdmReasoning})

TREATMENT PLAN & ORDERS:
${draft.plan || "Plan as documented."}
${psychotherapyMinutes >= 16 ? `\nPsychotherapy Provided: ${psychotherapyMinutes} minutes of interactive psychotherapy.` : ""}

SIGNATURE:
${draft.status === "signed" ? `Electronically Signed by ${draft.signedBy} on ${draft.signedAt} (NPI: ${draft.npi})` : "DRAFT - Unsigned"}
    `.trim();

    navigator.clipboard?.writeText(fullText);
    showToast("📋 Clean note copied to clipboard.");
  }

  function handleSignNote() {
    if (!attestationChecked) {
      showToast("Please check the verification attestation before signing.");
      return;
    }

    const signed = signEncounterDraft(draft, "Dr. Logan Carton, MD", "1948201948");
    setDraft(signed);

    const newPast: PastEncounter = {
      id: signed.encounterId,
      date: "Sep 4, 2026",
      provider: "Dr. Logan Carton, MD",
      type: `${signed.visitType} (${codingRec.primaryCode})`,
      chiefComplaint: signed.chiefComplaint,
      hpi: signed.intervalHistory,
      assessment: signed.assessment,
      plan: signed.plan,
    };

    if (!patientEncounterHistory[patient.id]) {
      patientEncounterHistory[patient.id] = [];
    }
    if (!patientEncounterHistory[patient.id].some((e) => e.id === signed.encounterId)) {
      patientEncounterHistory[patient.id].unshift(newPast);
    }

    setReviewModalOpen(false);
    if (onEncounterSigned) {
      onEncounterSigned(patient.id);
    }
    showToast("Encounter signed, locked, and committed to legal medical record.");
  }

  const isLocked = draft.status === "signed";

  const filteredPastEncounters = useMemo(() => {
    if (!searchTerm.trim()) return pastEncounters;
    const term = searchTerm.toLowerCase();
    return pastEncounters.filter((enc) =>
      `${enc.chiefComplaint} ${enc.hpi} ${enc.assessment} ${enc.plan}`.toLowerCase().includes(term)
    );
  }, [pastEncounters, searchTerm]);

  return (
    <div className="encounter-workspace-root">
      {/* Toast Feedback */}
      {toastNotice && <div className="encounter-toast">{toastNotice}</div>}

      {/* TOP TOOLBAR: NOTE TEMPLATE PREFERENCE & SESSION CONTROLS */}
      <EncounterToolbar
        selectedTemplateId={selectedTemplateId}
        onSelectTemplate={handleSelectTemplate}
        onSaveAsDefaultTemplate={handleSaveAsDefaultTemplate}
        onApplyTemplateDefaults={handleApplyTemplateDefaults}
        showPastNotes={showPastNotes}
        onTogglePastNotes={() => setShowPastNotes(!showPastNotes)}
        pastNotesCount={pastEncounters.length}
        psychotherapyMinutes={psychotherapyMinutes}
        onPsychotherapyChange={handlePsychotherapyChange}
        isLocked={isLocked}
        lastAutosavedAt={draft.lastAutosavedAt}
        signedAt={draft.signedAt}
        onCopyNote={handleCopyCleanNote}
        onPrint={() => window.print()}
        onOpenReviewModal={() => setReviewModalOpen(true)}
      />

      {/* OPTIONAL LONGITUDINAL SEARCH DRAWER */}
      {showPastNotes && (
        <section className="past-notes-drawer-card">
          <div className="drawer-heading">
            <strong>Longitudinal Record · Search Past Encounters</strong>
            <button
              type="button"
              className="drawer-close"
              onClick={() => setShowPastNotes(false)}
            >
              ✕
            </button>
          </div>
          <div className="drawer-search-bar">
            <input
              placeholder="Search previous visits for symptoms, sleep, titration, or notes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="drawer-results-grid">
            {filteredPastEncounters.map((enc) => (
              <div key={enc.id} className="drawer-result-item">
                <div className="result-header">
                  <strong>{enc.type}</strong>
                  <time>{enc.date}</time>
                </div>
                <p><strong>CC:</strong> {enc.chiefComplaint}</p>
                <p><strong>HPI:</strong> {enc.hpi.slice(0, 110)}...</p>
                <button
                  type="button"
                  onClick={() => {
                    setDraft((p) => ({
                      ...p,
                      plan: (p.plan ? p.plan + "\n" : "") + `[Prior Plan ${enc.date}]: ${enc.plan}`,
                    }));
                    showToast(`Copied ${enc.date} plan into active note!`);
                  }}
                  disabled={isLocked}
                >
                  📋 Insert Plan to Current Draft
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* TRI-PANE ENCOUNTER WORKSPACE */}
      <div className="encounter-tri-pane">
        <EncounterScribePane
          scenarioKey={scenarioKey}
          onScenarioChange={setScenarioKey}
          isLocked={isLocked}
          isAmbientPlaying={isAmbientPlaying}
          onStartAmbient={handleStartAmbient}
          onSynthesizeFromAmbient={handleSynthesizeFromAmbient}
          micListening={micListening}
          onToggleLiveMic={() => toggleLiveMic("intervalHistory")}
          ambientTranscript={draft.ambientTranscript}
          onClearTranscript={() => setDraft((p) => ({ ...p, ambientTranscript: [] }))}
          candidateActions={draft.candidateActions}
          onApplyCandidateAction={handleApplyCandidateAction}
          onDismissCandidateAction={handleDismissCandidateAction}
          onStageCandidateOrder={handleStageCandidateOrder}
        />

        <EncounterTemplatePane
          draft={draft}
          onUpdateDraft={setDraft}
          activeTemplate={activeTemplate}
          isLocked={isLocked}
          mseOpen={mseOpen}
          onToggleMseOpen={() => setMseOpen(!mseOpen)}
          onApplyMsePreset={handleApplyMseTemplate}
          micListening={micListening}
          activeMicField={activeMicField}
          onToggleLiveMic={toggleLiveMic}
          toggleChip={toggleChip}
          isChipActive={isChipActive}
        />

        <EncounterCleanNotePane
          patient={patient}
          draft={draft}
          codingRec={codingRec}
          psychotherapyMinutes={psychotherapyMinutes}
          isLocked={isLocked}
          onCopyNote={handleCopyCleanNote}
          onPrint={() => window.print()}
          onOpenReviewModal={() => setReviewModalOpen(true)}
        />
      </div>

      {/* BOTTOM DOCK: ENCOUNTER GOALS & DYNAMIC CODING ENGINE */}
      <EncounterCodingDock codingRec={codingRec} />

      {/* REVIEW & SIGN MODAL (D-008 Legal Gate) */}
      <EncounterSignModal
        isOpen={reviewModalOpen}
        onClose={() => setReviewModalOpen(false)}
        patient={patient}
        draft={draft}
        codingRec={codingRec}
        psychotherapyMinutes={psychotherapyMinutes}
        isLocked={isLocked}
        attestationChecked={attestationChecked}
        onToggleAttestation={setAttestationChecked}
        onSignNote={handleSignNote}
      />
    </div>
  );
}
