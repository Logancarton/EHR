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
  ediMessagePreview: string; // Realistic NCPDP SCRIPT payload snippet
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
   * Transmit authorized medication orders to community pharmacy via NCPDP SCRIPT
   */
  transmitPrescriptions(
    orders: MedicationOrder[],
    auth: ProviderAuth
  ): Promise<PrescriptionTransmissionResult>;

  /**
   * Query community pharmacies by name or zip code
   */
  searchPharmacies(query: string, zipCode?: string): Promise<Pharmacy[]>;

  /**
   * Verify DEA EPCS two-factor credentials for controlled substances
   */
  verifyEpcsCredentials(
    npi: string,
    deaNumber: string,
    pin: string,
    otpToken: string
  ): Promise<EpcsVerificationResult>;

  /**
   * Cancel or void an electronic prescription
   */
  cancelPrescription(orderId: string, reason: string): Promise<boolean>;
}
