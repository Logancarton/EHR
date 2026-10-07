"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { clinicalRecordApi } from "../../lib/clinical-record-api";
import { looksLikeVitalSign } from "../../domain/observation-categories";
import { psychiatricLabCatalog } from "../../domain/orders";
import Button from "../ui/Button";
import { practiceToday } from "../../lib/practice-calendar";
import { api } from "../../lib/api-client";
import { newLabReportRef } from "../../domain/lab-result-groups";

type Interpretation = "" | "normal" | "high" | "low" | "abnormal" | "critical";

type AnalyteDraft = {
  key: number;
  testName: string;
  code: string;
  valueText: string;
  unit: string;
  referenceRange: string;
  interpretation: Interpretation;
};

const blankAnalyte = (key: number): AnalyteDraft => ({
  key,
  testName: "",
  code: "",
  valueText: "",
  unit: "",
  referenceRange: "",
  interpretation: "",
});

type LinkableOrder = { id: string; name: string; createdAt: string };

/**
 * Hand entry of a lab report — one result or a whole panel —  — a faxed or portal report — into the chart's lab
 * record. It writes a laboratory observation through the same `add_observation`
 * action the server validates, and it lands in the lab queue for acknowledgement
 * like any other result. A vital sign is redirected to the vitals form before
 * it can be saved, and the server refuses one regardless.
 */
export default function LabResultEntryForm({
  patientId,
  patientName,
  onSaved,
  onCancel,
  onRecordVitals,
}: {
  patientId: string;
  patientName: string;
  onSaved: (savedCount: number) => void;
  onCancel: () => void;
  onRecordVitals: () => void;
}) {
  const formId = useId();
  const [collected, setCollected] = useState(practiceToday);
  const [analytes, setAnalytes] = useState<AnalyteDraft[]>(() => [blankAnalyte(0)]);
  const [nextKey, setNextKey] = useState(1);
  const [orderId, setOrderId] = useState("");
  const [orders, setOrders] = useState<LinkableOrder[]>([]);
  // One reference per form, kept across a retry, so a report saved in two
  // attempts still files as one result set.
  const [reportRef] = useState(newLabReportRef);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    // Orders a result can answer: lab orders that have left the cart. A failed
    // load leaves only "No linked order", which is still a valid entry.
    api.orders
      .list(patientId)
      .then((rows) => {
        if (cancelled) return;
        setOrders(
          rows
            .filter((order) => order.type === "lab" && order.status !== "staged" && order.patientId === patientId)
            .map((order) => ({ id: order.id, name: order.name, createdAt: order.createdAt })),
        );
      })
      .catch(() => {
        if (!cancelled) setOrders([]);
      });
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  const vitalIndex = useMemo(
    () => analytes.findIndex(({ testName, code }) => (testName.trim() || code.trim() ? looksLikeVitalSign({ testName, code }) : false)),
    [analytes],
  );
  const isVital = vitalIndex >= 0;
  const complete = analytes.every((row) => row.testName.trim() && row.valueText.trim());
  const canSave = complete && Boolean(collected) && !isVital && !saving;
  const saveBlockedReason = saving
    ? "Saving the result."
    : isVital
      ? "Vital signs are recorded through the vitals form."
      : analytes.length > 1
        ? "Enter a test name and a result for every row, and the collected date."
        : "Enter a test name, a result and the collected date.";
  const saveLabel = analytes.length > 1 ? `Save ${analytes.length} results` : "Save result";

  function updateAnalyte(key: number, patch: Partial<AnalyteDraft>) {
    setAnalytes((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function chooseCatalogTest(key: number, name: string) {
    const match = psychiatricLabCatalog.find((lab) => lab.testName === name);
    // Catalog entries that bundle two codes ("24331-1 / 4548-4") are panels of
    // separate results; only a single code is prefilled.
    // A different test must never inherit the previous test's code.
    updateAnalyte(key, { testName: name, code: match && !match.loincCode.includes("/") ? match.loincCode : "" });
  }

  function addAnalyte() {
    setAnalytes((rows) => [...rows, blankAnalyte(nextKey)]);
    setNextKey((key) => key + 1);
  }

  function removeAnalyte(key: number) {
    setAnalytes((rows) => (rows.length > 1 ? rows.filter((row) => row.key !== key) : rows));
  }

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setError("");
    const grouped = analytes.length > 1 || Boolean(orderId);
    let saved = 0;
    try {
      for (const row of analytes) {
        const numeric = Number(row.valueText.trim());
        await clinicalRecordApi.addLabResult(patientId, {
          testName: row.testName.trim(),
          code: row.code.trim() || undefined,
          effectiveAt: collected,
          valueText: row.valueText.trim(),
          valueNum: row.valueText.trim() !== "" && Number.isFinite(numeric) ? numeric : undefined,
          unit: row.unit.trim() || undefined,
          referenceRange: row.referenceRange.trim() || undefined,
          interpretation: row.interpretation || undefined,
          orderId: orderId || undefined,
          reportRef: grouped && !orderId ? reportRef : undefined,
        });
        saved += 1;
        // A saved row leaves the form, so a retry after a failure cannot file it twice.
        setAnalytes((rows) => (rows.length > 1 ? rows.filter((candidate) => candidate.key !== row.key) : rows));
      }
      onSaved(saved);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "The result was not saved. Try again.";
      setError(saved > 0 ? `${saved} saved; the rest were not. ${message}` : message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="lab-entry-form"
      aria-label={`Record a lab result for ${patientName}`}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div className="lab-entry-heading">
        <strong>Record a lab result</strong>
        <span>
          For {patientName}. Add every result from the same report here — they are filed and reviewed together.
          Saved results go to the lab queue for acknowledgement.
        </span>
      </div>

      <div className="lab-entry-grid">
        <label className="lab-entry-field">
          <span>Collected</span>
          <input
            type="date"
            value={collected}
            max={practiceToday()}
            onChange={(event) => setCollected(event.target.value)}
            required
          />
        </label>
        <label className="lab-entry-field is-wide">
          <span>Linked order (optional)</span>
          <select value={orderId} onChange={(event) => setOrderId(event.target.value)}>
            <option value="">No linked order</option>
            {orders.map((order) => (
              <option key={order.id} value={order.id}>
                {order.name} · ordered {order.createdAt.slice(0, 10)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <datalist id={`${formId}-tests`}>
        {psychiatricLabCatalog.map((lab) => (
          <option key={lab.id} value={lab.testName} />
        ))}
      </datalist>

      {analytes.map((row, index) => {
        // The first row keeps the plain names; later rows tell a screen reader which result they are.
        const suffix = index === 0 ? "" : ` (result ${index + 1})`;
        return (
          <fieldset key={row.key} className="lab-entry-analyte">
            {analytes.length > 1 ? (
              <legend>
                Result {index + 1}
                <button
                  type="button"
                  className="lab-entry-link"
                  aria-label={`Remove result ${index + 1}`}
                  onClick={() => removeAnalyte(row.key)}
                >
                  Remove
                </button>
              </legend>
            ) : null}
            <div className="lab-entry-grid">
              <label className="lab-entry-field is-wide">
                <span>Test name</span>
                <input
                  aria-label={suffix ? `Test name${suffix}` : undefined}
                  list={`${formId}-tests`}
                  value={row.testName}
                  onChange={(event) => chooseCatalogTest(row.key, event.target.value)}
                  placeholder="e.g. Serum lithium level"
                  required
                  maxLength={200}
                />
              </label>
              <label className="lab-entry-field">
                <span>LOINC code (optional)</span>
                <input aria-label={suffix ? `LOINC code${suffix}` : undefined} value={row.code} onChange={(event) => updateAnalyte(row.key, { code: event.target.value })} maxLength={20} placeholder="14334-7" />
              </label>
              <label className="lab-entry-field">
                <span>Result</span>
                <input aria-label={suffix ? `Result${suffix}` : undefined} value={row.valueText} onChange={(event) => updateAnalyte(row.key, { valueText: event.target.value })} required maxLength={500} placeholder="0.68" />
              </label>
              <label className="lab-entry-field">
                <span>Unit</span>
                <input aria-label={suffix ? `Unit${suffix}` : undefined} value={row.unit} onChange={(event) => updateAnalyte(row.key, { unit: event.target.value })} maxLength={40} placeholder="mEq/L" />
              </label>
              <label className="lab-entry-field">
                <span>Reference range</span>
                <input aria-label={suffix ? `Reference range${suffix}` : undefined} value={row.referenceRange} onChange={(event) => updateAnalyte(row.key, { referenceRange: event.target.value })} maxLength={200} placeholder="0.60–1.20" />
              </label>
              <label className="lab-entry-field">
                <span>Interpretation</span>
                <select aria-label={suffix ? `Interpretation${suffix}` : undefined} value={row.interpretation} onChange={(event) => updateAnalyte(row.key, { interpretation: event.target.value as Interpretation })}>
                  <option value="">Not stated</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="low">Low</option>
                  <option value="abnormal">Abnormal</option>
                  <option value="critical">Critical</option>
                </select>
              </label>
            </div>
          </fieldset>
        );
      })}

      <div>
        <button type="button" className="lab-entry-link" onClick={addAnalyte}>
          + Add another result from this report
        </button>
      </div>

      {isVital ? (
        <p className="lab-entry-redirect" role="status">
          {analytes.length > 1 ? `Result ${vitalIndex + 1} is a vital sign, not a lab result. ` : "This is a vital sign, not a lab result. "}
          Vitals have their own form, which checks each measurement and
          keeps them on the vitals flowsheet.{" "}
          <button type="button" className="lab-entry-link" onClick={onRecordVitals}>
            Record vitals instead
          </button>
        </p>
      ) : null}
      {error ? (
        <p className="lab-entry-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="lab-entry-actions">
        <Button size="sm" onClick={onCancel}>
          Cancel
        </Button>
        {canSave ? (
          <Button size="sm" variant="primary" type="submit">
            {saveLabel}
          </Button>
        ) : (
          <Button size="sm" variant="primary" type="submit" disabled disabledReason={saveBlockedReason}>
            {saving ? "Saving…" : saveLabel}
          </Button>
        )}
      </div>
    </form>
  );
}
