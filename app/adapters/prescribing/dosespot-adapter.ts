import {
  type EPrescribingAdapter,
  type PrescriptionTransmissionResult,
  type EpcsVerificationResult,
} from "./types";
import {
  type MedicationOrder,
  type Pharmacy,
  type ProviderAuth,
  standardPharmacies,
} from "../../domain/orders";

/** Development-only placeholder. It never represents simulated network/EPCS behavior as real. */
export class MockDoseSpotAdapter implements EPrescribingAdapter {
  id = "dosespot-placeholder";
  name = "DoseSpot placeholder (development only)";
  standard = "Vendor-neutral development placeholder";
  description = "Reserved adapter boundary for future contracted DoseSpot connectivity. No external prescribing service is active.";

  async transmitPrescriptions(
    orders: MedicationOrder[],
    _auth: ProviderAuth,
  ): Promise<PrescriptionTransmissionResult> {
    if (orders.length === 0) throw new Error("Cannot transmit empty prescription batch.");
    throw new Error(
      "DoseSpot network transmission is not implemented. The development placeholder does not send prescriptions or create pharmacy-network acknowledgements.",
    );
  }

  async searchPharmacies(query: string, zipCode?: string): Promise<Pharmacy[]> {
    const q = query.toLowerCase().trim();
    if (!q) return standardPharmacies;
    return standardPharmacies.filter(
      (pharmacy) =>
        pharmacy.name.toLowerCase().includes(q) ||
        pharmacy.address.toLowerCase().includes(q) ||
        Boolean(zipCode && pharmacy.address.includes(zipCode)),
    );
  }

  async verifyEpcsCredentials(
    npi: string,
    deaNumber: string,
    _pin: string,
    _otpToken: string,
  ): Promise<EpcsVerificationResult> {
    return {
      verified: false,
      providerNpi: npi,
      deaNumber,
      timestamp: new Date().toISOString(),
      auditToken: "",
      authMethod: "Two-Factor Push / TOTP",
      error: "DoseSpot EPCS verification is not implemented; no credential verification was performed.",
    };
  }

  async cancelPrescription(_orderId: string, _reason: string): Promise<boolean> {
    return false;
  }
}
