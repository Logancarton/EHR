import { type ProviderContext, providerLabel } from "../auth/provider-context";
import { accessSelectionForActor } from "../auth/patient-access";
import { AuditRepository } from "../repositories/audit-repository";
import {
  WorkspaceTemplateRepository,
  type WorkspaceTemplate,
  type WorkspaceTemplateConfig,
} from "../repositories/workspace-template-repository";

/**
 * The practice's shared workspace layouts.
 *
 * The authorization split here is the whole point of the feature: every active
 * member may *read* the templates, because they are the defaults a clinician
 * returns to; only an owner or manager may *write* them. A provider tidying
 * their own screen therefore can never rearrange anyone else's, which is not
 * something the clinical permission set expresses — `manage_organization` is
 * held by every provider, so it would have made every clinician an editor.
 */

export class WorkspaceTemplateError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "WorkspaceTemplateError";
  }
}

const EDITOR_ROLES = new Set(["owner", "manager"]);
const MAX_NAME = 60;
const MAX_DESCRIPTION = 160;
/** A layout config is small; anything larger is a client bug or an abuse. */
const MAX_CONFIG_BYTES = 32_000;

/**
 * The organization this actor acts in. An explicit target is honoured only when
 * the actor actively belongs to it, so passing an id is never a way to reach
 * another practice — it only disambiguates multiple memberships.
 */
function actingOrganization(actor: ProviderContext, requested?: string): string {
  const selection = accessSelectionForActor(actor);
  const memberships = [...selection.organizationIds, ...selection.assignedScopeOrganizationIds];
  if (memberships.length === 0) {
    throw new WorkspaceTemplateError("You do not belong to an organization.", 403);
  }
  if (requested) {
    if (!memberships.includes(requested)) {
      throw new WorkspaceTemplateError("You do not belong to that organization.", 403);
    }
    return requested;
  }
  return memberships[0];
}

function assertEditor(actor: ProviderContext, organizationId: string): void {
  const role = WorkspaceTemplateRepository.membershipRole(organizationId, actor.userId);
  if (!role || !EDITOR_ROLES.has(role)) {
    throw new WorkspaceTemplateError(
      "Only a practice owner or manager can change the practice's default layouts.",
      403,
    );
  }
}

function text(value: unknown, field: string, max: number, required = true): string {
  if (value === undefined || value === null || value === "") {
    if (required) throw new WorkspaceTemplateError(`${field} is required.`, 400);
    return "";
  }
  if (typeof value !== "string" || value.trim().length === 0 || value.length > max) {
    throw new WorkspaceTemplateError(`${field} must be text of at most ${max} characters.`, 400);
  }
  return value.trim();
}

function config(value: unknown): WorkspaceTemplateConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new WorkspaceTemplateError("A layout configuration object is required.", 400);
  }
  const serialized = JSON.stringify(value);
  if (serialized.length > MAX_CONFIG_BYTES) {
    throw new WorkspaceTemplateError("That layout configuration is too large to store.", 400);
  }
  // `customPresets` is a clinician's personal list. A shared template that
  // carried one would hand everyone a copy of one person's saved layouts.
  const { customPresets: _omitted, ...rest } = value as Record<string, unknown>;
  return rest as WorkspaceTemplateConfig;
}

function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export const WorkspaceTemplateService = {
  /** Readable by any active member: these are the defaults, not an admin screen. */
  list(actor: ProviderContext, organizationId?: string) {
    const org = actingOrganization(actor, organizationId);
    const role = WorkspaceTemplateRepository.membershipRole(org, actor.userId);
    const templates = WorkspaceTemplateRepository.list(org).filter(
      (template) => !template.appliesToRole || template.appliesToRole === actor.role,
    );
    return {
      organizationId: org,
      membershipRole: role ?? "member",
      canEdit: Boolean(role && EDITOR_ROLES.has(role)),
      templates,
    };
  },

  save(
    actor: ProviderContext,
    input: {
      id?: unknown;
      name?: unknown;
      description?: unknown;
      icon?: unknown;
      appliesToRole?: unknown;
      sortOrder?: unknown;
      config?: unknown;
      organizationId?: string;
    },
  ): WorkspaceTemplate {
    const org = actingOrganization(actor, input.organizationId);
    assertEditor(actor, org);

    const name = text(input.name, "Template name", MAX_NAME);
    const description = text(input.description, "Description", MAX_DESCRIPTION, false);
    const icon = text(input.icon, "Icon", 40, false) || "dashboard";
    const appliesToRole = text(input.appliesToRole, "Role", 40, false);
    const sortOrder =
      typeof input.sortOrder === "number" && Number.isFinite(input.sortOrder)
        ? Math.trunc(input.sortOrder)
        : 0;

    const id =
      typeof input.id === "string" && input.id.trim()
        ? input.id.trim().slice(0, 80)
        : `tpl-${slug(name) || "layout"}-${Date.now().toString().slice(-5)}`;

    const saved = WorkspaceTemplateRepository.upsert({
      id,
      organizationId: org,
      name,
      description,
      icon,
      appliesToRole,
      sortOrder,
      config: config(input.config),
      actorId: actor.userId,
    });

    AuditRepository.log({
      eventType: "workspace_template_saved",
      description: `Saved practice layout "${name}"`,
      userId: actor.userId,
      userName: providerLabel(actor),
      userRole: actor.role,
      metadata: { templateId: saved.id, organizationId: org },
    });

    return saved;
  },

  remove(actor: ProviderContext, id: string, organizationId?: string): void {
    const org = actingOrganization(actor, organizationId);
    assertEditor(actor, org);

    const existing = WorkspaceTemplateRepository.get(org, id);
    if (!existing) throw new WorkspaceTemplateError("That layout no longer exists.", 404);
    WorkspaceTemplateRepository.remove(org, id);

    AuditRepository.log({
      eventType: "workspace_template_deleted",
      description: `Deleted practice layout "${existing.name}"`,
      userId: actor.userId,
      userName: providerLabel(actor),
      userRole: actor.role,
      metadata: { templateId: id, organizationId: org },
    });
  },
};
