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
  /** Adapter-provided transport detail. Development adapters must not present simulations as real network evidence. */
  ediMessagePreview: string;
  timestamp: string;
  auditTrailCode: string;
  epcsVerified: boolean;
  warnings?: string[];
  error?: string;
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
   */
  transmitPrescriptions(
    orders: MedicationOrder[],
    auth: ProviderAuth
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
