"use client";

import { useState, useRef, useEffect } from "react";
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

  const displayName = (stop: StopItem) =>
    lang === "bn" ? stop.name_bn : stop.name_en;

  const filtered = query.trim()
    ? stops
        .filter((s) => {
          const q = query.toLowerCase();
          return (
            s.name_en.toLowerCase().includes(q) || s.name_bn.includes(query)
          );
        })
        .slice(0, 50)
    : [];

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

  useEffect(() => {
    setHighlightIndex(-1);
  }, [query]);

  const handleSelect = (stop: StopItem) => {
    onChange(stop);
    setQuery("");
    setIsOpen(false);
  };

  const handleClear = () => {
    onChange(null);
    setQuery("");
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || filtered.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((prev) =>
        prev < filtered.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((prev) =>
        prev > 0 ? prev - 1 : filtered.length - 1
      );
    } else if (e.key === "Enter" && highlightIndex >= 0) {
      e.preventDefault();
      handleSelect(filtered[highlightIndex]);
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <label className="ml-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
        {label}
      </label>
      <div className="flex items-center border-b-2 border-slate-100 py-2 dark:border-slate-700">
        <MapPin className="mr-3 h-5 w-5 shrink-0 text-[#1a4a8e] dark:text-blue-400" />
        {value ? (
          <div className="flex flex-1 items-center">
            <span className="flex-1 truncate text-base font-medium text-slate-800 dark:text-slate-100">
              {displayName(value)}
            </span>
            <button
              onClick={handleClear}
              className="ml-2 rounded-full p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-600 dark:hover:text-slate-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIsOpen(true);
            }}
            onFocus={() => query.trim() && setIsOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="w-full border-none bg-transparent p-0 text-base font-medium text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-0 dark:text-slate-100 dark:placeholder:text-slate-600"
          />
        )}
      </div>

      {isOpen && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
          {filtered.map((stop, i) => (
            <button
              key={`${stop.name_en}-${i}`}
              onClick={() => handleSelect(stop)}
              className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors ${
                i === highlightIndex
                  ? "bg-blue-50 text-[#1a4a8e] dark:bg-blue-900/30 dark:text-blue-300"
                  : "text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700"
              }`}
            >
              <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
              <span className="truncate">{displayName(stop)}</span>
              {lang === "bn" && (
                <span className="ml-auto truncate text-xs text-slate-400 dark:text-slate-500">
                  {stop.name_en}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
