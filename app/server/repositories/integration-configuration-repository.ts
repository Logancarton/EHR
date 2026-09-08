import {
  type IntegrationConfiguration,
  type IntegrationConfigurationInput,
  type IntegrationEnvironment,
  type IntegrationPurpose,
  type IntegrationScopeType,
} from "../integrations/types";
import { assertValidSecretRef } from "../integrations/secret-provider";
import { getDatabase } from "../db/connection";

const ID_PATTERN = /^[a-z0-9][a-z0-9._/-]{0,127}$/i;
const SECRETISH_KEY = /password|passcode|\bpin\b|otp|token|secret|credential|api[_-]?key|authorization|cookie|session|private[_-]?key|client[_-]?secret/i;
const PURPOSES = new Set<IntegrationPurpose>(["prescribing", "labs", "communications", "scheduling", "billing", "interoperability"]);
const ENVIRONMENTS = new Set<IntegrationEnvironment>(["development", "test", "production"]);
const SCOPES = new Set<IntegrationScopeType>(["practice", "organization"]);

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    output[key] = canonicalize((value as Record<string, unknown>)[key]);
  }
  return output;
}

function validateNonSecretValue(value: unknown, path = "config"): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number") {
    if (typeof value === "number" && !Number.isFinite(value)) throw new Error(`${path} contains a non-finite number.`);
    return value;
  }
  if (Array.isArray(value)) return value.map((entry, index) => validateNonSecretValue(entry, `${path}[${index}]`));
  if (!value || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error(`${path} must contain JSON-safe configuration only.`);
  }
  const safe: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (SECRETISH_KEY.test(key)) {
      throw new Error(`Non-secret integration configuration cannot contain secret-like key: ${key}.`);
    }
    safe[key] = validateNonSecretValue(nested, `${path}.${key}`);
  }
  return canonicalize(safe);
}

function normalizeSecretRefs(input: Record<string, string> | undefined): Record<string, string> {
  const refs: Record<string, string> = {};
  for (const [alias, rawRef] of Object.entries(input || {}).sort(([a], [b]) => a.localeCompare(b))) {
    if (!ID_PATTERN.test(alias)) throw new Error("Integration secret alias is invalid.");
    const secretRef = rawRef.trim();
    assertValidSecretRef(secretRef);
    refs[alias] = secretRef;
  }
  return refs;
}

function normalizeInput(input: IntegrationConfigurationInput): Required<Omit<IntegrationConfigurationInput, "scopeId">> & { scopeId?: string } {
  const id = input.id.trim();
  const adapterId = input.adapterId.trim();
  const scopeType = input.scopeType || "practice";
  const scopeId = input.scopeId?.trim() || undefined;
  if (!ID_PATTERN.test(id) || !ID_PATTERN.test(adapterId)) throw new Error("Integration configuration identity is invalid.");
  if (!PURPOSES.has(input.purpose)) throw new Error("Integration purpose is invalid.");
  if (!ENVIRONMENTS.has(input.environment)) throw new Error("Integration environment is invalid.");
  if (!SCOPES.has(scopeType)) throw new Error("Integration scope is invalid.");
  if (scopeId && !ID_PATTERN.test(scopeId)) throw new Error("Integration scope identifier is invalid.");

  const nonSecretConfig = validateNonSecretValue(input.nonSecretConfig || {}) as Record<string, unknown>;
  const serialized = JSON.stringify(nonSecretConfig);
  if (Buffer.byteLength(serialized, "utf8") > 16 * 1024) throw new Error("Integration non-secret configuration exceeds 16 KiB.");

  return {
    id,
    adapterId,
    purpose: input.purpose,
    environment: input.environment,
    enabled: Boolean(input.enabled),
    scopeType,
    scopeId,
    nonSecretConfig,
    secretRefs: normalizeSecretRefs(input.secretRefs),
  };
}

function asConfiguration(row: any): IntegrationConfiguration | null {
  if (!row) return null;
  return {
    id: row.id,
    adapterId: row.adapter_id,
    purpose: row.purpose,
    environment: row.environment,
    enabled: Boolean(row.enabled),
    scopeType: row.scope_type,
    scopeId: row.scope_id || undefined,
    nonSecretConfig: parseJson<Record<string, unknown>>(row.non_secret_config_json, {}),
    secretRefs: parseJson<Record<string, string>>(row.secret_refs_json, {}),
    version: Number(row.version || 1),
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function stableMeaning(config: Pick<IntegrationConfiguration, "enabled" | "nonSecretConfig" | "secretRefs">): string {
  return JSON.stringify(canonicalize({
    enabled: config.enabled,
    nonSecretConfig: config.nonSecretConfig,
    secretRefs: config.secretRefs,
  }));
}

export const IntegrationConfigurationRepository = {
  getById(id: string): IntegrationConfiguration | null {
    return asConfiguration(getDatabase().prepare(`SELECT * FROM integration_configurations WHERE id = ?`).get(id));
  },

  list(): IntegrationConfiguration[] {
    return (getDatabase().prepare(`SELECT * FROM integration_configurations ORDER BY purpose, adapter_id, environment, id`).all() as any[])
      .map((row) => asConfiguration(row)!).filter(Boolean);
  },

  listForAdapter(adapterId: string, purpose: IntegrationPurpose): IntegrationConfiguration[] {
    return (getDatabase().prepare(`
      SELECT * FROM integration_configurations
      WHERE adapter_id = ? AND purpose = ?
      ORDER BY enabled DESC, environment, id
    `).all(adapterId, purpose) as any[]).map((row) => asConfiguration(row)!).filter(Boolean);
  },

  save(input: IntegrationConfigurationInput, actorId: string): { configuration: IntegrationConfiguration; created: boolean; changed: boolean } {
    const normalized = normalizeInput(input);
    const db = getDatabase();
    const existing = this.getById(normalized.id);
    const at = new Date().toISOString();

    if (!existing) {
      db.prepare(`INSERT INTO integration_configurations (
        id, adapter_id, purpose, environment, enabled, scope_type, scope_id,
        non_secret_config_json, secret_refs_json, version, created_by, updated_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`)
        .run(
          normalized.id, normalized.adapterId, normalized.purpose, normalized.environment,
          normalized.enabled ? 1 : 0, normalized.scopeType, normalized.scopeId || null,
          JSON.stringify(normalized.nonSecretConfig), JSON.stringify(normalized.secretRefs),
          actorId, actorId, at, at,
        );
      return { configuration: this.getById(normalized.id)!, created: true, changed: true };
    }

    if (
      existing.adapterId !== normalized.adapterId || existing.purpose !== normalized.purpose ||
      existing.environment !== normalized.environment || existing.scopeType !== normalized.scopeType ||
      (existing.scopeId || undefined) !== (normalized.scopeId || undefined)
    ) {
      throw new Error(`Integration configuration ${normalized.id} cannot be rebound to another adapter, purpose, environment, or scope.`);
    }

    if (stableMeaning(existing) === stableMeaning(normalized)) {
      return { configuration: existing, created: false, changed: false };
    }

    db.prepare(`UPDATE integration_configurations SET
      enabled = ?, non_secret_config_json = ?, secret_refs_json = ?,
      version = version + 1, updated_by = ?, updated_at = ?
      WHERE id = ?`)
      .run(
        normalized.enabled ? 1 : 0, JSON.stringify(normalized.nonSecretConfig), JSON.stringify(normalized.secretRefs),
        actorId, at, normalized.id,
      );
    return { configuration: this.getById(normalized.id)!, created: false, changed: true };
  },
};
