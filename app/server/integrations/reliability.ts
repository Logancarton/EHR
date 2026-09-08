import { sanitizePrescriptionTransactionErrorMessage } from "../../domain/prescription-transactions";

/**
 * Adapters use this only when a request may have reached the remote system but
 * the EHR cannot prove the outcome. This state must not be treated as retryable
 * failure because a blind retry could duplicate an external prescription.
 */
export class IntegrationOutcomeUncertainError extends Error {
  readonly code: string;

  constructor(message: string, code = "outcome_uncertain") {
    super(sanitizePrescriptionTransactionErrorMessage(message));
    this.name = "IntegrationOutcomeUncertainError";
    this.code = code.slice(0, 120);
  }
}

export function isIntegrationOutcomeUncertain(error: unknown): error is IntegrationOutcomeUncertainError {
  return error instanceof IntegrationOutcomeUncertainError;
}
