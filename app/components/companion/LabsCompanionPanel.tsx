"use client";

import { useEffect, useMemo, useState } from "react";
import type { Patient } from "../../domain/patient";
import { psychiatricLabCatalog, type LabOrder } from "../../domain/orders";
import type {
  LabOrderDraftInput,
  StageLabOrderResult,
} from "../../lib/use-staged-orders";
import CompanionPanelFrame from "./CompanionPanelFrame";
import Icon from "../ui/Icon";
import PatientToolScopeBanner from "./PatientToolScopeBanner";
import { derivePatientToolScope } from "../../lib/companion-tool-scope";
import type { WorkspaceCanvasContext } from "../../lib/workspace-canvas-context";

type LabsCompanionPanelProps = {
  roster?: readonly Patient[];
  activePatient?: Patient | null;
  workspaceContext: WorkspaceCanvasContext;
  onStageLabFor?: (patientId: string, input: LabOrderDraftInput) => StageLabOrderResult;
  stagedOrderCountFor?: (patientId: string) => number;
  onReviewOrdersFor?: (patientId: string) => void;
  onClose: () => void;
  onUnpin?: () => void;
  isExpanded?: boolean;
  onExpand?: () => void;
  onRedock?: () => void;
};

/**
 * Patient-specific diagnostic ordering that can stay beside any primary workspace.
 *
 * The panel writes only to the same staged-order cart used by the patient chart.
 * That gives the clinician a true "order from anywhere" workflow without creating
 * another authorization path or a second source of order truth.
 */
export default function LabsCompanionPanel({
  roster = [],
  activePatient,
  workspaceContext,
  onStageLabFor,
  stagedOrderCountFor,
  onReviewOrdersFor,
  onClose,
  onUnpin,
  isExpanded = false,
  onExpand,
  onRedock,
}: LabsCompanionPanelProps) {
  const [selectedPatientId, setSelectedPatientId] = useState(activePatient?.id ?? "");
  const [selectedLabId, setSelectedLabId] = useState(psychiatricLabCatalog[0]?.id ?? "");
  const [priority, setPriority] = useState<LabOrder["priority"]>(
    psychiatricLabCatalog[0]?.defaultPriority ?? "Routine",
  );
  const [fastingRequired, setFastingRequired] = useState(
    psychiatricLabCatalog[0]?.fastingRequired ?? false,
  );
  const [targetFacility, setTargetFacility] = useState<LabOrder["targetFacility"]>(
    "Quest Diagnostics",
  );
  const [indication, setIndication] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  // Opening Labs from inside a chart should start on that patient. Once the clinician
  // deliberately chooses somebody else, later chart changes do not steal the panel.
  useEffect(() => {
    if (!selectedPatientId && activePatient?.id) setSelectedPatientId(activePatient.id);
  }, [activePatient?.id, selectedPatientId]);

  const selectedPatient = useMemo(
    () => roster.find((candidate) => candidate.id === selectedPatientId) ?? null,
    [roster, selectedPatientId],
  );
  const selectedLab = useMemo(
    () => psychiatricLabCatalog.find((lab) => lab.id === selectedLabId) ?? psychiatricLabCatalog[0],
    [selectedLabId],
  );
  const stagedCount =
    selectedPatient && stagedOrderCountFor ? stagedOrderCountFor(selectedPatient.id) : 0;
  const toolScope = derivePatientToolScope({
    workspaceContext,
    boundPatient: selectedPatient
      ? { patientId: selectedPatient.id, patientName: selectedPatient.name }
      : null,
  });

  useEffect(() => {
    if (!selectedLab) return;
    setPriority(selectedLab.defaultPriority);
    setFastingRequired(selectedLab.fastingRequired);
    setStatusMessage("");
  }, [selectedLab]);

  useEffect(() => {
    if (!selectedPatient) {
      setIndication("");
      return;
    }
    setIndication(selectedPatient.diagnoses[0] || "Psychiatric Protocol Surveillance");
    setStatusMessage("");
  }, [selectedPatient]);

  function stageOrder() {
    if (!selectedPatient || !selectedLab || !onStageLabFor || !toolScope.canMutate) return;
    const result = onStageLabFor(selectedPatient.id, {
      testName: selectedLab.testName,
      priority,
      fastingRequired,
      indication,
      targetFacility,
    });

    if (result === "staged") {
      setStatusMessage(
        `${selectedLab.testName} staged for ${selectedPatient.name}. You can keep working and authorize it when ready.`,
      );
    } else if (result === "duplicate") {
      setStatusMessage(
        `${selectedLab.testName} is already staged for ${selectedPatient.name}.`,
      );
    } else {
      setStatusMessage("The lab draft could not be staged. Re-select the patient and try again.");
    }
  }

  return (
    <CompanionPanelFrame
      className="labs-companion-panel"
      rootProps={{
        "data-companion-panel": "labs",
        "data-companion-presentation": isExpanded ? "expanded" : "docked",
      }}
      ariaLabel="Labs"
      title="Labs"
      context={selectedPatient ? "Stage a lab order" : "Order from anywhere"}
      icon="labs"
      iconStyle={{ background: "var(--tint-cyan)", color: "var(--m3-tertiary)" }}
      onClose={onClose}
      onUnpin={onUnpin}
      unpinLabel="Unpin Labs"
      isExpanded={isExpanded}
      onExpand={onExpand}
      onRedock={onRedock}
      bodyClassName="labs-companion-body"
      toolbar={
        <div className="labs-companion-toolbar">
          <label className="labs-companion-field">
            <span>Ordering for</span>
            <select
              value={selectedPatientId}
              onChange={(event) => setSelectedPatientId(event.target.value)}
              aria-label="Choose patient for lab order"
            >
              <option value="">Choose a patient…</option>
              {roster.map((patient) => (
                <option key={patient.id} value={patient.id}>
                  {patient.name} · {patient.mrn}
                </option>
              ))}
            </select>
          </label>
          {/* The pane's one identity line: name, MRN and DOB, beside its binding. */}
          {selectedPatient ? (
            <PatientToolScopeBanner
              scope={toolScope}
              detail={`${selectedPatient.mrn} · DOB ${selectedPatient.dob}`}
            />
          ) : null}
        </div>
      }
      footer={
        selectedPatient ? (
          <div className="labs-companion-footer">
            <div className="labs-companion-footer-actions">
              <button
                type="button"
                className="companion-btn"
                disabled={stagedCount === 0 || !onReviewOrdersFor || !toolScope.canMutate}
                title={toolScope.canMutate ? "Review staged orders" : "Return to the pinned patient chart before opening its order cart"}
                onClick={() => onReviewOrdersFor?.(selectedPatient.id)}
              >
                <Icon name="fact_check" size="sm" />
                <span>Review staged{stagedCount ? ` (${stagedCount})` : ""}</span>
              </button>
              <button
                type="button"
                className="companion-btn is-primary labs-companion-stage"
                disabled={!onStageLabFor || !toolScope.canMutate}
                title={toolScope.canMutate ? "Stage lab order" : "Return to the pinned patient chart before staging"}
                onClick={stageOrder}
              >
                <Icon name="add" size="sm" />
                <span>Stage lab order</span>
              </button>
            </div>
            <span>Staging does not transmit. Authorization remains a separate clinician action.</span>
          </div>
        ) : undefined
      }
    >
      {selectedPatient ? (
        <>
            <section className={`labs-companion-card ${toolScope.canMutate ? "" : "patient-tool-parked"}`}>
              <div className="labs-companion-card-title">
                <div>
                  <span>New lab order</span>
                  <strong>{selectedLab?.category ?? "Diagnostic"}</strong>
                </div>
                <Icon name="science" />
              </div>

              <label className="labs-companion-field">
                <span>Test / panel</span>
                <select
                  value={selectedLabId}
                  onChange={(event) => setSelectedLabId(event.target.value)}
                  aria-label="Choose laboratory test"
                >
                  {psychiatricLabCatalog.map((lab) => (
                    <option key={lab.id} value={lab.id}>
                      {lab.testName}
                    </option>
                  ))}
                </select>
              </label>

              {selectedLab && (
                <div className="labs-companion-test-meta">
                  <span>{selectedLab.specimen}</span>
                  <span>LOINC {selectedLab.loincCode}</span>
                </div>
              )}

              <div className="labs-companion-grid">
                <label className="labs-companion-field">
                  <span>Priority</span>
                  <select
                    value={priority}
                    onChange={(event) => setPriority(event.target.value as LabOrder["priority"])}
                    aria-label="Lab priority"
                  >
                    <option value="Routine">Routine</option>
                    <option value="STAT">STAT</option>
                    <option value="Next Visit">Next Visit</option>
                    <option value="Protocol Surveillance">Protocol Surveillance</option>
                  </select>
                </label>

                <label className="labs-companion-field">
                  <span>Facility</span>
                  <select
                    value={targetFacility}
                    onChange={(event) =>
                      setTargetFacility(event.target.value as LabOrder["targetFacility"])
                    }
                    aria-label="Lab facility"
                  >
                    <option value="Quest Diagnostics">Quest Diagnostics</option>
                    <option value="Labcorp">Labcorp</option>
                    <option value="In-House STAT Lab">In-House STAT Lab</option>
                  </select>
                </label>
              </div>

              <label className="labs-companion-field">
                <span>Indication</span>
                <input
                  value={indication}
                  onChange={(event) => setIndication(event.target.value)}
                  aria-label="Lab indication"
                />
              </label>

              <label className="labs-companion-check">
                <input
                  type="checkbox"
                  checked={fastingRequired}
                  onChange={(event) => setFastingRequired(event.target.checked)}
                />
                <span>Fasting required</span>
              </label>

              <p className="labs-companion-rationale">{selectedLab?.description}</p>

            </section>

            {statusMessage && (
              <p className="labs-companion-status" role="status">
                {statusMessage}
              </p>
            )}
        </>
      ) : (
        <div className="companion-empty-state">
          <p>Select a patient to compose a lab order without leaving your current workspace.</p>
        </div>
      )}
    </CompanionPanelFrame>
  );
}
