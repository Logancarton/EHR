/**
 * The app's single icon family.
 *
 * Everything was previously drawn with whatever glyph was closest to hand —
 * colour emoji in some places, box-drawing and dingbat characters in others.
 * They rendered at OS-dependent sizes, weights and colours, which is what made
 * the chrome read as unfinished no matter how the panels were arranged.
 *
 * Icons are decorative by default: the label beside them already carries the
 * meaning, so they are hidden from screen readers unless a `label` is given,
 * which is the case for icon-only buttons.
 */

export type IconSize = "sm" | "md" | "lg";

type IconProps = {
  /** Material Symbols name, e.g. "medication", "calendar_month". */
  name: string;
  size?: IconSize;
  /** Use the filled cut. Reserve it for a selected/active state. */
  filled?: boolean;
  /** Accessible name. Omit for icons that sit next to a visible text label. */
  label?: string;
  className?: string;
};

const SIZE_CLASS: Record<IconSize, string> = {
  sm: "icon-sm",
  md: "",
  lg: "icon-lg",
};

export default function Icon({ name, size = "md", filled = false, label, className }: IconProps) {
  const classes = ["icon", SIZE_CLASS[size], filled ? "icon-filled" : "", className]
    .filter(Boolean)
    .join(" ");

  return (
    <span
      className={classes}
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
      translate="no"
    >
      {name}
    </span>
  );
}
