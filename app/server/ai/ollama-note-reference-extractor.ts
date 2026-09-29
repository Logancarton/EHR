import type { ExtractionRequest } from "../../domain/note-reference-extraction";
import type { NoteReferenceExtractor } from "./note-reference-extractor";
import { defaultOllamaClient, OllamaClient } from "./ollama-client";

export class OllamaNoteReferenceExtractor implements NoteReferenceExtractor {
  readonly provider = "ollama";
  readonly model: string;
  private readonly client: OllamaClient;

  constructor(modelName?: string, client: OllamaClient = defaultOllamaClient) {
    this.model = modelName || process.env.OLLAMA_MODEL || "llama3.2:1b";
    this.client = client;
  }

  async extract(request: ExtractionRequest): Promise<unknown> {
    if (!request.text.trim() || request.candidates.length === 0) {
      return { selections: [] };
    }

    const candidateList = request.candidates.map((c) => ({
      entityId: c.entityId,
      display: c.display,
      aliases: c.aliases || [],
    }));

    const systemPrompt = `You are a psychiatric clinical entity matcher for Clinical Bond EHR.
Given a note text and a candidate list of existing patient records, identify which candidates are mentioned in the text.
Rules:
1. ONLY select entityId values from the provided candidate list. Never invent new IDs.
2. For each match, return entityId, spanStart (start index in text, or null), spanEnd (end index, or null), and confidence (between 0.5 and 1.0).
3. If no candidates match, return an empty selections array.

Output JSON format:
{"selections": [{"entityId": "id", "spanStart": 10, "spanEnd": 20, "confidence": 0.9}]}`;

    try {
      const response = await this.client.chatJson<{ selections?: unknown }>(
        [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `NOTE TEXT:\n"${request.text}"\n\nCANDIDATES:\n${JSON.stringify(candidateList)}`,
          },
        ],
        {
          model: this.model,
          temperature: 0,
          format: "json",
          timeoutMs: 4000,
        },
      );

      return response;
    } catch {
      return { selections: [] };
    }
  }
}
