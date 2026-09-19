import type {
  CareCompletionBoard,
  CareCompletionDeferralReasonCode,
} from "../domain/care-completion";
import { ApiError } from "./api-error";
import { reportAuthenticationFailure } from "./session-expiry";
import {
  WORKSPACE_CARE_COMPLETION_CHANGED_EVENT,
  dispatchWorkspaceEvent,
} from "./workspace-events";

/**
 * The browser side of the care-completion board.
 *
 * Reads and the two personal mutations, nothing else. Every clinical action a
 * board item offers is reached by navigating into the workflow that owns it, so
 * there is deliberately no "complete this item" call here to be mistaken for
 * one.
 */

async function send<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    cache: "no-store",
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    if (response.status === 401) reportAuthenticationFailure();
    throw new ApiError(
      payload?.error || `Unable to reach the care-completion board (HTTP ${response.status})`,
      response.status,
      payload,
    );
  }
  return payload as T;
}

export const careCompletionApi = {
  async board(): Promise<CareCompletionBoard> {
    const payload = await send<{ board: CareCompletionBoard }>("/api/care-completion");
    return payload.board;
  },

  async isPinned(patientId: string): Promise<boolean> {
    const payload = await send<{ pinned: boolean }>(
      `/api/care-completion?pinnedFor=${encodeURIComponent(patientId)}`,
    );
    return payload.pinned;
  },

  async pin(patientId: string, source?: string): Promise<void> {
    await send("/api/care-completion", {
      method: "POST",
      body: JSON.stringify({ action: "pin", patientId, source }),
    });
  },

  async unpin(patientId: string): Promise<void> {
    await send("/api/care-completion", {
      method: "POST",
      body: JSON.stringify({ action: "unpin", patientId }),
    });
  },

  async defer(input: {
    patientId: string;
    itemKey: string;
    reasonCode: CareCompletionDeferralReasonCode;
    reasonText?: string;
    resumeAt?: string;
    expectedVersion?: number;
  }): Promise<void> {
    await send("/api/care-completion", {
      method: "POST",
      body: JSON.stringify({ action: "defer", ...input }),
    });
  },

  async resume(input: {
    patientId: string;
    itemKey: string;
    expectedVersion?: number;
  }): Promise<void> {
    await send("/api/care-completion", {
      method: "POST",
      body: JSON.stringify({ action: "resume", ...input }),
    });
  },
};

/** Broadcast so any open board refreshes after a pin/defer made elsewhere. */
export const CARE_COMPLETION_CHANGED_EVENT = "ehr-care-completion-changed";

export function announceCareCompletionChange(detail?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  dispatchWorkspaceEvent(WORKSPACE_CARE_COMPLETION_CHANGED_EVENT, detail ?? {});
}
