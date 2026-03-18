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

  const activeIndex = tabs.findIndex(({ href }) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href),
  );

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-100 bg-white px-6 pb-[env(safe-area-inset-bottom,8px)] pt-3 dark:border-slate-800 dark:bg-slate-900">
      <div className="relative mx-auto flex max-w-md items-center justify-between">
        {tabs.map(({ href, icon: Icon, labelKey }, i) => {
          const isActive = i === activeIndex;
          return (
            <Link
              key={href}
              href={href}
              className={`relative flex flex-col items-center gap-1 transition-colors duration-200 ${
                isActive
                  ? "text-[#1a4a8e] dark:text-blue-400"
                  : "text-slate-400 dark:text-slate-500"
              }`}
            >
              <div className="relative">
                <div
                  className={`absolute inset-0 -mx-3 -my-0.5 rounded-full transition-all duration-300 ease-in-out ${
                    isActive
                      ? "scale-100 bg-[#1a4a8e]/10 opacity-100 dark:bg-blue-400/10"
                      : "scale-75 opacity-0"
                  }`}
                />
                <Icon
                  className={`relative h-6 w-6 transition-transform duration-200 ${
                    isActive ? "scale-105" : ""
                  }`}
                />
              </div>
              <span
                className={`text-[10px] uppercase tracking-tighter transition-all duration-200 ${
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
