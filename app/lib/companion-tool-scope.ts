import type { WorkspaceCanvasContext } from "./workspace-canvas-context";

export type PatientToolBinding = {
  patientId: string;
  patientName: string;
};

export type PatientToolScopeStatus = "active" | "inactive" | "unbound";

export type PatientToolScope = {
  kind: "patient";
  status: PatientToolScopeStatus;
  boundPatient: PatientToolBinding | null;
  canvas: WorkspaceCanvasContext;
  canMutate: boolean;
  badge: string;
  explanation: string;
};

/**
 * Patient-bound companion tools keep their own visible binding.
 *
 * A remembered chart behind Calendar, Intake, Home, or another patient is not an
 * execution target. The tool may remain open so unfinished work is not lost, but
 * chart mutations stay parked until the bound patient is foreground. D-116 record
 * tools may explicitly opt into retained patient actions on practice canvases;
 * this is never an authorization grant or an AI/assessment insertion bypass.
 */
export function derivePatientToolScope({
  workspaceContext,
  boundPatient,
  allowRetainedPatient = false,
}: {
  workspaceContext: WorkspaceCanvasContext;
  boundPatient: PatientToolBinding | null;
  allowRetainedPatient?: boolean;
}): PatientToolScope {
  if (!boundPatient) {
    return {
      kind: "patient",
      status: "unbound",
      boundPatient: null,
      canvas: workspaceContext,
      canMutate: false,
      badge: "No Active Chart",
      explanation: `Open a patient chart before using this patient-specific tool. Current canvas: ${workspaceContext.label}.`,
    };
  }

  const active =
    workspaceContext.kind === "patient" &&
    workspaceContext.patientId === boundPatient.patientId;

  if (allowRetainedPatient && workspaceContext.kind !== "patient") {
    return { kind: "patient", status: "active", boundPatient, canvas: workspaceContext,
      canMutate: true, badge: "Selected Patient",
      explanation: `Selected patient: ${boundPatient.patientName}. Retained while ${workspaceContext.label} is in front.`,
    };
  }

  if (active) {
    return {
      kind: "patient",
      status: "active",
      boundPatient,
      canvas: workspaceContext,
      canMutate: true,
      badge: "Active Chart",
      explanation: `Bound to ${boundPatient.patientName} · ${workspaceContext.section ?? "Overview"}.`,
    };
  }

  return {
    kind: "patient",
    status: "inactive",
    boundPatient,
    canvas: workspaceContext,
    canMutate: false,
    badge: "Inactive Chart Pinned",
    explanation:
      `Pinned to ${boundPatient.patientName}. ${workspaceContext.label} is in front, so chart-bound actions are parked until that patient chart returns to the foreground.`,
  };
}
