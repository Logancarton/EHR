"use client";

import { useEffect, useRef, useState } from "react";
import {
  CARE_COMPLETION_DEFERRAL_REASONS,
  type CareCompletionDeferralReasonCode,
  type CareCompletionItem,
} from "../../domain/care-completion";
import Button from "../ui/Button";
import Icon from "../ui/Icon";
import { InlineError } from "../ui/AsyncSection";

/**
 * Recording why a piece of work is waiting.
 *
 * The dialog states what it is about to do in the clinician's own terms — this
 * patient, this item, this reason — because a deferral is an explanation
 * somebody may have to stand behind later. It says plainly, on the face of the
 * dialog, that deferring does not complete anything: that is the single
 * misunderstanding this whole feature has to avoid.
 */

export type CareCompletionDeferSubmit = {
  reasonCode: CareCompletionDeferralReasonCode;
  reasonText?: string;
  resumeAt?: string;
};

const QUICK_RESUME: ReadonlyArray<{ label: string; days: number }> = [
  { label: "Tomorrow", days: 1 },
  { label: "In 3 days", days: 3 },
  { label: "In 1 week", days: 7 },
  { label: "In 1 month", days: 30 },
];

function isoDay(offsetDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

export default function CareCompletionDeferDialog({
  item,
  patientName,
  saving,
  error,
  onCancel,
  onSubmit,
}: {
  item: CareCompletionItem;
  patientName: string;
  saving: boolean;
  error?: string | null;
  onCancel: () => void;
  onSubmit: (input: CareCompletionDeferSubmit) => void;
}) {
  const [reasonCode, setReasonCode] = useState<CareCompletionDeferralReasonCode>(
    item.ruleId === "follow-up-appointment" ? "patient-checking-schedule" : "waiting-for-patient",
  );
  const [reasonText, setReasonText] = useState("");
  const [resumeAt, setResumeAt] = useState("");
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const firstFieldRef = useRef<HTMLSelectElement | null>(null);

  useEffect(() => {
    firstFieldRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCancel();
      }
    }
    // The dialog holds typed work, so Escape cancels it explicitly rather than
    // being routed through the generic dismissal helper, which is for surfaces
    // that lose nothing when they close.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel]);

  const requiresText = reasonCode === "other";
  const canSubmit = !saving && (!requiresText || reasonText.trim().length > 0);

  return (
    <div className="ccb-defer-backdrop" role="presentation">
      <div
        className="ccb-defer-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`Defer ${item.label} for ${patientName}`}
        ref={dialogRef}
      >
        <header className="ccb-defer-head">
          <h3>
            <Icon name="pause_circle" size="sm" />
            <span>Defer this work</span>
          </h3>
          <Button variant="icon" size="sm" icon="close" aria-label="Cancel deferral" onClick={onCancel} />
        </header>

        <dl className="ccb-defer-summary">
          <div>
            <dt>Patient</dt>
            <dd>{patientName}</dd>
          </div>
          <div>
            <dt>Work item</dt>
            <dd>{item.label}</dd>
          </div>
        </dl>

        <p className="ccb-defer-warning">
          <Icon name="info" size="sm" />
          <span>
            Deferring records why this is waiting. It does not complete the work, and it stays on
            the board as unresolved until the authoritative workflow closes it.
          </span>
        </p>

        <label className="ccb-defer-field">
          <span>Reason</span>
          <select
            ref={firstFieldRef}
            value={reasonCode}
            onChange={(event) => setReasonCode(event.target.value as CareCompletionDeferralReasonCode)}
          >
            {CARE_COMPLETION_DEFERRAL_REASONS.map((reason) => (
              <option key={reason.code} value={reason.code}>
                {reason.label}
              </option>
            ))}
          </select>
        </label>

        <label className="ccb-defer-field">
          <span>{requiresText ? "Explain (required)" : "Add detail (optional)"}</span>
          <textarea
            value={reasonText}
            rows={2}
            maxLength={500}
            placeholder="e.g. patient is checking their work schedule and will call back"
            onChange={(event) => setReasonText(event.target.value)}
          />
        </label>

        <div className="ccb-defer-field">
          <span>Bring it back</span>
          <div className="ccb-defer-quick">
            {QUICK_RESUME.map((option) => {
              const value = isoDay(option.days);
              return (
                <Button
                  key={option.label}
                  size="sm"
                  pressed={resumeAt === value}
                  onClick={() => setResumeAt(resumeAt === value ? "" : value)}
                >
                  {option.label}
                </Button>
              );
            })}
          </div>
          <input
            type="date"
            className="ccb-defer-date"
            value={resumeAt}
            aria-label="Resume date"
            onChange={(event) => setResumeAt(event.target.value)}
          />
        </div>

        {error ? <InlineError message={error} /> : null}

        <footer className="ccb-defer-actions">
          <Button size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={saving}
            loadingLabel="Recording…"
            {...(canSubmit
              ? {
                  onClick: () =>
                    onSubmit({
                      reasonCode,
                      reasonText: reasonText.trim() || undefined,
                      resumeAt: resumeAt || undefined,
                    }),
                }
              : { disabled: true as const, disabledReason: "Explain the reason before deferring." })}
          >
            Defer
          </Button>
        </footer>
      </div>
    </div>
  );
}
