/**
 * The rules behind the shared UI primitives.
 *
 * These live apart from the components so the behaviour that matters clinically —
 * when a control is genuinely unavailable, when a surface may show "nothing here"
 * versus "this failed", what a save indicator claims — is plain logic with tests
 * rather than something only reachable by rendering a React tree.
 *
 * Inventory that motivated this (phase P1-A, measured on the tree at the time):
 * 207 hand-written button rules across 151 distinct visual signatures, the same
 * `loading -> empty -> rows` chain re-implemented in eight surfaces (mostly with no
 * error branch and no retry), a `--radius-*` scale defined but used zero times, and
 * `#ffffff` written out 223 times. The point of these primitives is to stop that
 * growing, not to model controls nobody has asked for.
 */

export type ButtonVariant = "primary" | "secondary" | "tertiary" | "destructive" | "icon";
export type ButtonSize = "sm" | "md";

export type ButtonPresentation = {
  className: string;
  /**
   * Native `disabled`. Used only when the action is genuinely unavailable — never
   * for work in flight, because removing a control from the tab order mid-action
   * drops a keyboard user somewhere they did not ask to be.
   */
  disabled: boolean;
  /** Set while the action is unavailable *or* in flight; blocks activation either way. */
  ariaDisabled: true | undefined;
  ariaBusy: true | undefined;
  ariaPressed: boolean | undefined;
  /** Why the control cannot be used, surfaced as a tooltip. */
  title: string | undefined;
  /** True when a click should be swallowed rather than run the handler. */
  inert: boolean;
};

export type ButtonPresentationInput = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** The action is running. The control stays focusable and announces itself busy. */
  loading?: boolean;
  /** The action is unavailable. Requires a reason: a dead control with no explanation is a defect. */
  disabled?: boolean;
  disabledReason?: string;
  /** Toggle state for a control that stays pressed, e.g. a filter chip. */
  pressed?: boolean;
  className?: string;
  title?: string;
};

export function buttonPresentation({
  variant = "secondary",
  size = "md",
  loading = false,
  disabled = false,
  disabledReason,
  pressed,
  className,
  title,
}: ButtonPresentationInput): ButtonPresentation {
  const classes = [
    "ui-btn",
    `ui-btn-${variant}`,
    size === "sm" ? "ui-btn-sm" : "",
    loading ? "is-loading" : "",
    pressed ? "is-pressed" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    className: classes,
    disabled: disabled && !loading,
    ariaDisabled: disabled || loading ? true : undefined,
    ariaBusy: loading ? true : undefined,
    ariaPressed: pressed,
    title: title ?? (disabled ? disabledReason : undefined),
    inert: disabled || loading,
  };
}

/**
 * What an async surface should be showing.
 *
 * Eight surfaces each grew their own `loading ? … : rows.length === 0 ? … : rows`
 * chain. Most had no error branch at all, so a failed load rendered as "nothing
 * here" — which in a clinical queue reads as "no results to review" rather than
 * "this did not load", and that is the difference worth encoding once.
 */
export type AsyncPhase = "loading" | "error" | "empty" | "ready";

export type AsyncView = {
  phase: AsyncPhase;
  /** A request is in flight; surfaces mark themselves `aria-busy` while true. */
  busy: boolean;
};

export type AsyncViewInput = {
  loading: boolean;
  error?: string | null;
  isEmpty: boolean;
  /** True once a load has completed, so a refresh does not blank what is on screen. */
  hasLoadedOnce?: boolean;
};

export function resolveAsyncView({
  loading,
  error,
  isEmpty,
  hasLoadedOnce = false,
}: AsyncViewInput): AsyncView {
  if (loading) {
    // A refresh over existing content keeps the content, and a retry after a failure
    // shows progress rather than the error it is already addressing.
    const phase: AsyncPhase = !hasLoadedOnce || isEmpty ? "loading" : "ready";
    return { phase, busy: true };
  }
  if (error) return { phase: "error", busy: false };
  if (isEmpty) return { phase: "empty", busy: false };
  return { phase: "ready", busy: false };
}

/**
 * Save state, shared by every surface that persists in the background.
 *
 * The encounter note worked this out first — status, the time it landed, the error,
 * and a retry the clinician can actually reach. Every other autosaving surface
 * deserves the same wording and the same promise: "saved" is only ever said after
 * the server confirmed it.
 */
export type SaveStatus = "unsaved" | "saving" | "saved" | "failed";

export type SaveStateView = {
  label: string;
  tone: "neutral" | "progress" | "success" | "danger";
  canRetry: boolean;
  title: string | undefined;
  /** Failures are announced assertively; routine progress is not. */
  politeness: "polite" | "assertive";
};

export function saveStateView({
  status,
  savedAt,
  error,
}: {
  status: SaveStatus;
  savedAt?: string;
  error?: string;
}): SaveStateView {
  if (status === "saving") {
    return { label: "Saving…", tone: "progress", canRetry: false, title: undefined, politeness: "polite" };
  }
  if (status === "saved") {
    return {
      label: savedAtLabel(savedAt),
      tone: "success",
      canRetry: false,
      title: savedAt,
      politeness: "polite",
    };
  }
  if (status === "failed") {
    return {
      label: "Save failed",
      tone: "danger",
      canRetry: true,
      title: error || "The server did not confirm this save.",
      politeness: "assertive",
    };
  }
  return {
    label: "Unsaved changes",
    tone: "neutral",
    canRetry: false,
    title: undefined,
    politeness: "polite",
  };
}

export function savedAtLabel(value?: string): string {
  if (!value) return "Saved";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Saved";
  return `Saved ${parsed.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

/**
 * Status presentation.
 *
 * Every tone carries a word and an icon, never colour alone: a red pill and a green
 * pill are the same pill to a clinician who cannot tell them apart, and some of
 * these mark overdue monitoring.
 */
export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

export const STATUS_TONE_ICON: Record<StatusTone, string> = {
  neutral: "radio_button_unchecked",
  info: "info",
  success: "check_circle",
  warning: "warning",
  danger: "error",
};
