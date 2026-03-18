"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useLanguage } from "@/context/language-context";
import type { StopItem } from "@/lib/api";
import { MapPin, X } from "lucide-react";

interface StopAutocompleteProps {
  stops: StopItem[];
  value: StopItem | null;
  onChange: (stop: StopItem | null) => void;
  placeholder: string;
  label: string;
  icon?: "origin" | "destination";
}

// ─── Fuzzy filter ─────────────────────────────────────────────────────────────

/**
 * Strip spaces, hyphens, and other separators then lower-case.
 * Used for the "compact" match pass.
 * e.g. "Farm Gate" → "farmgate"  |  "Mirpur-10" → "mirpur10"
 */
function compact(text: string): string {
  return text.toLowerCase().replace(/[\s\-_.,]/g, "");
}

/**
 * Score a stop against a query string.
 *
 * Returns a numeric score ≥ 1 when the stop matches (higher = better match),
 * or 0 when the stop does not match at all.
 *
 * Scoring tiers (highest wins):
 *  5 — Exact match on the display name (after lower-casing)
 *  4 — Display name starts with the query
 *  3 — Compact (spaceless) equality:  "farmgate" ↔ "farm gate"
 *  2 — Any of: contains, compact-contains, compact-prefix match
 *  1 — All whitespace-separated query tokens appear in the English name
 *  0 — No match
 *
 * Bengali names are checked with a simple `.includes()` at tier 2.
 */
function scoreStop(stop: StopItem, query: string, lang: "bn" | "en"): number {
  if (!query.trim()) return 0;

  const q = query.toLowerCase().trim();
  const en = stop.name_en.toLowerCase();
  const bn = stop.name_bn;

  const cq = compact(q);
  const cen = compact(en);

  // Tier 5: exact
  if (en === q) return 5;

  // Tier 4: starts-with (English only — most important for keyboard users)
  if (en.startsWith(q)) return 4;

  // Tier 3: compact equality  e.g. "farmgate" ↔ "farm gate"
  if (cen === cq) return 3;

  // Tier 2: substring / compact-contains / Bengali contains
  if (
    en.includes(q) ||
    bn.includes(query) ||
    cen.includes(cq) ||
    cq.includes(cen)
  ) {
    return 2;
  }

  // Tier 1: every space-separated query word appears in the English name
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length > 1 && tokens.every((tok) => en.includes(tok))) {
    return 1;
  }

  // Tier 1 (Bengali): every query token appears in the Bengali name
  if (
    lang === "bn" &&
    tokens.length > 0 &&
    tokens.every((tok) => bn.includes(tok))
  ) {
    return 1;
  }

  return 0;
}

/**
 * Filter and rank stops against a user query.
 * Returns at most `limit` results, sorted by score descending then
 * alphabetically by display name for ties.
 */
function filterStops(
  stops: StopItem[],
  query: string,
  lang: "bn" | "en",
  limit = 50,
): StopItem[] {
  if (!query.trim()) return [];

  const scored: { stop: StopItem; score: number }[] = [];

  for (const stop of stops) {
    const score = scoreStop(stop, query, lang);
    if (score > 0) scored.push({ stop, score });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Alphabetical tiebreak on display name
    const nameA = lang === "bn" ? a.stop.name_bn : a.stop.name_en;
    const nameB = lang === "bn" ? b.stop.name_bn : b.stop.name_en;
    return nameA.localeCompare(nameB);
  });

  return scored.slice(0, limit).map((s) => s.stop);
}

// ─── Component ────────────────────────────────────────────────────────────────

export function StopAutocomplete({
  stops,
  value,
  onChange,
  placeholder,
  label,
  icon = "origin",
}: StopAutocompleteProps) {
  const { lang } = useLanguage();
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const displayName = (stop: StopItem) =>
    lang === "bn" ? stop.name_bn : stop.name_en;

  const filtered = filterStops(stops, query, lang);

  // ── Close on outside click ──────────────────────────────────────────────────
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ── Scroll highlighted item into view ───────────────────────────────────────
  useEffect(() => {
    if (highlightIndex >= 0 && itemRefs.current[highlightIndex]) {
      itemRefs.current[highlightIndex]?.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
    }
  }, [highlightIndex]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleSelect = useCallback(
    (stop: StopItem) => {
      onChange(stop);
      setQuery("");
      setIsOpen(false);
      setHighlightIndex(-1);
    },
    [onChange],
  );

  const handleClear = () => {
    onChange(null);
    setQuery("");
    setIsOpen(false);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || filtered.length === 0) {
      if (e.key === "Escape") setIsOpen(false);
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightIndex((prev) =>
          prev < filtered.length - 1 ? prev + 1 : 0,
        );
        break;

      case "ArrowUp":
        e.preventDefault();
        setHighlightIndex((prev) =>
          prev > 0 ? prev - 1 : filtered.length - 1,
        );
        break;

      case "Enter":
        e.preventDefault();
        if (highlightIndex >= 0) {
          handleSelect(filtered[highlightIndex]);
        } else if (filtered.length === 1) {
          // Auto-select when there is exactly one result
          handleSelect(filtered[0]);
        }
        break;

      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        setHighlightIndex(-1);
        break;

      case "Tab":
        setIsOpen(false);
        break;
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div ref={containerRef} className="relative">
      <label className="ml-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
        {label}
      </label>

      <div className="flex items-center border-b-2 border-slate-100 py-2 dark:border-slate-700">
        <MapPin
          className={`mr-3 h-5 w-5 shrink-0 ${
            icon === "destination"
              ? "text-red-400 dark:text-red-500"
              : "text-[#1a4a8e] dark:text-blue-400"
          }`}
        />

        {value ? (
          /* ── Selected state ── */
          <div className="flex flex-1 items-center">
            <span className="flex-1 truncate text-base font-medium text-slate-800 dark:text-slate-100">
              {displayName(value)}
            </span>
            <button
              onClick={handleClear}
              aria-label="Clear selection"
              className="ml-2 rounded-full p-0.5 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-600 dark:hover:text-slate-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          /* ── Input state ── */
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlightIndex(-1);
              itemRefs.current = [];
              setIsOpen(true);
            }}
            onFocus={() => {
              if (query.trim()) setIsOpen(true);
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            className="w-full border-none bg-transparent p-0 text-base font-medium text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-0 dark:text-slate-100 dark:placeholder:text-slate-600"
          />
        )}
      </div>

      {/* ── Dropdown ─────────────────────────────────────────────────────────── */}
      {isOpen && filtered.length > 0 && (
        <div
          ref={listRef}
          role="listbox"
          aria-label={label}
          className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800"
        >
          {filtered.map((stop, i) => (
            <button
              key={`${stop.name_en}-${i}`}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              role="option"
              aria-selected={i === highlightIndex}
              onClick={() => handleSelect(stop)}
              className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors ${
                i === highlightIndex
                  ? "bg-blue-50 text-[#1a4a8e] dark:bg-blue-900/30 dark:text-blue-300"
                  : "text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700"
              }`}
            >
              <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" />

              {/* Primary display name */}
              <span className="flex-1 truncate">{displayName(stop)}</span>

              {/* Secondary name hint — show English when in Bengali mode */}
              {lang === "bn" && (
                <span className="ml-auto shrink-0 truncate text-xs text-slate-400 dark:text-slate-500">
                  {stop.name_en}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* ── No results hint ───────────────────────────────────────────────────── */}
      {isOpen && query.trim().length >= 2 && filtered.length === 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-lg dark:border-slate-700 dark:bg-slate-800">
          <p className="text-sm text-slate-400 dark:text-slate-500">
            {lang === "bn"
              ? `"${query}" নামে কোনো স্থান পাওয়া যায়নি`
              : `No stop found for "${query}"`}
          </p>
        </div>
      )}
    </div>
  );
}
