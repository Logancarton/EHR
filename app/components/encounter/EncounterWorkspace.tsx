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
  createInitialEncounter,
  loadEncounterDraft,
  saveEncounterDraft,
  clearEncounterDraft,
} from "../../lib/encounter-engine";
import {
  patientEncounterHistory,
  type PastEncounter,
} from "../../lib/clinical-protocols";
import {
  type SpeechRecognitionEventLike,
  type BrowserSpeechRecognition,
} from "../../domain/speech";
import { api } from "../../lib/api-client";
import { correctSpeechTranscript } from "../../lib/psychiatric-vocabulary";

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

  // Reload draft when patient changes. localStorage is only a fast local draft cache;
  // SQLite is the shared source of truth and can hydrate a draft on another session/device.
  useEffect(() => {
    let cancelled = false;
    let loaded = loadEncounterDraft(patient.id);

    // A signed encounter is not a reusable draft for the next visit.
    if (loaded.status === "signed") {
      clearEncounterDraft(patient.id);
      loaded = createInitialEncounter(patient.id);
    }

    setDraft(loaded);
    setScenarioKey(patient.id in ambientScenarios ? patient.id : "maya-chen");
    setIsAmbientPlaying(false);
    setAmbientCursor(0);

    const applyTemplateState = (state: EncounterState) => {
      const tmplId = state.selectedTemplateId || getSavedTemplatePreference();
      setSelectedTemplateId(tmplId);
      const tmpl = builtInTemplates.find((t) => t.id === tmplId) || builtInTemplates[0];
      setPsychotherapyMinutes(
        state.psychotherapyMinutes !== undefined
          ? state.psychotherapyMinutes
          : tmpl.defaultPsychotherapyMinutes
      );
    };
    applyTemplateState(loaded);

    api.encounters
      .list(patient.id)
      .then((records) => {
        if (cancelled) return;
        const backendDraft = records.find((record) => record.status === "draft");
        if (!backendDraft) return;

        // If this browser already has a different actively edited local draft, preserve
        // it and allow normal autosave to reconcile it rather than overwriting typed work.
        const localHasWork = Boolean(
          loaded.lastAutosavedAt && loaded.lastAutosavedAt !== "Just started",
        );
        if (localHasWork && loaded.encounterId !== backendDraft.id) return;

        const working = backendDraft.workingState;
        const hydrated: EncounterState = {
          ...loaded,
          patientId: backendDraft.patientId,
          encounterId: backendDraft.id,
          date: backendDraft.date,
          visitType: backendDraft.type,
          status: "draft",
          selectedTemplateId: working?.selectedTemplateId || loaded.selectedTemplateId,
          psychotherapyMinutes:
            working?.psychotherapyMinutes ?? loaded.psychotherapyMinutes,
          chiefComplaint: backendDraft.chiefComplaint,
          intervalHistory: backendDraft.intervalHistory,
          treatmentResponse: backendDraft.treatmentResponse,
          sideEffects: backendDraft.sideEffects,
          mse: { ...defaultMse, ...backendDraft.mse },
          assessment: backendDraft.assessment,
          plan: backendDraft.plan,
          candidateActions:
            (working?.candidateActions as CandidateAction[] | undefined) ||
            loaded.candidateActions,
          ambientTranscript:
            (working?.ambientTranscript as EncounterState["ambientTranscript"] | undefined) ||
            loaded.ambientTranscript,
          lastAutosavedAt: working?.lastAutosavedAt || loaded.lastAutosavedAt,
        };
        setDraft(hydrated);
        applyTemplateState(hydrated);
        saveEncounterDraft(hydrated);
      })
      .catch(() => {
        // Local cache remains usable in development/offline scenarios.
      });

    return () => {
      cancelled = true;
    };
  }, [patient.id]);

  // Dynamic AMA/CMS Coding Engine Calculation
  const codingRec: CodingRecommendation = useMemo(() => {
    return calculateEncounterCoding(draft, psychotherapyMinutes);
  }, [draft, psychotherapyMinutes]);

  // Autosave draft on edits. Signed notes never go back into the draft cache.
  useEffect(() => {
    if (draft.status === "signed") return;

    saveEncounterDraft({
      ...draft,
      selectedTemplateId,
      psychotherapyMinutes,
    });

    const timer = setTimeout(() => {
      if (draft.chiefComplaint || draft.intervalHistory || draft.assessment || draft.plan) {
        api.encounters
          .saveDraft({
            id: draft.encounterId,
            patientId: patient.id,
            type: draft.visitType,
            chiefComplaint: draft.chiefComplaint,
            intervalHistory: draft.intervalHistory,
            treatmentResponse: draft.treatmentResponse,
            sideEffects: draft.sideEffects,
            assessment: draft.assessment,
            plan: draft.plan,
            cptCode: codingRec.primaryCode,
            emLevel: codingRec.mdmLevel,
            mse: draft.mse,
            workingState: {
              selectedTemplateId,
              psychotherapyMinutes,
              candidateActions: draft.candidateActions,
              ambientTranscript: draft.ambientTranscript,
              lastAutosavedAt: new Date().toISOString(),
            },
          })
          .catch(() => {});
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [draft, selectedTemplateId, psychotherapyMinutes, codingRec, patient.id]);

  function showToast(msg: string) {
    setToastNotice(msg);
    setTimeout(() => {
      setToastNotice((prev) => (prev === msg ? null : prev));
    }, 3200);
  }

  // Clickable Chips Helper: Appends or toggles chip text in specific field
  function toggleChip(field: FieldName, text: string) {
    if (draft.status === "signed") return;
    setDraft((prev) => {
      const currentVal = prev[field] || "";
      if (currentVal.includes(text)) {
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
          const correctedChunk = correctSpeechTranscript(finalChunk.trim());
          setDraft((prev) => ({
            ...prev,
            [field]: (prev[field] ? prev[field] + " " : "") + correctedChunk,
          }));
        }
      };

      recognition.onerror = () => setMicListening(false);
      recognition.onend = () => setMicListening(false);

      recognition.start();
      recognitionRef.current = recognition;
      setActiveMicField(field);
      setMicListening(true);
      showToast(`🎙️ Dictating live into ${field}... (Psychiatric vocabulary tuned)`);
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

    setDraft((prev) => {
      const activeTranscript =
        prev.ambientTranscript.length > 0 ? prev.ambientTranscript : [...scenario.utterances];

      api.ai.extractEntities(activeTranscript, patient.meds)
        .then((extracted) => {
          if (extracted && extracted.length > 0) {
            setDraft((curr) => ({
              ...curr,
              candidateActions: extracted,
            }));
          }
        })
        .catch(() => {});

      return {
        ...prev,
        chiefComplaint: sNote.chiefComplaint,
        intervalHistory: sNote.intervalHistory,
        treatmentResponse: sNote.treatmentResponse,
        sideEffects: sNote.sideEffects,
        mse: { ...sNote.mse },
        assessment: sNote.assessment,
        plan: sNote.plan,
        candidateActions: [...sNote.candidateActions],
        ambientTranscript: activeTranscript,
      };
    });

    showToast("✦ Synthesized note blocks & extracted candidate orders with transcript provenance.");
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
DATE OF SERVICE: Sep 4, 2026 | PROVIDER: Current authenticated clinician
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
${draft.status === "signed" ? `Electronically Signed by ${draft.signedBy} on ${draft.signedAt}` : "DRAFT - Unsigned"}
    `.trim();

    navigator.clipboard?.writeText(fullText);
    showToast("📋 Clean note copied to clipboard.");
  }

  async function handleSignNote() {
    if (!attestationChecked) {
      showToast("Please check the verification attestation before signing.");
      return;
    }

    try {
      // Flush the exact reviewed state before signing so a pending autosave can never
      // cause the signed legal record to lag behind what the clinician reviewed.
      const saved = await api.encounters.saveDraft({
        id: draft.encounterId,
        patientId: patient.id,
        type: draft.visitType,
        chiefComplaint: draft.chiefComplaint,
        intervalHistory: draft.intervalHistory,
        treatmentResponse: draft.treatmentResponse,
        sideEffects: draft.sideEffects,
        assessment: draft.assessment,
        plan: draft.plan,
        cptCode: codingRec.primaryCode,
        emLevel: codingRec.mdmLevel,
        mse: draft.mse,
        workingState: {
          selectedTemplateId,
          psychotherapyMinutes,
          candidateActions: draft.candidateActions,
          ambientTranscript: draft.ambientTranscript,
          lastAutosavedAt: new Date().toISOString(),
        },
      });

      const backendSigned = await api.encounters.sign(saved.id);
      const signed: EncounterState = {
        ...draft,
        encounterId: backendSigned.id,
        status: "signed",
        signedBy: backendSigned.signedBy,
        signedAt: backendSigned.signedAt,
        selectedTemplateId,
        psychotherapyMinutes,
      };

      // Signed encounters never remain in the per-patient draft cache. The current
      // component can display the signed state, but the next visit starts a new encounter.
      clearEncounterDraft(patient.id);
      setDraft(signed);

      const newPast: PastEncounter = {
        id: backendSigned.id,
        date: backendSigned.date,
        provider: backendSigned.signedBy || "Authenticated clinician",
        type: `${backendSigned.type} (${backendSigned.cptCode})`,
        chiefComplaint: backendSigned.chiefComplaint,
        hpi: backendSigned.intervalHistory,
        assessment: backendSigned.assessment,
        plan: backendSigned.plan,
      };

      if (!patientEncounterHistory[patient.id]) {
        patientEncounterHistory[patient.id] = [];
      }
      if (!patientEncounterHistory[patient.id].some((e) => e.id === backendSigned.id)) {
        patientEncounterHistory[patient.id].unshift(newPast);
      }

      setReviewModalOpen(false);
      if (onEncounterSigned) {
        onEncounterSigned(patient.id);
      }
      showToast("Encounter signed, integrity-snapshotted, and locked in the legal medical record.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown signing error";
      console.error("Database sign encounter error:", error);
      showToast(`Could not sign encounter: ${message}`);
    }
  }

  const isLocked = draft.status === "signed";

  const [ftsResults, setFtsResults] = useState<Array<{
    encounterId: string;
    date: string;
    chiefComplaint: string;
    snippet: string;
    rank: number;
  }>>([]);

  useEffect(() => {
    if (!searchTerm.trim() || searchTerm.trim().length < 2) {
      setFtsResults([]);
      return;
    }
    const timer = setTimeout(() => {
      api.ai.searchNotes(searchTerm, patient.id)
        .then((res) => setFtsResults(res || []))
        .catch(() => setFtsResults([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [searchTerm, patient.id]);

  const filteredPastEncounters = useMemo(() => {
    if (!searchTerm.trim()) return pastEncounters;
    const term = searchTerm.toLowerCase();
    return pastEncounters.filter((enc) =>
      `${enc.chiefComplaint} ${enc.hpi} ${enc.assessment} ${enc.plan}`.toLowerCase().includes(term)
    );
  }, [pastEncounters, searchTerm]);

  return (
    <div className="encounter-workspace-root">
      {toastNotice && <div className="encounter-toast">{toastNotice}</div>}

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
          {ftsResults.length > 0 && (
            <div
              className="fts-highlights-banner"
              style={{
                margin: "8px 0 12px 0",
                padding: "8px 12px",
                background: "rgba(26, 115, 232, 0.08)",
                border: "1px solid rgba(26, 115, 232, 0.2)",
                borderRadius: "8px",
                fontSize: "12px",
                color: "#1a73e8",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <span>✦</span>
              <strong>SQLite FTS5 BM25 Ranked Matches ({ftsResults.length}):</strong>
              <span>Exact longitudinal citations from data/ehr.db</span>
            </div>
          )}
          <div className="drawer-results-grid">
            {ftsResults.length > 0
              ? ftsResults.map((r) => (
                  <div key={r.encounterId} className="drawer-result-item fts-matched">
                    <div className="result-header">
                      <strong>{r.chiefComplaint || "Clinical Note"}</strong>
                      <time>{r.date}</time>
                    </div>
                    <div
                      className="result-snippet"
                      style={{ fontSize: "12px", margin: "6px 0", color: "#3c4043", lineHeight: 1.4 }}
                      dangerouslySetInnerHTML={{
                        __html: r.snippet.replace(/\*\*(.*?)\*\*/g, "<mark style='background:#fef08a;padding:1px 3px;border-radius:2px;'>$1</mark>"),
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setDraft((p) => ({
                          ...p,
                          intervalHistory:
                            (p.intervalHistory ? p.intervalHistory + "\n" : "") +
                            `[Historical Context ${r.date}]: ${r.snippet.replace(/\*\*/g, "")}`,
                        }));
                        showToast(`Inserted citation from ${r.date} encounter!`);
                      }}
                      disabled={isLocked}
                    >
                      ✦ Insert Citation to Note
                    </button>
                  </div>
                ))
              : filteredPastEncounters.map((enc) => (
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

      <EncounterCodingDock codingRec={codingRec} />

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
