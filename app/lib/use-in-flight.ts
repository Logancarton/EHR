"use client";

import { useCallback, useRef, useState } from "react";

/**
 * One submission per key while it is in flight (CB-6e).
 *
 * A companion composer submits on a click and on Enter / Ctrl+Enter. Until the
 * server answers, the draft is still in the box, so a second press sends it again:
 * a duplicate task, a duplicate note, or the same message delivered to a patient
 * twice. The key is the draft's scope plus its text, so the same draft cannot be
 * sent twice, while a different draft (another patient's, or a task added from a
 * message) is not held up behind it.
 *
 * The ref answers synchronously, so two presses in one tick are still one send;
 * the state only drives what the control shows.
 */
export function inFlightKey(scope: string, text: string): string {
  return `${scope}\u0000${text.trim()}`;
}

export function useInFlight() {
  const keysRef = useRef<Set<string>>(new Set());
  const [keys, setKeys] = useState<ReadonlySet<string>>(() => new Set());

  /** Claims `key`; false means it is already in flight and the caller must not send. */
  const begin = useCallback((key: string) => {
    if (keysRef.current.has(key)) return false;
    keysRef.current.add(key);
    setKeys(new Set(keysRef.current));
    return true;
  }, []);

  const end = useCallback((key: string) => {
    if (!keysRef.current.delete(key)) return;
    setKeys(new Set(keysRef.current));
  }, []);

  const isInFlight = useCallback((key: string) => keys.has(key), [keys]);

  return { begin, end, isInFlight };
}
