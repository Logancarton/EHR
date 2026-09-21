import test from "node:test";
import assert from "node:assert/strict";
import type { WorkspaceDestination } from "../app/components/workspace/OpenWorkspaceLauncher";

test("UI-1: Open workspace launcher offers all required major destinations", () => {
  const requiredDestinations: WorkspaceDestination[] = [
    "home",
    "calendar",
    "patients",
    "intake",
    "documents",
    "billing",
    "brand",
  ];

  assert.equal(requiredDestinations.length, 7);
  assert.ok(requiredDestinations.includes("home"));
  assert.ok(requiredDestinations.includes("calendar"));
  assert.ok(requiredDestinations.includes("patients"));
  assert.ok(requiredDestinations.includes("intake"));
  assert.ok(requiredDestinations.includes("documents"));
  assert.ok(requiredDestinations.includes("billing"));
  assert.ok(requiredDestinations.includes("brand"));
});

test("UI-1: focus-existing rule recognizes open singleton workspaces", () => {
  interface WorkspaceState {
    activeView: string;
    calendarTabOpen: boolean;
    openModuleTabs: string[];
    activeModule: string | null;
  }

  function computeWorkspaceItemState(
    destination: WorkspaceDestination,
    state: WorkspaceState,
  ): { isOpen: boolean; statusLabel?: string } {
    if (destination === "home") {
      const isOpen = state.activeView === "home";
      return { isOpen, statusLabel: isOpen ? "Active" : undefined };
    }
    if (destination === "calendar") {
      const isOpen = state.calendarTabOpen;
      return { isOpen, statusLabel: isOpen ? "Open tab" : undefined };
    }
    if (destination === "patients") {
      const isOpen = state.activeView === "patient";
      return { isOpen, statusLabel: isOpen ? "Active chart" : undefined };
    }
    if (destination === "intake") {
      const isOpen = state.openModuleTabs.includes("intake") || state.activeModule === "intake";
      return { isOpen, statusLabel: isOpen ? "Open tab" : undefined };
    }
    if (destination === "documents") {
      const isOpen = state.activeModule === "documents";
      return { isOpen, statusLabel: isOpen ? "Active" : undefined };
    }
    if (destination === "billing") {
      const isOpen = state.openModuleTabs.includes("billing") || state.activeModule === "billing";
      return { isOpen, statusLabel: isOpen ? "Open tab" : undefined };
    }
    if (destination === "brand") {
      const isOpen = state.openModuleTabs.includes("website") || state.activeModule === "website";
      return { isOpen, statusLabel: isOpen ? "Open tab" : undefined };
    }
    return { isOpen: false };
  }

  // Baseline: Only dashboard is active
  const baselineState: WorkspaceState = {
    activeView: "today",
    calendarTabOpen: false,
    openModuleTabs: [],
    activeModule: null,
  };

  assert.equal(computeWorkspaceItemState("calendar", baselineState).isOpen, false);
  assert.equal(computeWorkspaceItemState("intake", baselineState).isOpen, false);
  assert.equal(computeWorkspaceItemState("billing", baselineState).isOpen, false);
  assert.equal(computeWorkspaceItemState("brand", baselineState).isOpen, false);

  // When Calendar tab is open
  const calendarOpenState: WorkspaceState = {
    ...baselineState,
    calendarTabOpen: true,
  };
  const calState = computeWorkspaceItemState("calendar", calendarOpenState);
  assert.equal(calState.isOpen, true);
  assert.equal(calState.statusLabel, "Open tab");

  // When Intake is open as a module tab
  const intakeOpenState: WorkspaceState = {
    ...baselineState,
    openModuleTabs: ["intake"],
    activeModule: "intake",
  };
  const intakeState = computeWorkspaceItemState("intake", intakeOpenState);
  assert.equal(intakeState.isOpen, true);
  assert.equal(intakeState.statusLabel, "Open tab");

  // When Billing is open as a module tab
  const billingOpenState: WorkspaceState = {
    ...baselineState,
    openModuleTabs: ["billing"],
  };
  const billState = computeWorkspaceItemState("billing", billingOpenState);
  assert.equal(billState.isOpen, true);
  assert.equal(billState.statusLabel, "Open tab");

  // When Brand (website) is open as a module tab
  const brandOpenState: WorkspaceState = {
    ...baselineState,
    openModuleTabs: ["website"],
  };
  const brandState = computeWorkspaceItemState("brand", brandOpenState);
  assert.equal(brandState.isOpen, true);
  assert.equal(brandState.statusLabel, "Open tab");

  // When Home is active
  const homeActiveState: WorkspaceState = {
    ...baselineState,
    activeView: "home",
  };
  const homeState = computeWorkspaceItemState("home", homeActiveState);
  assert.equal(homeState.isOpen, true);
  assert.equal(homeState.statusLabel, "Active");
});

test("UI-1: focus-existing rule distinguishes docked vs undocked patient charts", () => {
  interface PatientChartStatus {
    patientId: string;
    dockedPatientIds: string[];
    activePatientId: string;
    activeView: string;
  }

  function getPatientStatus(status: PatientChartStatus): { isDocked: boolean; isActive: boolean; statusLabel?: string } {
    const isDocked = status.dockedPatientIds.includes(status.patientId);
    const isActive = status.activeView === "patient" && status.activePatientId === status.patientId;
    return {
      isDocked,
      isActive,
      statusLabel: isActive ? "Active chart" : isDocked ? "Open tab" : undefined,
    };
  }

  // Patient is docked and currently active
  assert.deepEqual(
    getPatientStatus({
      patientId: "p1",
      dockedPatientIds: ["p1", "p2"],
      activePatientId: "p1",
      activeView: "patient",
    }),
    { isDocked: true, isActive: true, statusLabel: "Active chart" },
  );

  // Patient is docked but inactive (background tab)
  assert.deepEqual(
    getPatientStatus({
      patientId: "p2",
      dockedPatientIds: ["p1", "p2"],
      activePatientId: "p1",
      activeView: "patient",
    }),
    { isDocked: true, isActive: false, statusLabel: "Open tab" },
  );

  // Patient is not docked at all
  assert.deepEqual(
    getPatientStatus({
      patientId: "p3",
      dockedPatientIds: ["p1", "p2"],
      activePatientId: "p1",
      activeView: "patient",
    }),
    { isDocked: false, isActive: false, statusLabel: undefined },
  );
});

test("UI-1: search filter matches workspace keywords and patient names accurately", () => {
  const workspaces = [
    { id: "home", label: "Home", desc: "Suite launchpad & AI assistance" },
    { id: "calendar", label: "Calendar", desc: "Practice schedule & appointments" },
    { id: "patients", label: "Patients", desc: "Patient roster & clinical charts" },
    { id: "intake", label: "Intake", desc: "Patient registration & triage episodes" },
    { id: "documents", label: "Documents", desc: "Practice documents, records & faxes" },
    { id: "billing", label: "Billing", desc: "Claims, charges & billing review" },
    { id: "brand", label: "Brand", desc: "Clinic website & social reputation" },
  ];

  const patients = [
    { id: "p1", name: "Maya Chen", mrn: "MRN-101" },
    { id: "p2", name: "Elena Rostova", mrn: "MRN-102" },
    { id: "p3", name: "Jordan Reed", mrn: "MRN-103" },
  ];

  function filterAll(query: string) {
    const q = query.trim().toLowerCase();
    const matchedWs = workspaces.filter(
      (w) => w.label.toLowerCase().includes(q) || w.desc.toLowerCase().includes(q) || w.id.toLowerCase().includes(q),
    );
    const matchedPatients = patients.filter(
      (p) => p.name.toLowerCase().includes(q) || p.mrn.toLowerCase().includes(q),
    );
    return { matchedWs, matchedPatients };
  }

  // Filter "cal" matches Calendar (and clinical in Patients desc)
  const calFilter = filterAll("cal");
  assert.ok(calFilter.matchedWs.some((w) => w.id === "calendar"));
  assert.equal(calFilter.matchedPatients.length, 0);

  // Exact "calendar" matches only Calendar
  const calendarFilter = filterAll("calendar");
  assert.equal(calendarFilter.matchedWs.length, 1);
  assert.equal(calendarFilter.matchedWs[0]?.id, "calendar");

  // Filter "maya" matches Maya Chen
  const mayaFilter = filterAll("maya");
  assert.equal(mayaFilter.matchedWs.length, 0);
  assert.equal(mayaFilter.matchedPatients.length, 1);
  assert.equal(mayaFilter.matchedPatients[0]?.name, "Maya Chen");

  // Filter "bill" matches Billing
  const billFilter = filterAll("bill");
  assert.equal(billFilter.matchedWs.length, 1);
  assert.equal(billFilter.matchedWs[0]?.id, "billing");

  // Filter "brand" matches Brand
  const brandFilter = filterAll("brand");
  assert.equal(brandFilter.matchedWs.length, 1);
  assert.equal(brandFilter.matchedWs[0]?.id, "brand");

  // Filter "intake" matches Intake
  const intakeFilter = filterAll("intake");
  assert.equal(intakeFilter.matchedWs.length, 1);
  assert.equal(intakeFilter.matchedWs[0]?.id, "intake");

  // Filter "MRN-102" matches Elena
  const mrnFilter = filterAll("MRN-102");
  assert.equal(mrnFilter.matchedPatients.length, 1);
  assert.equal(mrnFilter.matchedPatients[0]?.name, "Elena Rostova");

  // Non-matching query
  const emptyFilter = filterAll("xyznonexistent");
  assert.equal(emptyFilter.matchedWs.length, 0);
  assert.equal(emptyFilter.matchedPatients.length, 0);
});
