"use client";

import { useEffect, useState } from "react";
import type { ObservationRecord } from "../../domain/clinical-records";
import { latestLaboratoryObservations } from "../../domain/overview-labs";
import { api } from "../../lib/api-client";
import { formatClinicalDate } from "../../lib/clinical-date";
import { formatLabValue } from "../../lib/lab-value-presentation";
import { describeRecordSource } from "../../lib/record-source-presentation";
import { subscribeWorkspaceEvent, WORKSPACE_ORDER_CREATED_EVENT } from "../../lib/workspace-events";
import AsyncSection from "../ui/AsyncSection";
import { OverviewLine, SourceNote, type OverviewTone } from "./OverviewParts";

type Order = Awaited<ReturnType<typeof api.orders.list>>[number];

const VISIBLE_RESULTS = 4;

/** Recorded interpretation only; a value is never re-graded here. */
function resultTone(item: ObservationRecord): OverviewTone | undefined {
  const flag = item.interpretation?.trim().toLowerCase();
  if (flag === "critical") return "critical";
  if (flag === "abnormal" || flag === "high" || flag === "low") return "warning";
  return undefined;
}

export default function OverviewResultsSummary({ patientId, observations, expanded = false }: {
  patientId: string; observations: ObservationRecord[];
  /** The section's saved "Expand all details" setting. */
  expanded?: boolean;
}) {
  const [state, setState] = useState<{ patientId: string; reloadKey: number; orders: Order[] | null; error: string | null } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => subscribeWorkspaceEvent(WORKSPACE_ORDER_CREATED_EVENT, (detail) => {
    if (detail.patientId === patientId) setReloadKey((key) => key + 1);
  }), [patientId]);
  useEffect(() => {
    let cancelled = false;
    api.orders.list(patientId).then((orders) => {
      if (orders.some((order) => order.patientId !== patientId)) throw new Error("Order patient mismatch");
      if (!cancelled) setState({ patientId, reloadKey, orders: orders.filter((order) => order.type === "lab"), error: null });
    }).catch(() => { if (!cancelled) setState({ patientId, reloadKey, orders: null, error: "Lab orders could not be loaded. Outstanding-order status is unavailable." }); });
    return () => { cancelled = true; };
  }, [patientId, reloadKey]);
  const currentState = state?.patientId === patientId && state.reloadKey === reloadKey ? state : null;
  const error = currentState?.error ?? null;
  const results = observations.filter((item) => item.patient_id === patientId && item.category === "laboratory" && item.status !== "entered-in-error" && item.status !== "cancelled")
    .sort((a, b) => b.effective_at.localeCompare(a.effective_at));
  const latest = latestLaboratoryObservations(results);
  const outstanding = currentState?.orders ? currentState.orders.filter((order) => !results.some((result) => result.order_id === order.id && ["final", "amended", "corrected"].includes(result.status))) : [];

  function resultLine(item: ObservationRecord) {
    const value = formatLabValue(item.value_text || (item.value_num === null ? "" : String(item.value_num)), item.unit) || "Value not recorded";
    const tone = resultTone(item);
    return <OverviewLine key={item.id} open={expanded} tone={tone} meta={formatClinicalDate(item.effective_at)} detail={<>
      <p>{item.status}{item.interpretation ? ` · ${item.interpretation}` : ""}{item.reference_range ? ` · Reference: ${item.reference_range}` : ""}</p>
      <p>{item.acknowledged_at ? `Reviewed ${formatClinicalDate(item.acknowledged_at)}` : "No review recorded"}</p>
      <SourceNote>Source: {describeRecordSource(null, item.source_system)}{item.source_ref ? ` · ${item.source_ref}` : ""}</SourceNote>
    </>}>
      <strong>{item.test_name}</strong> <span className="ov-value">{value}</span>
      {tone && <span className="ov-flag">{item.interpretation}</span>}
    </OverviewLine>;
  }

  return <div className="ov-stack">
    <section aria-label="Latest lab results" className="ov-stack">
      {latest.length === 0 ? <p className="ov-empty">No laboratory results recorded.</p> : <>
        {latest.slice(0, VISIBLE_RESULTS).map(resultLine)}
        {latest.length > VISIBLE_RESULTS && <details className="ov-more" open={expanded}><summary>{latest.length - VISIBLE_RESULTS} more results</summary>
          <div className="ov-stack">{latest.slice(VISIBLE_RESULTS).map(resultLine)}</div>
        </details>}
      </>}
    </section>
    <section aria-label="Outstanding lab orders" className="ov-subsection">
      <AsyncSection loading={!currentState} error={error} isEmpty={false} hasLoadedOnce={Boolean(currentState?.orders)} loadingMessage="Loading lab orders…" emptyMessage="" onRetry={() => setReloadKey((key) => key + 1)}>
        {outstanding.length === 0 ? <p className="ov-empty">No open lab orders</p> : outstanding.map((order) => (
          <OverviewLine key={order.id} tone="warning" meta={formatClinicalDate(order.createdAt)}>
            <strong>{order.name}</strong> <span className="ov-value">{order.status.replaceAll("_", " ")} · No linked final result</span>
          </OverviewLine>
        ))}
      </AsyncSection>
    </section>
  </div>;
}
