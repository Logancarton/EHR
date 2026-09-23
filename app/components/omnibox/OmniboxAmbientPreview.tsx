"use client";

import type { OmniboxPlan } from "../../domain/omnibox";
import type { Section } from "../../domain/patient";
import Button from "../ui/Button";
import Icon from "../ui/Icon";

type OmniboxAmbientPreviewProps = {
  plan: OmniboxPlan;
  onOpenPatient: (patientId: string, section?: Section) => void;
  onOpenStagedOrderComposer: (
    patientId: string,
    tab: "cart" | "prescribe" | "labs",
    prefill?: string,
  ) => void;
  onDismiss: () => void;
};

function isMedicationQuestion(plan: OmniboxPlan): boolean {
  return plan.intent.kind === "clinical_question"
    && /\b(?:medication|medications|meds|taking|regimen)\b/i.test(plan.intent.question);
}

function keepFocus(event: React.MouseEvent<HTMLButtonElement>) {
  // The search input has a delayed blur dismissal. Keeping focus there prevents
  // the card disappearing between mousedown and click while an action is chosen.
  event.preventDefault();
}

export default function OmniboxAmbientPreview({
  plan,
  onOpenPatient,
  onOpenStagedOrderComposer,
  onDismiss,
}: OmniboxAmbientPreviewProps) {
  const patient = plan.patient.resolved;
  const medicationQuestion = isMedicationQuestion(plan);

  if (plan.clarification) {
    return (
      <div className="ambient-clinical-preview is-error" data-omnibox-ambient-preview="clarification">
        <span className="ambient-preview-kicker"><Icon name="help" /> Clarification required</span>
        <p className="ambient-preview-answer">{plan.clarification.message}</p>
        <small className="ambient-preview-safety">No chart fact was inferred and no action was taken.</small>
      </div>
    );
  }

  if (!plan.answer) {
    return (
      <div className="ambient-clinical-preview is-error" data-omnibox-ambient-preview="unanswered">
        <span className="ambient-preview-kicker"><Icon name="warning" /> Could not retrieve</span>
        <p className="ambient-preview-answer">
          This question could not be answered from the authorized record context. No example or fallback fact was substituted.
        </p>
        <small className="ambient-preview-safety">Clinical mutation: none</small>
      </div>
    );
  }

  if (medicationQuestion && patient) {
    const medicationEvidence = plan.evidence.filter((item) => item.sourceRef.length > 0);

    return (
      <section className="ambient-clinical-preview" data-omnibox-ambient-preview="medications" aria-label="Active medication answer">
        <div className="ambient-preview-header">
          <div>
            <span className="ambient-preview-kicker"><Icon name="medication" /> Clinical AI · grounded answer</span>
            <div className="ambient-preview-title">
              <strong>{patient.name} — Active Medications ({medicationEvidence.length})</strong>
            </div>
          </div>
          <span className="ambient-preview-badge">
            {plan.patient.switchRequired ? "Named patient · chart unchanged" : "Authorized record"}
          </span>
        </div>

        {medicationEvidence.length ? (
          <ul className="ambient-medication-list">
            {medicationEvidence.map((item) => (
              <li key={`${item.sourceRef}:${item.label}`}>
                <div className="ambient-medication-main">
                  <strong>{item.label}</strong>
                  <span>Active regimen</span>
                </div>
                <span className="ambient-preview-provenance" data-omnibox-provenance="true">
                  <Icon name="verified" size="sm" />
                  <code>{item.sourceRef}</code>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="ambient-preview-answer">{plan.answer}</p>
        )}

        <div className="ambient-preview-actions">
          <Button
            size="sm"
            onMouseDown={keepFocus}
            onClick={() => {
              onOpenPatient(patient.id, "Meds");
              onDismiss();
            }}
          >
            Open Meds Tab
          </Button>
          <Button
            size="sm"
            data-order-route="staged-cart-only"
            onMouseDown={keepFocus}
            onClick={() => {
              // This shortcut opens only the local staging composer. Transport
              // remains behind the cart's separate review/attestation boundary.
              onOpenStagedOrderComposer(patient.id, "prescribe");
              onDismiss();
            }}
          >
            Stage Refill…
          </Button>
          <Button
            size="sm"
            onMouseDown={keepFocus}
            onClick={() => {
              onOpenPatient(patient.id, "Labs");
              onDismiss();
            }}
          >
            Review Monitoring
          </Button>
        </div>

        <small className="ambient-preview-safety">
          Read-only preview · provenance attached · Stage Refill opens the staged Orders Cart only; no vendor transmission occurs from this shortcut
        </small>
      </section>
    );
  }

  return (
    <section className="ambient-clinical-preview" data-omnibox-ambient-preview="answer" aria-label="Clinical AI answer">
      <div className="ambient-preview-header">
        <div>
          <span className="ambient-preview-kicker"><Icon name="auto_awesome" /> Clinical AI · grounded answer</span>
          <div className="ambient-preview-title">
            <strong>{patient ? patient.name : "Clinical answer"}</strong>
          </div>
        </div>
        <span className="ambient-preview-badge">Read only</span>
      </div>
      <p className="ambient-preview-answer">{plan.answer}</p>
      {plan.evidence.length ? (
        <div className="ambient-preview-evidence">
          {plan.evidence.slice(0, 4).map((item) => (
            <span key={`${item.sourceRef}:${item.label}`} data-omnibox-provenance="true">
              {item.label} · {item.sourceRef}
            </span>
          ))}
        </div>
      ) : null}
      {plan.navigation && patient ? (
        <div className="ambient-preview-actions">
          <Button
            size="sm"
            onMouseDown={keepFocus}
            onClick={() => {
              const section: Section =
                plan.navigation?.section === "labs" ? "Labs"
                  : plan.navigation?.section === "medications" ? "Meds"
                    : plan.navigation?.section === "messages" ? "Messages"
                      : plan.navigation?.section === "history" ? "History"
                        : plan.navigation?.section === "encounter" ? "Encounter"
                          : "Overview";
              onOpenPatient(patient.id, section);
              onDismiss();
            }}
          >
            {plan.navigation.label}
          </Button>
        </div>
      ) : null}
      <small className="ambient-preview-safety">Clinical mutation: none</small>
    </section>
  );
}
