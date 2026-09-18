"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Button from "../ui/Button";
import Icon from "../ui/Icon";
import AsyncSection from "../ui/AsyncSection";
import PreviewWindowFrame from "./PreviewWindowFrame";
import PreviewRoster, { PreviewCancelledStrip } from "./PreviewRoster";
import PreviewDetailPanel, {
  type PreviewCancellationDraft,
  type PreviewSelection,
} from "./PreviewDetailPanel";
import { PreviewDemoFigures, PreviewWorkList } from "./PreviewWindowBodies";
import {
  PREVIEW_ARRIVAL_ITEMS,
  PREVIEW_BILLING_FIGURES,
  PREVIEW_BUSINESS_FIGURES,
  PREVIEW_DAYS,
  PREVIEW_FOLLOWUP_ITEMS,
  PREVIEW_HANDOFF_ITEMS,
  PREVIEW_INTAKE_ITEMS,
  PREVIEW_MED_ITEMS,
  PREVIEW_MESSAGE_ITEMS,
  PREVIEW_PREP_ITEMS,
  previewDay,
  type PreviewDayId,
  type PreviewVisit,
} from "../../lib/preview/dashboard-preview-fixtures";
import {
  PREVIEW_PERSONAS,
  PREVIEW_ROSTER_FIELDS,
  activeVisits,
  addableWindows,
  canHide,
  canMove,
  cancelledVisits,
  cycleSpan,
  deleteSavedLayout,
  findSavedLayout,
  hiddenWindows,
  layoutForPersona,
  matchesLayoutRef,
  moveWindow,
  presetLayout,
  previewPersona,
  previewWindow,
  saveLayout,
  savedLayoutsFor,
  setDensity,
  initialSession,
  migratePreviewSession,
  setScheduleView,
  setWindowVisible,
  toggleCollapse,
  toggleRosterField,
  type PreviewDensity,
  type PreviewLayout,
  type PreviewLayoutRef,
  type PreviewPersonaId,
  type PreviewPresetId,
  type PreviewSavedLayout,
  type PreviewSession,
  type PreviewWindowId,
  type PreviewWindowPhase,
} from "../../lib/preview/dashboard-preview-model";

/**
 * The DB-1 dashboard prototype.
 *
 * This is a design review surface, not a second dashboard. It renders entirely from
 * `dashboard-preview-fixtures` and makes no network request of any kind, so no demo
 * control can reach a clinical write however it is used. It is reachable only at
 * `/preview/dashboard`, wears a banner that says what it is, and the real home is
 * untouched until Logan has seen this and said what should change.
 *
 * What it is here to let him judge, in his own hands rather than in prose:
 *
 * - the schedule dominating the home, with the timeline as a choice rather than the
 *   default (DASH-01);
 * - the same schedule read three ways, by a prescriber, an owner and a practice
 *   manager, without three applications behind it (DASH-07);
 * - what personal configuration actually feels like — add, hide, move, resize,
 *   collapse, restore, and the row fields (DASH-03);
 * - that a schedule row has two targets and that neither of them starts a visit
 *   (DASH-05);
 * - that a window tells the truth about what it knows (DASH-11).
 *
 * The arrangement is kept in this session's `sessionStorage` and says so. A
 * prototype that claimed "Saved" would be fabricating the one thing DASH-08 is
 * about.
 */

const STORAGE_KEY = "ehr_dashboard_preview_v1";

export default function DashboardPreview() {
  const [session, setSession] = useState<PreviewSession>(initialSession);
  const [restored, setRestored] = useState(false);
  const [editing, setEditing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [selection, setSelection] = useState<PreviewSelection | null>(null);
  const [fullScreen, setFullScreen] = useState(false);
  const [schedulePhase, setSchedulePhase] = useState<PreviewWindowPhase>("ready");
  const [announcement, setAnnouncement] = useState("");
  const addAnchor = useRef<HTMLDivElement | null>(null);

  const [savingLayout, setSavingLayout] = useState(false);
  const [layoutName, setLayoutName] = useState("");

  const { personaId, layoutRef, layout, dayId, saved, cancellations } = session;
  const persona = previewPersona(personaId);
  const day = previewDay(dayId);

  /* The arrangement survives a reload of the preview, and only of the preview. */
  useEffect(() => {
    try {
      const stored = window.sessionStorage.getItem(STORAGE_KEY);
      if (stored) setSession(migratePreviewSession(JSON.parse(stored)));
    } catch {
      // A prototype that refuses to open because a stored arrangement is unreadable
      // is worse than one that starts fresh.
      setSession(initialSession());
    }
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) return;
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } catch {
      /* Private browsing, and nothing here is worth failing the page over. */
    }
  }, [session, restored]);

  const announce = useCallback((message: string) => setAnnouncement(message), []);

  const applyLayout = useCallback((next: PreviewLayout) => {
    setSession((current) => ({ ...current, layout: next }));
  }, []);

  function choosePersona(nextPersona: PreviewPersonaId) {
    setSession((current) => ({
      ...current,
      personaId: nextPersona,
      layoutRef: { kind: "preset", preset: "calm" },
      layout: layoutForPersona(nextPersona, "calm"),
    }));
    setSelection(null);
    setFullScreen(false);
    setSavingLayout(false);
    announce(`Switched to the ${previewPersona(nextPersona).label} preview. Layout only — no permission changes.`);
  }

  function choosePreset(nextPreset: PreviewPresetId) {
    setSession((current) => ({
      ...current,
      layoutRef: { kind: "preset", preset: nextPreset },
      layout: presetLayout(current.personaId, nextPreset),
    }));
    announce(`Applied the ${persona.presets[nextPreset].label} layout.`);
  }

  function chooseSavedLayout(entry: PreviewSavedLayout) {
    setSession((current) => ({
      ...current,
      layoutRef: { kind: "saved", id: entry.id },
      layout: { ...entry.layout, windows: entry.layout.windows.map((window) => ({ ...window })) },
    }));
    announce(`Applied the saved layout ${entry.name}.`);
  }

  function commitSavedLayout() {
    const result = saveLayout(saved, { name: layoutName, personaId, layout });
    if (!result) return;
    setSession((current) => ({
      ...current,
      saved: result.saved,
      layoutRef: { kind: "saved", id: result.id },
    }));
    setLayoutName("");
    setSavingLayout(false);
    announce(`Saved this arrangement as ${layoutName.trim()}.`);
  }

  function removeSavedLayout(entry: PreviewSavedLayout) {
    setSession((current) => ({
      ...current,
      saved: deleteSavedLayout(current.saved, entry.id),
      layoutRef:
        current.layoutRef.kind === "saved" && current.layoutRef.id === entry.id
          ? { kind: "preset", preset: "calm" }
          : current.layoutRef,
      layout:
        current.layoutRef.kind === "saved" && current.layoutRef.id === entry.id
          ? presetLayout(current.personaId, "calm")
          : current.layout,
    }));
    announce(`Deleted the saved layout ${entry.name}.`);
  }

  function recordCancellation(visitId: string, draft: PreviewCancellationDraft) {
    setSession((current) => ({
      ...current,
      cancellations: { ...current.cancellations, [visitId]: draft },
    }));
    announce("Recorded a cancellation reason in this preview. Nothing was written to a record.");
  }

  const edited = !matchesLayoutRef(layout, personaId, layoutRef, saved);
  const mySavedLayouts = savedLayoutsFor(saved, personaId);
  const activeLayoutName =
    layoutRef.kind === "preset"
      ? persona.presets[layoutRef.preset].label
      : findSavedLayout(saved, layoutRef.id)?.name ?? "Saved layout";

  const dayActiveVisits = useMemo(() => activeVisits(day.visits), [day.visits]);
  const dayCancelledVisits = useMemo(() => cancelledVisits(day.visits), [day.visits]);
  const hidden = hiddenWindows(layout).filter((window) => canHide(window.id));
  const addable = addableWindows(layout, personaId);

  const visibleForPersona = useMemo(
    () => layout.windows.filter((window) => window.visible && previewWindow(window.id).availableTo.includes(personaId)),
    [layout.windows, personaId],
  );

  const sameDayVisits = useMemo(() => {
    if (!selection) return [];
    return day.visits.filter((visit) => visit.patientId === selection.visit.patientId);
  }, [selection, day.visits]);

  function openVisit(visit: PreviewVisit) {
    setSelection({ kind: "visit", visit });
    announce(`Opened visit information for ${visit.patientName} at ${visit.time}. Nothing changed.`);
  }

  function openChart(visit: PreviewVisit) {
    setSelection({ kind: "chart", visit });
    announce(`Opened ${visit.patientName}'s chart.`);
  }

  /**
   * Changing the day closes an open detail.
   *
   * The panel is bound to one appointment on one day. Leaving it open over a
   * different day would show visit information beside a schedule that does not
   * contain it — exactly the kind of quiet mismatch between what is selected and
   * what is on screen that the two-target design exists to prevent.
   */
  function chooseDay(next: PreviewDayId) {
    setSession((current) => ({ ...current, dayId: next }));
    setSelection(null);
    setFullScreen(false);
  }

  /* ---------------------------------------------------------------------- */

  if (fullScreen && selection) {
    return (
      <div className="dash-preview" data-preview="dashboard" data-fullscreen="true">
        <PreviewBanner />
        <PreviewDetailPanel
          selection={selection}
          sameDayVisits={sameDayVisits}
          fullScreen
          cancellationDraft={cancellations[selection.visit.id]}
          onSaveCancellation={recordCancellation}
          onClose={() => {
            setFullScreen(false);
            setSelection(null);
          }}
          onOpenChart={openChart}
          onOpenVisit={openVisit}
          onToggleFullScreen={() => setFullScreen(false)}
        />
      </div>
    );
  }

  return (
    <div
      className={`dash-preview density-${layout.density}`}
      data-preview="dashboard"
      data-persona={personaId}
      data-layout-ref={layoutRef.kind === "preset" ? layoutRef.preset : layoutRef.id}
      data-day={dayId}
      data-editing={editing ? "true" : "false"}
    >
      <PreviewBanner />

      <div className="dash-preview-shell">
        <PreviewRail persona={persona.label} />

        <div className="dash-preview-main">
          <PreviewOmnibox />

          <div className="dash-preview-controls">
            <div className="dpc-group" role="group" aria-label="Persona">
              <span className="dpc-label" id="dp-persona-label">
                Preview as
              </span>
              <div className="dpc-chips" role="group" aria-labelledby="dp-persona-label">
                {PREVIEW_PERSONAS.map((candidate) => (
                  <Button
                    key={candidate.id}
                    size="sm"
                    pressed={candidate.id === personaId}
                    onClick={() => choosePersona(candidate.id)}
                    data-persona-choice={candidate.id}
                  >
                    {candidate.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="dpc-group" role="group" aria-label="Saved layouts">
              <span className="dpc-label" id="dp-layout-label">
                Layout
              </span>
              <div className="dpc-chips" role="group" aria-labelledby="dp-layout-label">
                {(["calm", "dense"] as PreviewPresetId[]).map((candidate) => (
                  <Button
                    key={candidate}
                    size="sm"
                    icon="dashboard_customize"
                    pressed={layoutRef.kind === "preset" && layoutRef.preset === candidate && !edited}
                    onClick={() => choosePreset(candidate)}
                    data-preset-choice={candidate}
                  >
                    {persona.presets[candidate].label}
                  </Button>
                ))}

                {/* Layouts this person saved. Only this persona's: a clinical
                    arrangement offered in the practice-manager view would be the
                    "layout implies access" confusion again. */}
                {mySavedLayouts.map((entry) => (
                  <span key={entry.id} className="dpc-saved">
                    <Button
                      size="sm"
                      icon="bookmark"
                      pressed={layoutRef.kind === "saved" && layoutRef.id === entry.id && !edited}
                      onClick={() => chooseSavedLayout(entry)}
                      data-saved-layout={entry.id}
                    >
                      {entry.name}
                    </Button>
                    <Button
                      variant="icon"
                      size="sm"
                      icon="close"
                      aria-label={`Delete the saved layout ${entry.name}`}
                      onClick={() => removeSavedLayout(entry)}
                    />
                  </span>
                ))}

                {edited && (
                  <span className="dpc-edited" data-layout-edited="true">
                    {activeLayoutName} · edited
                  </span>
                )}

                {savingLayout ? (
                  <form
                    className="dpc-save-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      commitSavedLayout();
                    }}
                  >
                    <label className="sr-only" htmlFor="dp-layout-name">
                      Name for this layout
                    </label>
                    <input
                      id="dp-layout-name"
                      value={layoutName}
                      autoFocus
                      placeholder="Name this layout"
                      onChange={(event) => setLayoutName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          setSavingLayout(false);
                          setLayoutName("");
                        }
                      }}
                    />
                    {layoutName.trim() ? (
                      <Button size="sm" type="submit" variant="primary">
                        Save
                      </Button>
                    ) : (
                      <Button size="sm" variant="primary" disabled disabledReason="Give the layout a name first.">
                        Save
                      </Button>
                    )}
                  </form>
                ) : (
                  <Button
                    size="sm"
                    icon="bookmark_add"
                    onClick={() => setSavingLayout(true)}
                    data-save-layout="true"
                  >
                    Save layout
                  </Button>
                )}
              </div>
            </div>

            <div className="dpc-group dpc-actions">
              <div className="dpc-add-anchor" ref={addAnchor}>
                <Button
                  size="sm"
                  icon="add"
                  aria-expanded={addOpen}
                  pressed={addOpen}
                  {...(addable.length > 0
                    ? { onClick: () => setAddOpen((open) => !open) }
                    : {
                        disabled: true as const,
                        disabledReason: "Every window available to this persona is already on the dashboard.",
                      })}
                >
                  Add window
                </Button>
                {addOpen && (
                  <AddWindowMenu
                    anchor={addAnchor}
                    options={addable}
                    onClose={() => setAddOpen(false)}
                    onAdd={(id) => {
                      applyLayout(setWindowVisible(layout, id, true));
                      setAddOpen(false);
                      announce(`Added ${previewWindow(id).title}.`);
                    }}
                  />
                )}
              </div>

              <Button
                size="sm"
                icon="edit_square"
                pressed={editing}
                onClick={() => setEditing((value) => !value)}
                data-edit-layout-toggle="true"
              >
                {editing ? "Done editing" : "Edit layout"}
              </Button>

              <span className="dpc-save-note" data-preview-save-note="true">
                <Icon name="info" size="sm" />
                Kept in this browser tab only — the preview never saves to your account.
              </span>
            </div>
          </div>

          <p className="dash-preview-persona-line">
            <strong>{persona.label}.</strong> {persona.description}
          </p>

          <div className="dash-preview-canvas">
            {visibleForPersona.map((window) => {
              const definition = previewWindow(window.id);
              return (
                <PreviewWindowFrame
                  key={window.id}
                  definition={definition}
                  span={window.span}
                  collapsed={window.collapsed}
                  editing={editing}
                  canMoveUp={canMove(layout, window.id, "up")}
                  canMoveDown={canMove(layout, window.id, "down")}
                  onMoveUp={() => {
                    applyLayout(moveWindow(layout, window.id, "up"));
                    announce(`Moved ${definition.title} up.`);
                  }}
                  onMoveDown={() => {
                    applyLayout(moveWindow(layout, window.id, "down"));
                    announce(`Moved ${definition.title} down.`);
                  }}
                  onToggleCollapse={() => applyLayout(toggleCollapse(layout, window.id))}
                  onCycleSpan={() => applyLayout(cycleSpan(layout, window.id))}
                  onHide={
                    canHide(window.id)
                      ? () => {
                          applyLayout(setWindowVisible(layout, window.id, false));
                          announce(`Hid ${definition.title}. Restore it from the bar below.`);
                        }
                      : undefined
                  }
                  headerNote={window.id === "schedule" ? <ScheduleHeaderNote dayId={dayId} phase={schedulePhase} day={day.heading} /> : undefined}
                  settings={
                    window.id === "schedule" ? (
                      <ScheduleSettings
                        layout={layout}
                        dayId={dayId}
                        phase={schedulePhase}
                        onLayout={applyLayout}
                        onDay={chooseDay}
                        onPhase={setSchedulePhase}
                      />
                    ) : (
                      <WindowSettings
                        title={definition.title}
                        summary={definition.summary}
                        density={layout.density}
                        onDensity={(next) => applyLayout(setDensity(layout, next))}
                      />
                    )
                  }
                >
                  {window.id === "schedule" ? (
                    <ScheduleBody
                      layout={layout}
                      phase={schedulePhase}
                      visits={dayActiveVisits}
                      cancelled={dayCancelledVisits}
                      recordedReasons={cancellations}
                      rowActions={persona.rowActions}
                      selectedVisitId={selection?.visit.id}
                      onOpenVisit={openVisit}
                      onOpenChart={openChart}
                      onRetry={() => setSchedulePhase("ready")}
                    />
                  ) : (
                    <OptionalWindowBody id={window.id} />
                  )}
                </PreviewWindowFrame>
              );
            })}
          </div>

          {hidden.length > 0 && (
            <div className="dash-preview-hidden" role="group" aria-label="Hidden windows">
              <span>
                <Icon name="visibility_off" size="sm" /> Hidden:
              </span>
              {hidden.map((window) => (
                <Button
                  key={window.id}
                  size="sm"
                  icon="undo"
                  onClick={() => {
                    applyLayout(setWindowVisible(layout, window.id, true));
                    announce(`Restored ${previewWindow(window.id).title}.`);
                  }}
                >
                  Restore {previewWindow(window.id).title}
                </Button>
              ))}
            </div>
          )}
        </div>

        {selection && (
          <PreviewDetailPanel
            selection={selection}
            sameDayVisits={sameDayVisits}
            fullScreen={false}
            cancellationDraft={cancellations[selection.visit.id]}
            onSaveCancellation={recordCancellation}
            onClose={() => setSelection(null)}
            onOpenChart={openChart}
            onOpenVisit={openVisit}
            onToggleFullScreen={() => setFullScreen(true)}
          />
        )}
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Shell pieces                                                                */
/* -------------------------------------------------------------------------- */

function PreviewBanner() {
  return (
    <div className="dash-preview-banner" role="note" data-preview-banner="true">
      <Icon name="science" size="sm" />
      <strong>Design preview — not a live record view.</strong>
      <span>
        Every patient, visit and figure below is invented for this prototype. Nothing here reads or
        writes the database, and no control performs a clinical action.
      </span>
    </div>
  );
}

/**
 * The small tool rail, kept small.
 *
 * LEFT-04 is explicit that Patients is not a required rail item, so it is not one
 * here either: patients are found through the omnibox. The rail is a picture of the
 * existing one rather than the live component, because mounting the real rail would
 * pull the workspace machinery into a page that must not have it.
 */
function PreviewRail({ persona }: { persona: string }) {
  const tools = [
    { icon: "calendar_month", label: "Today", active: true },
    { icon: "inbox", label: "Inbox" },
    { icon: "task_alt", label: "Tasks" },
    { icon: "science", label: "Labs" },
  ];
  return (
    <nav className="dash-preview-rail" aria-label="Tools (preview)">
      <button type="button" className="dp-rail-launcher" aria-label="All tools">
        <Icon name="apps" />
      </button>
      {tools.map((tool) => (
        <button
          key={tool.label}
          type="button"
          className={`dp-rail-tool ${tool.active ? "is-active" : ""}`}
          aria-current={tool.active ? "page" : undefined}
        >
          <Icon name={tool.icon} />
          <span>{tool.label}</span>
        </button>
      ))}
      <span className="dp-rail-persona" title="The persona this preview is showing">
        {persona.split(" ")[0]}
      </span>
    </nav>
  );
}

function PreviewOmnibox() {
  return (
    <div className="dash-preview-omnibox">
      <div className="patient-search-wrap">
        <Icon name="search" />
        <input
          type="text"
          readOnly
          aria-label="Search patients, records, or ask Clinical AI (preview — inactive)"
          placeholder="Search patients, records, or ask Clinical AI…"
        />
        <span className="command-ai-badge">
          <span>
            <Icon name="auto_awesome" />
          </span>{" "}
          AI
        </span>
        <button type="button" className="voice-toggle" aria-label="Voice input (preview — inactive)">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M6.5 10.5v.8a5.5 5.5 0 0 0 11 0v-.8M12 16.8V21M9 21h6" />
          </svg>
        </button>
        <kbd>Ctrl K</kbd>
      </div>
      <span className="dash-preview-omnibox-note">The real omnibox. Inactive in this preview.</span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Window contents                                                             */
/* -------------------------------------------------------------------------- */

function ScheduleHeaderNote({
  dayId,
  phase,
  day,
}: {
  dayId: PreviewDayId;
  phase: PreviewWindowPhase;
  day: string;
}) {
  return (
    <span className="dpw-schedule-note">
      {day}
      {dayId === "empty" && " · nothing scheduled"}
      {phase === "stale" && " · showing the last read"}
    </span>
  );
}

function ScheduleBody({
  layout,
  phase,
  visits,
  cancelled,
  recordedReasons,
  rowActions,
  selectedVisitId,
  onOpenVisit,
  onOpenChart,
  onRetry,
}: {
  layout: PreviewLayout;
  phase: PreviewWindowPhase;
  /** The day's work. Cancellations are not in here. */
  visits: readonly PreviewVisit[];
  cancelled: readonly PreviewVisit[];
  recordedReasons: Record<string, PreviewCancellationDraft>;
  rowActions: readonly string[];
  selectedVisitId?: string;
  onOpenVisit: (visit: PreviewVisit) => void;
  onOpenChart: (visit: PreviewVisit) => void;
  onRetry: () => void;
}) {
  return (
    <>
      {phase === "stale" && (
        <p className="dp-stale" role="status">
          <Icon name="cloud_off" size="sm" />
          Disconnected — this is the last successful read, not the current day. Times and statuses
          may have moved since.
        </p>
      )}
      <AsyncSection
        loading={phase === "loading"}
        error={phase === "error" ? "The schedule could not be loaded." : null}
        isEmpty={visits.length === 0}
        hasLoadedOnce={phase === "stale"}
        loadingMessage="Loading the schedule…"
        emptyMessage="Nothing is scheduled for this day."
        onRetry={onRetry}
      >
        <PreviewRoster
          visits={visits}
          fields={layout.rosterFields}
          view={layout.scheduleView}
          rowActions={rowActions}
          selectedVisitId={selectedVisitId}
          onOpenVisit={onOpenVisit}
          onOpenChart={onOpenChart}
        />
      </AsyncSection>

      {/* Outside the AsyncSection on purpose: a day whose only remaining entries
          are cancellations is still an empty day's work, and must read as one. */}
      {phase !== "loading" && phase !== "error" && (
        <PreviewCancelledStrip
          visits={cancelled}
          recordedReasons={recordedReasons}
          selectedVisitId={selectedVisitId}
          onOpenVisit={onOpenVisit}
        />
      )}
    </>
  );
}

function OptionalWindowBody({ id }: { id: PreviewWindowId }) {
  switch (id) {
    case "prep":
      return <PreviewWorkList items={PREVIEW_PREP_ITEMS} emptyMessage="Nothing to read before the next visits." />;
    case "followups":
      return <PreviewWorkList items={PREVIEW_FOLLOWUP_ITEMS} emptyMessage="No unsigned work and nothing to acknowledge." />;
    case "medwork":
      return <PreviewWorkList items={PREVIEW_MED_ITEMS} emptyMessage="No medication or lab work waiting." />;
    case "messages":
      return <PreviewWorkList items={PREVIEW_MESSAGE_ITEMS} emptyMessage="No unanswered messages or calls." />;
    case "arrivals":
      return <PreviewWorkList items={PREVIEW_ARRIVAL_ITEMS} emptyMessage="Nobody has arrived yet." />;
    case "intake":
      return <PreviewWorkList items={PREVIEW_INTAKE_ITEMS} emptyMessage="Coverage and forms are complete for this day." />;
    case "handoffs":
      return <PreviewWorkList items={PREVIEW_HANDOFF_ITEMS} emptyMessage="Nothing has been handed over." />;
    case "billing":
      return <PreviewDemoFigures figures={PREVIEW_BILLING_FIGURES} />;
    case "business":
      return <PreviewDemoFigures figures={PREVIEW_BUSINESS_FIGURES} />;
    default:
      return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Settings popovers                                                           */
/* -------------------------------------------------------------------------- */

function ScheduleSettings({
  layout,
  dayId,
  phase,
  onLayout,
  onDay,
  onPhase,
}: {
  layout: PreviewLayout;
  dayId: PreviewDayId;
  phase: PreviewWindowPhase;
  onLayout: (next: PreviewLayout) => void;
  onDay: (next: PreviewDayId) => void;
  onPhase: (next: PreviewWindowPhase) => void;
}) {
  return (
    <div className="dp-settings">
      <fieldset>
        <legend>View</legend>
        <div className="dp-settings-chips">
          <Button size="sm" icon="list" pressed={layout.scheduleView === "roster"} onClick={() => onLayout(setScheduleView(layout, "roster"))}>
            Roster
          </Button>
          <Button size="sm" icon="schedule" pressed={layout.scheduleView === "timeline"} onClick={() => onLayout(setScheduleView(layout, "timeline"))}>
            Timeline
          </Button>
        </div>
      </fieldset>

      <fieldset>
        <legend>Density</legend>
        <div className="dp-settings-chips">
          {(["comfortable", "compact"] as PreviewDensity[]).map((candidate) => (
            <Button key={candidate} size="sm" pressed={layout.density === candidate} onClick={() => onLayout(setDensity(layout, candidate))}>
              {candidate === "comfortable" ? "Comfortable" : "Compact"}
            </Button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Row fields</legend>
        <div className="dp-settings-chips">
          {PREVIEW_ROSTER_FIELDS.map((field) => (
            <Button
              key={field.id}
              size="sm"
              pressed={layout.rosterFields.includes(field.id)}
              onClick={() => onLayout(toggleRosterField(layout, field.id))}
              data-roster-field={field.id}
            >
              {field.label}
            </Button>
          ))}
        </div>
        <p className="dp-settings-note">
          The patient&apos;s name always stays. Identity is not a field a layout may switch off.
        </p>
      </fieldset>

      <fieldset>
        <legend>Preview day</legend>
        <div className="dp-settings-chips">
          {PREVIEW_DAYS.map((candidate) => (
            <Button key={candidate.id} size="sm" pressed={candidate.id === dayId} onClick={() => onDay(candidate.id)} data-preview-day={candidate.id}>
              {candidate.label}
            </Button>
          ))}
        </div>
        <p className="dp-settings-note">{previewDay(dayId).note}</p>
      </fieldset>

      <fieldset>
        <legend>Window state</legend>
        <div className="dp-settings-chips">
          {(["ready", "loading", "error", "stale"] as PreviewWindowPhase[]).map((candidate) => (
            <Button key={candidate} size="sm" pressed={candidate === phase} onClick={() => onPhase(candidate)} data-window-phase={candidate}>
              {candidate}
            </Button>
          ))}
        </div>
        <p className="dp-settings-note">
          Each state is distinct on purpose. A failed load must never look like an empty day.
        </p>
      </fieldset>
    </div>
  );
}

function WindowSettings({
  title,
  summary,
  density,
  onDensity,
}: {
  title: string;
  summary: string;
  density: PreviewDensity;
  onDensity: (next: PreviewDensity) => void;
}) {
  return (
    <div className="dp-settings">
      <p className="dp-settings-summary">
        <strong>{title}</strong>
        {summary}
      </p>
      <fieldset>
        <legend>Density</legend>
        <div className="dp-settings-chips">
          {(["comfortable", "compact"] as PreviewDensity[]).map((candidate) => (
            <Button key={candidate} size="sm" pressed={density === candidate} onClick={() => onDensity(candidate)}>
              {candidate === "comfortable" ? "Comfortable" : "Compact"}
            </Button>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

function AddWindowMenu({
  anchor,
  options,
  onAdd,
  onClose,
}: {
  anchor: React.RefObject<HTMLDivElement | null>;
  options: ReturnType<typeof addableWindows>;
  onAdd: (id: PreviewWindowId) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    function onPointer(event: PointerEvent) {
      if (!anchor.current?.contains(event.target as Node)) onClose();
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [anchor, onClose]);

  return (
    <div className="dp-add-menu" role="menu" aria-label="Add a window">
      {options.map((option) => (
        <button key={option.id} type="button" role="menuitem" className="dp-add-item" onClick={() => onAdd(option.id)} data-add-window={option.id}>
          <Icon name={option.icon} size="sm" />
          <span>
            <strong>
              {option.title}
              {option.financialDemo ? " (Demo)" : ""}
            </strong>
            <small>{option.summary}</small>
          </span>
        </button>
      ))}
      <p className="dp-add-note">
        Only windows backed by work this product actually does. Availability here is a starting
        point, never a permission.
      </p>
    </div>
  );
}
