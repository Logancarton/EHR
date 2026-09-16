"use client";

import { useState } from "react";
import { clinicalRecordApi, type EncounterAddendumRecord } from "../../lib/clinical-record-api";
import { useAuthSession } from "../auth/AuthSessionGate";
import Icon from "../ui/Icon";

type SignedEncounterRecord = {
  id: string;
  date: string;
  type: string;
  chiefComplaint: string;
  intervalHistory: string;
  reviewOfSymptoms: string;
  treatmentResponse: string;
  sideEffects: string;
  mse: Record<string, string>;
  assessment: string;
  riskAssessment: string;
  followUp: string;
  plan: string;
  cptCode: string;
  emLevel: string;
  signedBy?: string;
  signedAt?: string;
};

function NoteSection({ label, value }: { label: string; value?: string }) {
  if (!value?.trim()) return null;
  return (
    <section style={{ marginTop: 10 }}>
      <strong>{label}</strong>
      <p style={{ whiteSpace: "pre-wrap", margin: "4px 0 0" }}>{value}</p>
    </section>
  );
}

export default function SignedEncounterHistoryItem({
  patientId,
  encounter,
  canInsertPlan,
  onInsertPlan,
}: {
  patientId: string;
  encounter: SignedEncounterRecord;
  canInsertPlan: boolean;
  onInsertPlan: () => void;
}) {
  const { hasPermission } = useAuthSession();
  const canAmend = hasPermission("amend_signed_record");
  const [addenda, setAddenda] = useState<EncounterAddendumRecord[]>([]);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [composerOpen, setComposerOpen] = useState(false);
  const [addendumType, setAddendumType] = useState<"addendum" | "amendment">("addendum");
  const [body, setBody] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function loadAddenda() {
    if (loadState === "loading" || loadState === "loaded") return;
    setLoadState("loading");
    try {
      setAddenda(await clinicalRecordApi.encounterAddenda(patientId, encounter.id));
      setLoadState("loaded");
    } catch {
      setLoadState("error");
    }
  }

  async function saveCorrection() {
    if (!body.trim() || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await clinicalRecordApi.addEncounterAddendum(patientId, encounter.id, {
        body,
        reason: reason || undefined,
        addendumType,
      });
      setAddenda((current) => [...current, saved]);
      setLoadState("loaded");
      setBody("");
      setReason("");
      setAddendumType("addendum");
      setComposerOpen(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Correction could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <details
      className="drawer-result-item signed-encounter-history-item"
      data-history-encounter-id={encounter.id}
      onToggle={(event) => {
        if (event.currentTarget.open) void loadAddenda();
      }}
    >
      <summary style={{ cursor: "pointer" }}>
        <span className="result-header">
          <strong>{encounter.type}{encounter.cptCode ? ` · ${encounter.cptCode}` : ""}</strong>
          <time>{encounter.date}</time>
        </span>
        <span style={{ display: "block", marginTop: 4 }}>
          {encounter.chiefComplaint || "Signed encounter"} · {encounter.signedBy || "Authenticated clinician"}
        </span>
      </summary>

      <div style={{ marginTop: 12 }}>
        <p><strong>Signed legal record · original note remains immutable.</strong></p>
        {encounter.signedAt && <p>Signed {encounter.signedAt}</p>}
        <NoteSection label="Chief complaint" value={encounter.chiefComplaint} />
        <NoteSection label="Interval history" value={encounter.intervalHistory} />
        <NoteSection label="Review of symptoms" value={encounter.reviewOfSymptoms} />
        <NoteSection label="Treatment response" value={encounter.treatmentResponse} />
        <NoteSection label="Side effects" value={encounter.sideEffects} />
        {Object.keys(encounter.mse || {}).length > 0 && (
          <section style={{ marginTop: 10 }}>
            <strong>Mental status exam</strong>
            <p style={{ whiteSpace: "pre-wrap", margin: "4px 0 0" }}>
              {Object.entries(encounter.mse)
                .filter(([, value]) => Boolean(value?.trim()))
                .map(([key, value]) => `${key}: ${value}`)
                .join("\n")}
            </p>
          </section>
        )}
        <NoteSection label="Assessment" value={encounter.assessment} />
        <NoteSection label="Risk assessment" value={encounter.riskAssessment} />
        <NoteSection label="Plan" value={encounter.plan} />
        <NoteSection label="Follow-up" value={encounter.followUp} />

        <section style={{ marginTop: 14 }}>
          <strong>Addenda & amendments</strong>
          {loadState === "loading" && <p role="status">Loading corrections…</p>}
          {loadState === "error" && (
            <p role="alert">
              Corrections could not be loaded.{" "}
              <button type="button" onClick={() => { setLoadState("idle"); void loadAddenda(); }}>Retry</button>
            </p>
          )}
          {loadState === "loaded" && addenda.length === 0 && <p>No addenda or amendments recorded.</p>}
          {addenda.map((item) => (
            <article key={item.id} style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border-subtle, #d9dde3)" }}>
              <strong>{item.addendumType === "amendment" ? "Amendment" : "Addendum"}</strong>
              <small style={{ display: "block" }}>{item.createdAt}{item.createdBy ? ` · ${item.createdBy}` : ""}</small>
              <p style={{ whiteSpace: "pre-wrap" }}>{item.body}</p>
              {item.reason && <p><strong>Reason:</strong> {item.reason}</p>}
            </article>
          ))}
        </section>

        {canAmend && !composerOpen && (
          <button type="button" onClick={() => setComposerOpen(true)}>
            <Icon name="edit_note" /> Add correction
          </button>
        )}

        {canAmend && composerOpen && (
          <form
            style={{ marginTop: 12 }}
            onSubmit={(event) => {
              event.preventDefault();
              void saveCorrection();
            }}
          >
            <p style={{ marginTop: 0 }}>
              Addenda add information after signing. Amendments correct the record without rewriting the original signed snapshot.
            </p>
            <label style={{ display: "block" }}>
              Correction type
              <select
                aria-label="Correction type"
                value={addendumType}
                onChange={(event) => setAddendumType(event.target.value as "addendum" | "amendment")}
              >
                <option value="addendum">Addendum</option>
                <option value="amendment">Amendment</option>
              </select>
            </label>
            <label style={{ display: "block", marginTop: 8 }}>
              Correction text
              <textarea
                aria-label="Correction text"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                rows={4}
              />
            </label>
            <label style={{ display: "block", marginTop: 8 }}>
              Reason (optional)
              <input
                aria-label="Reason (optional)"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
            {saveError && <p role="alert">{saveError}</p>}
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button type="submit" disabled={!body.trim() || saving}>
                {saving ? "Saving…" : "Save correction"}
              </button>
              <button type="button" onClick={() => { setComposerOpen(false); setSaveError(null); }} disabled={saving}>
                Cancel
              </button>
            </div>
          </form>
        )}

        {canInsertPlan && encounter.plan && (
          <button type="button" onClick={onInsertPlan} style={{ marginTop: 10 }}>
            <Icon name="content_paste" /> Insert Plan to Current Draft
          </button>
        )}
      </div>
    </details>
  );
}
