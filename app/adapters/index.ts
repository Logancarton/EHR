import { type EPrescribingAdapter } from "./prescribing/types";
import { MockSurescriptsAdapter } from "./prescribing/surescripts-adapter";
import { MockDoseSpotAdapter } from "./prescribing/dosespot-adapter";
import { MockDrFirstAdapter } from "./prescribing/drfirst-adapter";

import { type LabRequisitionAdapter } from "./labs/types";
import { MockQuestAdapter } from "./labs/quest-adapter";
import { MockLabcorpAdapter } from "./labs/labcorp-adapter";

export * from "./prescribing/types";
export * from "./labs/types";

// Active configured adapters (defaults)
export const drFirstPrescribingAdapter: EPrescribingAdapter = new MockDrFirstAdapter();
export const defaultPrescribingAdapter: EPrescribingAdapter = drFirstPrescribingAdapter;
export const surescriptsPrescribingAdapter: EPrescribingAdapter = new MockSurescriptsAdapter();
export const alternatePrescribingAdapter: EPrescribingAdapter = new MockDoseSpotAdapter();

export const defaultLabAdapter: LabRequisitionAdapter = new MockQuestAdapter();
export const alternateLabAdapter: LabRequisitionAdapter = new MockLabcorpAdapter();

export const availablePrescribingAdapters = [
  drFirstPrescribingAdapter,
  surescriptsPrescribingAdapter,
  alternatePrescribingAdapter,
];

export const availableLabAdapters = [
  defaultLabAdapter,
  alternateLabAdapter,
];

