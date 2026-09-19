import test from "node:test";
import assert from "node:assert/strict";
import { api } from "../app/lib/api-client";
import { ApiError } from "../app/lib/api-error";
import {
  resetAuthenticationFailureReporting,
  subscribeToAuthenticationFailure,
} from "../app/lib/session-expiry";

function installFetch(t: test.TestContext, implementation: typeof fetch) {
  const original = globalThis.fetch;
  globalThis.fetch = implementation;
  t.after(() => {
    globalThis.fetch = original;
    resetAuthenticationFailureReporting();
  });
}

test("a non-JSON 401 preserves status and enters authentication recovery", async (t) => {
  resetAuthenticationFailureReporting();
  let challenges = 0;
  const unsubscribe = subscribeToAuthenticationFailure(() => { challenges += 1; });
  t.after(unsubscribe);
  installFetch(t, (async () => new Response("<html>proxy sign-in</html>", { status: 401 })) as typeof fetch);

  await assert.rejects(
    api.health.check(),
    (error: unknown) =>
      error instanceof ApiError &&
      error.status === 401 &&
      !error.message.includes("proxy sign-in"),
  );
  assert.equal(challenges, 1);
});

test("a non-JSON 403 remains authorization failure and does not challenge the session", async (t) => {
  resetAuthenticationFailureReporting();
  let challenges = 0;
  const unsubscribe = subscribeToAuthenticationFailure(() => { challenges += 1; });
  t.after(unsubscribe);
  installFetch(t, (async () => new Response("forbidden", { status: 403 })) as typeof fetch);

  await assert.rejects(api.health.check(), (error: unknown) => error instanceof ApiError && error.status === 403);
  assert.equal(challenges, 0);
});

test("malformed server errors preserve HTTP status without surfacing raw response content", async (t) => {
  installFetch(t, (async () => new Response("{ definitely-not-json", { status: 500 })) as typeof fetch);

  await assert.rejects(
    api.health.check(),
    (error: unknown) =>
      error instanceof ApiError &&
      error.status === 500 &&
      error.message === "Request failed (500).",
  );
});

test("transport failure is not reclassified as session expiration", async (t) => {
  resetAuthenticationFailureReporting();
  let challenges = 0;
  const unsubscribe = subscribeToAuthenticationFailure(() => { challenges += 1; });
  t.after(unsubscribe);
  installFetch(t, (async () => { throw new TypeError("network unavailable"); }) as typeof fetch);

  await assert.rejects(api.health.check(), TypeError);
  assert.equal(challenges, 0);
});
