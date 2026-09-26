"use client";

import { useMemo, useState } from "react";
import AsyncSection from "../ui/AsyncSection";
import Button from "../ui/Button";
import Icon from "../ui/Icon";
import StatusBadge from "../ui/StatusBadge";
import { ensurePatientOpen } from "../../lib/workspace-navigation";
import type { StatusTone } from "../../lib/ui-system";
import type { BillingWorkspaceView } from "../../server/services/billing-service";
import { chargeTotalCents } from "../../domain/billing";
import { formatCents } from "../../domain/billing-setup";
import { superbillRefusal } from "../../domain/superbill";
import {
  BILLING_WORKFLOW_STAGE_LABELS,
  BILLING_WORKFLOW_STAGE_ORDER,
  billingWorkflowPriority,
  buildBillingWorkflow,
  daysSinceService,
  nextWorkflowStep,
  workflowAttention,
  workflowProgress,
  type BillingWorkflowItem,
  type BillingWorkflowStage,
  type BillingWorkflowStep,
  type BillingWorkflowStepState,
} from "../../domain/billing-workflow";

/**
 * Billing's workflow view (BILL-05, D-105): the Intake queue pattern applied to
 * the path from a signed note to a reviewed charge.
 *
 * It is a presentation over the same `/api/billing` load the Charges view uses,
 * and it owns no data and no actions of its own. Every write goes through the
 * callbacks `BillingWorkspace` passes in, which are the same ones behind the
 * Charges view's buttons, so the two views cannot drift into different rules.
 *
 * The visual vocabulary is Intake's (`intake-stage-tab`, `iq-card`, the `iqd-`
 * timeline) on purpose: the two queues are the same interaction, and a
 * clinician who has learned one should not have to learn the other.
 */

type ChargeView = BillingWorkspaceView["charges"][number];
type AwaitingRow = BillingWorkspaceView["awaitingCharge"][number];
type WorkflowItem = BillingWorkflowItem<ChargeView, AwaitingRow>;
type SortMode = "priority" | "oldest" | "patient";

const STEP_ICON: Record<BillingWorkflowStepState, string> = {
  recorded: "check",
  review: "priority_high",
  needed: "radio_button_unchecked",
  pending: "more_horiz",
  not_available: "block",
};

const STEP_TONE: Record<BillingWorkflowStepState, StatusTone> = {
  recorded: "success",
  review: "warning",
  needed: "info",
  pending: "neutral",
  not_available: "neutral",
};

const STEP_STATE_LABEL: Record<BillingWorkflowStepState, string> = {
  recorded: "done",
  review: "check",
  needed: "needed",
  pending: "after charge",
  not_available: "not available",
};

const STAGE_TONE: Record<BillingWorkflowStage, StatusTone> = {
  needs_charge: "info",
  coding_incomplete: "warning",
  ready_for_review: "info",
  reviewed: "success",
  void: "neutral",
};

export type BillingWorkflowQueueProps = {
  view: BillingWorkspaceView | null;
  loading: boolean;
  error: string | null;
  hasLoadedOnce: boolean;
  busyId: string | null;
  onRetry: () => void;
  onPrepare: (row: AwaitingRow) => void;
  onReview: (charge: ChargeView) => void;
  onVoid: (charge: ChargeView) => void;
  onSuperbill: (chargeId: string) => void;
  onShowInCharges: (chargeId: string) => void;
  onOpenSetup: () => void;
};

function ageLabel(item: BillingWorkflowItem, now: Date): string {
  const days = daysSinceService(item, now);
  if (days === null) return "Service date not placeable";
  if (days === 0) return "Today";
  return `${days}d since service`;
}

export default function BillingWorkflowQueue(props: BillingWorkflowQueueProps) {
  const { view, loading, error, hasLoadedOnce, onRetry } = props;
  const [stageFilter, setStageFilter] = useState<BillingWorkflowStage | "all">("all");
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("priority");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const items = useMemo(
    () =>
      view
        ? buildBillingWorkflow({
            charges: view.charges,
            awaitingCharge: view.awaitingCharge,
            transport: view.transport,
          })
        : [],
    [view],
  );
  const now = useMemo(() => new Date(), [items]);

  const stageCounts = useMemo(() => {
    const counts = new Map<BillingWorkflowStage, number>();
    for (const item of items) counts.set(item.stage, (counts.get(item.stage) ?? 0) + 1);
    return counts;
  }, [items]);

  // Same rule as Intake (DASH-13): a stage earns a tab when it holds work or is
  // the one being stood on; the rest stay one click away in the overflow.
  const visibleStages = useMemo(
    () =>
      BILLING_WORKFLOW_STAGE_ORDER.filter(
        (stage) => (stageCounts.get(stage) ?? 0) > 0 || stageFilter === stage,
      ),
    [stageCounts, stageFilter],
  );
  const overflowStages = useMemo(
    () => BILLING_WORKFLOW_STAGE_ORDER.filter((stage) => !visibleStages.includes(stage)),
    [visibleStages],
  );

  /** A queue that has not answered has no counts, and unknown is not zero. */
  const countsKnown = hasLoadedOnce && !error && view !== null;

  // Voided charges are finished history; "All" means the work, so they only show
  // under their own stage.
  const allCount = items.filter((item) => item.stage !== "void").length;

  const sorted = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = items.filter((item) => {
      if (stageFilter === "all" ? item.stage === "void" : item.stage !== stageFilter) return false;
      if (!needle) return true;
      return (
        item.patientName.toLowerCase().includes(needle) ||
        item.patientMrn.toLowerCase().includes(needle)
      );
    });
    const copy = [...filtered];
    if (sortMode === "oldest") {
      copy.sort((a, b) => (daysSinceService(b, now) ?? -1) - (daysSinceService(a, now) ?? -1));
    } else if (sortMode === "patient") {
      copy.sort((a, b) => a.patientName.localeCompare(b.patientName));
    } else {
      copy.sort((a, b) => billingWorkflowPriority(b, now) - billingWorkflowPriority(a, now));
    }
    return copy;
  }, [items, stageFilter, query, sortMode, now]);

  // The selection is the encounter, so it survives the charge being prepared and
  // the row moving stages underneath it.
  const selected = selectedKey ? items.find((item) => item.key === selectedKey) ?? null : null;

  return (
    <section
      className={`intake-workspace billing-workflow ${selected ? "has-selection" : ""}`}
      aria-label="Billing workflow"
      data-billing-workflow
    >
      <div className="intake-queue-pane">
        <div className="intake-queue-intro">
          <p className="intake-queue-subtitle">
            From signed note to reviewed charge. Every step is read from the signed record and the
            charge, so nothing here is checked off by hand.
          </p>
        </div>

        <div className="intake-queue-toolbar">
          <div className="intake-stage-filters">
            <div className="intake-stage-tabs">
              <button
                type="button"
                className={`intake-stage-tab ${stageFilter === "all" ? "active" : ""}`}
                onClick={() => setStageFilter("all")}
              >
                All {countsKnown && <span className="count">{allCount}</span>}
              </button>
              {visibleStages.map((stage) => (
                <button
                  key={stage}
                  type="button"
                  className={`intake-stage-tab ${stageFilter === stage ? "active" : ""}`}
                  onClick={() => setStageFilter(stage)}
                  data-billing-stage={stage}
                >
                  {BILLING_WORKFLOW_STAGE_LABELS[stage]}{" "}
                  {countsKnown && <span className="count">{stageCounts.get(stage) ?? 0}</span>}
                </button>
              ))}
            </div>
            {overflowStages.length > 0 && (
              <details className="intake-stage-overflow">
                <summary>
                  {overflowStages.length} more {overflowStages.length === 1 ? "stage" : "stages"}
                </summary>
                <div className="intake-stage-overflow-menu" role="group" aria-label="Other billing stages">
                  {overflowStages.map((stage) => (
                    <button
                      key={stage}
                      type="button"
                      className="intake-stage-overflow-item"
                      onClick={() => setStageFilter(stage)}
                    >
                      <span>{BILLING_WORKFLOW_STAGE_LABELS[stage]}</span>
                      {countsKnown && <span className="count">{stageCounts.get(stage) ?? 0}</span>}
                    </button>
                  ))}
                </div>
              </details>
            )}
          </div>
          <select
            className="intake-sort-select"
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            aria-label="Sort billing workflow"
          >
            <option value="priority">Sort: Practice priority</option>
            <option value="oldest">Sort: Oldest service date</option>
            <option value="patient">Sort: Patient name</option>
          </select>
          <div className="intake-search">
            <input
              type="search"
              placeholder="Search patient or MRN…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search billing workflow"
            />
          </div>
        </div>

        <AsyncSection
          loading={loading}
          error={error}
          isEmpty={sorted.length === 0}
          hasLoadedOnce={hasLoadedOnce}
          loadingMessage="Loading billing workflow…"
          emptyMessage={
            items.length === 0
              ? "No signed encounters are waiting on billing."
              : "Nothing in billing matches this filter."
          }
          onRetry={onRetry}
        >
          <ul className="intake-card-list">
            {sorted.map((item) => (
              <WorkflowCard
                key={item.key}
                item={item}
                now={now}
                selected={selected?.key === item.key}
                onSelect={() => setSelectedKey(item.key)}
              />
            ))}
          </ul>
        </AsyncSection>
      </div>

      {selected ? (
        <WorkflowDetail
          // Remount when the row changes stage, so the panel opens on its new next
          // step instead of the one that was just completed.
          key={`${selected.key}:${selected.stage}`}
          item={selected}
          now={now}
          {...props}
          onClose={() => setSelectedKey(null)}
        />
      ) : null}
    </section>
  );
}

function WorkflowCard({
  item,
  now,
  selected,
  onSelect,
}: {
  item: WorkflowItem;
  now: Date;
  selected: boolean;
  onSelect: () => void;
}) {
  const progress = workflowProgress(item.steps);
  const next = nextWorkflowStep(item.steps);
  const attention = workflowAttention(item.steps);
  const codes = item.charge
    ? item.charge.procedureCodes.map((line) => line.code)
    : item.awaiting?.cptCode
      ? [item.awaiting.cptCode]
      : [];
  const total = item.charge ? chargeTotalCents(item.charge.procedureCodes) : null;

  return (
    <li>
      <div
        className={`iq-card ${selected ? "selected" : ""}`}
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect();
          }
        }}
        data-workflow-key={item.key}
        data-workflow-stage={item.stage}
      >
        <div className="iq-card-top">
          <div className="iq-card-identity">
            <span className="iq-card-name">{item.patientName}</span>
            <span className="iq-card-when">
              {item.encounterType || "Encounter"} · {item.serviceDate || "no service date"} · {ageLabel(item, now)}
            </span>
          </div>
          <div className="iq-progress">
            {progress.complete} of {progress.total} complete
          </div>
        </div>

        <div className="iq-card-meta">
          <span>
            <Icon name="badge" size="sm" label="MRN" />
            {item.patientMrn || "No MRN"}
          </span>
          <span>
            <Icon name="receipt_long" size="sm" label="Procedure" />
            {codes.length > 0 ? codes.join(", ") : "No procedure code"}
          </span>
          {item.charge ? (
            <span>
              <Icon name="payments" size="sm" label="Billed at practice fees" />
              {total === null ? "No billed total" : formatCents(total)}
            </span>
          ) : null}
          {attention.map((step) => (
            <span key={step.id} className="billing-workflow-attention">
              <Icon name="priority_high" size="sm" label="Needs attention" />
              {step.label}
            </span>
          ))}
        </div>

        <div className="iq-card-footer">
          <span className="iq-blocker">
            {next
              ? `Next: ${next.label} (${next.owner})`
              : item.stage === "void"
                ? "Voided — no further work"
                : "Reviewed — claim submission is not available here"}
          </span>
          <span>{BILLING_WORKFLOW_STAGE_LABELS[item.stage]}</span>
        </div>
      </div>
    </li>
  );
}

function WorkflowDetail({
  item,
  now,
  busyId,
  onClose,
  onPrepare,
  onReview,
  onVoid,
  onSuperbill,
  onShowInCharges,
  onOpenSetup,
}: BillingWorkflowQueueProps & { item: WorkflowItem; now: Date; onClose: () => void }) {
  const next = nextWorkflowStep(item.steps);
  const [activeStepId, setActiveStepId] = useState<BillingWorkflowStep["id"] | null>(next?.id ?? null);
  const activeStep = activeStepId ? item.steps.find((step) => step.id === activeStepId) : undefined;
  const progress = workflowProgress(item.steps);
  const charge = item.charge;
  function prepare() {
    if (item.awaiting) onPrepare(item.awaiting);
  }

  function stepAction(step: BillingWorkflowStep) {
    if (step.id === "charge" && item.awaiting) {
      return (
        <Button
          size="sm"
          icon="receipt_long"
          loading={busyId === item.encounterId}
          onClick={prepare}
        >
          Prepare charge
        </Button>
      );
    }
    if ((step.id === "procedure" || step.id === "diagnosis" || step.id === "coverage") && step.state !== "recorded") {
      return (
        <Button size="sm" icon="open_in_new" onClick={() => void ensurePatientOpen(item.patientId)}>
          Open chart
        </Button>
      );
    }
    if (step.id === "fees" && step.state === "review") {
      return (
        <Button size="sm" icon="tune" onClick={onOpenSetup}>
          Open practice setup
        </Button>
      );
    }
    if (step.id === "review" && charge && step.state === "needed") {
      return charge.reviewable ? (
        <Button size="sm" icon="fact_check" loading={busyId === charge.id} onClick={() => onReview(charge)}>
          Mark reviewed
        </Button>
      ) : (
        <Button
          size="sm"
          icon="fact_check"
          disabled
          disabledReason={charge.blockers[0]?.message ?? "This charge cannot be reviewed."}
        >
          Mark reviewed
        </Button>
      );
    }
    if (step.id === "submission") {
      return (
        <Button size="sm" icon="send" disabled disabledReason={step.detail}>
          Submit claim
        </Button>
      );
    }
    return null;
  }


  const superbillReason = charge ? superbillRefusal(charge) : "A superbill needs a reviewed charge.";

  return (
    <div className="intake-detail-pane billing-workflow-detail" data-workflow-detail={item.key}>
      <div className="iqd-header">
        <div className="iqd-header-top">
          <button
            type="button"
            className="iq-card-name"
            onClick={() => void ensurePatientOpen(item.patientId)}
            title="Open full chart"
          >
            {item.patientName}
          </button>
          <Button variant="icon" size="sm" icon="close" aria-label="Close" onClick={onClose} />
        </div>
        <StatusBadge tone={STAGE_TONE[item.stage]}>{BILLING_WORKFLOW_STAGE_LABELS[item.stage]}</StatusBadge>
        <div className="iqd-note-meta">
          {item.patientMrn} · {item.encounterType || "Encounter"} · {item.serviceDate || "no service date"} ·{" "}
          {ageLabel(item, now)}
        </div>
      </div>

      <section className="iqd-progress-section" aria-label="Billing progress">
        <div className="iqd-progress-heading">
          <div>
            <span className="iqd-progress-kicker">Billing progress</span>
            <span className="iqd-progress-help">
              Select any step to see what is on record and where its fix lives.
            </span>
          </div>
          <span className="iqd-progress-count">
            {progress.complete} of {progress.total} complete
          </span>
        </div>

        <div className="iqd-timeline">
          {item.steps.map((step, index) => (
            <button
              key={step.id}
              type="button"
              className={`iqd-step-row iqd-timeline-step state-${step.state} ${activeStepId === step.id ? "is-active" : ""}`}
              aria-expanded={activeStepId === step.id}
              title={step.detail}
              onClick={() => setActiveStepId((current) => (current === step.id ? null : step.id))}
              data-workflow-step={step.id}
              data-workflow-step-state={step.state}
            >
              <span className="iqd-timeline-marker" aria-hidden="true">
                <span className="iqd-timeline-node">
                  <Icon name={STEP_ICON[step.state]} size="sm" filled={step.state === "recorded"} />
                </span>
                {index < item.steps.length - 1 ? <span className="iqd-timeline-connector" /> : null}
              </span>
              <span className="iqd-timeline-label">{step.shortLabel}</span>
              <span className="iqd-timeline-state">{STEP_STATE_LABEL[step.state]}</span>
              <span className="iqd-sr-step-label">{step.label}</span>
            </button>
          ))}
        </div>

        {activeStep ? (
          <div className="iqd-step-workspace">
            <div className="iqd-step-workspace-head">
              <div>
                <h3>{activeStep.label}</h3>
                <p>{activeStep.detail}</p>
              </div>
              <div className="iqd-step-workspace-actions">
                <StatusBadge tone={STEP_TONE[activeStep.state]} shape="pill">
                  {STEP_STATE_LABEL[activeStep.state]}
                </StatusBadge>
                <Button
                  variant="icon"
                  size="sm"
                  icon="close"
                  aria-label="Close step"
                  onClick={() => setActiveStepId(null)}
                />
              </div>
            </div>
            <div className="iqd-inline-panel billing-workflow-step-panel">
              <span className="billing-unavailable-note">Resolved by: {activeStep.owner}</span>
              {stepAction(activeStep)}
            </div>
          </div>
        ) : null}
      </section>

      {charge ? (
        <div className="iqd-section">
          <h3>Charge</h3>
          <dl className="billing-workflow-facts">
            <dt>Procedure</dt>
            <dd>
              {charge.procedureCodes.length === 0
                ? "None on the signed record"
                : charge.procedureCodes
                    .map(
                      (line) =>
                        `${line.code}${line.modifiers?.length ? `-${line.modifiers.join("-")}` : ""} · ${
                          typeof line.feeCents === "number" ? formatCents(line.feeCents) : "no practice fee"
                        }`,
                    )
                    .join("; ")}
            </dd>
            <dt>Diagnoses</dt>
            <dd>
              {charge.diagnosisCodes.length === 0
                ? "None coded"
                : charge.diagnosisCodes.map((code) => `${code.code} ${code.display}`).join("; ")}
            </dd>
            <dt>Billed at practice fees</dt>
            <dd>
              {chargeTotalCents(charge.procedureCodes) === null
                ? "Not computable — a line has no fee"
                : formatCents(chargeTotalCents(charge.procedureCodes)!)}
            </dd>
            <dt>Expected and collected</dt>
            <dd className="billing-unavailable-note">Unavailable until payer remittance exists.</dd>
          </dl>
        </div>
      ) : null}

      <div className="iqd-section">
        <h3>Actions</h3>
        <div className="inspector-actions">
          {/* The open step already offers its own action; offering it twice is repetition. */}
          {item.awaiting && activeStepId !== "charge" ? (
            <Button
              size="sm"
              icon="receipt_long"
              loading={busyId === item.encounterId}
              onClick={prepare}
            >
              Prepare charge
            </Button>
          ) : null}
          {charge && charge.status === "prepared" && activeStepId !== "review" ? (
            charge.reviewable ? (
              <Button size="sm" icon="fact_check" loading={busyId === charge.id} onClick={() => onReview(charge)}>
                Mark reviewed
              </Button>
            ) : (
              <Button
                size="sm"
                icon="fact_check"
                disabled
                disabledReason={charge.blockers[0]?.message ?? "This charge cannot be reviewed."}
              >
                Mark reviewed
              </Button>
            )
          ) : null}
          {charge ? (
            superbillReason === null ? (
              <Button size="sm" icon="description" onClick={() => onSuperbill(charge.id)}>
                Superbill
              </Button>
            ) : (
              <Button size="sm" icon="description" disabled disabledReason={superbillReason}>
                Superbill
              </Button>
            )
          ) : null}
          {charge ? (
            <Button size="sm" variant="secondary" icon="table_rows" onClick={() => onShowInCharges(charge.id)}>
              Show in Charges
            </Button>
          ) : null}
          {charge && charge.status !== "void" ? (
            <Button
              size="sm"
              variant="secondary"
              icon="block"
              loading={busyId === `${charge.id}-void`}
              onClick={() => onVoid(charge)}
            >
              Void charge
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
