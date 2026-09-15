"use client";

import type { CareCompletionItem, CareCompletionPatientCard } from "../../domain/care-completion";
import Button from "../ui/Button";
import Icon from "../ui/Icon";
import CareCompletionItemRow from "./CareCompletionItemRow";

/**
 * One pinned patient on the board.
 *
 * The card exists to answer "is this patient finished?" before it answers "what
 * is left", which is why the progress line comes first and reads as three
 * separate numbers rather than a fraction. `5 / 7` hides the difference between
 * an item nobody has looked at and one that is waiting on the patient with a
 * reason attached; `5 done · 1 waiting · 1 open` does not.
 *
 * Compact mode is the density a busy list needs: identity, progress, and the
 * work as short state chips. Expanding gives the full checklist with evidence.
 */

const CHIP_ICON: Record<string, string> = {
  complete: "check_circle",
  open: "radio_button_unchecked",
  deferred: "schedule",
  unavailable: "block",
};

/** A short label for a chip — the rule's subject, not its whole sentence. */
function chipLabel(item: CareCompletionItem): string {
  switch (item.ruleId) {
    case "follow-up-appointment":
      return item.state === "complete" ? `F/U ${item.detail?.split(" · ")[0] ?? ""}`.trim() : "F/U";
    case "encounter-signed":
      return "Sign";
    case "prescription-transmission":
      return "Rx";
    case "result-review":
      return "Result";
    case "monitoring-labs":
      return "Labs";
    case "medication-change-message":
      return "Pt msg";
    case "transcription-review":
      return "Scribe";
    case "coding-review":
      return "Coding";
    case "pcp-notification":
      return "PCP";
    case "manual-task":
      return item.label.length > 22 ? `${item.label.slice(0, 21)}…` : item.label;
    default:
      return item.label;
  }
}

export default function CareCompletionPatientCardView({
  card,
  expanded,
  busyItemKey,
  onToggleExpanded,
  onOpenChart,
  onOpenWorkflow,
  onDefer,
  onResume,
  onToggleManual,
  onUnpin,
}: {
  card: CareCompletionPatientCard;
  expanded: boolean;
  busyItemKey?: string | null;
  onToggleExpanded: () => void;
  onOpenChart: () => void;
  onOpenWorkflow: (item: CareCompletionItem) => void;
  onDefer: (item: CareCompletionItem) => void;
  onResume: (item: CareCompletionItem) => void;
  onToggleManual: (item: CareCompletionItem) => void;
  onUnpin: () => void;
}) {
  const { progress } = card;
  const closed = progress.closed;

  return (
    <article
      className={`ccb-card ${closed ? "is-closed" : ""} ${expanded ? "is-expanded" : ""}`}
      data-patient-id={card.patientId}
      data-progress-complete={progress.complete}
      data-progress-open={progress.open}
      data-progress-deferred={progress.deferred}
      data-closed={closed ? "true" : "false"}
      aria-label={`Care completion for ${card.patientName}`}
    >
      <header className="ccb-card-head">
        <button
          type="button"
          className="ccb-card-disclosure"
          aria-expanded={expanded}
          aria-label={expanded ? `Collapse ${card.patientName}` : `Expand ${card.patientName}`}
          onClick={onToggleExpanded}
        >
          <Icon name={expanded ? "expand_more" : "chevron_right"} size="sm" />
        </button>

        <div className="ccb-card-identity">
          <button
            type="button"
            className="ccb-card-name"
            onClick={onOpenChart}
            title={`Open the chart for ${card.patientName}`}
          >
            {card.patientName}
          </button>
          <span className="ccb-card-mrn">MRN {card.patientMrn}</span>
          {card.focusEncounterDate ? (
            <span className="ccb-card-visit">Visit {card.focusEncounterDate}</span>
          ) : null}
        </div>

        <div className="ccb-card-progress" role="status">
          {closed ? (
            <span className="ccb-progress-closed">
              <Icon name="task_alt" size="sm" />
              <span>All {progress.complete} complete</span>
            </span>
          ) : (
            <span className="ccb-progress-counts">
              <span className="ccb-count ccb-count-done">{progress.complete} done</span>
              {progress.deferred > 0 ? (
                <span className="ccb-count ccb-count-deferred">{progress.deferred} waiting</span>
              ) : null}
              <span className="ccb-count ccb-count-open">{progress.open} open</span>
            </span>
          )}
        </div>

        <Button
          variant="icon"
          size="sm"
          icon="keep_off"
          aria-label={`Clear ${card.patientName} from my worklist`}
          title="Clear from my worklist. The chart, schedule and record are untouched."
          onClick={onUnpin}
        />
      </header>

      {expanded ? (
        card.items.length === 0 ? (
          <p className="ccb-card-empty">
            No care-completion rule currently applies to this patient. Nothing is outstanding here.
          </p>
        ) : (
          <ul className="ccb-card-items">
            {card.items.map((item) => (
              <CareCompletionItemRow
                key={item.itemKey}
                item={item}
                patientName={card.patientName}
                busy={busyItemKey === item.itemKey}
                onOpenWorkflow={onOpenWorkflow}
                onDefer={onDefer}
                onResume={onResume}
                onToggleManual={onToggleManual}
              />
            ))}
          </ul>
        )
      ) : (
        <ul className="ccb-card-chips">
          {card.items.map((item) => (
            <li key={item.itemKey} className={`ccb-chip ccb-chip-${item.state}`} title={item.detail || item.label}>
              {/* Icon and word together: a chip that relied on its colour would
                  be unreadable to a clinician who cannot distinguish them. */}
              <Icon name={CHIP_ICON[item.state]} size="sm" label={`${item.state}:`} />
              <span>{chipLabel(item)}</span>
            </li>
          ))}
          {card.items.length === 0 ? <li className="ccb-chip ccb-chip-none">Nothing outstanding</li> : null}
        </ul>
      )}
    </article>
  );
}
