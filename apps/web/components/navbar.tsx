"use client";

import { useLanguage } from "@/context/language-context";

export function Navbar() {
  const { lang, toggle } = useLanguage();

  return (
    <header
      className="sticky top-0 z-50 flex items-center justify-between border-b border-white/20 bg-white/80 px-4 py-3 backdrop-blur-md dark:border-white/5 dark:bg-slate-900/80"
    >
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
          <span className="text-sm font-bold text-primary-foreground">ভ</span>
        </div>
        <h1 className="text-xl font-bold tracking-tight text-primary">
          ভাড়া কত
        </h1>
      </div>

      {/* Language Toggle — sliding pill */}
      <div
        role="radiogroup"
        aria-label="Language"
        className="relative flex rounded-full bg-slate-200 p-0.5 dark:bg-slate-700"
      >
        {/* Sliding indicator */}
        <div
          className={`absolute top-0.5 h-[calc(100%-4px)] w-[calc(50%-2px)] rounded-full bg-white shadow-sm transition-transform duration-300 ease-in-out dark:bg-slate-500 ${
            lang === "en" ? "translate-x-[calc(100%+2px)]" : "translate-x-0"
          }`}
        />
        <button
          role="radio"
          aria-checked={lang === "bn"}
          aria-label="বাংলা"
          onClick={lang !== "bn" ? toggle : undefined}
          className={`relative z-10 rounded-full px-3 py-1 text-[11px] font-bold transition-colors duration-300 ${
            lang === "bn"
              ? "text-primary dark:text-white"
              : "text-slate-500 dark:text-slate-400"
          }`}
        >
          BN
        </button>
        <button
          role="radio"
          aria-checked={lang === "en"}
          aria-label="English"
          onClick={lang !== "en" ? toggle : undefined}
          className={`relative z-10 rounded-full px-3 py-1 text-[11px] font-bold transition-colors duration-300 ${
            lang === "en"
              ? "text-primary dark:text-white"
              : "text-slate-500 dark:text-slate-400"
          }`}
        >
          EN
        </button>
      </div>
    </header>
  );
}
