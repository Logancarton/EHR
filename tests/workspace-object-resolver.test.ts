import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { grantSyntheticOrganizationAccess } from "./helpers/organization-access";

test("workspace object resolver finds authorized charts, document passages, notes, people, and workspaces", async () => {
  const originalCwd = process.cwd();
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-workspace-object-resolver-"));
  process.chdir(isolatedRoot);

  try {
    const defaultOrg = await grantSyntheticOrganizationAccess(["resolver-provider", "resolver-colleague"]);
    const hiddenOrg = await grantSyntheticOrganizationAccess(["hidden-owner"], { organizationId: "hidden-org" });

    const [
      { PatientRepository },
      { ClinicalRecordRepository },
      { ClinicalSearchRepository },
      { ProspectivePersonRepository },
      { resolveWorkspaceObjects },
    ] = await Promise.all([
      import("../app/server/repositories/patient-repository"),
      import("../app/server/repositories/clinical-record-repository"),
      import("../app/server/repositories/clinical-search-repository"),
      import("../app/server/repositories/prospective-person-repository"),
      import("../app/server/ai/workspace-object-resolver"),
    ]);

    const actor = {
      userId: "resolver-provider",
      displayName: "Resolver Provider",
      role: "provider" as const,
      membershipRole: "owner" as const,
      organizationId: defaultOrg,
    };
