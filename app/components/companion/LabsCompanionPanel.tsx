"use client";

import { useEffect, useMemo, useState } from "react";
import PatientLabs from "../patient/PatientLabs";
import type { PatientSectionActions } from "../workspace/PatientSectionRouter";
import type { MedicationRecord } from "../../domain/clinical-records";
import type { Patient } from "../../domain/patient";
import { psychiatricLabCatalog, type LabOrder } from "../../domain/orders";
import type {
  LabOrderDraftInput,
  StageLabOrderResult,
} from "../../lib/use-staged-orders";
import CompanionPanelFrame from "./CompanionPanelFrame";
import Icon from "../ui/Icon";
import PatientToolScopeBanner from "./PatientToolScopeBanner";
import { useCompanionPatientSelection } from "../../lib/use-companion-patient-selection";
import { derivePatientToolScope } from "../../lib/companion-tool-scope";
import type { WorkspaceCanvasContext } from "../../lib/workspace-canvas-context";
import {
  calculateMonitoringStatus,
  monitoringEvidenceFromRecord,
  type LabObservation,
  type PatientMonitoringItem,
} from "../../lib/clinical-protocols";
import type { VitalSignSummary } from "../../domain/clinical-measurements";
import { formatClinicalDate, formatRelativeDays } from "../../lib/clinical-date";
import {
  practiceQueueApi,
  groupUnacknowledgedLabsByOrder,
  type PracticeLabQueueRow,
} from "../../lib/practice-queue-api";
import {
  WORKSPACE_SIDEBAR_BADGES_EVENT,
  dispatchWorkspaceEvent,
} from "../../lib/workspace-events";
import { ensurePatientOpen, settleWorkspace } from "../../lib/workspace-navigation";

type LabsCompanionPanelProps = {
  roster?: readonly Patient[];
  activePatient?: Patient | null;
  workspaceContext: WorkspaceCanvasContext;
  actionsForPatient: (patientId: string) => PatientSectionActions;
  onStageLabFor?: (patientId: string, input: LabOrderDraftInput) => StageLabOrderResult;
  stagedOrderCountFor?: (patientId: string) => number;
  onReviewOrdersFor?: (patientId: string) => void;
  onClose: () => void;
  onUnpin?: () => void;
  isExpanded?: boolean;
  onExpand?: () => void;
  onRedock?: () => void;
  onOpenWorkspace?: () => void;
};

type ObservationRow = {
  id: string;
  category: string;
  code?: string;
  test_name: string;
  effective_at: string;
  value_text: string;
  unit?: string;
  reference_range?: string;
  interpretation?: LabObservation["flag"];
  observed_by?: string;
  acknowledged_at?: string;
};

function toLab(row: ObservationRow): LabObservation {
  return {
    id: row.id,
    testName: row.test_name,
    code: row.code || "",
    date: row.effective_at,
    value: row.value_text,
    unit: row.unit || "",
    referenceRange: row.reference_range || "",
    flag: row.interpretation,
    orderedBy: row.observed_by || "Unknown",
  };
}

const QUICK_PICK_LABS = [
  { id: "lab-cmp", label: "CMP", fasting: false },
  { id: "lab-cbc", label: "CBC w/ Diff", fasting: false },
  { id: "lab-fasting-metabolic", label: "Lipids & A1c", fasting: true },
  { id: "lab-lithium-tsh", label: "Lithium & TSH", fasting: false },
  { id: "lab-tsh-ft4", label: "Thyroid Panel", fasting: false },
  { id: "lab-uds-12", label: "Urine Tox 12", fasting: false },
  { id: "lab-ecg", label: "12-Lead ECG", fasting: false },
];

function findCatalogMatch(name: string) {
  const norm = name.toLowerCase().trim();
  const direct = psychiatricLabCatalog.find(
    (lab) =>
      lab.testName.toLowerCase().includes(norm) ||
      norm.includes(lab.testName.toLowerCase()) ||
      lab.clinicalIndications.some(
        (ind) => ind.toLowerCase().includes(norm) || norm.includes(ind.toLowerCase()),
      ),
  );
  if (direct) return direct;

  if (norm.includes("lithium")) {
    return psychiatricLabCatalog.find((lab) => lab.id === "lab-lithium-tsh") ?? null;
  }
  if (
    norm.includes("lipid") ||
    norm.includes("glucose") ||
    norm.includes("a1c") ||
    norm.includes("metabolic")
  ) {
    return psychiatricLabCatalog.find((lab) => lab.id === "lab-fasting-metabolic") ?? null;
  }
  if (
    norm.includes("cmp") ||
    norm.includes("hepatic") ||
    norm.includes("renal") ||
    norm.includes("liver") ||
    norm.includes("lft")
  ) {
    return psychiatricLabCatalog.find((lab) => lab.id === "lab-cmp") ?? null;
  }
  if (
    norm.includes("cbc") ||
    norm.includes("blood count") ||
    norm.includes("anc") ||
    norm.includes("neutrophil")
  ) {
    return psychiatricLabCatalog.find((lab) => lab.id === "lab-cbc") ?? null;
  }
  if (norm.includes("tsh") || norm.includes("thyroid")) {
    return psychiatricLabCatalog.find((lab) => lab.id === "lab-tsh-ft4") ?? null;
  }
  if (norm.includes("tox") || norm.includes("uds") || norm.includes("urine")) {
    return psychiatricLabCatalog.find((lab) => lab.id === "lab-uds-12") ?? null;
  }
  if (norm.includes("ecg") || norm.includes("ekg")) {
    return psychiatricLabCatalog.find((lab) => lab.id === "lab-ecg") ?? null;
  }

  return psychiatricLabCatalog[0] ?? null;
}

/**
 * Diagnostic companion workspace: review results and stage lab orders from anywhere.
 *
 * Clinicians can inspect longitudinal results, track psychiatric medication surveillance
 * protocols, and stage new lab orders without losing focus in their encounter note, chart,
 * or practice queue.
 */
export default function LabsCompanionPanel({
  roster = [],
  activePatient,
  workspaceContext,
  onStageLabFor,
  actionsForPatient,
  stagedOrderCountFor,
  onReviewOrdersFor,
  onClose,
  onUnpin,
  isExpanded = false,
  onExpand,
  onRedock,
  onOpenWorkspace,
}: LabsCompanionPanelProps) {
  const [selectedPatientId, setSelectedPatientId] = useCompanionPatientSelection(activePatient);
  const [subview, setSubview] = useState<"results" | "order" | "record">("results");
  const [resultsSearch, setResultsSearch] = useState("");
  const [openingChart, setOpeningChart] = useState(false);

  // Patient results & surveillance state
  const [labs, setLabs] = useState<LabObservation[]>([]);
  const [evidence, setEvidence] = useState<LabObservation[]>([]);
  const [loadingLabs, setLoadingLabs] = useState(false);
  const [labFailure, setLabFailure] = useState<{ patientId: string; message: string } | null>(null);
  const labsError = labFailure?.patientId === selectedPatientId ? labFailure.message : null;
  const setLabsError = (message: string | null) => setLabFailure(message ? { patientId: selectedPatientId, message } : null);
  const [reloadToken, setReloadToken] = useState(0);

  // Practice queue state (used when no patient is chosen)
  const [queueRows, setQueueRows] = useState<PracticeLabQueueRow[]>([]);
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [queueFilter, setQueueFilter] = useState<"all" | "unacknowledged" | "abnormal" | "critical">("unacknowledged");
  const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null);

  // Working drafts are owned by patient, so following a chart cannot retarget an order.
  type LabDraft = { selectedLabId: string; priority: LabOrder["priority"]; fastingRequired: boolean; targetFacility: LabOrder["targetFacility"]; indication: string };
  const emptyDraft: LabDraft = { selectedLabId: "", priority: "Routine", fastingRequired: false, targetFacility: "Quest Diagnostics", indication: "" };
  const [drafts, setDrafts] = useState<Record<string, LabDraft>>({});
  const { selectedLabId, priority, fastingRequired, targetFacility, indication } = drafts[selectedPatientId] ?? emptyDraft;
  function updateDraft(patch: Partial<LabDraft>) {
    const owner = selectedPatientId;
    setDrafts((previous) => ({ ...previous, [owner]: { ...(previous[owner] ?? emptyDraft), ...patch } }));
  }
  const setSelectedLabId = (selectedLabId: string) => updateDraft({ selectedLabId });
  const setPriority = (priority: LabOrder["priority"]) => updateDraft({ priority });
  const setFastingRequired = (fastingRequired: boolean) => updateDraft({ fastingRequired });
  const setTargetFacility = (targetFacility: LabOrder["targetFacility"]) => updateDraft({ targetFacility });
  const setIndication = (indication: string) => updateDraft({ indication });
  const [statusMessage, setStatusMessage] = useState("");
  const [justStaged, setJustStaged] = useState(false);
  const [loadedPatientId, setLoadedPatientId] = useState("");
  const [medicationNames, setMedicationNames] = useState<string[]>([]);

  const selectedPatient = useMemo(
    () => roster.find((candidate) => candidate.id === selectedPatientId) ?? null,
    [roster, selectedPatientId],
  );

  const differsFromActiveChart = Boolean(
    selectedPatient && activePatient && selectedPatient.id !== activePatient.id,
  );

  const selectedLab = useMemo(
    () => psychiatricLabCatalog.find((lab) => lab.id === selectedLabId) ?? null,
    [selectedLabId],
  );

  const stagedCount =
    selectedPatient && stagedOrderCountFor ? stagedOrderCountFor(selectedPatient.id) : 0;

  const toolScope = derivePatientToolScope({
    workspaceContext,
    allowRetainedPatient: true,
    boundPatient: selectedPatient
      ? { patientId: selectedPatient.id, patientName: selectedPatient.name }
      : null,
  });

  // Load patient clinical record (labs & vitals for surveillance)
  useEffect(() => {
    if (!selectedPatientId) {
      setLabs([]);
      setEvidence([]);
      return;
    }

    const controller = new AbortController();
    setLoadingLabs(true);
    setLabsError(null);

    fetch(`/api/clinical-records?patientId=${encodeURIComponent(selectedPatientId)}`, {
      signal: controller.signal,
      headers: { "x-ehr-patient-id": selectedPatientId },
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || !payload.success) {
          throw new Error(payload.error || "Unable to load patient labs");
        }
        if (controller.signal.aborted) return;
        const observations = (payload.record?.observations || []) as ObservationRow[];
        const laboratory = observations.filter((row) => row.category === "laboratory");
        const vitals = (payload.record?.vitals || []) as VitalSignSummary[];
        if (laboratory.some((row: ObservationRow & { patient_id?: string }) => row.patient_id && row.patient_id !== selectedPatientId)) throw new Error("Patient binding mismatch");
        const medications = (payload.record?.medications ?? []) as MedicationRecord[];
        if (medications.some((entry) => entry.patient_id !== selectedPatientId)) throw new Error("Patient binding mismatch");
        setMedicationNames(medications.filter((entry) => entry.status === "active").map((entry) => entry.display_text));
        setLoadedPatientId(selectedPatientId);
        setLabs(laboratory.map(toLab));
        setEvidence(
          monitoringEvidenceFromRecord(
            laboratory.map((row) => ({ ...row, recorded_at: row.effective_at })),
            vitals,
          ),
        );
      })
      .catch((err) => {
        if (!controller.signal.aborted && err?.name !== "AbortError") {
          setLabsError(err instanceof Error ? err.message : "Unable to load patient labs");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingLabs(false);
      });

    return () => controller.abort();
  }, [selectedPatientId, reloadToken]);

  // Load practice queue when in unselected (practice) mode
  const loadPracticeQueue = async () => {
    setQueueLoading(true);
    setQueueError(null);
    try {
      const rows = await practiceQueueApi.labs();
      setQueueRows(rows);
    } catch (err) {
      setQueueError(err instanceof Error ? err.message : "Unable to load practice queue");
    } finally {
      setQueueLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedPatientId) {
      void loadPracticeQueue();
    }
  }, [selectedPatientId]);

  // Surveillance calculation
  const monitoringItems = useMemo(() => {
    if (!selectedPatient || loadedPatientId !== selectedPatientId || loadingLabs || labsError) return [];
    return calculateMonitoringStatus(medicationNames, evidence);
  }, [selectedPatient, evidence, loadedPatientId, selectedPatientId, loadingLabs, labsError, medicationNames]);

  const overdueCount = monitoringItems.filter((i) => i.status !== "current").length;

  useEffect(() => {
    setStatusMessage("");
    setJustStaged(false);
  }, [selectedPatientId]);

  async function openSelectedChart() {
    if (!selectedPatient) return;
    setOpeningChart(true);
    try {
      const tab = await ensurePatientOpen(selectedPatient.id);
      tab?.click();
      await settleWorkspace(2);
    } finally {
      setOpeningChart(false);
    }
  }

  function startOrderFromSurveillance(item: PatientMonitoringItem) {
    const matched = findCatalogMatch(item.requiredLab);
    if (matched) {
      setSelectedLabId(matched.id);
      setPriority("Protocol Surveillance");
      setFastingRequired(matched.fastingRequired);
      setIndication(
        selectedPatient?.diagnoses[0]
          ? `${selectedPatient.diagnoses[0]} / ${item.medication} surveillance`
          : `${item.medication} protocol surveillance`,
      );
    } else {
      setSelectedLabId(psychiatricLabCatalog[0]?.id || "");
      setPriority("Protocol Surveillance");
      setIndication(`${item.medication} surveillance: ${item.requiredLab}`);
    }
    setStatusMessage("");
    setSubview("order");
  }

  function startOrderFromPrior(lab: LabObservation) {
    const matched = findCatalogMatch(lab.testName);
    if (matched) {
      setSelectedLabId(matched.id);
      setPriority(matched.defaultPriority);
      setFastingRequired(matched.fastingRequired);
      setIndication(
        selectedPatient?.diagnoses[0]
          ? `Follow-up: ${selectedPatient.diagnoses[0]}`
          : "Routine clinical follow-up",
      );
    } else {
      setSelectedLabId(psychiatricLabCatalog[0]?.id || "");
      setPriority("Routine");
      setIndication(`Repeat ${lab.testName}`);
    }
    setStatusMessage("");
    setSubview("order");
  }

  function selectQuickLab(catalogId: string) {
    const lab = psychiatricLabCatalog.find((item) => item.id === catalogId);
    if (!lab) return;
    setSelectedLabId(lab.id);
    setPriority(lab.defaultPriority);
    setFastingRequired(lab.fastingRequired);
    if (!indication && selectedPatient?.diagnoses.length) {
      setIndication(`${selectedPatient.diagnoses[0]} surveillance`);
    }
    setStatusMessage("");
  }

  async function handleAcknowledgeResult(row: PracticeLabQueueRow) {
    if (row.acknowledgedAt || acknowledgingId) return;
    const confirmed = window.confirm(
      `Acknowledge ${row.testName} for ${row.patientName} as reviewed?`,
    );
    if (!confirmed) return;
    setAcknowledgingId(row.observationId);
    try {
      await practiceQueueApi.acknowledgeLab({
        patientId: row.patientId,
        observationId: row.observationId,
        disposition: "reviewed",
      });
      const updatedRows = await practiceQueueApi.labs();
      setQueueRows(updatedRows);
      dispatchWorkspaceEvent(WORKSPACE_SIDEBAR_BADGES_EVENT, {
        labs: groupUnacknowledgedLabsByOrder(updatedRows).length,
      });
    } catch (err) {
      console.error("Unable to acknowledge lab:", err);
    } finally {
      setAcknowledgingId(null);
    }
  }

  function stageOrder() {
    if (
      !selectedPatient ||
      !selectedLab ||
      !indication.trim() ||
      !onStageLabFor ||
      !toolScope.canMutate
    )
      return;

    const result = onStageLabFor(selectedPatient.id, {
      testName: selectedLab.testName,
      priority,
      fastingRequired,
      indication,
      targetFacility,
    });

    if (result === "staged") {
      setJustStaged(true);
      setTimeout(() => setJustStaged(false), 2000);
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

  // Filtered longitudinal results
  const filteredLabs = useMemo(() => {
    if (loadedPatientId !== selectedPatientId) return [];
    if (!resultsSearch.trim()) return labs;
    const q = resultsSearch.toLowerCase();
    return labs.filter(
      (l) =>
        l.testName.toLowerCase().includes(q) ||
        l.value.toLowerCase().includes(q) ||
        l.orderedBy.toLowerCase().includes(q) ||
        (l.flag && l.flag.toLowerCase().includes(q)),
    );
  }, [labs, resultsSearch, loadedPatientId, selectedPatientId]);

  // Practice queue filtering
  const filteredQueue = useMemo(() => {
    return queueRows.filter((row) => {
      if (queueFilter === "unacknowledged" && row.acknowledgedAt) return false;
      const interp = (row.interpretation || "").toLowerCase();
      if (queueFilter === "abnormal" && interp === "normal") return false;
      if (queueFilter === "critical" && interp !== "critical") return false;
      return true;
    });
  }, [queueRows, queueFilter]);

  const unacknowledgedCount = queueRows.filter((row) => !row.acknowledgedAt).length;

  return (
    <CompanionPanelFrame
      className="labs-companion-panel"
      rootProps={{
        "data-companion-panel": "labs",
        "data-companion-presentation": isExpanded ? "expanded" : "docked",
        "data-labs-scope": selectedPatient ? "patient" : "practice",
      }}
      ariaLabel="Labs"
      title="Labs"
      context={
        selectedPatient
          ? subview === "results"
            ? "Results & Protocol Surveillance"
            : "Stage a lab order"
          : "Practice review queue"
      }
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
            <span>Viewing / Ordering for</span>
            <select
              value={selectedPatientId}
              onChange={(event) => {
                setSelectedPatientId(event.target.value);
                setStatusMessage("");
              }}
              aria-label="Choose patient for labs"
            >
              <option value="">
                Practice queue — all patients {unacknowledgedCount > 0 ? `(${unacknowledgedCount} unreviewed)` : ""}
              </option>
              {roster.map((patient) => (
                <option key={patient.id} value={patient.id}>
                  {patient.name} · {patient.mrn}
                </option>
              ))}
            </select>
          </label>

          {selectedPatient ? (
            <div className="labs-companion-patient-header">
              <PatientToolScopeBanner
                scope={toolScope}
                detail={`${selectedPatient.mrn} · DOB ${selectedPatient.dob}`}
              />
              <button
                type="button"
                className="labs-chart-open-btn"
                disabled={openingChart}
                onClick={() => void openSelectedChart()}
                title="Open this patient's full chart"
              >
                <Icon name="fullscreen" size="sm" />
                <span>{openingChart ? "Opening…" : "Open chart"}</span>
              </button>
            </div>
          ) : null}

          {differsFromActiveChart && selectedPatient && (
            <p className="labs-companion-context-note" role="status">
              Viewing <strong>{selectedPatient.name}</strong>, not the chart in front of you (
              {activePatient?.name}). Actions below submit against {selectedPatient.name}&apos;s record.
            </p>
          )}

          {selectedPatient ? (
            <div className="labs-companion-subnav" role="tablist" aria-label="Labs view options">
              <button
                type="button"
                role="tab"
                aria-selected={subview === "results"}
                className={`labs-companion-tab ${subview === "results" ? "is-active" : ""}`}
                onClick={() => setSubview("results")}
                title="Results & Surveillance"
              >
                <Icon name="science" size="sm" />
                <span>Results &amp; Surveillance</span>
                {overdueCount > 0 && (
                  <span className="labs-companion-tab-badge is-alert">{overdueCount}</span>
                )}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={subview === "order"}
                className={`labs-companion-tab ${subview === "order" ? "is-active" : ""}`}
                onClick={() => setSubview("order")}
                title="Order New Lab"
              >
                <Icon name="add" size="sm" />
                <span>Order New Lab</span>
                {stagedCount > 0 && (
                  <span className="labs-companion-tab-badge is-staged">{stagedCount}</span>
                )}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={subview === "record"}
                className={`labs-companion-tab ${subview === "record" ? "is-active" : ""}`}
                onClick={() => setSubview("record")}
                title="Record & review"
              >
                <span>Record &amp; review</span>
              </button>
            </div>
          ) : null}
        </div>
      }
      footer={
        selectedPatient ? (
          <div className="labs-companion-footer">
            <div className="labs-companion-footer-actions">
              <button
                type="button"
                className={`companion-btn labs-companion-review ${justStaged ? "just-staged-pulse" : ""}`}
                disabled={stagedCount === 0 || !onReviewOrdersFor || !toolScope.canMutate}
                title={
                  toolScope.canMutate
                    ? "Review staged orders"
                    : "Return to the pinned patient chart before opening its order cart"
                }
                onClick={() => onReviewOrdersFor?.(selectedPatient.id)}
              >
                <Icon name="fact_check" size="sm" />
                <span>Review staged{stagedCount ? ` (${stagedCount})` : ""}</span>
              </button>

              {subview === "order" ? (
                <button
                  type="button"
                  className="companion-btn is-primary labs-companion-stage"
                  disabled={
                    !onStageLabFor || !toolScope.canMutate || !selectedLab || !indication.trim()
                  }
                  title={
                    !toolScope.canMutate
                      ? "Return to the pinned patient chart before staging"
                      : !selectedLab
                        ? "Choose a test first"
                        : !indication.trim()
                          ? "Enter the indication for this patient"
                          : "Stage lab order"
                  }
                  onClick={stageOrder}
                >
                  <Icon name="add" size="sm" />
                  <span>Stage lab order</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="companion-btn is-primary labs-companion-stage"
                  onClick={() => setSubview("order")}
                >
                  <Icon name="add" size="sm" />
                  <span>New Lab Order</span>
                </button>
              )}
            </div>
            <span>Staging does not transmit. Authorization remains a separate clinician action.</span>
          </div>
        ) : onOpenWorkspace ? (
          <div className="labs-companion-footer">
            <button
              type="button"
              className="companion-btn is-primary"
              style={{ width: "100%", justifyContent: "center" }}
              onClick={onOpenWorkspace}
            >
              <Icon name="fullscreen" size="sm" />
              <span>Open Full Practice Labs Queue</span>
            </button>
          </div>
        ) : undefined
      }
    >
      {selectedPatient ? (
        subview === "record" ? (
          <PatientLabs key={selectedPatient.id} patient={selectedPatient}
            onDraftOrder={actionsForPatient(selectedPatient.id).onDraftOrder}
            onDraftAllOverdue={actionsForPatient(selectedPatient.id).onDraftAllOverdue}
            onOpenLabComposer={actionsForPatient(selectedPatient.id).onOpenLabComposer} />
        ) : subview === "results" ? (
          <div className="labs-companion-results-pane">
            {/* Medication Surveillance Alerts */}
            {loadedPatientId !== selectedPatientId || loadingLabs || labsError ? (
              <section className="labs-surveillance-card"><p>{labsError ? "Medication surveillance unavailable until records can be retrieved." : "Loading medication surveillance records…"}</p></section>
            ) : overdueCount > 0 ? (
              <section className="labs-surveillance-card alert-state">
                <div className="labs-surveillance-heading">
                  <div className="labs-surveillance-title-group">
                    <Icon name="warning" size="sm" />
                    <strong>
                      {overdueCount} Medication Monitoring Check{overdueCount > 1 ? "s" : ""} Due
                    </strong>
                  </div>
                  <span className="labs-protocol-tag">Dr. Logan Carton Protocol</span>
                </div>
                <div className="labs-surveillance-list">
                  {monitoringItems
                    .filter((item) => item.status === "overdue" || item.status === "due-soon")
                    .map((item, idx) => (
                      <div key={idx} className="labs-surveillance-item">
                        <div className="labs-surveillance-item-info">
                          <span className="labs-surveillance-med">{item.medication}</span>
                          <strong className="labs-surveillance-test">{item.requiredLab}</strong>
                          <span className="labs-surveillance-meta">
                            {item.intervalLabel} ·{" "}
                            {item.lastDoneDate
                              ? `Done ${formatClinicalDate(item.lastDoneDate)} (${formatRelativeDays(item.daysElapsed)})`
                              : "No record on file"}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="labs-item-order-btn"
                          disabled={!toolScope.canMutate}
                          title={
                            toolScope.canMutate
                              ? `Stage ${item.requiredLab}`
                              : "Parked while inactive"
                          }
                          onClick={() => startOrderFromSurveillance(item)}
                        >
                          <Icon name="add" size="sm" />
                          <span>Order</span>
                        </button>
                      </div>
                    ))}
                </div>
              </section>
            ) : (
              <section className="labs-surveillance-card current-state">
                <div className="labs-surveillance-heading">
                  <div className="labs-surveillance-title-group">
                    <Icon name="check_circle" size="sm" />
                    <strong>{monitoringItems.length ? "Recorded Monitoring Checks Current" : "No Applicable Monitoring Checks"}</strong>
                  </div>
                  <span className="labs-protocol-tag">Standard Protocol</span>
                </div>
                <p className="labs-surveillance-desc">
                  This view compares recorded medication and measurement evidence with the applicable monitoring rules. It does not establish an overall clinical safety assessment.
                </p>
              </section>
            )}

            {/* Longitudinal Results Flowsheet */}
            <section className="labs-flowsheet-section">
              <div className="labs-flowsheet-header">
                <div>
                  <span className="eyebrow">Diagnostic Flowsheet</span>
                  <h3>Longitudinal Lab Results ({loadedPatientId === selectedPatientId ? labs.length : "…"})</h3>
                </div>
                <button
                  type="button"
                  className="labs-refresh-icon-btn"
                  title="Reload results"
                  onClick={() => setReloadToken((t) => t + 1)}
                  disabled={loadingLabs}
                >
                  <Icon name="refresh" size="sm" />
                </button>
              </div>

              {labs.length > 0 && (
                <div className="labs-search-wrap">
                  <Icon name="search" size="sm" />
                  <input
                    type="search"
                    value={resultsSearch}
                    onChange={(e) => setResultsSearch(e.target.value)}
                    placeholder="Filter results (e.g. lithium, cmp, a1c)…"
                    aria-label="Filter patient lab results"
                  />
                  {resultsSearch && (
                    <button
                      type="button"
                      className="labs-search-clear"
                      onClick={() => setResultsSearch("")}
                    >
                      ×
                    </button>
                  )}
                </div>
              )}

              {(loadingLabs || loadedPatientId !== selectedPatientId) && !labsError ? (
                <div className="labs-loading-state">
                  <Icon name="sync" size="sm" className="spin" />
                  <span>Loading clinical results…</span>
                </div>
              ) : labsError ? (
                <div className="labs-error-state">
                  <span>{labsError}</span>
                  <button type="button" onClick={() => setReloadToken((t) => t + 1)}>
                    Retry
                  </button>
                </div>
              ) : filteredLabs.length === 0 ? (
                <div className="labs-empty-state">
                  <Icon name="science" size="md" />
                  <p>
                    {labs.length === 0
                      ? "No prior lab results recorded in this chart."
                      : "No results match your search."}
                  </p>
                  <button
                    type="button"
                    className="companion-btn is-primary"
                    onClick={() => setSubview("order")}
                  >
                    <Icon name="add" size="sm" />
                    <span>Order First Lab</span>
                  </button>
                </div>
              ) : (
                <div className="labs-flowsheet-list">
                  {filteredLabs.map((lab) => {
                    const flagLower = (lab.flag || "").toLowerCase();
                    const isAbnormal =
                      flagLower === "abnormal" || flagLower === "high" || flagLower === "low";
                    const isCritical = flagLower === "critical";

                    return (
                      <article key={lab.id} className="labs-result-card">
                        <div className="labs-result-card-top">
                          <div>
                            <strong className="labs-result-test-name">{lab.testName}</strong>
                            {lab.code && (
                              <small className="labs-result-loinc">LOINC {lab.code}</small>
                            )}
                          </div>
                          <time className="labs-result-date">{formatClinicalDate(lab.date)}</time>
                        </div>

                        <div className="labs-result-card-middle">
                          <div className="labs-result-value-group">
                            <span className="labs-result-value">
                              {lab.value} {lab.unit !== "multi" ? lab.unit : ""}
                            </span>
                            {lab.flag && (
                              <span
                                className={`lab-flag ${isCritical ? "critical" : isAbnormal ? "abnormal" : "normal"}`}
                              >
                                {lab.flag}
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            className="labs-reorder-btn"
                            disabled={!toolScope.canMutate}
                            title={`Re-order ${lab.testName}`}
                            onClick={() => startOrderFromPrior(lab)}
                          >
                            <Icon name="add" size="sm" />
                            <span>Repeat</span>
                          </button>
                        </div>

                        <div className="labs-result-card-bottom">
                          {lab.referenceRange && (
                            <span className="labs-result-ref">Ref: {lab.referenceRange}</span>
                          )}
                          <span className="labs-result-provider">By {lab.orderedBy}</span>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        ) : (
          <div className="labs-companion-order-pane">
            <section
              className={`labs-companion-card ${toolScope.canMutate ? "" : "patient-tool-parked"}`}
            >
              <div className="labs-companion-card-title">
                <div>
                  <span>New lab order</span>
                  <strong>{selectedLab?.category ?? "Psychiatric Diagnostic"}</strong>
                </div>
                <Icon name="science" />
              </div>

              {/* Quick Pick Chips */}
              <div className="labs-quick-chips-group">
                <span className="labs-quick-chips-label">Common psychiatric panels:</span>
                <div className="labs-quick-chips-row">
                  {QUICK_PICK_LABS.map((chip) => (
                    <button
                      key={chip.id}
                      type="button"
                      className={`labs-quick-chip ${selectedLabId === chip.id ? "is-selected" : ""} ${chip.fasting ? "is-fasting" : ""}`}
                      onClick={() => selectQuickLab(chip.id)}
                      title={chip.fasting ? `${chip.label} (Fasting required)` : chip.label}
                    >
                      <span>{chip.label}</span>
                      {chip.fasting && <span className="labs-fasting-tag">Fasting</span>}
                    </button>
                  ))}
                </div>
              </div>

              <label className="labs-companion-field">
                <span>Test / panel</span>
                <select
                  value={selectedLabId}
                  onChange={(event) => { const lab = psychiatricLabCatalog.find((entry) => entry.id === event.target.value); updateDraft({ selectedLabId: event.target.value, priority: lab?.defaultPriority ?? "Routine", fastingRequired: lab?.fastingRequired ?? false }); }}
                  aria-label="Choose laboratory test"
                >
                  <option value="" disabled>
                    Choose a test…
                  </option>
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
                  <span>{selectedLab.category}</span>
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
                  placeholder={
                    selectedPatient.diagnoses.length > 0
                      ? `e.g. ${selectedPatient.diagnoses.slice(0, 2).join("; ")}`
                      : "Why this test for this patient"
                  }
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

              <p className="labs-companion-rationale">
                {selectedLab?.description ||
                  "Choose a test to view specimen instructions and clinical surveillance guidance."}
              </p>
            </section>

            {statusMessage && (
              <p className="labs-companion-status" role="status">
                {statusMessage}
              </p>
            )}
          </div>
        )
      ) : (
        /* Practice-wide unacknowledged labs review queue */
        <div className="labs-companion-practice-queue">
          <div className="labs-queue-toolbar">
            <div className="labs-queue-filter-buttons">
              {(["unacknowledged", "all", "abnormal", "critical"] as const).map((filterKey) => (
                <button
                  key={filterKey}
                  type="button"
                  className={`labs-queue-filter-btn ${queueFilter === filterKey ? "is-active" : ""}`}
                  onClick={() => setQueueFilter(filterKey)}
                >
                  {filterKey === "unacknowledged"
                    ? `Needs Review (${unacknowledgedCount})`
                    : filterKey === "all"
                      ? `All (${queueRows.length})`
                      : filterKey === "abnormal"
                        ? "Abnormal"
                        : "Critical"}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="labs-refresh-icon-btn"
              onClick={() => void loadPracticeQueue()}
              disabled={queueLoading}
              title="Refresh queue"
            >
              <Icon name="refresh" size="sm" />
            </button>
          </div>

          {queueLoading ? (
            <div className="labs-loading-state">
              <Icon name="sync" size="sm" className="spin" />
              <span>Loading practice lab queue…</span>
            </div>
          ) : queueError ? (
            <div className="labs-error-state">
              <span>{queueError}</span>
              <button type="button" onClick={() => void loadPracticeQueue()}>
                Retry
              </button>
            </div>
          ) : filteredQueue.length === 0 ? (
            <div className="companion-empty-state">
              <Icon name="check_circle" size="md" />
              <p>No lab results match this filter in the practice queue.</p>
              <span>Select a patient above to view their chart labs or compose an order.</span>
            </div>
          ) : (
            <div className="labs-queue-list">
              {filteredQueue.map((row) => {
                const interp = (row.interpretation || "").toLowerCase();
                const isCrit = interp === "critical";
                const isAbn = interp === "abnormal" || interp === "high" || interp === "low";

                return (
                  <article
                    key={row.observationId}
                    className={`labs-queue-card ${row.acknowledgedAt ? "is-reviewed" : "needs-review"}`}
                  >
                    <div className="labs-queue-card-header">
                      <div>
                        <strong className="labs-queue-patient-name">{row.patientName}</strong>
                        <small className="labs-queue-mrn">{row.patientMrn}</small>
                      </div>
                      <time className="labs-queue-date">{formatClinicalDate(row.effectiveAt)}</time>
                    </div>

                    <div className="labs-queue-card-body">
                      <span className="labs-queue-test">{row.testName}</span>
                      <div className="labs-queue-result-row">
                        <span className="labs-queue-value">
                          {row.valueText} {row.unit || ""}
                        </span>
                        <span
                          className={`lab-flag ${isCrit ? "critical" : isAbn ? "abnormal" : "normal"}`}
                        >
                          {row.interpretation || "Result"}
                        </span>
                      </div>
                      {row.referenceRange && (
                        <small className="labs-queue-ref">Ref: {row.referenceRange}</small>
                      )}
                    </div>

                    <div className="labs-queue-actions">
                      <button
                        type="button"
                        className="companion-btn is-sm"
                        onClick={() => setSelectedPatientId(row.patientId)}
                        title="View this patient's labs and order new ones"
                      >
                        <Icon name="visibility" size="sm" />
                        <span>View patient labs</span>
                      </button>

                      {!row.acknowledgedAt ? (
                        <button
                          type="button"
                          className="companion-btn is-sm is-primary"
                          disabled={acknowledgingId === row.observationId}
                          onClick={() => void handleAcknowledgeResult(row)}
                        >
                          <Icon name="check" size="sm" />
                          <span>
                            {acknowledgingId === row.observationId ? "Saving…" : "Acknowledge"}
                          </span>
                        </button>
                      ) : (
                        <span className="labs-queue-reviewed-tag">
                          <Icon name="check" size="sm" /> Reviewed
                        </span>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}
    </CompanionPanelFrame>
  );
}
