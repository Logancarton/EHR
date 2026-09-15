"use client";

import type { Section } from "../../domain/patient";
import type { OmniboxPlan, OmniboxProposal, OmniboxSurface } from "../../domain/omnibox";
import Icon from "../ui/Icon";

/**
 * How a planner result is shown, wherever it was asked for.
 *
 * Extracted from `OmniboxPlannerBridge` so the workspace omnibox and the home
 * launcher render one answer shape from one authenticated boundary. They used to
 * differ completely: the workspace crossed the server planner, while the home
 * screen ran a `query.includes(...)` ladder in the browser that returned invented
 * lab values, PHQ-9 scores and refill requests for named patients. Two answer
 * surfaces meant two truth standards, and only one of them was true.
 *
 * The rules this card is built around:
 *
 * - **Every branch is reachable and none of them is a sample.** An answer, a
 *   clarification, a refusal and a failure each render differently, because a
 *   clinician has to be able to tell "here is what the record says" from "I could
 *   not retrieve this".
 * - **An unanswered request says so.** `planIsUnanswered` covers the case the
 *   planner understood but could not ground; it renders an explicit "could not be
 *   retrieved" rather than leaving the card blank, because an empty card reads as
 *   "nothing found" — which is itself a claim about the chart.
 * - **Navigation is the host's job.** The workspace drives its own DOM; the home
 *   launcher opens a chart through its own callback. The card asks, it does not
 *   navigate.
 */

export type OmniboxPlanCardProps = {
  plan: OmniboxPlan | null;
  loading: boolean;
  error: string;
  onClose: () => void;
  /**
   * Open a chart at a section. The host decides how navigation actually happens.
   *
   * `Section` rather than `string`: the chart's own section vocabulary is the
   * contract, so a surface the planner names that no chart renders is a type error
   * here instead of a click that lands nowhere.
   */
  onOpenPatient: (patientId: string, section: Section) => void;
  onOpenTasks: () => void;
  /** Shown above the card body; hosts describe their own surface. */
  title?: string;
};

export function workspaceSectionForSurface(surface: OmniboxSurface): Section {
  switch (surface) {
    case "encounter": return "Encounter";
    case "labs": return "Labs";
    case "medications": return "Meds";
    case "messages": return "Messages";
    case "history": return "History";
    default: return "Overview";
  }
}

export function proposalReviewSection(proposal: OmniboxProposal): Section {
  if (proposal.type === "stage_order") return proposal.parameters.orderType === "lab" ? "Labs" : "Meds";
  if (proposal.type === "draft_patient_message") return "Messages";
  return "Overview";
}

/**
 * Whether this plan told the clinician anything at all.
 *
 * A plan with no answer, no navigation, no proposal, no restricted action and no
 * clarification is a request the planner could not serve. Rendering that as an
 * empty card would let silence stand in for a finding.
 */
export function planIsUnanswered(plan: OmniboxPlan): boolean {
  return (
    !plan.answer &&
    !plan.navigation &&
    !plan.clarification &&
    !plan.restrictedAction &&
    plan.proposals.length === 0
  );
}

export default function OmniboxPlanCard({
  plan,
  loading,
  error,
  onClose,
  onOpenPatient,
  onOpenTasks,
  title,
}: OmniboxPlanCardProps) {
  return (
    <div className="omnibox-plan-card" data-omnibox-plan-card="true">
      <div className="omnibox-plan-header">
        <div>
          <span className="omnibox-plan-kicker"><Icon name="auto_awesome" /> Clinical AI · review boundary</span>
          <strong>{loading ? "Understanding request…" : title || "Review planned intent"}</strong>
        </div>
        <button type="button" onClick={onClose} aria-label="Close AI plan">×</button>
      </div>

      {error ? (
        <div className="omnibox-plan-error" role="alert" data-omnibox-plan-error="true">
          {error}
        </div>
      ) : null}

      {plan ? (
        <div className="omnibox-plan-body">
          <div className="omnibox-plan-meta">
            <span>Intent: {plan.intent.kind.replaceAll("_", " ")}</span>
            <span>Confidence: {Math.round(plan.confidence * 100)}%</span>
            <span>Execution: not executed</span>
          </div>

          {plan.patient.resolved ? (
            <div className="omnibox-plan-patient">
              <strong>Patient: {plan.patient.resolved.name}</strong>
              <span>
                {plan.patient.resolved.source === "mentioned_patient"
                  ? "Explicitly resolved from request"
                  : "Using active patient workspace"}
              </span>
              {plan.patient.switchRequired ? (
                <em>
                  Different from the active patient. Any future mutation remains blocked until patient
                  context is confirmed.
                </em>
              ) : null}
            </div>
          ) : null}

          {plan.clarification ? (
            <div className="omnibox-plan-blocked" data-omnibox-plan-clarification="true">
              <strong>Clarification required</strong>
              <p>{plan.clarification.message}</p>
              {plan.clarification.candidates?.length ? (
                <small>
                  Possible matches: {plan.clarification.candidates.map((candidate) => candidate.name).join(", ")}
                </small>
              ) : null}
            </div>
          ) : null}

          {plan.answer ? (
            <div className="omnibox-plan-answer" data-omnibox-plan-answer="true">
              <strong>Answer</strong>
              <p>{plan.answer}</p>
              {plan.evidence.length ? (
                <div className="omnibox-plan-evidence">
                  {plan.evidence.slice(0, 4).map((item) => (
                    <span key={`${item.sourceRef}:${item.label}`}>{item.label} · {item.sourceRef}</span>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {/*
            The request was understood and produced nothing. Said out loud, because
            a card that simply ends here reads as an answer of "nothing", which is
            itself a claim about the record.
          */}
          {planIsUnanswered(plan) ? (
            <div className="omnibox-plan-blocked" data-omnibox-plan-unanswered="true">
              <strong>Could not be retrieved</strong>
              <p>
                This request could not be answered from the records you have access to. Nothing was
                inferred and no example was substituted. Open the relevant chart or queue to look
                directly.
              </p>
            </div>
          ) : null}

          {plan.navigation ? (
            <div className="omnibox-plan-action-row">
              <div><strong>Suggested navigation</strong><span>{plan.navigation.label}</span></div>
              <button
                type="button"
                onClick={() => {
                  const navigation = plan.navigation!;
                  const section = navigation.target === "last_encounter"
                    ? "History"
                    : workspaceSectionForSurface(navigation.section);
                  onOpenPatient(navigation.patientId, section);
                }}
              >Open</button>
            </div>
          ) : null}

          {plan.proposals.map((proposal) => (
            <div className={`omnibox-plan-action-row ${proposal.blockedReason ? "blocked" : ""}`} key={proposal.id}>
              <div>
                <strong>{proposal.description}</strong>
                <span>
                  {proposal.permission === "allowed"
                    ? "Review required"
                    : `Permission denied · ${proposal.requiredPermission}`}
                </span>
                {proposal.blockedReason ? <small>{proposal.blockedReason.replaceAll("_", " ")}</small> : null}
              </div>
              <button
                type="button"
                disabled={proposal.permission === "denied"}
                onClick={() => {
                  if (proposal.type === "create_task") {
                    onOpenTasks();
                    return;
                  }
                  onOpenPatient(proposal.resolvedPatientId, proposalReviewSection(proposal));
                }}
              >Review</button>
            </div>
          ))}

          {plan.restrictedAction ? (
            <div className="omnibox-plan-restricted">
              <strong>Restricted consequential action</strong>
              <p>{plan.restrictedAction.description}</p>
              <span>
                {plan.restrictedAction.permission === "denied"
                  ? "You do not have the required permission."
                  : "The request was understood, but AI planning cannot perform this action. Explicit human confirmation remains required in the authoritative workflow."}
              </span>
            </div>
          ) : null}

          <div className="omnibox-plan-safety">
            <span>Clinical mutation: none</span>
            {plan.context ? (
              <span>
                Context: {plan.context.surface} · {plan.context.estimatedTokens} est. tokens
                {plan.context.isTruncated ? " · bounded/truncated" : ""}
              </span>
            ) : (
              <span>Clinical context: not assembled</span>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
