"use client";

import {
  type HTMLAttributes,
  type UIEvent,
  useCallback,
  useLayoutEffect,
  useRef,
} from "react";

const STORAGE_PREFIX = "ehr-scroll-position-v1:";

function readScrollTop(scrollKey: string) {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.sessionStorage.getItem(`${STORAGE_PREFIX}${scrollKey}`);
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

function writeScrollTop(scrollKey: string, value: number) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(`${STORAGE_PREFIX}${scrollKey}`, String(Math.max(0, Math.round(value))));
  } catch {
    // Scroll memory is a progressive enhancement. Ignore storage failures.
  }
}

type ScrollMemoryRegionProps = HTMLAttributes<HTMLDivElement> & {
  scrollKey: string;
};

export default function ScrollMemoryRegion({
  scrollKey,
  className = "",
  onScroll,
  children,
  ...rest
}: ScrollMemoryRegionProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number | null>(null);

  const persistCurrentPosition = useCallback(() => {
    if (!ref.current) return;
    writeScrollTop(scrollKey, ref.current.scrollTop);
  }, [scrollKey]);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    element.scrollTop = readScrollTop(scrollKey);

    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      writeScrollTop(scrollKey, element.scrollTop);
    };
  }, [scrollKey]);

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    onScroll?.(event);

    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      persistCurrentPosition();
    });
  }

  return (
    <div
      {...rest}
      ref={ref}
      className={`ehr-scroll-region ${className}`.trim()}
      data-scroll-key={scrollKey}
      onScroll={handleScroll}
    >
      {children}
    </div>
  );
}
