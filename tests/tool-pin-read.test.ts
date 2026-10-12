import assert from "node:assert/strict";
import test from "node:test";
import { cacheToolPins, DEFAULT_PINS, fetchToolPins, readToolPins } from "../app/lib/workspace-tools";
import { setActiveCacheUserId } from "../app/lib/local-cache-scope";

test("an invalidated startup pin read cannot overwrite the newer local cache", async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalFetch = globalThis.fetch;
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  } });
  setActiveCacheUserId("synthetic-pin-test");
  try {
    let finish!: (value: unknown) => void;
    const body = new Promise((resolve) => { finish = resolve; });
    globalThis.fetch = async (_input, options) => {
      assert.ok(options?.signal);
      return { ok: true, json: () => body } as Response;
    };
    const controller = new AbortController();
    const pending = fetchToolPins(controller.signal);
    const newer = { left: [], right: [...DEFAULT_PINS.right, "calc"] };
    cacheToolPins(newer);
    controller.abort();
    // Simulate a response already received whose body finishes after cancellation.
    finish({ preferences: { rails: DEFAULT_PINS } });
    await pending;
    assert.deepEqual(readToolPins(), newer);
  } finally {
    globalThis.fetch = originalFetch;
    setActiveCacheUserId(null);
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
