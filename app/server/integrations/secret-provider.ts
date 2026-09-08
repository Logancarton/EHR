const SECRET_REF_PATTERN = /^[a-z0-9][a-z0-9._/-]{0,255}$/i;

export interface IntegrationSecretProvider {
  getSecret(secretRef: string): Promise<string | undefined>;
}

export function assertValidSecretRef(secretRef: string): void {
  if (!SECRET_REF_PATTERN.test(secretRef)) {
    throw new Error("Integration secret reference is invalid.");
  }
}

export function environmentVariableForSecretRef(secretRef: string): string {
  assertValidSecretRef(secretRef);
  return `EHR_INTEGRATION_SECRET_${secretRef.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
}

export class EnvironmentIntegrationSecretProvider implements IntegrationSecretProvider {
  async getSecret(secretRef: string): Promise<string | undefined> {
    const variable = environmentVariableForSecretRef(secretRef);
    const value = process.env[variable]?.trim();
    return value || undefined;
  }
}

export const defaultIntegrationSecretProvider = new EnvironmentIntegrationSecretProvider();

export async function missingSecretAliases(
  secretRefs: Record<string, string>,
  provider: IntegrationSecretProvider,
): Promise<string[]> {
  const missing: string[] = [];
  for (const [alias, secretRef] of Object.entries(secretRefs).sort(([a], [b]) => a.localeCompare(b))) {
    assertValidSecretRef(secretRef);
    const value = await provider.getSecret(secretRef);
    if (!value) missing.push(alias);
  }
  return missing;
}
