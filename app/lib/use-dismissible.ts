"use client";

import { useEffect, type RefObject } from "react";

/**
 * The ways a layered surface can be closed besides its × button.
 *
 * `PatientInformationDrawer` carries the comment "Escape closes, like every other
 * layered surface in the workspace", which was aspiration rather than description:
 * the drawers and a couple of modals honoured Escape, while the rail's pin menu,
 * the Clinical AI plan card and the whole module shell did not. The plan card had
 * no exit at all except its ×. One hook so the decision is made once and the
 * surfaces cannot drift apart again.
 *
 * Which gestures a surface gets is a property of the surface, not a default:
 *
 * - **Escape** suits anything layered. It is the keyboard's way out and costs
 *   nothing to offer.
 * - **Clicking past it** suits a popover — a menu, a card floating over the work.
 *   It does *not* suit a surface that fills the content area, because "past it"
 *   is then the rail, the header, or the tab strip, and a stray click would close
 *   the thing the clinician is working in. `dismissOnOutsideClick` is therefore
 *   opt-in rather than assumed.
 *
 * Neither gesture is offered for a surface holding typed work. A dialog with a
 * half-written note in it needs a deliberate discard, not a gesture that can be
 * made by accident; those keep their explicit controls and are not wired here.
 */
export type DismissibleOptions = {
  /** Only listens while the surface is on screen. */
  active: boolean;
  onDismiss: () => void;
  /**
   * What counts as "inside" for an outside click. Required when
   * `dismissOnOutsideClick` is set; ignored otherwise.
   */
  surface?: RefObject<HTMLElement | null>;
  /** A popover closes when you click past it; a full workspace surface does not. */
  dismissOnOutsideClick?: boolean;
  /**
   * Whether Escape still dismisses while focus sits in a text field.
   *
   * Default `false`, which protects what someone is typing. The exception is a
   * surface layered *above* the field: the Clinical AI answer opens while the
   * cursor is still in the omnibox that asked the question, so guarding there
   * would mean Escape did nothing at the exact moment a clinician wants the card
   * gone. The topmost layer answers first, and only the surface itself knows
   * whether it is the topmost layer.
   */
  dismissFromTextEntry?: boolean;
};

/**
 * Whether this keystroke belongs to something else.
 *
 * A dialog layered above always answers first. A text field usually does too —
 * Escape there reverts or clears an entry, and stealing it to close the
 * surrounding surface would throw away what the clinician was typing — unless the
 * surface is itself layered above the field, which is what `fromTextEntry` says.
 */
function keystrokeBelongsToSomethingElse(target: EventTarget | null, fromTextEntry: boolean): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest("[role='dialog']")) return true;
  if (fromTextEntry) return false;
  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

export function useDismissible({
  active,
  onDismiss,
  surface,
  dismissOnOutsideClick = false,
  dismissFromTextEntry = false,
}: DismissibleOptions): void {
  useEffect(() => {
    if (!active) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (keystrokeBelongsToSomethingElse(event.target, dismissFromTextEntry)) return;
      onDismiss();
    }

    function handlePointerDown(event: PointerEvent) {
      const root = surface?.current;
      if (!root) return;
      if (root.contains(event.target as Node)) return;
      onDismiss();
    }

    window.addEventListener("keydown", handleKeyDown);
    if (dismissOnOutsideClick) window.addEventListener("pointerdown", handlePointerDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (dismissOnOutsideClick) window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [active, onDismiss, surface, dismissOnOutsideClick, dismissFromTextEntry]);
}
