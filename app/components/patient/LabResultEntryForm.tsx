"use client";

import { useId, useMemo, useState } from "react";
import { clinicalRecordApi } from "../../lib/clinical-record-api";
import { looksLikeVitalSign } from "../../domain/observation-categories";
import { psychiatricLabCatalog } from "../../domain/orders";
import Button from "../ui/Button";

type Interpretation = "" | "normal" | "high" | "low" | "abnormal" | "critical";

function today(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

/**
 * Hand entry of one lab result — a faxed or portal report — into the chart's lab
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
  onSaved: () => void;
  onCancel: () => void;
  onRecordVitals: () => void;
}) {
  const formId = useId();
  const [testName, setTestName] = useState("");
  const [code, setCode] = useState("");
  const [collected, setCollected] = useState(today());
  const [valueText, setValueText] = useState("");
  const [unit, setUnit] = useState("");
  const [referenceRange, setReferenceRange] = useState("");
  const [interpretation, setInterpretation] = useState<Interpretation>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isVital = useMemo(
    () => (testName.trim() || code.trim() ? looksLikeVitalSign({ testName, code }) : false),
    [testName, code],
  );
  const canSave = Boolean(testName.trim() && valueText.trim() && collected) && !isVital && !saving;
  const saveBlockedReason = saving
    ? "Saving the result."
    : isVital
      ? "Vital signs are recorded through the vitals form."
      : "Enter a test name, a result and the collected date.";

  function chooseCatalogTest(name: string) {
    setTestName(name);
    const match = psychiatricLabCatalog.find((lab) => lab.testName === name);
    // Catalog entries that bundle two codes ("24331-1 / 4548-4") are panels of
    // separate results; only a single code is prefilled.
    if (match && !match.loincCode.includes("/")) setCode(match.loincCode);
  }

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setError("");
    try {
      const numeric = Number(valueText.trim());
      await clinicalRecordApi.addLabResult(patientId, {
        testName: testName.trim(),
        code: code.trim() || undefined,
        effectiveAt: collected,
        valueText: valueText.trim(),
        valueNum: valueText.trim() !== "" && Number.isFinite(numeric) ? numeric : undefined,
        unit: unit.trim() || undefined,
        referenceRange: referenceRange.trim() || undefined,
        interpretation: interpretation || undefined,
      });
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The result was not saved. Try again.");
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
        <span>For {patientName}. Saved results go to the lab queue for acknowledgement.</span>
      </div>

      <div className="lab-entry-grid">
        <label className="lab-entry-field is-wide">
          <span>Test name</span>
          <input
            list={`${formId}-tests`}
            value={testName}
            onChange={(event) => chooseCatalogTest(event.target.value)}
            placeholder="e.g. Serum lithium level"
            required
            maxLength={200}
          />
          <datalist id={`${formId}-tests`}>
            {psychiatricLabCatalog.map((lab) => (
              <option key={lab.id} value={lab.testName} />
            ))}
          </datalist>
        </label>
        <label className="lab-entry-field">
          <span>LOINC code (optional)</span>
          <input value={code} onChange={(event) => setCode(event.target.value)} maxLength={20} placeholder="14334-7" />
        </label>
        <label className="lab-entry-field">
          <span>Collected</span>
          <input
            type="date"
            value={collected}
            max={today()}
            onChange={(event) => setCollected(event.target.value)}
            required
          />
        </label>
        <label className="lab-entry-field">
          <span>Result</span>
          <input value={valueText} onChange={(event) => setValueText(event.target.value)} required maxLength={500} placeholder="0.68" />
        </label>
        <label className="lab-entry-field">
          <span>Unit</span>
          <input value={unit} onChange={(event) => setUnit(event.target.value)} maxLength={40} placeholder="mEq/L" />
        </label>
        <label className="lab-entry-field">
          <span>Reference range</span>
          <input value={referenceRange} onChange={(event) => setReferenceRange(event.target.value)} maxLength={200} placeholder="0.60–1.20" />
        </label>
        <label className="lab-entry-field">
          <span>Interpretation</span>
          <select value={interpretation} onChange={(event) => setInterpretation(event.target.value as Interpretation)}>
            <option value="">Not stated</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="low">Low</option>
            <option value="abnormal">Abnormal</option>
            <option value="critical">Critical</option>
          </select>
        </label>
      </div>

      {isVital ? (
        <p className="lab-entry-redirect" role="status">
          This is a vital sign, not a lab result. Vitals have their own form, which checks each measurement and
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
            Save result
          </Button>
        ) : (
          <Button size="sm" variant="primary" type="submit" disabled disabledReason={saveBlockedReason}>
            {saving ? "Saving…" : "Save result"}
          </Button>
        )}
      </div>
    </form>
  );
}
