import React from "react";
import { CheckCircle2, Info } from "lucide-react";
import { cn } from "../../../utils/cn";
import { useT } from "../../../i18n";
import { RichText } from "../../../i18n/RichText";

export interface ClickCounters {
  left: number;
  right: number;
  middle: number;
  back: number;
  forward: number;
}

export interface ClickHeld {
  left: boolean;
  right: boolean;
  middle: boolean;
  back: boolean;
  forward: boolean;
}

interface TouchpadButtonsGridProps {
  held: ClickHeld;
  counts: ClickCounters;
}

export const TouchpadButtonsGrid: React.FC<TouchpadButtonsGridProps> = ({
  held,
  counts,
}) => {
  const t = useT();
  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-1">
      {/* Left Button */}
      <div
        className={cn(
          "p-3 rounded-xl border text-center transition-all cursor-pointer font-semibold text-xs",
          held.left
            ? "bg-violet-600 border-violet-400 text-white shadow-lg shadow-violet-500/30 scale-95"
            : "bg-slate-950/80 border-slate-800 text-slate-300 hover:border-slate-700"
        )}
      >
        <span className="block text-slate-400 text-[11px]">{t("tp.lmb")}</span>
        <span className="text-base font-bold font-mono text-violet-400 block mt-0.5">
          {counts.left}x
        </span>
      </div>

      {/* Middle Button */}
      <div
        className={cn(
          "p-3 rounded-xl border text-center transition-all cursor-pointer font-semibold text-xs",
          held.middle
            ? "bg-cyan-600 border-cyan-400 text-white shadow-lg shadow-cyan-500/30 scale-95"
            : "bg-slate-950/80 border-slate-800 text-slate-300 hover:border-slate-700"
        )}
      >
        <span className="block text-slate-400 text-[11px]">{t("tp.mmb")}</span>
        <span className="text-base font-bold font-mono text-cyan-400 block mt-0.5">
          {counts.middle}x
        </span>
      </div>

      {/* Right Button */}
      <div
        className={cn(
          "p-3 rounded-xl border text-center transition-all cursor-pointer font-semibold text-xs",
          held.right
            ? "bg-purple-600 border-purple-400 text-white shadow-lg shadow-purple-500/30 scale-95"
            : "bg-slate-950/80 border-slate-800 text-slate-300 hover:border-slate-700"
        )}
      >
        <span className="block text-slate-400 text-[11px]">{t("tp.rmb")}</span>
        <span className="text-base font-bold font-mono text-purple-400 block mt-0.5">
          {counts.right}x
        </span>
      </div>

      {/* Side Button 1 (Back) */}
      <div
        className={cn(
          "p-3 rounded-xl border text-center transition-all cursor-pointer font-semibold text-xs",
          held.back
            ? "bg-amber-600 border-amber-400 text-white shadow-lg shadow-amber-500/30 scale-95"
            : "bg-slate-950/80 border-slate-800 text-slate-300 hover:border-slate-700"
        )}
      >
        <span className="block text-slate-400 text-[11px]">{t("tp.side1")}</span>
        <span className="text-base font-bold font-mono text-amber-400 block mt-0.5">
          {counts.back}x
        </span>
      </div>

      {/* Side Button 2 (Forward) */}
      <div
        className={cn(
          "p-3 rounded-xl border text-center transition-all cursor-pointer font-semibold text-xs",
          held.forward
            ? "bg-emerald-600 border-emerald-400 text-white shadow-lg shadow-emerald-500/30 scale-95"
            : "bg-slate-950/80 border-slate-800 text-slate-300 hover:border-slate-700"
        )}
      >
        <span className="block text-slate-400 text-[11px]">{t("tp.side2")}</span>
        <span className="text-base font-bold font-mono text-emerald-400 block mt-0.5">
          {counts.forward}x
        </span>
      </div>
    </div>
  );
};

export const TouchpadAdviceCards: React.FC = () => {
  const t = useT();
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
      <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-2">
        <h4 className="font-semibold text-slate-200 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          {t("tp.chatterTitle")}
        </h4>
        <p className="text-slate-400 text-xs leading-relaxed">
          <RichText text={t("tp.chatter")} />
        </p>
      </div>

      <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-2">
        <h4 className="font-semibold text-slate-200 flex items-center gap-2">
          <Info className="w-4 h-4 text-cyan-400" />
          {t("tp.floatTitle")}
        </h4>
        <p className="text-slate-400 text-xs leading-relaxed">
          {t("tp.float")}
        </p>
      </div>
    </div>
  );
};
