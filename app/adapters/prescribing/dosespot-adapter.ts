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

export class MockDoseSpotAdapter implements EPrescribingAdapter {
  id = "dosespot-rest";
  name = "DoseSpot Integration API";
  standard = "DoseSpot Direct JSON REST API v2";
  description = "Alternative e-prescribing gateway for ambulatory psychiatric practices.";

  async transmitPrescriptions(
    orders: MedicationOrder[],
    auth: ProviderAuth
  ): Promise<PrescriptionTransmissionResult> {
    await new Promise((resolve) => setTimeout(resolve, 500));

    if (orders.length === 0) {
      throw new Error("Cannot transmit empty prescription batch.");
    }

    const primaryPharmacy = orders[0].pharmacy;
    const transmissionId = `DS-API-${Date.now().toString().slice(-6)}`;
    const auditCode = `DS-EPCS-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;

    const jsonPayload = JSON.stringify(
      {
        transactionId: transmissionId,
        prescriber: { npi: auth.npi, dea: auth.deaNumber },
        pharmacyNcpdp: primaryPharmacy.ncpdpId,
        prescriptions: orders.map((ord) => ({
          drug: ord.medication,
          quantity: ord.dispenseQuantity,
          daysSupply: ord.daysSupply,
          refills: ord.refills,
          directions: ord.sig,
          icd10: ord.indication,
        })),
      },
      null,
      2
    );

    return {
      success: true,
      transmissionId,
      vendor: "DoseSpot / Updox",
      standard: this.standard,
      transmittedCount: orders.length,
      pharmacyRouting: {
        pharmacyName: primaryPharmacy.name,
        ncpdpId: primaryPharmacy.ncpdpId,
        deliveryMethod: "EDI",
      },
      ediMessagePreview: jsonPayload,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      auditTrailCode: auditCode,
      epcsVerified: orders.some((o) => o.requiresEpcs),
    };
  }

  async searchPharmacies(query: string, zipCode?: string): Promise<Pharmacy[]> {
    const q = query.toLowerCase().trim();
    if (!q) return standardPharmacies;
    return standardPharmacies.filter((p) => p.name.toLowerCase().includes(q));
  }

  async verifyEpcsCredentials(
    npi: string,
    deaNumber: string,
    pin: string,
    otpToken: string
  ): Promise<EpcsVerificationResult> {
    return {
      verified: pin.length >= 4,
      providerNpi: npi,
      deaNumber,
      timestamp: new Date().toISOString(),
      auditToken: `DS-EPCS-TOKEN-${Date.now().toString().slice(-6)}`,
      authMethod: "Two-Factor Push / TOTP",
    };
  }

  async cancelPrescription(orderId: string, reason: string): Promise<boolean> {
    return true;
  }
}
