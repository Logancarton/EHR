import type { DatabaseMigration } from "./types";
import { migration as migration01 } from "./2026-09-08-001-integration-configurations";
import { migration as migration02 } from "./2026-09-08-002-prescription-outcome-uncertain";
import { migration as migration03 } from "./2026-09-09-001-organization-patient-access";
import { migration as migration04 } from "./2026-09-10-001-auth-activation-tokens";
import { migration as migration05 } from "./2026-09-10-002-auth-login-throttle";
import { migration as migration06 } from "./2026-09-10-003-encounter-note-sections";
import { migration as migration07 } from "./2026-09-10-004-workspace-templates";
import { migration as migration08 } from "./2026-09-11-001-patient-administrative-foundation";
import { migration as migration09 } from "./2026-09-13-001-encounter-note-references";
import { migration as migration10 } from "./2026-09-13-002-retire-prototype-note-tokens";
import { migration as migration11 } from "./2026-09-13-003-encounter-scoped-orders";
import { migration as migration12 } from "./2026-09-13-004-encounter-section-extractions";
import { migration as migration13 } from "./2026-09-13-005-patient-photo-and-id";
import { migration as migration14 } from "./2026-09-14-001-encounter-appointment-link";
import { migration as migration15 } from "./2026-09-14-002-appointment-roster-fields";
import { migration as migration16 } from "./2026-09-14-003-preference-revisions";
import { migration as migration17 } from "./2026-09-14-004-appointment-version-and-handoffs";
import { migration as migration18 } from "./2026-09-14-005-appointment-lifecycle-and-followup";
import { migration as migration19 } from "./2026-09-15-001-billing-charge-records";
import { migration as migration20 } from "./2026-09-15-002-signed-encounter-date-projection";
import { migration as migration21 } from "./2026-09-15-003-medication-indication";
import { migration as migration22 } from "./2026-09-15-004-care-completion-worklist";
import { migration as migration23 } from "./2026-09-17-001-intake-foundation";
import { migration as migration24 } from "./2026-09-17-002-intake-prospective-identity";
import { migration as migration25 } from "./2026-09-18-001-document-insurance-prospective-identity";
import { migration as migration26 } from "./2026-09-19-001-intake-episode-standalone";
import { migration as migration27 } from "./2026-09-21-001-hr-records-and-designation";
import { migration as migration28 } from "./2026-09-21-002-hr-item-source";
import { migration as migration29 } from "./2026-09-23-001-clinical-monitoring-policies";
import { migration as migration30 } from "./2026-09-24-001-billing-setup-and-addon-codes";
import { migration as migration31 } from "./2026-09-25-001-vital-readings-out-of-lab-results";
import { migration as migration32 } from "./2026-09-25-002-personal-scratch-notes";

/**
 * Explicit append-only execution order. Never discover migrations from the filesystem.
 * Historical IDs are durable database identity and must not be renamed or reordered.
 */
export const APPLICATION_MIGRATIONS: readonly DatabaseMigration[] = [
  migration01,
  migration02,
  migration03,
  migration04,
  migration05,
  migration06,
  migration07,
  migration08,
  migration09,
  migration10,
  migration11,
  migration12,
  migration13,
  migration14,
  migration15,
  migration16,
  migration17,
  migration18,
  migration19,
  migration20,
  migration21,
  migration22,
  migration23,
  migration24,
  migration25,
  migration26,
  migration27,
  migration28,
  migration29,
  migration30,
  migration31,
  migration32,
];
