"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/context/language-context";
import { t } from "@/lib/i18n";
import { fetchStops, fetchNearestStops, type StopItem } from "@/lib/api";
import {
  getHistory,
  addToHistory,
  type SearchHistoryItem,
} from "@/lib/history";
import { formatTimeAgo } from "@/lib/utils";
import { StopAutocomplete } from "@/components/stop-autocomplete";
import { BrtaRulesDialog } from "@/components/brta-rules-dialog";
import { SearchCardSkeleton } from "@/components/skeletons";
import {
  ArrowUpDown,
  Loader2,
  Phone,
  Clock,
  ChevronRight,
  MapPin,
  Crosshair,
  X,
} from "lucide-react";

const BRTA_HELPLINE = "16107";

export function HomeContent() {
  const { lang } = useLanguage();
  const router = useRouter();

  const [stops, setStops] = useState<StopItem[]>([]);
  const [origin, setOrigin] = useState<StopItem | null>(null);
  const [destination, setDestination] = useState<StopItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<SearchHistoryItem[]>([]);
  const [locating, setLocating] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 4000);
  };

  // Fetch stops once on mount.
  // `lang` is intentionally excluded from the dependency array:
  // the /stops endpoint always returns both name_en and name_bn, so
  // toggling the UI language must never trigger a re-fetch.
  // The module-level cache in lib/api.ts also guarantees a second mount
  // (e.g. navigating back home) is served instantly without any network call.
  useEffect(() => {
    setLoading(true);
    fetchStops()
      .then(setStops)
      .catch(() => setError(t(lang, "error")))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // ← empty: fetch once, use cache thereafter

  useEffect(() => {
    setHistory(getHistory());
  }, []);

  const handleSwap = () => {
    setOrigin(destination);
    setDestination(origin);
  };

  const handleSubmit = () => {
    if (!origin || !destination) return;
    if (origin.name_en === destination.name_en) return;

    setSubmitting(true);

    addToHistory({
      origin_en: origin.name_en,
      origin_bn: origin.name_bn,
      destination_en: destination.name_en,
      destination_bn: destination.name_bn,
    });

    const originParam = lang === "bn" ? origin.name_bn : origin.name_en;
    const destParam = lang === "bn" ? destination.name_bn : destination.name_en;
    router.push(
      `/results?origin=${encodeURIComponent(originParam)}&destination=${encodeURIComponent(destParam)}`,
    );
  };

  const handleHistoryClick = (item: SearchHistoryItem) => {
    const originParam = lang === "bn" ? item.origin_bn : item.origin_en;
    const destParam = lang === "bn" ? item.destination_bn : item.destination_en;
    router.push(
      `/results?origin=${encodeURIComponent(originParam)}&destination=${encodeURIComponent(destParam)}`,
    );
  };

  const handleLocate = () => {
    if (!navigator.geolocation) {
      showToast(t(lang, "locationError"));
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          const nearest = await fetchNearestStops(latitude, longitude);
          if (nearest.length > 0) {
            // Find matching stop from loaded stops list
            const match = stops.find(
              (s) =>
                s.name_en.toLowerCase() === nearest[0].name_en.toLowerCase(),
            );
            if (match) {
              setOrigin(match);
            }
          }
        } catch {
          showToast(t(lang, "locationError"));
        } finally {
          setLocating(false);
        }
      },
      (err) => {
        setLocating(false);
        if (err.code === err.PERMISSION_DENIED) {
          showToast(t(lang, "locationDenied"));
        } else {
          showToast(t(lang, "locationError"));
        }
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const canSubmit =
    origin &&
    destination &&
    origin.name_en !== destination.name_en &&
    !submitting;

  const recentHistory = history.slice(0, 3);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Toast notification */}
      {toast && (
        <div className="fixed left-1/2 top-16 z-[60] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-3 rounded-card border border-red-100 bg-white px-4 py-3 shadow-lg dark:border-red-900 dark:bg-slate-900">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-50 dark:bg-red-900/30">
              <MapPin className="h-4 w-4 text-red-500" />
            </div>
            <p className="flex-1 text-sm font-medium text-slate-700 dark:text-slate-300">
              {toast}
            </p>
            <button
              onClick={() => setToast(null)}
              className="shrink-0 rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <main className="px-4 pb-20">
        {/* Search Card */}
        <section className="mb-8 mt-6">
          <div className="relative rounded-container bg-white p-6 shadow-xl dark:bg-slate-900 dark:shadow-none">
            {loading ? (
              <SearchCardSkeleton />
            ) : error ? (
              <div className="py-8 text-center">
                <p className="text-sm text-red-500">{error}</p>
                <button
                  className="mt-3 rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-400"
                  onClick={() => window.location.reload()}
                >
                  {t(lang, "tryAgain")}
                </button>
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  <div>
                    <StopAutocomplete
                      stops={stops}
                      value={origin}
                      onChange={setOrigin}
                      placeholder={t(lang, "originPlaceholder")}
                      label={t(lang, "origin")}
                      icon="origin"
                    />
                    {!origin && (
                      <button
                        onClick={handleLocate}
                        disabled={locating}
                        className="mt-2 flex w-full items-center justify-center gap-2 rounded-panel border border-dashed border-blue-300 bg-blue-50/80 py-2.5 text-sm font-medium text-primary transition-all hover:border-blue-400 hover:bg-blue-100 active:scale-[0.98] disabled:opacity-50 dark:border-blue-700 dark:bg-blue-900/20 dark:hover:bg-blue-900/40"
                      >
                        {locating ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Crosshair className="h-4 w-4" />
                        )}
                        {locating
                          ? t(lang, "locating")
                          : t(lang, "locateMe")}
                      </button>
                    )}
                  </div>

                  {/* Swap Button — centered between the two fields */}
                  <div className="flex justify-center">
                    <button
                      onClick={handleSwap}
                      className="rounded-full bg-primary p-2 text-primary-foreground shadow-lg transition active:scale-90"
                      aria-label={t(lang, "swap")}
                    >
                      <ArrowUpDown className="h-5 w-5" />
                    </button>
                  </div>

                  <StopAutocomplete
                    stops={stops}
                    value={destination}
                    onChange={setDestination}
                    placeholder={t(lang, "destinationPlaceholder")}
                    label={t(lang, "destination")}
                    icon="destination"
                  />
                </div>

                {/* Calculate Button */}
                <button
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  className="mt-6 w-full rounded-card bg-primary py-4 font-bold text-primary-foreground shadow-md transition active:opacity-90 disabled:opacity-50"
                >
                  {submitting ? (
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  ) : (
                    t(lang, "calculateFare")
                  )}
                </button>

                {/* Stop count info */}
                <div className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500">
                  <MapPin className="h-3 w-3" />
                  <span>
                    {lang === "bn"
                      ? `${stops.length.toLocaleString("bn-BD")}টি স্থানের তথ্য সংযুক্ত`
                      : `${stops.length} stops available`}
                  </span>
                </div>

                {/* Barikoi attribution */}
                <div className="mt-4 flex flex-col items-center gap-1">
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">
                    {lang === "bn" ? "সহযোগিতায়" : "Supported by"}
                  </span>
                  <a
                    href="https://barikoi.com"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/barikoi-logo.svg"
                      alt="Barikoi Maps"
                      className="h-5 dark:brightness-0 dark:invert"
                    />
                  </a>
                </div>
              </>
            )}
          </div>
        </section>

        {/* Quick Access Cards */}
        <section className="mb-8 grid grid-cols-2 gap-4">
          <BrtaRulesDialog />
          <a href={`tel:${BRTA_HELPLINE}`} className="block">
            <div className="flex flex-col items-center space-y-2 rounded-card border border-slate-100 bg-white p-4 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 text-[#ff5252] dark:bg-red-900/30">
                <Phone className="h-6 w-6" />
              </div>
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {t(lang, "helpline")}
              </span>
            </div>
          </a>
        </section>

        {/* Recent Searches */}
        {recentHistory.length > 0 && (
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                {t(lang, "recentSearches")}
              </h2>
              <button
                onClick={() => router.push("/history")}
                className="text-sm font-semibold text-primary"
              >
                {t(lang, "viewAll")}
              </button>
            </div>
            <div className="space-y-3">
              {recentHistory.map((item, i) => (
                <button
                  key={i}
                  onClick={() => handleHistoryClick(item)}
                  className="flex w-full items-center justify-between rounded-card border border-slate-100 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="flex items-center gap-4">
                    <Clock className="h-5 w-5 text-slate-300 dark:text-slate-600" />
                    <div className="text-left">
                      <p className="font-bold text-slate-700 dark:text-slate-200">
                        {lang === "bn" ? item.origin_bn : item.origin_en}
                        <span aria-hidden="true" className="mx-1 text-primary">→</span>
                        <span className="sr-only">{t(lang, "to")}</span>
                        {lang === "bn"
                          ? item.destination_bn
                          : item.destination_en}
                      </p>
                      <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500">
                        {formatTimeAgo(item.timestamp, lang)}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-slate-400 dark:text-slate-600" />
                </button>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
