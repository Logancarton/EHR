"use client";

import { useEffect } from "react";

const STORAGE_PREFIX = "ehr-scroll-position-v2:";
const SCROLL_SELECTOR = [
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

function normalizedText(element: Element | null) {
  return element?.textContent?.replace(/\s+/g, " ").trim() || "";
}

function scrollIdentity(element: HTMLElement) {
  if (element.classList.contains("content-area")) {
    const pane = element.closest(".primary-workspace-pane");
    const patient = normalizedText(pane?.querySelector(".patient-header"));
    const section = normalizedText(pane?.querySelector(".section-tabs button.active"));
    return `primary:${hashIdentity(`${patient || "today"}|${section || "dashboard"}`)}`;
  }

  if (element.classList.contains("detached-content")) {
    const pane = element.closest(".detached-patient-pane");
    const patient = normalizedText(pane?.querySelector(".detached-pane-title"));
    const section = normalizedText(pane?.querySelector(".compact-section-tabs button.active"));
    return `detached:${hashIdentity(`${patient}|${section}`)}`;
  }

  if (element.classList.contains("compact-section-tabs")) {
    const pane = element.closest(".detached-patient-pane");
    const patient = normalizedText(pane?.querySelector(".detached-pane-title"));
    return `detached-tabs:${hashIdentity(patient)}`;
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
    const pendingFrames = new WeakMap<HTMLElement, number>();
    let mutationFrame: number | null = null;

    function restoreElement(element: HTMLElement) {
      const key = scrollIdentity(element);
      if (restoredKey.get(element) === key) return;

      restoredKey.set(element, key);
      element.scrollTop = readPosition(key, "top");
      element.scrollLeft = readPosition(key, "left");
    }

    function restoreVisibleRegions() {
      document.querySelectorAll<HTMLElement>(SCROLL_SELECTOR).forEach(restoreElement);
    }

    function handleScroll(event: Event) {
      const element = event.target;
      if (!(element instanceof HTMLElement) || !element.matches(SCROLL_SELECTOR)) return;
      if (pendingFrames.has(element)) return;

      const frame = window.requestAnimationFrame(() => {
        pendingFrames.delete(element);
        const key = scrollIdentity(element);
        restoredKey.set(element, key);
        writePosition(key, "top", element.scrollTop);
        writePosition(key, "left", element.scrollLeft);
      });
      pendingFrames.set(element, frame);
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
      attributeFilter: ["class"],
    });

    return () => {
      document.removeEventListener("scroll", handleScroll, true);
      observer.disconnect();
      if (mutationFrame !== null) window.cancelAnimationFrame(mutationFrame);
    };
  }, []);

  return null;
}
