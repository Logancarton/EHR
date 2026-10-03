"use client";

import { scopedStorageKey } from "./local-cache-scope";
import type { MessageCategory } from "../domain/messages";

export type CommunicationChannel =
  | "team"
  | "inbox"
  | "patient"
  | "email"
  | "fax"
  | "community";

export const COMMUNICATION_DRAFTS_STORAGE_KEY = "ehr-communication-drafts-v1";

export interface CommunicationDraftsState {
  partnerDrafts: Record<string, { messageText: string; messagePatientId: string; taskText: string; taskPatientId: string; taskDueDate: string }>;
  channel: CommunicationChannel;
  teamTab: "chat" | "tasks";
  selectedPartnerId: string | null;
  messageText: string;
  messagePatientId: string;
  taskText: string;
  taskPatientId: string;
  taskDueDate: string;
  inboxFilter: "all" | "unread" | "priority" | "refill";
  inboxCategory: "all" | MessageCategory;
  activeSmsThreadId: string;
  smsInput: string;
  selectedEmailId: string;
  emailReplyText: string;
  emailTo: string;
  emailSubject: string;
  faxBody: string;
  faxTo: string;
  faxSubject: string;
  communityReplyText: string;
}

export function readStoredCommunicationDrafts(): Partial<CommunicationDraftsState> {
  if (typeof sessionStorage === "undefined") return {};
  const key = scopedStorageKey(COMMUNICATION_DRAFTS_STORAGE_KEY);
  if (!key) return {};
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const result: Partial<CommunicationDraftsState> = {};
    for (const name of ["messageText", "messagePatientId", "taskText", "taskPatientId", "taskDueDate", "activeSmsThreadId", "smsInput", "selectedEmailId", "emailTo", "emailSubject", "emailReplyText", "faxTo", "faxSubject", "faxBody", "communityReplyText"] as const) {
      if (typeof parsed[name] === "string") result[name] = parsed[name];
    }
    if (["team", "inbox", "patient", "email", "fax", "community"].includes(parsed.channel)) result.channel = parsed.channel;
    if (["chat", "tasks"].includes(parsed.teamTab)) result.teamTab = parsed.teamTab;
    if (typeof parsed.selectedPartnerId === "string" || parsed.selectedPartnerId === null) result.selectedPartnerId = parsed.selectedPartnerId;
    if (["all", "unread", "priority", "refill"].includes(parsed.inboxFilter)) result.inboxFilter = parsed.inboxFilter;
    if (["all", "refill", "symptom-check", "scheduling", "general"].includes(parsed.inboxCategory)) result.inboxCategory = parsed.inboxCategory;
    if (parsed.partnerDrafts && typeof parsed.partnerDrafts === "object" && !Array.isArray(parsed.partnerDrafts)) {
      result.partnerDrafts = {};
      for (const [id, value] of Object.entries(parsed.partnerDrafts)) {
        if (!value || typeof value !== "object") continue;
        const draft = value as Record<string, unknown>;
        if (["messageText", "messagePatientId", "taskText", "taskPatientId", "taskDueDate"].every((field) => typeof draft[field] === "string")) {
          Object.defineProperty(result.partnerDrafts, id, { value: draft, enumerable: true, writable: true, configurable: true });
        }
      }
    }
    return result;
  } catch {
    return {};
  }
}

export function writeStoredCommunicationDrafts(drafts: Partial<CommunicationDraftsState>): void {
  if (typeof sessionStorage === "undefined") return;
  const key = scopedStorageKey(COMMUNICATION_DRAFTS_STORAGE_KEY);
  if (!key) return;
  try {
    sessionStorage.setItem(key, JSON.stringify(drafts));
  } catch {
    // Session storage full or unavailable
  }
}

export function clearStoredCommunicationDrafts(): void {
  if (typeof sessionStorage === "undefined") return;
  const key = scopedStorageKey(COMMUNICATION_DRAFTS_STORAGE_KEY);
  if (!key) return;
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Ignore
  }
}
