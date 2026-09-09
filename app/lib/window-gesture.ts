export type WindowGestureKind = "move" | "resize";

export type WindowGesture = {
  kind: WindowGestureKind;
  pointerId: number;
  token: number;
};

export type WindowGestureEventDetail = WindowGesture;

export const WINDOW_GESTURE_START_EVENT = "ehr:floating-window-gesture-start";
export const WINDOW_GESTURE_CANCEL_EVENT = "ehr:floating-window-gesture-cancel";

export function createWindowGestureOwnership() {
  let nextToken = 0;
  let active: WindowGesture | null = null;

  return {
    begin(kind: WindowGestureKind, pointerId: number) {
      if (active || !Number.isFinite(pointerId)) return null;
      active = { kind, pointerId, token: ++nextToken };
      return active;
    },
    current() {
      return active;
    },
    owns(pointerId: number, kind?: WindowGestureKind) {
      return Boolean(active && active.pointerId === pointerId && (!kind || active.kind === kind));
    },
    complete(pointerId: number) {
      if (!active || active.pointerId !== pointerId) return null;
      const completed = active;
      active = null;
      return completed;
    },
    cancel(pointerId?: number) {
      if (!active || (pointerId !== undefined && active.pointerId !== pointerId)) return null;
      const canceled = active;
      active = null;
      return canceled;
    },
  };
}

export function createDeferredGestureGuard() {
  let generation = 0;

  return {
    issue() {
      generation += 1;
      return generation;
    },
    invalidate() {
      generation += 1;
    },
    isCurrent(token: number) {
      return token === generation;
    },
  };
}
