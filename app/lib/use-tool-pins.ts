"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_PINS,
  TOOL_PINS_CHANGED_EVENT,
  type RailSideKey,
  type ToolPins,
  fetchToolPins,
  persistToolPins,
  readToolPins,
  togglePin,
  writeToolPins,
} from "./workspace-tools";

function samePins(a: ToolPins, b: ToolPins): boolean {
  return (
    a.left.length === b.left.length &&
    a.right.length === b.right.length &&
    a.left.every((id, i) => id === b.left[i]) &&
    a.right.every((id, i) => id === b.right[i])
  );
}

/**
 * Shared access to the pin record.
 *
 * Both rails and both nine-dot menus mount independently, so each one holds its
 * own copy of the pins and they are kept in step by the change event rather
 * than by a parent. Pinning from the right rail therefore updates the left rail
 * immediately, without either component knowing the other exists.
 */
export function useToolPins(): {
  pins: ToolPins;
  toggle: (side: RailSideKey, id: string) => void;
  /** Replaces one side wholesale — used by drag-to-reorder within a rail. */
  setSide: (side: RailSideKey, ids: string[]) => void;
} {
  // Defaults on the server and on first paint: reading localStorage during
  // render would not match the server-rendered markup.
  const [pins, setPins] = useState<ToolPins>(DEFAULT_PINS);
  // Mirrors the state so an update can be computed without a stale closure and
  // without doing the work inside a setState updater — see `commit` below.
  const pinsRef = useRef(pins);

  const adopt = useCallback((next: ToolPins) => {
    pinsRef.current = next;
    setPins(next);
  }, []);

  useEffect(() => {
    // Paint from the local cache first so the rails are never briefly wrong,
    // then reconcile with the server, which is the durable copy.
    const cached = readToolPins();
    adopt(cached);

    void fetchToolPins().then((server) => {
      // A clinician who arranged their rails before they were server-backed has
      // that arrangement only in this browser. If the server is still at the
      // defaults, their local one is the more meaningful of the two — send it up
      // once rather than silently resetting them.
      if (samePins(server, DEFAULT_PINS) && !samePins(cached, DEFAULT_PINS)) {
        adopt(cached);
        void persistToolPins(cached);
        return;
      }
      adopt(server);
    });

    function handleChange(event: Event) {
      const detail = (event as CustomEvent<ToolPins>).detail;
      if (detail) adopt(detail);
    }
    // Another tab editing the same record also counts as a change.
    function handleStorage() {
      adopt(readToolPins());
    }

    window.addEventListener(TOOL_PINS_CHANGED_EVENT, handleChange);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(TOOL_PINS_CHANGED_EVENT, handleChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, [adopt]);

  /**
   * Persisting broadcasts a change event that every other copy of this hook
   * listens for, so it must happen here rather than inside a setState updater:
   * an updater that dispatches synchronously triggers a nested update against
   * the render already in flight, and the two cancel out.
   */
  const commit = useCallback(
    (next: ToolPins) => {
      adopt(next);
      writeToolPins(next);
    },
    [adopt],
  );

  const toggle = useCallback(
    (side: RailSideKey, id: string) => {
      const next = togglePin(pinsRef.current, side, id);
      if (next === pinsRef.current) return;
      commit(next);
    },
    [commit],
  );

  const setSide = useCallback(
    (side: RailSideKey, ids: string[]) => {
      commit({ ...pinsRef.current, [side]: ids });
    },
    [commit],
  );

  return { pins, toggle, setSide };
}
