import React from "react";
import { Info, Lightbulb, CornerDownRight } from "lucide-react";
import type { Advice } from "../types";
import { useT } from "../i18n";
import { RichText } from "../i18n/RichText";
import { cn } from "../utils/cn";

export type AdviceTone = "critical" | "high" | "medium" | "muted";

const TONE: Record<Exclude<AdviceTone, "muted">, { ring: string; num: string; icon: string }> = {
  critical: { ring: "border-rose-900/60 bg-rose-950/15", num: "bg-rose-500/15 text-rose-300 border-rose-700/70", icon: "text-rose-400" },
  high: { ring: "border-orange-900/60 bg-orange-950/10", num: "bg-orange-500/15 text-orange-300 border-orange-700/70", icon: "text-orange-400" },
  medium: { ring: "border-amber-900/50 bg-amber-950/10", num: "bg-amber-500/15 text-amber-300 border-amber-700/70", icon: "text-amber-400" },
};

export interface AdviceAction {
  label: string;
  title?: string;
  icon?: React.ComponentType<{ className?: string }>;
  onClick: () => void;
}

interface Props {
  advice: Advice;
  tone: AdviceTone;
  action?: AdviceAction;
}

/**
 * Advies als kop + "waarom" + genummerde stappen (+ optioneel vervolgplan), in plaats van één
 * lange zin. Gebruikt door de Driver Check en de Freeze Detective. `muted` = korte notitie.
 * Stappen mogen `code` in backticks bevatten (bijv. `chkdsk C: /f`).
 */
export const AdviceCard: React.FC<Props> = ({ advice, tone, action }) => {
  const t = useT();

  if (tone === "muted") {
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

  const style = TONE[tone];
  const ActionIcon = action?.icon;

  return (
    <div className={cn("rounded-xl border p-3.5 space-y-3", style.ring)}>
      <div className="flex items-start gap-2.5">
        <Lightbulb className={cn("w-4 h-4 shrink-0 mt-0.5", style.icon)} />
        <div className="space-y-1 min-w-0">
          <p className="text-sm font-semibold text-slate-100 leading-snug">{advice.title}</p>
          {advice.why && <p className="text-xs text-slate-400 leading-relaxed">{advice.why}</p>}
        </div>
      </div>

      {advice.steps.length > 0 && (
        <div className="space-y-2 pl-6">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{t("advice.howToFix")}</p>
          <ol className="space-y-2">
            {advice.steps.map((step, i) => (
              <li key={i} className="flex items-start gap-2.5 text-xs text-slate-200 leading-relaxed">
                <span
                  className={cn(
                    "w-5 h-5 shrink-0 rounded-full border text-[11px] font-bold flex items-center justify-center tabular-nums",
                    style.num,
                  )}
                  aria-hidden
                >
                  {i + 1}
                </span>
                <span className="pt-0.5 [&_code]:px-1 [&_code]:rounded [&_code]:bg-slate-800 [&_code]:text-slate-100">
                  <RichText text={step} />
                </span>
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
                <span className="[&_code]:px-1 [&_code]:rounded [&_code]:bg-slate-800 [&_code]:text-slate-200">
                  <RichText text={step} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {action && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={action.onClick}
            title={action.title}
            className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-medium text-xs flex items-center gap-1.5 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-300"
          >
            {ActionIcon && <ActionIcon className="w-3.5 h-3.5" />}
            {action.label}
          </button>
        </div>
      )}
    </div>
  );
};
