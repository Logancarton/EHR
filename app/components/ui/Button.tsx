"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import {
  type ButtonSize,
  type ButtonVariant,
  buttonPresentation,
} from "../../lib/ui-system";
import Icon from "./Icon";

/**
 * The app's button.
 *
 * Buttons had grown one rule at a time — 151 distinct visual signatures across the
 * stylesheets — so the same action looked different depending on which surface a
 * clinician reached it from. The variants here are the ones the product already
 * used, named rather than re-derived.
 *
 * Two behaviours are settled here rather than per call site:
 *
 * - An action in flight stays focusable and reports `aria-busy`. Marking it natively
 *   disabled would eject a keyboard user from the control they just activated.
 * - An unavailable action must say why. `disabledReason` is required alongside
 *   `disabled`, because a dead control with no explanation is the defect, not the
 *   disabling itself.
 */
type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "disabled" | "aria-pressed"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Shown beside the spinner while loading; falls back to the button's own label. */
  loadingLabel?: string;
  /** Another change on this surface is saving; this control waits, and says why. */
  busy?: boolean;
  pressed?: boolean;
  /** Leading Material Symbols name. For `variant="icon"` this is the whole button. */
  icon?: string;
  children?: ReactNode;
} & (
    | { disabled: true; disabledReason: string }
    | { disabled?: false; disabledReason?: never }
  );

export default function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  loadingLabel,
  busy = false,
  pressed,
  icon,
  disabled = false,
  disabledReason,
  className,
  title,
  children,
  onClick,
  type = "button",
  ...rest
}: ButtonProps) {
  const presentation = buttonPresentation({
    variant,
    size,
    loading,
    disabled,
    disabledReason,
    busy,
    pressed,
    className,
    title,
  });

  return (
    <button
      {...rest}
      type={type}
      className={presentation.className}
      disabled={presentation.disabled}
      aria-disabled={presentation.ariaDisabled}
      aria-busy={presentation.ariaBusy}
      aria-pressed={presentation.ariaPressed}
      title={presentation.title}
      onClick={(event) => {
        // A busy or unavailable control swallows the click rather than running the
        // action twice: `aria-disabled` is a promise to the user, not to the browser.
        if (presentation.inert) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
    >
      {loading ? (
        <span className="ui-btn-spinner" aria-hidden="true" />
      ) : icon ? (
        <Icon name={icon} size={size === "sm" ? "sm" : "md"} />
      ) : null}
      {variant === "icon" && !children ? null : (
        <span className="ui-btn-label">{loading && loadingLabel ? loadingLabel : children}</span>
      )}
    </button>
  );
}
