import type { ClinicalPermission } from "../server/auth/provider-context";

/**
 * DB-4: Configurable Roster Field Registry
 *
 * Each field on the appointment roster has a typed identity, accessible label,
 * category, capability requirement, and default visibility.
 *
 * Two fields are permanent anchors and cannot be hidden:
 * 1. `time` (when the visit happens)
 * 2. `patientName` (who the visit is for)
 *
 * All other fields can be toggled by the clinician in their personal preferences.
 * Fields with `requiredCapability` (e.g. `reason` requiring `read_clinical`,
 * `coverage` requiring `view_financial`) are automatically filtered out on the
 * server and client for users lacking that capability.
 */

export type RosterFieldId =
  | "time"
  | "patientName"
  | "photo"
  | "visitType"
  | "modality"
  | "status"
  | "room"
  | "provider"
  | "assignment"
  | "reason"
  | "intake"
  | "alerts"
  | "mrn"
  | "coverage";

export type RosterFieldCategory = "identity" | "scheduling" | "clinical" | "operations";

export interface RosterFieldDefinition {
  id: RosterFieldId;
  label: string;
  category: RosterFieldCategory;
  summary: string;
  permanent?: boolean;
  defaultVisible: boolean;
  requiredCapability?: ClinicalPermission;
}

export const ROSTER_FIELDS: readonly RosterFieldDefinition[] = Object.freeze([
  {
    id: "time",
    label: "Time & duration",
    category: "scheduling",
    summary: "Clock time and duration of the scheduled visit",
    permanent: true,
    defaultVisible: true,
  },
  {
    id: "photo",
    label: "Patient photo",
    category: "identity",
    summary: "Patient avatar or verified identification photo",
    defaultVisible: true,
  },
  {
    id: "patientName",
    label: "Patient name",
    category: "identity",
    summary: "Patient display name linking directly to their chart",
    permanent: true,
    defaultVisible: true,
  },
  {
    id: "visitType",
    label: "Visit type",
    category: "scheduling",
    summary: "Clinical appointment type (e.g. 30-min Med Check, Therapy + Meds)",
    defaultVisible: true,
  },
  {
    id: "modality",
    label: "Modality",
    category: "scheduling",
    summary: "Visit delivery channel (In-person or Telehealth/Video)",
    defaultVisible: true,
  },
  {
    id: "status",
    label: "Arrival & status",
    category: "operations",
    summary: "Front-desk arrival buttons and current visit lifecycle state",
    defaultVisible: true,
  },
  {
    id: "room",
    label: "Room / location",
    category: "operations",
    summary: "Physical office room or virtual exam space",
    defaultVisible: true,
  },
  {
    id: "provider",
    label: "Clinician",
    category: "scheduling",
    summary: "Scheduled healthcare provider for this appointment",
    defaultVisible: false,
  },
  {
    id: "assignment",
    label: "Staff assignment",
    category: "operations",
    summary: "Assigned medical assistant or front-desk check-in staff",
    defaultVisible: false,
  },
  {
    id: "reason",
    label: "Chief complaint / reason",
    category: "clinical",
    summary: "Clinical reason for visit or patient-reported chief complaint",
    defaultVisible: true,
    requiredCapability: "read_clinical",
  },
  {
    id: "intake",
    label: "Intake readiness",
    category: "clinical",
    summary: "Status of intake questionnaires and pre-visit clinical forms",
    defaultVisible: false,
    requiredCapability: "read_clinical",
  },
  {
    id: "alerts",
    label: "Safety & clinical alerts",
    category: "clinical",
    summary: "Active clinical alerts and safety precautions",
    defaultVisible: true,
    requiredCapability: "read_clinical",
  },
  {
    id: "mrn",
    label: "MRN & DOB",
    category: "identity",
    summary: "Medical record number, age, and date of birth",
    defaultVisible: false,
  },
  {
    id: "coverage",
    label: "Insurance coverage",
    category: "operations",
    summary: "Primary insurance payer and coverage verification status",
    defaultVisible: false,
    requiredCapability: "view_financial",
  },
]);

export const DEFAULT_ROSTER_FIELDS: readonly RosterFieldId[] = Object.freeze(
  ROSTER_FIELDS.filter((f) => f.defaultVisible).map((f) => f.id),
);

const ROSTER_FIELD_MAP = new Map<RosterFieldId, RosterFieldDefinition>(
  ROSTER_FIELDS.map((f) => [f.id, f]),
);

export function getRosterFieldDefinition(id: RosterFieldId): RosterFieldDefinition | undefined {
  return ROSTER_FIELD_MAP.get(id);
}

export function isPermanentAnchor(id: RosterFieldId): boolean {
  return ROSTER_FIELD_MAP.get(id)?.permanent === true;
}

export type CapabilityChecker =
  | readonly ClinicalPermission[]
  | Record<string, boolean>
  | null
  | undefined;

/**
 * Filters the field registry by user capabilities.
 * If capabilities are null or undefined (e.g. unauthenticated or full access),
 * returns all fields. Supports both array of permissions and permission dictionary.
 */
export function filterRosterFieldsByCapabilities(
  fields: readonly RosterFieldDefinition[],
  userCapabilities?: CapabilityChecker,
): readonly RosterFieldDefinition[] {
  if (!userCapabilities) return fields;
  if (!Array.isArray(userCapabilities) && typeof userCapabilities === "object") {
    const permMap = userCapabilities as Record<string, boolean>;
    return fields.filter(
      (field) => !field.requiredCapability || Boolean(permMap[field.requiredCapability]),
    );
  }
  const caps = new Set(userCapabilities as readonly ClinicalPermission[]);
  return fields.filter(
    (field) => !field.requiredCapability || caps.has(field.requiredCapability),
  );
}

/**
 * Sanitizes an arbitrary array of roster field IDs:
 * 1. Discards unrecognized field IDs.
 * 2. Deduplicates items.
 * 3. Enforces permanent fields (`time`, `patientName`) are always present.
 * 4. Filters out fields that require capabilities the user does not possess.
 * 5. If resulting set is empty or corrupt, falls back to authorized defaults.
 */
export function sanitizeRosterFields(
  raw: unknown,
  userCapabilities?: CapabilityChecker,
): RosterFieldId[] {
  const allowedDefinitions = filterRosterFieldsByCapabilities(ROSTER_FIELDS, userCapabilities);
  const allowedMap = new Map(allowedDefinitions.map((d) => [d.id, d]));

  const result: RosterFieldId[] = [];
  const seen = new Set<RosterFieldId>();

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === "string" && allowedMap.has(item as RosterFieldId)) {
        const id = item as RosterFieldId;
        if (!seen.has(id)) {
          seen.add(id);
          result.push(id);
        }
      }
    }
  }

  // Ensure permanent fields are present at the beginning
  const missingPermanent: RosterFieldId[] = [];
  for (const def of allowedDefinitions) {
    if (def.permanent && !seen.has(def.id)) {
      seen.add(def.id);
      missingPermanent.push(def.id);
    }
  }
  result.unshift(...missingPermanent);

  // Fallback if empty
  if (result.length === 0) {
    for (const def of allowedDefinitions) {
      if (def.defaultVisible) {
        result.push(def.id);
      }
    }
  }

  return result;
}
