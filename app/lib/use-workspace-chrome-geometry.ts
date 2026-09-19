"use client";

import { useEffect, type RefObject } from "react";

/**
 * Where the workspace chrome ends: the bottom edge of the tab strip.
 *
 * Published as `--workspace-chrome-h` so full-area overlays (such as Calendar
 * and global-module workspaces) can begin below the open charts rather than on top of them.
 * It measures the tab strip's own viewport bottom rather than summing heights, avoiding
 * mismatches when shell grid sizing or density settings change.
 */
export function useWorkspaceChromeGeometry(
  topbarRef: RefObject<HTMLElement | null>,
  tabStripRef: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    const topbar = topbarRef.current;
    const strip = tabStripRef.current;
    if (!topbar || !strip) return;

    const publish = () => {
      document.documentElement.style.setProperty(
        "--workspace-chrome-h",
        `${Math.round(strip.getBoundingClientRect().bottom)}px`,
      );
    };
    publish();

    // The strip moves when anything above or around it changes size, and a
    // ResizeObserver reports size rather than position — so the header and the
    // workspace column are watched too, and viewport resizes are caught directly.
    const observer = new ResizeObserver(publish);
    observer.observe(topbar);
    observer.observe(strip);
    const tools = document.querySelector(".tool-navigation");
    if (tools) observer.observe(tools);
    if (strip.parentElement) observer.observe(strip.parentElement);
    window.addEventListener("resize", publish);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", publish);
    };
  }, [topbarRef, tabStripRef]);
}
