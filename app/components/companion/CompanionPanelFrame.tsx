"use client";

import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import CompanionPanelHeader, { type CompanionPanelHeaderAction } from "./CompanionPanelHeader";

type DataAttributes = { [key: `data-${string}`]: string | undefined };

/**
 * The one window every right-rail tool renders inside.
 *
 * Each companion used to assemble its own header, padding, scroller and bottom
 * button, so seven tools looked like seven apps. The frame fixes the anatomy:
 * a compact header (tool name, the bound patient once, expand / unpin / close),
 * an optional toolbar that stays put (channel tabs, a patient picker), one
 * scrolling body, and a sticky footer for the tool's main action. A tool owns
 * only what goes in those slots.
 *
 * Expanded presentation is the frame's concern too, so a tool that can expand
 * gets the same control in the same place as every other one.
 */
export default function CompanionPanelFrame({
  as: Tag = "aside",
  className = "",
  ariaLabel,
  rootProps,
  title,
  context,
  contextId,
  icon,
  iconStyle,
  onClose,
  closeLabel,
  onUnpin,
  unpinLabel,
  primaryAction,
  isExpanded = false,
  onExpand,
  onRedock,
  toolbar,
  overlay,
  footer,
  bodyClassName = "",
  containBody = false,
  children,
}: {
  as?: "aside" | "section";
  className?: string;
  ariaLabel?: string;
  rootProps?: HTMLAttributes<HTMLElement> & DataAttributes;
  title: string;
  context?: string;
  contextId?: string;
  icon: string;
  iconStyle?: CSSProperties;
  onClose: () => void;
  closeLabel?: string;
  onUnpin?: () => void;
  unpinLabel?: string;
  primaryAction?: CompanionPanelHeaderAction;
  isExpanded?: boolean;
  onExpand?: () => void;
  onRedock?: () => void;
  /** Stays fixed under the header while the body scrolls. */
  toolbar?: ReactNode;
  /** Positioned against the whole panel (e.g. a transient status toast). */
  overlay?: ReactNode;
  /** Sticky action row pinned to the bottom of the panel. */
  footer?: ReactNode;
  bodyClassName?: string;
  /**
   * The body clips instead of scrolling, for tools whose content manages its own
   * scroll regions (a chat thread with a composer beneath it).
   */
  containBody?: boolean;
  children: ReactNode;
}) {
  return (
    <Tag
      {...rootProps}
      className={`companion-panel companion-frame ${className} ${isExpanded ? "companion-expanded-canvas" : ""}`}
      aria-label={ariaLabel ?? title}
    >
      {overlay}
      <CompanionPanelHeader
        title={title}
        context={context}
        contextId={contextId}
        icon={icon}
        iconStyle={iconStyle}
        onClose={onClose}
        closeLabel={closeLabel}
        onUnpin={onUnpin}
        unpinLabel={unpinLabel}
        primaryAction={primaryAction}
        isExpanded={isExpanded}
        onExpand={onExpand}
        onRedock={onRedock}
      />
      {toolbar ? <div className="companion-frame-toolbar">{toolbar}</div> : null}
      <div
        className={`companion-panel-body companion-frame-body ${containBody ? "is-contained" : ""} ${bodyClassName}`}
      >
        {children}
      </div>
      {footer ? <div className="companion-frame-footer">{footer}</div> : null}
    </Tag>
  );
}
