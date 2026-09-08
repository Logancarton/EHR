import { assertPermission, providerLabel, type ProviderContext } from "../auth/provider-context";
import {
  defaultIntegrationSecretProvider,
  missingSecretAliases,
  type IntegrationSecretProvider,
} from "../integrations/secret-provider";
import type {
  IntegrationConfiguration,
  IntegrationConfigurationInput,
  IntegrationPurpose,
} from "../integrations/types";
import { AuditRepository } from "../repositories/audit-repository";
import { IntegrationConfigurationRepository } from "../repositories/integration-configuration-repository";

type IntegrationConfigurationDependencies = {
  configurations: typeof IntegrationConfigurationRepository;
  audit: typeof AuditRepository;
  secretProvider: IntegrationSecretProvider;
};

const defaults: IntegrationConfigurationDependencies = {
  configurations: IntegrationConfigurationRepository,
  audit: AuditRepository,
  secretProvider: defaultIntegrationSecretProvider,
};

function auditActor(actor: ProviderContext) {
  return { userId: actor.userId, userName: providerLabel(actor), userRole: actor.role };
}

export class IntegrationConfigurationService {
  constructor(private readonly deps: IntegrationConfigurationDependencies = defaults) {}

  list(actor: ProviderContext): IntegrationConfiguration[] {
    assertPermission(actor, "manage_integrations");
    return this.deps.configurations.list();
  }

  save(input: IntegrationConfigurationInput, actor: ProviderContext) {
    assertPermission(actor, "manage_integrations");
    const result = this.deps.configurations.save(input, actor.userId);
    if (result.changed) {
      this.deps.audit.log({
        ...auditActor(actor),
        eventType: result.created ? "integration_configuration_created" : "integration_configuration_updated",
        description: `${result.created ? "Created" : "Updated"} integration configuration ${result.configuration.id}.`,
        metadata: {
          integrationId: result.configuration.id,
          adapterId: result.configuration.adapterId,
          purpose: result.configuration.purpose,
          environment: result.configuration.environment,
          enabled: result.configuration.enabled,
          scopeType: result.configuration.scopeType,
          scopeId: result.configuration.scopeId,
          version: result.configuration.version,
          secretAliases: Object.keys(result.configuration.secretRefs).sort(),
        },
      });
    }
    return result;
  }

  async assertReadyForAdapter(
    adapterId: string,
    purpose: IntegrationPurpose,
    secretProvider: IntegrationSecretProvider = this.deps.secretProvider,
  ): Promise<IntegrationConfiguration> {
    const configurations = this.deps.configurations.listForAdapter(adapterId, purpose);
    const enabled = configurations.filter((configuration) => configuration.enabled);
    if (enabled.length === 0) {
      throw new Error(`External ${purpose} integration is not enabled for adapter ${adapterId}.`);
    }
    if (enabled.length > 1) {
      throw new Error(`External ${purpose} integration has ambiguous enabled configuration for adapter ${adapterId}.`);
    }

    const configuration = enabled[0];
    const aliases = Object.keys(configuration.secretRefs);
    if (configuration.environment === "production" && aliases.length === 0) {
      throw new Error(`Production ${purpose} integration ${configuration.id} is missing required secret references.`);
    }
    const missing = await missingSecretAliases(configuration.secretRefs, secretProvider);
    if (missing.length > 0) {
      throw new Error(`Integration ${configuration.id} is missing required secret material for: ${missing.join(", ")}.`);
    }
    return configuration;
  }
}

export const integrationConfigurationService = new IntegrationConfigurationService();
