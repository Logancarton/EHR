"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Button from "../ui/Button";
import Icon from "../ui/Icon";
import type { PreviewWindowDefinition, PreviewWindowSpan } from "../../lib/preview/dashboard-preview-model";

/**
 * The chrome every dashboard window wears in the DB-1 prototype.
 *
 * The header carries the whole personalization vocabulary DASH-03 asks for — move,
 * resize, collapse, hide, settings — as ordinary buttons rather than as a drag
 * gesture with a keyboard fallback bolted on afterwards. DASH-10 requires the
 * keyboard path to exist; making it the *only* path is what keeps it working.
 *
 * A hidden window is recoverable, never destroyed: hiding drops it into the restore
 * bar below the canvas.
 */

export type PreviewWindowFrameProps = {
  definition: PreviewWindowDefinition;
  span: PreviewWindowSpan;
  collapsed: boolean;
  editing: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onToggleCollapse: () => void;
  onCycleSpan: () => void;
  onHide?: () => void;
  onOpenFullScreen?: () => void;
  /** Rendered inside the header's settings popover. */
  settings?: ReactNode;
  /** Shown at the right of the header, before the tools — a count or a status word. */
  headerNote?: ReactNode;
  children: ReactNode;
};

export default function PreviewWindowFrame({
  definition,
  span,
  collapsed,
  editing,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onToggleCollapse,
  onCycleSpan,
  onHide,
  onOpenFullScreen,
  settings,
  headerNote,
  children,
}: PreviewWindowFrameProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!settingsOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setSettingsOpen(false);
    }
    function onPointer(event: PointerEvent) {
      if (!settingsRef.current?.contains(event.target as Node)) setSettingsOpen(false);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [settingsOpen]);

  return (
    <section
      className={`dpw dpw-span-${span} ${collapsed ? "is-collapsed" : ""} ${editing ? "is-editing" : ""}`}
      data-preview-window={definition.id}
      data-span={span}
      data-collapsed={collapsed ? "true" : "false"}
      aria-label={definition.title}
    >
      <header className="dpw-head">
        <h3 className="dpw-title">
          <Icon name={definition.icon} size="sm" />
          <span>{definition.title}</span>
        </h3>

        {definition.financialDemo && (
          <span className="dpw-demo-tag" title="Sample figures. Not this practice's finances.">
            Demo
          </span>
        )}

        {headerNote && <span className="dpw-head-note">{headerNote}</span>}

        <div className="dpw-tools" role="group" aria-label={`${definition.title} window controls`}>
          {editing && (
            <>
              <Button
                variant="icon"
                size="sm"
                icon="arrow_upward"
                aria-label={`Move ${definition.title} up`}
                {...(canMoveUp
                  ? { onClick: onMoveUp }
                  : { disabled: true as const, disabledReason: "Already the first window." })}
              />
              <Button
                variant="icon"
                size="sm"
                icon="arrow_downward"
                aria-label={`Move ${definition.title} down`}
                {...(canMoveDown
                  ? { onClick: onMoveDown }
                  : { disabled: true as const, disabledReason: "Already the last window." })}
              />
              <Button
                variant="icon"
                size="sm"
                icon={span === "full" ? "width_normal" : "width_full"}
                aria-label={
                  span === "full"
                    ? `Make ${definition.title} half width`
                    : `Make ${definition.title} full width`
                }
                pressed={span === "full"}
                onClick={onCycleSpan}
              />
            </>
          )}

          {onOpenFullScreen && (
            <Button
              variant="icon"
              size="sm"
              icon="open_in_full"
              aria-label={`Open ${definition.title} full screen`}
              onClick={onOpenFullScreen}
            />
          )}

          <Button
            variant="icon"
            size="sm"
            icon={collapsed ? "unfold_more" : "unfold_less"}
            aria-label={collapsed ? `Expand ${definition.title}` : `Collapse ${definition.title}`}
            pressed={collapsed}
            onClick={onToggleCollapse}
          />

          {settings && (
            <div className="dpw-settings-anchor" ref={settingsRef}>
              <Button
                variant="icon"
                size="sm"
                icon="tune"
                aria-label={`${definition.title} settings`}
                aria-expanded={settingsOpen}
                pressed={settingsOpen}
                onClick={() => setSettingsOpen((open) => !open)}
              />
              {settingsOpen && (
                <div className="dpw-settings-popover" role="dialog" aria-label={`${definition.title} settings`}>
                  {settings}
                </div>
              )}
            </div>
          )}

          {onHide ? (
            <Button
              variant="icon"
              size="sm"
              icon="visibility_off"
              aria-label={`Hide ${definition.title}`}
              onClick={onHide}
            />
          ) : (
            <Button
              variant="icon"
              size="sm"
              icon="lock"
              aria-label={`${definition.title} cannot be hidden`}
              disabled
              disabledReason="The schedule is what this dashboard is for; it can be moved and resized but not removed."
            />
          )}
        </div>
      </header>

      {!collapsed && <div className="dpw-body">{children}</div>}
    </section>
  );
}
