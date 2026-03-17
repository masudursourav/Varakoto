"use client";

import { useState } from "react";
import { useLanguage } from "@/context/language-context";
import { t } from "@/lib/i18n";
import type { FareResult } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  TrendingUp,
  ArrowRight,
  GraduationCap,
  X,
  MapPin,
  Route,
  Zap,
} from "lucide-react";

const MIN_STUDENT_FARE = 10;
function calcStudentFare(fare: number): number {
  return Math.max(MIN_STUDENT_FARE, Math.ceil(fare / 2));
}

interface FareResultCardProps {
  result: FareResult;
  showStudentFare: boolean;
}

function DetailsModal({
  result,
  showStudentFare,
  onClose,
}: {
  result: FareResult;
  showStudentFare: boolean;
  onClose: () => void;
}) {
  const { lang } = useLanguage();
  const studentFare = calcStudentFare(result.fare);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md animate-in slide-in-from-bottom rounded-t-3xl bg-white p-6 dark:bg-slate-900 sm:rounded-3xl">
        {/* Handle bar */}
        <div className="mb-4 flex justify-center sm:hidden">
          <div className="h-1 w-10 rounded-full bg-gray-300 dark:bg-slate-700" />
        </div>

        {/* Header */}
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-slate-100">
              {t(lang, "busDetails")}
            </h3>
            <p className="mt-0.5 text-sm text-gray-500 dark:text-slate-400">
              {result.bus}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 transition-colors hover:bg-gray-100 dark:hover:bg-slate-800"
          >
            <X className="h-5 w-5 text-gray-400 dark:text-slate-500" />
          </button>
        </div>

        {/* Route Info */}
        <div className="space-y-4">
          <div className="rounded-xl bg-gray-50 p-4 dark:bg-slate-800/60">
            <div className="mb-3 flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-slate-400">
              <Route className="h-3.5 w-3.5" />
              {t(lang, "routeLabel")}
            </div>
            <p className="text-sm font-semibold text-gray-800 dark:text-slate-200">
              {lang === "bn" ? result.route_name_bn : result.route_name_en}
            </p>
          </div>

          {/* Origin & Destination */}
          <div className="rounded-xl bg-gray-50 p-4 dark:bg-slate-800/60">
            <div className="flex items-center gap-3">
              <div className="flex flex-col items-center gap-1">
                <div className="h-3 w-3 rounded-full border-2 border-emerald-500 bg-emerald-100 dark:bg-emerald-900" />
                <div className="h-8 w-0.5 bg-gray-200 dark:bg-slate-700" />
                <div className="h-3 w-3 rounded-full border-2 border-red-500 bg-red-100 dark:bg-red-900" />
              </div>
              <div className="flex-1 space-y-4">
                <div>
                  <p className="text-[10px] font-medium text-gray-400 dark:text-slate-500">
                    {t(lang, "originLabel")}
                  </p>
                  <p className="text-sm font-semibold text-gray-800 dark:text-slate-200">
                    {result.origin_stop}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-medium text-gray-400 dark:text-slate-500">
                    {t(lang, "destinationLabel")}
                  </p>
                  <p className="text-sm font-semibold text-gray-800 dark:text-slate-200">
                    {result.destination_stop}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Distance & Fare */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-gray-50 p-4 dark:bg-slate-800/60">
              <p className="mb-1 text-[10px] font-medium text-gray-400 dark:text-slate-500">
                {t(lang, "distanceLabel")}
              </p>
              <p className="text-lg font-bold text-gray-800 dark:text-slate-200">
                {result.distance}{" "}
                <span className="text-sm font-normal text-gray-500 dark:text-slate-400">
                  {t(lang, "km")}
                </span>
              </p>
            </div>
            <div className="rounded-xl bg-blue-50 p-4 dark:bg-blue-900/30">
              <p className="mb-1 text-[10px] font-medium text-blue-500 dark:text-blue-400">
                {t(lang, "fareLabel")}
              </p>
              <p className="text-lg font-bold text-blue-700 dark:text-blue-300">
                ৳ {result.fare}
              </p>
              {showStudentFare && (
                <p className="mt-1 flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                  <GraduationCap className="h-3 w-3" />
                  {t(lang, "studentFareLabel")}: ৳{calcStudentFare(result.fare)}
                </p>
              )}
            </div>
          </div>

          {/* Transfer Details in Modal */}
          {result.is_transfer && result.transfer && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
              <p className="mb-2 text-xs font-semibold text-amber-700 dark:text-amber-400">
                {t(lang, "transferAt")}{" "}
                {lang === "bn"
                  ? result.transfer.transfer_stop_bn
                  : result.transfer.transfer_stop_en}
              </p>
              <div className="space-y-2 text-xs text-gray-600 dark:text-slate-400">
                <div className="flex justify-between">
                  <span>
                    {t(lang, "firstBus")}: {result.transfer.leg1.bus}
                  </span>
                  <span>
                    {result.transfer.leg1.distance} {t(lang, "km")} · ৳
                    {showStudentFare
                      ? calcStudentFare(result.transfer.leg1.fare)
                      : result.transfer.leg1.fare}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>
                    {t(lang, "secondBus")}: {result.transfer.leg2.bus}
                  </span>
                  <span>
                    {result.transfer.leg2.distance} {t(lang, "km")} · ৳
                    {showStudentFare
                      ? calcStudentFare(result.transfer.leg2.fare)
                      : result.transfer.leg2.fare}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Elevated Expressway Note */}
          {result.may_use_elevated_expressway && (
            <div className="rounded-xl border border-purple-200 bg-purple-50 p-4 dark:border-purple-800 dark:bg-purple-900/20">
              <div className="flex items-start gap-2">
                <Zap className="mt-0.5 h-4 w-4 shrink-0 text-purple-600 dark:text-purple-400" />
                <p className="text-xs leading-relaxed text-purple-700 dark:text-purple-300">
                  {t(lang, "expresswayNote")}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function FareResultCard({
  result,
  showStudentFare,
}: FareResultCardProps) {
  const { lang } = useLanguage();
  const [showDetails, setShowDetails] = useState(false);
  const studentFare = calcStudentFare(result.fare);
  const displayFare = showStudentFare ? studentFare : result.fare;

  const routeName =
    lang === "bn" ? result.route_name_bn : result.route_name_en;

  return (
    <>
      <section
        onClick={() => setShowDetails(true)}
        className="cursor-pointer fare-card overflow-hidden rounded-2xl border border-gray-100 bg-white transition-shadow active:shadow-md dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start justify-between p-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold leading-tight text-gray-900 dark:text-slate-100">
              {result.bus}
            </h2>
            <p className="mt-1 truncate text-xs text-gray-500 dark:text-slate-400">
              {routeName}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {result.is_transfer && result.transfer && (
                <Badge
                  variant="outline"
                  className="border-amber-200 bg-amber-50 text-xs text-amber-700 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                >
                  {t(lang, "multipleBuses")}
                </Badge>
              )}
              {result.may_use_elevated_expressway && (
                <Badge
                  variant="outline"
                  className="border-purple-200 bg-purple-50 text-xs text-purple-700 dark:border-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                >
                  <Zap className="mr-1 h-3 w-3" />
                  {t(lang, "elevatedExpress")}
                </Badge>
              )}
            </div>
            <div className="mt-3 flex items-center text-gray-400 dark:text-slate-500">
              <TrendingUp className="mr-1 h-3 w-3" />
              <span className="text-xs font-medium">
                {result.distance} {t(lang, "km")} ({t(lang, "approximate")})
              </span>
            </div>
          </div>

          {/* Fare Badge */}
          <div className="flex flex-col items-end text-right">
            <div className="flex flex-col items-center rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 dark:border-blue-800 dark:bg-blue-900/30">
              <span className="mb-1 text-xs font-bold tracking-tight text-blue-800 dark:text-blue-300">
                ৳ {displayFare}
              </span>
              <div className="rounded bg-blue-600 px-2 py-0.5 text-[8px] font-bold uppercase text-white">
                {t(lang, "brtaApproved")}
              </div>
            </div>
            {showStudentFare && (
              <div className="mt-1 flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400">
                <GraduationCap className="h-3 w-3" />
                <span>{t(lang, "studentFare")}</span>
              </div>
            )}
          </div>
        </div>

        {/* Transfer Details */}
        {result.is_transfer && result.transfer && (
          <>
            <Separator />
            <div className="bg-amber-50/50 px-4 py-3 dark:bg-amber-900/10">
              <p className="mb-2 text-xs font-medium text-amber-700 dark:text-amber-400">
                {t(lang, "transferAt")}{" "}
                {lang === "bn"
                  ? result.transfer.transfer_stop_bn
                  : result.transfer.transfer_stop_en}
              </p>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-slate-400">
                  <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                    {t(lang, "firstBus")}
                  </span>
                  <span className="truncate">{result.transfer.leg1.bus}</span>
                  <span className="ml-auto shrink-0 text-gray-400 dark:text-slate-500">
                    {result.transfer.leg1.distance} {t(lang, "km")} · ৳
                    {showStudentFare
                      ? calcStudentFare(result.transfer.leg1.fare)
                      : result.transfer.leg1.fare}
                  </span>
                </div>
                <div className="flex justify-center">
                  <ArrowRight className="h-3 w-3 text-gray-300 dark:text-slate-600" />
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-slate-400">
                  <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                    {t(lang, "secondBus")}
                  </span>
                  <span className="truncate">{result.transfer.leg2.bus}</span>
                  <span className="ml-auto shrink-0 text-gray-400 dark:text-slate-500">
                    {result.transfer.leg2.distance} {t(lang, "km")} · ৳
                    {showStudentFare
                      ? calcStudentFare(result.transfer.leg2.fare)
                      : result.transfer.leg2.fare}
                  </span>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Card Footer */}
        <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50 px-4 py-2 dark:border-slate-800 dark:bg-slate-800/50">
          <span className="text-[10px] text-gray-400 dark:text-slate-500">
            {lang === "bn" ? "BRTA হার অনুযায়ী" : "As per BRTA rate"}
          </span>
          <button
            onClick={() => setShowDetails(true)}
            className="flex items-center text-xs font-bold text-blue-600 dark:text-blue-400"
          >
            {t(lang, "details")}
            <ArrowRight className="ml-1 h-3 w-3" />
          </button>
        </div>
      </section>

      {showDetails && (
        <DetailsModal
          result={result}
          showStudentFare={showStudentFare}
          onClose={() => setShowDetails(false)}
        />
      )}
    </>
  );
}
