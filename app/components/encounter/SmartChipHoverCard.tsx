"use client";

import { useMemo } from "react";
import Icon from "../ui/Icon";
import {
  type SmartChipItem,
  type SmartChipType,
  SMART_CHIP_CATEGORY_LABELS,
  SMART_CHIP_COLOR_CLASSES,
} from "../../domain/smart-canvas";

export interface SmartChipHoverCardProps {
  item: SmartChipItem;
  targetRect?: DOMRect | null;
  onClose?: () => void;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
  onActionClick?: (action: string, item: SmartChipItem) => void;
}

export default function SmartChipHoverCard({
  item,
  targetRect,
  onClose,
  onPointerEnter,
  onPointerLeave,
  onActionClick,
}: SmartChipHoverCardProps) {
  const colorClass = SMART_CHIP_COLOR_CLASSES[item.type];
  const categoryLabel = SMART_CHIP_CATEGORY_LABELS[item.type];
  const meta = item.meta || {};

  // Boundary-aware viewport positioning
  const stylePos = useMemo(() => {
    if (!targetRect) return {};
    const cardWidth = 340;
    const cardHeight = 220;
    const margin = 12;

    const viewportW = typeof window !== "undefined" ? window.innerWidth : 1000;
    const viewportH = typeof window !== "undefined" ? window.innerHeight : 800;

    let left = targetRect.left;
    // Default to displaying below target
    let top = targetRect.bottom + 8;

    // Flip above target if overflowing bottom
    if (top + cardHeight > viewportH - margin) {
      top = Math.max(margin, targetRect.top - cardHeight - 8);
    }

    // Clamp horizontally
    if (left + cardWidth > viewportW - margin) {
      left = Math.max(margin, viewportW - cardWidth - margin);
    }

    return {
      top: `${top}px`,
      left: `${left}px`,
    };
  }, [targetRect]);

  return (
    <div
      className="smart-chip-hovercard"
      style={stylePos}
      role="tooltip"
      aria-label={`${categoryLabel}: ${item.label}`}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave || onClose}
    >
      {/* Header with Type & Status */}
      <div className="hovercard-header">
        <div className={`hovercard-icon-pill ${colorClass}`}>
          <Icon name={item.icon} />
          <span>{categoryLabel}</span>
        </div>
        {meta.status && (
          <span className="hovercard-status-badge">
            <span className="status-dot" />
            {meta.status}
          </span>
        )}
      </div>

      {/* Main Title */}
      <div className="hovercard-title-block">
        <h4 className="hovercard-title">{item.label}</h4>
        {meta.subtitle && <p className="hovercard-subtitle">{meta.subtitle}</p>}
      </div>

      {/* Body Content by Type */}
      <div className="hovercard-body">
        {item.type === "med" && (
          <div className="hovercard-data-grid">
            {meta.sig && (
              <div className="hovercard-data-row">
                <span className="data-label">SIG / Instructions</span>
                <span className="data-value sig-text">{meta.sig}</span>
              </div>
            )}
            <div className="hovercard-data-cols">
              {meta.refills && (
                <div className="hovercard-data-col">
                  <span className="data-label">Refills</span>
                  <span className="data-value">{meta.refills}</span>
                </div>
              )}
              {meta.pharmacy && (
                <div className="hovercard-data-col">
                  <span className="data-label">Pharmacy</span>
                  <span className="data-value pharmacy-text">{meta.pharmacy}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {item.type === "lab" && (
          <div className="hovercard-data-grid">
            <div className="hovercard-lab-highlight">
              <div className="lab-val-box">
                <span className="data-label">Latest Result</span>
                <span className="lab-main-value">{meta.labValue} {meta.labUnit}</span>
              </div>
              {meta.labFlag && (
                <span className={`lab-flag-badge ${meta.labFlag}`}>
                  {meta.labFlag.toUpperCase()}
                </span>
              )}
            </div>
            {meta.labRange && (
              <div className="hovercard-data-row">
                <span className="data-label">Reference Range</span>
                <span className="data-value">{meta.labRange} {meta.labUnit}</span>
              </div>
            )}
            {meta.trend && (
              <div className="hovercard-data-row">
                <span className="data-label">Longitudinal Trend</span>
                <span className="data-value trend-text">
                  <Icon name="trending_flat" /> {meta.trend}
                </span>
              </div>
            )}
          </div>
        )}

        {item.type === "dx" && (
          <div className="hovercard-data-grid">
            <div className="hovercard-data-row">
              <span className="data-label">Clinical Problem</span>
              <span className="data-value">{item.label}</span>
            </div>
            {meta.icdCode && (
              <div className="hovercard-data-row">
                <span className="data-label">ICD-10-CM Code</span>
                <span className="data-value icd-code-badge">{meta.icdCode}</span>
              </div>
            )}
          </div>
        )}

        {(item.type === "vital" || item.type === "scale") && (
          <div className="hovercard-data-grid">
            <div className="hovercard-data-row">
              <span className="data-label">Documented Value</span>
              <span className="data-value vital-score-value">{item.value}</span>
            </div>
            {meta.normalRange && (
              <div className="hovercard-data-row">
                <span className="data-label">Target / Normal Range</span>
                <span className="data-value">{meta.normalRange}</span>
              </div>
            )}
            {meta.severity && (
              <div className="hovercard-data-row">
                <span className="data-label">Clinical Severity</span>
                <span className="data-value severity-badge">{meta.severity}</span>
              </div>
            )}
          </div>
        )}

        {item.type === "date" && (
          <div className="hovercard-data-grid">
            <div className="hovercard-data-row">
              <span className="data-label">Scheduled Date</span>
              <span className="data-value">{meta.date || item.value}</span>
            </div>
          </div>
        )}

        {item.type === "allergy" && (
          <div className="hovercard-data-grid">
            <div className="hovercard-data-row">
              <span className="data-label">Substance</span>
              <span className="data-value allergy-danger">{item.label}</span>
            </div>
          </div>
        )}
      </div>

      {/* Footer Quick Action */}
      <div className="hovercard-footer">
        <span className="hovercard-source-provenance">
          <Icon name="verified_user" /> Authoritative Chart Record
        </span>
        {item.type === "med" && (
          <button
            type="button"
            className="hovercard-action-btn"
            onClick={() => onActionClick?.("prescribe", item)}
          >
            Manage Rx <Icon name="arrow_forward" />
          </button>
        )}
        {item.type === "lab" && (
          <button
            type="button"
            className="hovercard-action-btn"
            onClick={() => onActionClick?.("order_lab", item)}
          >
            Reorder Lab <Icon name="add" />
          </button>
        )}
      </div>
    </div>
  );
}
