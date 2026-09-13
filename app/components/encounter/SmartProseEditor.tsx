"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import Icon from "../ui/Icon";
import SmartCanvasMenu from "./SmartCanvasMenu";
import SmartChipHoverCard from "./SmartChipHoverCard";
import {
  type SmartChipItem,
  type SmartChipSpan,
  detectSmartChipsInText,
  insertSmartChipAtCursor,
  SMART_CHIP_COLOR_CLASSES,
} from "../../domain/smart-canvas";

export interface SmartProseEditorProps {
  value: string;
  placeholder: string;
  disabled: boolean;
  ariaLabel: string;
  catalog: SmartChipItem[];
  sectionId: string;
  onFocus?: () => void;
  onChange: (next: string) => void;
  onRegisterReference?: (item: SmartChipItem, section: string) => void;
}

export default function SmartProseEditor({
  value,
  placeholder,
  disabled,
  ariaLabel,
  catalog,
  sectionId,
  onFocus,
  onChange,
  onRegisterReference,
}: SmartProseEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Menu state
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuQuery, setMenuQuery] = useState("");
  const [atIndex, setAtIndex] = useState<number | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

  // Hovercard state
  const [hoveredItem, setHoveredItem] = useState<SmartChipItem | null>(null);
  const [hoverTargetRect, setHoverTargetRect] = useState<DOMRect | null>(null);

  // Auto-grow textarea to content
  useEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${node.scrollHeight}px`;
  }, [value]);

  // Detect smart chips present in current section text
  const detectedChips: SmartChipSpan[] = useMemo(() => {
    return detectSmartChipsInText(value, catalog);
  }, [value, catalog]);

  // Handle typing & detecting `@` trigger
  function handleTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const nextVal = e.target.value;
    const cursorPos = e.target.selectionStart ?? nextVal.length;
    onChange(nextVal);

    // Look backwards from cursor to see if inside an `@` mention query
    const textBeforeCursor = nextVal.slice(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf("@");

    if (lastAtIndex !== -1) {
      const queryCandidate = textBeforeCursor.slice(lastAtIndex + 1);
      // Valid query if no newlines or whitespace exceeding 25 chars
      if (!/[\n\r]/.test(queryCandidate) && queryCandidate.length <= 25) {
        setAtIndex(lastAtIndex);
        setMenuQuery(queryCandidate);

        // Position menu below the textarea container or near cursor
        if (textareaRef.current) {
          const rect = textareaRef.current.getBoundingClientRect();
          setMenuPos({
            top: rect.bottom + 4,
            left: Math.max(16, rect.left + Math.min(rect.width - 380, lastAtIndex * 8)),
          });
        }
        setMenuOpen(true);
        return;
      }
    }

    if (menuOpen) {
      setMenuOpen(false);
      setAtIndex(null);
      setMenuQuery("");
    }
  }

  // Handle explicit `@ Smart Chip` button click
  function handleOpenSmartChipMenu() {
    if (disabled || !textareaRef.current) return;
    textareaRef.current.focus();
    const cursorPos = textareaRef.current.selectionStart ?? value.length;
    const rect = textareaRef.current.getBoundingClientRect();

    setAtIndex(cursorPos);
    setMenuQuery("");
    setMenuPos({
      top: rect.bottom + 4,
      left: Math.max(16, rect.left + 24),
    });
    setMenuOpen(true);
  }

  // Handle selection from autocompletion menu
  function handleSelectChip(item: SmartChipItem) {
    const textarea = textareaRef.current;
    const cursorPos = textarea ? textarea.selectionStart : value.length;
    const triggerStart = atIndex !== null ? atIndex : cursorPos;
    const triggerLen = Math.max(1, cursorPos - triggerStart);

    const { nextText, newCursorIndex } = insertSmartChipAtCursor(
      value,
      cursorPos,
      item,
      triggerLen
    );

    onChange(nextText);
    setMenuOpen(false);
    setAtIndex(null);
    setMenuQuery("");

    // Register reference out-of-band if callback is available
    if (onRegisterReference) {
      onRegisterReference(item, sectionId);
    }

    // Restore focus and position cursor right after inserted chip text
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newCursorIndex, newCursorIndex);
      }
    }, 10);
  }

  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  function handleChipMouseEnter(span: SmartChipSpan, e: React.MouseEvent<HTMLButtonElement>) {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setHoveredItem(span.item);
    setHoverTargetRect(rect);
  }

  function handleChipMouseLeave() {
    closeTimeoutRef.current = setTimeout(() => {
      setHoveredItem(null);
      setHoverTargetRect(null);
    }, 280);
  }

  function handleHoverCardEnter() {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  }

  function handleHoverCardLeave() {
    closeTimeoutRef.current = setTimeout(() => {
      setHoveredItem(null);
      setHoverTargetRect(null);
    }, 200);
  }

  return (
    <div ref={containerRef} className="smart-prose-container">
      {/* Primary Prose Textarea */}
      <textarea
        ref={textareaRef}
        className="note-doc-prose"
        aria-label={ariaLabel}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        onFocus={onFocus}
        onChange={handleTextChange}
      />

      {/* Floating Smart Canvas Menu Autocompleter */}
      {menuOpen && (
        <SmartCanvasMenu
          catalog={catalog}
          query={menuQuery}
          position={menuPos}
          onQueryChange={setMenuQuery}
          onSelect={handleSelectChip}
          onClose={() => {
            setMenuOpen(false);
            setAtIndex(null);
          }}
        />
      )}

      {/* Active Interactive Google Smart Chips Bar */}
      {detectedChips.length > 0 && (
        <div className="google-smart-chips-bar" aria-label="Detected Smart Chips in this section">
          <span className="smart-chips-bar-label">
            <Icon name="auto_awesome" /> Smart Chips
          </span>
          <div className="smart-chips-list">
            {detectedChips.map((chip, idx) => {
              const colorClass = SMART_CHIP_COLOR_CLASSES[chip.type];
              return (
                <button
                  key={`${chip.type}-${chip.start}-${idx}`}
                  type="button"
                  className={`google-smart-chip ${colorClass}`}
                  aria-haspopup="dialog"
                  onMouseEnter={(e) => handleChipMouseEnter(chip, e)}
                  onMouseLeave={handleChipMouseLeave}
                  onClick={(e) => handleChipMouseEnter(chip, e)}
                >
                  <span className="smart-chip-icon">
                    <Icon name={chip.item.icon} />
                  </span>
                  <span className="smart-chip-label">{chip.label}</span>
                  {chip.item.meta?.icdCode && (
                    <span className="smart-chip-badge">{chip.item.meta.icdCode}</span>
                  )}
                  {chip.item.meta?.dose && (
                    <span className="smart-chip-badge">{chip.item.meta.dose}</span>
                  )}
                  {chip.item.meta?.labFlag === "abnormal" && (
                    <span className="smart-chip-badge abnormal">Abnormal</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Google Hovercard Popup */}
      {hoveredItem && hoverTargetRect && (
        <SmartChipHoverCard
          item={hoveredItem}
          targetRect={hoverTargetRect}
          onPointerEnter={handleHoverCardEnter}
          onPointerLeave={handleHoverCardLeave}
          onClose={() => {
            setHoveredItem(null);
            setHoverTargetRect(null);
          }}
        />
      )}
    </div>
  );
}
