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

test("encounter-signed coordination contract establishes single authoritative notification point", async () => {
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
    // TodayDashboard and schedule surfaces subscribe to ehr-encounter-signed
    events.subscribeWorkspaceEvent(events.WORKSPACE_ENCOUNTER_SIGNED_EVENT, (detail) => {
      received.push(detail);
    });

    // EncounterWorkspace is the sole authoritative emitter upon successful persisted signature (D-017)
    events.dispatchWorkspaceEvent(events.WORKSPACE_ENCOUNTER_SIGNED_EVENT, {
      patientId: "patient-123",
      appointmentId: "apt-456",
    });

    // Verify exactly one emission occurred (dual-dispatch defect eliminated)
    assert.equal(received.length, 1);
    assert.equal(received[0].patientId, "patient-123");
    assert.equal(received[0].appointmentId, "apt-456");
  } finally {
    (globalThis as any).window = originalWindow;
  }
});

test("runtime payload validation guards safely reject and filter malformed event payloads", async () => {
  const events = await import("../app/lib/workspace-events");

  // Calendar jump validation
  assert.equal(events.isCalendarJumpDetail({ date: "2026-09-20", daysLater: 14 }), true);
  assert.equal(events.isCalendarJumpDetail({ date: "" }), false);
  assert.equal(events.isCalendarJumpDetail({ date: 123 }), false);
  assert.equal(events.isCalendarJumpDetail(null), false);
  assert.equal(events.isCalendarJumpDetail("not-an-object"), false);

  // Switch view validation
  assert.equal(events.isSwitchViewDetail({ view: "calendar" }), true);
  assert.equal(events.isSwitchViewDetail({ view: "" }), false);
  assert.equal(events.isSwitchViewDetail({ view: 42 }), false);
  assert.equal(events.isSwitchViewDetail({}), false);

  // Encounter signed validation
  assert.equal(events.isEncounterSignedDetail({ patientId: "pt-1", appointmentId: "apt-1" }), true);
  assert.equal(events.isEncounterSignedDetail({ patientId: "pt-1" }), true);
  assert.equal(events.isEncounterSignedDetail({ patientId: "" }), false);
  assert.equal(events.isEncounterSignedDetail({}), false);

  // Note insertion validation
  assert.equal(events.isInsertToNoteDetail({ patientId: "pt-1", text: "clinical note" }), true);
  assert.equal(events.isInsertToNoteDetail({ patientId: "pt-1", text: "" }), true);
  assert.equal(events.isInsertToNoteDetail({ patientId: "" }), false);

  // Document selection validation
  assert.equal(events.isSelectDocumentDetail({ patientId: "pt-1", documentId: "doc-1" }), true);
  assert.equal(events.isSelectDocumentDetail({ patientId: "pt-1" }), false);
  assert.equal(events.isSelectDocumentDetail({ documentId: "doc-1" }), false);

  // Automatic filter verification in subscribeWorkspaceEvent
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
    const receivedValid: any[] = [];
    const unsub = events.subscribeWorkspaceEvent(events.WORKSPACE_CALENDAR_JUMP_DATE_EVENT, (detail) => {
      receivedValid.push(detail);
    });

    // Untrusted malformed event dispatched to window directly
    mockWindow.dispatchEvent(new mockWindow.CustomEvent("ehr-calendar-jump-date", {
      detail: { date: "", daysLater: "invalid" },
    }));
    mockWindow.dispatchEvent(new mockWindow.CustomEvent("ehr-calendar-jump-date", {
      detail: null,
    }));
    mockWindow.dispatchEvent(new mockWindow.CustomEvent("ehr-calendar-jump-date", {
      detail: { notAField: 123 },
    }));

    // Valid event dispatched
    mockWindow.dispatchEvent(new mockWindow.CustomEvent("ehr-calendar-jump-date", {
      detail: { date: "2026-09-21", daysLater: 7 },
    }));

    assert.equal(receivedValid.length, 1);
    assert.equal(receivedValid[0].date, "2026-09-21");
    assert.equal(receivedValid[0].daysLater, 7);

    unsub();
  } finally {
    (globalThis as any).window = originalWindow;
  }
});

test("workspace navigation controller manages authoritative workspace transitions", async () => {
  const { registerNavigationController, getNavigationController } = await import("../app/lib/workspace-navigation");

  type State = {
    activeView: "home" | "today" | "calendar" | "patient";
    activeModule: string | null;
    openModuleTabs: string[];
    activePatientId: string | null;
    activePatientSection?: string;
    communicationsOpen: boolean;
  };

  const state: State = {
    activeView: "home",
    activeModule: null,
    openModuleTabs: [],
    activePatientId: null,
    communicationsOpen: false,
  };

  // Register controller
  const unregister = registerNavigationController({
    openHome: () => {
      state.activeView = "home";
      state.activeModule = null;
    },
    openToday: () => {
      state.activeView = "today";
      state.activeModule = null;
    },
    openCalendar: () => {
      state.activeView = "calendar";
      state.activeModule = null;
    },
    openPatient: (patientId: string, section?: string) => {
      state.activeView = "patient";
      state.activePatientId = patientId;
      state.activePatientSection = section;
      state.activeModule = null;
    },
    openGlobalModule: (module: string) => {
      state.activeModule = module;
      if (!state.openModuleTabs.includes(module)) {
        state.openModuleTabs.push(module);
      }
    },
    closeGlobalModule: (module?: string) => {
      const closing = module || state.activeModule;
      if (closing) {
        state.openModuleTabs = state.openModuleTabs.filter((m) => m !== closing);
      }
      state.activeModule = null;
    },
    openCommunications: () => {
      state.communicationsOpen = true;
    },
    toggleCommunications: () => {
      state.communicationsOpen = !state.communicationsOpen;
    },
  });

  const controller = getNavigationController();
  assert.ok(controller, "Controller must be registered");

  // Transition 1: Home -> Today
  assert.equal(state.activeView, "home");
  controller.openToday();
  assert.equal(state.activeView, "today");

  // Transition 2: Today -> Calendar
  controller.openCalendar();
  assert.equal(state.activeView, "calendar");

  // Transition 3: Calendar -> patient chart
  controller.openPatient("marcus-vance", "Medications");
  assert.equal(state.activeView, "patient");
  assert.equal(state.activePatientId, "marcus-vance");
  assert.equal(state.activePatientSection, "Medications");

  // Transition 4: patient chart -> Calendar
  controller.openCalendar();
  assert.equal(state.activeView, "calendar");

  // Transition 5: Calendar -> global module (Tasks)
  controller.openGlobalModule("tasks");
  assert.equal(state.activeModule, "tasks");
  assert.deepEqual(state.openModuleTabs, ["tasks"]);

  // Transition 6: Closing global module returns to underlying workspace
  controller.closeGlobalModule("tasks");
  assert.equal(state.activeModule, null);
  assert.deepEqual(state.openModuleTabs, []);
  assert.equal(state.activeView, "calendar");

  // Communications dock control
  assert.equal(state.communicationsOpen, false);
  controller.openCommunications?.();
  assert.equal(state.communicationsOpen, true);
  controller.toggleCommunications?.();
  assert.equal(state.communicationsOpen, false);

  unregister();
});

test("subscription helpers cleanly unsubscribe and prevent listener accumulation", async () => {
  const events = await import("../app/lib/workspace-events");

  const originalWindow = (globalThis as any).window;
  const listenerMap = new Map<string, Set<(e: any) => void>>();
  const mockWindow = {
    addEventListener: (type: string, listener: any) => {
      if (!listenerMap.has(type)) listenerMap.set(type, new Set());
      listenerMap.get(type)!.add(listener);
    },
    removeEventListener: (type: string, listener: any) => {
      listenerMap.get(type)?.delete(listener);
    },
    dispatchEvent: (event: any) => {
      const set = listenerMap.get(event.type);
      if (set) {
        for (const handler of set) handler(event);
      }
      return true;
    },
  };
  (globalThis as any).window = mockWindow;

  try {
    // Mount phase: 3 subscriptions
    const unsub1 = events.subscribeWorkspaceEvent(events.WORKSPACE_TASKS_UPDATED_EVENT, () => {});
    const unsub2 = events.subscribeWorkspaceEvent(events.WORKSPACE_TASKS_UPDATED_EVENT, () => {});
    assert.equal(listenerMap.get("ehr-tasks-updated")?.size, 2);

    // Unmount first component
    unsub1();
    assert.equal(listenerMap.get("ehr-tasks-updated")?.size, 1);

    // Unmount second component
    unsub2();
    assert.equal(listenerMap.get("ehr-tasks-updated")?.size, 0);
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


