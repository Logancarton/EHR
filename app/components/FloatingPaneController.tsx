"use client";

import { useEffect } from "react";

const TOPBAR_HEIGHT = 64;
const SIDEBAR_WIDTH = 84;
const VIEWPORT_MARGIN = 12;
const MIN_WIDTH = 360;
const MIN_HEIGHT = 300;
const RESIZE_HIT_AREA = 18;

function pointInsideRect(x: number, y: number, rect: DOMRect) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

export default function FloatingPaneController() {
  useEffect(() => {
    let topZIndex = 90;
    const initialized = new WeakSet<HTMLElement>();
    const cleanupByPane = new Map<HTMLElement, () => void>();

    function bringToFront(pane: HTMLElement) {
      topZIndex += 1;
      pane.style.zIndex = String(topZIndex);
    }

    function constrainPane(pane: HTMLElement) {
      const rect = pane.getBoundingClientRect();
      const maxWidth = Math.max(MIN_WIDTH, window.innerWidth - SIDEBAR_WIDTH - VIEWPORT_MARGIN * 2);
      const maxHeight = Math.max(MIN_HEIGHT, window.innerHeight - TOPBAR_HEIGHT - VIEWPORT_MARGIN * 2);
      const width = Math.min(rect.width, maxWidth);
      const height = Math.min(rect.height, maxHeight);
      const maxLeft = Math.max(SIDEBAR_WIDTH + VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN);
      const maxTop = Math.max(TOPBAR_HEIGHT + VIEWPORT_MARGIN, window.innerHeight - height - VIEWPORT_MARGIN);
      const left = Math.min(Math.max(rect.left, SIDEBAR_WIDTH + VIEWPORT_MARGIN), maxLeft);
      const top = Math.min(Math.max(rect.top, TOPBAR_HEIGHT + VIEWPORT_MARGIN), maxTop);

      pane.style.width = `${width}px`;
      pane.style.height = `${height}px`;
      pane.style.left = `${left}px`;
      pane.style.top = `${top}px`;
    }

    function initializePane(pane: HTMLElement, index: number) {
      if (initialized.has(pane)) return;
      initialized.add(pane);
      pane.classList.add("floating-patient-window");

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

      pane.style.width = `${width}px`;
      pane.style.height = `${height}px`;
      pane.style.left = `${left}px`;
      pane.style.top = `${Math.max(TOPBAR_HEIGHT + VIEWPORT_MARGIN, top)}px`;
      bringToFront(pane);

      const header = pane.querySelector<HTMLElement>(".detached-pane-header");
      if (header) header.draggable = false;

      let moving = false;
      let resizing = false;
      let startX = 0;
      let startY = 0;
      let startLeft = 0;
      let startTop = 0;
      let startWidth = 0;
      let startHeight = 0;

      function setDockHighlight(active: boolean) {
        document.querySelector<HTMLElement>(".browser-tabs")?.classList.toggle("floating-dock-ready", active);
        pane.classList.toggle("over-dock-target", active);
      }

      function handlePanePointerDown(event: PointerEvent) {
        bringToFront(pane);

        const rect = pane.getBoundingClientRect();
        const inResizeCorner =
          rect.right - event.clientX <= RESIZE_HIT_AREA &&
          rect.bottom - event.clientY <= RESIZE_HIT_AREA;

        if (!inResizeCorner) return;

        event.preventDefault();
        event.stopPropagation();
        resizing = true;
        startX = event.clientX;
        startY = event.clientY;
        startWidth = rect.width;
        startHeight = rect.height;
        pane.classList.add("resizing");
      }

      function handleHeaderPointerDown(event: PointerEvent) {
        if (event.button !== 0) return;
        if ((event.target as HTMLElement).closest("button")) return;

        event.preventDefault();
        bringToFront(pane);
        const rect = pane.getBoundingClientRect();
        moving = true;
        startX = event.clientX;
        startY = event.clientY;
        startLeft = rect.left;
        startTop = rect.top;
        pane.classList.add("moving");
      }

      function handlePointerMove(event: PointerEvent) {
        if (moving) {
          const width = pane.getBoundingClientRect().width;
          const height = pane.getBoundingClientRect().height;
          const maxLeft = Math.max(SIDEBAR_WIDTH + VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN);
          const maxTop = Math.max(TOPBAR_HEIGHT + VIEWPORT_MARGIN, window.innerHeight - height - VIEWPORT_MARGIN);
          const left = Math.min(
            Math.max(startLeft + event.clientX - startX, SIDEBAR_WIDTH + VIEWPORT_MARGIN),
            maxLeft,
          );
          const top = Math.min(
            Math.max(startTop + event.clientY - startY, TOPBAR_HEIGHT + VIEWPORT_MARGIN),
            maxTop,
          );

          pane.style.left = `${left}px`;
          pane.style.top = `${top}px`;

          const tabBar = document.querySelector<HTMLElement>(".browser-tabs");
          setDockHighlight(Boolean(tabBar && pointInsideRect(event.clientX, event.clientY, tabBar.getBoundingClientRect())));
        }

        if (resizing) {
          const rect = pane.getBoundingClientRect();
          const maxWidth = Math.max(MIN_WIDTH, window.innerWidth - rect.left - VIEWPORT_MARGIN);
          const maxHeight = Math.max(MIN_HEIGHT, window.innerHeight - rect.top - VIEWPORT_MARGIN);
          const width = Math.min(Math.max(MIN_WIDTH, startWidth + event.clientX - startX), maxWidth);
          const height = Math.min(Math.max(MIN_HEIGHT, startHeight + event.clientY - startY), maxHeight);
          pane.style.width = `${width}px`;
          pane.style.height = `${height}px`;
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
          resizing = false;
        }
      }

      function handleDoubleClick(event: MouseEvent) {
        if ((event.target as HTMLElement).closest("button")) return;
        pane.querySelector<HTMLButtonElement>(".dock-button")?.click();
      }

      pane.addEventListener("pointerdown", handlePanePointerDown, true);
      header?.addEventListener("pointerdown", handleHeaderPointerDown);
      header?.addEventListener("dblclick", handleDoubleClick);
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);

      cleanupByPane.set(pane, () => {
        pane.removeEventListener("pointerdown", handlePanePointerDown, true);
        header?.removeEventListener("pointerdown", handleHeaderPointerDown);
        header?.removeEventListener("dblclick", handleDoubleClick);
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
      });
    }

    function scanForPanes() {
      const panes = Array.from(document.querySelectorAll<HTMLElement>(".detached-patient-pane"));
      panes.forEach((pane, index) => initializePane(pane, index));

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
    window.addEventListener("resize", handleWindowResize);
    scanForPanes();

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", handleWindowResize);
      cleanupByPane.forEach((cleanup) => cleanup());
      cleanupByPane.clear();
    };
  }, []);

  return null;
}
