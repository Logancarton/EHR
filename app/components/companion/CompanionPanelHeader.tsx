"use client";

import type { CSSProperties } from "react";
import Icon from "../ui/Icon";

export type CompanionPanelHeaderAction = {
  icon: string;
  label: string;
  title?: string;
  onClick: () => void;
};

export default function CompanionPanelHeader({
  title,
  context,
  contextId,
  icon,
  iconStyle,
  onClose,
  closeLabel = "Close",
  onUnpin,
  unpinLabel,
  primaryAction,
  onExpand,
  onRedock,
  isExpanded = false,
}: {
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
  onExpand?: () => void;
  onRedock?: () => void;
  isExpanded?: boolean;
}) {
  return (
    <div className="companion-panel-header">
      <div>
        <span className="spark" style={iconStyle}>
          <Icon name={icon} />
        </span>
        <div>
          <strong>{title}</strong>
          {context ? <small id={contextId}>{context}</small> : null}
        </div>
      </div>

      <div className="companion-header-actions">
        {isExpanded && onRedock ? (
          <button
            type="button"
            className="companion-redock-btn"
            title="Redock to companion rail"
            aria-label="Redock to companion rail"
            data-action="redock-companion"
            onClick={onRedock}
          >
            <Icon name="close_fullscreen" size="sm" />
          </button>
        ) : onExpand ? (
          <button
            type="button"
            className="companion-expand-btn"
            title="Expand to main canvas"
            aria-label="Expand to main canvas"
            data-action="expand-companion"
            onClick={onExpand}
          >
            <Icon name="open_in_full" size="sm" />
          </button>
        ) : null}
        {primaryAction ? (
          <button
            type="button"
            className="companion-unpin-btn"
            title={primaryAction.title ?? primaryAction.label}
            aria-label={primaryAction.label}
            onClick={primaryAction.onClick}
          >
            <Icon name={primaryAction.icon} size="sm" />
          </button>
        ) : null}

        {onUnpin ? (
          <button
            type="button"
            className="companion-unpin-btn"
            title={unpinLabel ? `${unpinLabel} from companion rail` : "Unpin from companion rail"}
            aria-label={unpinLabel ?? "Unpin companion tool"}
            onClick={onUnpin}
          >
            <Icon name="keep_off" size="sm" />
          </button>
        ) : null}

        <button
          type="button"
          className="companion-close-btn"
          aria-label={closeLabel}
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </div>
    </div>
  );
}
