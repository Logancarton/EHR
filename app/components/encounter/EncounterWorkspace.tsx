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
  type CodingReference,
  defaultMse,
  builtInTemplates,
  calculateEncounterCoding,
  getSavedTemplatePreference,
  saveTemplatePreference,
  ambientScenarios,
  createInitialEncounter,
  formatSigningOutcomeMessage,
} from "../../lib/encounter-engine";
import {
  type SpeechRecognitionEventLike,
  type BrowserSpeechRecognition,
} from "../../domain/speech";
import { api } from "../../lib/api-client";
import { confirmScheduledVisit, scheduledVisitFor } from "../../lib/active-visit";
import { applyConfirmedAppointment } from "../../lib/schedule-store";
import { clinicalRecordApi } from "../../lib/clinical-record-api";
import { correctSpeechTranscript } from "../../lib/psychiatric-vocabulary";
import { useAuthSession } from "../auth/AuthSessionGate";
import {
  clearEncounterRecovery,
  clearLegacyEncounterDraft,
  encounterDraftFingerprint,
  encounterSaveCoordinator,
  loadEncounterRecovery,
  loadLegacyEncounterDraft,
  type EncounterDraftSavePayload,
  type EncounterSaveView,
} from "../../lib/encounter-save-lifecycle";
import {
  WORKSPACE_CARE_COMPLETION_CHANGED_EVENT,
  WORKSPACE_ENCOUNTER_SIGNED_EVENT,
  WORKSPACE_INSERT_TO_NOTE_EVENT,
  WORKSPACE_ORDER_CART_UPDATED_EVENT,
  WORKSPACE_ORDER_CREATED_EVENT,
  WORKSPACE_APPOINTMENT_UPDATED_EVENT,
  WORKSPACE_PATIENT_UPDATED_EVENT,
  WORKSPACE_TASKS_UPDATED_EVENT,
  dispatchWorkspaceEvent,
  subscribeWorkspaceEvent,
} from "../../lib/workspace-events";
import { useWorkspaceNavigation } from "../../lib/workspace-navigation-context";
import {
  buildVisitReadiness,
  type ReadinessAction,
  type VisitReadinessServerView,
} from "../../domain/visit-readiness";
import type { Section } from "../../domain/patient";

import EncounterToolbar from "./EncounterToolbar";
import EncounterScribePane from "./EncounterScribePane";
import EncounterNoteDocument, { type NarrativeField } from "./EncounterNoteDocument";
import EncounterContextRail, { type ContextEntry } from "./EncounterContextRail";
import EncounterCodingDock from "./EncounterCodingDock";
import EncounterReadinessPanel from "./EncounterReadinessPanel";
import EncounterSignModal from "./EncounterSignModal";
import SignedEncounterHistoryItem from "./SignedEncounterHistoryItem";
import Icon from "../ui/Icon";

type FieldName = "chiefComplaint" | "intervalHistory" | "treatmentResponse" | "sideEffects" | "assessment" | "plan";
type UnsafeguardedSavePayload = Omit<EncounterDraftSavePayload, "expectedUpdatedAt" | "expectedActorId">;
type EncounterRecord = Awaited<ReturnType<typeof api.encounters.list>>[number];

encounterSaveCoordinator.configureTransport(async (payload) => {
  const saved = await api.encounters.saveDraft(payload as any);
  // The link is the record's once the server has it, so it stops being a pending
  // start. Until this point it stays readable, because the chart renders in more
  // than one place and any of them may be the copy that saves.
  if (saved.appointmentId) confirmScheduledVisit(saved.patientId, saved.appointmentId);
  return {
    id: saved.id,
    patientId: saved.patientId,
    status: saved.status,
    updatedAt: saved.updatedAt,
  };
});

function savePayload(
  draft: EncounterState,
  selectedTemplateId: string,
  psychotherapyMinutes: number,
  codingRec: CodingRecommendation,
  appointmentId?: string,
): UnsafeguardedSavePayload {
  return {
    id: draft.encounterId,
    patientId: draft.patientId,
    // Carried on every save, not just the first. The coordinator can replace a
    // queued payload before it is sent, so a link that rode on one payload object
    // could be dropped and never recorded. The server keeps the link it already
    // has, which makes re-sending it free and clearing it impossible.
    appointmentId,
    type: draft.visitType,
    chiefComplaint: draft.chiefComplaint,
    intervalHistory: draft.intervalHistory,
    reviewOfSymptoms: draft.reviewOfSymptoms,
    treatmentResponse: draft.treatmentResponse,
    sideEffects: draft.sideEffects,
    assessment: draft.assessment,
    // Risk and follow-up were reaching the server nowhere: they are draft fields the
    // save payload never carried, so they survived only in local recovery and were
    // absent from the signed snapshot. Risk assessment is the last section that
    // should live only in one browser.
    riskAssessment: draft.riskAssessment,
    followUp: draft.followUp,
    plan: draft.plan,
    cptCode: codingRec.primaryCode,
    emLevel: codingRec.mdmLevel,
    mse: draft.mse,
    workingState: {
      selectedTemplateId,
      psychotherapyMinutes,
      addonCodes: codingRec.addonCodes,
      candidateActions: draft.candidateActions as unknown as Array<Record<string, unknown>>,
      ambientTranscript: draft.ambientTranscript as unknown as Array<Record<string, unknown>>,
      lastAutosavedAt: new Date().toISOString(),
    },
  };
}

export default function EncounterWorkspace({
  patient,
  preferences = defaultPreferences,
  onUpdatePreferences,
  onInsertText,
  onEncounterSigned,
  onDraftOrder,
  onOpenOrderCart,
  onNavigateSection,
  onOpenAdminDrawer,
}: {
  patient: Patient;
  preferences?: ProviderPreferences;
  onUpdatePreferences?: (updated: ProviderPreferences) => void;
  onInsertText?: (text: string) => void;
  onEncounterSigned?: (patientId: string, appointmentId?: string) => void;
  onDraftOrder?: (orderName: string) => void;
  onOpenOrderCart?: (tab?: "cart" | "prescribe" | "labs", prefill?: string) => void;
  /** Moves this patient's pane to another chart section (readiness actions). */
  onNavigateSection?: (section: Section) => void;
  /** Opens the patient's administrative record, where coverage is edited. */
  onOpenAdminDrawer?: () => void;
}) {
  const { user } = useAuthSession();
  const nav = useWorkspaceNavigation();
  const ownerId = user.userId;
  const initialRecovery = loadEncounterRecovery(ownerId, patient.id);
  const [draft, setDraft] = useState<EncounterState>(() => initialRecovery?.draft || createInitialEncounter(patient.id));
  const [saveState, setSaveState] = useState<EncounterSaveView | null>(null);
  // Flips once, when the server first acknowledges this encounter. Reference
  // extraction and the readiness read both need the encounter to exist there; a
  // brand-new note's first attempts precede that, so both re-run at this moment.
  const encounterPersisted = Boolean(saveState?.savedAt);
  const [legacyRecoveryAvailable, setLegacyRecoveryAvailable] = useState(
    () => Boolean(loadLegacyEncounterDraft(patient.id)),
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [showPastNotes, setShowPastNotes] = useState(false);
  const [scenarioKey, setScenarioKey] = useState<string>(
    patient.id in ambientScenarios ? patient.id : "maya-chen"
  );
  const scenario = ambientScenarios[scenarioKey] || ambientScenarios["maya-chen"];
  const [isAmbientPlaying, setIsAmbientPlaying] = useState(false);
  const [ambientCursor, setAmbientCursor] = useState(0);
  const [micListening, setMicListening] = useState(false);
  const [activeMicField, setActiveMicField] = useState<NarrativeField>("intervalHistory");
  const [mseOpen, setMseOpen] = useState(true);
  // Which section the scribe, dictation and candidate actions write into. The
  // document decides this by focus, so all three inputs land where the clinician is.
  const [activeNoteSection, setActiveNoteSection] = useState<string | null>(null);
  const [scribeOpen, setScribeOpen] = useState(false);
  // Context the clinician adds for the scribe. Deliberately separate from the note:
  // it is theirs until they send it to a section, so nothing typed here reaches the
  // legal record without an explicit act.
  const [contextEntries, setContextEntries] = useState<ContextEntry[]>([]);

  function addContextEntry(text: string) {
    setContextEntries((current) => [
      ...current,
      { id: `ctx-${Date.now()}-${current.length}`, text, createdAt: new Date().toISOString() },
    ]);
  }

  function removeContextEntry(id: string) {
    setContextEntries((current) => current.filter((entry) => entry.id !== id));
  }

  function appendToSection(section: NarrativeField, text: string) {
    setDraft((previous) => {
      const current = String((previous as unknown as Record<string, unknown>)[section] ?? "");
      return {
        ...previous,
        [section]: current.trim() ? [current.trim(), text].join("\n") : text,
      };
    });
  }

  function sendContextToSection(id: string, section: NarrativeField) {
    const entry = contextEntries.find((candidate) => candidate.id === id);
    if (!entry) return;
    appendToSection(section, entry.text);
    showToast(`Context added to ${section.replace(/([A-Z])/g, " $1").toLowerCase()}.`);
  }

  function setMseDimension(dimension: string, text: string) {
    setDraft((previous) => ({ ...previous, mse: { ...previous.mse, [dimension]: text } }));
  }

  // Allergies are not on the Patient shape this workspace receives, and a note must
  // never assert "no known allergies" from their absence. Load them explicitly and
  // keep loading/failed distinct from empty.
  const [allergyLoad, setAllergyLoad] = useState<
    { status: "loading" } | { status: "error" } | { status: "loaded"; values: string[] }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setAllergyLoad({ status: "loading" });
    clinicalRecordApi.snapshot(patient.id)
      .then((snapshot) => {
        if (cancelled) return;
        setAllergyLoad({
          status: "loaded",
          values: snapshot.allergies
            .filter((allergy) => allergy.status === "active")
            .map((allergy) => allergy.substance),
        });
      })
      .catch(() => {
        if (!cancelled) setAllergyLoad({ status: "error" });
      });
    return () => { cancelled = true; };
  }, [patient.id]);

  /**
   * The clinical records this note references.
   *
   * Coding reads these rather than searching the prose. An encounter that has none
   * — a draft never saved to the server, or one nothing has referenced yet — leaves
   * this empty, and the engine falls back to reading the note text and says so.
   */
  const [noteReferences, setNoteReferences] = useState<CodingReference[]>([]);
  const [noteReferenceStatus, setNoteReferenceStatus] = useState<"not-applicable" | "loading" | "loaded" | "error">("not-applicable");
  const [referenceReloadNonce, setReferenceReloadNonce] = useState(0);

  /**
   * The appointment this visit was started from, claimed once per chart.
   *
   * Held in a ref rather than read at save time: the claim is one-shot by design
   * (so a later, unrelated encounter cannot inherit it), and a save payload can be
   * replaced in the queue before it is sent. Claiming here and re-sending the same
   * value on every save is what makes the link survive that.
   */
  const scheduledAppointmentId = scheduledVisitFor(patient.id);

  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [toastNotice, setToastNotice] = useState<string | null>(null);
  const [attestationChecked, setAttestationChecked] = useState(false);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const lastObservedFingerprintRef = useRef("");

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(() => {
    return initialRecovery?.selectedTemplateId || draft.selectedTemplateId || getSavedTemplatePreference();
  });

  const activeTemplate = useMemo(() => {
    return builtInTemplates.find((t) => t.id === selectedTemplateId) || builtInTemplates[0];
  }, [selectedTemplateId]);

  const [psychotherapyMinutes, setPsychotherapyMinutes] = useState<number>(() => {
    return initialRecovery?.psychotherapyMinutes ?? draft.psychotherapyMinutes ?? activeTemplate.defaultPsychotherapyMinutes;
  });

  const [pastEncounters, setPastEncounters] = useState<EncounterRecord[]>([]);
  const [pastEncountersStatus, setPastEncountersStatus] = useState<"loading" | "loaded" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    setPastEncounters([]);
    setPastEncountersStatus("loading");
    let recovery = loadEncounterRecovery(ownerId, patient.id);
    let loaded = recovery?.draft || createInitialEncounter(patient.id);

    if (loaded.status === "signed") {
      clearEncounterRecovery(ownerId, patient.id);
      recovery = null;
      loaded = createInitialEncounter(patient.id);
    }

    const applyTemplateState = (state: EncounterState, recovered = recovery) => {
      const templateId = recovered?.selectedTemplateId || state.selectedTemplateId || getSavedTemplatePreference();
      const template = builtInTemplates.find((item) => item.id === templateId) || builtInTemplates[0];
      const minutes = recovered?.psychotherapyMinutes ?? state.psychotherapyMinutes ?? template.defaultPsychotherapyMinutes;
      setSelectedTemplateId(templateId);
      setPsychotherapyMinutes(minutes);
      return { templateId, minutes };
    };

    const templateState = applyTemplateState(loaded);
    lastObservedFingerprintRef.current = encounterDraftFingerprint(
      loaded,
      templateState.templateId,
      templateState.minutes,
    );
    setDraft(loaded);
    setLegacyRecoveryAvailable(Boolean(loadLegacyEncounterDraft(patient.id)));
    setScenarioKey(patient.id in ambientScenarios ? patient.id : "maya-chen");
    setIsAmbientPlaying(false);
    setAmbientCursor(0);

    encounterSaveCoordinator.beginHydration({
      ownerId,
      patientId: patient.id,
      encounterId: loaded.encounterId,
      recovery,
    });
    const unsubscribe = encounterSaveCoordinator.subscribe(ownerId, patient.id, (state) => {
      if (!cancelled) setSaveState(state);
    });

    if (recovery?.dirty) {
      const recoveredCoding = calculateEncounterCoding(loaded, templateState.minutes);
      encounterSaveCoordinator.queue({
        ownerId,
        draft: loaded,
        selectedTemplateId: templateState.templateId,
        psychotherapyMinutes: templateState.minutes,
        payload: savePayload(loaded, templateState.templateId, templateState.minutes, recoveredCoding, scheduledAppointmentId),
      });
    }

    api.encounters
      .list(patient.id)
      .then((records) => {
        if (cancelled) return;
        setPastEncounters(
          records
            .filter((record) => record.status === "signed")
            .sort((left, right) =>
              (right.signedAt || right.updatedAt).localeCompare(left.signedAt || left.updatedAt),
            ),
        );
        setPastEncountersStatus("loaded");
        const backendDraft = records.find((record) => record.status === "draft");
        const localChangedSinceHydrationStarted = encounterSaveCoordinator.isDirty(ownerId, patient.id);

        if (!backendDraft) {
          encounterSaveCoordinator.finishHydration(ownerId, patient.id);
          return;
        }

        if (localChangedSinceHydrationStarted) {
          encounterSaveCoordinator.finishHydration(
            ownerId,
            patient.id,
            backendDraft.id === loaded.encounterId ? backendDraft.updatedAt : undefined,
          );
          return;
        }

        const working = backendDraft.workingState;
        const hydrated: EncounterState = {
          ...loaded,
          patientId: backendDraft.patientId,
          encounterId: backendDraft.id,
          date: backendDraft.date,
          visitType: backendDraft.type,
          status: "draft",
          selectedTemplateId: working?.selectedTemplateId || loaded.selectedTemplateId,
          psychotherapyMinutes: working?.psychotherapyMinutes ?? loaded.psychotherapyMinutes,
          chiefComplaint: backendDraft.chiefComplaint,
          intervalHistory: backendDraft.intervalHistory,
          // Older drafts predate these columns, so fall back to the locally
          // recovered draft rather than blanking a section the server never stored.
          reviewOfSymptoms: backendDraft.reviewOfSymptoms || loaded.reviewOfSymptoms,
          treatmentResponse: backendDraft.treatmentResponse,
          sideEffects: backendDraft.sideEffects,
          mse: { ...defaultMse, ...backendDraft.mse },
          assessment: backendDraft.assessment,
          riskAssessment: backendDraft.riskAssessment || loaded.riskAssessment,
          followUp: backendDraft.followUp || loaded.followUp,
          plan: backendDraft.plan,
          candidateActions:
            (working?.candidateActions as CandidateAction[] | undefined) || loaded.candidateActions,
          ambientTranscript:
            (working?.ambientTranscript as EncounterState["ambientTranscript"] | undefined) || loaded.ambientTranscript,
          lastAutosavedAt: working?.lastAutosavedAt || backendDraft.updatedAt,
        };
        const hydratedTemplateId = hydrated.selectedTemplateId || getSavedTemplatePreference();
        const hydratedTemplate = builtInTemplates.find((item) => item.id === hydratedTemplateId) || builtInTemplates[0];
        const hydratedMinutes = hydrated.psychotherapyMinutes ?? hydratedTemplate.defaultPsychotherapyMinutes;
        lastObservedFingerprintRef.current = encounterDraftFingerprint(
          hydrated,
          hydratedTemplateId,
          hydratedMinutes,
        );
        setDraft(hydrated);
        setSelectedTemplateId(hydratedTemplateId);
        setPsychotherapyMinutes(hydratedMinutes);
        encounterSaveCoordinator.acceptHydrated({
          ownerId,
          draft: hydrated,
          selectedTemplateId: hydratedTemplateId,
          psychotherapyMinutes: hydratedMinutes,
          serverUpdatedAt: backendDraft.updatedAt,
        });
        encounterSaveCoordinator.finishHydration(ownerId, patient.id, backendDraft.updatedAt);
      })
      .catch(() => {
        if (!cancelled) {
          setPastEncountersStatus("error");
          encounterSaveCoordinator.finishHydration(ownerId, patient.id);
        }
      });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [ownerId, patient.id]);

  const codingRec: CodingRecommendation = useMemo(() => {
    return calculateEncounterCoding(draft, psychotherapyMinutes, noteReferences);
  }, [draft, psychotherapyMinutes, noteReferences]);

  /**
   * Visit readiness (D-100): the chart-side facts the draft cannot see.
   *
   * Keyed by patient and encounter. A response for any other key is discarded, so
   * a slow answer for the chart that was open a moment ago can never paint its
   * prompts into this one. Re-read whenever something that owns one of its facts
   * announces a change, and on demand.
   */
  const [readinessServer, setReadinessServer] = useState<VisitReadinessServerView | null>(null);
  const [readinessError, setReadinessError] = useState<string | null>(null);
  const [readinessRefreshing, setReadinessRefreshing] = useState(false);
  const [readinessNonce, setReadinessNonce] = useState(0);
  const readinessKeyRef = useRef("");
  const [readinessCollapsed, setReadinessCollapsed] = useState<boolean>(() => {
    try {
      return typeof window !== "undefined" && window.localStorage.getItem("ehr.encounter.readiness.collapsed") === "1";
    } catch {
      return false;
    }
  });
  const [focusMode, setFocusMode] = useState(false);
  // On a narrow pane readiness sits above the note, so it starts as a one-line bar
  // (count still visible) and expands on request, independent of the wide-pane
  // preference to collapse the margin column.
  const encounterRootRef = useRef<HTMLDivElement | null>(null);
  const [narrowPane, setNarrowPane] = useState(false);
  const [narrowReadinessOpen, setNarrowReadinessOpen] = useState(false);
  useEffect(() => {
    const node = encounterRootRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? node.clientWidth;
      setNarrowPane(width <= 1180);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const [toolbarPanelRequest, setToolbarPanelRequest] = useState<{ panel: "time" | "template"; nonce: number } | null>(null);

  const readinessEncounterId = draft.patientId === patient.id ? draft.encounterId : null;
  useEffect(() => {
    const key = `${patient.id}|${readinessEncounterId ?? ""}`;
    const keyChanged = readinessKeyRef.current !== key;
    readinessKeyRef.current = key;
    if (keyChanged) {
      setReadinessServer(null);
      setReadinessError(null);
    }
    let cancelled = false;
    setReadinessRefreshing(true);
    api.visitReadiness
      .get(patient.id, readinessEncounterId)
      .then((view) => {
        if (cancelled || readinessKeyRef.current !== key || view.patientId !== patient.id) return;
        setReadinessServer(view);
        setReadinessError(null);
      })
      .catch((error) => {
        if (cancelled || readinessKeyRef.current !== key) return;
        setReadinessError(error instanceof Error ? error.message : "Visit readiness could not be loaded");
      })
      .finally(() => {
        if (!cancelled) setReadinessRefreshing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [patient.id, readinessEncounterId, readinessNonce, noteReferences, encounterPersisted]);

  useEffect(() => {
    const refresh = () => setReadinessNonce((current) => current + 1);
    const unsubscribers = [
      subscribeWorkspaceEvent(WORKSPACE_ORDER_CART_UPDATED_EVENT, refresh),
      subscribeWorkspaceEvent(WORKSPACE_ORDER_CREATED_EVENT, refresh),
      subscribeWorkspaceEvent(WORKSPACE_APPOINTMENT_UPDATED_EVENT, refresh),
      subscribeWorkspaceEvent(WORKSPACE_TASKS_UPDATED_EVENT, refresh),
      subscribeWorkspaceEvent(WORKSPACE_CARE_COMPLETION_CHANGED_EVENT, refresh),
      subscribeWorkspaceEvent(WORKSPACE_PATIENT_UPDATED_EVENT, (detail) => {
        if (detail.patientId === patient.id) refresh();
      }),
    ];
    // Coverage is edited in the administrative drawer and the practice setup in
    // Billing; returning to this window is the moment either may have changed.
    window.addEventListener("focus", refresh);
    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      window.removeEventListener("focus", refresh);
    };
  }, [patient.id]);

  /**
   * Load this encounter's references, and reload them when its orders change.
   *
   * A staged order that becomes medication truth is what establishes prescription
   * drug management, so the coding dock has to see it without a reload. A draft
   * that exists only in this browser has no server encounter to read, which is not
   * an error: it simply has no references yet.
   */
  useEffect(() => {
    const encounterId = draft.encounterId;
    if (!encounterId || draft.patientId !== patient.id) {
      setNoteReferences([]);
      setNoteReferenceStatus("not-applicable");
      return;
    }

    let cancelled = false;
    const load = () => {
      setNoteReferenceStatus("loading");
      api.encounters
        .references(encounterId, patient.id)
        .then((records) => {
          if (!cancelled) {
            setNoteReferences(records);
            setNoteReferenceStatus("loaded");
          }
        })
        .catch(() => {
          if (!cancelled) setNoteReferenceStatus("error");
        });
    };

    load();
    const unsubOrderCart = subscribeWorkspaceEvent(WORKSPACE_ORDER_CART_UPDATED_EVENT, load);
    return () => {
      cancelled = true;
      unsubOrderCart();
    };
  }, [draft.encounterId, draft.patientId, patient.id, referenceReloadNonce]);

  /**
   * Propose references from the sections that carry the coding weight.
   *
   * Assessment and Plan decide problems addressed and prescription drug
   * management, and both are short. Debounced rather than fired on blur so that
   * dictation, template application, and typing all settle the same way; the
   * server no-ops on unchanged text, so an extra call costs nothing.
   *
   * Never blocking and never fatal. Extraction failing leaves the note exactly as
   * it is — the coding dock falls back to reading the text and says so.
   */
  useEffect(() => {
    const encounterId = draft.encounterId;
    if (!encounterId || draft.status === "signed" || draft.patientId !== patient.id) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      const sections: Array<["assessment" | "plan", string]> = [
        ["assessment", draft.assessment || ""],
        ["plan", draft.plan || ""],
      ];

      void Promise.all(
        sections.map(([section, sectionText]) =>
          api.encounters
            .extractReferences(encounterId, patient.id, section, sectionText)
            .catch(() => null),
        ),
      ).then((results) => {
        if (cancelled) return;
        const latest = results.filter(Boolean).pop();
        if (latest) {
          setNoteReferences(latest);
          setNoteReferenceStatus("loaded");
        }
      });
    }, 1500);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [draft.encounterId, draft.patientId, draft.status, draft.assessment, draft.plan, patient.id, encounterPersisted]);

  useEffect(() => {
    if (draft.status === "signed" || draft.patientId !== patient.id) return;
    const fingerprint = encounterDraftFingerprint(draft, selectedTemplateId, psychotherapyMinutes);
    if (fingerprint === lastObservedFingerprintRef.current) return;
    lastObservedFingerprintRef.current = fingerprint;

    encounterSaveCoordinator.queue({
      ownerId,
      draft,
      selectedTemplateId,
      psychotherapyMinutes,
      payload: savePayload(draft, selectedTemplateId, psychotherapyMinutes, codingRec, scheduledAppointmentId),
    });
  }, [draft, selectedTemplateId, psychotherapyMinutes, codingRec, ownerId, patient.id]);

  function showToast(msg: string) {
    setToastNotice(msg);
    setTimeout(() => {
      setToastNotice((prev) => (prev === msg ? null : prev));
    }, 3200);
  }

  useEffect(() => {
    return subscribeWorkspaceEvent(WORKSPACE_INSERT_TO_NOTE_EVENT, (detail) => {
      if (detail && detail.patientId === patient.id && draft.status !== "signed") {
        setDraft((prev) => ({
          ...prev,
          intervalHistory: prev.intervalHistory
            ? `${prev.intervalHistory}\n\n${detail.text}`
            : detail.text,
        }));
        showToast("Inserted AI clinical synthesis into note");
      }
    });
  }, [patient.id, draft.status]);

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
      }
      if (!currentVal.trim()) return { ...prev, [field]: text };
      if (field === "plan" || field === "assessment") {
        return { ...prev, [field]: `${currentVal}\n• ${text}` };
      }
      return { ...prev, [field]: `${currentVal}; ${text}` };
    });
  }

  function isChipActive(field: FieldName, text: string): boolean {
    return (draft[field] || "").includes(text);
  }

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

  function handlePsychotherapyChange(minutes: number) {
    const next = Math.max(0, Math.min(120, minutes));
    setPsychotherapyMinutes(next);
    setDraft((prev) => ({ ...prev, psychotherapyMinutes: next }));
    if (next >= 16 && next <= 37) showToast(`+90833 Psychotherapy Add-on qualified (${next} min documented)`);
    else if (next >= 38 && next <= 52) showToast(`+90836 Psychotherapy Add-on qualified (${next} min documented)`);
    else if (next >= 53) showToast(`+90838 Psychotherapy Add-on qualified (${next} min documented)`);
  }

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

  // Every narrative section in the document can be dictated into, including the
  // ones added with it. A dictation target list that lags the note's sections
  // silently makes some of them typing-only.
  function toggleLiveMic(field: NarrativeField = "intervalHistory") {
    if (typeof window === "undefined") return;

    if (micListening) {
      recognitionRef.current?.stop();
      setMicListening(false);
      showToast("Microphone paused.");
      return;
    }

    const SpeechRecognitionConstructor = window.SpeechRecognition || window.webkitSpeechRecognition;
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
          if (item?.isFinal) finalChunk += item[0]?.transcript + " ";
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
      showToast(`Dictating live into ${field}... (Psychiatric vocabulary tuned)`);
    } catch {
      showToast("Could not access microphone.");
      setMicListening(false);
    }
  }

  function handleStartAmbient() {
    setDraft((prev) => ({ ...prev, ambientTranscript: [] }));
    setAmbientCursor(0);
    setIsAmbientPlaying(true);
    showToast(`Started ambient clinical dialogue for ${scenario.title}`);
  }

  function handleSynthesizeFromAmbient() {
    setIsAmbientPlaying(false);
    const sNote = scenario.synthesizedNote;

    // Computed from current state, not inside the updater below. Assigning a
    // variable inside a setState updater and reading it afterwards is a race:
    // React may not have run the updater yet, so the message would always be wrong.
    const skippedSections = ([
      ["chief complaint", draft.chiefComplaint],
      ["interval history", draft.intervalHistory],
      ["treatment response", draft.treatmentResponse],
      ["side effects", draft.sideEffects],
      ["assessment", draft.assessment],
      ["plan", draft.plan],
    ] as const)
      .filter(([, value]) => value.trim())
      .map(([label]) => label);

    setDraft((prev) => {
      const activeTranscript = prev.ambientTranscript.length > 0 ? prev.ambientTranscript : [...scenario.utterances];
      api.ai.extractEntities(activeTranscript, patient.meds)
        .then((extracted) => {
          if (extracted && extracted.length > 0) {
            setDraft((curr) => ({ ...curr, candidateActions: extracted }));
          }
        })
        .catch(() => {});

      // The scribe fills what is empty and leaves what the clinician wrote alone.
      // Overwriting would silently destroy dictated text, typed text, and context
      // deliberately sent to a section — the very work this flow is built around.
      const keepOrFill = (existing: string, synthesized: string) =>
        existing.trim() ? existing : synthesized;

      const mse = { ...prev.mse };
      for (const [dimension, text] of Object.entries(sNote.mse)) {
        const existing = String((prev.mse as unknown as Record<string, string>)[dimension] ?? "");
        (mse as unknown as Record<string, string>)[dimension] = keepOrFill(existing, text);
      }

      return {
        ...prev,
        chiefComplaint: keepOrFill(prev.chiefComplaint, sNote.chiefComplaint),
        intervalHistory: keepOrFill(prev.intervalHistory, sNote.intervalHistory),
        treatmentResponse: keepOrFill(prev.treatmentResponse, sNote.treatmentResponse),
        sideEffects: keepOrFill(prev.sideEffects, sNote.sideEffects),
        mse,
        assessment: keepOrFill(prev.assessment, sNote.assessment),
        plan: keepOrFill(prev.plan, sNote.plan),
        candidateActions: [...sNote.candidateActions],
        ambientTranscript: activeTranscript,
      };
    });

    showToast(
      skippedSections.length > 0
        ? `Scribed the empty sections. Left your own text in ${skippedSections.join(", ")}.`
        : "Scribed the note from the transcript, with candidate orders extracted.",
    );
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
    // The exported note must be the note on screen. Chart-sourced sections are
    // rendered in the document, so they belong in the copy too — an export that
    // silently drops medications or allergies is a different note.
    const bullets = (values: string[] | undefined, empty: string) =>
      values && values.length ? values.map((value) => `• ${value}`).join("\n") : empty;
    const medicationLines = bullets(patient.meds, "No active medications recorded.");
    const allergyLines = allergyLoad.status === "loaded"
      ? bullets(allergyLoad.values, "Allergy status not assessed this visit.")
      : allergyLoad.status === "loading"
        ? "Allergies still loading — not exported."
        : "Allergies could not be loaded. Do not read this as no known allergies.";
    const diagnosisLines = bullets(patient.diagnoses, "No active diagnoses recorded.");

    const fullText = `
OUTPATIENT ADULT & ADOLESCENT PSYCHIATRY
PSYCHIATRIC EVALUATION & MANAGEMENT NOTE

PATIENT: ${patient.name} | MRN: ${patient.mrn} | DOB: ${patient.dob} (${patient.age}y)
DATE OF SERVICE: ${draft.date} | PROVIDER: Current authenticated clinician
VISIT TYPE: ${draft.visitType} | CPT CODING: ${codingRec.primaryCode} ${codingRec.addonCodes.join(" ")}

CHIEF COMPLAINT:
${draft.chiefComplaint || "Routine psychiatric follow-up."}

INTERVAL HISTORY:
${draft.intervalHistory || "None documented."}

REVIEW OF SYMPTOMS:
${draft.reviewOfSymptoms || "Not documented this visit."}

CURRENT MEDICATIONS:
${medicationLines}

ALLERGIES:
${allergyLines}

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

DIAGNOSES:
${diagnosisLines}

CLINICAL ASSESSMENT & MDM:
${draft.assessment || "Clinical assessment pending."}
Medical Decision Making Level: ${codingRec.mdmLevel.toUpperCase()} (${codingRec.mdmReasoning})

RISK ASSESSMENT:
${draft.riskAssessment || "Not documented this visit."}

TREATMENT PLAN & ORDERS:
${draft.plan || "Plan as documented."}
${psychotherapyMinutes >= 16 ? `\nPsychotherapy Provided: ${psychotherapyMinutes} minutes of interactive psychotherapy.` : ""}

FOLLOW-UP:
${draft.followUp || "Not documented this visit."}

SIGNATURE:
${draft.status === "signed" ? `Electronically Signed by ${draft.signedBy} on ${draft.signedAt}` : "DRAFT - Unsigned"}
    `.trim();

    void navigator.clipboard?.writeText(fullText);
    showToast("Clean note copied to clipboard.");
  }

  async function handleRecoverLegacyDraft() {
    const legacy = loadLegacyEncounterDraft(patient.id);
    if (!legacy) {
      setLegacyRecoveryAvailable(false);
      return;
    }
    const templateId = legacy.selectedTemplateId || getSavedTemplatePreference();
    const template = builtInTemplates.find((item) => item.id === templateId) || builtInTemplates[0];
    const minutes = legacy.psychotherapyMinutes ?? template.defaultPsychotherapyMinutes;
    const legacyCoding = calculateEncounterCoding(legacy, minutes);

    encounterSaveCoordinator.beginHydration({
      ownerId,
      patientId: patient.id,
      encounterId: legacy.encounterId,
    });
    encounterSaveCoordinator.queue({
      ownerId,
      draft: legacy,
      selectedTemplateId: templateId,
      psychotherapyMinutes: minutes,
      payload: savePayload(legacy, templateId, minutes, legacyCoding, scheduledAppointmentId),
    });

    try {
      const records = await api.encounters.list(patient.id);
      const matching = records.find((record) => record.status === "draft" && record.id === legacy.encounterId);
      encounterSaveCoordinator.finishHydration(ownerId, patient.id, matching?.updatedAt);
    } catch {
      encounterSaveCoordinator.finishHydration(ownerId, patient.id);
    }

    lastObservedFingerprintRef.current = encounterDraftFingerprint(legacy, templateId, minutes);
    setDraft(legacy);
    setSelectedTemplateId(templateId);
    setPsychotherapyMinutes(minutes);
    setLegacyRecoveryAvailable(false);
    clearLegacyEncounterDraft(patient.id);
    showToast("Recovered the older local draft into your authenticated clinician workspace.");
  }

  async function handleOpenReviewModal() {
    if (draft.status === "signed") {
      setReviewModalOpen(true);
      return;
    }

    // The closing ceremony reads encounter-scoped evidence immediately. Do not
    // open it against a client-only draft id while autosave is still creating
    // that encounter: the evidence route must be able to distinguish "no
    // references" from "this encounter does not exist."
    encounterSaveCoordinator.queue({
      ownerId,
      draft,
      selectedTemplateId,
      psychotherapyMinutes,
      payload: savePayload(draft, selectedTemplateId, psychotherapyMinutes, codingRec, scheduledAppointmentId),
    });

    const flushed = await encounterSaveCoordinator.flush(ownerId, patient.id);
    if (flushed.status === "failed" || flushed.dirty || flushed.status === "unsaved") {
      showToast(
        `Could not open Review & Sign: ${flushed.error || "the current draft has not been acknowledged by the server yet."}`,
      );
      return;
    }

    // Reference proposals normally follow typing after a short pause. A clinician
    // who opens signing inside that pause would otherwise review a Diagnoses step
    // missing what the Assessment and Plan now name, so the saved text is
    // extracted first. Unchanged text costs nothing on the server, and a failure
    // here leaves the modal's own reference load to report it.
    const extracted = await Promise.all(
      (["assessment", "plan"] as const).map((section) =>
        api.encounters
          .extractReferences(draft.encounterId, patient.id, section, draft[section] || "")
          .catch(() => null),
      ),
    );
    const latest = extracted.filter(Boolean).pop();
    if (latest) setNoteReferences(latest);

    setReviewModalOpen(true);
  }

  async function handleSignNote() {
    if (!attestationChecked) {
      showToast("Please check the verification attestation before signing.");
      return;
    }

    try {
      encounterSaveCoordinator.queue({
        ownerId,
        draft,
        selectedTemplateId,
        psychotherapyMinutes,
        payload: savePayload(draft, selectedTemplateId, psychotherapyMinutes, codingRec, scheduledAppointmentId),
      });
      const flushed = await encounterSaveCoordinator.flush(ownerId, patient.id);
      if (flushed.status === "failed" || flushed.dirty || flushed.status === "unsaved") {
        throw new Error(flushed.error || "The reviewed draft has not been acknowledged by the server yet.");
      }

      const backendSigned = await api.encounters.sign(draft.encounterId);
      const signed: EncounterState = {
        ...draft,
        encounterId: backendSigned.id,
        status: "signed",
        signedBy: backendSigned.signedBy,
        signedAt: backendSigned.signedAt,
        selectedTemplateId,
        psychotherapyMinutes,
      };

      encounterSaveCoordinator.markSigned(ownerId, patient.id, backendSigned.id);
      clearLegacyEncounterDraft(patient.id);
      setLegacyRecoveryAvailable(false);
      setDraft(signed);

      // Close the visit this note was written for.
      //
      // This used to list the patient's appointments and complete the first one
      // that was still open — so a patient with a morning and an afternoon visit
      // had the morning one closed by the afternoon's note, and a chart opened
      // outside the schedule closed whatever happened to be next. The record says
      // which visit this is, or nothing does.
      const operationalWarnings: string[] = [];
      const signedAppointmentId = backendSigned.appointmentId;
      if (signedAppointmentId) {
        try {
          const closed = await api.appointments.updateStatus(
            signedAppointmentId,
            "completed",
            patient.id,
          );
          applyConfirmedAppointment(closed);
          dispatchWorkspaceEvent(WORKSPACE_APPOINTMENT_UPDATED_EVENT, {
            appointmentId: closed.id,
            status: closed.status,
          });
        } catch (apptErr) {
          // The note is signed and immutable regardless (D-017). Say what did not
          // happen rather than leaving the roster quietly wrong.
          const detail = apptErr instanceof Error ? apptErr.message : "unknown error";
          operationalWarnings.push(`visit could not be marked completed: ${detail}`);
        }
      }

      // Stage follow-up queue item.
      try {
        const response = await fetch("/api/tasks", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // A patient-bound action needs the active chart; without this header the
            // gateway refused every follow-up task with a 400 that only reached the
            // console, so the visit closed with no follow-up anywhere.
            "x-ehr-patient-id": patient.id,
          },
          body: JSON.stringify({
            type: "task",
            patientId: patient.id,
            text: `Follow-up visit: ${draft.plan?.slice(0, 60) || "Routine psychiatric medication response review"}`,
            due: "In 4 weeks",
          }),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || `Follow-up task was refused (${response.status}).`);
        }
        dispatchWorkspaceEvent(WORKSPACE_TASKS_UPDATED_EVENT);
      } catch (taskErr) {
        const detail = taskErr instanceof Error ? taskErr.message : "unknown error";
        operationalWarnings.push(`follow-up task was not created: ${detail}`);
      }

      setPastEncounters((current) => [
        backendSigned,
        ...current.filter((encounter) => encounter.id !== backendSigned.id),
      ]);
      setPastEncountersStatus("loaded");

      setReviewModalOpen(false);
      dispatchWorkspaceEvent(WORKSPACE_ENCOUNTER_SIGNED_EVENT, {
        patientId: patient.id,
        appointmentId: signedAppointmentId,
      });
      if (onEncounterSigned) onEncounterSigned(patient.id, signedAppointmentId);
      showToast(formatSigningOutcomeMessage(operationalWarnings));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown signing error";
      console.error("Database sign encounter error:", error);
      showToast(`Could not sign encounter: ${message}`);
    }
  }

  const isLocked = draft.status === "signed";

  const readiness = useMemo(
    () =>
      buildVisitReadiness({
        draft: {
          sections: {
            chiefComplaint: draft.chiefComplaint,
            intervalHistory: draft.intervalHistory,
            assessment: draft.assessment,
            plan: draft.plan,
            followUp: draft.followUp,
            riskAssessment: draft.riskAssessment,
          },
          goals: codingRec.goals,
          primaryCode: codingRec.primaryCode,
          addonCodes: codingRec.addonCodes,
          evidenceBasis: codingRec.evidenceBasis,
          noteTemplateId: selectedTemplateId,
          templateExpectsPsychotherapy: activeTemplate.defaultPsychotherapyMinutes > 0,
          psychotherapyMinutes,
        },
        server: readinessServer,
        serverError: readinessError,
        referenceRefreshFailed: noteReferenceStatus === "error",
        isSigned: draft.status === "signed",
      }),
    [draft, codingRec, selectedTemplateId, activeTemplate, psychotherapyMinutes, readinessServer, readinessError, noteReferenceStatus],
  );

  function toggleReadinessCollapsed() {
    setReadinessCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem("ehr.encounter.readiness.collapsed", next ? "1" : "0");
      } catch {
        // A view preference that cannot be remembered is still applied now.
      }
      return next;
    });
  }

  /** Scrolls the section into view and puts the cursor in it. */
  function focusNoteSection(section: string) {
    const root = document.querySelector<HTMLElement>(`[data-encounter-patient-id="${CSS.escape(patient.id)}"]`);
    const target =
      root?.querySelector<HTMLElement>(`[data-note-section="${CSS.escape(section)}"]`) ??
      root?.querySelector<HTMLElement>(`[data-note-section^="${CSS.escape(section)}."]`);
    if (!target) return;
    if (focusMode) setFocusMode(false);
    // Scroll the note column itself. `scrollIntoView` would also scroll the
    // clipped ancestors that are never meant to move, pushing the toolbar away.
    const column = target.closest<HTMLElement>(".encounter-paper-column");
    if (column) {
      const offset = target.getBoundingClientRect().top - column.getBoundingClientRect().top;
      column.scrollTo({ top: column.scrollTop + offset - column.clientHeight / 4, behavior: "smooth" });
    }
    const field = target.querySelector<HTMLElement>("textarea, input, [contenteditable='true']");
    field?.focus({ preventScroll: true });
  }

  function handleReadinessAction(action: ReadinessAction) {
    switch (action.kind) {
      case "focus-section":
        focusNoteSection(action.section);
        return;
      case "therapy-time":
        setToolbarPanelRequest({ panel: "time", nonce: Date.now() });
        return;
      case "open-chart":
        if (onNavigateSection) onNavigateSection(action.section);
        else showToast(`Open the ${action.section} tab to continue.`);
        return;
      case "open-schedule":
        nav.openToday();
        return;
      case "open-billing":
        nav.openGlobalModule("billing");
        return;
      case "patient-admin":
        if (onOpenAdminDrawer) onOpenAdminDrawer();
        else showToast("Open Patient info to update insurance.");
        return;
      case "retry":
        setReferenceReloadNonce((current) => current + 1);
        setReadinessNonce((current) => current + 1);
        return;
    }
  }

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
      `${enc.chiefComplaint} ${enc.intervalHistory} ${enc.assessment} ${enc.plan} ${enc.followUp}`.toLowerCase().includes(term)
    );
  }, [pastEncounters, searchTerm]);

  return (
    <>
      {/*
        The note region is a stacking context of its own (see `.encounter-workspace-root`).
        Its chrome — the toolbar and the coding dock — needs to sit above the
        scrolling note beneath it and nothing else, so those layers are kept local
        here rather than competing with the app's rails, header and workspace
        overlays for the same z-index space.

        The two genuinely app-level layers are therefore rendered outside it: a
        toast and the signing ceremony both cover the whole viewport and must not
        be trapped under the chrome they are meant to sit above.
      */}
      <div ref={encounterRootRef} className="encounter-workspace-root" data-encounter-id={draft.encounterId} data-encounter-patient-id={patient.id}>
        <EncounterToolbar
          selectedTemplateId={selectedTemplateId}
          onSelectTemplate={handleSelectTemplate}
          onSaveAsDefaultTemplate={handleSaveAsDefaultTemplate}
          onApplyTemplateDefaults={handleApplyTemplateDefaults}
          showPastNotes={showPastNotes}
          onTogglePastNotes={() => setShowPastNotes(!showPastNotes)}
          pastNotesCount={pastEncounters.length}
          pastNotesAvailable={preferences.encounter.showPastEncountersSearch}
          psychotherapyMinutes={psychotherapyMinutes}
          onPsychotherapyChange={handlePsychotherapyChange}
          isLocked={isLocked}
          saveState={saveState}
          signedAt={draft.signedAt}
          onRetrySave={() => void encounterSaveCoordinator.retry(ownerId, patient.id)}
          legacyRecoveryAvailable={legacyRecoveryAvailable}
          onRecoverLegacyDraft={() => void handleRecoverLegacyDraft()}
          onCopyNote={handleCopyCleanNote}
          onPrint={() => window.print()}
          onOpenReviewModal={() => void handleOpenReviewModal()}
          focusMode={focusMode}
          onToggleFocusMode={() => setFocusMode((current) => !current)}
          panelRequest={toolbarPanelRequest}
        />

        {showPastNotes && preferences.encounter.showPastEncountersSearch && (
          <section className="past-notes-drawer-card">
            <div className="drawer-heading">
              <strong>Longitudinal Record · Search Past Encounters</strong>
              <button type="button" className="drawer-close" onClick={() => setShowPastNotes(false)}><Icon name="close" /></button>
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
                style={{ margin: "8px 0 12px 0", padding: "8px 12px", background: "rgba(26, 115, 232, 0.08)", border: "1px solid rgba(26, 115, 232, 0.2)", borderRadius: "8px", fontSize: "12px", color: "#1a73e8", display: "flex", alignItems: "center", gap: "8px" }}
              >
                <span><Icon name="auto_awesome" /></span>
                <strong>SQLite FTS5 BM25 Ranked Matches ({ftsResults.length}):</strong>
                <span>Exact longitudinal citations from data/ehr.db</span>
              </div>
            )}
            {pastEncountersStatus === "loading" && (
              <p role="status">Loading signed encounter history…</p>
            )}
            {pastEncountersStatus === "error" && (
              <p role="alert">Signed encounter history could not be loaded. No fallback notes were substituted.</p>
            )}
            <div className="drawer-results-grid">
              {ftsResults.length > 0
                ? ftsResults.map((r) => (
                    <div key={r.encounterId} className="drawer-result-item fts-matched">
                      <div className="result-header"><strong>{r.chiefComplaint || "Clinical Note"}</strong><time>{r.date}</time></div>
                      <div
                        className="result-snippet"
                        style={{ fontSize: "12px", margin: "6px 0", color: "#3c4043", lineHeight: 1.4 }}
                        dangerouslySetInnerHTML={{ __html: r.snippet.replace(/\*\*(.*?)\*\*/g, "<mark style='background:#fef08a;padding:1px 3px;border-radius:2px;'>$1</mark>") }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setDraft((p) => ({ ...p, intervalHistory: (p.intervalHistory ? p.intervalHistory + "\n" : "") + `[Historical Context ${r.date}]: ${r.snippet.replace(/\*\*/g, "")}` }));
                          showToast(`Inserted citation from ${r.date} encounter!`);
                        }}
                        disabled={isLocked}
                      >
                        <Icon name="auto_awesome" /> Insert Citation to Note
                      </button>
                    </div>
                  ))
                : filteredPastEncounters.map((encounter) => (
                    <SignedEncounterHistoryItem
                      key={encounter.id}
                      patientId={patient.id}
                      encounter={encounter}
                      canInsertPlan={!isLocked}
                      onInsertPlan={() => {
                        setDraft((previous) => ({
                          ...previous,
                          plan: (previous.plan ? previous.plan + "\n" : "") + `[Prior Plan ${encounter.date}]: ${encounter.plan}`,
                        }));
                        showToast(`Copied ${encounter.date} plan into active note.`);
                      }}
                    />
                  ))}
            </div>
          </section>
        )}

        {/* Context and controls on the left; the paper on the right. Every category
            is visible at once, so filling in what the conversation did not cover is
            one click rather than a hunt through the document for the owning section. */}
        <div
          className={`encounter-document-layout has-readiness ${focusMode ? "is-focus" : ""} ${(narrowPane ? !narrowReadinessOpen : readinessCollapsed) ? "readiness-collapsed" : ""}`}
        >
          <EncounterContextRail
            draft={draft}
            isLocked={isLocked}
            contextEntries={contextEntries}
            onAddContext={addContextEntry}
            onRemoveContext={removeContextEntry}
            onSendContextToSection={sendContextToSection}
            onInsertPhrase={appendToSection}
            onSetMse={setMseDimension}
            activeSection={activeNoteSection}
            micListening={micListening}
            onToggleLiveMic={(field) => toggleLiveMic(field)}
            isAmbientPlaying={isAmbientPlaying}
            onStartAmbient={handleStartAmbient}
            onSynthesize={handleSynthesizeFromAmbient}
            transcriptCount={draft.ambientTranscript.length}
          />

          <div className="encounter-paper-column">
            <EncounterNoteDocument
              patient={patient}
              allergies={allergyLoad}
              draft={draft}
              onUpdateDraft={setDraft}
              isLocked={isLocked}
              psychotherapyMinutes={psychotherapyMinutes}
              codingRec={{ code: codingRec.primaryCode, rationale: codingRec.mdmReasoning }}
              stagedOrders={[]}
              activeSection={activeNoteSection}
              onActiveSectionChange={setActiveNoteSection}
              micListening={micListening}
              activeMicField={activeMicField}
              onToggleLiveMic={(field) => toggleLiveMic(field)}
            />

            {/* The transcript and AI candidates remain available but out of the way. */}
            <details
              className="encounter-scribe-strip"
              open={scribeOpen}
              onToggle={(event) => setScribeOpen((event.target as HTMLDetailsElement).open)}
            >
              <summary>
                <span className="encounter-scribe-strip-title"><Icon name="auto_awesome" /> Transcript &amp; AI candidates</span>
                <span className="encounter-scribe-strip-meta">
                  {draft.ambientTranscript.length > 0 ? `${draft.ambientTranscript.length} utterances` : "Not started"}
                  {draft.candidateActions.length > 0 ? ` · ${draft.candidateActions.length} candidates` : ""}
                </span>
              </summary>
              <EncounterScribePane
                scenarioKey={scenarioKey}
                onScenarioChange={setScenarioKey}
                isLocked={isLocked}
                isAmbientPlaying={isAmbientPlaying}
                onStartAmbient={handleStartAmbient}
                onSynthesizeFromAmbient={handleSynthesizeFromAmbient}
                micListening={micListening}
                onToggleLiveMic={() => toggleLiveMic((activeNoteSection as NarrativeField) || "intervalHistory")}
                ambientTranscript={draft.ambientTranscript}
                onClearTranscript={() => setDraft((p) => ({ ...p, ambientTranscript: [] }))}
                candidateActions={draft.candidateActions}
                onApplyCandidateAction={handleApplyCandidateAction}
                onDismissCandidateAction={handleDismissCandidateAction}
                onStageCandidateOrder={handleStageCandidateOrder}
              />
            </details>
          </div>

          {/* Evidence-refresh failures are a readiness item with a Retry, not a loose
              line of text under the note. */}
          <EncounterReadinessPanel
            groups={readiness.groups}
            openCount={readiness.openCount}
            collapsed={focusMode || (narrowPane ? !narrowReadinessOpen : readinessCollapsed)}
            onToggleCollapsed={() => {
              if (narrowPane) {
                if (focusMode) setFocusMode(false);
                setNarrowReadinessOpen((current) => (focusMode ? true : !current));
                return;
              }
              if (focusMode) {
                setFocusMode(false);
                if (readinessCollapsed) toggleReadinessCollapsed();
                return;
              }
              toggleReadinessCollapsed();
            }}
            onAction={(action) => handleReadinessAction(action)}
            onRefresh={() => setReadinessNonce((current) => current + 1)}
            refreshing={readinessRefreshing}
            resolvedAt={readinessServer?.resolvedAt ?? null}
            isLocked={isLocked}
            codingReview={<EncounterCodingDock codingRec={codingRec} />}
          />
        </div>

      </div>

      {toastNotice && <div className="encounter-toast">{toastNotice}</div>}

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
    </>
  );
}
