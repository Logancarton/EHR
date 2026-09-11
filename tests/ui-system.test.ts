import test from "node:test";
import assert from "node:assert/strict";
import {
  buttonPresentation,
  resolveAsyncView,
  saveStateView,
  savedAtLabel,
  STATUS_TONE_ICON,
  type StatusTone,
} from "../app/lib/ui-system";

/**
 * The shared UI grammar (roadmap phase P1).
 *
 * These are the rules a clinician depends on rather than the pixels: a busy control
 * cannot be fired twice, an unavailable one says why, a failed load is never shown
 * as an empty one, and "saved" is only claimed once the server said so.
 */

test("a busy control keeps its focus but cannot be fired again", () => {
  const busy = buttonPresentation({ variant: "primary", loading: true });

  assert.equal(
    busy.disabled,
    false,
    "a loading button must not be natively disabled, which would eject the keyboard user mid-action",
  );
  assert.equal(busy.ariaDisabled, true, "but it must report itself unavailable to assistive technology");
  assert.equal(busy.ariaBusy, true);
  assert.equal(busy.inert, true, "a second click during the request must be swallowed");
  assert.match(busy.className, /is-loading/);

  const idle = buttonPresentation({ variant: "primary" });
  assert.equal(idle.inert, false);
  assert.equal(idle.ariaBusy, undefined);
  assert.equal(idle.ariaDisabled, undefined);
});

test("an unavailable control is disabled and explains itself", () => {
  const unavailable = buttonPresentation({
    disabled: true,
    disabledReason: "Type a task first.",
  });

  assert.equal(unavailable.disabled, true);
  assert.equal(unavailable.ariaDisabled, true);
  assert.equal(
    unavailable.title,
    "Type a task first.",
    "a disabled control with no explanation is the defect this phase is removing",
  );
  assert.equal(unavailable.inert, true);

  // An explicit title wins: some controls have a fuller explanation than the reason.
  const titled = buttonPresentation({ disabled: true, disabledReason: "short", title: "fuller reason" });
  assert.equal(titled.title, "fuller reason");

  // Loading takes precedence over native disabling, so the control stays reachable.
  const both = buttonPresentation({ disabled: true, disabledReason: "nope", loading: true });
  assert.equal(both.disabled, false);
  assert.equal(both.ariaDisabled, true);
});

test("a pressed control is marked by state, not only by colour", () => {
  const pressed = buttonPresentation({ pressed: true });
  assert.equal(pressed.ariaPressed, true);
  assert.match(pressed.className, /is-pressed/);

  const unpressed = buttonPresentation({ pressed: false });
  assert.equal(unpressed.ariaPressed, false, "a toggle that is off still reports that it is a toggle");

  const notAToggle = buttonPresentation({});
  assert.equal(notAToggle.ariaPressed, undefined, "a plain action is not announced as a toggle");
});

test("a failed load is never presented as an empty one", () => {
  const failed = resolveAsyncView({ loading: false, error: "The queue could not be loaded.", isEmpty: true });
  assert.deepEqual(
    failed,
    { phase: "error", busy: false },
    "an empty result and a failed request mean opposite things in a clinical queue",
  );

  assert.deepEqual(resolveAsyncView({ loading: false, error: null, isEmpty: true }), {
    phase: "empty",
    busy: false,
  });
  assert.deepEqual(resolveAsyncView({ loading: false, isEmpty: false }), { phase: "ready", busy: false });
});

test("a first load shows progress, and a refresh does not blank what is on screen", () => {
  assert.deepEqual(
    resolveAsyncView({ loading: true, isEmpty: true, hasLoadedOnce: false }),
    { phase: "loading", busy: true },
    "the first load has nothing to keep showing",
  );

  assert.deepEqual(
    resolveAsyncView({ loading: true, isEmpty: false, hasLoadedOnce: true }),
    { phase: "ready", busy: true },
    "a refresh keeps the rows the clinician is reading, and marks the region busy",
  );

  assert.deepEqual(
    resolveAsyncView({ loading: true, error: "stale failure", isEmpty: true, hasLoadedOnce: true }),
    { phase: "loading", busy: true },
    "a retry in flight shows progress rather than the error it is already addressing",
  );
});

test("the save indicator only claims a save the server confirmed, and offers a way back", () => {
  const saving = saveStateView({ status: "saving" });
  assert.equal(saving.label, "Saving…");
  assert.equal(saving.canRetry, false);

  const saved = saveStateView({ status: "saved", savedAt: "2026-09-11T14:05:00.000Z" });
  assert.match(saved.label, /^Saved /, "a confirmed save is stamped with when it landed");
  assert.equal(saved.tone, "success");

  const failed = saveStateView({ status: "failed", error: "Revision conflict" });
  assert.equal(failed.label, "Save failed");
  assert.equal(failed.canRetry, true, "a failed save must be recoverable from where it failed");
  assert.equal(failed.title, "Revision conflict");
  assert.equal(
    failed.politeness,
    "assertive",
    "unsaved clinical work is interrupting news; routine progress is not",
  );
  assert.equal(saveStateView({ status: "saving" }).politeness, "polite");

  const unsaved = saveStateView({ status: "unsaved" });
  assert.equal(unsaved.label, "Unsaved changes");
  assert.equal(unsaved.canRetry, false);

  // A save with no usable timestamp still says only what it knows.
  assert.equal(savedAtLabel(undefined), "Saved");
  assert.equal(savedAtLabel("not a date"), "Saved");
});

test("every status tone carries a glyph, so state is never colour alone", () => {
  const tones: StatusTone[] = ["neutral", "info", "success", "warning", "danger"];
  for (const tone of tones) {
    assert.ok(
      STATUS_TONE_ICON[tone],
      `${tone} needs a glyph: a clinician who cannot separate red from green still has to read the state`,
    );
  }
  assert.equal(
    new Set(Object.values(STATUS_TONE_ICON)).size,
    tones.length,
    "two tones sharing a glyph would make them indistinguishable in greyscale",
  );
});
