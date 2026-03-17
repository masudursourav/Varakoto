"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLanguage } from "@/context/language-context";
import { t } from "@/lib/i18n";
import { Home, Clock, Settings } from "lucide-react";

const tabs = [
  { href: "/", icon: Home, labelKey: "home" as const },
  { href: "/history", icon: Clock, labelKey: "history" as const },
  { href: "/settings", icon: Settings, labelKey: "settings" as const },
];

export function BottomNav() {
  const { lang } = useLanguage();
  const pathname = usePathname();

  // Hide bottom nav on results page
  if (pathname.startsWith("/results")) return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-100 bg-white px-6 pb-[env(safe-area-inset-bottom,8px)] pt-3 dark:border-slate-800 dark:bg-slate-900">
      <div className="mx-auto flex max-w-md items-center justify-between">
        {tabs.map(({ href, icon: Icon, labelKey }) => {
          const isActive =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-1 transition-colors ${
                isActive
                  ? "text-[#1a4a8e] dark:text-blue-400"
                  : "text-slate-400 dark:text-slate-500"
              }`}
            >
              {isActive ? (
                <div className="mb-0.5 rounded-full bg-[#1a4a8e]/10 px-4 py-1 dark:bg-blue-400/10">
                  <Icon className="h-5 w-5" />
                </div>
              ) : (
                <Icon className="h-6 w-6" />
              )}
              <span
                className={`text-[10px] uppercase tracking-tighter ${
                  isActive ? "font-bold" : "font-medium"
                }`}
              >
                {t(lang, labelKey)}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
