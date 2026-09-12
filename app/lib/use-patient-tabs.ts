"use client";

import { useCallback, useEffect, useState } from "react";
import type { Patient, Section } from "../domain/patient";
import { findRosterPatient, retainAccessiblePatientIds } from "./patient-roster";

/**
 * Which charts are open, where each one sits, and how the clinician moves between
 * them.
 *
 * Pulled out of `PatientWorkspace` whole. This is the browser-like part of the
 * product — tabs, detached windows, split screen, drag to reorder — and it is
 * genuinely one responsibility, distinct from the omnibox, the companion rail or
 * the order cart it used to sit beside.
 *
 * Every entry point into a chart passes `isReachable` first. A schedule row, a saved
 * workspace, a queue link or a voice command may all name a patient this clinician
 * cannot reach, and opening a tab for one would show a chart the backend then
 * refuses to fill.
 */

export type WorkspaceView = "today" | "patient";

export type PatientTabs = {
  activeView: WorkspaceView;
  setActiveView: (view: WorkspaceView) => void;
  openPatientIds: string[];
  detachedPatientIds: string[];
  dockedPatientIds: string[];
  activePatientId: string;
  setActivePatientId: (id: string) => void;
  patientSections: Record<string, Section>;
  section: Section;
  setPatientSection: (patientId: string, next: Section) => void;
  setSection: (next: Section) => void;
  draggedId: string | null;
  setDraggedId: (id: string | null) => void;

  isReachable: (patientId: string) => boolean;
  openPatient: (id: string, targetSection?: Section) => void;
  openChart: (patientId: string, targetSection?: string) => void;
  startVisit: (patientId: string, patientName: string) => void;
  closePatient: (id: string) => void;
  reorderTab: (targetId: string) => void;
  detachPatient: (id: string) => void;
  dockPatient: (id: string, targetId?: string) => void;
  splitScreenPatient: (targetId: string) => void;
  startPatientDrag: (id: string, event: React.DragEvent<HTMLElement>) => void;
};

export function usePatientTabs({
  roster,
  rosterReady,
  announce,
  onChartOpened,
}: {
  roster: readonly Patient[];
  /** The roster has answered; until it has, nothing is treated as reachable. */
  rosterReady: boolean;
  /** Surfaces a transient message to the clinician. */
  announce: (message: string, holdMs?: number) => void;
  /**
   * Called when an explicit open brings a chart to the front.
   *
   * The shell uses it to close the omnibox. Opening a chart from a search result
   * that leaves the results covering the tab strip is the kind of thing only a
   * browser test notices, so the callback is part of the contract rather than
   * something each call site remembers.
   */
  onChartOpened?: () => void;
}): PatientTabs {
  const [activeView, setActiveView] = useState<WorkspaceView>("today");
  const [openPatientIds, setOpenPatientIds] = useState<string[]>([]);
  const [detachedPatientIds, setDetachedPatientIds] = useState<string[]>([]);
  const [patientSections, setPatientSections] = useState<Record<string, Section>>({});
  const [activePatientId, setActivePatientId] = useState("");
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const dockedPatientIds = openPatientIds.filter((id) => !detachedPatientIds.includes(id));
  const section = patientSections[activePatientId] ?? "Overview";

  const setPatientSection = useCallback((patientId: string, next: Section) => {
    setPatientSections((current) => ({ ...current, [patientId]: next }));
  }, []);

  const setSection = useCallback(
    (next: Section) => setPatientSection(activePatientId, next),
    [activePatientId, setPatientSection],
  );

  /**
   * Access can change under a saved workspace: a chart moves to another organization,
   * an assignment is withdrawn, a patient is merged away. Once the roster is
   * authoritative, ids it no longer contains are dropped rather than left on screen
   * as tabs the backend will refuse to answer for.
   */
  useEffect(() => {
    if (!rosterReady) return;
    const keep = (current: string[]) => {
      const retained = retainAccessiblePatientIds(current, roster);
      return retained.length === current.length ? current : retained;
    };
    setOpenPatientIds(keep);
    setDetachedPatientIds(keep);
    setActivePatientId((current) => (current && !findRosterPatient(current, roster) ? "" : current));
  }, [rosterReady, roster]);

  const isReachable = useCallback(
    (patientId: string) => {
      if (findRosterPatient(patientId, roster)) return true;
      if (rosterReady) announce("That patient is not in your accessible roster.");
      return false;
    },
    [roster, rosterReady, announce],
  );

  const bringToFront = useCallback((id: string) => {
    setOpenPatientIds((current) => (current.includes(id) ? current : [...current, id]));
    setDetachedPatientIds((current) => current.filter((patientId) => patientId !== id));
    setActivePatientId(id);
  }, []);

  const openPatient = useCallback(
    (id: string, targetSection?: Section) => {
      if (!isReachable(id)) return;
      bringToFront(id);
      if (targetSection) setPatientSection(id, targetSection);
      setActiveView("patient");
      onChartOpened?.();
    },
    [isReachable, bringToFront, setPatientSection, onChartOpened],
  );

  const openChart = useCallback(
    (patientId: string, targetSection?: string) => {
      if (!isReachable(patientId)) return;
      bringToFront(patientId);
      if (targetSection) setPatientSection(patientId, targetSection as Section);
      setActiveView("patient");
    },
    [isReachable, bringToFront, setPatientSection],
  );

  const startVisit = useCallback(
    (patientId: string, patientName: string) => {
      if (!isReachable(patientId)) return;
      bringToFront(patientId);
      setPatientSection(patientId, "Encounter");
      setActiveView("patient");
      announce(`Started encounter for ${patientName}`);
    },
    [isReachable, bringToFront, setPatientSection, announce],
  );

  const closePatient = useCallback(
    (id: string) => {
      const detachedAfterClose = detachedPatientIds.filter((patientId) => patientId !== id);
      setDetachedPatientIds(detachedAfterClose);
      setPatientSections((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });

      setOpenPatientIds((current) => {
        const remaining = current.filter((patientId) => patientId !== id);
        if (id === activePatientId) {
          const nextDocked = remaining.filter((patientId) => !detachedAfterClose.includes(patientId));
          // Closing the last chart leaves no patient active; the shell returns the
          // clinician to Today rather than to an arbitrary other patient.
          setActivePatientId(nextDocked.at(-1) ?? remaining.at(-1) ?? "");
        }
        return remaining;
      });
    },
    [detachedPatientIds, activePatientId],
  );

  const dockPatient = useCallback((id: string, targetId?: string) => {
    setDetachedPatientIds((current) => current.filter((patientId) => patientId !== id));

    if (targetId && targetId !== id) {
      setOpenPatientIds((current) => {
        const next = current.filter((patientId) => patientId !== id);
        const targetIndex = next.indexOf(targetId);
        if (targetIndex < 0) return [...next, id];
        next.splice(targetIndex, 0, id);
        return next;
      });
    }

    setActivePatientId(id);
    setDraggedId(null);
  }, []);

  const reorderTab = useCallback(
    (targetId: string) => {
      if (!draggedId || draggedId === targetId) return;

      if (detachedPatientIds.includes(draggedId)) {
        dockPatient(draggedId, targetId);
        return;
      }

      setOpenPatientIds((current) => {
        const next = [...current];
        const from = next.indexOf(draggedId);
        const to = next.indexOf(targetId);
        if (from < 0 || to < 0) return current;
        next.splice(from, 1);
        next.splice(to, 0, draggedId);
        return next;
      });
      setDraggedId(null);
    },
    [draggedId, detachedPatientIds, dockPatient],
  );

  const detachPatient = useCallback(
    (id: string) => {
      const docked = openPatientIds.filter((patientId) => !detachedPatientIds.includes(patientId));
      if (docked.length <= 1) {
        announce("Keep at least one patient docked in the main workspace.", 2200);
        setDraggedId(null);
        return;
      }

      setDetachedPatientIds((current) => (current.includes(id) ? current : [...current, id]));
      setPatientSections((current) => ({ ...current, [id]: current[id] ?? "Overview" }));

      if (id === activePatientId) {
        const nextActive = docked.find((patientId) => patientId !== id);
        if (nextActive) setActivePatientId(nextActive);
      }

      setDraggedId(null);
    },
    [openPatientIds, detachedPatientIds, activePatientId, announce],
  );

  const splitScreenPatient = useCallback(
    (targetId: string) => {
      if (!isReachable(targetId)) return;
      setOpenPatientIds((current) => (current.includes(targetId) ? current : [...current, targetId]));

      if (activePatientId === targetId) {
        const remainingDocked = openPatientIds.filter(
          (id) => id !== targetId && !detachedPatientIds.includes(id),
        );
        if (remainingDocked.length > 0) {
          setActivePatientId(remainingDocked[0]);
        } else {
          // A detached chart needs a docked one beside it. With no second accessible
          // patient there is nothing to pair it with, so the chart stays where it is.
          const companion = roster.find((p) => p.id !== targetId)?.id;
          if (!companion) {
            announce("Open a second patient to use split screen.", 2500);
            return;
          }
          setOpenPatientIds((current) => (current.includes(companion) ? current : [...current, companion]));
          setActivePatientId(companion);
        }
      }

      setDetachedPatientIds((current) => (current.includes(targetId) ? current : [...current, targetId]));
      setPatientSections((current) => ({ ...current, [targetId]: current[targetId] ?? "Overview" }));
      setActiveView("patient");
      announce(`Split screen opened with ${findRosterPatient(targetId, roster)?.name || targetId}`, 2500);
    },
    [isReachable, activePatientId, openPatientIds, detachedPatientIds, roster, announce],
  );

  const startPatientDrag = useCallback((id: string, event: React.DragEvent<HTMLElement>) => {
    setDraggedId(id);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-ehr-patient", id);
    event.dataTransfer.setData("text/plain", id);
  }, []);

  return {
    activeView,
    setActiveView,
    openPatientIds,
    detachedPatientIds,
    dockedPatientIds,
    activePatientId,
    setActivePatientId,
    patientSections,
    section,
    setPatientSection,
    setSection,
    draggedId,
    setDraggedId,
    isReachable,
    openPatient,
    openChart,
    startVisit,
    closePatient,
    reorderTab,
    detachPatient,
    dockPatient,
    splitScreenPatient,
    startPatientDrag,
  };
}
