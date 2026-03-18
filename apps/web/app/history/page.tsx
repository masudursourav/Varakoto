"use client";

import { useLanguage } from "@/context/language-context";
import {
  clearHistory,
  formatTimeAgo,
  getHistory,
  type SearchHistoryItem,
} from "@/lib/history";
import { t } from "@/lib/i18n";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronRight, Clock, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function HistoryPage() {
  const { lang } = useLanguage();
  const router = useRouter();
  const [history, setHistory] = useState<SearchHistoryItem[]>(() =>
    getHistory(),
  );
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleClear = () => {
    clearHistory();
    setHistory([]);
    setConfirmOpen(false);
  };

  const handleClick = (item: SearchHistoryItem) => {
    const originParam = lang === "bn" ? item.origin_bn : item.origin_en;
    const destParam = lang === "bn" ? item.destination_bn : item.destination_en;
    router.push(
      `/results?origin=${encodeURIComponent(originParam)}&destination=${encodeURIComponent(destParam)}`,
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <main className="mx-auto max-w-md px-4 py-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">
            {t(lang, "recentSearches")}
          </h1>
          {history.length > 0 && (
            <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
              <DialogTrigger
                render={
                  <button className="flex items-center gap-1 text-sm font-medium text-red-500" />
                }
              >
                <Trash2 className="h-3.5 w-3.5" />
                {t(lang, "clearAll")}
              </DialogTrigger>
              <DialogContent showCloseButton={false} className="rounded-card dark:bg-slate-900">
                <DialogHeader>
                  <DialogTitle className="dark:text-slate-100">
                    {t(lang, "clearHistoryTitle")}
                  </DialogTitle>
                  <DialogDescription>
                    {t(lang, "clearHistoryDesc")}
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose
                    render={<Button variant="outline" />}
                  >
                    {t(lang, "cancel")}
                  </DialogClose>
                  <Button variant="destructive" onClick={handleClear}>
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    {t(lang, "confirmClear")}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {history.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Clock className="h-12 w-12 text-slate-200 dark:text-slate-700" />
            <p className="mt-4 text-sm font-medium text-slate-500 dark:text-slate-400">
              {t(lang, "noHistory")}
            </p>
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              {t(lang, "noHistoryDesc")}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {history.map((item, i) => (
              <button
                key={i}
                onClick={() => handleClick(item)}
                className="flex w-full items-center justify-between rounded-card border border-slate-100 bg-white p-4 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
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
        )}
      </main>
    </div>
  );
}
