import React from "react";
import { ChevronRight, LifeBuoy } from "lucide-react";
import type { DriverSupport } from "../../../types";
import { useT, type MessageKey } from "../../../i18n";
import { cn } from "../../../utils/cn";

const LEVEL_STYLE: Record<string, string> = {
  ended: "border-slate-600 bg-slate-800 text-slate-200",
  likely_ended: "border-slate-700 bg-slate-800/70 text-slate-300",
  legacy: "border-slate-700 bg-slate-900 text-slate-300",
};

/** Label voor het ondersteuningsniveau ("Geen ondersteuning meer" e.d.). */
export const SupportBadge: React.FC<{ support: DriverSupport }> = ({ support }) => {
  const t = useT();
  return (
    <span
      className={cn(
        "px-2.5 py-1 rounded-lg border text-xs font-semibold flex items-center gap-1.5 self-start shrink-0",
        LEVEL_STYLE[support.level] ?? LEVEL_STYLE.legacy,
      )}
    >
      <LifeBuoy className="w-3.5 h-3.5" />
      {t(`drivers.support.${support.level}` as MessageKey)}
    </span>
  );
};

/**
 * Waarom de fabrikant deze driver niet (meer volledig) ondersteunt, met een inklapbare
 * handleiding. Bewust ingeklapt en neutraal van kleur: het is geen fout, en de handleiding is
 * alleen nodig als je er iets van merkt.
 */
export const DriverSupportNote: React.FC<{ support: DriverSupport }> = ({ support }) => {
  const t = useT();
  const g = support.guide;
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 space-y-2">
      <p className="text-xs text-slate-300 leading-relaxed">
        <span className="font-semibold text-slate-100">{t("drivers.support.heading")} </span>
        {support.reason}
      </p>
      <details className="group">
        <summary className="cursor-pointer select-none text-xs font-semibold text-blue-300 hover:text-blue-200 flex items-center gap-1 list-none [&::-webkit-details-marker]:hidden">
          <ChevronRight className="w-3.5 h-3.5 transition-transform group-open:rotate-90" />
          {g.title}
        </summary>
        <div className="mt-2.5 pl-4.5 space-y-2.5">
          {g.why && <p className="text-xs text-slate-400 leading-relaxed">{g.why}</p>}
          <ol className="space-y-1.5">
            {g.steps.map((step, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-slate-300 leading-relaxed">
                <span className="w-5 h-5 shrink-0 rounded-md border border-slate-700 bg-slate-900 text-slate-300 flex items-center justify-center text-[11px] font-semibold">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </details>
    </div>
  );
};
