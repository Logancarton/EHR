"use client";

import { STATUS_TONE_ICON, type StatusTone } from "../../lib/ui-system";
import Icon from "./Icon";

/**
 * A state marker that survives being seen in greyscale.
 *
 * Some of these mark overdue monitoring, unacknowledged results and failed
 * transmissions, so the tone is reinforced by a word and a glyph rather than carried
 * by colour alone. `shape="pill"` is the rounded form used in dense rows; the
 * default badge is the squarer form used in headers and toolbars.
 */
export default function StatusBadge({
  tone = "neutral",
  children,
  shape = "badge",
  icon,
  title,
}: {
  tone?: StatusTone;
  children: React.ReactNode;
  shape?: "badge" | "pill";
  /** Overrides the tone's default glyph when a more specific one reads better. */
  icon?: string;
  title?: string;
}) {
  return (
    <span className={`ui-status ui-status-${shape} tone-${tone}`} title={title}>
      <Icon name={icon ?? STATUS_TONE_ICON[tone]} size="sm" />
      <span>{children}</span>
    </span>
  );
}
