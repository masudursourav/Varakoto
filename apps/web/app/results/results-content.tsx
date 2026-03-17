"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useLanguage } from "@/context/language-context";
import { t } from "@/lib/i18n";
import { calculateFare, type FareResult } from "@/lib/api";
import { FareResultCard } from "@/components/fare-result-card";
import {
  Loader2,
  SearchX,
  Phone,
  GraduationCap,
  ArrowLeft,
} from "lucide-react";

const BRTA_COMPLAINT_NUMBER = "16107";

export function ResultsContent() {
  const { lang } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();

  const origin = searchParams.get("origin") || "";
  const destination = searchParams.get("destination") || "";

  const [results, setResults] = useState<FareResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showStudentFare, setShowStudentFare] = useState(false);

  useEffect(() => {
    if (!origin || !destination) {
      router.replace("/");
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await calculateFare(origin, destination);
        if (!cancelled) setResults(data);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : t(lang, "error"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [origin, destination, router, lang]);

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-slate-950">
      {/* Sticky Header */}
      <header className="sticky-header sticky top-[52px] z-40 border-b border-gray-200 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/90">
        <div className="mx-auto flex max-w-md items-center justify-between">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => router.push("/")}
              className="rounded-full p-2 transition-colors hover:bg-gray-100 dark:hover:bg-slate-800"
            >
              <ArrowLeft className="h-5 w-5 text-gray-600 dark:text-slate-300" />
            </button>
            <div className="flex flex-col">
              <span className="text-sm font-bold text-gray-800 dark:text-slate-100">
                {origin} → {destination}
              </span>
              <span className="text-xs text-gray-500 dark:text-slate-400">
                {t(lang, "verifyFare")}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-md space-y-4 p-4">
        {/* Student Fare Toggle */}
        {!loading && !error && results.length > 0 && (
          <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                {t(lang, "studentToggle")}
              </span>
            </div>
            <label className="relative inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                className="peer sr-only"
                checked={showStudentFare}
                onChange={(e) => setShowStudentFare(e.target.checked)}
              />
              <div className="peer h-6 w-11 rounded-full bg-slate-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-emerald-500 peer-checked:after:translate-x-full peer-checked:after:border-white dark:bg-slate-700 dark:after:border-slate-600" />
            </label>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-[#1a4a8e] dark:text-blue-400" />
            <p className="mt-3 text-sm text-gray-500 dark:text-slate-400">
              {t(lang, "searching")}
            </p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="rounded-full bg-red-50 p-3 dark:bg-red-900/30">
              <SearchX className="h-6 w-6 text-red-400" />
            </div>
            <p className="mt-3 text-sm font-medium text-gray-900 dark:text-slate-100">
              {error}
            </p>
            <button
              onClick={() => router.push("/")}
              className="mt-4 rounded-full border border-slate-200 px-4 py-2 text-sm dark:border-slate-700 dark:text-slate-300"
            >
              {t(lang, "searchAgain")}
            </button>
          </div>
        ) : results.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="rounded-full bg-gray-100 p-3 dark:bg-slate-800">
              <SearchX className="h-6 w-6 text-gray-400 dark:text-slate-500" />
            </div>
            <p className="mt-3 text-sm font-medium text-gray-900 dark:text-slate-100">
              {t(lang, "noResults")}
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
              {t(lang, "noResultsDesc")}
            </p>
            <button
              onClick={() => router.push("/")}
              className="mt-4 rounded-full border border-slate-200 px-4 py-2 text-sm dark:border-slate-700 dark:text-slate-300"
            >
              {t(lang, "searchAgain")}
            </button>
          </div>
        ) : (
          <>
            {results.map((result, i) => (
              <FareResultCard
                key={`${result.bus}-${i}`}
                result={result}
                showStudentFare={showStudentFare}
              />
            ))}

            {/* Warning Note */}
            <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-800 dark:bg-yellow-900/20">
              <p className="text-xs leading-relaxed text-yellow-800 dark:text-yellow-300">
                <span className="font-bold">{t(lang, "warning")}</span>{" "}
                {t(lang, "warningOvercharge")}
              </p>
            </div>
          </>
        )}
      </main>

      {/* Fixed Complaint Footer */}
      {!loading && results.length > 0 && (
        <footer className="fixed bottom-0 left-0 right-0 border-t border-gray-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="mx-auto flex max-w-md flex-col items-center">
            <div className="mb-4 h-1 w-12 rounded-full bg-gray-300 dark:bg-slate-700" />
            <a
              href={`tel:${BRTA_COMPLAINT_NUMBER}`}
              className="flex items-center space-x-2 rounded-full bg-red-50 px-6 py-3 font-bold text-red-600 shadow-sm transition-all active:scale-95 dark:bg-red-900/30 dark:text-red-400"
            >
              <Phone className="h-5 w-5" />
              <span>{t(lang, "complaintCta")}</span>
            </a>
          </div>
        </footer>
      )}
    </div>
  );
}
