"use client";

import { useEffect } from "react";

function orderedWorkspaceTabs() {
  return Array.from(
    document.querySelectorAll<HTMLElement>(".browser-tab[data-workspace-order]"),
  ).sort(
    (left, right) =>
      Number(left.dataset.workspaceOrder ?? 0) - Number(right.dataset.workspaceOrder ?? 0),
  );
}

export default function WorkspaceKeyboardShortcuts() {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.isComposing) return;
      const key = event.key.toLowerCase();

      if ((event.ctrlKey || event.metaKey) && !event.altKey && key === "k") {
        const omnibox = document.querySelector<HTMLInputElement>(
          'input[aria-label="Ask AI or search the EHR"]',
        );
        if (!omnibox) return;
        event.preventDefault();
        omnibox.focus();
        omnibox.select();
        return;
      }

      if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && key === "w") {
        const activeTab = document.querySelector<HTMLElement>(".browser-tab.active");
        const close = activeTab?.querySelector<HTMLButtonElement>('button[aria-label^="Close"]');
        if (!close) return;
        event.preventDefault();
        close.click();
        return;
      }

      if (
        event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !event.shiftKey &&
        /^[1-9]$/.test(event.key)
      ) {
        const tabs = orderedWorkspaceTabs();
        if (!tabs.length) return;
        const digit = Number(event.key);
        const target = digit === 9 ? tabs.at(-1) : tabs[digit - 1];
        if (!target) return;
        event.preventDefault();
        target.click();
      }
    }

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  return null;
}
