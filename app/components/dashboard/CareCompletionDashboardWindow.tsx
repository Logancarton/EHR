"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CareCompletionBoard,
  CareCompletionItem,
  CareCompletionPatientCard,
} from "../../domain/care-completion";
import {
  CARE_COMPLETION_CHANGED_EVENT,
  announceCareCompletionChange,
  careCompletionApi,
} from "../../lib/care-completion-api";
import { usePatientRoster } from "../../lib/patient-roster";
import { api } from "../../lib/api-client";
import AsyncSection from "../ui/AsyncSection";
import Button from "../ui/Button";
import Icon from "../ui/Icon";
import CareCompletionPatientCardView from "../care-completion/CareCompletionPatientCard";
import CareCompletionDeferDialog, {
  type CareCompletionDeferSubmit,
} from "../care-completion/CareCompletionDeferDialog";

/**
 * The Care Completion window.
 *
 * It owns fetching, refresh and the two personal mutations, and nothing else:
 * the projection is computed on the server from authoritative records, and the
 * clinical actions its items offer are reached by navigating into the workflows
 * that own them. Nothing in this file can mark clinical work done.
 *
 * Refresh is the behaviour that makes the board trustworthy. A follow-up
 * scheduled anywhere in the EHR has to appear here without the clinician
 * confirming it a second time, so the window listens for the same workspace
 * events the rest of the dashboard already emits and re-reads the projection,
 * in addition to a slow poll for changes made in another session.
 */

const POLL_INTERVAL_MS = 60_000;
const EXPANDED_STORAGE_KEY = "ehr_care_completion_expanded";

/** Workspace events that can change what this board would say. */
const REFRESH_EVENTS = [
  CARE_COMPLETION_CHANGED_EVENT,
  "ehr-appointment-updated",
  "ehr-encounter-signed",
  "ehr-order-cart-updated",
  "ehr-clinical-record-updated",
  "ehr-navigation-complete",
];

export type CareCompletionDashboardWindowProps = {
  onOpenChart: (patientId: string, targetSection?: string) => void;
  /** Reported upward so the window frame can show the open-loop count. */
  onCountsChange?: (counts: { patients: number; open: number; deferred: number }) => void;
};

type LoadStatus = "loading" | "ready" | "error";

export default function CareCompletionDashboardWindow({
  onOpenChart,
  onCountsChange,
}: CareCompletionDashboardWindowProps) {
  const [board, setBoard] = useState<CareCompletionBoard | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [error, setError] = useState<string>("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [expandAll, setExpandAll] = useState<boolean>(false);
  const [pinPickerOpen, setPinPickerOpen] = useState(false);
  const [pinQuery, setPinQuery] = useState("");
  const [pinBusy, setPinBusy] = useState(false);
  const [actionError, setActionError] = useState<string>("");
  const [busyItemKey, setBusyItemKey] = useState<string | null>(null);
  const [deferTarget, setDeferTarget] = useState<{ card: CareCompletionPatientCard; item: CareCompletionItem } | null>(null);
  const [deferSaving, setDeferSaving] = useState(false);
  const [deferError, setDeferError] = useState<string>("");

  const roster = usePatientRoster();
  const pinPickerRef = useRef<HTMLDivElement | null>(null);

  /**
   * Guards against a late response overwriting a newer one.
   *
   * Two refreshes can be in flight at once — a poll and an event — and the
   * slower one must not restore the board the faster one already replaced.
   * Without this a card could briefly show the state of a patient's chart from
   * before the action the clinician just took.
   */
  const requestSeq = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    try {
      setExpandAll(window.localStorage.getItem(EXPANDED_STORAGE_KEY) === "true");
    } catch {
      /* Storage is a convenience here; a private window simply starts compact. */
    }
  }, []);

  const refresh = useCallback(async () => {
    const seq = ++requestSeq.current;
    try {
      const next = await careCompletionApi.board();
      if (!mounted.current || seq !== requestSeq.current) return;
      setBoard(next);
      setStatus("ready");
      setError("");
    } catch (cause) {
      if (!mounted.current || seq !== requestSeq.current) return;
      setStatus("error");
      setError(cause instanceof Error ? cause.message : "The care-completion board could not be loaded.");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const handler = () => void refresh();
    for (const name of REFRESH_EVENTS) window.addEventListener(name, handler);
    const timer = window.setInterval(handler, POLL_INTERVAL_MS);
    return () => {
      for (const name of REFRESH_EVENTS) window.removeEventListener(name, handler);
      window.clearInterval(timer);
    };
  }, [refresh]);

  useEffect(() => {
    if (!pinPickerOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setPinPickerOpen(false);
    }
    function onPointer(event: PointerEvent) {
      if (!pinPickerRef.current?.contains(event.target as Node)) setPinPickerOpen(false);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [pinPickerOpen]);

  const cards = board?.cards ?? [];

  useEffect(() => {
    if (!board) return;
    onCountsChange?.({
      patients: board.cards.length,
      open: board.cards.reduce((total, card) => total + card.progress.open, 0),
      deferred: board.cards.reduce((total, card) => total + card.progress.deferred, 0),
    });
  }, [board, onCountsChange]);

  const pinnedIds = useMemo(() => new Set(cards.map((card) => card.patientId)), [cards]);

  const pinCandidates = useMemo(() => {
    const query = pinQuery.trim().toLowerCase();
    return roster.patients
      .filter((patient) => !pinnedIds.has(patient.id))
      .filter(
        (patient) =>
          !query ||
          patient.name.toLowerCase().includes(query) ||
          patient.mrn.toLowerCase().includes(query),
      )
      .slice(0, 8);
  }, [roster.patients, pinnedIds, pinQuery]);

  const isExpanded = useCallback(
    (patientId: string) => (expandAll ? !expandedIds.has(patientId) : expandedIds.has(patientId)),
    [expandAll, expandedIds],
  );

  const toggleExpanded = useCallback((patientId: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(patientId)) next.delete(patientId);
      else next.add(patientId);
      return next;
    });
  }, []);

  const setExpandAllMode = useCallback((next: boolean) => {
    setExpandAll(next);
    // Per-card overrides are relative to the window mode, so switching modes
    // clears them rather than inverting everything the clinician had open.
    setExpandedIds(new Set());
    try {
      window.localStorage.setItem(EXPANDED_STORAGE_KEY, String(next));
    } catch {
      /* Preference only; the mode still applies for this session. */
    }
  }, []);

  async function runAction(label: string, action: () => Promise<void>) {
    setActionError("");
    try {
      await action();
      announceCareCompletionChange();
      await refresh();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : `${label} failed.`);
    }
  }

  async function handlePin(patientId: string) {
    setPinBusy(true);
    await runAction("Pinning the patient", () => careCompletionApi.pin(patientId, "worklist"));
    setPinBusy(false);
    setPinPickerOpen(false);
    setPinQuery("");
  }

  async function handleUnpin(patientId: string) {
    await runAction("Clearing the patient", () => careCompletionApi.unpin(patientId));
  }

  async function handleResume(card: CareCompletionPatientCard, item: CareCompletionItem) {
    setBusyItemKey(item.itemKey);
    await runAction("Resuming the work item", () =>
      careCompletionApi.resume({
        patientId: card.patientId,
        itemKey: item.itemKey,
        expectedVersion: item.deferral?.version,
      }),
    );
    setBusyItemKey(null);
  }

  /**
   * The one completion this board may write, and only for the one item class
   * that has no other record. Routed through the ordinary task API so it is the
   * same authoritative mutation the Tasks surface performs.
   */
  async function handleToggleManual(card: CareCompletionPatientCard, item: CareCompletionItem) {
    const taskId = item.action?.taskId;
    if (!taskId) return;
    setBusyItemKey(item.itemKey);
    await runAction("Updating the task", async () => {
      await api.tasks.toggle(taskId, card.patientId);
    });
    setBusyItemKey(null);
  }

  async function submitDefer(input: CareCompletionDeferSubmit) {
    if (!deferTarget) return;
    setDeferSaving(true);
    setDeferError("");
    try {
      await careCompletionApi.defer({
        patientId: deferTarget.card.patientId,
        itemKey: deferTarget.item.itemKey,
        reasonCode: input.reasonCode,
        reasonText: input.reasonText,
        resumeAt: input.resumeAt,
        expectedVersion: deferTarget.item.deferral?.version,
      });
      setDeferTarget(null);
      announceCareCompletionChange();
      await refresh();
    } catch (cause) {
      setDeferError(cause instanceof Error ? cause.message : "The deferral could not be recorded.");
    } finally {
      setDeferSaving(false);
    }
  }

  function openWorkflow(card: CareCompletionPatientCard, item: CareCompletionItem) {
    const section = item.action?.targetSection;
    if (!section) return;
    if (section === "Schedule" || section === "Billing") {
      // Neither is a chart section. The schedule is where a follow-up is
      // actually booked, and billing is its own workspace.
      window.dispatchEvent(
        new CustomEvent("ehr-switch-view", { detail: { view: section === "Billing" ? "billing" : "today" } }),
      );
      if (section === "Schedule") onOpenChart(card.patientId, "Schedule");
      return;
    }
    onOpenChart(card.patientId, section);
  }

  const totals = useMemo(() => {
    return cards.reduce(
      (acc, card) => ({
        open: acc.open + card.progress.open,
        deferred: acc.deferred + card.progress.deferred,
        closed: acc.closed + (card.progress.closed ? 1 : 0),
      }),
      { open: 0, deferred: 0, closed: 0 },
    );
  }, [cards]);

  return (
    <div className="ccb-window">
      <div className="ccb-toolbar">
        <div className="ccb-toolbar-summary" role="status">
          {status === "ready" ? (
            cards.length === 0 ? (
              <span>No patients pinned</span>
            ) : (
              <span>
                {cards.length} patient{cards.length === 1 ? "" : "s"} · {totals.open} open
                {totals.deferred > 0 ? ` · ${totals.deferred} waiting` : ""}
                {totals.closed > 0 ? ` · ${totals.closed} closed` : ""}
              </span>
            )
          ) : null}
        </div>

        <div className="ccb-toolbar-actions">
          <Button
            size="sm"
            icon={expandAll ? "unfold_less" : "unfold_more"}
            pressed={expandAll}
            aria-label={expandAll ? "Show compact rows" : "Show full checklists"}
            onClick={() => setExpandAllMode(!expandAll)}
          >
            {expandAll ? "Compact" : "Expand"}
          </Button>

          <div className="ccb-pin-anchor" ref={pinPickerRef}>
            <Button
              size="sm"
              variant="primary"
              icon="push_pin"
              pressed={pinPickerOpen}
              onClick={() => setPinPickerOpen((open) => !open)}
            >
              Pin patient
            </Button>
            {pinPickerOpen ? (
              <div className="ccb-pin-popover" role="dialog" aria-label="Pin a patient to my worklist">
                <label className="ccb-pin-search">
                  <Icon name="search" size="sm" />
                  <input
                    autoFocus
                    type="search"
                    value={pinQuery}
                    placeholder="Search patients you can access"
                    aria-label="Search patients to pin"
                    onChange={(event) => setPinQuery(event.target.value)}
                  />
                </label>
                <p className="ccb-pin-note">
                  Pinning keeps a patient on your personal board. It grants no chart access, adds
                  nobody to the care team, and changes no clinical record.
                </p>
                {roster.status === "loading" ? (
                  <p className="ccb-pin-empty">Loading the patients you can reach…</p>
                ) : pinCandidates.length === 0 ? (
                  <p className="ccb-pin-empty">
                    {pinQuery ? "No accessible patient matches that." : "Every accessible patient is already pinned."}
                  </p>
                ) : (
                  <ul className="ccb-pin-results">
                    {pinCandidates.map((patient) => (
                      <li key={patient.id}>
                        <button type="button" disabled={pinBusy} onClick={() => void handlePin(patient.id)}>
                          <strong>{patient.name}</strong>
                          <small>MRN {patient.mrn}</small>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {actionError ? (
        <p className="ccb-action-error" role="alert">
          <Icon name="error" size="sm" />
          <span>{actionError}</span>
        </p>
      ) : null}

      {board && board.inaccessiblePinCount > 0 ? (
        <p className="ccb-access-note" role="note">
          <Icon name="lock" size="sm" />
          <span>
            {board.inaccessiblePinCount} pinned{" "}
            {board.inaccessiblePinCount === 1 ? "patient is" : "patients are"} no longer accessible to
            you and {board.inaccessiblePinCount === 1 ? "is" : "are"} hidden. A pin is not
            authorization, so no identifying detail is shown.
          </span>
        </p>
      ) : null}

      <AsyncSection
        className="ccb-list"
        loading={status === "loading"}
        error={status === "error" ? error : null}
        isEmpty={cards.length === 0}
        hasLoadedOnce={status !== "loading"}
        loadingMessage="Resolving care completion across your pinned patients…"
        emptyMessage="No patients are pinned to your worklist yet. Pin a patient here, or from the Pin button in a patient's chart header, to keep their open loops in view."
        onRetry={() => void refresh()}
      >
        {cards.map((card) => (
          <CareCompletionPatientCardView
            key={card.patientId}
            card={card}
            expanded={isExpanded(card.patientId)}
            busyItemKey={busyItemKey}
            onToggleExpanded={() => toggleExpanded(card.patientId)}
            onOpenChart={() => onOpenChart(card.patientId, "Overview")}
            onOpenWorkflow={(item) => openWorkflow(card, item)}
            onDefer={(item) => {
              setDeferError("");
              setDeferTarget({ card, item });
            }}
            onResume={(item) => void handleResume(card, item)}
            onToggleManual={(item) => void handleToggleManual(card, item)}
            onUnpin={() => void handleUnpin(card.patientId)}
          />
        ))}
      </AsyncSection>

      {board && board.unavailableRules.length > 0 ? (
        <details className="ccb-unavailable">
          <summary>
            <Icon name="block" size="sm" />
            <span>{board.unavailableRules.length} care-completion rules cannot run here yet</span>
          </summary>
          <ul>
            {board.unavailableRules.map((rule) => (
              <li key={rule.id}>
                <strong>{rule.label}</strong>
                <span>{rule.reason}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {deferTarget ? (
        <CareCompletionDeferDialog
          item={deferTarget.item}
          patientName={deferTarget.card.patientName}
          saving={deferSaving}
          error={deferError || null}
          onCancel={() => setDeferTarget(null)}
          onSubmit={(input) => void submitDefer(input)}
        />
      ) : null}
    </div>
  );
}
