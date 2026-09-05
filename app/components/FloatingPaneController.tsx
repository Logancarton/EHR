"use client";

import { useEffect } from "react";

const TOPBAR_HEIGHT = 64;
const SIDEBAR_WIDTH = 84;
const VIEWPORT_MARGIN = 12;
const MIN_WIDTH = 360;
const MIN_HEIGHT = 300;
const MINIMIZED_HEIGHT = 58;
const RESIZE_HIT_AREA = 10;

type ResizeDirection = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw" | null;

type Geometry = {
  left: number;
  top: number;
  width: number;
  height: number;
};

function pointInsideRect(x: number, y: number, rect: DOMRect) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function geometryFromPane(pane: HTMLElement): Geometry {
  const rect = pane.getBoundingClientRect();
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

function resizeDirectionAtPoint(x: number, y: number, rect: DOMRect): ResizeDirection {
  const nearLeft = x - rect.left <= RESIZE_HIT_AREA;
  const nearRight = rect.right - x <= RESIZE_HIT_AREA;
  const nearTop = y - rect.top <= RESIZE_HIT_AREA;
  const nearBottom = rect.bottom - y <= RESIZE_HIT_AREA;

  if (nearTop && nearLeft) return "nw";
  if (nearTop && nearRight) return "ne";
  if (nearBottom && nearLeft) return "sw";
  if (nearBottom && nearRight) return "se";
  if (nearTop) return "n";
  if (nearBottom) return "s";
  if (nearLeft) return "w";
  if (nearRight) return "e";
  return null;
}

function cursorForDirection(direction: ResizeDirection) {
  if (direction === "n" || direction === "s") return "ns-resize";
  if (direction === "e" || direction === "w") return "ew-resize";
  if (direction === "ne" || direction === "sw") return "nesw-resize";
  if (direction === "nw" || direction === "se") return "nwse-resize";
  return "";
}

function setGeometry(pane: HTMLElement, geometry: Geometry) {
  pane.style.left = `${geometry.left}px`;
  pane.style.top = `${geometry.top}px`;
  pane.style.width = `${geometry.width}px`;
  pane.style.height = `${geometry.height}px`;
}

function createChromeButton(className: string, label: string, title: string) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.title = title;
  button.setAttribute("aria-label", title);
  button.draggable = false;
  return button;
}

function ensureWindowChrome(pane: HTMLElement) {
  const header = pane.querySelector<HTMLElement>(".detached-pane-header");
  if (!header) return;

  const dragHandle = header.querySelector<HTMLElement>(".pane-drag-handle");
  if (!header.querySelector(".floating-back-button")) {
    const back = createChromeButton("floating-back-button", "←", "Back");
    back.disabled = pane.dataset.canGoBack !== "true";
    header.insertBefore(back, dragHandle ?? header.firstChild);
  }

  const close = header.querySelector<HTMLButtonElement>(".pane-close-button");
  if (close) {
    close.classList.add("window-control", "window-close-button");
    close.title = "Close";
    close.setAttribute("aria-label", close.getAttribute("aria-label") ?? "Close");
  }

  if (!header.querySelector(".window-minimize-button")) {
    const minimize = createChromeButton("window-control window-minimize-button", "−", "Minimize");
    header.insertBefore(minimize, close ?? null);
  }

  if (!header.querySelector(".window-maximize-button")) {
    const maximize = createChromeButton("window-control window-maximize-button", "□", "Maximize");
    header.insertBefore(maximize, close ?? null);
  }

  const maximize = header.querySelector<HTMLButtonElement>(".window-maximize-button");
  if (maximize) {
    const maximized = pane.dataset.maximized === "true";
    maximize.textContent = maximized ? "❐" : "□";
    maximize.title = maximized ? "Restore" : "Maximize";
    maximize.setAttribute("aria-label", maximized ? "Restore" : "Maximize");
  }

  const minimize = header.querySelector<HTMLButtonElement>(".window-minimize-button");
  if (minimize) {
    const minimized = pane.dataset.minimized === "true";
    minimize.textContent = minimized ? "▢" : "−";
    minimize.title = minimized ? "Restore" : "Minimize";
    minimize.setAttribute("aria-label", minimized ? "Restore" : "Minimize");
  }
}

export default function FloatingPaneController() {
  useEffect(() => {
    let topZIndex = 90;
    let activeTabDrag: HTMLElement | null = null;
    let lastTabDragX = 0;
    let lastTabDragY = 0;
    let tabDragRecoveryTimer: number | null = null;
    const initialized = new WeakSet<HTMLElement>();
    const cleanupByPane = new Map<HTMLElement, () => void>();

    function clearTabDragRecoveryTimer() {
      if (tabDragRecoveryTimer === null) return;
      window.clearTimeout(tabDragRecoveryTimer);
      tabDragRecoveryTimer = null;
    }

    function workspaceDropAt(x: number, y: number) {
      const workspace = document.querySelector<HTMLElement>(".workspace-body");
      if (!workspace?.classList.contains("tab-drag-active")) return false;
      if (!pointInsideRect(x, y, workspace.getBoundingClientRect())) return false;

      workspace.dispatchEvent(
        new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
        }),
      );
      return true;
    }

    function forceTabDragCleanup() {
      const tab = activeTabDrag;
      if (!tab) return;
      activeTabDrag = null;
      clearTabDragRecoveryTimer();
      tab.dispatchEvent(new DragEvent("dragend", { bubbles: true, cancelable: true }));
    }

    function handleTabDragStart(event: DragEvent) {
      const target = event.target instanceof Element
        ? event.target.closest<HTMLElement>(".browser-tab[draggable='true']")
        : null;
      if (!target) return;

      clearTabDragRecoveryTimer();
      activeTabDrag = target;
      lastTabDragX = event.clientX;
      lastTabDragY = event.clientY;
    }

    function handleTabDragOver(event: DragEvent) {
      if (!activeTabDrag) return;
      if (event.clientX || event.clientY) {
        lastTabDragX = event.clientX;
        lastTabDragY = event.clientY;
      }
    }

    function handleTabDragEnd(event: DragEvent) {
      if (!activeTabDrag) return;

      const x = event.clientX || lastTabDragX;
      const y = event.clientY || lastTabDragY;
      workspaceDropAt(x, y);
      activeTabDrag = null;
      clearTabDragRecoveryTimer();
    }

    function handleTabPointerRelease(event: PointerEvent) {
      if (!activeTabDrag) return;

      lastTabDragX = event.clientX || lastTabDragX;
      lastTabDragY = event.clientY || lastTabDragY;
      clearTabDragRecoveryTimer();
      tabDragRecoveryTimer = window.setTimeout(() => {
        if (!activeTabDrag) return;
        workspaceDropAt(lastTabDragX, lastTabDragY);
        forceTabDragCleanup();
      }, 120);
    }

    function handleTabDragKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || !activeTabDrag) return;
      forceTabDragCleanup();
    }

    function bringToFront(pane: HTMLElement) {
      topZIndex += 1;
      pane.style.zIndex = String(topZIndex);
    }

    function constrainPane(pane: HTMLElement) {
      if (pane.dataset.maximized === "true") {
        maximizeGeometry(pane);
        return;
      }

      const rect = pane.getBoundingClientRect();
      const maxWidth = Math.max(MIN_WIDTH, window.innerWidth - SIDEBAR_WIDTH - VIEWPORT_MARGIN * 2);
      const maxHeight = Math.max(MIN_HEIGHT, window.innerHeight - TOPBAR_HEIGHT - VIEWPORT_MARGIN * 2);
      const width = Math.min(rect.width, maxWidth);
      const height = pane.dataset.minimized === "true" ? MINIMIZED_HEIGHT : Math.min(rect.height, maxHeight);
      const maxLeft = Math.max(SIDEBAR_WIDTH + VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN);
      const maxTop = Math.max(TOPBAR_HEIGHT + VIEWPORT_MARGIN, window.innerHeight - height - VIEWPORT_MARGIN);
      const left = Math.min(Math.max(rect.left, SIDEBAR_WIDTH + VIEWPORT_MARGIN), maxLeft);
      const top = Math.min(Math.max(rect.top, TOPBAR_HEIGHT + VIEWPORT_MARGIN), maxTop);

      setGeometry(pane, { left, top, width, height });
    }

    function maximizeGeometry(pane: HTMLElement) {
      setGeometry(pane, {
        left: SIDEBAR_WIDTH + VIEWPORT_MARGIN,
        top: TOPBAR_HEIGHT + VIEWPORT_MARGIN,
        width: Math.max(MIN_WIDTH, window.innerWidth - SIDEBAR_WIDTH - VIEWPORT_MARGIN * 2),
        height: Math.max(MIN_HEIGHT, window.innerHeight - TOPBAR_HEIGHT - VIEWPORT_MARGIN * 2),
      });
    }

    function initializePane(pane: HTMLElement, index: number) {
      if (initialized.has(pane)) {
        ensureWindowChrome(pane);
        return;
      }

      initialized.add(pane);
      pane.classList.add("floating-patient-window");
      pane.dataset.maximized = "false";
      pane.dataset.minimized = "false";
      pane.dataset.canGoBack = "false";

      const availableWidth = Math.max(MIN_WIDTH, window.innerWidth - SIDEBAR_WIDTH - VIEWPORT_MARGIN * 2);
      const availableHeight = Math.max(MIN_HEIGHT, window.innerHeight - TOPBAR_HEIGHT - VIEWPORT_MARGIN * 2);
      const width = Math.min(560, availableWidth);
      const height = Math.min(680, availableHeight);
      const stagger = index * 28;
      const left = Math.max(
        SIDEBAR_WIDTH + VIEWPORT_MARGIN,
        Math.min(window.innerWidth - width - 30 - stagger, window.innerWidth * 0.54 + stagger),
      );
      const top = Math.min(TOPBAR_HEIGHT + 42 + stagger, window.innerHeight - height - VIEWPORT_MARGIN);

      setGeometry(pane, {
        left,
        top: Math.max(TOPBAR_HEIGHT + VIEWPORT_MARGIN, top),
        width,
        height,
      });
      bringToFront(pane);
      ensureWindowChrome(pane);

      const header = pane.querySelector<HTMLElement>(".detached-pane-header");
      if (header) header.draggable = false;

      let moving = false;
      let resizing = false;
      let resizeDirection: ResizeDirection = null;
      let startX = 0;
      let startY = 0;
      let startGeometry: Geometry = geometryFromPane(pane);
      let restoreGeometry: Geometry | null = null;
      let minimizeRestoreGeometry: Geometry | null = null;
      let wasMaximizedBeforeMinimize = false;
      let suppressHistoryCapture = false;
      const sectionHistory: string[] = [];

      function updateBackButton() {
        pane.dataset.canGoBack = sectionHistory.length > 0 ? "true" : "false";
        const back = pane.querySelector<HTMLButtonElement>(".floating-back-button");
        if (back) back.disabled = sectionHistory.length === 0;
      }

      function setDockHighlight(active: boolean) {
        document.querySelector<HTMLElement>(".browser-tabs")?.classList.toggle("floating-dock-ready", active);
        pane.classList.toggle("over-dock-target", active);
      }

      function restoreFromMinimize() {
        if (pane.dataset.minimized !== "true") return;
        pane.dataset.minimized = "false";
        pane.classList.remove("minimized");

        if (minimizeRestoreGeometry) setGeometry(pane, minimizeRestoreGeometry);
        if (wasMaximizedBeforeMinimize) {
          pane.dataset.maximized = "true";
          pane.classList.add("maximized");
          maximizeGeometry(pane);
        }

        ensureWindowChrome(pane);
      }

      function toggleMinimize() {
        bringToFront(pane);
        if (pane.dataset.minimized === "true") {
          restoreFromMinimize();
          return;
        }

        minimizeRestoreGeometry = geometryFromPane(pane);
        wasMaximizedBeforeMinimize = pane.dataset.maximized === "true";
        pane.dataset.minimized = "true";
        pane.classList.add("minimized");
        pane.dataset.maximized = "false";
        pane.classList.remove("maximized");
        pane.style.height = `${MINIMIZED_HEIGHT}px`;
        constrainPane(pane);
        ensureWindowChrome(pane);
      }

      function toggleMaximize() {
        bringToFront(pane);
        if (pane.dataset.minimized === "true") restoreFromMinimize();

        if (pane.dataset.maximized === "true") {
          pane.dataset.maximized = "false";
          pane.classList.remove("maximized");
          if (restoreGeometry) setGeometry(pane, restoreGeometry);
          constrainPane(pane);
        } else {
          restoreGeometry = geometryFromPane(pane);
          pane.dataset.maximized = "true";
          pane.classList.add("maximized");
          maximizeGeometry(pane);
        }

        ensureWindowChrome(pane);
      }

      function goBack() {
        const previous = sectionHistory.pop();
        updateBackButton();
        if (!previous) return;

        const target = Array.from(pane.querySelectorAll<HTMLButtonElement>(".compact-section-tabs button")).find(
          (button) => button.textContent?.trim() === previous,
        );
        if (!target) return;

        suppressHistoryCapture = true;
        target.click();
        suppressHistoryCapture = false;
      }

      function handlePaneClick(event: MouseEvent) {
        const target = event.target as HTMLElement;

        if (target.closest(".floating-back-button")) {
          event.preventDefault();
          event.stopPropagation();
          goBack();
          return;
        }

        if (target.closest(".window-minimize-button")) {
          event.preventDefault();
          event.stopPropagation();
          toggleMinimize();
          return;
        }

        if (target.closest(".window-maximize-button")) {
          event.preventDefault();
          event.stopPropagation();
          toggleMaximize();
          return;
        }

        const sectionButton = target.closest<HTMLButtonElement>(".compact-section-tabs button");
        if (!sectionButton || suppressHistoryCapture) return;

        const current = pane.querySelector<HTMLButtonElement>(".compact-section-tabs button.active")?.textContent?.trim();
        const next = sectionButton.textContent?.trim();
        if (current && next && current !== next) {
          sectionHistory.push(current);
          updateBackButton();
        }
      }

      function handlePanePointerDown(event: PointerEvent) {
        bringToFront(pane);
        if (event.button !== 0) return;
        if (pane.dataset.maximized === "true" || pane.dataset.minimized === "true") return;

        const rect = pane.getBoundingClientRect();
        const direction = resizeDirectionAtPoint(event.clientX, event.clientY, rect);
        if (!direction) return;

        event.preventDefault();
        event.stopPropagation();
        resizing = true;
        resizeDirection = direction;
        startX = event.clientX;
        startY = event.clientY;
        startGeometry = geometryFromPane(pane);
        pane.classList.add("resizing");
        pane.style.cursor = cursorForDirection(direction);
      }

      function handlePanePointerMove(event: PointerEvent) {
        if (moving || resizing) return;
        if (pane.dataset.maximized === "true" || pane.dataset.minimized === "true") {
          pane.style.cursor = "";
          return;
        }
        pane.style.cursor = cursorForDirection(resizeDirectionAtPoint(event.clientX, event.clientY, pane.getBoundingClientRect()));
      }

      function handlePanePointerLeave() {
        if (!moving && !resizing) pane.style.cursor = "";
      }

      function handleHeaderPointerDown(event: PointerEvent) {
        if (event.button !== 0) return;
        if ((event.target as HTMLElement).closest("button")) return;
        if (resizing) return;
        if (pane.dataset.maximized === "true") return;

        event.preventDefault();
        bringToFront(pane);
        startGeometry = geometryFromPane(pane);
        moving = true;
        startX = event.clientX;
        startY = event.clientY;
        pane.classList.add("moving");
      }

      function handlePointerMove(event: PointerEvent) {
        if (moving) {
          const width = pane.getBoundingClientRect().width;
          const height = pane.getBoundingClientRect().height;
          const maxLeft = Math.max(SIDEBAR_WIDTH + VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN);
          const maxTop = Math.max(TOPBAR_HEIGHT + VIEWPORT_MARGIN, window.innerHeight - height - VIEWPORT_MARGIN);
          const left = Math.min(
            Math.max(startGeometry.left + event.clientX - startX, SIDEBAR_WIDTH + VIEWPORT_MARGIN),
            maxLeft,
          );
          const top = Math.min(
            Math.max(startGeometry.top + event.clientY - startY, TOPBAR_HEIGHT + VIEWPORT_MARGIN),
            maxTop,
          );

          pane.style.left = `${left}px`;
          pane.style.top = `${top}px`;

          const tabBar = document.querySelector<HTMLElement>(".browser-tabs");
          setDockHighlight(Boolean(tabBar && pointInsideRect(event.clientX, event.clientY, tabBar.getBoundingClientRect())));
        }

        if (resizing && resizeDirection) {
          const dx = event.clientX - startX;
          const dy = event.clientY - startY;
          const minLeft = SIDEBAR_WIDTH + VIEWPORT_MARGIN;
          const minTop = TOPBAR_HEIGHT + VIEWPORT_MARGIN;
          const maxRight = window.innerWidth - VIEWPORT_MARGIN;
          const maxBottom = window.innerHeight - VIEWPORT_MARGIN;
          const startRight = startGeometry.left + startGeometry.width;
          const startBottom = startGeometry.top + startGeometry.height;

          let left = startGeometry.left;
          let top = startGeometry.top;
          let right = startRight;
          let bottom = startBottom;

          if (resizeDirection.includes("w")) {
            left = Math.min(Math.max(startGeometry.left + dx, minLeft), startRight - MIN_WIDTH);
          }
          if (resizeDirection.includes("e")) {
            right = Math.max(Math.min(startRight + dx, maxRight), startGeometry.left + MIN_WIDTH);
          }
          if (resizeDirection.includes("n")) {
            top = Math.min(Math.max(startGeometry.top + dy, minTop), startBottom - MIN_HEIGHT);
          }
          if (resizeDirection.includes("s")) {
            bottom = Math.max(Math.min(startBottom + dy, maxBottom), startGeometry.top + MIN_HEIGHT);
          }

          setGeometry(pane, {
            left,
            top,
            width: right - left,
            height: bottom - top,
          });
        }
      }

      function handlePointerUp(event: PointerEvent) {
        if (moving) {
          const tabBar = document.querySelector<HTMLElement>(".browser-tabs");
          const shouldDock = Boolean(tabBar && pointInsideRect(event.clientX, event.clientY, tabBar.getBoundingClientRect()));
          pane.classList.remove("moving");
          setDockHighlight(false);
          moving = false;

          if (shouldDock) {
            pane.querySelector<HTMLButtonElement>(".dock-button")?.click();
            return;
          }
        }

        if (resizing) {
          pane.classList.remove("resizing");
          pane.style.cursor = "";
          resizing = false;
          resizeDirection = null;
        }
      }

      function handleDoubleClick(event: MouseEvent) {
        if ((event.target as HTMLElement).closest("button")) return;
        toggleMaximize();
      }

      pane.addEventListener("click", handlePaneClick, true);
      pane.addEventListener("pointerdown", handlePanePointerDown, true);
      pane.addEventListener("pointermove", handlePanePointerMove);
      pane.addEventListener("pointerleave", handlePanePointerLeave);
      header?.addEventListener("pointerdown", handleHeaderPointerDown);
      header?.addEventListener("dblclick", handleDoubleClick);
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);

      cleanupByPane.set(pane, () => {
        pane.removeEventListener("click", handlePaneClick, true);
        pane.removeEventListener("pointerdown", handlePanePointerDown, true);
        pane.removeEventListener("pointermove", handlePanePointerMove);
        pane.removeEventListener("pointerleave", handlePanePointerLeave);
        header?.removeEventListener("pointerdown", handleHeaderPointerDown);
        header?.removeEventListener("dblclick", handleDoubleClick);
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
      });
    }

    function scanForPanes() {
      const panes = Array.from(document.querySelectorAll<HTMLElement>(".detached-patient-pane"));
      panes.forEach((pane, index) => {
        initializePane(pane, index);
        ensureWindowChrome(pane);
      });

      cleanupByPane.forEach((cleanup, pane) => {
        if (document.body.contains(pane)) return;
        cleanup();
        cleanupByPane.delete(pane);
      });
    }

    function handleWindowResize() {
      document.querySelectorAll<HTMLElement>(".detached-patient-pane").forEach(constrainPane);
    }

    const observer = new MutationObserver(scanForPanes);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("dragstart", handleTabDragStart, true);
    document.addEventListener("dragover", handleTabDragOver, true);
    window.addEventListener("dragend", handleTabDragEnd, true);
    window.addEventListener("pointerup", handleTabPointerRelease, true);
    window.addEventListener("keydown", handleTabDragKeyDown, true);
    window.addEventListener("resize", handleWindowResize);
    scanForPanes();

    return () => {
      observer.disconnect();
      clearTabDragRecoveryTimer();
      document.removeEventListener("dragstart", handleTabDragStart, true);
      document.removeEventListener("dragover", handleTabDragOver, true);
      window.removeEventListener("dragend", handleTabDragEnd, true);
      window.removeEventListener("pointerup", handleTabPointerRelease, true);
      window.removeEventListener("keydown", handleTabDragKeyDown, true);
      window.removeEventListener("resize", handleWindowResize);
      cleanupByPane.forEach((cleanup) => cleanup());
      cleanupByPane.clear();
    };
  }, []);

  return null;
}
