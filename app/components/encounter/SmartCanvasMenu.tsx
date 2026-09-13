"use client";

import { useEffect, useId, useRef, useState, useMemo } from "react";
import Icon from "../ui/Icon";
import {
  type SmartChipItem,
  type SmartChipType,
  SMART_CHIP_CATEGORY_LABELS,
  SMART_CHIP_COLOR_CLASSES,
} from "../../domain/smart-canvas";

export interface SmartCanvasMenuProps {
  catalog: SmartChipItem[];
  query: string;
  onQueryChange?: (next: string) => void;
  position?: { top: number; left: number } | null;
  onSelect: (item: SmartChipItem) => void;
  onClose: () => void;
}

type TabFilter = "all" | "med" | "dx" | "lab" | "other";

export default function SmartCanvasMenu({
  catalog,
  query,
  onQueryChange,
  position,
  onSelect,
  onClose,
}: SmartCanvasMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const [activeTab, setActiveTab] = useState<TabFilter>("all");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listboxId = useId();

  // Filter catalog based on search query and active tab
  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();

    return catalog.filter((item) => {
      // Tab matching
      if (activeTab === "med" && item.type !== "med") return false;
      if (activeTab === "dx" && item.type !== "dx") return false;
      if (activeTab === "lab" && item.type !== "lab") return false;
      if (activeTab === "other" && item.type !== "vital" && item.type !== "scale" && item.type !== "date" && item.type !== "allergy") return false;

      // Query matching
      if (!q) return true;
      return (
        item.label.toLowerCase().includes(q) ||
        item.value.toLowerCase().includes(q) ||
        item.detail?.toLowerCase().includes(q) ||
        item.meta?.icdCode?.toLowerCase().includes(q) ||
        item.meta?.dose?.toLowerCase().includes(q)
      );
    });
  }, [catalog, query, activeTab]);

  // Reset selected index whenever the query or filtered list changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query, activeTab]);

  // Auto-scroll selected item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const activeEl = list.children[selectedIndex] as HTMLElement | undefined;
    if (activeEl) {
      activeEl.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  // Global escape and outside click handling
  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1 < filteredItems.length ? prev + 1 : 0));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 >= 0 ? prev - 1 : Math.max(0, filteredItems.length - 1)));
      } else if (e.key === "Enter" || e.key === "Tab") {
        if (filteredItems.length > 0) {
          e.preventDefault();
          onSelect(filteredItems[selectedIndex]);
        }
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [filteredItems, selectedIndex, onClose, onSelect]);

  // Category counts
  const counts = useMemo(() => {
    return {
      all: catalog.length,
      med: catalog.filter((c) => c.type === "med").length,
      dx: catalog.filter((c) => c.type === "dx").length,
      lab: catalog.filter((c) => c.type === "lab").length,
      other: catalog.filter((c) => c.type === "vital" || c.type === "scale" || c.type === "date" || c.type === "allergy").length,
    };
  }, [catalog]);

  // Calculate clamped floating position
  const stylePos = useMemo(() => {
    if (!position) return {};
    const margin = 16;
    const menuWidth = 360;
    const menuHeight = 380;
    const viewportW = typeof window !== "undefined" ? window.innerWidth : 1000;
    const viewportH = typeof window !== "undefined" ? window.innerHeight : 800;

    let left = position.left;
    let top = position.top;

    if (left + menuWidth > viewportW - margin) {
      left = Math.max(margin, viewportW - menuWidth - margin);
    }
    if (top + menuHeight > viewportH - margin) {
      top = Math.max(margin, position.top - menuHeight - 8);
    }

    return {
      top: `${top}px`,
      left: `${left}px`,
    };
  }, [position]);

  return (
    <div
      ref={menuRef}
      className="smart-canvas-menu"
      style={stylePos}
      role="dialog"
      aria-label="Google Smart Canvas insert menu"
    >
      {/* Header Search Bar */}
      <div className="smart-canvas-header">
        <div className="smart-canvas-search-box">
          <span className="smart-canvas-at-glyph">@</span>
          <input
            ref={inputRef}
            type="text"
            className="smart-canvas-search-input"
            value={query}
            placeholder="Type a medication, diagnosis, lab, or vital..."
            autoFocus
            onChange={(e) => onQueryChange?.(e.target.value)}
          />
          {query && (
            <button
              type="button"
              className="smart-canvas-clear-btn"
              onClick={() => onQueryChange?.("")}
              aria-label="Clear filter"
            >
              <Icon name="close" />
            </button>
          )}
        </div>
      </div>

      {/* Google Workspace Category Tabs */}
      <div className="smart-canvas-tabs" role="tablist" aria-label="Smart Canvas Categories">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "all"}
          className={`smart-canvas-tab ${activeTab === "all" ? "is-active" : ""}`}
          onClick={() => setActiveTab("all")}
        >
          All <span className="tab-badge">{counts.all}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "med"}
          className={`smart-canvas-tab ${activeTab === "med" ? "is-active" : ""}`}
          onClick={() => setActiveTab("med")}
        >
          <Icon name="medication" /> Meds <span className="tab-badge">{counts.med}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "dx"}
          className={`smart-canvas-tab ${activeTab === "dx" ? "is-active" : ""}`}
          onClick={() => setActiveTab("dx")}
        >
          <Icon name="stethoscope" /> Dx <span className="tab-badge">{counts.dx}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "lab"}
          className={`smart-canvas-tab ${activeTab === "lab" ? "is-active" : ""}`}
          onClick={() => setActiveTab("lab")}
        >
          <Icon name="science" /> Labs <span className="tab-badge">{counts.lab}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "other"}
          className={`smart-canvas-tab ${activeTab === "other" ? "is-active" : ""}`}
          onClick={() => setActiveTab("other")}
        >
          <Icon name="vital_signs" /> Vitals &amp; Dates <span className="tab-badge">{counts.other}</span>
        </button>
      </div>

      {/* Item List */}
      <ul
        ref={listRef}
        id={listboxId}
        className="smart-canvas-list"
        role="listbox"
        aria-label="Matching Smart Chips"
      >
        {filteredItems.length === 0 ? (
          <li className="smart-canvas-empty">
            <Icon name="search_off" />
            <span>No matching chart records found for &quot;{query}&quot;</span>
          </li>
        ) : (
          filteredItems.map((item, index) => {
            const isSelected = index === selectedIndex;
            const colorClass = SMART_CHIP_COLOR_CLASSES[item.type];
            const categoryLabel = SMART_CHIP_CATEGORY_LABELS[item.type];

            return (
              <li
                key={item.id}
                role="option"
                aria-selected={isSelected}
                className={`smart-canvas-item ${isSelected ? "is-selected" : ""}`}
                onMouseEnter={() => setSelectedIndex(index)}
                onClick={() => onSelect(item)}
              >
                <div className={`smart-canvas-icon-box ${colorClass}`}>
                  <Icon name={item.icon} />
                </div>
                <div className="smart-canvas-item-content">
                  <div className="smart-canvas-item-title-row">
                    <span className="smart-canvas-item-title">{item.label}</span>
                    <span className="smart-canvas-item-category">{categoryLabel}</span>
                  </div>
                  {item.detail && (
                    <div className="smart-canvas-item-detail">{item.detail}</div>
                  )}
                </div>
                <div className="smart-canvas-item-action">
                  <kbd>↵</kbd>
                </div>
              </li>
            );
          })
        )}
      </ul>

      {/* Footer Navigation Tip */}
      <div className="smart-canvas-footer">
        <span>Use <kbd>↑</kbd><kbd>↓</kbd> to navigate, <kbd>Enter</kbd> to insert chip</span>
        <button type="button" className="smart-canvas-close-link" onClick={onClose}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
