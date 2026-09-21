"use client";

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
  faxTo: string;
  faxSubject: string;
  communityReplyText: string;
}

export function readStoredCommunicationDrafts(): Partial<CommunicationDraftsState> {
  if (typeof sessionStorage === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(COMMUNICATION_DRAFTS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export function writeStoredCommunicationDrafts(drafts: Partial<CommunicationDraftsState>): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(COMMUNICATION_DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
  } catch {
    // Session storage full or unavailable
  }
}

export function clearStoredCommunicationDrafts(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(COMMUNICATION_DRAFTS_STORAGE_KEY);
  } catch {
    // Ignore
  }
}
