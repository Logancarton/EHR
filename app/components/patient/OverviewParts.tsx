"use client";

import type { ReactNode } from "react";
import Icon from "../ui/Icon";

/**
 * Shared anatomy for every Overview section: the highlight is always visible,
 * detail and provenance open on demand. One header shape (title, one link,
 * options menu) keeps the page reading as a single list instead of a mosaic.
 */
export function OverviewCard({ cardId, title, action, menu, collapsed = false, className = "", children }: {
  cardId?: string;
  title: string;
  action?: { label: string; onClick: () => void } | null;
  menu?: ReactNode;
  collapsed?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`overview-card-container ov-card ${collapsed ? "is-collapsed" : ""} ${className}`} data-overview-card={cardId}>
      <header className="ov-card-head">
        <h2>{title}</h2>
        <div className="ov-card-tools">
          {action && <button type="button" className="ov-link" onClick={action.onClick}>{action.label} →</button>}
          {menu}
        </div>
      </header>
      {!collapsed && <div className="ov-card-body">{children}</div>}
    </section>
  );
}

export type OverviewTone = "critical" | "warning" | "ok";

/** One fact. With `detail`, the row expands in place; without, it is a plain line. */
export function OverviewLine({ label, meta, tone, detail, open, className = "", children, ...rest }: {
  label?: ReactNode;
  meta?: ReactNode;
  tone?: OverviewTone;
  detail?: ReactNode;
  open?: boolean;
  className?: string;
  children: ReactNode;
} & { [data: `data-${string}`]: string | undefined }) {
  const classes = `ov-line ${label ? "ov-line--labeled" : ""} ${tone ? `tone-${tone}` : ""} ${className}`;
  const body = <>
    {label && <span className="ov-line-label">{label}</span>}
    <span className="ov-line-main">{children}</span>
    <span className="ov-line-meta">{meta}</span>
  </>;
  // The empty chevron slot keeps dates aligned between plain and expandable lines.
  if (!detail) return <div className={classes} {...rest}><div className="ov-line-summary">{body}<span className="ov-line-chevron" aria-hidden="true" /></div></div>;
  return (
    <details className={`${classes} ov-line--expandable`} open={open} {...rest}>
      <summary className="ov-line-summary">{body}<Icon name="expand_more" size="sm" className="ov-line-chevron" /></summary>
      <div className="ov-line-detail">{detail}</div>
    </details>
  );
}

/** Provenance stays available without competing with the clinical value. */
export function SourceNote({ children }: { children: ReactNode }) {
  return <p className="ov-source"><Icon name="info" size="sm" /><span>{children}</span></p>;
}
