import { patients } from "../domain/patient";

export type GlobalWorkspaceModule =
  | "inbox"
  | "tasks"
  | "documents"
  | "labs"
  | "billing"
  | "reports"
  | "settings";

export type NavigationLocation =
  | { kind: "today" }
  | { kind: "module"; module: GlobalWorkspaceModule }
  | { kind: "patient"; patientId: string; section: string; threadSubject?: string };

export const GLOBAL_WORKSPACE_MODULES = new Set<GlobalWorkspaceModule>([
  "inbox",
  "tasks",
  "documents",
  "labs",
  "billing",
  "reports",
  "settings",
]);

function patientIdForName(name: string) {
  return patients.find((patient) => patient.name === name)?.id ?? null;
}

function patientNameForId(id: string) {
  return patients.find((patient) => patient.id === id)?.name ?? null;
}

function patientIdFromTab(tab: Element) {
  const name = tab.querySelector(".tab-name")?.textContent?.trim() || "";
  return patientIdForName(name);
}

function nextFrame() {
  return new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
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
  return location;
}

export function navigationLocationKey(location: NavigationLocation) {
  if (location.kind === "today") return "today";
  if (location.kind === "module") return `module:${location.module}`;
  return `patient:${location.patientId}:${location.section}:${location.threadSubject || ""}`;
}

export async function navigateToPatientLocation(
  patientId: string,
  section = "Overview",
  threadSubject?: string,
) {
  window.dispatchEvent(new CustomEvent("ehr-global-module-close"));
  window.dispatchEvent(new CustomEvent("ehr-sidebar-clear-active"));

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

  await settleWorkspace(2);
  window.dispatchEvent(new CustomEvent("ehr-navigation-complete"));
  return true;
}

export async function navigateToLocation(location: NavigationLocation) {
  if (location.kind === "module") {
    window.dispatchEvent(new CustomEvent("ehr-switch-view", { detail: { view: location.module } }));
    await settleWorkspace(1);
    window.dispatchEvent(new CustomEvent("ehr-navigation-complete"));
    return true;
  }

  if (location.kind === "today") {
    window.dispatchEvent(new CustomEvent("ehr-global-module-close"));
    window.dispatchEvent(new CustomEvent("ehr-switch-view", { detail: { view: "today" } }));
    document.querySelector<HTMLButtonElement>(".home-tab")?.click();
    await settleWorkspace(2);
    window.dispatchEvent(new CustomEvent("ehr-navigation-complete"));
    return true;
  }

  return navigateToPatientLocation(location.patientId, location.section, location.threadSubject);
}
