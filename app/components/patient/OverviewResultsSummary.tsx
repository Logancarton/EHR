"use client";

import { useEffect, useState } from "react";
import type { ObservationRecord } from "../../domain/clinical-records";
import { latestLaboratoryObservations } from "../../domain/overview-labs";
import { api } from "../../lib/api-client";
import { formatClinicalDate } from "../../lib/clinical-date";
import { subscribeWorkspaceEvent, WORKSPACE_ORDER_CREATED_EVENT } from "../../lib/workspace-events";
import Button from "../ui/Button";
import AsyncSection from "../ui/AsyncSection";

type Order = Awaited<ReturnType<typeof api.orders.list>>[number];

export default function OverviewResultsSummary({ patientId, observations, onReview }: {
  patientId: string; observations: ObservationRecord[]; onReview: () => void;
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
  function resultRow(item: ObservationRecord) {
    return <li key={item.id}>
      <strong>{item.test_name}</strong> — {[item.value_text || item.value_num, item.unit].filter((value) => value !== null && value !== "").join(" ") || "Value not recorded"}
      <p>{formatClinicalDate(item.effective_at)} · {item.status}{item.interpretation ? ` · ${item.interpretation}` : ""}{item.reference_range ? ` · Reference: ${item.reference_range}` : ""}</p>
      <p className="overview-record-date">{item.acknowledged_at ? `Reviewed ${formatClinicalDate(item.acknowledged_at)}` : "No review recorded"} · Source: {item.source_system}{item.source_ref ? ` · ${item.source_ref}` : ""}</p>
    </li>;
  }
  return <div className="overview-results-grid">
    <section aria-label="Latest lab results">
      <h3>Latest recorded results</h3>
      {latest.length === 0 ? <p>No laboratory results recorded.</p> : <>
        <ul>{latest.slice(0, 4).map(resultRow)}</ul>
        {latest.length > 4 && <details><summary>More results ({latest.length - 4})</summary><ul>{latest.slice(4).map(resultRow)}</ul></details>}
      </>}
    </section>
    <section aria-label="Outstanding lab orders">
      <h3>Orders without a linked final result</h3>
      <AsyncSection loading={!currentState} error={error} isEmpty={false} hasLoadedOnce={Boolean(currentState?.orders)} loadingMessage="Loading lab orders…" emptyMessage="" onRetry={() => setReloadKey((key) => key + 1)}>
        {outstanding.length === 0 ? <p>No lab orders without a linked final result in the loaded records.</p> : <ul>{outstanding.map((order) => <li key={order.id}>
          <strong>{order.name}</strong>
          <p>{order.status.replaceAll("_", " ")} · {formatClinicalDate(order.createdAt)} · No linked final result</p>
        </li>)}</ul>}
      </AsyncSection>
      <Button size="sm" variant="secondary" onClick={onReview}>Review labs and orders</Button>
    </section>
  </div>;
}
