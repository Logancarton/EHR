export type IntegrationPurpose =
  | "prescribing"
  | "labs"
  | "communications"
  | "scheduling"
  | "billing"
  | "interoperability";

export type IntegrationEnvironment = "development" | "test" | "production";
export type IntegrationScopeType = "practice" | "organization";

export type IntegrationConfiguration = {
  id: string;
  adapterId: string;
  purpose: IntegrationPurpose;
  environment: IntegrationEnvironment;
  enabled: boolean;
  scopeType: IntegrationScopeType;
  scopeId?: string;
  nonSecretConfig: Record<string, unknown>;
  secretRefs: Record<string, string>;
  version: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
};

export type IntegrationConfigurationInput = {
  id: string;
  adapterId: string;
  purpose: IntegrationPurpose;
  environment: IntegrationEnvironment;
  enabled: boolean;
  scopeType?: IntegrationScopeType;
  scopeId?: string;
  nonSecretConfig?: Record<string, unknown>;
  secretRefs?: Record<string, string>;
};

export type IntegrationReadiness = "ready" | "disabled" | "missing_configuration" | "missing_secret";

export type IntegrationOperationalStatus = {
  integrationId: string;
  adapterId: string;
  purpose: IntegrationPurpose;
  environment: IntegrationEnvironment;
  enabled: boolean;
  readiness: IntegrationReadiness;
  missingSecretAliases: string[];
  pendingCount: number;
  failedCount: number;
  uncertainCount: number;
  lastSuccessfulInteractionAt?: string;
};
