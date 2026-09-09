"use client";

import { useEffect } from "react";

const STORAGE_PREFIX = "ehr-scroll-position-v3:";
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
    return JSON.stringify(element.classList.contains("compact-section-tabs")
      ? ["patient-tabs", patientId]
      : ["patient-content", patientId, section]);
  }

  if (element.classList.contains("scratchpad-container")) return "companion:scratchpad";
  if (element.classList.contains("tasks-container")) return "companion:tasks";
  if (element.classList.contains("topbar-apps-drawer")) return "launcher:apps";

  return `generic:${hashIdentity(element.className)}`;
}

function readPosition(key: string, axis: "top" | "left") {
  try {
    const value = Number(window.sessionStorage.getItem(`${STORAGE_PREFIX}${key}:${axis}`));
    return Number.isFinite(value) && value >= 0 ? value : 0;
  } catch {
    return 0;
  }
}

function writePosition(key: string, axis: "top" | "left", value: number) {
  try {
    window.sessionStorage.setItem(`${STORAGE_PREFIX}${key}:${axis}`, String(Math.max(0, Math.round(value))));
  } catch {
    // Scroll memory is a progressive enhancement.
  }
}

export default function ScrollExperienceManager() {
  useEffect(() => {
    const restoredKey = new WeakMap<HTMLElement, string>();
    let mutationFrame: number | null = null;

    function restoreElement(element: HTMLElement) {
      const key = scrollIdentity(element);
      if (!key || restoredKey.get(element) === key) return;

      restoredKey.set(element, key);
      const maxScrollY = Math.max(0, element.scrollHeight - element.clientHeight);
      const targetTop = Math.min(readPosition(key, "top"), maxScrollY);
      element.scrollTop = targetTop;
      element.scrollLeft = readPosition(key, "left");
    }

    function restoreVisibleRegions() {
      document.querySelectorAll<HTMLElement>(SCROLL_SELECTOR).forEach(restoreElement);
    }

    function handleScroll(event: Event) {
      const element = event.target;
      if (!(element instanceof HTMLElement) || !element.matches(SCROLL_SELECTOR)) return;
      const key = scrollIdentity(element);
      // Capture synchronously: a queued frame may run after React reuses the
      // element for a different patient/section or removes it during docking.
      if (!key || restoredKey.get(element) !== key) return;
      writePosition(key, "top", element.scrollTop);
      writePosition(key, "left", element.scrollLeft);
    }

    const observer = new MutationObserver(() => {
      if (mutationFrame !== null) return;
      mutationFrame = window.requestAnimationFrame(() => {
        mutationFrame = null;
        restoreVisibleRegions();
      });
    });

    restoreVisibleRegions();
    document.addEventListener("scroll", handleScroll, true);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "data-scroll-patient-id", "data-scroll-section"],
    });

    return () => {
      document.removeEventListener("scroll", handleScroll, true);
      observer.disconnect();
      if (mutationFrame !== null) window.cancelAnimationFrame(mutationFrame);
    };
  }, []);

  return null;
}
