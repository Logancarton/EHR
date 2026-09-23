"use client";

import { useEffect, useMemo, useState } from "react";
import type { Patient } from "../../domain/patient";
import { psychiatricLabCatalog, type LabOrder } from "../../domain/orders";
import type {
  LabOrderDraftInput,
  StageLabOrderResult,
} from "../../lib/use-staged-orders";
import CompanionPanelHeader from "./CompanionPanelHeader";
import Icon from "../ui/Icon";

type LabsCompanionPanelProps = {
  roster?: readonly Patient[];
  activePatient?: Patient | null;
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
  const differsFromActiveChart = Boolean(
    selectedPatient && activePatient && selectedPatient.id !== activePatient.id,
  );

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
    if (!selectedPatient || !selectedLab || !onStageLabFor) return;
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
    <aside
      className={`companion-panel labs-companion-panel ${isExpanded ? "companion-expanded-canvas" : ""}`}
      data-companion-panel="labs"
      data-companion-presentation={isExpanded ? "expanded" : "docked"}
      aria-label="Labs"
    >
      <CompanionPanelHeader
        title="Labs"
        context={selectedPatient ? selectedPatient.name : "Order from anywhere"}
        icon="labs"
        iconStyle={{ background: "var(--tint-cyan)", color: "var(--m3-tertiary)" }}
        onClose={onClose}
        onUnpin={onUnpin}
        unpinLabel="Unpin Labs"
        isExpanded={isExpanded}
        onExpand={onExpand}
        onRedock={onRedock}
      />

      <div className="labs-companion-body">
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

        {selectedPatient ? (
          <>
            <header className="labs-companion-patient">
              <div>
                <strong>{selectedPatient.name}</strong>
                <span>{selectedPatient.mrn} · DOB {selectedPatient.dob}</span>
              </div>
              {stagedCount > 0 && (
                <span className="labs-companion-staged-count">{stagedCount} staged</span>
              )}
            </header>

            {differsFromActiveChart && (
              <p className="labs-companion-context-note" role="status">
                You are ordering for {selectedPatient.name}, not the chart currently in front of you
                ({activePatient?.name}). The order stays bound to {selectedPatient.name}.
              </p>
            )}

            <section className="labs-companion-card">
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

              <button
                type="button"
                className="labs-companion-stage"
                disabled={!onStageLabFor}
                onClick={stageOrder}
              >
                <Icon name="add" size="sm" />
                <span>Stage lab order</span>
              </button>
            </section>

            {statusMessage && (
              <p className="labs-companion-status" role="status">
                {statusMessage}
              </p>
            )}

            <div className="labs-companion-footer">
              <span>
                Staging does not transmit. Authorization remains a separate clinician action.
              </span>
              <button
                type="button"
                disabled={stagedCount === 0 || !onReviewOrdersFor}
                onClick={() => onReviewOrdersFor?.(selectedPatient.id)}
              >
                <Icon name="fact_check" size="sm" />
                <span>
                  Review staged orders{stagedCount ? ` (${stagedCount})` : ""}
                </span>
              </button>
            </div>
          </>
        ) : (
          <div className="companion-empty-state">
            <p>Select a patient to compose a lab order without leaving your current workspace.</p>
          </div>
        )}
      </div>
    </aside>
  );
}
