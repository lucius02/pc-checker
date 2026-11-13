import React from "react";
import { HelpCircle, XCircle, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import type { LatencyTestResult } from "../../../types";
import { useT } from "../../../i18n";
import { AdviceCard, type AdviceTone } from "../../AdviceCard";
import { cn } from "../../../utils/cn";

const FINDING_STYLE: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string; border: string }> = {
  Slecht: { icon: XCircle, color: "text-rose-400", border: "border-rose-900/60" },
  Matig: { icon: AlertTriangle, color: "text-amber-400", border: "border-amber-900/50" },
  Goed: { icon: CheckCircle2, color: "text-emerald-400", border: "border-emerald-900/50" },
  Info: { icon: Info, color: "text-slate-400", border: "border-slate-800" },
};

const VERDICT_TONE: Record<string, AdviceTone> = { Slecht: "critical", Matig: "medium", Goed: "muted" };

/**
 * "Waarom dit resultaat?": de gemeten waarden tegenover de grenzen, met wat dat betekent,
 * gevolgd door een stappenplan dat bij die bevindingen past.
 */
export const LatencyExplanation: React.FC<{ result: LatencyTestResult }> = ({ result }) => {
  const t = useT();
  if (result.reasons.length === 0) return null;

  return (
    <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-4">
      <div>
        <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-cyan-400" />
          {t("latency.whyTitle")}
        </h3>
        <p className="text-xs text-slate-400 mt-0.5">{t("latency.whyIntro")}</p>
      </div>

      <ul className="space-y-2">
        {result.reasons.map((r, i) => {
          const st = FINDING_STYLE[r.severity] ?? FINDING_STYLE.Info;
          const Icon = st.icon;
          return (
            <li key={i} className={cn("p-3 rounded-xl border bg-slate-950/60 flex items-start gap-3", st.border)}>
              <Icon className={cn("w-4 h-4 shrink-0 mt-0.5", st.color)} />
              <div className="space-y-0.5 min-w-0">
                <p className="text-sm font-medium text-slate-100 leading-snug">{r.title}</p>
                <p className="text-xs text-slate-400 leading-relaxed">{r.detail}</p>
              </div>
            </li>
          );
        })}
      </ul>

      <AdviceCard tone={VERDICT_TONE[result.verdict] ?? "medium"} advice={result.fix} />
    </div>
  );
};
