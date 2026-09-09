"use client";

import { useEffect } from "react";
import {
  DURABLE_WORKSPACE_SCROLL_SECTIONS,
  sanitizeWorkspaceState,
  type WorkspaceSection,
} from "../lib/workspace-state";
import {
  WORKSPACE_SCROLL_STATE_HYDRATED_EVENT,
  captureWorkspaceScrollPositions,
  hydrateWorkspaceScrollPositions,
  patientContentScrollIdentity,
  readScrollPosition,
  writeScrollPosition,
} from "../lib/workspace-scroll-state";

const DURABLE_SAVE_DELAY_MS = 850;
const SCROLL_SELECTOR = [
  ".today-dashboard",
  ".content-area:not(.encounter-mode)",
  ".detached-content:not(.encounter-mode)",
  ".scratchpad-container",
  ".tasks-container",
  ".topbar-apps-drawer",
  ".compact-section-tabs",
].join(",");

function hashIdentity(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function scrollIdentity(element: HTMLElement) {
  if (element.classList.contains("today-dashboard")) return "primary:today";

  if (element.matches(".content-area, .detached-content, .compact-section-tabs")) {
    const pane = element.closest<HTMLElement>("[data-scroll-patient-id]");
    const patientId = pane?.dataset.scrollPatientId;
    const section = pane?.dataset.scrollSection;
    // Identity comes from workspace state, never mutable patient display text.
    if (!patientId || !section) return null;
    return element.classList.contains("compact-section-tabs")
      ? JSON.stringify(["patient-tabs", patientId])
      : patientContentScrollIdentity(patientId, section as WorkspaceSection);
  }

  if (element.classList.contains("scratchpad-container")) return "companion:scratchpad";
  if (element.classList.contains("tasks-container")) return "companion:tasks";
  if (element.classList.contains("topbar-apps-drawer")) return "launcher:apps";

  return `generic:${hashIdentity(element.className)}`;
}

export function boundedScrollOffset(target: number, scrollSize: number, clientSize: number) {
  const maxScroll = Math.max(0, scrollSize - clientSize);
  return Math.min(Math.max(0, target), maxScroll);
}

function durablePatientId(element: HTMLElement) {
  if (!element.matches(".content-area:not(.encounter-mode), .detached-content:not(.encounter-mode)")) return null;
  const pane = element.closest<HTMLElement>("[data-scroll-patient-id]");
  const patientId = pane?.dataset.scrollPatientId;
  const section = pane?.dataset.scrollSection as WorkspaceSection | undefined;
  if (!patientId || !section || !DURABLE_WORKSPACE_SCROLL_SECTIONS.includes(
    section as (typeof DURABLE_WORKSPACE_SCROLL_SECTIONS)[number],
  )) return null;
  return patientId;
}

type PendingRestore = {
  key: string;
  top: number;
  left: number;
};

export default function ScrollExperienceManager() {
  useEffect(() => {
    const restoredKey = new WeakMap<HTMLElement, string>();
    const pendingRestores = new WeakMap<HTMLElement, PendingRestore>();
    const pendingDurablePatientIds = new Set<string>();
    let mutationFrame: number | null = null;
    let durableSaveTimer: number | null = null;
    let disposed = false;
    let hasLocalPatientScroll = false;

    function restoreElement(element: HTMLElement) {
      const key = scrollIdentity(element);
      if (!key) return;

      let pending = pendingRestores.get(element);
      if (restoredKey.get(element) !== key) {
        restoredKey.set(element, key);
        pending = {
          key,
          top: readScrollPosition(key, "top"),
          left: readScrollPosition(key, "left"),
        };
        pendingRestores.set(element, pending);
      } else if (!pending || pending.key !== key) {
        return;
      }

      const targetTop = boundedScrollOffset(pending.top, element.scrollHeight, element.clientHeight);
      const targetLeft = boundedScrollOffset(pending.left, element.scrollWidth, element.clientWidth);
      element.scrollTop = targetTop;
      element.scrollLeft = targetLeft;

      // When async/late content mounts, keep the original saved coordinate alive
      // until the surface becomes large enough to reach it. Otherwise an early
      // clamp would permanently strand the clinician above their prior position.
      if (targetTop === pending.top && targetLeft === pending.left) {
        pendingRestores.delete(element);
      }
    }

    function restoreVisibleRegions() {
      document.querySelectorAll<HTMLElement>(SCROLL_SELECTOR).forEach(restoreElement);
    }

    async function flushDurableScrollState(keepalive = false) {
      if (!pendingDurablePatientIds.size) return;
      const patientIds = [...pendingDurablePatientIds];
      pendingDurablePatientIds.clear();
      const patientScrollPositions = captureWorkspaceScrollPositions(patientIds);
      if (!Object.keys(patientScrollPositions).length) return;

      try {
        const response = await fetch("/api/workspace-state", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ patientScrollPositions }),
          keepalive,
        });
        if (!response.ok && !disposed) patientIds.forEach((patientId) => pendingDurablePatientIds.add(patientId));
      } catch {
        if (!disposed) patientIds.forEach((patientId) => pendingDurablePatientIds.add(patientId));
      }
    }

    function scheduleDurableSave(patientId: string) {
      pendingDurablePatientIds.add(patientId);
      if (durableSaveTimer !== null) window.clearTimeout(durableSaveTimer);
      durableSaveTimer = window.setTimeout(() => {
        durableSaveTimer = null;
        void flushDurableScrollState();
      }, DURABLE_SAVE_DELAY_MS);
    }

    function handleScroll(event: Event) {
      const element = event.target;
      if (!(element instanceof HTMLElement) || !element.matches(SCROLL_SELECTOR)) return;
      const key = scrollIdentity(element);
      // Capture synchronously: a queued frame may run after React reuses the
      // element for a different patient/section or removes it during docking.
      if (!key || restoredKey.get(element) !== key) return;

      const pending = pendingRestores.get(element);
      if (pending?.key === key) {
        const expectedTop = boundedScrollOffset(pending.top, element.scrollHeight, element.clientHeight);
        const expectedLeft = boundedScrollOffset(pending.left, element.scrollWidth, element.clientWidth);
        if (Math.round(element.scrollTop) === Math.round(expectedTop) &&
            Math.round(element.scrollLeft) === Math.round(expectedLeft)) {
          return;
        }
        // A real user movement takes precedence over a still-pending restore.
        pendingRestores.delete(element);
      }

      writeScrollPosition(key, "top", element.scrollTop);
      writeScrollPosition(key, "left", element.scrollLeft);
      const patientId = durablePatientId(element);
      if (patientId) {
        hasLocalPatientScroll = true;
        scheduleDurableSave(patientId);
      }
    }

    function handleDurableScrollHydration() {
      document.querySelectorAll<HTMLElement>(SCROLL_SELECTOR).forEach((element) => {
        restoredKey.delete(element);
        pendingRestores.delete(element);
      });
      restoreVisibleRegions();
    }

    async function hydrateDurableScrollState() {
      try {
        const response = await fetch("/api/workspace-state", { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok || payload.success === false || disposed || hasLocalPatientScroll) return;
        const state = sanitizeWorkspaceState(payload.state);
        if (state && !disposed && !hasLocalPatientScroll) {
          hydrateWorkspaceScrollPositions(state.patientScrollPositions);
        }
      } catch {
        // Durable scroll memory is a progressive enhancement.
      }
    }

    const observer = new MutationObserver(() => {
      if (mutationFrame !== null) return;
      mutationFrame = window.requestAnimationFrame(() => {
        mutationFrame = null;
        restoreVisibleRegions();
      });
    });

    function handlePageHide() {
      if (durableSaveTimer !== null) {
        window.clearTimeout(durableSaveTimer);
        durableSaveTimer = null;
      }
      void flushDurableScrollState(true);
    }

    restoreVisibleRegions();
    document.addEventListener("scroll", handleScroll, true);
    window.addEventListener(WORKSPACE_SCROLL_STATE_HYDRATED_EVENT, handleDurableScrollHydration);
    window.addEventListener("pagehide", handlePageHide);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "data-scroll-patient-id", "data-scroll-section"],
    });
    void hydrateDurableScrollState();

    return () => {
      disposed = true;
      document.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener(WORKSPACE_SCROLL_STATE_HYDRATED_EVENT, handleDurableScrollHydration);
      window.removeEventListener("pagehide", handlePageHide);
      observer.disconnect();
      if (mutationFrame !== null) window.cancelAnimationFrame(mutationFrame);
      if (durableSaveTimer !== null) window.clearTimeout(durableSaveTimer);
    };
  }, []);

  return null;
}
