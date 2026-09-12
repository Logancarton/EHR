"use client";

import { useCallback, useState } from "react";
import type { Patient } from "../domain/patient";
import { type ClinicalOrder, type LabOrder, psychiatricLabCatalog } from "../domain/orders";
import { findRosterPatient } from "./patient-roster";
import { loadStagedOrders, saveStagedOrders } from "./order-service";

/**
 * The order cart: what is staged per patient, and the composer that opens over it.
 *
 * Staged orders are explicitly *not* clinical truth — nothing here has been
 * authorized or transmitted. They are a clinician's working set, which is why they
 * live in this shell rather than in the clinical record, and why drafting one only
 * ever opens the composer instead of committing anything.
 */

export type OrderComposerTab = "cart" | "prescribe" | "labs";

export type StagedOrders = {
  byPatient: Record<string, ClinicalOrder[]>;
  countFor: (patientId: string) => number;

  composerOpen: boolean;
  composerPatientId: string;
  composerTab: OrderComposerTab;
  composerPrefillLab: string | undefined;
  closeComposer: () => void;
  openComposer: (patientId: string, tab?: OrderComposerTab, prefillLab?: string) => void;

  draftLabOrder: (patientId: string, labName: string) => void;
  draftOverdueLabs: (patientId: string, labNames: string[]) => void;
  setStagedForPatient: (patientId: string, orders: ClinicalOrder[]) => void;
};

const ORDERING_CLINICIAN = "Dr. Logan Carton, MD";

function catalogEntry(labName: string) {
  const wanted = labName.toLowerCase();
  return psychiatricLabCatalog.find(
    (entry) => entry.testName.toLowerCase().includes(wanted) || wanted.includes(entry.testName.toLowerCase()),
  );
}

function stagedLabOrder(id: string, patient: Patient, labName: string, fastingDefault: boolean): LabOrder {
  const entry = catalogEntry(labName);
  return {
    id,
    patientId: patient.id,
    type: "lab",
    testName: entry?.testName || labName,
    loincCode: entry?.loincCode || "24323-8",
    specimen: entry?.specimen || (fastingDefault ? "Blood (Serum/Plasma)" : "Blood (Serum)"),
    priority: "Protocol Surveillance",
    fastingRequired: entry?.fastingRequired || fastingDefault,
    clinicalRationale: entry?.description || `Periodic surveillance lab for ${patient.name}`,
    indication: fastingDefault
      ? `${patient.diagnoses[0] || "Psychiatric Protocol"} surveillance`
      : patient.diagnoses[0] || "Psychiatric Protocol Surveillance",
    targetFacility: "Quest Diagnostics",
    status: "staged",
    orderedBy: ORDERING_CLINICIAN,
    createdAt: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
  };
}

export function useStagedOrders({ roster }: { roster: readonly Patient[] }): StagedOrders {
  const [byPatient, setByPatient] = useState<Record<string, ClinicalOrder[]>>(() => loadStagedOrders());
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerPatientId, setComposerPatientId] = useState("");
  const [composerTab, setComposerTab] = useState<OrderComposerTab>("cart");
  const [composerPrefillLab, setComposerPrefillLab] = useState<string | undefined>(undefined);

  const openComposer = useCallback(
    (patientId: string, tab: OrderComposerTab = "cart", prefillLab?: string) => {
      setComposerPatientId(patientId);
      setComposerTab(tab);
      setComposerPrefillLab(prefillLab);
      setComposerOpen(true);
    },
    [],
  );

  const closeComposer = useCallback(() => setComposerOpen(false), []);

  /** Adds orders that are not already staged, then shows the clinician the cart. */
  const stage = useCallback(
    (patientId: string, orders: LabOrder[]) => {
      setByPatient((previous) => {
        const existing = previous[patientId] || [];
        const additions = orders.filter(
          (order) => !existing.some((staged) => staged.type === "lab" && staged.testName === order.testName),
        );
        if (additions.length === 0) return previous;
        const next = { ...previous, [patientId]: [...existing, ...additions] };
        saveStagedOrders(next);
        return next;
      });
      openComposer(patientId, "cart");
    },
    [openComposer],
  );

  const draftLabOrder = useCallback(
    (patientId: string, labName: string) => {
      const patient = findRosterPatient(patientId, roster);
      if (!patient) return;
      const id = `ord-lab-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      stage(patientId, [stagedLabOrder(id, patient, labName, false)]);
    },
    [roster, stage],
  );

  const draftOverdueLabs = useCallback(
    (patientId: string, labNames: string[]) => {
      const patient = findRosterPatient(patientId, roster);
      if (!patient) return;
      stage(
        patientId,
        labNames.map((labName, index) => stagedLabOrder(`ord-lab-${Date.now()}-${index}`, patient, labName, true)),
      );
    },
    [roster, stage],
  );

  const setStagedForPatient = useCallback((patientId: string, orders: ClinicalOrder[]) => {
    setByPatient((previous) => {
      const next = { ...previous, [patientId]: orders };
      saveStagedOrders(next);
      return next;
    });
  }, []);

  const countFor = useCallback((patientId: string) => (byPatient[patientId] || []).length, [byPatient]);

  return {
    byPatient,
    countFor,
    composerOpen,
    composerPatientId,
    composerTab,
    composerPrefillLab,
    closeComposer,
    openComposer,
    draftLabOrder,
    draftOverdueLabs,
    setStagedForPatient,
  };
}
