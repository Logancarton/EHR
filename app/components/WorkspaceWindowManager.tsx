"use client";

import { useEffect } from "react";

type SnapTarget = "left" | "right" | "top-left" | "top-right" | "bottom-left" | "bottom-right" | "full";

type Geometry = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type StoredGeometry = Geometry & {
  snap?: SnapTarget;
};

const STORAGE_PREFIX = "ehr-window-geometry-v1:";
const SNAP_EDGE = 30;
const SNAP_GAP = 8;
const MIN_SNAP_WIDTH = 320;
const MIN_SNAP_HEIGHT = 240;

function hashIdentity(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function normalizedText(element: Element | null | undefined) {
  return element?.textContent?.replace(/\s+/g, " ").trim() || "";
}

function paneIdentity(pane: HTMLElement) {
  const title = normalizedText(pane.querySelector(".detached-pane-title"));
  return hashIdentity(title || pane.dataset.windowKey || "detached-window");
}

function storageKey(pane: HTMLElement) {
  return `${STORAGE_PREFIX}${paneIdentity(pane)}`;
}

function workspaceBounds() {
  const body = document.querySelector<HTMLElement>(".workspace-body");
  const rect = body?.getBoundingClientRect();

  if (rect && rect.width > 0 && rect.height > 0) {
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    };
  }

  return {
    left: 84,
    top: 108,
    right: window.innerWidth - 12,
    bottom: window.innerHeight - 12,
    width: Math.max(0, window.innerWidth - 96),
    height: Math.max(0, window.innerHeight - 120),
  };
}

function pointInsideRect(x: number, y: number, rect: DOMRect) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function snapTargetAt(x: number, y: number): SnapTarget | null {
  const bounds = workspaceBounds();
  if (x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) return null;

  const nearLeft = x <= bounds.left + SNAP_EDGE;
  const nearRight = x >= bounds.right - SNAP_EDGE;
  const nearTop = y <= bounds.top + SNAP_EDGE;
  const nearBottom = y >= bounds.bottom - SNAP_EDGE;

  if (nearTop && nearLeft) return "top-left";
  if (nearTop && nearRight) return "top-right";
  if (nearBottom && nearLeft) return "bottom-left";
  if (nearBottom && nearRight) return "bottom-right";
  if (nearTop) return "full";
  if (nearLeft) return "left";
  if (nearRight) return "right";
  return null;
}

function geometryForSnap(target: SnapTarget): Geometry {
  const bounds = workspaceBounds();
  const left = bounds.left + SNAP_GAP;
  const top = bounds.top + SNAP_GAP;
  const usableWidth = Math.max(MIN_SNAP_WIDTH, bounds.width - SNAP_GAP * 2);
  const usableHeight = Math.max(MIN_SNAP_HEIGHT, bounds.height - SNAP_GAP * 2);
  const halfWidth = Math.max(MIN_SNAP_WIDTH, (usableWidth - SNAP_GAP) / 2);
  const halfHeight = Math.max(MIN_SNAP_HEIGHT, (usableHeight - SNAP_GAP) / 2);

  if (target === "full") {
    return { left, top, width: usableWidth, height: usableHeight };
  }
  if (target === "left") {
    return { left, top, width: halfWidth, height: usableHeight };
  }
  if (target === "right") {
    return { left: bounds.right - SNAP_GAP - halfWidth, top, width: halfWidth, height: usableHeight };
  }
  if (target === "top-left") {
    return { left, top, width: halfWidth, height: halfHeight };
  }
  if (target === "top-right") {
    return { left: bounds.right - SNAP_GAP - halfWidth, top, width: halfWidth, height: halfHeight };
  }
  if (target === "bottom-left") {
    return { left, top: bounds.bottom - SNAP_GAP - halfHeight, width: halfWidth, height: halfHeight };
  }
  return {
    left: bounds.right - SNAP_GAP - halfWidth,
    top: bounds.bottom - SNAP_GAP - halfHeight,
    width: halfWidth,
    height: halfHeight,
  };
}

function setGeometry(element: HTMLElement, geometry: Geometry) {
  element.style.left = `${geometry.left}px`;
  element.style.top = `${geometry.top}px`;
  element.style.width = `${geometry.width}px`;
  element.style.height = `${geometry.height}px`;
}

function clampGeometry(geometry: Geometry): Geometry {
  const bounds = workspaceBounds();
  const maxWidth = Math.max(MIN_SNAP_WIDTH, bounds.width - SNAP_GAP * 2);
  const maxHeight = Math.max(MIN_SNAP_HEIGHT, bounds.height - SNAP_GAP * 2);
  const width = Math.min(Math.max(MIN_SNAP_WIDTH, geometry.width), maxWidth);
  const height = Math.min(Math.max(MIN_SNAP_HEIGHT, geometry.height), maxHeight);
  const minLeft = bounds.left + SNAP_GAP;
  const minTop = bounds.top + SNAP_GAP;
  const maxLeft = Math.max(minLeft, bounds.right - SNAP_GAP - width);
  const maxTop = Math.max(minTop, bounds.bottom - SNAP_GAP - height);

  return {
    left: Math.min(Math.max(geometry.left, minLeft), maxLeft),
    top: Math.min(Math.max(geometry.top, minTop), maxTop),
    width,
    height,
  };
}

function readStoredGeometry(pane: HTMLElement): StoredGeometry | null {
  try {
    const raw = window.sessionStorage.getItem(storageKey(pane));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredGeometry>;
    if (
      typeof parsed.left !== "number" ||
      typeof parsed.top !== "number" ||
      typeof parsed.width !== "number" ||
      typeof parsed.height !== "number"
    ) {
      return null;
    }
    return parsed as StoredGeometry;
  } catch {
    return null;
  }
}

function saveGeometry(pane: HTMLElement) {
  if (!document.body.contains(pane)) return;
  if (pane.dataset.maximized === "true" || pane.dataset.minimized === "true") return;
  if (pane.classList.contains("moving") || pane.classList.contains("resizing")) return;

  const rect = pane.getBoundingClientRect();
  if (rect.width < 10 || rect.height < 10) return;

  const stored: StoredGeometry = {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };

  const snap = pane.dataset.snapTarget as SnapTarget | undefined;
  if (snap) stored.snap = snap;

  try {
    window.sessionStorage.setItem(storageKey(pane), JSON.stringify(stored));
  } catch {
    // Window geometry memory is a progressive enhancement.
  }
}

function ensurePreview() {
  let preview = document.getElementById("ehr-window-snap-preview") as HTMLDivElement | null;
  if (preview) return preview;

  preview = document.createElement("div");
  preview.id = "ehr-window-snap-preview";
  preview.className = "window-snap-preview";
  preview.setAttribute("aria-hidden", "true");
  document.body.appendChild(preview);
  return preview;
}

function showPreview(target: SnapTarget) {
  const preview = ensurePreview();
  setGeometry(preview, geometryForSnap(target));
  preview.dataset.target = target;
  preview.classList.add("visible");
}

function hidePreview() {
  document.getElementById("ehr-window-snap-preview")?.classList.remove("visible");
}

function ensureTray() {
  let tray = document.getElementById("ehr-window-tray") as HTMLDivElement | null;
  if (tray) return tray;

  tray = document.createElement("div");
  tray.id = "ehr-window-tray";
  tray.className = "window-tray";
  tray.setAttribute("role", "region");
  tray.setAttribute("aria-label", "Minimized patient windows");
  document.body.appendChild(tray);
  return tray;
}

function createTrayItem(pane: HTMLElement) {
  const item = document.createElement("div");
  item.className = "window-tray-item";
  item.dataset.windowKey = paneIdentity(pane);

  const restore = document.createElement("button");
  restore.type = "button";
  restore.className = "window-tray-restore";
  restore.title = "Restore patient window";

  const avatar = document.createElement("span");
  avatar.className = "window-tray-avatar";
  avatar.textContent = normalizedText(pane.querySelector(".detached-pane-header .avatar")) || "•";

  const label = document.createElement("span");
  label.className = "window-tray-label";
  label.textContent = normalizedText(pane.querySelector(".detached-pane-title strong")) || "Patient chart";

  restore.append(avatar, label);
  restore.addEventListener("click", () => {
    pane.querySelector<HTMLButtonElement>(".window-minimize-button")?.click();
  });

  const close = document.createElement("button");
  close.type = "button";
  close.className = "window-tray-close";
  close.textContent = "×";
  close.title = "Close patient window";
  close.setAttribute("aria-label", "Close patient window");
  close.addEventListener("click", () => {
    pane.querySelector<HTMLButtonElement>(".window-close-button")?.click();
  });

  item.append(restore, close);
  return item;
}

export default function WorkspaceWindowManager() {
  useEffect(() => {
    const restored = new WeakSet<HTMLElement>();
    let activeSnapPane: HTMLElement | null = null;
    let activeSnapTarget: SnapTarget | null = null;
    let scanFrame: number | null = null;

    function syncTray() {
      const tray = ensureTray();
      const minimized = Array.from(
        document.querySelectorAll<HTMLElement>(".detached-patient-pane[data-minimized='true']"),
      );
      const activeKeys = new Set(minimized.map((pane) => paneIdentity(pane)));

      tray.querySelectorAll<HTMLElement>(".window-tray-item").forEach((item) => {
        if (!item.dataset.windowKey || activeKeys.has(item.dataset.windowKey)) return;
        item.remove();
      });

      minimized.forEach((pane) => {
        pane.setAttribute("aria-hidden", "true");
        const key = paneIdentity(pane);
        if (tray.querySelector(`[data-window-key='${key}']`)) return;
        tray.appendChild(createTrayItem(pane));
      });

      document.querySelectorAll<HTMLElement>(".detached-patient-pane[data-minimized='false']").forEach((pane) => {
        pane.removeAttribute("aria-hidden");
      });

      tray.classList.toggle("visible", minimized.length > 0);
    }

    function restorePane(pane: HTMLElement) {
      if (restored.has(pane) || !pane.classList.contains("floating-patient-window")) return;
      restored.add(pane);

      window.requestAnimationFrame(() => {
        if (!document.body.contains(pane)) return;
        const stored = readStoredGeometry(pane);
        if (!stored) return;

        if (stored.snap) {
          pane.dataset.snapTarget = stored.snap;
          setGeometry(pane, geometryForSnap(stored.snap));
        } else {
          setGeometry(pane, clampGeometry(stored));
        }
      });
    }

    function scan() {
      document.querySelectorAll<HTMLElement>(".detached-patient-pane").forEach(restorePane);
      syncTray();
    }

    function scheduleScan() {
      if (scanFrame !== null) return;
      scanFrame = window.requestAnimationFrame(() => {
        scanFrame = null;
        scan();
      });
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target instanceof Element ? event.target : null;
      const header = target?.closest<HTMLElement>(".detached-pane-header");
      if (!header || target?.closest("button")) return;
      const pane = header.closest<HTMLElement>(".detached-patient-pane");
      if (!pane) return;

      delete pane.dataset.snapTarget;
      activeSnapPane = null;
      activeSnapTarget = null;
      hidePreview();
    }

    function handlePointerMove(event: PointerEvent) {
      const pane = document.querySelector<HTMLElement>(".detached-patient-pane.moving");
      if (!pane) {
        activeSnapPane = null;
        activeSnapTarget = null;
        hidePreview();
        return;
      }

      const tabBar = document.querySelector<HTMLElement>(".browser-tabs");
      if (tabBar && pointInsideRect(event.clientX, event.clientY, tabBar.getBoundingClientRect())) {
        activeSnapPane = null;
        activeSnapTarget = null;
        hidePreview();
        return;
      }

      const target = snapTargetAt(event.clientX, event.clientY);
      activeSnapPane = target ? pane : null;
      activeSnapTarget = target;
      if (target) showPreview(target);
      else hidePreview();
    }

    function handlePointerUp(event: PointerEvent) {
      const pane = activeSnapPane;
      const target = activeSnapTarget;
      activeSnapPane = null;
      activeSnapTarget = null;
      hidePreview();

      const tabBar = document.querySelector<HTMLElement>(".browser-tabs");
      const releasedOnTabs = Boolean(tabBar && pointInsideRect(event.clientX, event.clientY, tabBar.getBoundingClientRect()));

      window.requestAnimationFrame(() => {
        if (pane && target && !releasedOnTabs && document.body.contains(pane)) {
          if (target === "full") {
            delete pane.dataset.snapTarget;
            if (pane.dataset.maximized !== "true") {
              pane.querySelector<HTMLButtonElement>(".window-maximize-button")?.click();
            }
          } else {
            if (pane.dataset.maximized === "true") {
              pane.querySelector<HTMLButtonElement>(".window-maximize-button")?.click();
            }
            pane.dataset.snapTarget = target;
            setGeometry(pane, geometryForSnap(target));
            saveGeometry(pane);
          }
        }

        document.querySelectorAll<HTMLElement>(".detached-patient-pane").forEach(saveGeometry);
        syncTray();
      });
    }

    function handleWindowResize() {
      window.requestAnimationFrame(() => {
        document.querySelectorAll<HTMLElement>(".detached-patient-pane").forEach((pane) => {
          const snap = pane.dataset.snapTarget as SnapTarget | undefined;
          if (snap && pane.dataset.maximized !== "true" && pane.dataset.minimized !== "true") {
            setGeometry(pane, geometryForSnap(snap));
          }
          saveGeometry(pane);
        });
      });
    }

    const observer = new MutationObserver(scheduleScan);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "data-minimized", "data-maximized"],
    });

    document.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("pointermove", handlePointerMove, true);
    window.addEventListener("pointerup", handlePointerUp, true);
    window.addEventListener("resize", handleWindowResize);
    scan();

    return () => {
      observer.disconnect();
      document.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("pointermove", handlePointerMove, true);
      window.removeEventListener("pointerup", handlePointerUp, true);
      window.removeEventListener("resize", handleWindowResize);
      if (scanFrame !== null) window.cancelAnimationFrame(scanFrame);
      hidePreview();
      document.getElementById("ehr-window-snap-preview")?.remove();
      document.getElementById("ehr-window-tray")?.remove();
    };
  }, []);

  return null;
}
