/**
 * First-run account bootstrap.
 *
 * A production build has no development sign-in, and a freshly provisioned user has
 * no password — by design, since D-039 keeps passwords with their holder rather
 * than with whoever provisioned the account. That leaves a genuine chicken-and-egg
 * on a brand-new installation: nobody can sign in to administer anyone.
 *
 * This resolves it exactly once. If any account already has a credential, it does
 * nothing and says so — it is not a way to mint tokens for existing users, which
 * would be a back door around the administration boundary. Use the administration
 * endpoint for that.
 *
 *   npx tsx scripts/bootstrap-account.ts [--name "Dr. Jane Roe"] [--credentials "MD"]
 *
 * Prints an activation link. The holder opens it and chooses their own username
 * and password; this script never sees either.
 */
import { AuthRepository } from "../app/server/repositories/auth-repository";
import { OrganizationRepository } from "../app/server/repositories/organization-repository";
import { UserRepository } from "../app/server/repositories/user-repository";
import { AuthService } from "../app/server/auth/auth-service";
import { AuditRepository } from "../app/server/repositories/audit-repository";
import { getDatabase } from "../app/server/db/connection";

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index === -1 || index === process.argv.length - 1) return undefined;
  return process.argv[index + 1];
}

function anyCredentialExists(): boolean {
  const row = getDatabase()
    .prepare("SELECT COUNT(*) AS count FROM auth_identities")
    .get() as { count: number };
  return Number(row.count) > 0;
}

export type BootstrapResult =
  | { status: "skipped" }
  | { status: "issued"; url: string; displayName: string; expiresAt: string; userId: string };

/**
 * Provisions the practice's first administering account and mints its activation
 * token. Returns `skipped` once any account has a credential, so this cannot be
 * used to mint tokens for existing users — that belongs to the administration
 * endpoint, behind its permission and confinement checks.
 */
export function bootstrapFirstAccount(options: {
  displayName?: string;
  credentials?: string;
  userId?: string;
  baseUrl?: string;
} = {}): BootstrapResult {
  const port = process.env.PORT || "3000";
  const baseUrl = options.baseUrl || process.env.CLINICAL_BOND_URL || `http://localhost:${port}`;

  if (anyCredentialExists()) return { status: "skipped" };

  const displayName = options.displayName || "Dr. Logan Carton";
  const credentials = options.credentials || "MD";
  const userId = options.userId || "dr-carton";
  const organizationId = OrganizationRepository.defaultOrganizationId();

  const existing = UserRepository.getById(userId);
  const user = existing ?? UserRepository.create({
    id: userId,
    displayName,
    credentials,
    role: "provider",
  });

  // The first account administers the practice, so it gets organization-wide
  // patient scope. Anyone they provision afterwards defaults to assigned-only.
  OrganizationRepository.upsertMembership({
    organizationId,
    userId: user.id,
    status: "active",
    patientAccessScope: "organization",
  });

  const issued = AuthService.issueActivationToken({ userId: user.id, issuedBy: "bootstrap" });

  AuditRepository.log({
    userId: "bootstrap",
    userName: "First-run bootstrap",
    userRole: "system",
    eventType: "organization_user_provisioned",
    description: `First-run bootstrap provisioned ${displayName} in ${organizationId}.`,
    metadata: { organizationId, provisionedUserId: user.id, activationExpiresAt: issued.expiresAt },
  });

  return {
    status: "issued",
    url: `${baseUrl}/?activate=${encodeURIComponent(issued.token)}`,
    displayName,
    expiresAt: issued.expiresAt,
    userId: user.id,
  };
}

function runCli() {
  const result = bootstrapFirstAccount({
    displayName: argValue("--name"),
    credentials: argValue("--credentials"),
    userId: argValue("--id"),
  });

  if (result.status === "skipped") {
    console.log("BOOTSTRAP_SKIPPED an account already has a credential; nothing to do.");
    return;
  }

  // Machine-readable first so the launcher can parse it; human-readable after.
  console.log(`BOOTSTRAP_URL ${result.url}`);
  console.log(`BOOTSTRAP_USER ${result.displayName}`);
  console.log(`BOOTSTRAP_EXPIRES ${result.expiresAt}`);
}

// Only act when invoked as a script, so importing this for tests provisions nothing.
const entryFile = process.argv[1]?.split(/[\\/]/).pop() ?? "";
const invokedDirectly = entryFile.length > 0 && import.meta.url.endsWith(entryFile);
if (invokedDirectly) {
  try {
    runCli();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
