import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  sanitizeWorkspaceState,
  type WorkspacePatientScrollPositions,
} from "../app/lib/workspace-state";
import {
  WORKSPACE_SCROLL_STATE_HYDRATED_EVENT,
  captureWorkspaceScrollPositions,
  hydrateWorkspaceScrollPositions,
} from "../app/lib/workspace-scroll-state";

test("durable patient scroll positions sanitize, round-trip, and discard closed or unsupported sections", () => {
  const state = sanitizeWorkspaceState({
    dockedPatientIds: ["a", "b"],
    detachedPatientIds: ["c"],
    activePatientId: "a",
    activeSection: "Documents",
    patientScrollPositions: {
      a: {
        Documents: { top: 412.6, left: -25 },
        Encounter: { top: 999, left: 5 },
        Bogus: { top: 200, left: 0 },
      },
      b: {
        Labs: { top: Number.NaN, left: 18.2 },
      },
      c: {
        History: { top: 99_999_999, left: 33 },
      },
      closed: {
        Meds: { top: 720, left: 0 },
      },
    },
  });

  assert.ok(state);
  assert.deepEqual(state.patientScrollPositions, {
    a: { Documents: { top: 413, left: 0 } },
    b: { Labs: { top: 0, left: 18 } },
    c: { History: { top: 10_000_000, left: 33 } },
  });
  assert.equal(state.patientScrollPositions?.a?.Encounter, undefined);
  assert.equal(state.patientScrollPositions?.closed, undefined);
  assert.deepEqual(sanitizeWorkspaceState(JSON.parse(JSON.stringify(state))), state);
});

test("durable snapshot coordinates hydrate the existing session scroll memory and can be recaptured", () => {
  const values = new Map<string, string>();
  const events: string[] = [];
  const fakeWindow = {
    sessionStorage: {
      getItem(key: string) {
        return values.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        values.set(key, value);
      },
    },
    dispatchEvent(event: Event) {
      events.push(event.type);
      return true;
    },
  } as unknown as Window;

  const globalWithWindow = globalThis as unknown as { window?: Window };
  const hadWindow = Object.prototype.hasOwnProperty.call(globalThis, "window");
  const originalWindow = globalWithWindow.window;
  Object.defineProperty(globalThis, "window", { configurable: true, value: fakeWindow });

  try {
    const positions: WorkspacePatientScrollPositions = {
      a: {
        Documents: { top: 640, left: 12 },
        History: { top: 280, left: 0 },
        Encounter: { top: 900, left: 0 },
      },
    };

    hydrateWorkspaceScrollPositions(positions);
    assert.deepEqual(captureWorkspaceScrollPositions(["a", "closed"]), {
      a: {
        Documents: { top: 640, left: 12 },
        History: { top: 280, left: 0 },
      },
    });
    assert.deepEqual(events, [WORKSPACE_SCROLL_STATE_HYDRATED_EVENT]);
  } finally {
    if (hadWindow) Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
    else delete globalWithWindow.window;
  }
});

test("scroll persistence stays on the authenticated workspace-state boundary", () => {
  const route = readFileSync("app/api/workspace-state/route.ts", "utf8");
  const manager = readFileSync("app/components/ScrollExperienceManager.tsx", "utf8");

  assert.match(route, /export async function PATCH\(req: Request\)/);
  assert.match(route, /const actor = getProviderContext\(req\)/);
  assert.match(route, /!hasScrollPositions && currentState\?\.patientScrollPositions/);
  assert.match(manager, /method: "PATCH"/);
  assert.match(manager, /fetch\("\/api\/workspace-state", \{ cache: "no-store" \}\)/);
  assert.match(manager, /DURABLE_WORKSPACE_SCROLL_SECTIONS/);
  assert.doesNotMatch(manager, /\.encounter-mode\)"\) return patientId/);
});
