import { type EPrescribingAdapter } from "./prescribing/types";
import { MockSurescriptsAdapter } from "./prescribing/surescripts-adapter";
import { MockDoseSpotAdapter } from "./prescribing/dosespot-adapter";

import { type LabRequisitionAdapter } from "./labs/types";
import { MockQuestAdapter } from "./labs/quest-adapter";
import { MockLabcorpAdapter } from "./labs/labcorp-adapter";

export * from "./prescribing/types";
export * from "./labs/types";

// Active configured adapters (defaults)
export const defaultPrescribingAdapter: EPrescribingAdapter = new MockSurescriptsAdapter();
export const alternatePrescribingAdapter: EPrescribingAdapter = new MockDoseSpotAdapter();

export const defaultLabAdapter: LabRequisitionAdapter = new MockQuestAdapter();
export const alternateLabAdapter: LabRequisitionAdapter = new MockLabcorpAdapter();

export const availablePrescribingAdapters = [
  defaultPrescribingAdapter,
  alternatePrescribingAdapter,
];

export const availableLabAdapters = [
  defaultLabAdapter,
  alternateLabAdapter,
];
