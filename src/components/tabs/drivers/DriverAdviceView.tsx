import React from "react";
import { Info, Lightbulb, Wrench, CornerDownRight } from "lucide-react";
import type { DriverAdvice } from "../../../types";
import { useT } from "../../../i18n";
import { cn } from "../../../utils/cn";

/** Kleuraccent per driverstatus (zelfde tinten als de statusbadge). */
const TONE: Record<string, { ring: string; num: string; icon: string }> = {
  Probleem: { ring: "border-rose-900/60 bg-rose-950/15", num: "bg-rose-500/15 text-rose-300 border-rose-700/70", icon: "text-rose-400" },
  "Niet ondertekend": { ring: "border-orange-900/60 bg-orange-950/10", num: "bg-orange-500/15 text-orange-300 border-orange-700/70", icon: "text-orange-400" },
  Verouderd: { ring: "border-amber-900/50 bg-amber-950/10", num: "bg-amber-500/15 text-amber-300 border-amber-700/70", icon: "text-amber-400" },
};

interface Props {
  status: string;
  advice: DriverAdvice;
  onOpenDeviceManager?: () => void;
}

/**
 * Toont driveradvies als kop + "waarom" + genummerde stappen, in plaats van één lange zin.
 * Bij een OK-driver alleen een korte, gedempte regel.
 */
export const DriverAdviceView: React.FC<Props> = ({ status, advice, onOpenDeviceManager }) => {
  const t = useT();
  const tone = TONE[status];

  if (!tone) {
    // OK: alleen een korte notitie (bijv. "Microsoft-standaarddriver ...").
    return (
      <p className="flex items-start gap-2 text-xs text-slate-400 leading-relaxed pt-1">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-blue-400" />
        <span>
          {advice.title}
          {advice.why && <span className="text-slate-500"> {advice.why}</span>}
        </span>
      </p>
    );
  }

  return (
    <div className={cn("rounded-xl border p-3.5 space-y-3", tone.ring)}>
      <div className="flex items-start gap-2.5">
        <Lightbulb className={cn("w-4 h-4 shrink-0 mt-0.5", tone.icon)} />
        <div className="space-y-1 min-w-0">
          <p className="text-sm font-semibold text-slate-100 leading-snug">{advice.title}</p>
          {advice.why && <p className="text-xs text-slate-400 leading-relaxed">{advice.why}</p>}
        </div>
      </div>

      {advice.steps.length > 0 && (
        <div className="space-y-2 pl-6">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{t("drivers.howToFix")}</p>
          <ol className="space-y-2">
            {advice.steps.map((step, i) => (
              <li key={i} className="flex items-start gap-2.5 text-xs text-slate-200 leading-relaxed">
                <span
                  className={cn(
                    "w-5 h-5 shrink-0 rounded-full border text-[11px] font-bold flex items-center justify-center tabular-nums",
                    tone.num,
                  )}
                  aria-hidden
                >
                  {i + 1}
                </span>
                <span className="pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {advice.fallback_steps.length > 0 && (
        <div className="ml-6 pl-3 border-l border-slate-700/80 space-y-1.5">
          {advice.fallback_title && <p className="text-xs font-medium text-slate-300">{advice.fallback_title}</p>}
          <ul className="space-y-1.5">
            {advice.fallback_steps.map((step, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-slate-400 leading-relaxed">
                <CornerDownRight className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-500" />
                <span>{step}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {onOpenDeviceManager && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onOpenDeviceManager}
            className="px-3 py-1.5 rounded-lg bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-300 font-medium text-xs flex items-center gap-1.5 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400"
            title={t("drivers.openInDmTitle")}
          >
            <Wrench className="w-3.5 h-3.5 text-rose-400" />
            {t("drivers.openInDm")}
          </button>
        </div>
      )}
    </div>
  );
};
