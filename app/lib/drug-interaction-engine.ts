import { type ClinicalSafetyAlert } from "../domain/orders";

type InteractionRule = {
  id: string;
  triggerKeywords: string[];
  regimenKeywords: string[];
  severity: "critical" | "warning" | "advisory";
  title: string;
  mechanism: string;
  clinicalAction: string;
};

const interactionRules: InteractionRule[] = [
  {
    id: "int-ssri-maoi",
    triggerKeywords: ["sertraline", "escitalopram", "fluoxetine", "paroxetine", "citalopram", "venlafaxine", "duloxetine"],
    regimenKeywords: ["phenelzine", "tranylcypromine", "selegiline", "isocarboxazid", "linezolid", "maoi"],
    severity: "critical",
    title: "Contraindicated: Fatal Serotonin Syndrome Risk (SSRI/SNRI + MAOI)",
    mechanism: "Concurrent inhibition of serotonin reuptake and monoamine oxidase enzyme leads to toxic hyper-serotonergic state (hyperthermia, autonomic instability, clonus, death).",
    clinicalAction: "Mandatory 14-day washout period (5 weeks for fluoxetine) required prior to MAOI administration.",
  },
  {
    id: "int-lithium-nsaid",
    triggerKeywords: ["lithium"],
    regimenKeywords: ["ibuprofen", "naproxen", "meloxicam", "celecoxib", "diclofenac", "advil", "aleve", "lisinopril", "losartan"],
    severity: "warning",
    title: "Therapeutic Risk: Lithium Toxicity via Decreased Renal Clearance",
    mechanism: "NSAIDs and ACE-inhibitors decrease renal prostaglandin synthesis and glomerular filtration, reducing lithium excretion and precipitating acute lithium toxicity (tremor, ataxia, encephalopathy).",
    clinicalAction: "Avoid concurrent NSAID/ACEi therapy or closely monitor 12-hour serum lithium trough and renal panel (BUN/Cr) with planned 25-50% dose reduction.",
  },
  {
    id: "int-lamotrigine-valproate",
    triggerKeywords: ["lamotrigine"],
    regimenKeywords: ["valproate", "valproic acid", "depakote", "divalproex"],
    severity: "warning",
    title: "Titration Alert: Doubled Lamotrigine Half-Life (Stevens-Johnson Syndrome Risk)",
    mechanism: "Valproate strongly inhibits hepatic glucuronidation of lamotrigine, more than doubling its elimination half-life and dramatically elevating the risk of severe toxic epidermal necrolysis / Stevens-Johnson syndrome.",
    clinicalAction: "Initiate lamotrigine at 25 mg every other day (half normal starting schedule). Titrate with extreme caution.",
  },
  {
    id: "int-benzo-cns-depressant",
    triggerKeywords: ["clonazepam", "lorazepam", "alprazolam", "diazepam", "temazepam"],
    regimenKeywords: ["quetiapine", "olanzapine", "clozapine", "hydroxyzine", "gabapentin", "pregabalin", "zolpidem", "trazodone", "oxycodone", "hydrocodone", "buprenorphine"],
    severity: "warning",
    title: "Sedation & Respiratory Depression Warning: Combined CNS Depressants",
    mechanism: "Additive GABAergic and anti-histaminergic receptor inhibition produces heightened sedation, motor incoordination, fall risk, and potential respiratory compromise.",
    clinicalAction: "Counsel patient regarding impairment of driving and hazardous machinery. Advise strict avoidance of alcohol. Confirm naloxone co-prescription if opioids present.",
  },
  {
    id: "int-qtc-prolongation",
    triggerKeywords: ["quetiapine", "citalopram", "escitalopram", "haloperidol", "ziprasidone"],
    regimenKeywords: ["quetiapine", "citalopram", "escitalopram", "hydroxyzine", "ondansetron", "methadone", "amiodarone"],
    severity: "advisory",
    title: "Cardiac Surveillance: Additive QTc Interval Prolongation Potential",
    mechanism: "Co-administration of multiple agents with human ether-a-go-go related gene (hERG) potassium channel blockade increases potential risk of torsades de pointes ventricular arrhythmia.",
    clinicalAction: "Obtain baseline 12-lead ECG. Monitor serum electrolytes (potassium >4.0 mEq/L, magnesium >2.0 mg/dL).",
  },
  {
    id: "int-stimulant-hypertension",
    triggerKeywords: ["methylphenidate", "amphetamine", "dextroamphetamine", "vyvanse", "adderall", "concerta"],
    regimenKeywords: ["guanfacine", "clonidine"],
    severity: "advisory",
    title: "Hemodynamic Notice: Stimulant & Alpha-2 Agonist Dual Therapy",
    mechanism: "Methylphenidate stimulates sympathetic outflow while Guanfacine is a central alpha-2A agonist. This combination is commonly used in ADHD to buffer evening rebound, but pulse and blood pressure require tracking.",
    clinicalAction: "Document resting blood pressure and pulse at each visit. Ensure no symptomatic orthostasis.",
  },
];

export function screenDrugInteractions(
  candidateDrug: string,
  currentMedications: string[]
): ClinicalSafetyAlert[] {
  const alerts: ClinicalSafetyAlert[] = [];
  const candidateLower = candidateDrug.toLowerCase();

  // 1. Check duplicate class therapy
  const isCandidateSSRI = ["sertraline", "escitalopram", "fluoxetine", "paroxetine", "citalopram"].some((k) =>
    candidateLower.includes(k)
  );
  if (isCandidateSSRI) {
    const existingSSRI = currentMedications.find((med) =>
      ["sertraline", "escitalopram", "fluoxetine", "paroxetine", "citalopram"].some((k) =>
        med.toLowerCase().includes(k) && !candidateLower.includes(k)
      )
    );
    if (existingSSRI) {
      alerts.push({
        id: `dup-ssri-${Date.now()}`,
        severity: "warning",
        title: `Duplicate Antidepressant Therapy: Concurrent SSRIs`,
        mechanism: `Patient is already prescribed ${existingSSRI}. Adding ${candidateDrug} constitutes dual SSRI therapy with increased adverse effect burden without proven synergistic efficacy.`,
        clinicalAction: "Confirm whether this is a planned cross-titration / switch, or maintain monotherapy.",
        drugsInvolved: [candidateDrug, existingSSRI],
      });
    }
  }

  // 2. Scan specific interaction rules
  for (const rule of interactionRules) {
    const isTrigger = rule.triggerKeywords.some((k) => candidateLower.includes(k));
    if (!isTrigger) continue;

    for (const med of currentMedications) {
      const medLower = med.toLowerCase();
      // Skip if checking medication against itself
      if (candidateLower.includes(medLower) || medLower.includes(candidateLower)) continue;

      const isRegimenMatch = rule.regimenKeywords.some((k) => medLower.includes(k));
      if (isRegimenMatch) {
        alerts.push({
          id: `${rule.id}-${Math.random().toString(36).substring(2, 6)}`,
          severity: rule.severity,
          title: rule.title,
          mechanism: rule.mechanism,
          clinicalAction: rule.clinicalAction,
          drugsInvolved: [candidateDrug, med],
        });
      }
    }
  }

  return alerts;
}
