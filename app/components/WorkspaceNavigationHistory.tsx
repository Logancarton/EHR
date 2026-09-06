"use client";

import { useEffect, useRef } from "react";
import {
  GLOBAL_WORKSPACE_MODULES,
  activeNavigationLocation,
  navigationLocationKey,
  navigateToLocation,
  type GlobalWorkspaceModule,
  type NavigationLocation,
} from "../lib/workspace-navigation";

const MAX_HISTORY = 80;

function activeModuleFromDom(): GlobalWorkspaceModule | null {
  const value = document.querySelector<HTMLElement>(".global-module-shell")?.dataset.activeModule;
  return value && GLOBAL_WORKSPACE_MODULES.has(value as GlobalWorkspaceModule)
    ? value as GlobalWorkspaceModule
    : null;
}

export default function WorkspaceNavigationHistory() {
  const historyRef = useRef<NavigationLocation[]>([]);
  const indexRef = useRef(-1);
  const suppressRef = useRef(false);
  const captureTimerRef = useRef<number | null>(null);

  useEffect(() => {
    function broadcast() {
      window.dispatchEvent(new CustomEvent("ehr-navigation-history-state", {
        detail: {
          canBack: indexRef.current > 0,
          canForward: indexRef.current >= 0 && indexRef.current < historyRef.current.length - 1,
        },
      }));
    }

    function capture() {
      if (suppressRef.current) return;
      const location = activeNavigationLocation(activeModuleFromDom());
      if (!location) return;
      const key = navigationLocationKey(location);
      const current = historyRef.current[indexRef.current];
      if (current && navigationLocationKey(current) === key) return;

      const next = historyRef.current.slice(0, indexRef.current + 1);
      next.push(location);
      if (next.length > MAX_HISTORY) next.splice(0, next.length - MAX_HISTORY);
      historyRef.current = next;
      indexRef.current = next.length - 1;
      broadcast();
    }

    function scheduleCapture(delay = 80) {
      if (captureTimerRef.current !== null) window.clearTimeout(captureTimerRef.current);
      captureTimerRef.current = window.setTimeout(() => {
        captureTimerRef.current = null;
        capture();
      }, delay);
    }

    async function moveHistory(direction: -1 | 1) {
      const targetIndex = indexRef.current + direction;
      if (targetIndex < 0 || targetIndex >= historyRef.current.length) return;
      const target = historyRef.current[targetIndex];
      suppressRef.current = true;
      try {
        await navigateToLocation(target);
        indexRef.current = targetIndex;
        broadcast();
      } finally {
        window.setTimeout(() => {
          suppressRef.current = false;
        }, 180);
      }
    }

    function handleClick() {
      scheduleCapture(100);
    }

    function handleSwitch() {
      scheduleCapture(130);
    }

    function handleNavigationComplete() {
      scheduleCapture(40);
    }

    function handleBack() {
      void moveHistory(-1);
    }

    function handleForward() {
      void moveHistory(1);
    }

    document.addEventListener("click", handleClick, true);
    window.addEventListener("ehr-switch-view", handleSwitch);
    window.addEventListener("ehr-navigation-complete", handleNavigationComplete);
    window.addEventListener("ehr-nav-back", handleBack);
    window.addEventListener("ehr-nav-forward", handleForward);

    window.setTimeout(() => {
      capture();
      broadcast();
    }, 500);

    return () => {
      document.removeEventListener("click", handleClick, true);
      window.removeEventListener("ehr-switch-view", handleSwitch);
      window.removeEventListener("ehr-navigation-complete", handleNavigationComplete);
      window.removeEventListener("ehr-nav-back", handleBack);
      window.removeEventListener("ehr-nav-forward", handleForward);
      if (captureTimerRef.current !== null) window.clearTimeout(captureTimerRef.current);
    };
  }, []);

  return null;
}
