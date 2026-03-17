"use client";

import { useLanguage } from "@/context/language-context";

export function Navbar() {
  const { lang, toggle } = useLanguage();

  return (
    <header
      className="glass-header sticky top-0 z-50 flex items-center justify-between bg-white/80 px-4 py-3 backdrop-blur-[12px] dark:bg-slate-900/80"
      style={{ borderBottom: "1px solid rgba(255,255,255,0.2)" }}
    >
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#1a4a8e]">
          <span className="text-sm font-bold text-white">ভ</span>
        </div>
        <h1 className="text-xl font-bold tracking-tight text-[#1a4a8e] dark:text-blue-300">
          ভাড়া কত
        </h1>
      </div>

      {/* Language Toggle Pill */}
      <button
        onClick={toggle}
        className="relative flex w-24 cursor-pointer items-center rounded-full bg-slate-200 p-1 dark:bg-slate-700"
        aria-label="Toggle language"
      >
        <div
          className={`absolute flex h-6 w-10 items-center justify-center rounded-full bg-white shadow-sm transition-all duration-300 dark:bg-slate-500 ${
            lang === "bn" ? "left-1" : "left-[calc(100%-2.75rem)]"
          }`}
        >
          <span className="text-[10px] font-bold text-[#1a4a8e] dark:text-white">
            {lang === "bn" ? "BN" : "EN"}
          </span>
        </div>
        <div className="flex w-full justify-around">
          <span
            className={`text-[10px] font-medium ${
              lang === "bn" ? "opacity-0" : "text-slate-500 dark:text-slate-400"
            }`}
          >
            BN
          </span>
          <span
            className={`text-[10px] font-medium ${
              lang === "en" ? "opacity-0" : "text-slate-500 dark:text-slate-400"
            }`}
          >
            EN
          </span>
        </div>
      </button>
    </header>
  );
}
