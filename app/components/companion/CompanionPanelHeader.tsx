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
