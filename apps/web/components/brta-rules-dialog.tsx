"use client";

import { useLanguage } from "@/context/language-context";
import { t } from "@/lib/i18n";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Shield, CheckCircle } from "lucide-react";

export function BrtaRulesDialog() {
  const { lang } = useLanguage();

  const rules = [
    t(lang, "brtaRule1"),
    t(lang, "brtaRule2"),
    t(lang, "brtaRule3"),
    t(lang, "brtaRule4"),
    t(lang, "brtaRule5"),
  ];

  return (
    <Dialog>
      <DialogTrigger
        render={
          <button className="flex w-full flex-col items-center space-y-2 rounded-card border border-slate-100 bg-white p-4 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900" />
        }
      >
        <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-primary dark:bg-blue-900/30">
          <Shield className="h-6 w-6" />
        </div>
        <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
          {t(lang, "brtaRules")}
        </span>
      </DialogTrigger>
      <DialogContent className="rounded-card dark:bg-slate-900">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 dark:text-slate-100">
            <Shield className="h-5 w-5 text-primary" />
            {t(lang, "brtaRulesTitle")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {rules.map((rule, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                {rule}
              </p>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
