"use client";

import { useEffect, useRef, type RefObject } from "react";
import { markEscapeHandled } from "./use-dismissible";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keyboard behaviour for a modal dialog: focus moves into it when it opens, Tab
 * stays inside it, Escape closes it, and focus returns to whatever opened it.
 *
 * The signing, order-cart and audit dialogs were plain boxes over the page: a
 * keyboard or screen-reader user could Tab straight past "Sign Legal Record" into
 * the note underneath, and Escape did nothing. Pair this with `role="dialog"` and
 * `aria-modal="true"` on the element `dialogRef` points at. That role is also what
 * tells the shared Escape stack (`use-dismissible`) that a press inside the dialog
 * is the dialog's, so the surface beneath it does not close on the same keystroke.
 *
 * `canClose` lets a dialog refuse Escape while it is mid-action (signing, say), in
 * the same way it disables its own × button.
 */
export function useModalDialog({
  open,
  onClose,
  dialogRef,
  canClose = true,
}: {
  open: boolean;
  onClose: () => void;
  dialogRef: RefObject<HTMLElement | null>;
  canClose?: boolean;
}): void {
  const latest = useRef({ onClose, canClose });
  useEffect(() => {
    latest.current = { onClose, canClose };
  });

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    if (dialog && !dialog.contains(document.activeElement)) {
      if (!dialog.hasAttribute("tabindex")) dialog.setAttribute("tabindex", "-1");
      dialog.focus();
    }

    function handleKeyDown(event: KeyboardEvent) {
      const root = dialogRef.current;
      if (!root) return;
      if (event.key === "Escape") {
        markEscapeHandled(event);
        if (latest.current.canClose) {
          event.preventDefault();
          latest.current.onClose();
        }
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (element) => element.offsetParent !== null || element === document.activeElement,
      );
      if (focusable.length === 0) {
        event.preventDefault();
        root.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === root || !root.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !root.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (opener?.isConnected) opener.focus();
    };
  }, [open, dialogRef]);
}
