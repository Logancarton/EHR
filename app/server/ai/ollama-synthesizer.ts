import type { AssembledClinicalContext } from "../context/context-assembler";
import type { OmniboxEvidenceReference } from "../../domain/omnibox";
import { defaultOllamaClient, OllamaClient } from "./ollama-client";

export interface SynthesizedClinicalAnswer {
  answer: string;
  evidence: OmniboxEvidenceReference[];
}

function formatContextForModel(context: AssembledClinicalContext): string {
  const parts: string[] = [];

  parts.push(`PATIENT: ${context.patient.name}, Age ${context.patient.age}, MRN ${context.patient.mrn}`);
  if (context.patient.alert) parts.push(`ALERT: ${context.patient.alert}`);

  parts.push(`ACTIVE DIAGNOSES: ${context.activeDiagnoses.length ? context.activeDiagnoses.join(", ") : "None documented"}`);
  parts.push(`ALLERGIES: ${context.allergies.length ? context.allergies.join(", ") : "NKDA"}`);
  parts.push(`ACTIVE MEDICATIONS: ${context.activeMedications.length ? context.activeMedications.join("; ") : "None documented"}`);

  if (context.pendingMedicationCandidates?.length) {
    parts.push(`PENDING MEDICATION RECONCILIATION: ${context.pendingMedicationCandidates.map(c => c.rawEvidenceText).join("; ")}`);
  }

  if (context.recentLabs.length) {
    parts.push(`RECENT LABS:\n` + context.recentLabs.map(l => `- ${l.testName} (${l.date}): ${l.value} ${l.unit}${l.flag ? ` [${l.flag}]` : ""}`).join("\n"));
  }

  if (context.recentEncounters.length) {
    parts.push(`RECENT ENCOUNTERS:\n` + context.recentEncounters.map(e => `- Date: ${e.date}\n  Assessment: ${e.assessment || "None"}\n  Plan: ${e.plan || "None"}`).join("\n"));
  }

  return parts.join("\n\n");
}

export class OllamaSynthesizer {
  constructor(private readonly client: OllamaClient = defaultOllamaClient) {}

  async answerQuestion(
    question: string,
    context: AssembledClinicalContext,
  ): Promise<SynthesizedClinicalAnswer | null> {
    const isUp = await this.client.isAvailable(500);
    if (!isUp) return null;

    const formattedContext = formatContextForModel(context);
    const systemPrompt = `You are a clinical psychiatric EHR assistant for Clinical Bond.
You answer clinician questions using ONLY the bounded patient facts provided below.
Rules:
1. Grounding: Answer ONLY from the provided text. Never assume, extrapolate, or invent details.
2. Honesty: If the question asks for facts not documented in the context, explicitly say that the bounded record does not contain that information.
3. Brevity: Keep responses concise (1 to 3 sentences maximum), clinical, and professional.`;

    try {
      const text = await this.client.chat([
        { role: "system", content: systemPrompt },
        { role: "user", content: `CONTEXT:\n${formattedContext}\n\nQUESTION: ${question}\n\nANSWER:` },
      ], {
        temperature: 0.1,
        timeoutMs: 4000,
      });

      if (!text || !text.trim()) return null;

      // Extract evidence references based on which entities appear in the answer
      const evidence: OmniboxEvidenceReference[] = [];
      for (const enc of context.recentEncounters) {
        if (text.includes(enc.date) || text.toLowerCase().includes("encounter") || text.toLowerCase().includes("visit")) {
          evidence.push({
            label: `Encounter ${enc.date}`,
            sourceRef: enc.provenanceRef,
            excerpt: `${enc.assessment} ${enc.plan}`.slice(0, 200),
          });
          break;
        }
      }

      for (const med of context.activeMedications) {
        const drug = med.split(" ")[0];
        if (drug && text.toLowerCase().includes(drug.toLowerCase())) {
          const provKey = Object.keys(context.provenanceMap).find(k => k.startsWith("medication-") && !k.startsWith("medication-candidate-"));
          const ref = provKey ? context.provenanceMap[provKey] : `medications/${drug.toLowerCase()}`;
          evidence.push({
            label: med,
            sourceRef: ref,
            excerpt: med,
          });
          break;
        }
      }

      return {
        answer: text.trim(),
        evidence,
      };
    } catch {
      return null;
    }
  }
}

export const defaultOllamaSynthesizer = new OllamaSynthesizer();
