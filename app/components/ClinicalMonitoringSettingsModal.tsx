"use client";

import { useEffect, useMemo, useState } from "react";
import {
  clinicalMonitoringPolicyApi,
  type ClinicalMonitoringPolicyState,
  type MonitoringPolicyScope,
} from "../lib/clinical-monitoring-policy-api";
import {
  formatMonitoringInterval,
  monitoringPolicySourceLabel,
  type MedicationProtocol,
  type MonitoringPolicyOverride,
} from "../lib/clinical-protocols";
import Icon from "./ui/Icon";
import styles from "./ClinicalMonitoringSettingsModal.module.css";

type RuleDraft = {
  intervalDays: number;
  dueSoonDays: number;
  overdueGraceDays: number;
  enabled: boolean;
  reason: string;
};

function overrideMap(items: readonly MonitoringPolicyOverride[]) {
  return new Map(items.map((item) => [item.ruleId, item]));
}

function scopeLabel(scope: MonitoringPolicyScope, patientName?: string) {
  if (scope === "practice") return "Practice defaults";
  if (scope === "provider") return "My overrides";
  return patientName ? `${patientName} exception` : "Patient exception";
}

export default function ClinicalMonitoringSettingsModal({
  isOpen,
  onClose,
  patientId,
  patientName,
  onSaved,
}: {
  isOpen: boolean;
  onClose: () => void;
  patientId?: string;
  patientName?: string;
  onSaved?: (message: string) => void;
}) {
  const [state, setState] = useState<ClinicalMonitoringPolicyState | null>(null);
  const [scope, setScope] = useState<MonitoringPolicyScope>("provider");
  const [drafts, setDrafts] = useState<Record<string, RuleDraft>>({});
  const [loading, setLoading] = useState(true);
  const [savingRule, setSavingRule] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    clinicalMonitoringPolicyApi
      .get(patientId)
      .then((next) => {
        if (cancelled) return;
        setState(next);
        setLoading(false);
      })
      .catch((cause) => {
        if (cancelled) return;
        setError(
          cause instanceof Error
            ? cause.message
            : "Clinical monitoring settings could not be loaded.",
        );
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, patientId]);

  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const scopes = useMemo(() => {
    const result: MonitoringPolicyScope[] = ["practice"];
    if (state?.canEditProvider) result.push("provider");
    if (patientId && state?.canEditPatient) result.push("patient");
    return result;
  }, [state, patientId]);

  useEffect(() => {
    if (!scopes.includes(scope)) setScope(scopes[0] ?? "practice");
  }, [scope, scopes]);

  const currentRules = useMemo<MedicationProtocol[]>(() => {
    if (!state) return [];
    if (scope === "practice") return state.practiceRules;
    if (scope === "provider") return state.providerRules;
    return state.effectiveRules;
  }, [state, scope]);

  const inheritedRules = useMemo<MedicationProtocol[]>(() => {
    if (!state) return [];
    if (scope === "practice") return state.systemRules;
    if (scope === "provider") return state.practiceRules;
    return state.providerRules;
  }, [state, scope]);

  const currentOverrides = useMemo(() => {
    if (!state) return new Map<string, MonitoringPolicyOverride>();
    if (scope === "practice") return overrideMap(state.practiceOverrides);
    if (scope === "provider") return overrideMap(state.providerOverrides);
    return overrideMap(state.patientOverrides);
  }, [state, scope]);

  useEffect(() => {
    const next: Record<string, RuleDraft> = {};
    for (const rule of currentRules) {
      const stored = currentOverrides.get(rule.id);
      next[rule.id] = {
        intervalDays: rule.intervalDays,
        dueSoonDays: rule.dueSoonDays,
        overdueGraceDays: rule.overdueGraceDays,
        enabled: rule.enabled,
        reason: stored?.reason ?? "",
      };
    }
    setDrafts(next);
  }, [currentRules, currentOverrides]);

  if (!isOpen) return null;

  const canEdit =
    scope === "practice"
      ? Boolean(state?.canEditPractice)
      : scope === "provider"
        ? Boolean(state?.canEditProvider)
        : Boolean(state?.canEditPatient);

  async function save(rule: MedicationProtocol) {
    const draft = drafts[rule.id];
    if (!draft) return;
    setSavingRule(rule.id);
    setError("");
    try {
      const next = await clinicalMonitoringPolicyApi.save({
        scope,
        patientId: scope === "patient" ? patientId : undefined,
        ruleId: rule.id,
        intervalDays: Number(draft.intervalDays),
        dueSoonDays: Number(draft.dueSoonDays),
        overdueGraceDays: Number(draft.overdueGraceDays),
        enabled: draft.enabled,
        reason: scope === "patient" ? draft.reason : undefined,
      });
      setState(next);
      onSaved?.(`${rule.canonicalMedication} monitoring updated.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save monitoring policy.");
    } finally {
      setSavingRule(null);
    }
  }

  async function reset(rule: MedicationProtocol) {
    setSavingRule(rule.id);
    setError("");
    try {
      const next = await clinicalMonitoringPolicyApi.reset({
        scope,
        patientId: scope === "patient" ? patientId : undefined,
        ruleId: rule.id,
      });
      setState(next);
      onSaved?.(`${rule.canonicalMedication} now inherits the next policy layer.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not reset monitoring policy.");
    } finally {
      setSavingRule(null);
    }
  }

  return (
    <div
      className={styles.backdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="clinical-monitoring-title"
      >
        <header className={styles.header}>
          <div>
            <span className={styles.eyebrow}>Clinical protocols</span>
            <h2 id="clinical-monitoring-title">Medication monitoring</h2>
            <p>Choose when lab and vital-sign surveillance becomes due, due soon, or overdue.</p>
          </div>
          <button
            type="button"
            className={styles.close}
            aria-label="Close clinical monitoring"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </header>

        <div className={styles.explainer}>
          <Icon name="account_tree" />
          <div>
            <strong>System starter → Practice default → Your override → Patient exception</strong>
            <span>
              The most specific saved rule wins. Patient exceptions require a documented reason.
              These intervals drive attention prompts only; they never order tests or change treatment automatically.
            </span>
          </div>
        </div>

        {loading ? (
          <div className={styles.state}>Loading monitoring policies…</div>
        ) : !state ? (
          <div className={styles.state}>Monitoring policies are unavailable.</div>
        ) : (
          <>
            <div className={styles.tabs} role="tablist" aria-label="Monitoring policy scope">
              {scopes.map((item) => (
                <button
                  key={item}
                  type="button"
                  role="tab"
                  aria-selected={scope === item}
                  className={scope === item ? styles.activeTab : ""}
                  onClick={() => setScope(item)}
                >
                  {scopeLabel(item, patientName)}
                </button>
              ))}
            </div>

            <div className={styles.scopeNote}>
              {scope === "practice" ? (
                state.canEditPractice
                  ? "Practice defaults apply to every provider unless they save a personal override."
                  : "Practice defaults are read-only for you. Owners and managers can change them."
              ) : scope === "provider" ? (
                "These overrides affect only your own Clinical Bond attention timing."
              ) : (
                `This exception affects only ${patientName || "this patient"} and is audited with your reason.`
              )}
            </div>

            {error && <div className={styles.error} role="alert">{error}</div>}

            <div className={styles.rules}>
              {currentRules.map((rule) => {
                const inherited = inheritedRules.find((candidate) => candidate.id === rule.id);
                const override = currentOverrides.get(rule.id);
                const draft = drafts[rule.id];
                if (!draft) return null;
                return (
                  <article className={styles.rule} key={rule.id}>
                    <div className={styles.ruleLead}>
                      <span className={styles.kind}>{rule.measureKind === "vital" ? "VITAL" : "LAB"}</span>
                      <div>
                        <strong>{rule.canonicalMedication}</strong>
                        <h3>{rule.requiredMeasure}</h3>
                        <p>{rule.rationale}</p>
                      </div>
                    </div>

                    <div className={styles.sourceLine}>
                      <span>
                        {override
                          ? monitoringPolicySourceLabel(rule.source)
                          : `Inherited: ${monitoringPolicySourceLabel(inherited?.source ?? "system")}`}
                      </span>
                      <span>{formatMonitoringInterval(draft.intervalDays)}</span>
                    </div>

                    <div className={styles.controls}>
                      <label>
                        <span>Interval</span>
                        <div>
                          <input
                            type="number"
                            min={1}
                            max={3650}
                            value={draft.intervalDays}
                            disabled={!canEdit}
                            onChange={(event) =>
                              setDrafts((current) => ({
                                ...current,
                                [rule.id]: { ...draft, intervalDays: Number(event.target.value) },
                              }))
                            }
                          />
                          <small>days</small>
                        </div>
                      </label>

                      <label>
                        <span>Due soon</span>
                        <div>
                          <input
                            type="number"
                            min={0}
                            max={3650}
                            value={draft.dueSoonDays}
                            disabled={!canEdit}
                            onChange={(event) =>
                              setDrafts((current) => ({
                                ...current,
                                [rule.id]: { ...draft, dueSoonDays: Number(event.target.value) },
                              }))
                            }
                          />
                          <small>days before</small>
                        </div>
                      </label>

                      <label>
                        <span>Overdue after</span>
                        <div>
                          <input
                            type="number"
                            min={0}
                            max={3650}
                            value={draft.overdueGraceDays}
                            disabled={!canEdit}
                            onChange={(event) =>
                              setDrafts((current) => ({
                                ...current,
                                [rule.id]: { ...draft, overdueGraceDays: Number(event.target.value) },
                              }))
                            }
                          />
                          <small>days late</small>
                        </div>
                      </label>

                      <label className={styles.enabled}>
                        <span>Attention rule</span>
                        <input
                          type="checkbox"
                          checked={draft.enabled}
                          disabled={!canEdit}
                          onChange={(event) =>
                            setDrafts((current) => ({
                              ...current,
                              [rule.id]: { ...draft, enabled: event.target.checked },
                            }))
                          }
                        />
                        <small>{draft.enabled ? "Enabled" : "Disabled"}</small>
                      </label>
                    </div>

                    {scope === "patient" && (
                      <label className={styles.reason}>
                        <span>Reason for patient exception</span>
                        <textarea
                          value={draft.reason}
                          maxLength={500}
                          disabled={!canEdit}
                          placeholder="Example: temporary closer monitoring after a dose change."
                          onChange={(event) =>
                            setDrafts((current) => ({
                              ...current,
                              [rule.id]: { ...draft, reason: event.target.value },
                            }))
                          }
                        />
                      </label>
                    )}

                    <div className={styles.actions}>
                      {override && canEdit && (
                        <button
                          type="button"
                          className={styles.secondary}
                          disabled={savingRule === rule.id}
                          onClick={() => void reset(rule)}
                        >
                          Use inherited
                        </button>
                      )}
                      {canEdit && (
                        <button
                          type="button"
                          className={styles.primary}
                          disabled={
                            savingRule === rule.id ||
                            !Number.isFinite(draft.intervalDays) ||
                            !Number.isFinite(draft.dueSoonDays) ||
                            !Number.isFinite(draft.overdueGraceDays) ||
                            draft.intervalDays < 1 ||
                            draft.dueSoonDays < 0 ||
                            draft.dueSoonDays > draft.intervalDays ||
                            draft.overdueGraceDays < 0 ||
                            (scope === "patient" && draft.reason.trim().length < 3)
                          }
                          onClick={() => void save(rule)}
                        >
                          {savingRule === rule.id ? "Saving…" : override ? "Update" : "Save override"}
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
