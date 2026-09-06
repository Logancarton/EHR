import {
  PSYCHIATRIC_MEDICATIONS,
  DSM5_DIAGNOSES,
  type PsychiatricMedicationInfo,
  type Dsm5DiagnosticInfo,
} from "./psychiatric-vocabulary";
import { type CandidateAction, type TranscriptUtterance } from "./encounter-engine";

export interface ExtractedCandidateAction extends CandidateAction {
  provenanceUtteranceId?: string;
  speaker?: string;
  structuredPayload?: {
    kind: "prescription" | "lab" | "diagnosis" | "billing";
    drugName?: string;
    targetDose?: string;
    route?: string;
    frequency?: string;
    testName?: string;
    testCode?: string;
    icd10?: string;
    cptCode?: string;
  };
}

export function extractCandidateEntities(
  utterances: TranscriptUtterance[],
  activeMedications: string[] = []
): ExtractedCandidateAction[] {
  const candidates: ExtractedCandidateAction[] = [];
  const seenKeys = new Set<string>();

  for (const utt of utterances) {
    const text = utt.text;
    const lower = text.toLowerCase();

    // 1. Detect Medication Titrations & Prescriptions
    for (const med of PSYCHIATRIC_MEDICATIONS) {
      const matchGeneric = lower.includes(med.generic.toLowerCase());
      const matchBrand = lower.includes(med.brand.toLowerCase());

      if (matchGeneric || matchBrand) {
        // Look for titration keywords in proximity
        const titrationPatterns = [
          /\b(?:titrate|increase|raise|bump|up)\s+(?:the\s+)?(\w+[\s\w]*?)\s+(?:from\s+(\d+\s*(?:mg|ml|mcg)))?\s*(?:to\s+(\d+\s*(?:mg|ml|mcg)))/i,
          /\b(?:titrate|increase|raise|bump|up)\s+(?:to\s+)?(\d+\s*(?:mg|ml|mcg))\s+(?:at\s+bedtime|nightly|in\s+the\s+morning|daily|bid|qhs)?/i,
          /\b(?:start|commence|prescribe)\s+(?:the\s+)?(\w+[\s\w]*?)\s+(\d+\s*(?:mg|ml|mcg))/i,
          /\b(?:taper|decrease|lower)\s+(?:the\s+)?(\w+[\s\w]*?)\s+(?:to\s+(\d+\s*(?:mg|ml|mcg)))?/i,
        ];

        let matchedDose = "";
        let isTitration = false;

        for (const pat of titrationPatterns) {
          const match = text.match(pat);
          if (match) {
            isTitration = true;
            matchedDose = match[3] || match[2] || match[1] || "";
            break;
          }
        }

        // Also check if words like "3mg", "3 mg", "nightly", "bedtime" exist in this sentence
        if (!isTitration) {
          const doseMatch = text.match(/(\d+(?:\.\d+)?\s*(?:mg|mcg))/i);
          if (doseMatch && (lower.includes("take") || lower.includes("nightly") || lower.includes("bedtime") || lower.includes("morning") || lower.includes("titrate"))) {
            isTitration = true;
            matchedDose = doseMatch[1];
          }
        }

        if (isTitration) {
          const key = `rx-${med.generic}-${matchedDose}`;
          if (!seenKeys.has(key)) {
            seenKeys.add(key);

            const displayDrug = `${med.generic.toUpperCase()} (${med.brand})`;
            const detailText = matchedDose
              ? `Titrate ${med.generic} to ${matchedDose} orally nightly at bedtime with a light snack. Monitor blood pressure and sedation.`
              : `Adjust ${med.generic} dosage in accordance with clinical protocol.`;

            candidates.push({
              id: `cand-rx-${Date.now()}-${candidates.length + 1}`,
              type: "medication-titration",
              title: `Titrate ${med.brand} (${med.generic})`,
              detail: detailText,
              status: "suggested",
              provenanceSnippet: text.trim(),
              provenanceUtteranceId: utt.id,
              speaker: utt.speakerName,
              rationale: `Detected clinician treatment decision in conversation dialogue for ${med.class} regimen.`,
              structuredPayload: {
                kind: "prescription",
                drugName: med.brand,
                targetDose: matchedDose || med.standardDoses[0],
                route: "oral",
                frequency: "QHS",
              },
            });
          }
        }
      }
    }

    // 2. Detect Lab Orders & Metabolic Surveillance
    const labTriggers = [
      { trigger: /lipid\s*(?:panel|profile)/i, name: "Fasting Lipid Panel", code: "80061", rationale: "Metabolic surveillance for second-generation antipsychotic therapy." },
      { trigger: /(?:cmp|comprehensive\s*metabolic)/i, name: "Comprehensive Metabolic Panel (CMP)", code: "80053", rationale: "Hepatic and renal safety monitoring." },
      { trigger: /(?:bmp|basic\s*metabolic)/i, name: "Basic Metabolic Panel (BMP)", code: "80048", rationale: "Electrolyte and renal function check." },
      { trigger: /(?:fasting\s*glucose|a1c|hba1c)/i, name: "Hemoglobin A1c & Fasting Glucose", code: "83036", rationale: "Screening for glycemic dysregulation / insulin resistance." },
      { trigger: /lithium\s*(?:level|trough)/i, name: "Serum Lithium Level (12-hr Trough)", code: "80178", rationale: "Therapeutic drug monitoring; therapeutic window 0.6-1.0 mEq/L." },
      { trigger: /(?:tsh|thyroid)/i, name: "TSH (Thyroid Stimulating Hormone)", code: "84443", rationale: "Baseline/annual surveillance for thyroid homeostasis." },
      { trigger: /ecg|ekg/i, name: "12-Lead Electrocardiogram (ECG)", code: "93000", rationale: "Baseline QTc interval assessment." },
    ];

    for (const lab of labTriggers) {
      if (lab.trigger.test(lower) && (lower.includes("order") || lower.includes("draw") || lower.includes("check") || lower.includes("send") || lower.includes("lab"))) {
        const key = `lab-${lab.code}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          candidates.push({
            id: `cand-lab-${Date.now()}-${candidates.length + 1}`,
            type: "lab-order",
            title: `Order: ${lab.name}`,
            detail: `Generate electronic requisition for ${lab.name} (CPT ${lab.code}) sent to Quest Diagnostics.`,
            status: "suggested",
            provenanceSnippet: text.trim(),
            provenanceUtteranceId: utt.id,
            speaker: utt.speakerName,
            rationale: lab.rationale,
            structuredPayload: {
              kind: "lab",
              testName: lab.name,
              testCode: lab.code,
            },
          });
        }
      }
    }

    // 3. Detect DSM-5 Criteria Matches & Diagnostics
    for (const dsm of DSM5_DIAGNOSES) {
      const matchCount = dsm.keywords.filter((kw) => lower.includes(kw)).length;
      if (matchCount >= 2 || lower.includes(dsm.code.toLowerCase())) {
        const key = `dx-${dsm.code}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          candidates.push({
            id: `cand-dx-${Date.now()}-${candidates.length + 1}`,
            type: "diagnosis",
            title: `DSM-5 Criteria Match: ${dsm.name} (${dsm.code})`,
            detail: `${dsm.category} diagnostic criteria discussed in visit: "${dsm.keyCriteria[0]}"`,
            status: "suggested",
            provenanceSnippet: text.trim(),
            provenanceUtteranceId: utt.id,
            speaker: utt.speakerName,
            rationale: `Patient dialogue reflects persistent clinical markers matching DSM-5 ${dsm.code}.`,
            structuredPayload: {
              kind: "diagnosis",
              icd10: dsm.code,
            },
          });
        }
      }
    }

    // 4. Detect Clinical Referrals & Psychotherapeutic Interventions
    const referralTriggers = [
      { phrase: /cbt|cognitive\s*behavioral/i, title: "Referral: Individual Cognitive Behavioral Therapy (CBT)", detail: "CBT for executive dysfunction pacing and bedtime stimulus control." },
      { phrase: /sleep\s*hygiene/i, title: "Clinical Intervention: Sleep Hygiene Protocol", detail: "Advised on 45-min screen cutoff, consistent bedtime routine, and light snack with nightly medication." },
      { phrase: /neuropsych/i, title: "Referral: Comprehensive Neuropsychological Testing", detail: "Formal psychoeducational and executive functioning assessment." },
    ];

    for (const ref of referralTriggers) {
      if (ref.phrase.test(lower)) {
        const key = `ref-${ref.title}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          candidates.push({
            id: `cand-ref-${Date.now()}-${candidates.length + 1}`,
            type: "referral",
            title: ref.title,
            detail: ref.detail,
            status: "suggested",
            provenanceSnippet: text.trim(),
            provenanceUtteranceId: utt.id,
            speaker: utt.speakerName,
            rationale: "Behavioral health non-pharmacological support discussed in encounter.",
          });
        }
      }
    }
  }

  return candidates;
}
