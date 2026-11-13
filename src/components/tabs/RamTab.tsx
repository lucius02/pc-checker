import React from "react";
import {
  Zap,
  RefreshCw,
  Play,
  CheckCircle2,
  AlertTriangle,
  Info,
  ShieldAlert,
  Sparkles,
  Layers,
} from "lucide-react";
import { SystemOverview, StressTestResult } from "../../types";
import { formatBytes } from "../../utils/formatters";
import { cn } from "../../utils/cn";
import { useT } from "../../i18n";
import { RichText } from "../../i18n/RichText";

interface RamTabProps {
  data: SystemOverview;
  isTestingRam: boolean;
  ramSizeMb: number;
  setRamSizeMb: (mb: number) => void;
  handleRamStress: () => void;
  ramResult: StressTestResult | null;
}

export const RamTab: React.FC<RamTabProps> = ({
  data,
  isTestingRam,
  ramSizeMb,
  setRamSizeMb,
  handleRamStress,
  ramResult,
}) => {
  const t = useT();
  const ramUsagePercent = Math.min(
    100,
    Math.round((data.ram.used_bytes / Math.max(1, data.ram.total_bytes)) * 100)
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Zap className="w-5 h-5 text-purple-400" />
              {t("ram.title")}
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              {t("ram.intro")}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-xl p-1 text-xs">
              {[256, 1024, 4096].map((mb) => (
                <button
                  key={mb}
                  type="button"
                  onClick={() => setRamSizeMb(mb)}
                  disabled={isTestingRam}
                  className={cn(
                    "px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-400",
                    ramSizeMb === mb
                      ? "bg-purple-500 text-slate-950 font-bold"
                      : "text-slate-400 hover:text-white"
                  )}
                >
                  {mb} MB
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleRamStress}
              disabled={isTestingRam}
              className={cn(
                "px-5 py-2.5 rounded-xl bg-linear-to-r from-purple-500 to-indigo-600 hover:from-purple-400 hover:to-indigo-500 text-slate-950 font-bold text-sm shadow-lg shadow-purple-500/20 transition-all flex items-center gap-2 cursor-pointer",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-300",
                isTestingRam && "opacity-50 cursor-not-allowed"
              )}
            >
              {isTestingRam ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  {t("ram.running")}
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-slate-950" />
                  {t("ram.start")}
                </>
              )}
            </button>
          </div>
        </div>

        {/* RAM Breakdown Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl">
            <span className="text-slate-400 block mb-1">{t("ram.total")}</span>
            <span className="text-lg font-bold text-slate-200">
              {formatBytes(data.ram.total_bytes)}
            </span>
          </div>
          <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl">
            <span className="text-slate-400 block mb-1">{t("ram.used")}</span>
            <span className="text-lg font-bold text-purple-400">
              {formatBytes(data.ram.used_bytes)} ({ramUsagePercent}%)
            </span>
          </div>
          <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl">
            <span className="text-slate-400 block mb-1">{t("ram.free")}</span>
            <span className="text-lg font-bold text-emerald-400">
              {formatBytes(data.ram.free_bytes)}
            </span>
          </div>
        </div>

        {/* RAM Result Box */}
        {ramResult && (
          <div
            className={cn(
              "p-4 rounded-xl border space-y-2",
              ramResult.success
                ? "bg-emerald-950/30 border-emerald-800/80 text-emerald-300"
                : "bg-red-950/30 border-red-800/80 text-red-300"
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold">
                {ramResult.success ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                )}
                <span>{ramResult.test_name} - {ramResult.success ? t("common.passed") : t("common.failed")}</span>
              </div>
              <span className="font-mono font-bold text-lg">
                {ramResult.score_or_speed.toFixed(1)} {ramResult.unit}
              </span>
            </div>
            <p className="text-xs opacity-90">{ramResult.details}</p>
          </div>
        )}
      </div>

      {/* Info & Aanbevelingen Blok voor Werkgeheugen */}
      <div className="p-6 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-5">
        <div className="flex items-center gap-2">
          <Info className="w-5 h-5 text-purple-400" />
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
            {t("ram.guideTitle")}
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          {/* Wat is een normaal RAM-gebruik? */}
          <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
            <h4 className="font-semibold text-slate-200 flex items-center gap-2">
              <Layers className="w-4 h-4 text-purple-400" />
              {t("ram.normalTitle")}
            </h4>
            <p className="text-slate-400 text-xs leading-relaxed">
              <RichText text={t("ram.normal1")} />
            </p>
            <p className="text-slate-300 text-xs">
              <RichText text={t("ram.normal2")} />
            </p>
          </div>

          {/* Waarom zijn 0 bit-flips vereist? */}
          <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
            <h4 className="font-semibold text-slate-200 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-400" />
              {t("ram.flipTitle")}
            </h4>
            <p className="text-slate-400 text-xs leading-relaxed">
              {t("ram.flip1")}
            </p>
            <p className="text-slate-300 text-xs">
              <RichText text={t("ram.flip2")} />
            </p>
          </div>
        </div>

        {/* Concrete Tips & Aanbevelingen */}
        <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-3 text-xs">
          <div className="flex items-center gap-2 text-purple-300 font-semibold">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span>{t("ram.recTitle")}</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-slate-300">
            <div className="p-3 bg-slate-900/60 rounded-lg border border-slate-800/70 space-y-1">
              <span className="font-medium text-white block">{t("ram.rec1Title")}</span>
              <p className="text-xs text-slate-400">
                {t("ram.rec1")}
              </p>
            </div>

            <div className="p-3 bg-slate-900/60 rounded-lg border border-slate-800/70 space-y-1">
              <span className="font-medium text-white block">{t("ram.rec2Title")}</span>
              <p className="text-xs text-slate-400">
                {t("ram.rec2")}
              </p>
            </div>

            <div className="p-3 bg-slate-900/60 rounded-lg border border-slate-800/70 space-y-1">
              <span className="font-medium text-white block">{t("ram.rec3Title")}</span>
              <p className="text-xs text-slate-400">
                {t("ram.rec3")}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
