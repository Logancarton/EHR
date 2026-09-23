"use client";

import type { PatientToolScope } from "../../lib/companion-tool-scope";
import Icon from "../ui/Icon";

export default function PatientToolScopeBanner({
  scope,
}: {
  scope: PatientToolScope;
}) {
  const icon =
    scope.status === "active"
      ? "verified_user"
      : scope.status === "inactive"
        ? "push_pin"
        : "person_off";

  return (
    <div
      className={`patient-tool-scope-banner is-${scope.status}`}
      data-tool-scope={scope.status}
      role="status"
      aria-live="polite"
    >
      <span className="patient-tool-scope-icon" aria-hidden="true">
        <Icon name={icon} size="sm" />
      </span>
      <div>
        <div className="patient-tool-scope-title">
          <strong>{scope.boundPatient?.patientName ?? "No patient bound"}</strong>
          <span>{scope.badge}</span>
        </div>
        <small>{scope.explanation}</small>
      </div>
    </div>
  );
}
