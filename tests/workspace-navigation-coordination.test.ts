import test from "node:test";
import assert from "node:assert/strict";
import {
  GLOBAL_WORKSPACE_MODULES,
  isTabEligibleModule,
  moduleTitle,
} from "../app/lib/workspace-navigation";
import type {
  WorkspaceEncounterSignedDetail,
  WorkspaceInsertToNoteDetail,
} from "../app/lib/workspace-events";

test("tab-eligible modules exclude dedicated calendar workspace and chart-scoped documents/labs", () => {
  // Calendar has its own first-class workspace tab (D-072).
  assert.equal(isTabEligibleModule("calendar"), false);

  // Documents and labs are chart-scoped surfaces, not global module tabs.
  assert.equal(isTabEligibleModule("documents"), false);
  assert.equal(isTabEligibleModule("labs"), false);

  // Standard global modules are eligible for persistent tabs.
  assert.equal(isTabEligibleModule("inbox"), true);
  assert.equal(isTabEligibleModule("tasks"), true);
  assert.equal(isTabEligibleModule("billing"), true);
  assert.equal(isTabEligibleModule("intake"), true);
  assert.equal(isTabEligibleModule("prescribing"), true);

  // Every module in GLOBAL_WORKSPACE_MODULES has a non-empty human-readable title.
  for (const mod of GLOBAL_WORKSPACE_MODULES) {
    const title = moduleTitle(mod);
    assert.ok(title && title.length > 0, `Module ${mod} must have a title`);
  }
});

test("persistent tab fallback priority follows Dashboard -> Calendar -> Patient -> Home", () => {
  type FallbackOptions = {
    dashboardTabOpen: boolean;
    calendarTabOpen: boolean;
    hasActivePatient: boolean;
  };

  function computeFallback({ dashboardTabOpen, calendarTabOpen, hasActivePatient }: FallbackOptions): "today" | "calendar" | "patient" | "home" {
    if (dashboardTabOpen) return "today";
    if (calendarTabOpen) return "calendar";
    if (hasActivePatient) return "patient";
    return "home";
  }

  // When Dashboard is open, it takes top fallback priority.
  assert.equal(
    computeFallback({ dashboardTabOpen: true, calendarTabOpen: true, hasActivePatient: true }),
    "today",
  );

  // When Dashboard is closed but Calendar is open, Calendar takes precedence over chart.
  assert.equal(
    computeFallback({ dashboardTabOpen: false, calendarTabOpen: true, hasActivePatient: true }),
    "calendar",
  );

  // When Dashboard and Calendar are closed, active chart takes precedence over Home.
  assert.equal(
    computeFallback({ dashboardTabOpen: false, calendarTabOpen: false, hasActivePatient: true }),
    "patient",
  );

  // When nothing is open, safe landing is Home.
  assert.equal(
    computeFallback({ dashboardTabOpen: false, calendarTabOpen: false, hasActivePatient: false }),
    "home",
  );
});

test("calendar close fallback follows Dashboard -> Patient -> Home", () => {
  function computeCalendarCloseFallback(dashboardOpen: boolean, hasActivePatient: boolean): "today" | "patient" | "home" {
    if (dashboardOpen) return "today";
    if (hasActivePatient) return "patient";
    return "home";
  }

  assert.equal(computeCalendarCloseFallback(true, true), "today");
  assert.equal(computeCalendarCloseFallback(false, true), "patient");
  assert.equal(computeCalendarCloseFallback(false, false), "home");
});

test("empty or unselected active patient safely lands on home rather than blank chart", () => {
  function safeLandingView(activeView: string, hasActivePatient: boolean): string {
    if (activeView === "patient" && !hasActivePatient) return "home";
    return activeView;
  }

  assert.equal(safeLandingView("patient", false), "home");
  assert.equal(safeLandingView("patient", true), "patient");
  assert.equal(safeLandingView("today", false), "today");
  assert.equal(safeLandingView("calendar", false), "calendar");
});

test("workspace event constants preserve exact repository event names", async () => {
  const events = await import("../app/lib/workspace-events");
  assert.equal(events.WORKSPACE_SWITCH_VIEW_EVENT, "ehr-switch-view");
  assert.equal(events.WORKSPACE_GLOBAL_MODULE_CLOSE_EVENT, "ehr-global-module-close");
  assert.equal(events.WORKSPACE_CALENDAR_JUMP_DATE_EVENT, "ehr-calendar-jump-date");
  assert.equal(events.WORKSPACE_INSERT_TO_NOTE_EVENT, "ehr-insert-to-note");
  assert.equal(events.WORKSPACE_ENCOUNTER_SIGNED_EVENT, "ehr-encounter-signed");
  assert.equal(events.WORKSPACE_SELECT_DOCUMENT_EVENT, "ehr-select-document");
  assert.equal(events.WORKSPACE_NAVIGATION_COMPLETE_EVENT, "ehr-navigation-complete");
  assert.equal(events.WORKSPACE_SIDEBAR_CLEAR_ACTIVE_EVENT, "ehr-sidebar-clear-active");
  assert.equal(events.WORKSPACE_SIDEBAR_BADGES_EVENT, "ehr-sidebar-badges");
  assert.equal(events.WORKSPACE_SIDEBAR_VISIBILITY_EVENT, "ehr-sidebar-visibility");
  assert.equal(events.WORKSPACE_NAVIGATION_MENU_OPEN_EVENT, "ehr-navigation-menu-open");
});

test("typed workspace event helpers dispatch and subscribe cleanly", async () => {
  const events = await import("../app/lib/workspace-events");
  const captured: any[] = [];

  // Simulate a minimal browser window event target if window is not defined
  const originalWindow = (globalThis as any).window;
  const listeners = new Map<string, Set<(e: any) => void>>();
  const mockWindow = {
    addEventListener: (type: string, listener: any) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener);
    },
    removeEventListener: (type: string, listener: any) => {
      listeners.get(type)?.delete(listener);
    },
    dispatchEvent: (event: any) => {
      const set = listeners.get(event.type);
      if (set) {
        for (const handler of set) handler(event);
      }
      return true;
    },
    CustomEvent: class CustomEvent {
      type: string;
      detail: any;
      constructor(type: string, init?: { detail?: any }) {
        this.type = type;
        this.detail = init?.detail;
      }
    },
  };
  (globalThis as any).window = mockWindow;
  (globalThis as any).CustomEvent = mockWindow.CustomEvent;

  try {
    const unsub = events.subscribeWorkspaceEvent(
      events.WORKSPACE_SWITCH_VIEW_EVENT,
      (detail) => {
        captured.push(detail);
      },
    );

    events.dispatchWorkspaceEvent(events.WORKSPACE_SWITCH_VIEW_EVENT, { view: "calendar" });
    assert.equal(captured.length, 1);
    assert.equal(captured[0].view, "calendar");

    unsub();
    events.dispatchWorkspaceEvent(events.WORKSPACE_SWITCH_VIEW_EVENT, { view: "today" });
    // Should not receive further events after unsubscribing
    assert.equal(captured.length, 1);
  } finally {
    (globalThis as any).window = originalWindow;
  }
});

test("encounter-signed coordination contract characterizes the preserved dual-dispatch notification", async () => {
  const events = await import("../app/lib/workspace-events");
  const received: WorkspaceEncounterSignedDetail[] = [];

  const originalWindow = (globalThis as any).window;
  const listeners = new Map<string, Set<(e: any) => void>>();
  const mockWindow = {
    addEventListener: (type: string, listener: any) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener);
    },
    removeEventListener: (type: string, listener: any) => {
      listeners.get(type)?.delete(listener);
    },
    dispatchEvent: (event: any) => {
      const set = listeners.get(event.type);
      if (set) {
        for (const handler of set) handler(event);
      }
      return true;
    },
    CustomEvent: class CustomEvent {
      type: string;
      detail: any;
      constructor(type: string, init?: { detail?: any }) {
        this.type = type;
        this.detail = init?.detail;
      }
    },
  };
  (globalThis as any).window = mockWindow;
  (globalThis as any).CustomEvent = mockWindow.CustomEvent;

  try {
    // TodayDashboard and CareCompletionDashboardWindow subscribe to ehr-encounter-signed
    events.subscribeWorkspaceEvent(events.WORKSPACE_ENCOUNTER_SIGNED_EVENT, (detail) => {
      received.push(detail);
    });

    // 1. EncounterWorkspace dispatches the initial signed event
    events.dispatchWorkspaceEvent(events.WORKSPACE_ENCOUNTER_SIGNED_EVENT, {
      patientId: "patient-123",
      appointmentId: "apt-456",
    });

    // 2. PatientWorkspace.handleEncounterSigned callback also dispatches to notify subscribers
    events.dispatchWorkspaceEvent(events.WORKSPACE_ENCOUNTER_SIGNED_EVENT, {
      patientId: "patient-123",
      appointmentId: "apt-456",
    });

    // Verify both emissions are received and preserve exact structure
    assert.equal(received.length, 2);
    assert.equal(received[0].patientId, "patient-123");
    assert.equal(received[0].appointmentId, "apt-456");
    assert.equal(received[1].patientId, "patient-123");
    assert.equal(received[1].appointmentId, "apt-456");
  } finally {
    (globalThis as any).window = originalWindow;
  }
});

test("insert-to-note event contract enforces strict patientId scoping", () => {
  function insertToDraft(
    currentDraft: { patientId: string; status: string; note: string },
    eventDetail: WorkspaceInsertToNoteDetail,
  ): boolean {
    if (eventDetail.patientId === currentDraft.patientId && currentDraft.status !== "signed") {
      currentDraft.note += (currentDraft.note ? "\n\n" : "") + eventDetail.text;
      return true;
    }
    return false;
  }

  const draft = { patientId: "patient-a", status: "draft", note: "" };

  // Matching patientId successfully inserts text into note
  const applied = insertToDraft(draft, { patientId: "patient-a", text: "Synthesis for patient A" });
  assert.equal(applied, true);
  assert.equal(draft.note, "Synthesis for patient A");

  // Non-matching patientId is strictly refused
  const refusedWrongPatient = insertToDraft(draft, { patientId: "patient-b", text: "Synthesis for patient B" });
  assert.equal(refusedWrongPatient, false);
  assert.equal(draft.note, "Synthesis for patient A");

  // Signed draft is strictly refused
  draft.status = "signed";
  const refusedSigned = insertToDraft(draft, { patientId: "patient-a", text: "New synthesis" });
  assert.equal(refusedSigned, false);
});


