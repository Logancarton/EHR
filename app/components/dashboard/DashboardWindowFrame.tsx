"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Button from "../ui/Button";
import Icon from "../ui/Icon";
import type {
  DashboardModuleDefinition,
  DashboardModuleSpan,
} from "../../domain/dashboard-modules";

export type DashboardWindowFrameProps = {
  definition: DashboardModuleDefinition;
  span: DashboardModuleSpan;
  collapsed: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  accessibleLabel?: string;
  containerClassName?: string;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onToggleCollapse: () => void;
  onCycleSpan?: () => void;
  onHide?: () => void;
  isFullScreen?: boolean;
  onToggleFullScreen?: () => void;
  headerNote?: ReactNode;
  settings?: ReactNode;
  children: ReactNode;
};

export default function DashboardWindowFrame({
  definition,
  span,
  collapsed,
  canMoveUp,
  canMoveDown,
  accessibleLabel,
  containerClassName,
  onMoveUp,
  onMoveDown,
  onToggleCollapse,
  onCycleSpan,
  onHide,
  isFullScreen = false,
  onToggleFullScreen,
  headerNote,
  settings,
  children,
}: DashboardWindowFrameProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement | null>(null);
  const name = accessibleLabel || definition.title;

  useEffect(() => {
    if (!settingsOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setSettingsOpen(false);
    }
    function onPointer(event: PointerEvent) {
      if (!settingsRef.current?.contains(event.target as Node)) {
        setSettingsOpen(false);
      }
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
      className={`dmf dmf-${definition.id} dmf-span-${span} ${collapsed ? "is-collapsed" : ""} ${isFullScreen ? "is-fullscreen-target" : ""} ${containerClassName || ""}`}
      data-module-id={definition.id}
      data-span={span}
      data-collapsed={collapsed ? "true" : "false"}
      aria-label={definition.title}
    >
      <header className="dmf-head">
        <h3 className="dmf-title">
          <Icon name={definition.icon} size="sm" />
          <span>{definition.title}</span>
        </h3>

        {headerNote && <span className="dmf-head-note">{headerNote}</span>}

        <div className="dmf-tools" role="group" aria-label={`${name} controls`}>
          {/* Move up */}
          <Button
            variant="icon"
            size="sm"
            icon="arrow_upward"
            aria-label={`Move ${name} up`}
            {...(canMoveUp
              ? { onClick: onMoveUp }
              : { disabled: true as const, disabledReason: "Already first in layout." })}
          />

          {/* Move down */}
          <Button
            variant="icon"
            size="sm"
            icon="arrow_downward"
            aria-label={`Move ${name} down`}
            {...(canMoveDown
              ? { onClick: onMoveDown }
              : { disabled: true as const, disabledReason: "Already last in layout." })}
          />

          {/* Cycle width (half vs full) */}
          {onCycleSpan && definition.allowedSpans.length > 1 && (
            <Button
              variant="icon"
              size="sm"
              icon={span === "full" ? "width_normal" : "width_full"}
              aria-label={
                span === "full"
                  ? `Make ${name} half width`
                  : `Make ${name} full width`
              }
              pressed={span === "full"}
              onClick={onCycleSpan}
            />
          )}

          {/* Full-screen focus */}
          {onToggleFullScreen && (
            <Button
              variant="icon"
              size="sm"
              icon={isFullScreen ? "close_fullscreen" : "open_in_full"}
              aria-label={
                isFullScreen
                  ? `Exit full screen for ${name}`
                  : `Open ${name} full screen`
              }
              pressed={isFullScreen}
              onClick={onToggleFullScreen}
            />
          )}

          {/* Collapse / Expand */}
          <Button
            variant="icon"
            size="sm"
            icon={collapsed ? "unfold_more" : "unfold_less"}
            aria-label={collapsed ? `Expand ${name}` : `Collapse ${name}`}
            pressed={collapsed}
            onClick={onToggleCollapse}
          />

          {/* Settings */}
          {settings && (
            <div className="dmf-settings-anchor" ref={settingsRef}>
              <Button
                variant="icon"
                size="sm"
                icon="tune"
                aria-label={`Configure ${name}`}
                pressed={settingsOpen}
                onClick={() => setSettingsOpen((open) => !open)}
              />
              {settingsOpen && (
                <div
                  className="dmf-settings-popover"
                  role="dialog"
                  aria-label={`${name} settings`}
                >
                  {settings}
                </div>
              )}
            </div>
          )}

          {/* Hide (disabled if permanent) */}
          {onHide && !definition.permanent && (
            <Button
              variant="icon"
              size="sm"
              icon="visibility_off"
              aria-label={`Hide ${name}`}
              onClick={onHide}
            />
          )}
        </div>
      </header>

      {!collapsed && <div className="dmf-body">{children}</div>}
    </section>
  );
}
