import type { Section } from "../domain/patient";
import { moduleTitle, type GlobalWorkspaceModule } from "./workspace-navigation";

export type WorkspaceCanvasView = "home" | "today" | "calendar" | "patient";
export type WorkspaceCustomizerTab =
  | "today"
  | "overview"
  | "density"
  | "encounter"
  | "saved";

export type WorkspaceCanvasContext = {
  /** Stable identity of the canvas currently in front of the clinician. */
  tabId: string;
  kind: "patient" | "workspace";
  label: string;
  patientId?: string;
  section?: Section;
  customizerTab: WorkspaceCustomizerTab;
};

export function deriveWorkspaceCanvasContext({
  activeView,
  activeModule,
  activePatientId,
  activePatientName,
  patientSection,
}: {
  activeView: WorkspaceCanvasView;
  activeModule: GlobalWorkspaceModule | null;
  activePatientId?: string | null;
  activePatientName?: string | null;
  patientSection?: Section;
}): WorkspaceCanvasContext {
  // A practice module is a foreground canvas over the remembered chart tab. The
  // chart remains open, but it is not implicit execution context while the module
  // is in front. This precedence is the cross-patient safety rule.
  if (activeModule) {
    return {
      tabId: `module:${activeModule}`,
      kind: "workspace",
      label: `${moduleTitle(activeModule)} workspace`,
      customizerTab: "density",
    };
  }

  if (activeView === "patient" && activePatientId) {
    const section = patientSection ?? "Overview";
    return {
      tabId: `patient:${activePatientId}`,
      kind: "patient",
      label: `${activePatientName || "Patient chart"} · ${section}`,
      patientId: activePatientId,
      section,
      customizerTab: section === "Encounter" ? "encounter" : "overview",
    };
  }

  if (activeView === "today") {
    return {
      tabId: "workspace:today",
      kind: "workspace",
      label: "Today Dashboard",
      customizerTab: "today",
    };
  }

  if (activeView === "calendar") {
    return {
      tabId: "workspace:calendar",
      kind: "workspace",
      label: "Calendar workspace",
      customizerTab: "density",
    };
  }

  return {
    tabId: activeView === "patient" ? "workspace:patient-empty" : "workspace:home",
    kind: "workspace",
    label: activeView === "patient" ? "Patient workspace" : "Home",
    customizerTab: "density",
  };
}
