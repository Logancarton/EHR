"use client";

import PrescriptionOperationsWorkspace from "../PrescriptionOperationsWorkspace";
import CompanionPanelHeader from "./CompanionPanelHeader";
import Icon from "../ui/Icon";

/**
 * Prescribing as a companion (UI-7d, D-090).
 *
 * The queue is a cross-patient attention list — prescriptions whose transport
 * outcome is unknown, interrupted, failed, conflicted or stuck in callback
 * processing — and every action it offers is gated on the patient's chart being
 * the *active* execution context. A full-canvas module and a chart cannot both
 * own the active tab, so the queue could never execute its own actions from its
 * own surface. The companion layer is the one that coexists with an open chart,
 * which is the whole reason this is the owner.
 *
 * Both presentations render the same `PrescriptionOperationsWorkspace` the module
 * renders, at two densities: D-089's contract, and here it is more than a
 * convention. A companion summary that reimplemented the queue's retry and
 * evidence rules could disagree with the authoritative one about what a clinician
 * is allowed to do to a prescription, which is not a class of bug this area can
 * carry.
 */
export default function PrescribingPanel({
  onClose,
  onUnpin,
  isExpanded = false,
  onExpand,
  onRedock,
  onOpenWorkspace,
}: {
  onClose: () => void;
  onUnpin?: () => void;
  isExpanded?: boolean;
  onExpand?: () => void;
  onRedock?: () => void;
  onOpenWorkspace?: () => void;
}) {
  return (
    <aside
      className={`companion-panel ${isExpanded ? "companion-expanded-canvas" : ""}`}
      data-companion-panel="prescribing"
      data-companion-presentation={isExpanded ? "expanded" : "docked"}
      aria-label="Prescribing operations"
    >
      <CompanionPanelHeader
        title="Prescribing"
        // Named for what the queue holds rather than for prescribing in general.
        // Writing a prescription happens in the chart; this is the practice-level
        // question no number of open charts answers — which of them never reached
        // a pharmacy.
        context="Prescriptions needing attention"
        icon="prescriptions"
        iconStyle={{ background: "#fce8e6", color: "#c5221f" }}
        onClose={onClose}
        onUnpin={onUnpin}
        unpinLabel="Unpin Prescribing"
        isExpanded={isExpanded}
        onExpand={onExpand}
        onRedock={onRedock}
      />

      <div className="prescribing-companion-body">
        <PrescriptionOperationsWorkspace presentation={isExpanded ? "workspace" : "companion"} />
      </div>

      {/*
        The queue is also a workspace tab, and was reachable as one from the
        Clinical menu until UI-7d. This keeps that path rather than stranding a
        saved layout that has the module open.
      */}
      {onOpenWorkspace && (
        <button type="button" className="comm-launch-workspace-btn" onClick={onOpenWorkspace}>
          <Icon name="fullscreen" size="sm" />
          <span>Open Full Prescribing Workspace</span>
        </button>
      )}
    </aside>
  );
}
