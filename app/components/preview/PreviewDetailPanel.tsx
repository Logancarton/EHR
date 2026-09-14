"use client";

import Button from "../ui/Button";
import Icon from "../ui/Icon";
import StatusBadge from "../ui/StatusBadge";
import {
  PREVIEW_VISIT_STATUS_LABEL,
  type PreviewVisit,
} from "../../lib/preview/dashboard-preview-fixtures";

/**
 * What opening a schedule row leads to (DASH-05, DASH-06).
 *
 * The panel exists to make one distinction inspectable rather than argued about:
 * the visit target opens *this appointment*, the name opens *the whole chart*, and
 * neither one starts a visit. The prototype says so on the surface, because the
 * defect this replaces is an EHR where clicking a row quietly moves the patient to
 * "in visit" and opens a draft nobody asked for.
 *
 * The patient stays anchored while the detail is open — the schedule does not
 * disappear underneath it — and full screen has one obvious way back.
 */

export type PreviewSelection =
  | { kind: "visit"; visit: PreviewVisit }
  | { kind: "chart"; visit: PreviewVisit };

const CHART_SECTIONS = ["Overview", "Encounter", "Medications", "Labs", "Messages", "History"];

export default function PreviewDetailPanel({
  selection,
  sameDayVisits,
  fullScreen,
  onClose,
  onOpenChart,
  onOpenVisit,
  onToggleFullScreen,
}: {
  selection: PreviewSelection;
  /** Every visit this patient has on the day being shown, including this one. */
  sameDayVisits: readonly PreviewVisit[];
  fullScreen: boolean;
  onClose: () => void;
  onOpenChart: (visit: PreviewVisit) => void;
  onOpenVisit: (visit: PreviewVisit) => void;
  onToggleFullScreen: () => void;
}) {
  const { visit } = selection;

  return (
    <aside
      className={`dp-detail ${fullScreen ? "is-fullscreen" : ""}`}
      data-detail-kind={selection.kind}
      aria-label={selection.kind === "visit" ? "Visit information" : "Patient chart"}
    >
      <header className="dp-detail-head">
        {fullScreen && (
          <Button size="sm" icon="arrow_back" onClick={onToggleFullScreen}>
            Back to the dashboard
          </Button>
        )}
        <div className="dp-detail-title">
          <Icon name={selection.kind === "visit" ? "event_note" : "folder_shared"} size="sm" />
          <span>{selection.kind === "visit" ? "Visit information" : "Patient chart"}</span>
        </div>
        <div className="dp-detail-head-tools">
          {!fullScreen && (
            <Button
              variant="icon"
              size="sm"
              icon="open_in_full"
              aria-label="Open full screen"
              onClick={onToggleFullScreen}
            />
          )}
          <Button variant="icon" size="sm" icon="close" aria-label="Close" onClick={onClose} />
        </div>
      </header>

      {/* The patient stays named at the top of both views, in both densities. */}
      <div className="dp-detail-patient">
        <strong>{visit.patientName}</strong>
        <span>
          {visit.age}y · DOB {visit.dob} · MRN {visit.mrn}
        </span>
      </div>

      {selection.kind === "visit" ? (
        <div className="dp-detail-body">
          <p className="dp-detail-assurance" role="note">
            <Icon name="info" size="sm" />
            Opening this visit changed nothing. No status moved, no encounter was created, and no
            draft was opened.
          </p>

          <dl className="dp-detail-facts">
            <div>
              <dt>Appointment</dt>
              <dd>
                <code>{visit.id}</code>
              </dd>
            </div>
            <div>
              <dt>When</dt>
              <dd>
                {visit.time} · {visit.durationMinutes} min
              </dd>
            </div>
            <div>
              <dt>Type</dt>
              <dd>{visit.visitType}</dd>
            </div>
            <div>
              <dt>Reason</dt>
              <dd>{visit.reason}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                <StatusBadge tone="neutral" shape="pill">
                  {PREVIEW_VISIT_STATUS_LABEL[visit.status]}
                </StatusBadge>
              </dd>
            </div>
            <div>
              <dt>Where</dt>
              <dd>{visit.room ? `Room ${visit.room}` : visit.telehealth ? "Telehealth" : "Not assigned"}</dd>
            </div>
            <div>
              <dt>Coverage</dt>
              <dd>
                {visit.insurance}
                {visit.coverageNote ? ` — ${visit.coverageNote}` : ""}
              </dd>
            </div>
          </dl>

          {sameDayVisits.length > 1 && (
            <section className="dp-detail-sibling">
              <h4>This patient has {sameDayVisits.length} visits on this day</h4>
              <p>Each is its own appointment. Signing one does not close the other.</p>
              <ul>
                {sameDayVisits.map((sibling) => (
                  <li key={sibling.id}>
                    <button
                      type="button"
                      className="dp-linkish"
                      onClick={() => onOpenVisit(sibling)}
                      aria-current={sibling.id === visit.id ? "true" : undefined}
                    >
                      {sibling.time} · {sibling.visitType}
                      {sibling.id === visit.id ? " (open)" : ""}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="dp-detail-actions">
            <Button variant="primary" size="sm" icon="play_arrow" disabled disabledReason="Preview only — starting a visit is a clinical write and is not wired up here.">
              Start the visit
            </Button>
            <Button size="sm" icon="folder_shared" onClick={() => onOpenChart(visit)}>
              Open the chart instead
            </Button>
          </div>
          <p className="dp-detail-footnote">
            Starting a visit is a separate, deliberate step — it is never a side effect of looking at
            the schedule.
          </p>
        </div>
      ) : (
        <div className="dp-detail-body">
          <p className="dp-detail-assurance" role="note">
            <Icon name="info" size="sm" />
            The chart opens as a workspace, not a page. In the real product this is the existing
            patient workspace with its tabs, drafts and scroll position preserved.
          </p>

          <nav className="dp-detail-sections" aria-label="Chart sections">
            {CHART_SECTIONS.map((section, index) => (
              <button key={section} type="button" className="dp-detail-section" aria-current={index === 0 ? "page" : undefined}>
                {section}
              </button>
            ))}
          </nav>

          <section className="dp-detail-sibling">
            <h4>{sameDayVisits.length === 1 ? "Today's visit" : `Today's ${sameDayVisits.length} visits`}</h4>
            <ul>
              {sameDayVisits.map((sibling) => (
                <li key={sibling.id}>
                  <button type="button" className="dp-linkish" onClick={() => onOpenVisit(sibling)}>
                    {sibling.time} · {sibling.visitType} — open this visit
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <p className="dp-detail-footnote">
            One chart, however many visits. The appointment identity stays with the visit, not with
            the patient.
          </p>
        </div>
      )}
    </aside>
  );
}
