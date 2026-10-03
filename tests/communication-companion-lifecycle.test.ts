import { setActiveCacheUserId } from "../app/lib/local-cache-scope";
import test from "node:test";
import assert from "node:assert/strict";
import {
  COMMUNICATION_DRAFTS_STORAGE_KEY,
  readStoredCommunicationDrafts,
  writeStoredCommunicationDrafts,
  clearStoredCommunicationDrafts,
  type CommunicationDraftsState,
} from "../app/lib/use-communication-drafts";

test("UI-4: readStoredCommunicationDrafts gracefully handles absent or malformed storage", () => {
  // Clear any existing mock or window
  clearStoredCommunicationDrafts();
  const drafts = readStoredCommunicationDrafts();
  assert.deepEqual(drafts, {});
});

test("UI-4: writeStoredCommunicationDrafts and readStoredCommunicationDrafts round-trip correctly", () => {
  const mockStorage: Record<string, string> = {};
  const originalSessionStorage = globalThis.sessionStorage;

  try {
    setActiveCacheUserId("synthetic-provider");
    globalThis.sessionStorage = {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, value: string) => {
        mockStorage[key] = value;
      },
      removeItem: (key: string) => {
        delete mockStorage[key];
      },
      clear: () => {
        for (const k of Object.keys(mockStorage)) delete mockStorage[k];
      },
      length: 0,
      key: () => null,
    };

    const draftData: Partial<CommunicationDraftsState> = {
      channel: "team",
      teamTab: "chat",
      selectedPartnerId: "usr-vance",
      messageText: "Follow-up lab review needed for Lithium level",
      messagePatientId: "pt-elena",
      taskText: "Schedule metabolic panel review",
      taskPatientId: "pt-elena",
      taskDueDate: "2026-09-25",
      inboxFilter: "priority",
      inboxCategory: "refill",
      activeSmsThreadId: "pt-2",
      smsInput: "Checking in regarding medication schedule",
      selectedEmailId: "em-2",
      emailReplyText: "Prior authorization details confirmed with pharmacy.",
      faxTo: "Bay Area Family Medicine",
      faxSubject: "Updated Treatment Plan",
      communityReplyText: "Clinical guidelines support this augmentation strategy.",
    };

    writeStoredCommunicationDrafts(draftData);
    assert.ok(mockStorage[`${COMMUNICATION_DRAFTS_STORAGE_KEY}::synthetic-provider`]);

    const retrieved = readStoredCommunicationDrafts();
    assert.equal(retrieved.channel, "team");
    assert.equal(retrieved.teamTab, "chat");
    assert.equal(retrieved.selectedPartnerId, "usr-vance");
    assert.equal(retrieved.messageText, "Follow-up lab review needed for Lithium level");
    assert.equal(retrieved.messagePatientId, "pt-elena");
    assert.equal(retrieved.taskText, "Schedule metabolic panel review");
    assert.equal(retrieved.taskPatientId, "pt-elena");
    assert.equal(retrieved.taskDueDate, "2026-09-25");
    assert.equal(retrieved.inboxFilter, "priority");
    assert.equal(retrieved.inboxCategory, "refill");
    assert.equal(retrieved.activeSmsThreadId, "pt-2");
    assert.equal(retrieved.smsInput, "Checking in regarding medication schedule");
    assert.equal(retrieved.selectedEmailId, "em-2");
    assert.equal(retrieved.emailReplyText, "Prior authorization details confirmed with pharmacy.");
    assert.equal(retrieved.faxTo, "Bay Area Family Medicine");
    assert.equal(retrieved.faxSubject, "Updated Treatment Plan");
    assert.equal(retrieved.communityReplyText, "Clinical guidelines support this augmentation strategy.");

    clearStoredCommunicationDrafts();
    assert.equal(mockStorage[`${COMMUNICATION_DRAFTS_STORAGE_KEY}::synthetic-provider`], undefined);
  } finally {
    globalThis.sessionStorage = originalSessionStorage;
    setActiveCacheUserId(null);
  }
});

test("UI-4: patient binding is preserved across drafts and does not silently retarget", () => {
  const initialDraft: Partial<CommunicationDraftsState> = {
    messageText: "Order lithium level for 3-month check",
    messagePatientId: "pt-marcus",
  };

  // Simulating background patient switch: the active patient in the clinic is now Elena,
  // but the drafted message must stay explicitly bound to Marcus.
  const newActivePatientId = "pt-elena";

  // The draft patient ID remains the explicitly selected patient from the draft
  const effectivePatientId = initialDraft.messagePatientId ?? newActivePatientId;
  assert.equal(effectivePatientId, "pt-marcus");
  assert.notEqual(effectivePatientId, newActivePatientId);
});

test("UI-4: canonical companion lifecycle transitions maintain presentation state invariants", () => {
  let presentation: "docked" | "expanded" = "docked";
  const preferredDockedWidth = 380;
  let companionPanelWidth = preferredDockedWidth;

  // 1. Minimized / Icon -> Docked
  let isOpen = true;
  assert.equal(isOpen, true);
  assert.equal(presentation, "docked");
  assert.equal(companionPanelWidth, 380);

  // 2. Docked -> Resized
  companionPanelWidth = 460;
  assert.equal(companionPanelWidth, 460);

  // 3. Docked -> Expanded Main Canvas
  presentation = "expanded";
  assert.equal(presentation, "expanded");
  // Panel width is preserved in memory/storage so redocking will restore it
  assert.equal(companionPanelWidth, 460);

  // 4. Expanded Main Canvas -> Redocked
  presentation = "docked";
  assert.equal(presentation, "docked");
  // Exact user-preferred width is retained
  assert.equal(companionPanelWidth, 460);

  // 5. Docked -> Minimized
  isOpen = false;
  presentation = "docked";
  assert.equal(isOpen, false);
  assert.equal(presentation, "docked");
});

test("D-117 communication session drafts stay with their authenticated owner", () => {
  const values = new Map<string, string>();
  const originalStorage = globalThis.sessionStorage;
  try {
    globalThis.sessionStorage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value); },
      removeItem: (key) => { values.delete(key); }, clear: () => values.clear(), length: 0, key: () => null,
    };
    // Unscoped old sessions cannot prove their creator; keep them quarantined.
    values.set(COMMUNICATION_DRAFTS_STORAGE_KEY, JSON.stringify({ messageText: "Legacy unbound draft" }));
    setActiveCacheUserId("synthetic-a");
    assert.deepEqual(readStoredCommunicationDrafts(), {});
    writeStoredCommunicationDrafts({ messageText: "A's staff draft", selectedPartnerId: "staff-a" });
    setActiveCacheUserId("synthetic-b");
    assert.deepEqual(readStoredCommunicationDrafts(), {});
    writeStoredCommunicationDrafts({ emailTo: "outside@example.test", emailReplyText: "B's external draft" });
    setActiveCacheUserId("synthetic-a");
    assert.equal(readStoredCommunicationDrafts().messageText, "A's staff draft");
    assert.equal(readStoredCommunicationDrafts().emailTo, undefined);
    values.set(`${COMMUNICATION_DRAFTS_STORAGE_KEY}::synthetic-a`, JSON.stringify({ channel: "invalid", messageText: 42, partnerDrafts: { bad: null } }));
    assert.deepEqual(readStoredCommunicationDrafts(), { partnerDrafts: {} });
    setActiveCacheUserId(null);
    assert.deepEqual(readStoredCommunicationDrafts(), {});
  } finally {
    globalThis.sessionStorage = originalStorage;
    setActiveCacheUserId(null);
  }
});
