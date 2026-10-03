"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  withoutLegacyAutofilledMse,
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
import { ApiError } from "../../lib/api-error";
import { confirmScheduledVisit, scheduledVisitFor } from "../../lib/active-visit";
import { applyConfirmedAppointment } from "../../lib/schedule-store";
import { usePatientClinicalSnapshot } from "../../lib/use-patient-clinical-snapshot";
import EncounterClinicalContext from "./EncounterClinicalContext";
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
import { isBlankNote } from "../../domain/note-types";
import {
  claimNoteStart,
  pendingNoteStartFor,
  subscribeNoteStartRequests,
} from "../../lib/note-start-request";
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
import EncounterCopilot from "./EncounterCopilot";
import { applyProviderGuidance, attestCoverage, captureUtterance, encounterMode, type GuidanceTarget } from "../../domain/live-encounter";

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
      liveSupport: draft.liveSupport,
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

  const clinical = usePatientClinicalSnapshot(patient.id);
  const notePatient = useMemo(() => ({
    ...patient,
    meds: clinical.snapshot?.medications.filter((item) => item.status === "active").map((item) => item.display_text || item.medication_name) ?? [],
    diagnoses: clinical.snapshot?.problems.filter((item) => item.status === "active").map((item) => item.display_text) ?? [],
  }), [patient, clinical.snapshot]);
  const allergyLoad = useMemo(() => clinical.status === "loaded" && clinical.snapshot
    ? { status: "loaded" as const, values: clinical.snapshot.allergies.filter((item) => item.status === "active").map((item) => item.substance) }
    : { status: clinical.status === "error" ? "error" as const : "loading" as const }, [clinical.status, clinical.snapshot]);

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
  const captureEpoch = useRef(0);
  const captureActive = useRef(false);
  const lastObservedFingerprintRef = useRef("");
  const [contextRailTool, setContextRailTool] = useState("clinical");
  const [isSynthesizingNote, setIsSynthesizingNote] = useState(false);

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
    captureEpoch.current += 1;
    captureActive.current = false;
    recognitionRef.current?.stop();
    setMicListening(false);
    setContextRailTool("clinical");
    setContextEntries([]);
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
        const drafts = records.filter((record) => record.status === "draft");
        // A visit started from the schedule is that appointment's note: its own
        // draft, or this chart's unlinked one, never an older draft that belongs to
        // another visit — signing that would close the wrong appointment. A chart
        // opened any other way resumes the patient's newest unsigned draft.
        const startedFor = scheduledVisitFor(patient.id);
        const backendDraft = startedFor
          ? drafts.find((record) => record.appointmentId === startedFor) ??
            drafts.find((record) => record.id === loaded.encounterId && !record.appointmentId)
          : drafts[0];
        const localChangedSinceHydrationStarted = encounterSaveCoordinator.isDirty(ownerId, patient.id);

        if (!backendDraft) {
          const localBelongsToAnotherVisit =
            Boolean(startedFor) &&
            drafts.some(
              (record) =>
                record.id === loaded.encounterId && record.appointmentId && record.appointmentId !== startedFor,
            );
          if (localBelongsToAnotherVisit && !localChangedSinceHydrationStarted) {
            // The recovered draft is already saved against the other visit, so
            // setting it aside loses nothing; this visit starts its own note.
            const fresh = createInitialEncounter(patient.id);
            const freshTemplate = applyTemplateState(fresh, null);
            lastObservedFingerprintRef.current = encounterDraftFingerprint(
              fresh,
              freshTemplate.templateId,
              freshTemplate.minutes,
            );
            setDraft(fresh);
            encounterSaveCoordinator.beginHydration({ ownerId, patientId: patient.id, encounterId: fresh.encounterId });
          }
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
          // status is "draft" here, so an unauthored legacy default is cleared.
          mse: withoutLegacyAutofilledMse(backendDraft.mse),
          assessment: backendDraft.assessment,
          riskAssessment: backendDraft.riskAssessment || loaded.riskAssessment,
          followUp: backendDraft.followUp || loaded.followUp,
          plan: backendDraft.plan,
          candidateActions:
            (working?.candidateActions as CandidateAction[] | undefined) || loaded.candidateActions,
          ambientTranscript:
            (working?.ambientTranscript as EncounterState["ambientTranscript"] | undefined) || loaded.ambientTranscript,
          liveSupport: working?.liveSupport ?? loaded.liveSupport,
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
      captureActive.current = false;
      captureEpoch.current += 1;
      recognitionRef.current?.stop();
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
      return typeof window !== "undefined" && window.localStorage.getItem("ehr.encounter.readiness.collapsed") !== "0";
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
        if (cancelled || readinessKeyRef.current !== key) return;
        if (view.patientId !== patient.id || view.encounterId !== readinessEncounterId) {
          throw new Error("Visit readiness returned a different patient or encounter.");
        }
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
        .catch((error: unknown) => {
          if (cancelled) return;
          // 404 means the server has not received this new draft yet — there is
          // nothing to refresh, not a failure. The read re-runs when the first
          // save is acknowledged (`encounterPersisted` below).
          setNoteReferenceStatus(error instanceof ApiError && error.status === 404 ? "not-applicable" : "error");
        });
    };

    load();
    const unsubOrderCart = subscribeWorkspaceEvent(WORKSPACE_ORDER_CART_UPDATED_EVENT, load);
    return () => {
      cancelled = true;
      unsubOrderCart();
    };
  }, [draft.encounterId, draft.patientId, patient.id, referenceReloadNonce, encounterPersisted]);

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
    // On a first mount with no local recovery, this render still holds the initial
    // blank template, whose id differs from the one hydration just began for. It is
    // not an edit. Queuing it would make hydration keep it over the server's draft
    // and save an empty second draft for the patient, so it is skipped, and the
    // fingerprint is left alone so the hydrated draft is not mistaken for one either.
    const tracked = encounterSaveCoordinator.getState(ownerId, patient.id);
    if (tracked?.encounterId && tracked.encounterId !== draft.encounterId) return;
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
      stopCapture();
      showToast("Synthetic capture complete. Draft ready for review.");
      return;
    }

    const epoch = captureEpoch.current;
    const encounterId = draft.encounterId;
    const timer = setTimeout(() => {
      const nextUtterance = scenario.utterances[ambientCursor];
      setDraft((prev) => captureActive.current && captureEpoch.current === epoch && prev.encounterId === encounterId ? captureUtterance(prev, nextUtterance) : prev);
      setAmbientCursor((c) => c + 1);
    }, 1100);

    return () => clearTimeout(timer);
  }, [isAmbientPlaying, ambientCursor, scenario.utterances, draft.encounterId]);

  // Every narrative section in the document can be dictated into, including the
  // ones added with it. A dictation target list that lags the note's sections
  // silently makes some of them typing-only.
  function stopCapture() {
    captureActive.current = false;
    captureEpoch.current += 1;
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setMicListening(false);
    setIsAmbientPlaying(false);
  }

  function toggleLiveMic(field: NarrativeField = "intervalHistory") {
    if (typeof window === "undefined") return;

    if (micListening) {
      stopCapture();
      showToast("Capture stopped. Draft ready for review.");
      return;
    }

    const SpeechRecognitionConstructor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionConstructor) {
      showToast("Speech recognition is not supported in this browser.");
      return;
    }

    if (draft.status === "signed" || reviewModalOpen || isSynthesizingNote || saveState?.hydrating) return;
    stopCapture();
    captureActive.current = true;
    const epoch = ++captureEpoch.current;
    const encounterId = draft.encounterId;
    try {
      const recognition = new SpeechRecognitionConstructor();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onresult = (event: SpeechRecognitionEventLike) => {
        if (!captureActive.current || captureEpoch.current !== epoch) return;
        let finalChunk = "";
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const item = event.results[i];
          if (item?.isFinal) finalChunk += item[0]?.transcript + " ";
        }
        if (finalChunk.trim()) {
          const capturedChunk = finalChunk.trim();
          const utterance = { id: crypto.randomUUID(), speaker: "clinician" as const, speakerName: "Unattributed browser speech", text: capturedChunk, timestamp: new Date().toISOString() };
          setDraft((prev) => captureActive.current && captureEpoch.current === epoch && prev.encounterId === encounterId ? captureUtterance(prev, utterance, field) : prev);
        }
      };

      recognition.onerror = () => { if (captureEpoch.current === epoch) { stopCapture(); showToast("Microphone capture failed. Transcript preserved; draft ready for review."); } };
      recognition.onend = () => { if (captureEpoch.current === epoch) stopCapture(); };
      recognition.start();
      recognitionRef.current = recognition;
      setActiveMicField(field);
      setMicListening(true);
      showToast(`Capturing browser speech into ${field}. Draft read-only until capture stops.`);
    } catch {
      stopCapture();
      showToast("Could not access microphone. Draft remains editable.");
    }
  }

  const applyPendingVoiceNoteStart = useCallback(() => {
    const req = pendingNoteStartFor(patient.id);
    if (!req) return;
    if (encounterSaveCoordinator.getState(ownerId, patient.id)?.hydrating ?? true) {
      return;
    }
    if (!claimNoteStart(req.nonce)) return;

    const blank = isBlankNote(draft);
    if (blank) {
      const tmpl = builtInTemplates.find((t) => t.id === req.noteType.templateId) || builtInTemplates[0];
      setSelectedTemplateId(tmpl.id);
      setPsychotherapyMinutes(tmpl.defaultPsychotherapyMinutes);
      setDraft((prev) => ({
        ...prev,
        selectedTemplateId: tmpl.id,
        visitType: req.noteType.visitType,
        psychotherapyMinutes: tmpl.defaultPsychotherapyMinutes,
        chiefComplaint: prev.chiefComplaint || tmpl.defaultChiefComplaint,
        mse: { ...(tmpl.defaultMse || defaultMse) },
      }));
    } else {
      showToast(`Continuing ${patient.name}'s unsigned note.`);
    }

    if (req.mode === "scribe") {
      setContextRailTool("record");
    } else if (req.mode === "dictate") {
      toggleLiveMic("intervalHistory");
    }
  }, [patient.id, patient.name, draft, ownerId, showToast]);

  useEffect(() => {
    if (!saveState?.hydrating) {
      applyPendingVoiceNoteStart();
    }
  }, [saveState?.hydrating, applyPendingVoiceNoteStart]);

  useEffect(() => {
    return subscribeNoteStartRequests((targetPatientId) => {
      if (targetPatientId === patient.id) {
        applyPendingVoiceNoteStart();
      }
    });
  }, [patient.id, applyPendingVoiceNoteStart]);

  function handleStartAmbient() {
    if (isAmbientPlaying || micListening) { stopCapture(); return; }
    if (draft.status === "signed" || reviewModalOpen || isSynthesizingNote || saveState?.hydrating) return;
    if (scenario.patientId !== patient.id) { showToast("No matching synthetic transcript for this patient. Use microphone capture or manual documentation."); return; }
    captureEpoch.current += 1;
    captureActive.current = true;
    setAmbientCursor(0);
    setIsAmbientPlaying(true);
    showToast(`Synthetic capture: ${scenario.title}. Transcript quotations require review.`);
  }

  async function handleSynthesizeFromAmbient() {
    if (captureActive.current || draft.status === "signed") return;
    const epoch = ++captureEpoch.current;
    const encounterId = draft.encounterId;
    const activeTranscript = draft.ambientTranscript;
    if (activeTranscript.length === 0) {
      showToast("Capture transcript evidence before scribing. Nothing was written to the note.");
      return;
    }

    setIsSynthesizingNote(true);

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

    // The scribe fills what is empty and leaves what the clinician wrote alone.
    // An empty synthesized field stays empty: missing transcript evidence must never
    // be replaced with a scripted or plausible clinical statement.
    const keepOrFill = (existing: string, synthesized: string, target: string) =>
      existing.trim() || draft.liveSupport?.guidance.some((entry) => entry.target === target) ? existing : synthesized;

    try {
      const response = await api.ai.synthesizeNote({
        utterances: activeTranscript,
        patientContext: {
          patientId: patient.id,
        },
      });

      if (captureEpoch.current !== epoch) return;
      setDraft((prev) => {
        if (prev.encounterId !== encounterId || prev.status === "signed" || captureEpoch.current !== epoch) return prev;
        const mse = { ...prev.mse };
        for (const [dimension, text] of Object.entries(response.mse || {})) {
          const existing = String((prev.mse as unknown as Record<string, string>)[dimension] ?? "");
          const synthesized = typeof text === "string" ? text : "";
          (mse as unknown as Record<string, string>)[dimension] = keepOrFill(existing, synthesized, `mse.${dimension}`);
        }

        return {
          ...prev,
          chiefComplaint: keepOrFill(prev.chiefComplaint, response.chiefComplaint || "", "chiefComplaint"),
          intervalHistory: keepOrFill(prev.intervalHistory, response.intervalHistory || "", "intervalHistory"),
          treatmentResponse: keepOrFill(prev.treatmentResponse, response.treatmentResponse || "", "treatmentResponse"),
          sideEffects: keepOrFill(prev.sideEffects, response.sideEffects || "", "sideEffects"),
          mse,
          assessment: keepOrFill(prev.assessment, response.assessment || "", "assessment"),
          plan: keepOrFill(prev.plan, response.plan || "", "plan"),
          candidateActions: response.candidateActions || [],
          ambientTranscript: activeTranscript,
        };
      });

      const sourceLabel = response.provider === "ollama"
        ? `Ollama ${response.model}`
        : "the conservative local transcript fallback";
      showToast(
        skippedSections.length > 0
          ? `Scribed empty sections with ${sourceLabel}. Left your own text in ${skippedSections.join(", ")}. Review before use.`
          : `Drafted the note from transcript evidence with ${sourceLabel}. Review before use.`,
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Local scribe request failed.";
      showToast(`Scribe unavailable: ${detail} Transcript preserved; nothing was written to the note.`);
    } finally {
      setIsSynthesizingNote(false);
    }
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

  function handleCopyCleanNote() {
    // The exported note must be the note on screen. Chart-sourced sections are
    // rendered in the document, so they belong in the copy too — an export that
    // silently drops medications or allergies is a different note.
    const bullets = (values: string[] | undefined, empty: string) =>
      values && values.length ? values.map((value) => `• ${value}`).join("\n") : empty;
    const medicationLines = clinical.status === "loaded" ? bullets(notePatient.meds, "No active medications recorded.")
      : `Medications ${clinical.status === "loading" ? "still loading" : "could not be loaded"} — not exported.`;
    const allergyLines = allergyLoad.status === "loaded"
      ? bullets(allergyLoad.values, "Allergy status not assessed this visit.")
      : allergyLoad.status === "loading"
        ? "Allergies still loading — not exported."
        : "Allergies could not be loaded. Do not read this as no known allergies.";
    const diagnosisLines = clinical.status === "loaded" ? bullets(notePatient.diagnoses, "No active diagnoses recorded.")
      : `Diagnoses ${clinical.status === "loading" ? "still loading" : "could not be loaded"} — not exported.`;
    // An empty section is exported as empty. Filling it with a plausible sentence
    // ("Denies adverse effects.") would put a clinical statement in the copy that
    // the clinician never made and the record does not contain.
    const documented = (value?: string | null) => value?.trim() || "Not documented.";

    const fullText = `
OUTPATIENT ADULT & ADOLESCENT PSYCHIATRY
PSYCHIATRIC EVALUATION & MANAGEMENT NOTE

PATIENT: ${patient.name} | MRN: ${patient.mrn} | DOB: ${patient.dob} (${patient.age}y)
DATE OF SERVICE: ${draft.date} | PROVIDER: Current authenticated clinician
VISIT TYPE: ${draft.visitType} | CPT CODING: ${codingRec.primaryCode} ${codingRec.addonCodes.join(" ")}

CHIEF COMPLAINT:
${documented(draft.chiefComplaint)}

INTERVAL HISTORY:
${documented(draft.intervalHistory)}

REVIEW OF SYMPTOMS:
${documented(draft.reviewOfSymptoms)}

CURRENT MEDICATIONS:
${medicationLines}

ALLERGIES:
${allergyLines}

RESPONSE TO TREATMENT:
${documented(draft.treatmentResponse)}

SIDE EFFECTS & TOLERABILITY:
${documented(draft.sideEffects)}

MENTAL STATUS EXAMINATION:
• Appearance: ${documented(draft.mse.appearance)}
• Behavior & Rapport: ${documented(draft.mse.behavior)}
• Speech: ${documented(draft.mse.speech)}
• Mood & Affect: ${documented(draft.mse.moodAffect)}
• Thought Process: ${documented(draft.mse.thoughtProcess)}
• Thought Content (Safety/SI): ${documented(draft.mse.thoughtContent)}
• Cognition: ${documented(draft.mse.cognition)}
• Insight & Judgment: ${documented(draft.mse.insightJudgment)}

DIAGNOSES:
${diagnosisLines}

CLINICAL ASSESSMENT & MDM:
${documented(draft.assessment)}
Medical Decision Making Level: ${codingRec.mdmLevel.toUpperCase()} (${codingRec.mdmReasoning})

RISK ASSESSMENT:
${documented(draft.riskAssessment)}

TREATMENT PLAN & ORDERS:
${documented(draft.plan)}
${psychotherapyMinutes >= 16 ? `\nPsychotherapy Provided: ${psychotherapyMinutes} minutes of interactive psychotherapy.` : ""}

FOLLOW-UP:
${documented(draft.followUp)}

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
    if (captureActive.current || isSynthesizingNote) { showToast("Stop capture and wait for synthesis before reviewing and signing."); return; }
    if (draft.status === "signed") {
      setReviewModalOpen(true);
      return;
    }

    // Until the server's draft has been read, the editor may still hold a blank
    // template. Queuing it here would count as an edit: hydration would then keep
    // it over the server's copy and save it, creating an empty draft beside the
    // real one. Refuse instead; the button is disabled for the same window.
    if (encounterSaveCoordinator.getState(ownerId, patient.id)?.hydrating ?? true) {
      showToast("This note is still loading from the server. Review & Sign opens once it has loaded.");
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
  const isLive = isAmbientPlaying || micListening;
  const mode = encounterMode(draft, isLive);

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
        server: readinessServer?.patientId === patient.id && readinessServer.encounterId === readinessEncounterId ? readinessServer : null,
        serverError: readinessError,
        referenceRefreshFailed: noteReferenceStatus === "error",
        isSigned: draft.status === "signed",
      }),
    [patient.id, readinessEncounterId, draft, codingRec, selectedTemplateId, activeTemplate, psychotherapyMinutes, readinessServer, readinessError, noteReferenceStatus],
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
      case "open-lab-composer":
        if (onOpenOrderCart) onOpenOrderCart("labs", action.prefill);
        else if (onNavigateSection) onNavigateSection("Labs");
        else showToast("Open Labs to order monitoring.");
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
      <div ref={encounterRootRef} className="encounter-workspace-root" data-encounter-id={draft.encounterId} data-encounter-patient-id={patient.id} data-encounter-mode={mode}>
        <div className="encounter-mode-status" role="status"><strong>{mode === "LIVE" ? "LIVE NOTE · Updating" : mode === "SIGNED" ? "SIGNED NOTE · Immutable" : "DRAFT NOTE · Ready for Review"}</strong><span>{patient.name} · {draft.date}{isLive ? " · Deterministic capture draft" : ""}</span>{isLive && <button type="button" onClick={stopCapture}>Stop capture</button>}</div>
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
          captureBusy={isLive || isSynthesizingNote}
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

        {showPastNotes && (
          <section className="past-notes-drawer-card">
            <div className="drawer-heading">
              <strong>Longitudinal Record · Search Past Encounters</strong>
              <button type="button" className="drawer-close" aria-label="Close signed encounter history" onClick={() => setShowPastNotes(false)}><Icon name="close" /></button>
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
            key={patient.id}
            copilot={<EncounterCopilot draft={draft} live={isLive} micListening={micListening} medicationFocus={Boolean(notePatient.meds.length)} locked={isLocked || reviewModalOpen || Boolean(saveState?.hydrating) || isSynthesizingNote}
              onGuide={(entry) => setDraft((previous) => applyProviderGuidance(previous, entry))}
              onAttest={(target: GuidanceTarget, explicit) => setDraft((previous) => attestCoverage(previous, target, explicit))}
              onStart={handleStartAmbient} onStop={stopCapture} onCapture={() => toggleLiveMic("intervalHistory")} />}
            clinicalContext={<EncounterClinicalContext
              patientId={patient.id} encounterId={draft.encounterId} snapshot={clinical.snapshot} status={clinical.status} error={clinical.error}
              onRefresh={clinical.refresh} labs={readiness.groups.find((group) => group.id === "labs")}
              onOpenPrior={() => { setSearchTerm(""); setShowPastNotes(true); }}
              onPrescribe={onOpenOrderCart ? () => onOpenOrderCart("prescribe") : undefined}
              onOrderLabs={onOpenOrderCart ? (prefill) => onOpenOrderCart("labs", prefill) : undefined}
              onReviewLabs={onNavigateSection ? () => onNavigateSection("Labs") : undefined}
              onManageMedications={onNavigateSection ? () => onNavigateSection("Meds") : undefined}
            />}
            draft={draft}
            isLocked={isLocked || isLive}
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
            isSynthesizing={isSynthesizingNote}
            activeTool={contextRailTool}
            onActiveToolChange={setContextRailTool}
          />

          <div className="encounter-paper-column">
            <EncounterNoteDocument
              patient={notePatient}
              clinicalStatus={clinical.status}
              allergies={allergyLoad}
              draft={draft}
              onUpdateDraft={setDraft}
              isLocked={isLocked}
              isLive={isLive}
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
                onScenarioChange={(key) => { if (!isLive) setScenarioKey(key); }}
                isLocked={isLocked || isLive}
                isAmbientPlaying={isAmbientPlaying}
                onStartAmbient={handleStartAmbient}
                onSynthesizeFromAmbient={handleSynthesizeFromAmbient}
                isSynthesizing={isSynthesizingNote}
                micListening={micListening}
                onToggleLiveMic={() => toggleLiveMic((activeNoteSection as NarrativeField) || "intervalHistory")}
                ambientTranscript={draft.ambientTranscript}
                onClearTranscript={() => showToast("Captured evidence is retained for provenance. Start another encounter for a new transcript.")}
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
            completionAction={<button type="button" aria-label={isLocked ? "View signed encounter record" : "Review encounter and sign"} disabled={isLive || isSynthesizingNote || Boolean(saveState?.hydrating)} onClick={() => void handleOpenReviewModal()}>{isLocked ? "View Signed Record" : "Review & Sign"}</button>}
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