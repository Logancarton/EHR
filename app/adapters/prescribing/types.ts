import { type MedicationOrder, type Pharmacy, type ProviderAuth, type ClinicalSafetyAlert } from "../../domain/orders";

export type PrescriptionTransmissionResult = {
  success: boolean;
  transmissionId: string;
  vendor: string;
  standard: string;
  transmittedCount: number;
  pharmacyRouting: {
    pharmacyName: string;
    ncpdpId: string;
    deliveryMethod: "EDI" | "Fax-Fallback" | "Direct Courier";
  };
  /** Transient adapter detail. Raw transport payloads are not required for durable EHR state. */
  ediMessagePreview?: string;
  timestamp: string;
  /** Transient adapter audit detail; credentials/tokens must never be persisted as normal order metadata. */
  auditTrailCode?: string;
  epcsVerified: boolean;
  warnings?: string[];
  error?: string;
};

export type PrescriptionTransportContext = {
  internalTransactionId: string;
  correlationId: string;
  idempotencyKey: string;
  attempt: number;
};

export type EpcsVerificationResult = {
  verified: boolean;
  providerNpi: string;
  deaNumber: string;
  timestamp: string;
  auditToken: string;
  authMethod: "Two-Factor Push / TOTP" | "Biometric FIDO2" | "Hardware Token";
  error?: string;
};

export interface EPrescribingAdapter {
  id: string;
  name: string;
  standard: string;
  description: string;

  /**
   * Transmit authorized medication orders through the configured external prescribing provider.
   * The optional context supplies EHR-owned correlation/idempotency identifiers for a future
   * production adapter without exposing medication-domain ownership to the vendor.
   */
  transmitPrescriptions(
    orders: MedicationOrder[],
    auth: ProviderAuth,
    context?: PrescriptionTransportContext,
  ): Promise<PrescriptionTransmissionResult>;

  /**
   * Query pharmacies through the configured adapter or its explicitly labeled development fixtures.
   */
  searchPharmacies(query: string, zipCode?: string): Promise<Pharmacy[]>;

  /**
   * Verify EPCS credentials only when the configured production adapter actually supports that workflow.
   */
  verifyEpcsCredentials(
    npi: string,
    deaNumber: string,
    pin: string,
    otpToken: string
  ): Promise<EpcsVerificationResult>;

  /**
   * Cancel or void an electronic prescription through the configured external provider.
   */
  cancelPrescription(orderId: string, reason: string): Promise<boolean>;
}
