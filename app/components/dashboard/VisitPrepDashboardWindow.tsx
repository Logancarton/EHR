"use client";

import { useEffect, useState } from "react";
import {
  practiceQueueApi,
  type PracticeVisitPrepSummary,
} from "../../lib/practice-queue-api";
import { formatClinicalDate } from "../../lib/clinical-date";
import AsyncSection from "../ui/AsyncSection";
import Button from "../ui/Button";
import Icon from "../ui/Icon";

export type VisitPrepDashboardWindowProps = {
  date?: string;
  onOpenChart: (patientId: string, targetSection?: string) => void;
  onStartVisit?: (patientId: string, patientName: string, appointmentId: string) => void;
};

export default function VisitPrepDashboardWindow({
  date,
  onOpenChart,
  onStartVisit,
}: VisitPrepDashboardWindowProps) {
  const [summaries, setSummaries] = useState<PracticeVisitPrepSummary[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    let active = true;
    setStatus("loading");
    setError(null);

    practiceQueueApi
      .visitPrep(date)
      .then((rows) => {
        if (!active) return;
        setSummaries(rows);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (!active) return;
        setSummaries([]);
        setError(err instanceof Error ? err.message : "Failed to load visit preparation data.");
        setStatus("error");
      });

    return () => {
      active = false;
    };
  }, [date, reloads]);

  return (
    <div className="visit-prep-window-body">
      <AsyncSection
        className="visit-prep-list"
        loading={status === "loading"}
        error={status === "error" ? error : null}
        isEmpty={summaries.length === 0}
        hasLoadedOnce={status !== "loading"}
        loadingMessage="Assembling verified clinical facts for today's visits…"
        emptyMessage="No scheduled visits found for this date to prepare."
        onRetry={() => setReloads((c) => c + 1)}
      >
        {summaries.map((item) => {
          const hasVitals = item.vitals && (item.vitals.bp || item.vitals.hr || item.vitals.wt);

          return (
            <div key={item.appointmentId} className="visit-prep-card">
              <div className="visit-prep-header">
                <div className="visit-prep-time-slot">
                  <span className="visit-prep-time">{item.time}</span>
                  <span className="visit-prep-type-badge">{item.visitType}</span>
                </div>
                <div className="visit-prep-badges">
                  {item.hasUnsignedDraft && (
                    <span className="prep-badge badge-amber" title="Unsigned encounter draft exists">
                      <Icon name="edit_note" size="sm" />
                      Draft Exists
                    </span>
                  )}
                  {item.unacknowledgedLabsCount > 0 && (
                    <span
                      className="prep-badge badge-red"
                      title={`${item.unacknowledgedLabsCount} unacknowledged lab results`}
                    >
                      <Icon name="biotech" size="sm" />
                      {item.unacknowledgedLabsCount} Lab{item.unacknowledgedLabsCount > 1 ? "s" : ""}
                    </span>
                  )}
                  {item.room && (
                    <span className="prep-badge badge-neutral">
                      <Icon name="door_front" size="sm" />
                      {item.room}
                    </span>
                  )}
                </div>
              </div>

              <div className="visit-prep-patient-row">
                <button
                  type="button"
                  className="visit-prep-patient-name"
                  onClick={() => onOpenChart(item.patientId)}
                  title={`Open chart for ${item.patientName}`}
                >
                  <span className="patient-chip-avatar">
                    <Icon name="person" size="sm" />
                  </span>
                  <span>{item.patientName}</span>
                  {item.patientMrn && <small className="prep-mrn">({item.patientMrn})</small>}
                </button>
                {item.chiefComplaint && (
                  <span className="visit-prep-complaint">
                    &ldquo;{item.chiefComplaint}&rdquo;
                  </span>
                )}
              </div>

              {/* Verified Clinical Facts Grid */}
              <div className="visit-prep-facts-grid">
                {/* Last Visit */}
                <div className="prep-fact-block">
                  <span className="prep-fact-label">Last Visit</span>
                  <span className="prep-fact-val">
                    {item.lastVisitDate ? formatClinicalDate(item.lastVisitDate) : "First recorded visit"}
                  </span>
                </div>

                {/* Active Problems */}
                <div className="prep-fact-block">
                  <span className="prep-fact-label">
                    Active Diagnoses ({item.activeDiagnosesCount})
                  </span>
                  <span className="prep-fact-val">
                    {item.activeDiagnosesCount > 0
                      ? item.topDiagnoses.join(", ")
                      : "No active diagnoses"}
                  </span>
                </div>

                {/* Active Meds */}
                <div className="prep-fact-block">
                  <span className="prep-fact-label">Active Meds</span>
                  <span className="prep-fact-val">
                    {item.activeMedicationsCount > 0
                      ? `${item.activeMedicationsCount} recorded medication${item.activeMedicationsCount > 1 ? "s" : ""}`
                      : "No active medications"}
                  </span>
                </div>

                {/* Vitals */}
                <div className="prep-fact-block">
                  <span className="prep-fact-label">
                    Latest Vitals
                    {item.vitals?.recordedAt && (
                      <small className="prep-vitals-date"> ({formatClinicalDate(item.vitals.recordedAt)})</small>
                    )}
                  </span>
                  <span className="prep-fact-val">
                    {hasVitals ? (
                      <span className="prep-vitals-values">
                        {item.vitals.bp && <span>BP {item.vitals.bp}</span>}
                        {item.vitals.hr && <span>HR {item.vitals.hr}</span>}
                        {item.vitals.wt && <span>Wt {item.vitals.wt}</span>}
                      </span>
                    ) : (
                      "No recorded vitals"
                    )}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="visit-prep-actions">
                {onStartVisit ? (
                  <Button
                    variant="primary"
                    size="sm"
                    icon="play_arrow"
                    onClick={() => onStartVisit(item.patientId, item.patientName, item.appointmentId)}
                  >
                    Start Visit
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    size="sm"
                    icon="edit"
                    onClick={() => onOpenChart(item.patientId, "Encounter")}
                  >
                    Open Encounter
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={() => onOpenChart(item.patientId)}
                >
                  Review Chart
                </Button>
              </div>
            </div>
          );
        })}
      </AsyncSection>
    </div>
  );
}
