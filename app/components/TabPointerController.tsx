"use client";

import { useEffect } from "react";

const DRAG_THRESHOLD = 5;

type TabPointerState = {
  tab: HTMLElement;
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  dragging: boolean;
  dataTransfer: DataTransfer | null;
  ghost: HTMLElement | null;
  lastReorderTarget: HTMLElement | null;
};

function pointInsideRect(x: number, y: number, rect: DOMRect) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function dispatchDragEvent(
  target: Element,
  type: "dragstart" | "drop" | "dragend",
  x: number,
  y: number,
  dataTransfer: DataTransfer | null,
) {
  target.dispatchEvent(
    new DragEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      dataTransfer: dataTransfer ?? undefined,
    }),
  );
}

function createGhost(tab: HTMLElement) {
  const rect = tab.getBoundingClientRect();
  const ghost = tab.cloneNode(true) as HTMLElement;
  ghost.removeAttribute("draggable");
  ghost.style.position = "fixed";
  ghost.style.left = `${rect.left}px`;
  ghost.style.top = `${rect.top}px`;
  ghost.style.width = `${rect.width}px`;
  ghost.style.height = `${rect.height}px`;
  ghost.style.zIndex = "10000";
  ghost.style.pointerEvents = "none";
  ghost.style.opacity = "0.88";
  ghost.style.transform = "scale(1.02)";
  ghost.style.boxShadow = "0 12px 30px rgba(25, 35, 54, .22)";
  ghost.style.borderRadius = "9px";
  ghost.style.background = "#fff";
  ghost.style.transition = "none";
  document.body.appendChild(ghost);
  return ghost;
}

export default function TabPointerController() {
  useEffect(() => {
    let state: TabPointerState | null = null;
    let suppressNextTabClick = false;

    function disableNativeTabDragging() {
      document.querySelectorAll<HTMLElement>(".browser-tab").forEach((tab) => {
        tab.draggable = false;
        tab.setAttribute("draggable", "false");
        tab.style.touchAction = "none";
      });
    }

    function cleanup() {
      if (!state) return;
      state.tab.style.opacity = "";
      state.ghost?.remove();
      document.body.classList.remove("pointer-tab-dragging");
      state = null;
    }

    function beginDrag(event: PointerEvent) {
      if (!state || state.dragging) return;
      state.dragging = true;
      suppressNextTabClick = true;
      state.tab.style.opacity = "0.45";
      state.ghost = createGhost(state.tab);
      document.body.classList.add("pointer-tab-dragging");

      try {
        state.dataTransfer = new DataTransfer();
      } catch {
        state.dataTransfer = null;
      }

      dispatchDragEvent(
        state.tab,
        "dragstart",
        event.clientX,
        event.clientY,
        state.dataTransfer,
      );
    }

    function updateGhost(x: number, y: number) {
      if (!state?.ghost) return;
      const rect = state.ghost.getBoundingClientRect();
      state.ghost.style.left = `${x - rect.width / 2}px`;
      state.ghost.style.top = `${y - 18}px`;
    }

    function tabAtPoint(x: number, y: number) {
      const element = document.elementFromPoint(x, y);
      return element instanceof Element ? element.closest<HTMLElement>(".browser-tab") : null;
    }

    function maybeReorder(x: number, y: number) {
      if (!state?.dragging) return;
      const tabBar = document.querySelector<HTMLElement>(".browser-tabs");
      if (!tabBar || !pointInsideRect(x, y, tabBar.getBoundingClientRect())) {
        state.lastReorderTarget = null;
        return;
      }

      const target = tabAtPoint(x, y);
      if (!target || target === state.tab || target === state.lastReorderTarget) return;

      state.lastReorderTarget = target;
      dispatchDragEvent(target, "drop", x, y, state.dataTransfer);
    }

    function handlePointerDown(event: PointerEvent) {
      if (event.button !== 0) return;
      const target = event.target instanceof Element
        ? event.target.closest<HTMLElement>(".browser-tab")
        : null;
      if (!target) return;
      if ((event.target as Element).closest("button")) return;

      target.draggable = false;
      target.setAttribute("draggable", "false");

      state = {
        tab: target,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        dragging: false,
        dataTransfer: null,
        ghost: null,
        lastReorderTarget: null,
      };
    }

    function handlePointerMove(event: PointerEvent) {
      if (!state || event.pointerId !== state.pointerId) return;
      state.lastX = event.clientX;
      state.lastY = event.clientY;

      if (!state.dragging) {
        const distance = Math.hypot(event.clientX - state.startX, event.clientY - state.startY);
        if (distance < DRAG_THRESHOLD) return;
        beginDrag(event);
      }

      event.preventDefault();
      updateGhost(event.clientX, event.clientY);
      maybeReorder(event.clientX, event.clientY);
    }

    function finishPointerDrag(event: PointerEvent) {
      if (!state || event.pointerId !== state.pointerId) return;

      if (!state.dragging) {
        cleanup();
        return;
      }

      const workspace = document.querySelector<HTMLElement>(".workspace-body");
      const tabBar = document.querySelector<HTMLElement>(".browser-tabs");
      const x = event.clientX;
      const y = event.clientY;

      if (workspace && pointInsideRect(x, y, workspace.getBoundingClientRect())) {
        dispatchDragEvent(workspace, "drop", x, y, state.dataTransfer);
      } else if (tabBar && pointInsideRect(x, y, tabBar.getBoundingClientRect())) {
        const target = tabAtPoint(x, y);
        if (target && target !== state.tab) {
          dispatchDragEvent(target, "drop", x, y, state.dataTransfer);
        }
      }

      dispatchDragEvent(state.tab, "dragend", x, y, state.dataTransfer);
      cleanup();
    }

    function handlePointerCancel(event: PointerEvent) {
      if (!state || event.pointerId !== state.pointerId) return;
      if (state.dragging) {
        dispatchDragEvent(state.tab, "dragend", state.lastX, state.lastY, state.dataTransfer);
      }
      cleanup();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || !state) return;
      if (state.dragging) {
        dispatchDragEvent(state.tab, "dragend", state.lastX, state.lastY, state.dataTransfer);
      }
      cleanup();
    }

    function handleClick(event: MouseEvent) {
      if (!suppressNextTabClick) return;
      const target = event.target instanceof Element ? event.target.closest(".browser-tab") : null;
      if (!target) return;
      suppressNextTabClick = false;
      event.preventDefault();
      event.stopImmediatePropagation();
    }

    const observer = new MutationObserver(disableNativeTabDragging);
    observer.observe(document.body, { childList: true, subtree: true });
    disableNativeTabDragging();

    document.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("pointermove", handlePointerMove, { capture: true, passive: false });
    window.addEventListener("pointerup", finishPointerDrag, true);
    window.addEventListener("pointercancel", handlePointerCancel, true);
    window.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("click", handleClick, true);

    return () => {
      observer.disconnect();
      cleanup();
      document.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("pointermove", handlePointerMove, true);
      window.removeEventListener("pointerup", finishPointerDrag, true);
      window.removeEventListener("pointercancel", handlePointerCancel, true);
      window.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("click", handleClick, true);
    };
  }, []);

  return null;
}
