"use client";

import type { PatientToolScope } from "../../lib/companion-tool-scope";
import Icon from "../ui/Icon";

/**
 * Names the patient a companion tool is bound to. While that chart is the one in
 * front of the clinician the banner is a single quiet line — name, identifiers
 * and the binding state — because repeating an explanation nobody needs is how a
 * panel ends up showing the same name four times. Once the binding and the
 * foreground disagree, it expands to say why the tool is parked.
 */
export default function PatientToolScopeBanner({
  scope,
  detail,
}: {
  scope: PatientToolScope;
  /** Identifiers shown beside the name, e.g. "MRN · DOB". */
  detail?: string;
}) {
  const icon =
    scope.status === "active"
      ? "verified_user"
      : scope.status === "inactive"
        ? "push_pin"
        : "person_off";
  const compact = scope.status === "active";

  return (
    <div
      className={`patient-tool-scope-banner is-${scope.status} ${compact ? "is-compact" : ""}`}
      data-tool-scope={scope.status}
      role="status"
      aria-live="polite"
      title={compact ? scope.explanation : undefined}
    >
      <span className="patient-tool-scope-icon" aria-hidden="true">
        <Icon name={icon} size="sm" />
      </span>
      <div>
        <div className="patient-tool-scope-title">
          <strong>{scope.boundPatient?.patientName ?? "No patient bound"}</strong>
          {detail ? <span className="patient-tool-scope-detail">{detail}</span> : null}
          <span className="patient-tool-scope-badge">{scope.badge}</span>
        </div>
        {compact ? null : <small>{scope.explanation}</small>}
      </div>
    </div>
  );
}
