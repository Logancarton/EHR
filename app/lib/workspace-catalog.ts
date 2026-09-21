/**
 * Canonical workspace catalog for Clinical Bond.
 *
 * Implements UI-2 (D-085, LEFT-01, LEFT-02, LEFT-03):
 * - Home and '+' consume one shared workspace catalog rather than separate hard-coded destination lists.
 * - Home presents three major entities: Clinical, Billing, Brand.
 * - '+' launcher offers major workspaces: Home, Calendar, Patients, Intake, Documents, Billing, Brand.
 * - Staff/People/HR is deliberately excluded from both major-app launchers (belongs in companion/canvas).
 * - Planned and withdrawn destinations (such as financial_integration prototype) cannot leak through either surface.
 */

import { isGlobalModuleAvailable, type GlobalWorkspaceModule } from "./workspace-navigation";
import { findTool, isAvailableTool } from "./workspace-tools";

export type MajorEntityId = "clinical" | "billing" | "brand";

export type WorkspaceDestinationId =
  | "home"
  | "clinical"
  | "calendar"
  | "patients"
  | "intake"
  | "documents"
  | "billing"
  | "brand";

export type WorkspaceSurface = "home" | "launcher";

export interface WorkspaceCatalogEntry {
  /** Canonical destination ID */
  id: WorkspaceDestinationId;
  /** Primary human-readable label */
  label: string;
  /** Concise description/hint */
  description: string;
  /** Material Symbols icon name */
  icon: string;
  /** Visual tone for icon badge */
  tone: "blue" | "green" | "teal" | "amber" | "indigo" | "emerald" | "purple";
  /** Major suite entity ownership (D-085, LEFT-01) */
  entity: MajorEntityId | "home";
  /** Surfaces where this workspace is offered as a launcher */
  surfaces: WorkspaceSurface[];
  /** Lifecycle availability status */
  status: "available" | "planned" | "withdrawn";
  /** Search keywords for instant filtering */
  keywords?: string[];
  /** Optional attribute for 1-click workspace view restore */
  workspaceViewAttr?: "today" | "home" | "calendar";
  /** Associated global module (if applicable) */
  targetModule?: GlobalWorkspaceModule;
  /** Associated view (if applicable) */
  targetView?: "today" | "home" | "calendar" | "patient";
}

export const WORKSPACE_CATALOG: readonly WorkspaceCatalogEntry[] = [
  // -------------------------------------------------------------
  // Major Suite Entities: Home = Clinical / Billing / Brand (LEFT-01, D-085)
  // -------------------------------------------------------------
  {
    id: "clinical",
    label: "Clinical",
    description: "Clinical EHR, patient care & schedule",
    icon: "medical_services",
    tone: "blue",
    entity: "clinical",
    surfaces: ["home"],
    status: "available",
    keywords: ["ehr", "today", "schedule", "patients", "chart", "doctor", "clinical"],
    workspaceViewAttr: "today",
    targetView: "today",
  },
  {
    id: "billing",
    label: "Billing",
    description: "Charges prepared from signed encounters",
    icon: "payments",
    tone: "emerald",
    entity: "billing",
    surfaces: ["home", "launcher"],
    status: "available",
    keywords: ["claims", "finance", "charges", "payments", "revenue", "insurance"],
    targetModule: "billing",
  },
  {
    id: "brand",
    label: "Brand",
    description: "Clinic website, booking portal & reputation",
    icon: "campaign",
    tone: "purple",
    entity: "brand",
    surfaces: ["home", "launcher"],
    status: "available",
    keywords: ["website", "social", "portal", "marketing", "reputation", "public"],
    targetModule: "brand",
  },

  // -------------------------------------------------------------
  // Major Workspaces for '+' Open Workspace Launcher (LEFT-03, D-085)
  // -------------------------------------------------------------
  {
    id: "home",
    label: "Home",
    description: "Suite launchpad & AI assistance",
    icon: "home",
    tone: "blue",
    entity: "home",
    surfaces: ["launcher"],
    status: "available",
    keywords: ["start", "zen", "launchpad", "root"],
    workspaceViewAttr: "home",
    targetView: "home",
  },
  {
    id: "calendar",
    label: "Calendar",
    description: "Practice schedule & appointments",
    icon: "calendar_month",
    tone: "green",
    entity: "clinical",
    surfaces: ["launcher"],
    status: "available",
    keywords: ["schedule", "appointments", "visits", "agenda", "time", "booking"],
    workspaceViewAttr: "calendar",
    targetView: "calendar",
  },
  {
    id: "patients",
    label: "Patients",
    description: "Clinical patient charts & longitudinal records",
    icon: "people",
    tone: "teal",
    entity: "clinical",
    surfaces: ["launcher"],
    status: "available",
    keywords: ["roster", "charts", "records", "clinical", "panel", "history"],
    targetView: "patient",
  },
  {
    id: "intake",
    label: "Intake",
    description: "Prospective patient registration & review queue",
    icon: "assignment_ind",
    tone: "indigo",
    entity: "clinical",
    surfaces: ["launcher"],
    status: "available",
    keywords: ["registration", "triage", "forms", "queue", "prospective", "new patients"],
    targetModule: "intake",
  },
  {
    id: "documents",
    label: "Documents",
    description: "Clinical faxes, records & uploads",
    icon: "folder_open",
    tone: "amber",
    entity: "clinical",
    surfaces: ["launcher"],
    status: "available",
    keywords: ["faxes", "records", "uploads", "forms", "files", "scans"],
    targetModule: "documents",
  },
];

/**
 * Checks whether a catalog entry is actually available to run.
 * Checks both entry status and underlying module availability.
 */
export function isWorkspaceAvailable(entry: WorkspaceCatalogEntry): boolean {
  if (entry.status !== "available") return false;

  // If entry maps to a global workspace module, verify it against the module registry
  if (entry.targetModule) {
    if (!isGlobalModuleAvailable(entry.targetModule)) return false;
  }

  // Also verify against workspace tools registry if an entry exists
  const tool = findTool(entry.id);
  if (tool && !isAvailableTool(tool)) return false;

  return true;
}

/**
 * Returns the major entity destinations offered on Home.
 *
 * Home presents three major entities in canonical order: Clinical, Billing, and Brand (D-085, LEFT-01).
 * Staff/HR is excluded. Planned/withdrawn destinations cannot leak through.
 */
export function getHomeWorkspaceDestinations(): WorkspaceCatalogEntry[] {
  const homeEntries = WORKSPACE_CATALOG.filter(
    (entry) =>
      entry.surfaces.includes("home") &&
      entry.id !== ("hr" as unknown as WorkspaceDestinationId) &&
      isWorkspaceAvailable(entry),
  );
  const canonicalHomeOrder: WorkspaceDestinationId[] = ["clinical", "billing", "brand"];
  return homeEntries.sort(
    (a, b) => canonicalHomeOrder.indexOf(a.id) - canonicalHomeOrder.indexOf(b.id),
  );
}

/**
 * Returns the major workspaces offered in the '+' Open workspace launcher.
 *
 * '+' offers major workspaces in canonical order:
 * Home, Calendar, Patients, Intake, Documents, Billing, and Brand (D-085, LEFT-03).
 * Staff/HR is excluded. Planned/withdrawn destinations cannot leak through.
 */
export function getLauncherWorkspaceDestinations(): WorkspaceCatalogEntry[] {
  const launcherEntries = WORKSPACE_CATALOG.filter(
    (entry) =>
      entry.surfaces.includes("launcher") &&
      entry.id !== ("hr" as unknown as WorkspaceDestinationId) &&
      isWorkspaceAvailable(entry),
  );
  const canonicalLauncherOrder: WorkspaceDestinationId[] = [
    "home",
    "calendar",
    "patients",
    "intake",
    "documents",
    "billing",
    "brand",
  ];
  return launcherEntries.sort(
    (a, b) => canonicalLauncherOrder.indexOf(a.id) - canonicalLauncherOrder.indexOf(b.id),
  );
}

/**
 * Looks up a catalog entry by destination ID.
 */
export function getWorkspaceCatalogEntry(
  id: WorkspaceDestinationId,
): WorkspaceCatalogEntry | undefined {
  return WORKSPACE_CATALOG.find((entry) => entry.id === id);
}

