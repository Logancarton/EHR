"use client";
import Icon from "../ui/Icon";

/**
 * The uniform control set for a Today dashboard section.
 *
 * Every section previously carried its own hand-rolled button row, and they had
 * drifted apart: the briefing could collapse, the metrics row could not, and the
 * roster could neither collapse nor be dismissed. A clinician should not have to
 * learn which parts of the dashboard happen to be adjustable, so the same four
 * controls appear on every section that can be reordered.
 */
export type SectionToolsProps = {
  /** Human-readable section name, used to build accessible control labels. */
  label: string;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  /** Omitted for a section that must stay on the page. */
  onHide?: () => void;
};

export function SectionTools({
  label,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  collapsed,
  onToggleCollapse,
  onHide,
}: SectionToolsProps) {
  return (
    <div className="card-header-tools">
      <button
        type="button"
        className="card-tool-btn"
        disabled={!canMoveUp}
        onClick={onMoveUp}
        title={`Move ${label} up`}
        aria-label={`Move ${label} up`}
      >
        <Icon name="arrow_upward" />
      </button>
      <button
        type="button"
        className="card-tool-btn"
        disabled={!canMoveDown}
        onClick={onMoveDown}
        title={`Move ${label} down`}
        aria-label={`Move ${label} down`}
      >
        <Icon name="arrow_downward" />
      </button>
      <button
        type="button"
        className="card-tool-btn"
        onClick={onToggleCollapse}
        title={collapsed ? `Expand ${label}` : `Collapse ${label}`}
        aria-label={collapsed ? `Expand ${label}` : `Collapse ${label}`}
        aria-expanded={!collapsed}
      >
        {collapsed ? <Icon name="expand_more" /> : <Icon name="expand_less" />}
      </button>
      {onHide && (
        <button
          type="button"
          className="card-tool-btn close-tool"
          onClick={onHide}
          title={`Hide ${label}`}
          aria-label={`Hide ${label}`}
        >
          <Icon name="close" />
        </button>
      )}
    </div>
  );
}
