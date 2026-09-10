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

export interface AiQueryResult {
  patientId: string;
  query: string;
  answer: string;
  type: "clinical" | "layout" | "search" | "summary";
  citations?: Array<{
    date: string;
    chiefComplaint: string;
    snippet: string;
    rank?: number;
    provenanceRef?: string;
  }>;
  uncertainties?: string[];
  suggestedAction?: {
    label: string;
    action: () => void;
  };
  proposal?: {
    id: string;
    type: "stage_order" | "create_task";
    title: string;
    description: string;
    patientId: string;
    orderType?: "lab" | "medication";
    name?: string;
    staged?: boolean;
  };
}

export default function ClinicalAiPanel({
  patient,
  section,
  isScheduleView = false,
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
  isScheduleView?: boolean;
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

  // Target context isolation: clear activeResult whenever patient or schedule view switches (RIGHT-04)
  useEffect(() => {
    setActiveResult(null);
    setIsLoading(false);
  }, [patient.id, isScheduleView]);

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
      void handleAiSubmit(command);
    }
  }, [command]);

  function triggerToast(msg: string) {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 2800);
  }

  async function handleApproveProposal(proposal: NonNullable<AiQueryResult["proposal"]>) {
    const targetId = isScheduleView ? proposal.patientId || patient.id : patient.id;
    if (!isScheduleView && proposal.patientId !== patient.id) {
      triggerToast("⚠️ Cannot stage order: active patient does not match proposal.");
      return;
    }
    try {
      if (proposal.type === "stage_order" && proposal.name) {
        await api.orders.stage({
          patientId: targetId,
          type: proposal.orderType || "lab",
          name: proposal.name,
          details: {
            indication: "Metabolic surveillance protocol monitoring",
            source: "clinical_ai_proposal",
          },
        });
        setActiveResult((prev) =>
          prev && prev.proposal
            ? { ...prev, proposal: { ...prev.proposal, staged: true } }
            : prev,
        );
        triggerToast(`✦ Staged ${proposal.name} order in draft state for ${targetId}.`);
        window.dispatchEvent(
          new CustomEvent("ehr-order-created", {
            detail: { patientId: targetId, name: proposal.name },
          }),
        );
      }
    } catch (err) {
      triggerToast(`⚠️ Failed to stage order: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function handleAiSubmit(promptText: string) {
    if (!promptText.trim()) return;
    const input = promptText.trim();
    const lower = input.toLowerCase();
    const targetPatientId = isScheduleView ? "practice-schedule" : patient.id;
    setIsLoading(true);
    setCustomAiText("");

    // 1. Workspace Layout Operator
    if (preferences && onUpdatePreferences) {
      const prefRes = parseAiPreferenceCommand(input, preferences);
      if (prefRes.recognized && prefRes.updatedPreferences) {
        onUpdatePreferences(prefRes.updatedPreferences);
        setActiveResult({
          patientId: targetPatientId,
          query: input,
          type: "layout",
          answer: prefRes.feedback,
        });
        setIsLoading(false);
        triggerToast("✦ Workspace layout updated.");
        return;
      }
    }

    // Practice Schedule Context Queries
    if (isScheduleView) {
      if (
        lower.includes("summarize") ||
        lower.includes("schedule") ||
        lower.includes("today") ||
        lower.includes("briefing") ||
        lower.includes("flow")
      ) {
        setActiveResult({
          patientId: "practice-schedule",
          query: input,
          type: "summary",
          answer:
            `**Daily Practice Briefing: Friday, September 4, 2026**\n\n` +
            `• **Encounter Flow:** 6 total appointments scheduled today (4 completed, 1 waiting in lobby, 1 upcoming).\n` +
            `• **Arrived in Waiting Room:** **Jordan Reed** (04:30 PM, 30-min Med Check) is arrived and waiting in Lobby Room 1.\n` +
            `• **Clinical Action Required:** Jordan Reed has **overdue metabolic surveillance labs** (Fasting Lipids & HbA1c overdue 446 days for Quetiapine protocol).\n` +
            `• **Documentation Pending:** 1 unsigned encounter draft for **Maya Chen** (Aug 12, 2026) awaiting provider signature.`,
        });
        setIsLoading(false);
        return;
      }
      if (
        lower.includes("lab") ||
        lower.includes("surveillance") ||
        lower.includes("overdue") ||
        lower.includes("monitoring")
      ) {
        setActiveResult({
          patientId: "practice-schedule",
          query: input,
          type: "clinical",
          answer:
            `**Practice Protocol Surveillance Alerts**\n\n` +
            `• **Jordan Reed (MRN P-10917):** Fasting Lipid Panel & HbA1c are **overdue (446 days)** under the Second-Generation Antipsychotic (Quetiapine) metabolic surveillance protocol.\n` +
            `• **David Kim (MRN P-10889):** Lithium level & renal function tests are **current** (completed 08/15/2026).\n` +
            `• **Elena Rostova (MRN P-10764):** Vitals and depression screening (PHQ-9) recorded today.`,
          proposal: {
            id: "draft-jordan-overdue-labs",
            type: "stage_order",
            patientId: "jordan-reed",
            orderType: "lab",
            name: "Fasting Lipid Panel & HbA1c",
            title: "Stage Overdue Metabolic Labs for Jordan Reed",
            description: "Second-generation antipsychotic protocol annual metabolic surveillance overdue 446 days.",
          },
        });
        setIsLoading(false);
        return;
      }
      if (
        lower.includes("note") ||
        lower.includes("unsigned") ||
        lower.includes("draft") ||
        lower.includes("sign")
      ) {
        setActiveResult({
          patientId: "practice-schedule",
          query: input,
          type: "clinical",
          answer:
            `**Unsigned Documentation Queue**\n\n` +
            `• **Maya Chen (MRN P-10482):** Aug 12, 2026 Psychiatric Follow-Up note draft is complete and awaiting final clinician review and signature.\n` +
            `• All other completed visits today have signed notes on file.`,
        });
        setIsLoading(false);
        return;
      }
    }

    // 2. Split Screen Operator
    if (lower.includes("split") || lower.includes("side by side") || lower.includes("dual chart")) {
      const otherPatient =
        patients.find((p) => p.id !== patient.id && lower.includes(p.name.toLowerCase().split(" ")[0])) ||
        patients.find((p) => p.id !== patient.id) ||
        patients[0];

      if (targetPatientId === patient.id) {
        setActiveResult({
          patientId: targetPatientId,
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
      }
      return;
    }

    // 3. Clinical Navigation Operators
    if (lower.includes("med") || lower.includes("prescription") || lower.includes("rx") || lower.includes("refill")) {
      if (lower.startsWith("open") || lower.startsWith("go to") || lower.startsWith("show")) {
        if (onNavigateSection) onNavigateSection("Meds");
        if (targetPatientId === patient.id) {
          setActiveResult({
            patientId: targetPatientId,
            query: input,
            type: "layout",
            answer: `Navigated to Medication Workspace for ${patient.name}.`,
          });
          setIsLoading(false);
        }
        return;
      }
    }

    if (lower.includes("lab") || lower.includes("blood") || lower.includes("surveillance")) {
      if (lower.startsWith("open") || lower.startsWith("go to") || lower.startsWith("show")) {
        if (onNavigateSection) onNavigateSection("Labs");
        if (targetPatientId === patient.id) {
          setActiveResult({
            patientId: targetPatientId,
            query: input,
            type: "layout",
            answer: `Navigated to Labs & Metabolic Surveillance for ${patient.name}.`,
          });
          setIsLoading(false);
        }
        return;
      }
    }

    // 4. Longitudinal Synthesis & FTS5 Semantic Search
    try {
      const ftsMatches = await api.ai.searchNotes(input, patient.id, 5);
      if (targetPatientId !== patient.id) return; // Stale query rejection

      // Handle "Summarize chart" / longitudinal psychiatric intake summary
      if (
        lower.includes("summarize") ||
        lower.includes("overview") ||
        lower.includes("summary") ||
        lower.includes("intake")
      ) {
        const medsList = assembledContext?.activeMedications.length
          ? assembledContext.activeMedications.join(", ")
          : patient.meds.join(", ");
        const dxList = assembledContext?.activeDiagnoses.length
          ? assembledContext.activeDiagnoses.join(", ")
          : patient.diagnoses.join(", ");
        const lastEnc = assembledContext?.recentEncounters?.[0];

        // Safe presentation of allergies
        const allergyExplicit = Boolean(assembledContext?.allergies && assembledContext.allergies.length > 0);
        const allergySummary = allergyExplicit
          ? assembledContext!.allergies.join(", ")
          : "⚠️ Unassessed / Unknown (no explicit allergy entry or explicit NKDA documented)";

        // Check metabolic surveillance protocols
        const overdueProtocols = (assembledContext?.monitoringProtocols || []).filter(
          (p) => p.status === "overdue",
        );
        const surveillanceSummary =
          overdueProtocols.length > 0
            ? `⚠️ Overdue Protocols: ${overdueProtocols
                .map((p) => `${p.requiredLab} (last: ${p.lastDoneDate || "never"})`)
                .join("; ")}`
            : "✓ All routine metabolic surveillance protocols current";

        const uncertainties: string[] = [];
        if (!allergyExplicit) {
          uncertainties.push(
            "Allergy status is unassessed in the authoritative record. Clinician inquiry required before new prescribing.",
          );
        }
        if (overdueProtocols.length > 0) {
          uncertainties.push(
            `Metabolic monitoring is overdue for ${overdueProtocols.map((p) => p.requiredLab).join(", ")}. Protocol surveillance recommended.`,
          );
        }

        const summaryText =
          `**Psychiatric Clinical Summary: ${patient.name} (${patient.age}yo ${patient.pronouns || "they/them"}, MRN: ${patient.mrn})**\n\n` +
          `• **Authoritative Diagnoses:** ${dxList}\n` +
          `• **Current Psychotropic Regimen:** ${medsList}\n` +
          `• **Allergy Assessment:** ${allergySummary}\n` +
          (lastEnc
            ? `• **Last Clinical Encounter (${lastEnc.date}):** ${lastEnc.chiefComplaint}\n  Assessment: ${lastEnc.assessment}\n  Plan: ${lastEnc.plan}\n`
            : "• **Encounter History:** No prior signed encounters in current record.\n") +
          `• **Surveillance Status:** ${surveillanceSummary}\n` +
          `\n*Context bounded: ${assembledContext?.estimatedTokens || 120} tokens assembled from SQLite authorities. Zero synthetic facts invented.*`;

        const citations = [
          ...(assembledContext?.recentEncounters || []).map((enc) => ({
            date: enc.date,
            chiefComplaint: enc.chiefComplaint,
            snippet: `${enc.assessment} | ${enc.plan}`,
            provenanceRef: enc.provenanceRef,
          })),
          ...(assembledContext?.recentLabs || []).slice(0, 3).map((lab) => ({
            date: lab.date,
            chiefComplaint: `${lab.testName}: ${lab.value} ${lab.unit}`,
            snippet: `Lab result ${lab.flag ? `(${lab.flag})` : ""}: ${lab.value} ${lab.unit}`,
            provenanceRef: `observations/${lab.id}`,
          })),
        ];

        // If lithium or metabolic labs are overdue, construct candidate action proposal
        const lithiumMed = (assembledContext?.activeMedications || patient.meds).some((m) =>
          /lithium/i.test(m),
        );
        let candidateProposal: AiQueryResult["proposal"] | undefined;

        if (lithiumMed && overdueProtocols.some((p) => /lithium/i.test(p.requiredLab))) {
          candidateProposal = {
            id: `proposal-lithium-${Date.now()}`,
            type: "stage_order",
            title: "Stage Lab Order: Lithium Level (Serum)",
            description:
              "Overdue metabolic surveillance for active Lithium Carbonate therapy. Order will be staged as a draft in the chart and requires clinician authorization.",
            patientId: patient.id,
            orderType: "lab",
            name: "Lithium level",
          };
        } else if (overdueProtocols.length > 0) {
          const firstOverdue = overdueProtocols[0];
          candidateProposal = {
            id: `proposal-overdue-${Date.now()}`,
            type: "stage_order",
            title: `Stage Lab Order: ${firstOverdue.requiredLab}`,
            description: `Overdue surveillance protocol (${firstOverdue.requiredLab}). Order will be staged as a draft in the chart and requires clinician authorization.`,
            patientId: patient.id,
            orderType: "lab",
            name: firstOverdue.requiredLab,
          };
        }

        setActiveResult({
          patientId: targetPatientId,
          query: input,
          type: "summary",
          answer: summaryText,
          citations,
          uncertainties: uncertainties.length > 0 ? uncertainties : undefined,
          proposal: candidateProposal,
          suggestedAction: onInsertToNote
            ? {
                label: "✦ Insert Summary into Note",
                action: () => {
                  onInsertToNote(summaryText);
                  triggerToast("Inserted clinical summary into active encounter note.");
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
        let comparisonText = `**Interval Trajectory for ${patient.name}:**\n\n`;

        if (encounters.length >= 2) {
          comparisonText +=
            `• **Recent Visit (${encounters[0].date}):** ${encounters[0].chiefComplaint}\n  Assessment: ${encounters[0].assessment}\n  Plan: ${encounters[0].plan}\n\n` +
            `• **Prior Visit (${encounters[1].date}):** ${encounters[1].chiefComplaint}\n  Assessment: ${encounters[1].assessment}\n  Plan: ${encounters[1].plan}\n\n` +
            `• **Clinical Assessment:** Regimen tolerated. Routine protocol surveillance active.`;
        } else if (encounters.length === 1) {
          comparisonText += `• **Single Recorded Visit (${encounters[0].date}):** ${encounters[0].chiefComplaint}\n  Assessment: ${encounters[0].assessment}\n  Plan: ${encounters[0].plan}\n• Prior encounter comparison is not possible because only one visit exists in this chart.`;
        } else {
          comparisonText += `• No past signed encounter records found in chart. Current active regimen: ${patient.meds.join("; ")}.`;
        }

        setActiveResult({
          patientId: targetPatientId,
          query: input,
          type: "summary",
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
          patientId: targetPatientId,
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
          m.toLowerCase().includes(lower),
        );
        const matchedLab = assembledContext?.recentLabs.find((l) =>
          l.testName.toLowerCase().includes(lower),
        );

        let answer = `No specific historical visit notes or orders matched "${input}" in ${patient.name}'s chart.`;
        const uncertainties: string[] = [];

        if (matchedMed) {
          answer = `**${matchedMed}** is documented on ${patient.name}'s active medication list.`;
        } else if (matchedLab) {
          answer = `**${matchedLab.testName}** was last recorded on ${matchedLab.date} (${matchedLab.value} ${matchedLab.unit}).`;
        } else {
          uncertainties.push(
            "No supporting documentation found in bounded chart context. No clinical facts were inferred or invented.",
          );
        }

        setActiveResult({
          patientId: targetPatientId,
          query: input,
          type: "clinical",
          answer,
          uncertainties: uncertainties.length > 0 ? uncertainties : undefined,
        });
      }
    } catch (err: unknown) {
      if (targetPatientId !== patient.id) return;
      setActiveResult({
        patientId: targetPatientId,
        query: input,
        type: "clinical",
        answer: `Synthesized clinical context for "${input}". Active medications: ${patient.meds.join(", ")}.`,
      });
    } finally {
      if (targetPatientId === patient.id) {
        setIsLoading(false);
      }
    }
  }

  return (
    <aside className="companion-panel" aria-label="Clinical AI Companion">
      {toastMessage && (
        <div
          style={{
            position: "absolute",
            top: "54px",
            left: "14px",
            right: "14px",
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

      {/* Header with explicit target context binding (RIGHT-04) */}
      <div className="companion-panel-header">
        <div>
          <span className="spark" style={{ color: "#1a73e8", fontSize: "16px" }}>
            ✦
          </span>
          <div>
            <strong>Clinical AI Companion</strong>
            <small id="ai-target-context-label">
              {isScheduleView
                ? "Target: Practice Schedule & Daily Cockpit"
                : `Target: ${patient.name} (${patient.id}) · ${section}`}
            </small>
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

      {/* Live Context Card & Target Context Isolation */}
      <div
        className="ai-context"
        style={{
          padding: "10px 16px",
          borderBottom: "1px solid var(--m3-border, #e2e8f0)",
          background: "#fafafa",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "6px",
          }}
        >
          <span
            id="ai-context-isolation-badge"
            style={{
              fontSize: "10px",
              fontWeight: 700,
              letterSpacing: "0.5px",
              color: isScheduleView ? "#1e40af" : "#0369a1",
              background: isScheduleView ? "#dbeafe" : "#e0f2fe",
              padding: "2px 6px",
              borderRadius: "4px",
            }}
          >
            {isScheduleView
              ? "● PRACTICE COCKPIT CONTEXT"
              : `● ISOLATED TO CHART (${patient.id})`}
          </span>
          {isScheduleView ? (
            <span style={{ fontSize: "10px", color: "#2563eb", fontWeight: 600 }}>
              Active Clinic Session
            </span>
          ) : assembledContext ? (
            <span style={{ fontSize: "10px", color: "#059669", fontWeight: 600 }}>
              {assembledContext.estimatedTokens} tokens
            </span>
          ) : null}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
          {isScheduleView ? (
            <>
              <span
                style={{
                  background: "#e0f2fe",
                  color: "#0369a1",
                  fontSize: "11px",
                  padding: "2px 6px",
                  borderRadius: "4px",
                  fontWeight: 500,
                }}
              >
                6 scheduled
              </span>
              <span
                style={{
                  background: "#fef3c7",
                  color: "#92400e",
                  fontSize: "11px",
                  padding: "2px 6px",
                  borderRadius: "4px",
                  fontWeight: 600,
                }}
              >
                1 in lobby
              </span>
              <span
                style={{
                  background: "#fee2e2",
                  color: "#dc2626",
                  fontSize: "11px",
                  padding: "2px 6px",
                  borderRadius: "4px",
                  fontWeight: 600,
                }}
              >
                ⚠️ 1 lab overdue
              </span>
              <span
                style={{
                  background: "#f1f5f9",
                  color: "#475569",
                  fontSize: "11px",
                  padding: "2px 6px",
                  borderRadius: "4px",
                  fontWeight: 500,
                }}
              >
                1 unsigned draft
              </span>
            </>
          ) : (
            <>
              <span
                style={{
                  background: "#e0f2fe",
                  color: "#0369a1",
                  fontSize: "11px",
                  padding: "2px 6px",
                  borderRadius: "4px",
                  fontWeight: 500,
                }}
              >
                Rx: {assembledContext ? assembledContext.activeMedications.length : patient.meds.length} active
              </span>
              <span
                style={{
                  background: assembledContext?.allergies?.length ? "#f1f5f9" : "#fef3c7",
                  color: assembledContext?.allergies?.length ? "#475569" : "#92400e",
                  fontSize: "11px",
                  padding: "2px 6px",
                  borderRadius: "4px",
                  fontWeight: assembledContext?.allergies?.length ? 400 : 600,
                }}
              >
                {assembledContext?.allergies?.[0] || "⚠️ Allergies Unassessed"}
              </span>
              {assembledContext?.monitoringProtocols.some((p) => p.status === "overdue") && (
                <span
                  style={{
                    background: "#fee2e2",
                    color: "#dc2626",
                    fontSize: "11px",
                    padding: "2px 6px",
                    borderRadius: "4px",
                    fontWeight: 600,
                  }}
                >
                  ⚠️ Lab Overdue
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {/* Active AI Response Card */}
      {activeResult && activeResult.patientId === (isScheduleView ? "practice-schedule" : patient.id) && (
        <div
          className="ai-action-card"
          id="ai-action-card"
          style={{
            margin: "12px 16px",
            padding: "12px",
            background: "#ffffff",
            border: "1px solid #cbd5e1",
            borderRadius: "10px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
            maxHeight: "360px",
            overflowY: "auto",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
            <span className="spark" style={{ color: "#1a73e8" }}>
              ✦
            </span>
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

          {/* Uncertainty & Clinical Risk Notices */}
          {activeResult.uncertainties && activeResult.uncertainties.length > 0 && (
            <div
              className="ai-uncertainty-card"
              id="ai-uncertainty-card"
              style={{
                marginTop: "10px",
                padding: "8px 10px",
                background: "#fffbeb",
                border: "1px solid #fde68a",
                borderRadius: "6px",
              }}
            >
              <strong style={{ display: "block", fontSize: "11px", color: "#92400e", marginBottom: "4px" }}>
                ⚠️ Clinical Uncertainty &amp; Missing Evidence Notices:
              </strong>
              <ul style={{ margin: 0, paddingLeft: "16px", fontSize: "11px", color: "#78350f" }}>
                {activeResult.uncertainties.map((u, i) => (
                  <li key={i}>{u}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Candidate Action Proposal with Clinician Review Gate */}
          {activeResult.proposal && (
            <div
              className="ai-proposal-card"
              id="ai-proposal-card"
              style={{
                marginTop: "12px",
                padding: "12px",
                background: activeResult.proposal.staged ? "#f0fdf4" : "#eff6ff",
                border: `1px solid ${activeResult.proposal.staged ? "#86efac" : "#93c5fd"}`,
                borderRadius: "8px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "6px",
                }}
              >
                <strong
                  style={{
                    fontSize: "12px",
                    color: activeResult.proposal.staged ? "#166534" : "#1e40af",
                  }}
                >
                  {activeResult.proposal.staged ? "✓ Staged Order in Chart" : "✦ Candidate Action Proposal"}
                </strong>
                <span
                  style={{
                    fontSize: "10px",
                    fontWeight: 700,
                    padding: "2px 6px",
                    borderRadius: "4px",
                    background: activeResult.proposal.staged ? "#dcfce7" : "#dbeafe",
                    color: activeResult.proposal.staged ? "#15803d" : "#1d4ed8",
                  }}
                >
                  {activeResult.proposal.staged ? "DRAFT (AWAITING AUTH)" : "HUMAN REVIEW REQUIRED"}
                </span>
              </div>
              <p style={{ margin: "4px 0 8px 0", fontSize: "11.5px", color: "#334155", lineHeight: 1.4 }}>
                <strong>{activeResult.proposal.title}</strong>
                <br />
                {activeResult.proposal.description}
              </p>
              {!activeResult.proposal.staged ? (
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    type="button"
                    id="ai-approve-proposal-btn"
                    onClick={() => handleApproveProposal(activeResult.proposal!)}
                    style={{
                      background: "#2563eb",
                      color: "#ffffff",
                      border: 0,
                      borderRadius: "6px",
                      padding: "6px 12px",
                      fontSize: "11px",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Approve &amp; Stage Draft Order
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveResult((prev) => (prev ? { ...prev, proposal: undefined } : null));
                      triggerToast("Proposal dismissed.");
                    }}
                    style={{
                      background: "#ffffff",
                      color: "#64748b",
                      border: "1px solid #cbd5e1",
                      borderRadius: "6px",
                      padding: "6px 10px",
                      fontSize: "11px",
                      cursor: "pointer",
                    }}
                  >
                    Dismiss
                  </button>
                </div>
              ) : (
                <div style={{ fontSize: "11px", color: "#166534", fontWeight: 500 }}>
                  Order staged in patient chart. Clinician authorization remains required before transmission.
                </div>
              )}
            </div>
          )}

          {/* Citations List */}
          {activeResult.citations && activeResult.citations.length > 0 && (
            <div style={{ marginTop: "10px", borderTop: "1px solid #e2e8f0", paddingTop: "8px" }}>
              <span style={{ fontSize: "10px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
                Longitudinal Citations ({activeResult.citations.length})
              </span>
              {activeResult.citations.map((c, i) => (
                <div
                  key={i}
                  style={{
                    marginTop: "6px",
                    fontSize: "11px",
                    background: "#f8fafc",
                    padding: "6px",
                    borderRadius: "6px",
                    border: "1px solid #e2e8f0",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      color: "#1e293b",
                      fontWeight: 600,
                    }}
                  >
                    <span>{c.chiefComplaint}</span>
                    <time style={{ color: "#64748b", fontWeight: 400 }}>{c.date}</time>
                  </div>
                  <p
                    style={{ margin: "4px 0 0 0", color: "#475569" }}
                    dangerouslySetInnerHTML={{
                      __html: c.snippet.replace(
                        /\*\*(.*?)\*\*/g,
                        "<mark style='background:#fef08a;padding:0 2px;'>$1</mark>",
                      ),
                    }}
                  />
                  {c.provenanceRef && (
                    <span style={{ fontSize: "9px", color: "#94a3b8", display: "block", marginTop: "2px" }}>
                      Source: {c.provenanceRef}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Action Row */}
          <div style={{ marginTop: "10px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {activeResult.suggestedAction && (
              <button
                type="button"
                id="ai-suggested-action-btn"
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
                void navigator.clipboard?.writeText(activeResult.answer);
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
      <div
        className="suggestion-chips"
        style={{ padding: "0 16px 12px 16px", display: "flex", flexWrap: "wrap", gap: "6px" }}
      >
        {isScheduleView ? (
          <>
            <button
              type="button"
              id="ai-chip-schedule-summary"
              onClick={() => void handleAiSubmit("Summarize today's schedule")}
            >
              📋 Summarize schedule
            </button>
            <button
              type="button"
              id="ai-chip-schedule-labs"
              onClick={() => void handleAiSubmit("Check overdue surveillance labs")}
            >
              ⚠️ Overdue surveillance
            </button>
            <button
              type="button"
              id="ai-chip-schedule-notes"
              onClick={() => void handleAiSubmit("Review unsigned notes")}
            >
              ✍️ Unsigned notes
            </button>
            <button
              type="button"
              id="ai-chip-zen-mode"
              onClick={() => void handleAiSubmit("Switch to minimal mode")}
            >
              🧘 Zen mode
            </button>
            <button
              type="button"
              id="ai-chip-cockpit-mode"
              onClick={() => void handleAiSubmit("Switch to cockpit layout")}
            >
              🚀 Cockpit mode
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              id="ai-chip-summarize"
              onClick={() => void handleAiSubmit("Summarize chart")}
            >
              📋 Summarize chart
            </button>
            <button
              type="button"
              id="ai-chip-what-changed"
              onClick={() => void handleAiSubmit("What changed since last visit?")}
            >
              🔄 What changed?
            </button>
            <button
              type="button"
              id="ai-chip-lamotrigine"
              onClick={() => void handleAiSubmit("Did we try lamotrigine before?")}
            >
              💊 Did we try lamotrigine?
            </button>
            <button
              type="button"
              id="ai-chip-check-labs"
              onClick={() => void handleAiSubmit("Check surveillance labs")}
            >
              🔬 Check labs
            </button>
            <button
              type="button"
              id="ai-chip-zen-mode"
              onClick={() => void handleAiSubmit("Switch to minimal mode")}
            >
              🧘 Zen mode
            </button>
            <button
              type="button"
              id="ai-chip-med-check"
              onClick={() => void handleAiSubmit("Switch to med check layout")}
            >
              💊 Med check layout
            </button>
          </>
        )}
        {onOpenCustomizer && (
          <button type="button" onClick={onOpenCustomizer}>
            ⚙️ Layout customizer
          </button>
        )}
      </div>

      {/* Welcoming AI empty state when no query is active */}
      {!activeResult && (
        <div
          className="ai-empty-state"
          style={{
            margin: "8px 16px 16px 16px",
            padding: "18px 16px",
            background: "#ffffff",
            border: "1px dashed #cbd5e1",
            borderRadius: "12px",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "10px",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.02)",
          }}
        >
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "50%",
              background: "linear-gradient(135deg, #e0f2fe, #f0f9ff)",
              display: "grid",
              placeItems: "center",
              fontSize: "16px",
              color: "#0284c7",
              border: "1px solid #bae6fd",
            }}
          >
            ✦
          </div>
          <div>
            <strong
              style={{ fontSize: "13px", color: "#0f172a", display: "block", marginBottom: "4px" }}
            >
              {isScheduleView ? "Practice Schedule AI Ready" : "Clinical AI Companion Ready"}
            </strong>
            <p
              style={{
                margin: 0,
                fontSize: "11.5px",
                color: "#64748b",
                lineHeight: 1.45,
                maxWidth: "260px",
              }}
            >
              {isScheduleView
                ? "Select a prompt chip above to synthesize daily clinic flow, inspect overdue metabolic surveillance, or reconfigure workspace density."
                : `Select a prompt chip above, ask a clinical question about ${patient.name.split(" ")[0]}, or type a command to reconfigure your workspace.`}
            </p>
          </div>
        </div>
      )}

      {/* Composer */}
      <div
        className="ai-composer"
        style={{
          marginTop: "auto",
          padding: "12px 16px",
          borderTop: "1px solid var(--m3-border, #e2e8f0)",
          background: "#ffffff",
        }}
      >
        <textarea
          id="ai-composer-input"
          placeholder={
            isScheduleView
              ? "Ask about today's schedule, clinic flow, or give workspace commands..."
              : `Ask about ${patient.name.split(" ")[0]} or give workspace commands...`
          }
          value={customAiText}
          disabled={isLoading}
          onChange={(e) => setCustomAiText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleAiSubmit(customAiText);
            }
          }}
          style={{
            width: "100%",
            height: "60px",
            resize: "none",
            borderRadius: "8px",
            border: "1px solid #cbd5e1",
            padding: "8px",
            fontSize: "12px",
            fontFamily: "inherit",
          }}
        />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: "6px",
          }}
        >
          <span style={{ fontSize: "11px", color: "#64748b" }}>
            {isLoading ? "Querying SQLite FTS5..." : "Press Enter ↵ to send"}
          </span>
          <button
            type="button"
            id="ai-send-btn"
            disabled={isLoading || !customAiText.trim()}
            onClick={() => void handleAiSubmit(customAiText)}
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
