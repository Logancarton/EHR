import type { EncounterState } from "./encounter-engine";

export type EncounterSaveStatus = "unsaved" | "saving" | "saved" | "failed";

export type EncounterDraftSavePayload = {
  id: string;
  patientId: string;
  type: string;
  chiefComplaint: string;
  intervalHistory: string;
  treatmentResponse: string;
  sideEffects: string;
  assessment: string;
  plan: string;
  cptCode: string;
  emLevel: string;
  mse: Record<string, string>;
  workingState: {
    selectedTemplateId: string;
    psychotherapyMinutes: number;
    candidateActions: Array<Record<string, unknown>>;
    ambientTranscript: Array<Record<string, unknown>>;
    lastAutosavedAt: string;
  };
  expectedUpdatedAt?: string;
  expectedActorId: string;
};

export type EncounterDraftSaveResult = {
  id: string;
  patientId: string;
  status: "draft" | "signed";
  updatedAt: string;
};

export type EncounterSaveView = {
  status: EncounterSaveStatus;
  patientId: string;
  encounterId: string;
  revision: number;
  acknowledgedRevision: number;
  dirty: boolean;
  savedAt?: string;
  error?: string;
  serverUpdatedAt?: string;
};

export type EncounterRecovery = {
  version: 2;
  ownerId: string;
  patientId: string;
  encounterId: string;
  draft: EncounterState;
  selectedTemplateId: string;
  psychotherapyMinutes: number;
  dirty: boolean;
  savedAt?: string;
  serverUpdatedAt?: string;
};

type SaveTransport = (payload: EncounterDraftSavePayload) => Promise<EncounterDraftSaveResult>;
type Listener = (state: EncounterSaveView) => void;

type PendingRevision = {
  revision: number;
  payload: EncounterDraftSavePayload;
  recovery: EncounterRecovery;
};

type Entry = EncounterSaveView & {
  ownerId: string;
  hydrating: boolean;
  signed: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  inFlight: Promise<void> | null;
  pending: PendingRevision | null;
  listeners: Set<Listener>;
  flushAfterFlight: boolean;
};

const CACHE_PREFIX = "ehr-encounter-draft-v2:";
const LEGACY_CACHE_PREFIX = "ehr-encounter-draft-v1-";
const DEFAULT_DEBOUNCE_MS = 1500;

function scopeKey(ownerId: string, patientId: string) {
  return `${ownerId}:${patientId}`;
}

function cacheKey(ownerId: string, patientId: string) {
  return `${CACHE_PREFIX}${ownerId}:${patientId}`;
}

function safeError(error: unknown) {
  return error instanceof Error ? error.message : "Encounter save failed.";
}

function storageAvailable() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

export function loadEncounterRecovery(ownerId: string, patientId: string): EncounterRecovery | null {
  if (!storageAvailable()) return null;
  try {
    const raw = window.localStorage.getItem(cacheKey(ownerId, patientId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<EncounterRecovery>;
    if (
      parsed.version !== 2 ||
      parsed.ownerId !== ownerId ||
      parsed.patientId !== patientId ||
      !parsed.encounterId ||
      !parsed.draft ||
      parsed.draft.patientId !== patientId ||
      parsed.draft.encounterId !== parsed.encounterId
    ) {
      return null;
    }
    return parsed as EncounterRecovery;
  } catch {
    return null;
  }
}

export function loadLegacyEncounterDraft(patientId: string): EncounterState | null {
  if (!storageAvailable()) return null;
  try {
    const raw = window.localStorage.getItem(`${LEGACY_CACHE_PREFIX}${patientId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as EncounterState;
    if (parsed.patientId !== patientId || parsed.status === "signed") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearLegacyEncounterDraft(patientId: string) {
  if (!storageAvailable()) return;
  try {
    window.localStorage.removeItem(`${LEGACY_CACHE_PREFIX}${patientId}`);
  } catch {
    // Local recovery is best effort; server truth remains authoritative.
  }
}

function persistRecovery(recovery: EncounterRecovery) {
  if (!storageAvailable()) return;
  try {
    window.localStorage.setItem(cacheKey(recovery.ownerId, recovery.patientId), JSON.stringify(recovery));
  } catch {
    // The clinician still receives server save state even when browser storage is unavailable.
  }
}

export function clearEncounterRecovery(ownerId: string, patientId: string) {
  if (!storageAvailable()) return;
  try {
    window.localStorage.removeItem(cacheKey(ownerId, patientId));
  } catch {
    // Signed server state is still authoritative.
  }
}

function canonicalDraftForFingerprint(draft: EncounterState) {
  const {
    lastAutosavedAt: _lastAutosavedAt,
    signedAt: _signedAt,
    signedBy: _signedBy,
    ...stable
  } = draft;
  return stable;
}

export function encounterDraftFingerprint(
  draft: EncounterState,
  selectedTemplateId: string,
  psychotherapyMinutes: number,
) {
  return JSON.stringify({
    draft: canonicalDraftForFingerprint(draft),
    selectedTemplateId,
    psychotherapyMinutes,
  });
}

export class EncounterSaveCoordinator {
  private entries = new Map<string, Entry>();
  private transport: SaveTransport | null = null;
  private beforeUnloadInstalled = false;

  constructor(private readonly debounceMs = DEFAULT_DEBOUNCE_MS) {}

  configureTransport(transport: SaveTransport) {
    this.transport = transport;
  }

  private installBeforeUnload() {
    if (this.beforeUnloadInstalled || typeof window === "undefined") return;
    this.beforeUnloadInstalled = true;
    window.addEventListener("beforeunload", (event) => {
      const risky = Array.from(this.entries.values()).some(
        (entry) => !entry.signed && (entry.dirty || Boolean(entry.inFlight) || entry.status === "failed"),
      );
      if (!risky) return;
      event.preventDefault();
      event.returnValue = "";
    });
  }

  private emit(entry: Entry) {
    const view = this.view(entry);
    entry.listeners.forEach((listener) => listener(view));
  }

  private view(entry: Entry): EncounterSaveView {
    return {
      status: entry.status,
      patientId: entry.patientId,
      encounterId: entry.encounterId,
      revision: entry.revision,
      acknowledgedRevision: entry.acknowledgedRevision,
      dirty: entry.dirty,
      savedAt: entry.savedAt,
      error: entry.error,
      serverUpdatedAt: entry.serverUpdatedAt,
    };
  }

  beginHydration(input: {
    ownerId: string;
    patientId: string;
    encounterId: string;
    recovery?: EncounterRecovery | null;
  }) {
    const key = scopeKey(input.ownerId, input.patientId);
    const existing = this.entries.get(key);
    if (existing && existing.encounterId === input.encounterId && !existing.signed) {
      existing.hydrating = true;
      this.emit(existing);
      return this.view(existing);
    }

    if (existing?.timer) clearTimeout(existing.timer);
    const recovery = input.recovery;
    const entry: Entry = {
      ownerId: input.ownerId,
      patientId: input.patientId,
      encounterId: input.encounterId,
      status: recovery?.serverUpdatedAt && !recovery.dirty ? "saved" : "unsaved",
      revision: 0,
      acknowledgedRevision: 0,
      dirty: recovery?.dirty ?? false,
      savedAt: recovery?.savedAt,
      serverUpdatedAt: recovery?.serverUpdatedAt,
      error: undefined,
      hydrating: true,
      signed: false,
      timer: null,
      inFlight: null,
      pending: null,
      listeners: existing?.listeners ?? new Set<Listener>(),
      flushAfterFlight: false,
    };
    this.entries.set(key, entry);
    this.installBeforeUnload();
    this.emit(entry);
    return this.view(entry);
  }

  subscribe(ownerId: string, patientId: string, listener: Listener) {
    const key = scopeKey(ownerId, patientId);
    let entry = this.entries.get(key);
    if (!entry) {
      entry = {
        ownerId,
        patientId,
        encounterId: "",
        status: "unsaved",
        revision: 0,
        acknowledgedRevision: 0,
        dirty: false,
        hydrating: true,
        signed: false,
        timer: null,
        inFlight: null,
        pending: null,
        listeners: new Set<Listener>(),
        flushAfterFlight: false,
      };
      this.entries.set(key, entry);
    }
    entry.listeners.add(listener);
    listener(this.view(entry));
    return () => entry?.listeners.delete(listener);
  }

  getState(ownerId: string, patientId: string) {
    const entry = this.entries.get(scopeKey(ownerId, patientId));
    return entry ? this.view(entry) : null;
  }

  isDirty(ownerId: string, patientId: string) {
    const entry = this.entries.get(scopeKey(ownerId, patientId));
    return Boolean(entry && !entry.signed && (entry.dirty || entry.pending || entry.inFlight));
  }

  queue(input: {
    ownerId: string;
    draft: EncounterState;
    selectedTemplateId: string;
    psychotherapyMinutes: number;
    payload: Omit<EncounterDraftSavePayload, "expectedUpdatedAt" | "expectedActorId">;
  }) {
    const patientId = input.draft.patientId;
    const encounterId = input.draft.encounterId;
    const key = scopeKey(input.ownerId, patientId);
    let entry = this.entries.get(key);
    if (!entry || entry.encounterId !== encounterId) {
      this.beginHydration({ ownerId: input.ownerId, patientId, encounterId });
      entry = this.entries.get(key)!;
    }
    if (entry.signed || input.draft.status === "signed") return this.view(entry);

    entry.revision += 1;
    entry.dirty = true;
    entry.error = undefined;
    if (!entry.inFlight) entry.status = "unsaved";

    const recovery: EncounterRecovery = {
      version: 2,
      ownerId: input.ownerId,
      patientId,
      encounterId,
      draft: {
        ...input.draft,
        selectedTemplateId: input.selectedTemplateId,
        psychotherapyMinutes: input.psychotherapyMinutes,
      },
      selectedTemplateId: input.selectedTemplateId,
      psychotherapyMinutes: input.psychotherapyMinutes,
      dirty: true,
      savedAt: entry.savedAt,
      serverUpdatedAt: entry.serverUpdatedAt,
    };

    entry.pending = {
      revision: entry.revision,
      payload: {
        ...input.payload,
        expectedActorId: input.ownerId,
      },
      recovery,
    };
    persistRecovery(recovery);
    this.installBeforeUnload();
    this.emit(entry);

    if (!entry.hydrating) this.schedule(entry);
    return this.view(entry);
  }

  acceptHydrated(input: {
    ownerId: string;
    draft: EncounterState;
    selectedTemplateId: string;
    psychotherapyMinutes: number;
    serverUpdatedAt: string;
  }) {
    const key = scopeKey(input.ownerId, input.draft.patientId);
    let entry = this.entries.get(key);
    if (!entry || entry.encounterId !== input.draft.encounterId) {
      this.beginHydration({
        ownerId: input.ownerId,
        patientId: input.draft.patientId,
        encounterId: input.draft.encounterId,
      });
      entry = this.entries.get(key)!;
    }
    if (entry.dirty || entry.pending || entry.inFlight) return false;

    entry.serverUpdatedAt = input.serverUpdatedAt;
    entry.savedAt = input.draft.lastAutosavedAt || input.serverUpdatedAt;
    entry.status = "saved";
    entry.error = undefined;
    persistRecovery({
      version: 2,
      ownerId: input.ownerId,
      patientId: input.draft.patientId,
      encounterId: input.draft.encounterId,
      draft: input.draft,
      selectedTemplateId: input.selectedTemplateId,
      psychotherapyMinutes: input.psychotherapyMinutes,
      dirty: false,
      savedAt: entry.savedAt,
      serverUpdatedAt: input.serverUpdatedAt,
    });
    this.emit(entry);
    return true;
  }

  finishHydration(ownerId: string, patientId: string, serverUpdatedAt?: string) {
    const entry = this.entries.get(scopeKey(ownerId, patientId));
    if (!entry || entry.signed) return;
    entry.hydrating = false;
    if (serverUpdatedAt && !entry.serverUpdatedAt) entry.serverUpdatedAt = serverUpdatedAt;
    if (entry.pending) this.schedule(entry);
    this.emit(entry);
  }

  private schedule(entry: Entry) {
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = setTimeout(() => {
      entry.timer = null;
      void this.flush(entry.ownerId, entry.patientId);
    }, this.debounceMs);
  }

  async flush(ownerId: string, patientId: string): Promise<EncounterSaveView> {
    const entry = this.entries.get(scopeKey(ownerId, patientId));
    if (!entry) throw new Error("No encounter save state exists for this patient.");
    if (entry.signed) return this.view(entry);
    if (entry.timer) {
      clearTimeout(entry.timer);
      entry.timer = null;
    }
    if (entry.hydrating) return this.view(entry);
    if (entry.inFlight) {
      entry.flushAfterFlight = true;
      await entry.inFlight;
      if (entry.pending && entry.status !== "failed") return this.flush(ownerId, patientId);
      return this.view(entry);
    }
    if (!entry.pending) return this.view(entry);
    if (!this.transport) throw new Error("Encounter save transport has not been configured.");

    const pending = entry.pending;
    entry.pending = null;
    entry.status = "saving";
    entry.error = undefined;
    this.emit(entry);

    let succeeded = false;
    entry.inFlight = (async () => {
      try {
        const result = await this.transport!({
          ...pending.payload,
          expectedUpdatedAt: entry.serverUpdatedAt,
          expectedActorId: ownerId,
        });
        if (result.id !== entry.encounterId || result.patientId !== patientId) {
          throw new Error("Encounter save acknowledgement binding mismatch.");
        }
        if (result.status !== "draft") {
          throw new Error("Encounter save acknowledgement was not a mutable draft.");
        }
        entry.serverUpdatedAt = result.updatedAt;
        entry.acknowledgedRevision = Math.max(entry.acknowledgedRevision, pending.revision);
        succeeded = true;

        if (!entry.pending && entry.revision === pending.revision) {
          entry.dirty = false;
          entry.status = "saved";
          entry.savedAt = new Date().toISOString();
          persistRecovery({
            ...pending.recovery,
            dirty: false,
            savedAt: entry.savedAt,
            serverUpdatedAt: result.updatedAt,
          });
        } else {
          entry.status = "unsaved";
          const latest = entry.pending?.recovery;
          if (latest) {
            persistRecovery({
              ...latest,
              dirty: true,
              savedAt: entry.savedAt,
              serverUpdatedAt: result.updatedAt,
            });
          }
        }
      } catch (error) {
        if (!entry.pending || entry.pending.revision < pending.revision) entry.pending = pending;
        entry.dirty = true;
        entry.status = "failed";
        entry.error = safeError(error);
      } finally {
        entry.inFlight = null;
        this.emit(entry);
      }
    })();

    await entry.inFlight;
    const continueAfterFlight = succeeded && (entry.flushAfterFlight || Boolean(entry.pending));
    entry.flushAfterFlight = false;
    if (continueAfterFlight && entry.pending) {
      return this.flush(ownerId, patientId);
    }
    return this.view(entry);
  }

  retry(ownerId: string, patientId: string) {
    const entry = this.entries.get(scopeKey(ownerId, patientId));
    if (!entry || entry.signed) return Promise.resolve(entry ? this.view(entry) : null);
    entry.status = "unsaved";
    entry.error = undefined;
    this.emit(entry);
    return this.flush(ownerId, patientId);
  }

  markSigned(ownerId: string, patientId: string, encounterId: string) {
    const entry = this.entries.get(scopeKey(ownerId, patientId));
    if (entry && entry.encounterId === encounterId) {
      if (entry.timer) clearTimeout(entry.timer);
      entry.timer = null;
      entry.pending = null;
      entry.signed = true;
      entry.dirty = false;
      entry.status = "saved";
      entry.error = undefined;
      this.emit(entry);
    }
    clearEncounterRecovery(ownerId, patientId);
  }
}

export const encounterSaveCoordinator = new EncounterSaveCoordinator();
