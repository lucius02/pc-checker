import React from "react";
import {
  ShieldAlert,
  Search,
  Activity,
  AlertTriangle,
  CheckCircle,
  HelpCircle,
} from "lucide-react";
import { FreezeDiagnosticReport } from "../../types";
import { cn } from "../../utils/cn";
import { useT } from "../../i18n";
import { RichText } from "../../i18n/RichText";
import { useStatusLabel } from "../../i18n/status";

interface FreezeTabProps {
  freezeData: FreezeDiagnosticReport | null;
  isScanningFreeze: boolean;
  scanFreezeDiagnostic: () => void;
}

export const FreezeTab: React.FC<FreezeTabProps> = ({
  freezeData,
  isScanningFreeze,
  scanFreezeDiagnostic,
}) => {
  const t = useT();
  const status = useStatusLabel();
  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="p-6 bg-linear-to-r from-rose-950/40 via-slate-900/80 to-slate-900 border border-rose-900/50 rounded-2xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-rose-950 border border-rose-800 text-rose-400">
                <ShieldAlert className="w-6 h-6" />
              </span>
              <div>
                <h2 className="text-lg font-bold text-white">
                  {t("freeze.title")}
                </h2>
                <p className="text-xs text-slate-300">
                  {t("freeze.intro")}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={scanFreezeDiagnostic}
              disabled={isScanningFreeze}
              className={cn(
                "px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs flex items-center gap-2 shadow-lg shadow-rose-600/20 transition-all cursor-pointer",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-300",
                isScanningFreeze && "opacity-50 cursor-not-allowed"
              )}
            >
              <Search className={cn("w-4 h-4", isScanningFreeze && "animate-spin")} />
              {isScanningFreeze ? t("freeze.scanning") : t("freeze.rescan")}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 p-3 bg-slate-950/80 border border-slate-800 rounded-xl text-xs">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-semibold text-emerald-400">
              {t("freeze.watchdogActive")}
            </span>
          </div>
          <span className="text-slate-600">•</span>
          <span className="text-slate-400">
            {t("freeze.watchdogText")}
          </span>
        </div>
      </div>

      {/* Live Watchdog Incidents Box */}
      <div className="p-5 bg-slate-900/70 border border-slate-800 rounded-2xl space-y-3">
        <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
          <Activity className="w-4 h-4 text-rose-400" />
          {t("freeze.liveTitle")}
        </h3>
        {freezeData && freezeData.watchdog_freezes_detected.length > 0 ? (
          <div className="space-y-2">
            {freezeData.watchdog_freezes_detected.map((alert, idx) => (
              <div
                key={idx}
                className="p-3 bg-rose-950/40 border border-rose-800/80 rounded-xl text-xs text-rose-300 font-mono flex items-center gap-2"
              >
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{alert}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-4 bg-slate-950/50 rounded-xl border border-slate-800/80 text-xs text-slate-400 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            <span>
              {t("freeze.noLive")}
            </span>
          </div>
        )}
      </div>

      {/* Event Log Findings */}
      <div className="p-5 bg-slate-900/70 border border-slate-800 rounded-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <Search className="w-4 h-4 text-cyan-400" />
              {t("freeze.logTitle")}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {freezeData?.diagnosis_summary}
            </p>
          </div>

          {freezeData && (
            <span
              className={cn(
                "px-3 py-1 text-xs font-bold rounded-lg border",
                freezeData.system_freeze_risk === "Hoog"
                  ? "bg-rose-950 border-rose-800 text-rose-400"
                  : freezeData.system_freeze_risk === "Middel"
                  ? "bg-amber-950 border-amber-800 text-amber-400"
                  : "bg-emerald-950 border-emerald-800 text-emerald-400"
              )}
            >
              {t("freeze.risk", { r: status(freezeData.system_freeze_risk) })}
            </span>
          )}
        </div>

        {freezeData && freezeData.event_log_culprits.length > 0 ? (
          <div className="space-y-3">
            {freezeData.event_log_culprits.map((culprit, idx) => (
              <div
                key={idx}
                className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2 text-xs"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-semibold">
                    <span className="px-2 py-0.5 rounded bg-rose-950 border border-rose-800 text-rose-400">
                      {culprit.category}
                    </span>
                    <span className="text-slate-200">{t("freeze.event", { p: culprit.provider, id: culprit.event_id })}</span>
                  </div>
                  <span className="text-slate-500 font-mono">{culprit.timestamp}</span>
                </div>
                <p className="text-slate-300 font-mono text-xs bg-slate-900/80 p-2.5 rounded-lg border border-slate-800/80">
                  {culprit.message}
                </p>
                <div className="p-2.5 bg-cyan-950/30 border border-cyan-800/60 rounded-lg text-cyan-300">
                  <RichText text={t("freeze.action", { s: culprit.suggestion })} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-4 bg-slate-950/50 rounded-xl border border-slate-800/80 text-xs text-slate-400 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            <span>
              {t("freeze.noCulprits")}
            </span>
          </div>
        )}
      </div>

      {/* Stappenplan */}
      <div className="p-5 bg-slate-900/50 border border-slate-800 rounded-2xl space-y-4">
        <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-cyan-400" />
          {t("freeze.solutionsTitle")}
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-1.5">
            <h4 className="font-semibold text-amber-400">{t("freeze.s1Title")}</h4>
            <p className="text-slate-300">
              {t("freeze.s1")}
            </p>
            <p className="text-slate-400 text-xs">
              <RichText text={t("freeze.s1Fix")} />
            </p>
          </div>

          <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-1.5">
            <h4 className="font-semibold text-cyan-400">{t("freeze.s2Title")}</h4>
            <p className="text-slate-300">
              {t("freeze.s2")}
            </p>
            <p className="text-slate-400 text-xs">
              <RichText text={t("freeze.s2Fix")} />
            </p>
          </div>

          <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-1.5">
            <h4 className="font-semibold text-rose-400">{t("freeze.s3Title")}</h4>
            <p className="text-slate-300">
              {t("freeze.s3")}
            </p>
            <p className="text-slate-400 text-xs">
              <RichText text={t("freeze.s3Fix")} />
            </p>
          </div>

          <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-1.5">
            <h4 className="font-semibold text-purple-400">{t("freeze.s4Title")}</h4>
            <p className="text-slate-300">
              {t("freeze.s4")}
            </p>
            <p className="text-slate-400 text-xs">
              <RichText text={t("freeze.s4Fix")} />
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
