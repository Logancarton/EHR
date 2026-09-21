"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type RefObject,
} from "react";
import Icon from "../ui/Icon";
import type { Patient } from "../../domain/patient";
import type { GlobalWorkspaceModule } from "../../lib/workspace-navigation";
import type { WorkspaceView } from "../../lib/use-patient-tabs";

import {
  getLauncherWorkspaceDestinations,
  getWorkspaceCatalogEntry,
  type WorkspaceDestinationId,
} from "../../lib/workspace-catalog";

export type WorkspaceDestination = WorkspaceDestinationId;

export interface WorkspaceItemConfig {
  id: WorkspaceDestination;
  label: string;
  description: string;
  icon: string;
  tone: "blue" | "green" | "teal" | "amber" | "indigo" | "emerald" | "purple";
  isOpen: boolean;
  statusLabel?: string;
}

export interface OpenWorkspaceLauncherProps {
  isOpen: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  activeView: WorkspaceView;
  calendarTabOpen: boolean;
  openModuleTabs: GlobalWorkspaceModule[];
  activeModule: GlobalWorkspaceModule | null;
  dockedPatientIds: string[];
  activePatientId: string;
  roster: readonly Patient[];
  onSelectWorkspace: (destination: WorkspaceDestination) => void;
  onSelectPatient: (patientId: string) => void;
}

/**
 * Universal "Open workspace" launcher popover.
 *
 * Implements UI-1 & UI-2 (D-085, LEFT-01, LEFT-02, LEFT-03):
 * - Consumes the canonical shared workspace catalog (getLauncherWorkspaceDestinations).
 * - Offers Home, Calendar, Patients, Intake, Documents, Billing, Brand, and recent patients.
 * - Singletons (Calendar, Intake, Billing, Brand, Home) and already-docked patient charts
 *   are focused if already open instead of duplicated.
 * - Supports keyboard navigation (Arrow keys, Enter, Escape) and instant search filtering.
 */
export default function OpenWorkspaceLauncher({
  isOpen,
  onClose,
  anchorRef,
  activeView,
  calendarTabOpen,
  openModuleTabs,
  activeModule,
  dockedPatientIds,
  activePatientId,
  roster,
  onSelectWorkspace,
  onSelectPatient,
}: OpenWorkspaceLauncherProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const launcherRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Position calculation relative to anchor button
  useEffect(() => {
    if (!isOpen || !anchorRef.current) return;

    const computeCoords = () => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;

      const popoverWidth = Math.min(360, window.innerWidth - 16);
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - popoverWidth - 8));
      const top = rect.bottom + 6;

      setCoords({ top, left });
    };

    computeCoords();
    window.addEventListener("resize", computeCoords);
    return () => window.removeEventListener("resize", computeCoords);
  }, [isOpen, anchorRef]);

  // Focus search input whenever launcher opens
  useEffect(() => {
    if (isOpen) {
      const timer = window.setTimeout(() => {
        searchInputRef.current?.focus();
      }, 30);
      return () => window.clearTimeout(timer);
    }
  }, [isOpen]);

  // Major Workspaces configuration consuming the shared catalog (UI-2, D-085)
  const majorWorkspaces: WorkspaceItemConfig[] = useMemo(() => {
    const isHomeActive = activeView === "home";
    const isCalendarOpen = calendarTabOpen;
    const isPatientsActive = activeView === "patient";
    const isIntakeOpen = openModuleTabs.includes("intake") || activeModule === "intake";
    const isDocumentsActive = activeModule === "documents";
    const isBillingOpen = openModuleTabs.includes("billing") || activeModule === "billing";
    const isBrandOpen = openModuleTabs.includes("website") || activeModule === "website";

    const catalogDestinations = getLauncherWorkspaceDestinations();

    return catalogDestinations.map((entry) => {
      let isOpen = false;
      let statusLabel: string | undefined;

      if (entry.id === "home") {
        isOpen = isHomeActive;
        statusLabel = isHomeActive ? "Active" : undefined;
      } else if (entry.id === "calendar") {
        isOpen = isCalendarOpen;
        statusLabel = isCalendarOpen ? "Open tab" : undefined;
      } else if (entry.id === "patients") {
        isOpen = isPatientsActive;
        statusLabel = isPatientsActive ? "Active chart" : undefined;
      } else if (entry.id === "intake") {
        isOpen = isIntakeOpen;
        statusLabel = isIntakeOpen ? "Open tab" : undefined;
      } else if (entry.id === "documents") {
        isOpen = isDocumentsActive;
        statusLabel = isDocumentsActive ? "Active" : undefined;
      } else if (entry.id === "billing") {
        isOpen = isBillingOpen;
        statusLabel = isBillingOpen ? "Open tab" : undefined;
      } else if (entry.id === "brand") {
        isOpen = isBrandOpen;
        statusLabel = isBrandOpen ? "Open tab" : undefined;
      }

      return {
        id: entry.id,
        label: entry.label,
        description: entry.description,
        icon: entry.icon,
        tone: entry.tone,
        isOpen,
        statusLabel,
      };
    });
  }, [
    activeView,
    calendarTabOpen,
    openModuleTabs,
    activeModule,
  ]);

  // Recent patients from roster (up to 5)
  const recentPatients = useMemo(() => {
    return roster.slice(0, 5).map((patient) => {
      const isDocked = dockedPatientIds.includes(patient.id);
      const isActive = activeView === "patient" && activePatientId === patient.id;
      return {
        patient,
        isDocked,
        isActive,
        statusLabel: isActive ? "Active chart" : isDocked ? "Open tab" : undefined,
      };
    });
  }, [roster, dockedPatientIds, activeView, activePatientId]);

  // Filtered lists based on search query
  const query = searchQuery.trim().toLowerCase();

  const filteredWorkspaces = useMemo(() => {
    if (!query) return majorWorkspaces;
    return majorWorkspaces.filter((ws) => {
      const catalogEntry = getWorkspaceCatalogEntry(ws.id);
      const matchesKeyword = catalogEntry?.keywords?.some((k) =>
        k.toLowerCase().includes(query),
      );
      return (
        ws.label.toLowerCase().includes(query) ||
        ws.description.toLowerCase().includes(query) ||
        ws.id.toLowerCase().includes(query) ||
        Boolean(matchesKeyword)
      );
    });
  }, [majorWorkspaces, query]);

  const filteredPatients = useMemo(() => {
    if (!query) return recentPatients;
    return recentPatients.filter(
      (rp) =>
        rp.patient.name.toLowerCase().includes(query) ||
        rp.patient.mrn.toLowerCase().includes(query) ||
        (rp.patient.alert && rp.patient.alert.toLowerCase().includes(query)),
    );
  }, [recentPatients, query]);

  // Combined selectable items list for keyboard navigation
  type SelectableItem =
    | { type: "workspace"; item: WorkspaceItemConfig }
    | { type: "patient"; item: (typeof recentPatients)[0] };

  const allSelectableItems: SelectableItem[] = useMemo(() => {
    const items: SelectableItem[] = [];
    filteredWorkspaces.forEach((item) => items.push({ type: "workspace", item }));
    filteredPatients.forEach((item) => items.push({ type: "patient", item }));
    return items;
  }, [filteredWorkspaces, filteredPatients]);

  // Safe highlighted index derived during render
  const safeHighlightedIndex = Math.min(
    highlightedIndex,
    Math.max(0, allSelectableItems.length - 1),
  );

  const handleSelectItem = useCallback(
    (item: SelectableItem) => {
      if (item.type === "workspace") {
        onSelectWorkspace(item.item.id);
      } else {
        onSelectPatient(item.item.patient.id);
      }
      onClose();
    },
    [onSelectWorkspace, onSelectPatient, onClose],
  );

  useEffect(() => {
    if (!isOpen) return;

    const handleWindowKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        anchorRef.current?.focus();
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setHighlightedIndex((prev) =>
          prev + 1 < allSelectableItems.length ? prev + 1 : 0,
        );
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setHighlightedIndex((prev) =>
          prev - 1 >= 0 ? prev - 1 : Math.max(0, allSelectableItems.length - 1),
        );
        return;
      }

      if (event.key === "Enter") {
        const activeEl = document.activeElement;
        if (activeEl instanceof HTMLButtonElement && activeEl.closest(".open-workspace-close-btn, .open-workspace-search-clear")) {
          return;
        }
        event.preventDefault();
        const selected = allSelectableItems[safeHighlightedIndex];
        if (selected) {
          handleSelectItem(selected);
        }
      }
    };

    window.addEventListener("keydown", handleWindowKeyDown);
    return () => window.removeEventListener("keydown", handleWindowKeyDown);
  }, [isOpen, allSelectableItems, safeHighlightedIndex, handleSelectItem, onClose, anchorRef]);

  if (!isOpen) return null;

  return (
    <div
      ref={launcherRef}
      className="open-workspace-popover"
      style={{ top: `${coords.top}px`, left: `${coords.left}px` }}
      role="dialog"
      tabIndex={-1}
      aria-modal="false"
      aria-label="Open workspace"
      data-testid="open-workspace-launcher-popover"
    >
      {/* Header */}
      <div className="open-workspace-header">
        <div className="open-workspace-title-group">
          <span className="open-workspace-title-icon">
            <Icon name="add" size="sm" />
          </span>
          <div>
            <h2 className="open-workspace-heading">Open workspace</h2>
            <p className="open-workspace-subheading">Launch major workspaces or patient charts</p>
          </div>
        </div>
        <button
          type="button"
          className="open-workspace-close-btn"
          onClick={onClose}
          aria-label="Close launcher"
          title="Close launcher (Escape)"
        >
          <Icon name="close" size="sm" />
        </button>
      </div>

      {/* Filter / Search Input */}
      <div className="open-workspace-search-bar">
        <Icon name="search" size="sm" className="open-workspace-search-icon" />
        <input
          ref={searchInputRef}
          type="text"
          className="open-workspace-search-input"
          placeholder="Find workspace or patient..."
          aria-label="Find workspace or patient"
          value={searchQuery}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            setSearchQuery(e.target.value);
            setHighlightedIndex(0);
          }}
        />
        {searchQuery && (
          <button
            type="button"
            className="open-workspace-search-clear"
            onClick={() => {
              setSearchQuery("");
              setHighlightedIndex(0);
              searchInputRef.current?.focus();
            }}
            aria-label="Clear search"
          >
            <Icon name="close" size="sm" />
          </button>
        )}
      </div>

      {/* Content list */}
      <div ref={listRef} className="open-workspace-body" role="listbox" aria-label="Available workspaces">
        {allSelectableItems.length === 0 ? (
          <div className="open-workspace-empty">
            <Icon name="search_off" size="md" />
            <span>No workspaces or patients matching &ldquo;{searchQuery}&rdquo;</span>
          </div>
        ) : (
          <>
            {/* Major Workspaces Section */}
            {filteredWorkspaces.length > 0 && (
              <div className="open-workspace-section">
                <div className="open-workspace-section-label">Workspaces</div>
                <div className="open-workspace-grid">
                  {filteredWorkspaces.map((ws) => {
                    const globalIdx = allSelectableItems.findIndex(
                      (item) => item.type === "workspace" && item.item.id === ws.id,
                    );
                    const isHighlighted = globalIdx === safeHighlightedIndex;

                    return (
                      <button
                        key={ws.id}
                        type="button"
                        role="option"
                        aria-selected={isHighlighted}
                        className={`open-workspace-item ${isHighlighted ? "highlighted" : ""} ${
                          ws.isOpen ? "is-open" : ""
                        }`}
                        data-workspace-id={ws.id}
                        onClick={() => handleSelectItem({ type: "workspace", item: ws })}
                        onMouseEnter={() => setHighlightedIndex(globalIdx)}
                      >
                        <div className={`open-workspace-item-icon tone-${ws.tone}`}>
                          <Icon name={ws.icon} size="md" />
                        </div>
                        <div className="open-workspace-item-info">
                          <div className="open-workspace-item-title-row">
                            <span className="open-workspace-item-title">{ws.label}</span>
                            {ws.statusLabel && (
                              <span
                                className={`open-workspace-status-badge ${
                                  ws.statusLabel === "Active" || ws.statusLabel === "Active chart"
                                    ? "active"
                                    : "open"
                                }`}
                              >
                                {ws.statusLabel}
                              </span>
                            )}
                          </div>
                          <span className="open-workspace-item-desc">{ws.description}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Recent Patients Section */}
            {filteredPatients.length > 0 && (
              <div className="open-workspace-section">
                <div className="open-workspace-section-label">
                  {query ? "Matching Patients" : "Recent Patients"}
                </div>
                <div className="open-workspace-patients-list">
                  {filteredPatients.map((rp) => {
                    const globalIdx = allSelectableItems.findIndex(
                      (item) => item.type === "patient" && item.item.patient.id === rp.patient.id,
                    );
                    const isHighlighted = globalIdx === safeHighlightedIndex;

                    return (
                      <button
                        key={rp.patient.id}
                        type="button"
                        role="option"
                        aria-selected={isHighlighted}
                        className={`open-workspace-patient-row ${isHighlighted ? "highlighted" : ""} ${
                          rp.isDocked ? "is-docked" : ""
                        }`}
                        data-patient-id={rp.patient.id}
                        onClick={() => handleSelectItem({ type: "patient", item: rp })}
                        onMouseEnter={() => setHighlightedIndex(globalIdx)}
                      >
                        <div className="open-workspace-patient-avatar">
                          {rp.patient.name
                            .split(" ")
                            .map((p) => p[0])
                            .slice(0, 2)
                            .join("")}
                        </div>
                        <div className="open-workspace-patient-info">
                          <div className="open-workspace-patient-name-row">
                            <span className="open-workspace-patient-name">{rp.patient.name}</span>
                            {rp.statusLabel && (
                              <span
                                className={`open-workspace-status-badge ${
                                  rp.isActive ? "active" : "open"
                                }`}
                              >
                                {rp.statusLabel}
                              </span>
                            )}
                          </div>
                          <span className="open-workspace-patient-meta">
                            MRN: {rp.patient.mrn} • {rp.patient.age}y ({rp.patient.pronouns})
                            {rp.patient.alert && ` • ${rp.patient.alert}`}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer hint */}
      <div className="open-workspace-footer">
        <span>Press <kbd>↑</kbd> <kbd>↓</kbd> to navigate, <kbd>Enter</kbd> to select, <kbd>Esc</kbd> to close</span>
      </div>
    </div>
  );
}
