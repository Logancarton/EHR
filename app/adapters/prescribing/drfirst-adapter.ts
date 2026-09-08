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

/**
 * Development-only placeholder for the intended future DrFirst integration.
 *
 * It deliberately does not simulate DrFirst network transmission, EPCS verification,
 * PDMP access, medication history, pharmacy acknowledgements, or SSO. Production DrFirst
 * connectivity must later be implemented behind EPrescribingAdapter without moving vendor
 * objects or credentials into the authoritative medication domain.
 */
export class MockDrFirstAdapter implements EPrescribingAdapter {
  id = "drfirst-placeholder";
  name = "DrFirst placeholder (development only)";
  standard = "Vendor-neutral development placeholder";
  description = "Reserved adapter boundary for future DrFirst connectivity. No external DrFirst or Surescripts services are active.";

  async transmitPrescriptions(
    orders: MedicationOrder[],
    _auth: ProviderAuth,
  ): Promise<PrescriptionTransmissionResult> {
    if (orders.length === 0) {
      throw new Error("Cannot transmit empty prescription batch.");
    }

    const hasControlled = orders.some((order) => order.requiresEpcs || order.deaSchedule !== "None");
    if (hasControlled) {
      throw new Error(
        "DrFirst EPCS is not implemented. Controlled-substance prescriptions cannot be transmitted by the development placeholder.",
      );
    }

    throw new Error(
      "DrFirst network transmission is not implemented. The development placeholder does not send prescriptions or create pharmacy-network acknowledgements.",
    );
  }

  async searchPharmacies(query: string, zipCode?: string): Promise<Pharmacy[]> {
    const q = query.toLowerCase().trim();
    if (!q) return standardPharmacies;

    return standardPharmacies.filter(
      (pharmacy) =>
        pharmacy.name.toLowerCase().includes(q) ||
        pharmacy.address.toLowerCase().includes(q) ||
        pharmacy.ncpdpId.includes(q) ||
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
      error: "DrFirst EPCS verification is not implemented; no credential verification was performed.",
    };
  }

  async cancelPrescription(_orderId: string, _reason: string): Promise<boolean> {
    return false;
  }
}
