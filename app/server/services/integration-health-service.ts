import { assertPermission, type ProviderContext } from "../auth/provider-context";
import {
  defaultIntegrationSecretProvider,
  missingSecretAliases,
  type IntegrationSecretProvider,
} from "../integrations/secret-provider";
import type { IntegrationOperationalStatus } from "../integrations/types";
import { getDatabase } from "../db/connection";
import { IntegrationConfigurationRepository } from "../repositories/integration-configuration-repository";

export class IntegrationHealthService {
  constructor(private readonly secretProvider: IntegrationSecretProvider = defaultIntegrationSecretProvider) {}

  async list(actor: ProviderContext): Promise<IntegrationOperationalStatus[]> {
    assertPermission(actor, "manage_integrations");
    const db = getDatabase();
    const configurations = IntegrationConfigurationRepository.list();
    const statuses: IntegrationOperationalStatus[] = [];

    for (const configuration of configurations) {
      const missing = configuration.enabled
        ? await missingSecretAliases(configuration.secretRefs, this.secretProvider)
        : [];
      const productionMissingReference = configuration.enabled && configuration.environment === "production" &&
        Object.keys(configuration.secretRefs).length === 0;

      let pendingCount = 0;
      let failedCount = 0;
      let uncertainCount = 0;
      let lastSuccessfulInteractionAt: string | undefined;
      if (configuration.purpose === "prescribing") {
        const summary = db.prepare(`
          SELECT
            SUM(CASE WHEN state = 'prepared' THEN 1 ELSE 0 END) AS pending_count,
            SUM(CASE WHEN state = 'failed' THEN 1 ELSE 0 END) AS failed_count,
            SUM(CASE WHEN state = 'outcome_uncertain' THEN 1 ELSE 0 END) AS uncertain_count,
            MAX(CASE WHEN state IN ('submitted','acknowledged','accepted','cancellation_acknowledged','canceled')
              THEN updated_at ELSE NULL END) AS last_success_at
          FROM prescription_transactions
          WHERE adapter_id = ?
        `).get(configuration.adapterId) as any;
        pendingCount = Number(summary?.pending_count || 0);
        failedCount = Number(summary?.failed_count || 0);
        uncertainCount = Number(summary?.uncertain_count || 0);
        lastSuccessfulInteractionAt = summary?.last_success_at || undefined;
      }

      statuses.push({
        integrationId: configuration.id,
        adapterId: configuration.adapterId,
        purpose: configuration.purpose,
        environment: configuration.environment,
        enabled: configuration.enabled,
        readiness: !configuration.enabled
          ? "disabled"
          : productionMissingReference || missing.length > 0
            ? "missing_secret"
            : "ready",
        missingSecretAliases: productionMissingReference ? ["required-production-secret"] : missing,
        pendingCount,
        failedCount,
        uncertainCount,
        lastSuccessfulInteractionAt,
      });
    }

    return statuses;
  }
}

export const integrationHealthService = new IntegrationHealthService();
