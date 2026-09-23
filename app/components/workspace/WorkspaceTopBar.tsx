"use client";

import Image from "next/image";
import type { RefObject } from "react";
import Button from "../ui/Button";
import Icon from "../ui/Icon";
import PatientPhotoSpot from "../patient/PatientPhotoSpot";
import WorkspaceProfileMenu from "./WorkspaceProfileMenu";
import OmniboxAmbientPreview from "../omnibox/OmniboxAmbientPreview";
import CurrentUserMenu from "../auth/CurrentUserMenu";
import {
  OMNIBOX_FILTERS,
  type OmniboxController,
} from "../../lib/use-omnibox-controller";
import type { WorkspaceVoiceInput } from "../../lib/use-workspace-voice-input";
import type { WorkspaceView } from "../../lib/use-patient-tabs";
import type { Section } from "../../domain/patient";
import type { ProviderPreferences } from "../../lib/preference-engine";
import type {
  PracticeTemplate,
  PracticeTemplateState,
} from "../../lib/workspace-templates";

export interface WorkspaceTopBarProps {
  topbarRef: RefObject<HTMLElement | null>;
  commandInputRef: RefObject<HTMLInputElement | null>;
  activeView: WorkspaceView;
  onGoToWorkspaceView: (view: WorkspaceView) => void;
  omnibox: OmniboxController;
  voice: WorkspaceVoiceInput;
  preferences: ProviderPreferences;
  practiceTemplates: PracticeTemplateState;
  onOpenCustomizer: () => void;
  onResetDefaults: () => void;
  onApplyTemplate: (template: PracticeTemplate) => void;
  onApplyFavorite: (id: string) => void;
  onSaveFavorite: (name: string) => void;
  onDeleteFavorite: (id: string) => void;
  onSavePracticeDefault?: (name: string) => void;
  onDeletePracticeDefault?: (id: string) => void;
  onSplitScreenPatient: (patientId: string) => void;
  onOpenComposer: (
    patientId: string,
    tab: "cart" | "prescribe" | "labs",
    prefill?: string,
  ) => void;
  onJumpCalendarDate: (targetDate: string, daysLater?: number) => void;
  onOpenPatient: (patientId: string, section?: Section) => void;
  onDraftLabOrder: (patientId: string, labName: string) => void;
}

export default function WorkspaceTopBar({
  topbarRef,
  commandInputRef,
  activeView,
  onGoToWorkspaceView,
  omnibox,
  voice,
  preferences,
  practiceTemplates,
  onOpenCustomizer,
  onResetDefaults,
  onApplyTemplate,
  onApplyFavorite,
  onSaveFavorite,
  onDeleteFavorite,
  onSavePracticeDefault,
  onDeletePracticeDefault,
  onSplitScreenPatient,
  onOpenComposer,
  onJumpCalendarDate,
  onOpenPatient,
  onDraftLabOrder,
}: WorkspaceTopBarProps) {
  const {
    query,
    setQuery,
    searchFocused,
    setSearchFocused,
    omniboxFilter,
    setOmniboxFilter,
    commandPatient,
    commandSection,
    filteredPatients,
    queryClinicalAnswer,
    ambientQueryActive,
    ambientPlan,
    ambientPlanLoading,
    ambientPlanError,
    commandLabel,
    dismissOmnibox,
    runAiCommand,
  } = omnibox;

  const { voiceSupported, isListening, voiceMessage, toggleVoice } = voice;

  return (
    <header
      ref={topbarRef}
      className={`topbar ${activeView === "home" ? "zen-home-topbar-shell" : ""}`}
    >
      <div className="brand-nav-group">
        <button
          type="button"
          className={`brand-home-button ${activeView === "home" ? "active" : ""}`}
          data-workspace-view="home"
          onClick={() => onGoToWorkspaceView("home")}
          title="Return to Home Launchpad (Clinical AI & Practice Shortcuts)"
          aria-label="Home Launchpad"
        >
          <div className="brand-mark-inner" title="Clinical Bond">
            <Image src="/clinical-bond-mark.png" alt="" width={24} height={24} />
          </div>
          <span className="brand-home-sublabel">Home</span>
        </button>
        <div
          className="brand-titles"
          onClick={() => onGoToWorkspaceView("home")}
          role="button"
          tabIndex={0}
          title="Return to Home Launchpad"
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onGoToWorkspaceView("home");
            }
          }}
        >
          <strong>Clinical Bond</strong>
        </div>
      </div>

      <div className={`patient-search-wrap ${isListening ? "listening" : ""}`}>
        <svg
          className="search-icon"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          ref={commandInputRef}
          aria-label="Ask AI or search the EHR"
          value={query}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => window.setTimeout(() => setSearchFocused(false), 120)}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              runAiCommand(query);
            }
            if (event.key === "Escape") {
              event.preventDefault();
              setQuery("");
              setSearchFocused(false);
              commandInputRef.current?.blur();
            }
          }}
          placeholder={isListening ? "Listening…" : "Search or ask AI…"}
        />
        <span className="command-ai-badge">
          <span>
            <Icon name="auto_awesome" />
          </span>{" "}
          AI
        </span>
        {isListening && (
          <span className="voice-listening">
            <span />
            Listening
          </span>
        )}
        <button
          type="button"
          className={`voice-toggle ${isListening ? "active" : ""}`}
          aria-label={isListening ? "Stop voice input" : "Start voice input"}
          aria-pressed={isListening}
          title={voiceSupported ? "Voice input" : "Voice input requires a supported browser"}
          onClick={toggleVoice}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M6.5 10.5v.8a5.5 5.5 0 0 0 11 0v-.8M12 16.8V21M9 21h6" />
          </svg>
        </button>
        <kbd>Ctrl K</kbd>

        {searchFocused && (query.trim() || voiceMessage) && (
          <div className="search-results command-results">
            <div className="omnibox-filter-tabs" role="group" aria-label="Filter omnibox results">
              {OMNIBOX_FILTERS.map(({ id, label, icon }) => (
                <Button
                  key={id}
                  size="sm"
                  icon={icon}
                  pressed={omniboxFilter === id}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => setOmniboxFilter(id)}
                >
                  {label}
                </Button>
              ))}
            </div>

            {(omniboxFilter === "all" || omniboxFilter === "ai") && ambientQueryActive && (
              ambientPlanLoading ? (
                <div className="ambient-clinical-preview is-loading" role="status" data-omnibox-ambient-loading="true">
                  <span className="ambient-preview-kicker"><Icon name="auto_awesome" /> Clinical AI</span>
                  <strong>Checking the authorized record…</strong>
                  <small>The current workspace stays in place while this question is resolved.</small>
                </div>
              ) : ambientPlanError ? (
                <div className="ambient-clinical-preview is-error" role="alert" data-omnibox-ambient-error="true">
                  <span className="ambient-preview-kicker"><Icon name="warning" /> Could not retrieve</span>
                  <p>{ambientPlanError}</p>
                </div>
              ) : ambientPlan ? (
                <OmniboxAmbientPreview
                  plan={ambientPlan}
                  onOpenPatient={onOpenPatient}
                  onOpenComposer={onOpenComposer}
                  onDismiss={dismissOmnibox}
                />
              ) : null
            )}

            {(omniboxFilter === "all" || omniboxFilter === "ai" || omniboxFilter === "actions") &&
              !ambientQueryActive &&
              queryClinicalAnswer && (
                <div className="query-answer-card">
                  <div className="query-answer-header">
                    <span className="query-answer-title">
                      <span>
                        <Icon name="auto_awesome" />
                      </span>{" "}
                      {queryClinicalAnswer.title}
                    </span>
                    <span className="query-confidence-badge">Protocol Verified</span>
                  </div>
                  <p>{queryClinicalAnswer.body}</p>
                  <div className="query-card-actions">
                    {queryClinicalAnswer.isSplitScreen && (
                      <Button
                        variant="primary"
                        size="sm"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          onSplitScreenPatient(queryClinicalAnswer.patientId);
                          dismissOmnibox();
                        }}
                      >
                        {queryClinicalAnswer.actionLabel || "Split Screen"}
                      </Button>
                    )}
                    {queryClinicalAnswer.orderType === "prescribe" && (
                      <Button
                        variant="primary"
                        size="sm"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          onOpenComposer(
                            queryClinicalAnswer.patientId,
                            "prescribe",
                            queryClinicalAnswer.prefillDrug,
                          );
                          dismissOmnibox();
                        }}
                      >
                        {queryClinicalAnswer.actionLabel || "Stage to Cart"}
                      </Button>
                    )}
                    {queryClinicalAnswer.scheduleDate && (
                      <Button
                        variant="primary"
                        size="sm"
                        icon="calendar_month"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          onJumpCalendarDate(
                            queryClinicalAnswer.scheduleDate!,
                            queryClinicalAnswer.scheduleDaysLater,
                          );
                          dismissOmnibox();
                        }}
                      >
                        {queryClinicalAnswer.actionLabel ||
                          `Pull Up ${queryClinicalAnswer.scheduleDate}`}
                      </Button>
                    )}
                    {!queryClinicalAnswer.isSplitScreen &&
                      !queryClinicalAnswer.orderType &&
                      !queryClinicalAnswer.scheduleDate &&
                      queryClinicalAnswer.actionLabel && (
                        <Button
                          variant="primary"
                          size="sm"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() =>
                            onOpenPatient(
                              queryClinicalAnswer.patientId,
                              queryClinicalAnswer.actionSection ?? "Overview",
                            )
                          }
                        >
                          {queryClinicalAnswer.actionLabel}
                        </Button>
                      )}
                    {queryClinicalAnswer.labOrderName && (
                      <Button
                        size="sm"
                        icon="add"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          onDraftLabOrder(
                            queryClinicalAnswer.patientId,
                            queryClinicalAnswer.labOrderName!,
                          );
                          dismissOmnibox();
                        }}
                      >
                        Stage Lab Order
                      </Button>
                    )}
                  </div>
                </div>
              )}

            {(omniboxFilter === "all" || omniboxFilter === "ai") && query.trim() && !ambientQueryActive && (
              <button
                className="ai-command-result"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => runAiCommand(query)}
              >
                <span className="command-result-icon">
                  <Icon name="auto_awesome" />
                </span>
                <span>
                  <strong>{commandLabel}</strong>
                  <small>
                    {commandPatient || commandSection
                      ? "AI-routed workspace command"
                      : "Send to Clinical AI with the active chart context"}
                  </small>
                </span>
                <span className="enter-hint">
                  <Icon name="keyboard_return" size="sm" label="Press Enter" />
                </span>
              </button>
            )}

            {(omniboxFilter === "all" || omniboxFilter === "patients") &&
              filteredPatients.length > 0 && <div className="result-group-label">Patients</div>}
            {(omniboxFilter === "all" || omniboxFilter === "patients") &&
              filteredPatients.map((patient) => (
                <button
                  key={patient.id}
                  data-omnibox-result="patient"
                  data-patient-id={patient.id}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onOpenPatient(patient.id)}
                >
                  <PatientPhotoSpot
                    patient={patient}
                    size="sm"
                    editable={false}
                    showBadge={false}
                  />
                  <span>
                    <strong>{patient.name}</strong>
                    <small>
                      {patient.mrn} · DOB {patient.dob}
                    </small>
                  </span>
                </button>
              ))}

            {voiceMessage && !isListening && (
              <div className="voice-message">{voiceMessage}</div>
            )}
          </div>
        )}

        {searchFocused && !query.trim() && !voiceMessage && (
          <div className="search-results command-results command-starters">
            <div
              className="omnibox-filter-tabs"
              role="group"
              aria-label="Filter omnibox suggestions"
            >
              {OMNIBOX_FILTERS.filter(
                ({ id }) => id !== "patients" && id !== "apps",
              ).map(({ id, label, icon }) => (
                <Button
                  key={id}
                  size="sm"
                  icon={icon}
                  pressed={omniboxFilter === id}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => setOmniboxFilter(id)}
                >
                  {label}
                </Button>
              ))}
            </div>

            <div className="result-group-label">Try a clinical question or command</div>
            <button
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setQuery("When were Jordan's labs last done?");
              }}
            >
              <span className="command-result-icon">
                <Icon name="auto_awesome" />
              </span>
              <span>
                <strong>When were Jordan&apos;s labs last done?</strong>
                <small>Check surveillance dates & protocol status</small>
              </span>
            </button>
            <button
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setQuery("Refill Maya's Sertraline");
              }}
            >
              <span className="command-result-icon">
                <Icon name="medication" />
              </span>
              <span>
                <strong>Refill Maya&apos;s Sertraline</strong>
                <small>Stage e-prescription directly to DrFirst cart</small>
              </span>
            </button>
            <button
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setQuery("Split screen Jordan");
              }}
            >
              <span className="command-result-icon">
                <Icon name="splitscreen" />
              </span>
              <span>
                <strong>Split screen Jordan Reed</strong>
                <small>Open side-by-side dual chart comparison</small>
              </span>
            </button>
            <button
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setQuery("What changed since last visit in Maya");
              }}
            >
              <span className="command-result-icon">
                <Icon name="bar_chart" />
              </span>
              <span>
                <strong>What changed since last visit in Maya</strong>
                <small>Summon longitudinal AI interval briefing</small>
              </span>
            </button>
            <button
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onOpenCustomizer();
                setSearchFocused(false);
              }}
            >
              <span className="command-result-icon">
                <Icon name="tune" />
              </span>
              <span>
                <strong>Customize workspace layout</strong>
                <small>Tailor widgets, charts, metrics, and cards</small>
              </span>
            </button>
          </div>
        )}
      </div>

      <div className="top-actions">
        <WorkspaceProfileMenu
          settingsTrigger
          preferences={preferences}
          practice={practiceTemplates}
          onOpenCustomizer={() => {
            dismissOmnibox();
            onOpenCustomizer();
          }}
          onResetDefaults={onResetDefaults}
          onApplyTemplate={onApplyTemplate}
          onApplyFavorite={onApplyFavorite}
          onSaveFavorite={onSaveFavorite}
          onDeleteFavorite={onDeleteFavorite}
          onSavePracticeDefault={onSavePracticeDefault}
          onDeletePracticeDefault={onDeletePracticeDefault}
        />
        <CurrentUserMenu />
      </div>
    </header>
  );
}
