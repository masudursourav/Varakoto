"use client";

import { useLanguage } from "@/context/language-context";
import { useTheme } from "@/context/theme-context";
import { t } from "@/lib/i18n";
import { Moon, Mail, Bug, MessageSquare, ChevronRight } from "lucide-react";
import pkg from "../../package.json";

export default function SettingsPage() {
  const { lang } = useLanguage();
  const { isDark, toggle } = useTheme();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <main className="mx-auto max-w-md space-y-6 p-4 pb-24">
        {/* Appearance */}
        <section>
          <h2 className="mb-3 px-1 text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {t(lang, "appearance")}
          </h2>
          <div className="overflow-hidden rounded-panel border border-slate-100 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-4">
                <div className="rounded-lg bg-orange-100 p-2 text-orange-500 dark:bg-orange-900/30">
                  <Moon className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-medium text-slate-900 dark:text-slate-100">
                    {t(lang, "darkMode")}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t(lang, "darkModeDesc")}
                  </p>
                </div>
              </div>
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={isDark}
                  onChange={toggle}
                  aria-label={t(lang, "darkMode")}
                />
                <div className="peer h-6 w-11 rounded-full bg-slate-200 after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-orange-500 peer-checked:after:translate-x-full peer-checked:after:border-white dark:bg-slate-700 dark:after:border-slate-600" />
              </label>
            </div>
          </div>
        </section>

        {/* Contact Developer */}
        <section>
          <h2 className="mb-3 px-1 text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {t(lang, "contactDev")}
          </h2>
          <div className="overflow-hidden rounded-panel border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-6 flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border-2 border-orange-100 bg-orange-100 text-orange-500 dark:border-orange-800 dark:bg-orange-900/30">
                <span className="text-xl font-bold">ভ</span>
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  {t(lang, "varaKotoTeam")}
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {t(lang, "teamDesc")}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <a
                href="mailto:ertsourav@gmail.com"
                className="flex items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 py-3 font-medium text-white transition-colors hover:bg-orange-600"
              >
                <Mail className="h-4 w-4" />
                {t(lang, "emailSupport")}
              </a>
              <a
                href="https://github.com/masudursourav/varakoto/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 rounded-lg bg-slate-100 px-4 py-3 font-medium text-slate-700 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <Bug className="h-4 w-4" />
                {t(lang, "reportBug")}
              </a>
            </div>
            <a
              href="https://docs.google.com/forms/d/e/1FAIpQLSe9IUGCoeZxHfE7WqiNYvsUETcScwJlbEgQ02W27Z8VIlOq_w/viewform?usp=dialog"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 font-medium text-white transition-colors hover:bg-primary/90"
            >
              <MessageSquare className="h-4 w-4" />
              {t(lang, "writeFeedback")}
            </a>
          </div>
        </section>

        {/* BRTA Resources */}
        <section>
          <h2 className="mb-3 px-1 text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            BRTA
          </h2>
          <div className="overflow-hidden rounded-panel border border-slate-100 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <a
              href="https://brta.gov.bd"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between p-4 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-blue-50 p-2 text-primary dark:bg-blue-900/30">
                  <span className="text-sm font-bold">B</span>
                </div>
                <span className="font-medium text-slate-900 dark:text-slate-100">
                  {lang === "bn"
                    ? "বিআরটিএ ওয়েবসাইট"
                    : "BRTA Official Website"}
                </span>
              </div>
              <ChevronRight className="h-5 w-5 text-slate-400 dark:text-slate-600" />
            </a>
          </div>
        </section>

        {/* Version */}
        <div className="pt-4 text-center">
          <p className="text-xs text-slate-400 dark:text-slate-500">
            {t(lang, "version")} {pkg.version}
          </p>
          <p className="mt-1 text-[10px] text-slate-300 dark:text-slate-600">
            {lang === "bn"
              ? "BRTA-এর সাথে সম্পর্কিত নয়"
              : "Not affiliated with BRTA"}
          </p>
        </div>
      </main>
    </div>
  );
}
