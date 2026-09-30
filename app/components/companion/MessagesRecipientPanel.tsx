"use client";

import { useEffect, useId, useMemo, useState } from "react";
import type { Patient } from "../../domain/patient";
import { api } from "../../lib/api-client";
import PatientMessages, { type MessageSubject } from "../patient/PatientMessages";
import type { ScopedDraftStore } from "../../lib/use-scoped-drafts";
import { useAuthSession } from "../auth/AuthSessionGate";

type Recipient = MessageSubject & { kind: "chart" | "intake" };

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Messages on a canvas that is not a chart (Intake, Dashboard, a practice module).
 *
 * The companion used to say "return to a patient chart" here, so the Intake
 * workspace — where first contact happens — could not write to anyone. The
 * recipient is chosen explicitly: a chart open behind this canvas is never
 * assumed (the cross-patient rule in `deriveWorkspaceCanvasContext`). Intake
 * contacts are offered alongside charts; their thread is kept with the intake
 * record and moves into the chart when they are promoted.
 *
 * The choice is remembered per canvas, so returning to Intake returns to the
 * conversation that was open there.
 */
export default function MessagesRecipientPanel({
  canvasTabId,
  roster,
  onToast,
  replyDraftStore,
  openThreadStore,
}: {
  canvasTabId: string;
  roster: readonly Patient[];
  onToast?: (message: string) => void;
  replyDraftStore?: ScopedDraftStore<string>;
  openThreadStore?: ScopedDraftStore<string>;
}) {
  const selectId = useId();
  // Chart conversations are clinical (D-051); front desk works with intake
  // contacts, whose conversations are administrative (D-112).
  const { hasPermission } = useAuthSession();
  const canReadCharts = hasPermission("read_clinical");
  const [intakeContacts, setIntakeContacts] = useState<Recipient[]>([]);
  const [intakeState, setIntakeState] = useState<"loading" | "loaded" | "error">("loading");
  const [chosenByCanvas, setChosenByCanvas] = useState<Record<string, string>>({});

  // Re-read when the picker is opened: a contact promoted a moment ago belongs
  // under Patients, and writing to their old intake record is refused.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api.intake
      .queue()
      .then((rows) => {
        if (cancelled) return;
        const seen = new Set<string>();
        const contacts: Recipient[] = [];
        for (const row of rows) {
          // Someone already promoted is messaged through their chart, below.
          if (!row.prospectivePersonId || row.patientId || seen.has(row.prospectivePersonId)) continue;
          seen.add(row.prospectivePersonId);
          contacts.push({
            id: row.prospectivePersonId,
            name: row.patientName,
            initials: initialsOf(row.patientName),
            kind: "intake",
          });
        }
        setIntakeContacts(contacts.sort((a, b) => a.name.localeCompare(b.name)));
        setIntakeState("loaded");
      })
      .catch(() => {
        if (!cancelled) setIntakeState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const chartRecipients = useMemo<Recipient[]>(
    () =>
      !canReadCharts
        ? []
        : [...roster]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((patient) => ({ id: patient.id, name: patient.name, initials: patient.initials, mrn: patient.mrn, kind: "chart" })),
    [roster, canReadCharts],
  );

  const chosenId = chosenByCanvas[canvasTabId] ?? "";
  const recipient =
    intakeContacts.find((contact) => contact.id === chosenId) ??
    chartRecipients.find((patient) => patient.id === chosenId) ??
    null;

  return (
    <div className="messages-recipient-panel">
      <div className="messages-recipient-picker">
        <label htmlFor={selectId}>Message</label>
        <select
          id={selectId}
          value={recipient?.id ?? ""}
          onFocus={() => setReloadKey((key) => key + 1)}
          onChange={(event) =>
            setChosenByCanvas((current) => ({ ...current, [canvasTabId]: event.target.value }))
          }
        >
          <option value="">Choose who to write to…</option>
          {intakeContacts.length > 0 && (
            <optgroup label="Intake contacts (no chart yet)">
              {intakeContacts.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.name}
                </option>
              ))}
            </optgroup>
          )}
          {chartRecipients.length > 0 && (
            <optgroup label="Patients">
              {chartRecipients.map((patient) => (
                <option key={patient.id} value={patient.id}>
                  {patient.name}
                  {patient.mrn ? ` · ${patient.mrn}` : ""}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        {!canReadCharts && (
          <small className="messages-recipient-note">Patient chart conversations need clinical access; intake contacts are listed.</small>
        )}
        {intakeState === "error" && (
          <small role="alert">Intake contacts could not be loaded; only charted patients are listed.</small>
        )}
      </div>

      {recipient ? (
        <PatientMessages
          key={recipient.id}
          patient={recipient}
          subjectKind={recipient.kind}
          onToast={onToast}
          replyDraftStore={replyDraftStore}
          openThreadStore={openThreadStore}
        />
      ) : (
        <div className="companion-empty-state">
          <p>
            Choose an intake contact or a patient to read or start a conversation. A chart open behind this
            workspace is not assumed.
          </p>
        </div>
      )}
    </div>
  );
}
