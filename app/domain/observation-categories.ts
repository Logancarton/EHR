/**
 * Where an observation belongs.
 *
 * Vital signs and laboratory results are different records with different entry
 * paths: vitals are measured in the office and go through `record_vitals`, which
 * validates each measurement and derives BMI and flags; lab results come from a
 * specimen and are acknowledged in the lab queue. A blood pressure filed as a lab
 * result shows up as a lab order to acknowledge, inflates the lab badge, and is
 * missing from the vitals flowsheet — so the generic observation path refuses it.
 */

/** Categories the generic `add_observation` action may write. */
export const GENERIC_OBSERVATION_CATEGORIES = ["laboratory", "imaging", "procedure"] as const;
export type GenericObservationCategory = (typeof GENERIC_OBSERVATION_CATEGORIES)[number];

/**
 * Laboratory results are stored as "laboratory"; older rows and some adapters
 * wrote "lab" or "labs". Every reader asks this rather than comparing a string,
 * so a rule cannot silently match nothing because it spelled the category
 * differently from storage.
 */
export function isLaboratoryCategory(category: string | null | undefined): boolean {
  const normalized = (category ?? "").trim().toLowerCase();
  return normalized === "laboratory" || normalized === "lab" || normalized === "labs";
}

export function isGenericObservationCategory(value: string): value is GenericObservationCategory {
  return (GENERIC_OBSERVATION_CATEGORIES as readonly string[]).includes(value);
}

/**
 * LOINC codes for vital-sign measurements (the vital-signs panel and its members).
 * Any of these arriving as a laboratory result is a filing error.
 */
export const VITAL_SIGN_LOINC_CODES: ReadonlySet<string> = new Set([
  "85353-1", // Vital signs, weight, height, head circumference, oxygen saturation and BMI panel
  "85354-9", // Blood pressure panel with all children optional
  "8480-6", // Systolic blood pressure
  "8462-4", // Diastolic blood pressure
  "8867-4", // Heart rate
  "9279-1", // Respiratory rate
  "8310-5", // Body temperature
  "59408-5", // Oxygen saturation by pulse oximetry
  "2708-6", // Oxygen saturation in arterial blood
  "29463-7", // Body weight
  "8302-2", // Body height
  "39156-5", // Body mass index
]);

const VITAL_SIGN_NAME =
  /\b(blood pressure|systolic|diastolic|pulse|heart rate|respiratory rate|body temperature|oxygen saturation|spo2|vital signs?)\b/i;

/**
 * True when a result offered as a lab is really a vital sign, by code or,
 * for uncoded entries, by name.
 */
export function looksLikeVitalSign(input: { code?: string | null; testName: string }): boolean {
  if (input.code && VITAL_SIGN_LOINC_CODES.has(input.code.trim())) return true;
  return VITAL_SIGN_NAME.test(input.testName);
}

/**
 * Refuses an observation the generic path must not store. Returns the reason, or
 * null when the entry is acceptable.
 */
export function genericObservationRefusal(input: {
  category: string;
  code?: string | null;
  testName: string;
  valueText: string;
}): string | null {
  if (input.category === "vital-signs") {
    return "Vital signs are recorded through the vitals form, which validates each measurement.";
  }
  if (!isGenericObservationCategory(input.category)) {
    return `Unknown observation category "${input.category}". Use one of: ${GENERIC_OBSERVATION_CATEGORIES.join(", ")}.`;
  }
  if (!input.testName.trim()) return "A result needs a test name.";
  if (!input.valueText.trim()) return "A result needs a value.";
  if (input.category === "laboratory" && looksLikeVitalSign(input)) {
    return `"${input.testName}" is a vital sign, not a lab result. Record it through the vitals form.`;
  }
  return null;
}
