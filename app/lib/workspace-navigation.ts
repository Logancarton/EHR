import { rosterPatientIdForName, rosterPatientNameForId } from "./patient-roster";
import { findTool, isAvailableTool } from "./workspace-tools";
import {
  WORKSPACE_GLOBAL_MODULE_CLOSE_EVENT,
  WORKSPACE_NAVIGATION_COMPLETE_EVENT,
  WORKSPACE_SELECT_DOCUMENT_EVENT,
  WORKSPACE_SIDEBAR_CLEAR_ACTIVE_EVENT,
  WORKSPACE_SWITCH_VIEW_EVENT,
  dispatchWorkspaceEvent,
} from "./workspace-events";

export type GlobalWorkspaceModule =
  | "calendar"
  | "intake"
  | "inbox"
  | "tasks"
  | "documents"
  | "labs"
  | "prescribing"
  | "billing"
  | "reports"
  | "settings"
  | "website"
  | "social_media"
  | "email"
  | "hr"
  | "patient_communication"
  | "financial_integration"
  | "fax"
  | "community";

export type NavigationLocation =
  | { kind: "today" }
  | { kind: "module"; module: GlobalWorkspaceModule }
  | { kind: "patient"; patientId: string; section: string; threadSubject?: string; documentId?: string };

// Calendar has its own first-class persistent workspace/tab. It is deliberately
// not a global overlay module: one destination must have one renderer/owner.
export const GLOBAL_WORKSPACE_MODULES = new Set<GlobalWorkspaceModule>([
  "intake",
  "inbox",
  "tasks",
  "documents",
  "labs",
  "prescribing",
  "billing",
  "reports",
  "settings",
  "website",
  "social_media",
  "email",
  "hr",
  "patient_communication",
  "financial_integration",
  "fax",
  "community",
]);

/**
 * Whether a global module has a working surface behind it.
 *
 * One answer, derived from the tool registry, so the launcher, the app drawer, the
 * home shortcuts and the workspace shell cannot disagree about it. They did: at
 * P9-0 the registry called Billing available while the dashboard registry called it
 * planned, and three separate hard-coded destination lists offered tiles the
 * registry had nothing to say about.
 *
 * Modules with no registry entry (the queue-backed `fax` and `community` surfaces)
 * are available; they are renderers rather than pinnable tools.
 */
export function isGlobalModuleAvailable(module: GlobalWorkspaceModule): boolean {
  const tool = findTool(module);
  return tool ? isAvailableTool(tool) : true;
}

/** The display name for a module — shared by the module shell's own header and
 * the workspace tab strip, so the two cannot disagree about what to call it. */
export function moduleTitle(module: GlobalWorkspaceModule): string {
  return {
    calendar: "Calendar",
    intake: "Intake",
    inbox: "Inbox",
    tasks: "Tasks",
    documents: "Documents",
    labs: "Labs",
    prescribing: "Prescribing Operations",
    billing: "Billing & Claims",
    reports: "Reports",
    settings: "Settings",
    website: "Clinic Website & Portal",
    social_media: "Social Media & Reputation",
    email: "Practice Email",
    hr: "Staff & Clinician HR",
    patient_communication: "Patient Communication & SMS",
    financial_integration: "Financial Integration & Banking",
    fax: "Digital Fax & e-Fax Records",
    community: "Clinician Community & Peer Network",
  }[module];
}

/**
 * Modules the workspace tab strip tracks as persistent, closeable tabs —
 * every global module except the ones with their own dedicated tab already
 * (`calendar`, D-072) or that are chart-scoped surfaces reached through the
 * same event rather than standalone destinations (`documents`, `labs`).
 */
export function isTabEligibleModule(module: GlobalWorkspaceModule): boolean {
  return module !== "calendar" && module !== "documents" && module !== "labs";
}

// Navigation reads the roster snapshot rather than awaiting it: every caller runs
// inside the authenticated shell, which has already loaded the roster by the time a
// chart can be navigated to. A name or id the roster does not hold is not navigable.
function patientIdForName(name: string) {
  return rosterPatientIdForName(name);
}

function patientNameForId(id: string) {
  return rosterPatientNameForId(id);
}

function patientIdFromTab(tab: Element) {
  const name = tab.querySelector(".tab-name")?.textContent?.trim() || "";
  return patientIdForName(name);
}

export function currentActivePatientId() {
  const activeTab = document.querySelector<HTMLElement>(".browser-tab.active");
  return activeTab ? patientIdFromTab(activeTab) : null;
}

/**
 * One paint, or a timer if there will not be one: animation frames stop in a
 * background tab, and navigation must still complete there.
 */
function nextFrame() {
  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    window.requestAnimationFrame(finish);
    window.setTimeout(finish, 32);
  });
}

export async function settleWorkspace(frames = 2) {
  for (let index = 0; index < frames; index += 1) await nextFrame();
}

export async function waitForWorkspace<T>(
  factory: () => T | null | undefined,
  timeout = 3000,
): Promise<T | null> {
  const started = performance.now();
  while (performance.now() - started < timeout) {
    const value = factory();
    if (value) return value;
    await new Promise((resolve) => window.setTimeout(resolve, 40));
  }
  return null;
}

function setControlledInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

export function findDockedPatientTab(patientId: string) {
  return Array.from(document.querySelectorAll<HTMLElement>(".browser-tab")).find(
    (tab) => patientIdFromTab(tab) === patientId,
  ) ?? null;
}

export async function ensurePatientOpen(patientId: string) {
  const existing = findDockedPatientTab(patientId);
  if (existing) return existing;

  const patientName = patientNameForId(patientId);
  if (!patientName) return null;
  const input = document.querySelector<HTMLInputElement>(".patient-search-wrap input");
  if (!input) return null;

  input.focus();
  setControlledInputValue(input, patientName);
  await settleWorkspace(2);

  const result = await waitForWorkspace(() =>
    Array.from(document.querySelectorAll<HTMLButtonElement>(".search-results button")).find((button) => {
      const strong = button.querySelector("strong")?.textContent?.trim();
      return strong === patientName;
    }),
  );
  if (!result) return null;
  result.click();
  return waitForWorkspace(() => findDockedPatientTab(patientId));
}

export function activeNavigationLocation(activeModule?: GlobalWorkspaceModule | null): NavigationLocation | null {
  if (activeModule) return { kind: "module", module: activeModule };
  if (document.querySelector(".home-tab.active")) return { kind: "today" };

  const activeTab = document.querySelector<HTMLElement>(".browser-tab.active");
  const patientId = activeTab ? patientIdFromTab(activeTab) : null;
  if (!patientId) return null;

  const section = Array.from(
    document.querySelectorAll<HTMLButtonElement>(".primary-workspace-pane .section-tabs button"),
  ).find((button) => button.classList.contains("active"))?.textContent?.trim() || "Overview";

  const location: NavigationLocation = { kind: "patient", patientId, section };
  if (section === "Messages") {
    const subject = document.querySelector<HTMLElement>(".thread-item.active .thread-subject")?.textContent?.trim();
    if (subject) location.threadSubject = subject;
  }
  if (section === "Documents") {
    const selected = document.querySelector<HTMLElement>(".primary-workspace-pane .patient-doc-row.active");
    const documentId = selected?.dataset.documentId;
    if (documentId) location.documentId = documentId;
  }
  return location;
}

export function navigationLocationKey(location: NavigationLocation) {
  if (location.kind === "today") return "today";
  if (location.kind === "module") return `module:${location.module}`;
  return `patient:${location.patientId}:${location.section}:${location.threadSubject || ""}:${location.documentId || ""}`;
}

export async function navigateToPatientLocation(
  patientId: string,
  section = "Overview",
  threadSubject?: string,
  documentId?: string,
) {
  dispatchWorkspaceEvent(WORKSPACE_GLOBAL_MODULE_CLOSE_EVENT);
  dispatchWorkspaceEvent(WORKSPACE_SIDEBAR_CLEAR_ACTIVE_EVENT);

  const tab = await ensurePatientOpen(patientId);
  if (!tab) return false;
  tab.click();
  await settleWorkspace(2);

  const primary = await waitForWorkspace(() => document.querySelector<HTMLElement>(".primary-workspace-pane"));
  if (!primary) return false;
  const sectionButton = Array.from(primary.querySelectorAll<HTMLButtonElement>(".section-tabs button"))
    .find((button) => button.textContent?.trim() === section);
  sectionButton?.click();

  if (section === "Messages" && threadSubject) {
    await waitForWorkspace(() => document.querySelector<HTMLElement>(".patient-messages-container"));
    const thread = await waitForWorkspace(() =>
      Array.from(document.querySelectorAll<HTMLElement>(".thread-item")).find(
        (item) => item.querySelector(".thread-subject")?.textContent?.trim() === threadSubject,
      ),
      4000,
    );
    thread?.click();
  }

  if (section === "Documents" && documentId) {
    await waitForWorkspace(() => document.querySelector<HTMLElement>(".patient-documents-workspace"), 4000);
    dispatchWorkspaceEvent(WORKSPACE_SELECT_DOCUMENT_EVENT, { patientId, documentId });
    await settleWorkspace(1);
  }

  await settleWorkspace(2);
  dispatchWorkspaceEvent(WORKSPACE_NAVIGATION_COMPLETE_EVENT);
  return true;
}

export async function navigateToLocation(location: NavigationLocation) {
  if (location.kind === "module") {
    dispatchWorkspaceEvent(WORKSPACE_SWITCH_VIEW_EVENT, { view: location.module });
    await settleWorkspace(1);
    dispatchWorkspaceEvent(WORKSPACE_NAVIGATION_COMPLETE_EVENT);
    return true;
  }

  if (location.kind === "today") {
    dispatchWorkspaceEvent(WORKSPACE_GLOBAL_MODULE_CLOSE_EVENT);
    dispatchWorkspaceEvent(WORKSPACE_SWITCH_VIEW_EVENT, { view: "today" });
    document.querySelector<HTMLButtonElement>(".home-tab")?.click();
    await settleWorkspace(2);
    dispatchWorkspaceEvent(WORKSPACE_NAVIGATION_COMPLETE_EVENT);
    return true;
  }

  return navigateToPatientLocation(location.patientId, location.section, location.threadSubject, location.documentId);
}
