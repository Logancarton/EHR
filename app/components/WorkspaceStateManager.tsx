"use client";

import { useEffect } from "react";
import { patients } from "../domain/patient";
import {
  type ProviderWorkspaceState,
  type WorkspaceCompanionPanel,
  type WorkspaceSection,
  type WorkspaceWindowState,
  sanitizeWorkspaceState,
} from "../lib/workspace-state";

const SAVE_DELAY_MS = 850;
const PATIENT_WAIT_MS = 2600;
/**
 * Restoring the final view waits for a whole surface to render with its data, not
 * for a node to appear in an already-rendered tree, so it gets a larger budget.
 * Under the shorter one a cold start could exhaust the wait and silently leave the
 * clinician on the wrong view.
 */
const VIEW_RESTORE_WAIT_MS = 10_000;

const SIDEBAR_LABEL_TO_ID: Record<string, string> = {
  Today: "today",
  Patients: "patients",
  Schedule: "schedule",
  Inbox: "inbox",
  Tasks: "tasks",
  Documents: "documents",
  Labs: "labs",
  Billing: "billing",
  Reports: "reports",
  Settings: "settings",
};

const COMPANION_LABEL_TO_ID: Record<string, Exclude<WorkspaceCompanionPanel, null>> = {
  "Clinical AI": "ai",
  "Clinical Scratchpad": "scratchpad",
  "Tasks & Follow-ups": "tasks",
  "Clinical Calculators": "calc",
};

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

function patientIdFromPane(pane: Element) {
  const name = pane.querySelector(".detached-pane-title strong")?.textContent?.trim() || "";
  return patientIdForName(name);
}

function findDockedTab(patientId: string) {
  return Array.from(document.querySelectorAll<HTMLElement>(".browser-tab")).find(
    (tab) => patientIdFromTab(tab) === patientId,
  ) ?? null;
}

function findDetachedPane(patientId: string) {
  return Array.from(document.querySelectorAll<HTMLElement>(".detached-patient-pane")).find(
    (pane) => patientIdFromPane(pane) === patientId,
  ) ?? null;
}

function allOpenPatientIds() {
  const ids = new Set<string>();
  document.querySelectorAll(".browser-tab").forEach((tab) => {
    const id = patientIdFromTab(tab);
    if (id) ids.add(id);
  });
  document.querySelectorAll(".detached-patient-pane").forEach((pane) => {
    const id = patientIdFromPane(pane);
    if (id) ids.add(id);
  });
  return [...ids];
}

function activeSection(selector: string): WorkspaceSection {
  const text = document.querySelector(selector)?.textContent?.trim();
  if (
    text === "Overview" ||
    text === "Encounter" ||
    text === "Meds" ||
    text === "Labs" ||
    text === "Messages" ||
    text === "Documents" ||
    text === "History"
  ) {
    return text;
  }
  return "Overview";
}

function sidebarToolIds() {
  return Array.from(document.querySelectorAll<HTMLElement>(".dynamic-left-rail .rail-item"))
    .map((item) => {
      const title = item.getAttribute("title") || "";
      const match = title.match(/^Open ([^.]+)\./);
      return match?.[1] ? SIDEBAR_LABEL_TO_ID[match[1]] : undefined;
    })
    .filter((id): id is string => Boolean(id));
}

function companionPanel(): WorkspaceCompanionPanel {
  const active = document.querySelector<HTMLElement>(".companion-rail-btn.active");
  if (!active) return document.querySelector(".ai-toggle.active") ? "ai" : null;
  return COMPANION_LABEL_TO_ID[active.getAttribute("aria-label") || ""] ?? null;
}

function workspaceRect() {
  const rect = document.querySelector<HTMLElement>(".workspace-body")?.getBoundingClientRect();
  if (!rect || rect.width <= 0 || rect.height <= 0) return null;
  return rect;
}

function ratio(value: number, origin: number, span: number) {
  if (span <= 0) return 0;
  return Math.min(1, Math.max(0, (value - origin) / span));
}

function captureWindowState(
  pane: HTMLElement,
  previous?: WorkspaceWindowState,
): WorkspaceWindowState | null {
  const bounds = workspaceRect();
  if (!bounds) return previous ?? null;

  const minimized = pane.dataset.minimized === "true";
  if (minimized && previous) return { ...previous, minimized: true, maximized: false };

  const rect = pane.getBoundingClientRect();
  if (rect.width < 10 || rect.height < 10) return previous ?? null;

  const state: WorkspaceWindowState = {
    leftRatio: ratio(rect.left, bounds.left, bounds.width),
    topRatio: ratio(rect.top, bounds.top, bounds.height),
    widthRatio: Math.min(1, Math.max(0.15, rect.width / bounds.width)),
    heightRatio: Math.min(1, Math.max(0.15, rect.height / bounds.height)),
  };

  const snapTarget = pane.dataset.snapTarget;
  if (
    snapTarget === "left" || snapTarget === "right" || snapTarget === "top-left" ||
    snapTarget === "top-right" || snapTarget === "bottom-left" || snapTarget === "bottom-right" ||
    snapTarget === "full"
  ) {
    state.snapTarget = snapTarget;
  }
  if (minimized) state.minimized = true;
  if (pane.dataset.maximized === "true") state.maximized = true;
  return state;
}

function currentWorkspaceState(
  lastWindowStates: Map<string, WorkspaceWindowState>,
): ProviderWorkspaceState | null {
  if (!document.querySelector(".app-shell")) return null;

  const dockedPatientIds = Array.from(document.querySelectorAll<HTMLElement>(".browser-tab"))
    .map(patientIdFromTab)
    .filter((id): id is string => Boolean(id));
  const detachedPatientIds = Array.from(document.querySelectorAll<HTMLElement>(".detached-patient-pane"))
    .map(patientIdFromPane)
    .filter((id): id is string => Boolean(id));

  const activeTab = document.querySelector<HTMLElement>(".browser-tab.active");
  const activePatientId = activeTab ? patientIdFromTab(activeTab) : dockedPatientIds[0] ?? null;
  const patientSections: Record<string, WorkspaceSection> = {};
  for (const tab of document.querySelectorAll<HTMLElement>(".browser-tab")) {
    const id = patientIdFromTab(tab);
    if (id) patientSections[id] = (tab.dataset.patientSection ?? "Overview") as WorkspaceSection;
  }
  const detachedSections: Record<string, WorkspaceSection> = {};
  const windowStates: Record<string, WorkspaceWindowState> = {};

  for (const id of detachedPatientIds) {
    const pane = findDetachedPane(id);
    if (!pane) continue;
    detachedSections[id] = activeSectionForPane(pane);
    patientSections[id] = detachedSections[id];
    const state = captureWindowState(pane, lastWindowStates.get(id));
    if (state) {
      windowStates[id] = state;
      lastWindowStates.set(id, state);
    }
  }

  return {
    version: 1,
    // Read the view from what is actually rendered. Keying off the home tab's
    // `active` class alone let a snapshot taken before React applied that class
    // record "patient" while the Today dashboard was on screen — so the next
    // reload restored a patient chart the clinician had already navigated away from.
    activeView: document.querySelector(".today-dashboard") || document.querySelector(".home-tab.active")
      ? "today"
      : "patient",
    dockedPatientIds,
    detachedPatientIds,
    activePatientId,
    activeSection: activeSection(".primary-workspace-pane .section-tabs button.active"),
    detachedSections,
    patientSections,
    activeCompanionPanel: companionPanel(),
    sidebarToolIds: sidebarToolIds(),
    windowStates,
    savedAt: new Date().toISOString(),
  };
}

function activeSectionForPane(pane: HTMLElement): WorkspaceSection {
  const text = pane.querySelector(".compact-section-tabs button.active")?.textContent?.trim();
  if (
    text === "Overview" || text === "Encounter" || text === "Meds" || text === "Labs" ||
    text === "Messages" || text === "Documents" || text === "History"
  ) return text;
  return "Overview";
}

function nextFrame() {
  return new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
}

async function settle(frames = 2) {
  for (let index = 0; index < frames; index += 1) await nextFrame();
}

async function waitUntil<T>(factory: () => T | null | undefined, timeout = PATIENT_WAIT_MS): Promise<T | null> {
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

async function openPatient(patientId: string) {
  if (findDockedTab(patientId) || findDetachedPane(patientId)) return true;
  const name = patientNameForId(patientId);
  if (!name) return false;

  const input = document.querySelector<HTMLInputElement>(".patient-search-wrap input");
  if (!input) return false;
  input.focus();
  setControlledInputValue(input, name);
  await settle(2);

  const result = await waitUntil(() => Array.from(document.querySelectorAll<HTMLButtonElement>(".search-results button"))
    .find((button) => button.textContent?.includes(name)));
  if (!result) return false;
  result.click();
  return Boolean(await waitUntil(() => findDockedTab(patientId) || findDetachedPane(patientId)));
}

function transfer() {
  try {
    return new DataTransfer();
  } catch {
    return null;
  }
}

async function dragTab(source: HTMLElement, target: HTMLElement) {
  const dataTransfer = transfer();
  if (!dataTransfer) return false;
  source.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer }));
  await settle(2);
  target.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer }));
  target.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer }));
  source.dispatchEvent(new DragEvent("dragend", { bubbles: true, cancelable: true, dataTransfer }));
  await settle(2);
  return true;
}

async function detachPatient(patientId: string) {
  if (findDetachedPane(patientId)) return true;
  const tab = findDockedTab(patientId);
  const workspace = document.querySelector<HTMLElement>(".workspace-body");
  if (!tab || !workspace) return false;
  const dragged = await dragTab(tab, workspace);
  if (!dragged) return false;
  return Boolean(await waitUntil(() => findDetachedPane(patientId)));
}

async function reorderDockedPatients(patientIds: string[]) {
  for (let desiredIndex = 0; desiredIndex < patientIds.length; desiredIndex += 1) {
    const currentTabs = Array.from(document.querySelectorAll<HTMLElement>(".browser-tab"));
    const currentIds = currentTabs.map(patientIdFromTab).filter((id): id is string => Boolean(id));
    if (currentIds[desiredIndex] === patientIds[desiredIndex]) continue;

    const source = findDockedTab(patientIds[desiredIndex]);
    const targetId = currentIds[desiredIndex];
    const target = targetId ? findDockedTab(targetId) : null;
    if (source && target) await dragTab(source, target);
  }
}

function closeUnexpectedPatients(allowed: Set<string>) {
  for (const id of allOpenPatientIds()) {
    if (allowed.has(id)) continue;
    const pane = findDetachedPane(id);
    if (pane) {
      pane.querySelector<HTMLButtonElement>(".window-close-button, .pane-close-button")?.click();
      continue;
    }
    const tab = findDockedTab(id);
    tab?.querySelector<HTMLButtonElement>("button[aria-label^='Close']")?.click();
  }
}

function clickSection(container: ParentNode, section: WorkspaceSection) {
  const button = Array.from(container.querySelectorAll<HTMLButtonElement>(".section-tabs button, .compact-section-tabs button"))
    .find((candidate) => candidate.textContent?.trim() === section);
  button?.click();
}

function sidebarToolId(item: Element) {
  const title = item.getAttribute("title") || "";
  const match = title.match(/^Open ([^.]+)\./);
  return match?.[1] ? SIDEBAR_LABEL_TO_ID[match[1]] : undefined;
}

async function restoreSidebar(desiredIds: string[]) {
  if (!desiredIds.length) return;
  const current = new Set(sidebarToolIds());
  const desired = new Set(desiredIds);
  const launcher = document.querySelector<HTMLButtonElement>(".app-launcher-button");
  if (!launcher) return;

  if ([...current].some((id) => !desired.has(id)) || [...desired].some((id) => !current.has(id))) {
    launcher.click();
    const panel = await waitUntil(() => document.querySelector<HTMLElement>(".app-launcher-panel"));
    if (panel) {
      for (const [label, id] of Object.entries(SIDEBAR_LABEL_TO_ID)) {
        const button = Array.from(panel.querySelectorAll<HTMLButtonElement>(".launcher-tool"))
          .find((candidate) => candidate.textContent?.includes(label));
        if (!button) continue;
        const selected = button.getAttribute("aria-pressed") === "true";
        if (selected !== desired.has(id)) {
          button.click();
          await settle(1);
        }
      }
    }
    launcher.click();
    await settle(2);
  }

  for (let index = 0; index < desiredIds.length; index += 1) {
    const items = Array.from(document.querySelectorAll<HTMLElement>(".dynamic-left-rail .rail-item"));
    const ids = items.map(sidebarToolId).filter((id): id is string => Boolean(id));
    if (ids[index] === desiredIds[index]) continue;
    const source = items.find((item) => sidebarToolId(item) === desiredIds[index]);
    const target = items[index];
    if (source && target) await dragTab(source, target);
  }
}

function applyWindowGeometry(patientId: string, state: WorkspaceWindowState) {
  const pane = findDetachedPane(patientId);
  const bounds = workspaceRect();
  if (!pane || !bounds) return;

  const width = Math.min(bounds.width, Math.max(320, bounds.width * state.widthRatio));
  const height = Math.min(bounds.height, Math.max(240, bounds.height * state.heightRatio));
  const maxLeft = bounds.right - width;
  const maxTop = bounds.bottom - height;
  const left = Math.min(maxLeft, Math.max(bounds.left, bounds.left + bounds.width * state.leftRatio));
  const top = Math.min(maxTop, Math.max(bounds.top, bounds.top + bounds.height * state.topRatio));

  pane.style.left = `${left}px`;
  pane.style.top = `${top}px`;
  pane.style.width = `${width}px`;
  pane.style.height = `${height}px`;
  if (state.snapTarget && state.snapTarget !== "full") pane.dataset.snapTarget = state.snapTarget;
  else delete pane.dataset.snapTarget;
}

async function restoreWindowState(patientId: string, state: WorkspaceWindowState) {
  const pane = await waitUntil(() => {
    const candidate = findDetachedPane(patientId);
    return candidate?.classList.contains("floating-patient-window") ? candidate : null;
  });
  if (!pane) return;

  if (pane.dataset.minimized === "true") {
    pane.querySelector<HTMLButtonElement>(".window-minimize-button")?.click();
    await settle(1);
  }
  if (pane.dataset.maximized === "true") {
    pane.querySelector<HTMLButtonElement>(".window-maximize-button")?.click();
    await settle(1);
  }

  applyWindowGeometry(patientId, state);
  if (state.maximized || state.snapTarget === "full") {
    pane.querySelector<HTMLButtonElement>(".window-maximize-button")?.click();
    await settle(1);
  }
  if (state.minimized) {
    pane.querySelector<HTMLButtonElement>(".window-minimize-button")?.click();
  }
}

function currentCompanionButton(panel: Exclude<WorkspaceCompanionPanel, null>) {
  const label = Object.entries(COMPANION_LABEL_TO_ID).find(([, id]) => id === panel)?.[0];
  if (!label) return null;
  return Array.from(document.querySelectorAll<HTMLButtonElement>(".companion-rail-btn"))
    .find((button) => button.getAttribute("aria-label") === label) ?? null;
}

function restoreCompanionPanel(desired: WorkspaceCompanionPanel) {
  const current = companionPanel();
  if (current === desired) return;
  if (current) currentCompanionButton(current)?.click();
  if (desired) {
    const button = currentCompanionButton(desired);
    if (button) button.click();
    else if (desired === "ai") document.querySelector<HTMLButtonElement>(".ai-toggle")?.click();
  }
}

async function restoreWorkspace(state: ProviderWorkspaceState) {
  const knownIds = new Set(patients.map((patient) => patient.id));
  const docked = state.dockedPatientIds.filter((id) => knownIds.has(id));
  const detached = state.detachedPatientIds.filter((id) => knownIds.has(id) && !docked.includes(id));
  const desired = [...docked, ...detached];
  if (!desired.length) return;

  for (const id of desired) await openPatient(id);
  closeUnexpectedPatients(new Set(desired));
  await settle(2);

  const safeDocked = docked.length ? docked : desired.slice(0, 1);
  const safeDetached = detached.filter((id) => !safeDocked.includes(id));
  await reorderDockedPatients(safeDocked);
  for (const id of safeDetached) await detachPatient(id);
  await settle(3);

  for (const id of safeDocked) {
    findDockedTab(id)?.click();
    await settle(1);
    const primary = document.querySelector<HTMLElement>(".primary-workspace-pane");
    if (primary) clickSection(primary, state.patientSections?.[id] ??
      (id === state.activePatientId ? state.activeSection : "Overview"));
    await settle(1);
  }

  for (const id of safeDetached) {
    const pane = findDetachedPane(id);
    if (pane) clickSection(pane, state.patientSections?.[id] ?? state.detachedSections[id] ?? "Overview");
  }

  for (const id of safeDetached) {
    const windowState = state.windowStates[id];
    if (windowState) await restoreWindowState(id, windowState);
  }

  const activeId = state.activePatientId && safeDocked.includes(state.activePatientId)
    ? state.activePatientId
    : safeDocked[0];
  if (activeId) {
    findDockedTab(activeId)?.click();
    await settle(1);
    const primary = document.querySelector<HTMLElement>(".primary-workspace-pane");
    if (primary) clickSection(primary, state.patientSections?.[activeId] ?? state.activeSection);
  }

  await restoreSidebar(state.sidebarToolIds);
  restoreCompanionPanel(state.activeCompanionPanel);

  await restoreActiveView(state);
}

/**
 * Puts the saved view back. Restoring docked charts leaves a patient view in front,
 * so this is the final step — and the recovery step when an earlier part of the
 * restore fails, because landing on the wrong chart is the outcome worth avoiding.
 *
 * The control is waited for rather than queried once: a click dispatched before the
 * shell finished mounting is silently dropped by optional chaining, which left the
 * clinician on a chart they had navigated away from with no error anywhere.
 */
async function restoreActiveView(state: ProviderWorkspaceState) {
  if (state.activeView === "today") {
    (await waitUntil(() => document.querySelector<HTMLButtonElement>(".home-tab")))?.click();
    // The click only schedules a React update. Waiting for the view to actually
    // render keeps `data-workspace-restored` meaning "the restored workspace is on
    // screen" rather than "the restore calls have been dispatched" — otherwise the
    // autosave scheduled right after can capture a half-restored workspace.
    if (!(await waitUntil(() => document.querySelector(".today-dashboard"), VIEW_RESTORE_WAIT_MS))) {
      (await waitUntil(() => document.querySelector<HTMLButtonElement>(".home-tab")))?.click();
      await waitUntil(() => document.querySelector(".today-dashboard"), VIEW_RESTORE_WAIT_MS);
    }
  } else {
    const activeId = state.activePatientId;
    if (activeId) {
      (await waitUntil(() => findDockedTab(activeId)))?.click();
      await waitUntil(() => document.querySelector(".primary-workspace-pane"), VIEW_RESTORE_WAIT_MS);
    }
  }
  await settle(1);
}

function fingerprint(state: ProviderWorkspaceState) {
  return JSON.stringify({ ...state, savedAt: "" });
}

async function readRemoteWorkspaceState() {
  const response = await fetch("/api/workspace-state", { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok || payload.success === false) throw new Error(payload.error || "Unable to load workspace state");
  return sanitizeWorkspaceState(payload.state);
}

async function saveRemoteWorkspaceState(state: ProviderWorkspaceState) {
  const response = await fetch("/api/workspace-state", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state }),
  });
  const payload = await response.json();
  if (!response.ok || payload.success === false) throw new Error(payload.error || "Unable to save workspace state");
}

export default function WorkspaceStateManager() {
  useEffect(() => {
    let disposed = false;
    let restoring = true;
    let saveTimer: number | null = null;
    let lastFingerprint = "";
    const lastWindowStates = new Map<string, WorkspaceWindowState>();

    function scheduleSave() {
      if (disposed || restoring) return;
      if (saveTimer !== null) window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(async () => {
        saveTimer = null;
        const state = currentWorkspaceState(lastWindowStates);
        if (!state) return;
        const nextFingerprint = fingerprint(state);
        if (nextFingerprint === lastFingerprint) return;
        try {
          await saveRemoteWorkspaceState(state);
          lastFingerprint = nextFingerprint;
        } catch {
          // Workspace persistence should never block clinical work.
        }
      }, SAVE_DELAY_MS);
    }

    async function hydrate() {
      const getAppRoot = () => document.querySelector<HTMLElement>(".authenticated-app") || document.body;
      const initialRoot = getAppRoot();
      initialRoot.dataset.workspaceRestoring = "true";
      initialRoot.dataset.workspaceRestored = "false";
      try {
        await waitUntil(() => document.querySelector<HTMLElement>(".app-shell"));
        const state = await readRemoteWorkspaceState();
        if (state && !disposed) {
          for (const [id, windowState] of Object.entries(state.windowStates)) {
            lastWindowStates.set(id, windowState);
          }
          try {
            await restoreWorkspace(state);
          } catch (error) {
            // Restoring charts, the sidebar or a companion panel can fail without
            // the saved view being wrong. Swallowing the whole restore here used to
            // strand the clinician on whichever chart was mid-restore, with
            // restoration reported complete and no error anywhere. Put the saved
            // view back regardless, and say what broke.
            console.error("Workspace restoration failed partway; restoring the saved view.", error);
            await restoreActiveView(state).catch(() => {});
          }
          lastFingerprint = fingerprint(state);
        }
      } catch (error) {
        // No provider snapshot to restore, or it could not be read.
        console.warn("Starting with the default workspace.", error);
      } finally {
        restoring = false;
        const finalRoot = getAppRoot();
        finalRoot.dataset.workspaceRestoring = "false";
        finalRoot.dataset.workspaceRestored = "true";
        if (!disposed) window.setTimeout(scheduleSave, 250);
      }
    }

    const observer = new MutationObserver(scheduleSave);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "style", "data-minimized", "data-maximized", "data-snap-target", "aria-pressed"],
    });

    function handlePageHide() {
      if (restoring) return;
      const state = currentWorkspaceState(lastWindowStates);
      if (!state || fingerprint(state) === lastFingerprint) return;
      try {
        navigator.sendBeacon(
          "/api/workspace-state",
          new Blob([JSON.stringify({ state })], { type: "application/json" }),
        );
      } catch {
        // Best-effort final save only.
      }
    }

    window.addEventListener("resize", scheduleSave);
    window.addEventListener("pagehide", handlePageHide);
    hydrate();

    return () => {
      disposed = true;
      observer.disconnect();
      window.removeEventListener("resize", scheduleSave);
      window.removeEventListener("pagehide", handlePageHide);
      if (saveTimer !== null) window.clearTimeout(saveTimer);
    };
  }, []);

  return null;
}
