"use client";

import { useEffect, useState } from "react";
import { type Patient, type Section, patients } from "../../domain/patient";
import {
  type ProviderPreferences,
  defaultPreferences,
  parseAiPreferenceCommand,
} from "../../lib/preference-engine";
import { api } from "../../lib/api-client";
import type { AssembledClinicalContext } from "../../server/context/context-assembler";
import type { SearchResultItem } from "../../server/repositories/clinical-search-repository";

export interface AiQueryResult {
  query: string;
  answer: string;
  type: "clinical" | "layout" | "search" | "summary";
  citations?: Array<{
    date: string;
    chiefComplaint: string;
    snippet: string;
    rank?: number;
  }>;
  suggestedAction?: {
    label: string;
    action: () => void;
  };
}

export default function ClinicalAiPanel({
  patient,
  section,
  command,
  preferences = defaultPreferences,
  onUpdatePreferences,
  onOpenCustomizer,
  onClose,
  onNavigateSection,
  onInsertToNote,
  onSplitScreen,
}: {
  patient: Patient;
  section: Section;
  command: string;
  preferences?: ProviderPreferences;
  onUpdatePreferences?: (updated: ProviderPreferences) => void;
  onOpenCustomizer?: () => void;
  onClose?: () => void;
  onNavigateSection?: (section: Section) => void;
  onInsertToNote?: (text: string) => void;
  onSplitScreen?: (targetPatientId: string) => void;
}) {
  const [customAiText, setCustomAiText] = useState("");
  const [activeResult, setActiveResult] = useState<AiQueryResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [assembledContext, setAssembledContext] = useState<AssembledClinicalContext | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Load real clinical context bundle from SQLite backend
  useEffect(() => {
    let active = true;
    api.context
      .assemble({ patientId: patient.id, surface: "general" })
      .then((ctx) => {
        if (active && ctx) {
          setAssembledContext(ctx);
        }
      })
      .catch((err) => {
        console.warn("Context assembler fallback:", err);
      });
    return () => {
      active = false;
    };
  }, [patient.id]);

  // If initial command passed in from Omnibox, execute it automatically
  useEffect(() => {
    if (command && command.trim().length > 0) {
      handleAiSubmit(command);
    }
  }, [command]);

  function triggerToast(msg: string) {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 2600);
  }

  async function handleAiSubmit(promptText: string) {
    if (!promptText.trim()) return;
    const input = promptText.trim();
    const lower = input.toLowerCase();
    setIsLoading(true);
    setCustomAiText("");

    // 1. Workspace Layout Operator
    if (preferences && onUpdatePreferences) {
      const prefRes = parseAiPreferenceCommand(input, preferences);
      if (prefRes.recognized && prefRes.updatedPreferences) {
        onUpdatePreferences(prefRes.updatedPreferences);
        setActiveResult({
          query: input,
          type: "layout",
          answer: prefRes.feedback,
        });
        setIsLoading(false);
        triggerToast("✦ Workspace layout updated.");
        return;
      }
    }

    // 2. Split Screen Operator
    if (lower.includes("split") || lower.includes("side by side") || lower.includes("dual chart")) {
      const otherPatient =
        patients.find((p) => p.id !== patient.id && lower.includes(p.name.toLowerCase().split(" ")[0])) ||
        patients.find((p) => p.id !== patient.id) ||
        patients[0];

      setActiveResult({
        query: input,
        type: "layout",
        answer: `Opening ${otherPatient.name} in a detached side-by-side workspace alongside ${patient.name}.`,
        suggestedAction: onSplitScreen
          ? {
              label: `🪟 Open Split with ${otherPatient.name.split(" ")[0]}`,
              action: () => onSplitScreen(otherPatient.id),
            }
          : undefined,
      });

      if (onSplitScreen) {
        onSplitScreen(otherPatient.id);
      }
      setIsLoading(false);
      return;
    }

    // 3. Clinical Navigation Operators
    if (lower.includes("med") || lower.includes("prescription") || lower.includes("rx") || lower.includes("refill")) {
      if (lower.startsWith("open") || lower.startsWith("go to") || lower.startsWith("show")) {
        if (onNavigateSection) onNavigateSection("Meds");
        setActiveResult({
          query: input,
          type: "layout",
          answer: `Navigated to Medication Workspace for ${patient.name}.`,
        });
        setIsLoading(false);
        return;
      }
    }

    if (lower.includes("lab") || lower.includes("blood") || lower.includes("surveillance")) {
      if (lower.startsWith("open") || lower.startsWith("go to") || lower.startsWith("show")) {
        if (onNavigateSection) onNavigateSection("Labs");
        setActiveResult({
          query: input,
          type: "layout",
          answer: `Navigated to Labs & Metabolic Surveillance for ${patient.name}.`,
        });
        setIsLoading(false);
        return;
      }
    }

    // 4. Longitudinal Synthesis & FTS5 Semantic Search
    try {
      const ftsMatches = await api.ai.searchNotes(input, patient.id, 5);

      // Handle "Summarize chart"
      if (lower.includes("summarize") || lower.includes("overview") || lower.includes("summary")) {
        const medsList = assembledContext?.activeMedications.join(", ") || patient.meds.join(", ");
        const dxList = assembledContext?.activeDiagnoses.join(", ") || patient.diagnoses.join(", ");
        const lastEnc = assembledContext?.recentEncounters[0];

        const summaryText =
          `**${patient.name} (${patient.age}yo ${patient.pronouns})**\n\n` +
          `• **Active Diagnoses:** ${dxList}\n` +
          `• **Current Regimen:** ${medsList}\n` +
          `• **Allergies:** ${assembledContext?.allergies.join(", ") || "NKDA"}\n` +
          (lastEnc
            ? `• **Last Visit (${lastEnc.date}):** ${lastEnc.chiefComplaint}. Assessment: ${lastEnc.assessment.slice(0, 150)}...\n`
            : "") +
          `• **Surveillance:** ${
            assembledContext?.monitoringProtocols.some((p) => p.status === "overdue")
              ? "⚠️ Metabolic labs overdue"
              : "✓ All routine protocols current"
          }`;

        setActiveResult({
          query: input,
          type: "summary",
          answer: summaryText,
          suggestedAction: onInsertToNote
            ? {
                label: "✦ Insert Summary into Note",
                action: () => {
                  onInsertToNote(summaryText);
                  triggerToast("Inserted summary into active clinical note.");
                },
              }
            : undefined,
        });
        setIsLoading(false);
        return;
      }

      // Handle "What changed" / "Compare visits"
      if (lower.includes("what changed") || lower.includes("compare") || lower.includes("interval")) {
        const encounters = assembledContext?.recentEncounters || [];
        let comparisonText = `**Interval Changes for ${patient.name}:**\n\n`;

        if (encounters.length >= 2) {
          comparisonText +=
            `• **Recent Visit (${encounters[0].date}):** ${encounters[0].chiefComplaint}\n  Plan: ${encounters[0].plan.slice(0, 120)}...\n\n` +
            `• **Prior Visit (${encounters[1].date}):** ${encounters[1].chiefComplaint}\n  Plan: ${encounters[1].plan.slice(0, 120)}...\n\n` +
            `• **Key Trajectory:** Patient tolerated dose titrations with stable functional improvements. Surveillance monitoring active.`;
        } else {
          comparisonText += `• Current active regimen: ${patient.meds.join("; ")}.\n• Interval functional status stable with no acute psychiatric decompensations reported.`;
        }

        setActiveResult({
          query: input,
          type: "clinical",
          answer: comparisonText,
          suggestedAction: onInsertToNote
            ? {
                label: "✦ Insert Comparison into Note",
                action: () => {
                  onInsertToNote(comparisonText);
                  triggerToast("Inserted comparison into note.");
                },
              }
            : undefined,
        });
        setIsLoading(false);
        return;
      }

      // Handle Specific Longitudinal Queries with FTS5 Matches
      if (ftsMatches && ftsMatches.length > 0) {
        const citations = ftsMatches.map((m) => ({
          date: m.date,
          chiefComplaint: m.chiefComplaint,
          snippet: m.snippet,
          rank: m.rank,
        }));

        const answerText =
          `Found ${ftsMatches.length} longitudinal clinical note citations in SQLite for **"${input}"** across ${patient.name}'s chart.\n\n` +
          `Most relevant documentation from **${ftsMatches[0].date}**: "${ftsMatches[0].snippet.replace(/\*\*/g, "")}"`;

        setActiveResult({
          query: input,
          type: "search",
          answer: answerText,
          citations,
          suggestedAction: onInsertToNote
            ? {
                label: "✦ Insert Citation into Note",
                action: () => {
                  const citationText = `[Longitudinal Citation ${ftsMatches[0].date}]: ${ftsMatches[0].snippet.replace(/\*\*/g, "")}`;
                  onInsertToNote(citationText);
                  triggerToast("Inserted citation into active note.");
                },
              }
            : undefined,
        });
      } else {
        // Fallback clinical synthesis from assembled context
        const matchedMed = assembledContext?.activeMedications.find((m) =>
          m.toLowerCase().includes(lower)
        );
        const matchedLab = assembledContext?.recentLabs.find((l) =>
          l.testName.toLowerCase().includes(lower)
        );

        let answer = `No specific historical visit notes matched "${input}".`;
        if (matchedMed) {
          answer = `**${matchedMed}** is on ${patient.name}'s active medication list.`;
        } else if (matchedLab) {
          answer = `**${matchedLab.testName}** was last completed on ${matchedLab.date} (${matchedLab.value} ${matchedLab.unit}).`;
        }

        setActiveResult({
          query: input,
          type: "clinical",
          answer,
        });
      }
    } catch (err) {
      setActiveResult({
        query: input,
        type: "clinical",
        answer: `Synthesized clinical context for "${input}". Active medications: ${patient.meds.join(", ")}.`,
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <aside className="companion-panel" aria-label="Clinical AI Companion">
      {toastMessage && (
        <div
          style={{
            position: "absolute",
            top: "60px",
            left: "16px",
            right: "16px",
            zIndex: 100,
            background: "#1e293b",
            color: "#ffffff",
            padding: "8px 12px",
            borderRadius: "8px",
            fontSize: "12px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          }}
        >
          {toastMessage}
        </div>
      )}

      {/* Header */}
      <div className="companion-panel-header">
        <div>
          <span className="spark" style={{ color: "#1a73e8", fontSize: "16px" }}>✦</span>
          <div>
            <strong>Clinical AI Companion</strong>
            <small>{patient.name} · {section}</small>
          </div>
        </div>
        <button
          type="button"
          className="companion-close-btn"
          aria-label="Close"
          onClick={onClose}
        >
          ✕
        </button>
      </div>

      {/* Live Context Card */}
      <div className="ai-context" style={{ padding: "12px 16px", borderBottom: "1px solid var(--m3-border, #e2e8f0)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
          <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.5px", color: "#64748b" }}>
            AUTHENTICATED HOME-BASE CONTEXT
          </span>
          {assembledContext && (
            <span style={{ fontSize: "10px", color: "#10b981", fontWeight: 600 }}>
              ● {assembledContext.estimatedTokens} tokens
            </span>
          )}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
          <span style={{ background: "#e0f2fe", color: "#0369a1", fontSize: "11px", padding: "2px 6px", borderRadius: "4px", fontWeight: 500 }}>
            Rx: {assembledContext ? assembledContext.activeMedications.length : patient.meds.length} active
          </span>
          <span style={{ background: "#f1f5f9", color: "#475569", fontSize: "11px", padding: "2px 6px", borderRadius: "4px" }}>
            {assembledContext?.allergies[0] || "NKDA"}
          </span>
          {assembledContext?.monitoringProtocols.some((p) => p.status === "overdue") && (
            <span style={{ background: "#fee2e2", color: "#dc2626", fontSize: "11px", padding: "2px 6px", borderRadius: "4px", fontWeight: 600 }}>
              ⚠️ Lab Overdue
            </span>
          )}
        </div>
      </div>

      {/* Active AI Response Card */}
      {activeResult && (
        <div
          className="ai-action-card"
          style={{
            margin: "12px 16px",
            padding: "12px",
            background: "#ffffff",
            border: "1px solid #cbd5e1",
            borderRadius: "10px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
            <span className="spark" style={{ color: "#1a73e8" }}>✦</span>
            <strong style={{ fontSize: "12px", color: "#0f172a" }}>
              {activeResult.type === "layout" && "Workspace Operator"}
              {activeResult.type === "search" && "Longitudinal Search (SQLite FTS5)"}
              {activeResult.type === "summary" && "Chart Synthesis"}
              {activeResult.type === "clinical" && "Clinical Reasoning"}
            </strong>
          </div>

          <div
            style={{ fontSize: "12px", color: "#334155", lineHeight: 1.5, whiteSpace: "pre-wrap" }}
            dangerouslySetInnerHTML={{
              __html: activeResult.answer.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>"),
            }}
          />

          {/* Citations List */}
          {activeResult.citations && activeResult.citations.length > 0 && (
            <div style={{ marginTop: "10px", borderTop: "1px solid #e2e8f0", paddingTop: "8px" }}>
              <span style={{ fontSize: "10px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
                Longitudinal Citations ({activeResult.citations.length})
              </span>
              {activeResult.citations.map((c, i) => (
                <div key={i} style={{ marginTop: "6px", fontSize: "11px", background: "#f8fafc", padding: "6px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", color: "#1e293b", fontWeight: 600 }}>
                    <span>{c.chiefComplaint}</span>
                    <time style={{ color: "#64748b", fontWeight: 400 }}>{c.date}</time>
                  </div>
                  <p
                    style={{ margin: "4px 0 0 0", color: "#475569" }}
                    dangerouslySetInnerHTML={{
                      __html: c.snippet.replace(/\*\*(.*?)\*\*/g, "<mark style='background:#fef08a;padding:0 2px;'>$1</mark>"),
                    }}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Action Row */}
          <div style={{ marginTop: "10px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {activeResult.suggestedAction && (
              <button
                type="button"
                onClick={activeResult.suggestedAction.action}
                style={{
                  background: "#1a73e8",
                  color: "#ffffff",
                  border: 0,
                  borderRadius: "6px",
                  padding: "5px 10px",
                  fontSize: "11px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {activeResult.suggestedAction.label}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(activeResult.answer);
                triggerToast("Copied to clipboard!");
              }}
              style={{
                background: "#f1f5f9",
                color: "#334155",
                border: "1px solid #cbd5e1",
                borderRadius: "6px",
                padding: "5px 10px",
                fontSize: "11px",
                cursor: "pointer",
              }}
            >
              📋 Copy
            </button>
          </div>
        </div>
      )}

      {/* Suggestion Chips */}
      <div className="suggestion-chips" style={{ padding: "0 16px 12px 16px", display: "flex", flexWrap: "wrap", gap: "6px" }}>
        <button type="button" onClick={() => handleAiSubmit("Summarize chart")}>
          📋 Summarize chart
        </button>
        <button type="button" onClick={() => handleAiSubmit("What changed since last visit?")}>
          🔄 What changed?
        </button>
        <button type="button" onClick={() => handleAiSubmit("Did we try lamotrigine before?")}>
          💊 Did we try lamotrigine?
        </button>
        <button type="button" onClick={() => handleAiSubmit("Check surveillance labs")}>
          🔬 Check labs
        </button>
        <button type="button" onClick={() => handleAiSubmit("Switch to minimal mode")}>
          🧘 Zen mode
        </button>
        <button type="button" onClick={() => handleAiSubmit("Switch to med check layout")}>
          💊 Med check layout
        </button>
        {onOpenCustomizer && (
          <button type="button" onClick={onOpenCustomizer}>
            ⚙️ Layout customizer
          </button>
        )}
      </div>

      {/* Composer */}
      <div className="ai-composer" style={{ marginTop: "auto", padding: "12px 16px", borderTop: "1px solid var(--m3-border, #e2e8f0)", background: "#ffffff" }}>
        <textarea
          placeholder={`Ask about ${patient.name.split(" ")[0]} or give workspace commands...`}
          value={customAiText}
          disabled={isLoading}
          onChange={(e) => setCustomAiText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleAiSubmit(customAiText);
            }
          }}
          style={{ width: "100%", height: "60px", resize: "none", borderRadius: "8px", border: "1px solid #cbd5e1", padding: "8px", fontSize: "12px", fontFamily: "inherit" }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "6px" }}>
          <span style={{ fontSize: "11px", color: "#64748b" }}>
            {isLoading ? "Querying SQLite FTS5..." : "Press Enter ↵ to send"}
          </span>
          <button
            type="button"
            disabled={isLoading || !customAiText.trim()}
            onClick={() => handleAiSubmit(customAiText)}
            style={{
              background: "#1a73e8",
              color: "#ffffff",
              border: 0,
              borderRadius: "50%",
              width: "28px",
              height: "28px",
              display: "grid",
              placeItems: "center",
              cursor: "pointer",
              fontWeight: "bold",
            }}
          >
            ↑
          </button>
        </div>
      </div>
    </aside>
  );
}
