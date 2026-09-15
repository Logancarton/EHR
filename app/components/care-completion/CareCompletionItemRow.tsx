"use client";

import { useEffect, useRef, useState } from "react";
import type { CareCompletionItem, CareCompletionState } from "../../domain/care-completion";
import { deferralReasonLabel } from "../../domain/care-completion";
import Button from "../ui/Button";
import Icon from "../ui/Icon";

/**
 * One line of a patient's care-completion checklist.
 *
 * Three presentation rules, each of them load-bearing:
 *
 * 1. **State is icon + word, never colour alone.** "Deferred" and "complete"
 *    look different because they say different things, not because one is amber.
 * 2. **Deferred never renders as done.** It gets its own glyph, its own word and
 *    its recorded reason on the line. Unresolved work with an explanation is
 *    still unresolved work.
 * 3. **Nothing here completes anything.** The primary control opens the workflow
 *    that owns the fact; only a manual task — the one item class with no other
 *    record — offers a check.
 */

/**
 * A resume date is a calendar day, stored as UTC midnight.
 *
 * Rendering it in the viewer's local zone moved it: a clinician west of UTC who
 * chose "bring this back on the 22nd" was shown "back Sep 21". The stored value
 * is a day, so it is read back as one.
 */
function formatResumeDay(iso: string): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return iso;
  return new Date(parsed).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

const STATE_PRESENTATION: Record<
  CareCompletionState,
  { icon: string; word: string; tone: string }
> = {
  complete: { icon: "check_circle", word: "Complete", tone: "done" },
  open: { icon: "radio_button_unchecked", word: "Open", tone: "open" },
  deferred: { icon: "schedule", word: "Deferred", tone: "deferred" },
  unavailable: { icon: "block", word: "Unavailable", tone: "unavailable" },
};

export type CareCompletionItemRowProps = {
  item: CareCompletionItem;
  patientName: string;
  busy?: boolean;
  onOpenWorkflow: (item: CareCompletionItem) => void;
  onDefer: (item: CareCompletionItem) => void;
  onResume: (item: CareCompletionItem) => void;
  onToggleManual: (item: CareCompletionItem) => void;
};

export default function CareCompletionItemRow({
  item,
  patientName,
  busy = false,
  onOpenWorkflow,
  onDefer,
  onResume,
  onToggleManual,
}: CareCompletionItemRowProps) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [whyOpen, setWhyOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const presentation = STATE_PRESENTATION[item.state];

  useEffect(() => {
    if (!menu) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenu(null);
    }
    function onPointer(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenu(null);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [menu]);

  const canDefer = item.deferrable && item.state === "open";
  const canResume = item.state === "deferred";
  const isManual = item.authority === "manual";

  return (
    <li
      className={`ccb-item ccb-item-${presentation.tone}`}
      data-item-key={item.itemKey}
      data-state={item.state}
      data-classification={item.classification}
      onContextMenu={(event) => {
        // A right-click menu is a shortcut here, never the only route: every
        // action it offers is also a visible button on the row.
        if (!canDefer && !canResume) return;
        event.preventDefault();
        setMenu({ x: event.clientX, y: event.clientY });
      }}
    >
      <span className={`ccb-item-state ccb-state-${presentation.tone}`}>
        <Icon name={presentation.icon} size="sm" label={`${presentation.word}:`} />
      </span>

      <div className="ccb-item-main">
        <div className="ccb-item-label-row">
          <span className="ccb-item-label">{item.label}</span>
          <span className={`ccb-item-badge ccb-badge-${presentation.tone}`}>{presentation.word}</span>
        </div>
        {item.detail ? <p className="ccb-item-detail">{item.detail}</p> : null}

        {item.deferral ? (
          <p className="ccb-item-deferral">
            <Icon name="pause_circle" size="sm" />
            <span>
              {deferralReasonLabel(item.deferral.reasonCode)}
              {item.deferral.reasonText ? ` — ${item.deferral.reasonText}` : ""}
              {item.deferral.resumeAt ? ` · back ${formatResumeDay(item.deferral.resumeAt)}` : ""}
            </span>
          </p>
        ) : null}

        {item.state === "unavailable" && item.unavailableReason ? (
          <p className="ccb-item-unavailable">{item.unavailableReason}</p>
        ) : null}

        {whyOpen ? (
          <div className="ccb-item-why" role="note">
            <p>{item.explanation}</p>
            {item.evidence.length ? (
              <ul>
                {item.evidence.map((source) => (
                  <li key={`${source.sourceKind}:${source.sourceId}:${source.label}`}>
                    <span className="ccb-evidence-kind">{source.sourceKind}</span>
                    <span>{source.label}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ccb-item-why-empty">No authoritative evidence is recorded for this item yet.</p>
            )}
          </div>
        ) : null}
      </div>

      <div className="ccb-item-tools">
        <Button
          variant="icon"
          size="sm"
          icon="info"
          aria-label={`Why is “${item.label}” here, for ${patientName}?`}
          pressed={whyOpen}
          onClick={() => setWhyOpen((open) => !open)}
        />

        {isManual ? (
          <Button
            size="sm"
            icon={item.state === "complete" ? "undo" : "check"}
            loading={busy}
            onClick={() => onToggleManual(item)}
          >
            {item.state === "complete" ? "Reopen" : "Done"}
          </Button>
        ) : null}

        {canResume ? (
          <Button size="sm" icon="play_arrow" loading={busy} onClick={() => onResume(item)}>
            Resume
          </Button>
        ) : null}

        {canDefer ? (
          <Button size="sm" icon="pause" onClick={() => onDefer(item)}>
            Defer
          </Button>
        ) : null}

        {item.action && !isManual ? (
          <Button variant="primary" size="sm" onClick={() => onOpenWorkflow(item)}>
            {item.action.label}
          </Button>
        ) : null}
      </div>

      {menu ? (
        <div
          className="ccb-context-menu"
          ref={menuRef}
          role="menu"
          aria-label={`${item.label} actions`}
          style={{
            left: Math.min(menu.x, (typeof window !== "undefined" ? window.innerWidth : 1200) - 232),
            top: Math.min(menu.y, (typeof window !== "undefined" ? window.innerHeight : 900) - 120),
          }}
        >
          {canDefer ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenu(null);
                onDefer(item);
              }}
            >
              <Icon name="pause" size="sm" />
              <span>Defer with a reason…</span>
            </button>
          ) : null}
          {canResume ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenu(null);
                onResume(item);
              }}
            >
              <Icon name="play_arrow" size="sm" />
              <span>Resume this work</span>
            </button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
