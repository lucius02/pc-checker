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
import { useDiagnosticsStore } from "../../store/diagnosticsStore";
import { FREEZE_LOOKBACK_OPTIONS } from "../../lib/freezeLookback";
import { cn } from "../../utils/cn";
import { AdviceCard, type AdviceTone } from "../AdviceCard";
import { api, errorMessage } from "../../lib/api";
import { toast } from "../../store/toastStore";

const SEVERITY_TONE: Record<string, AdviceTone> = { Kritiek: "critical", Hoog: "high", Middel: "medium" };
const SEVERITY_BADGE: Record<string, string> = {
  Kritiek: "bg-rose-950 border-rose-800 text-rose-300",
  Hoog: "bg-orange-950 border-orange-800 text-orange-300",
  Middel: "bg-amber-950 border-amber-800 text-amber-300",
};
import { useT, type MessageKey } from "../../i18n";
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
  const lookbackDays = useDiagnosticsStore((s) => s.freezeLookbackDays);
  const setLookbackDays = useDiagnosticsStore((s) => s.setFreezeLookbackDays);
  const periodLabel = (d: number) => t(`freeze.period.${d}` as MessageKey);
  const openEventViewer = () => {
    api.openEventViewer().catch((err) => toast.error(t("freeze.openEventViewerFailed"), errorMessage(err)));
  };
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

          <div className="flex items-end gap-3">
            <label className="text-xs text-slate-400 flex flex-col gap-1">
              {t("freeze.periodLabel")}
              <select
                value={lookbackDays}
                disabled={isScanningFreeze}
                onChange={(e) => setLookbackDays(Number(e.target.value))}
                className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-2 text-slate-200 cursor-pointer disabled:opacity-50"
              >
                {FREEZE_LOOKBACK_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {periodLabel(d)}
                  </option>
                ))}
              </select>
            </label>
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
                className={cn(
                  "p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-3 text-xs",
                  !culprit.is_recent && "opacity-80",
                )}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2 font-semibold">
                    <span className={cn("px-2 py-0.5 rounded border", SEVERITY_BADGE[culprit.severity] ?? SEVERITY_BADGE.Middel)}>
                      {status(culprit.severity)}
                    </span>
                    <span className="text-slate-100">{culprit.category}</span>
                    {culprit.count > 1 && (
                      <span
                        className="px-1.5 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-slate-200 font-mono"
                        title={t("freeze.countTitle", { n: culprit.count, d: periodLabel(freezeData?.lookback_days ?? lookbackDays).toLowerCase() })}
                      >
                        {t("freeze.count", { n: culprit.count })}
                      </span>
                    )}
                    {!culprit.is_recent && (
                      <span className="px-1.5 py-0.5 rounded-md border border-slate-700 text-slate-400 font-normal" title={t("freeze.olderHint")}>
                        {t("freeze.older")}
                      </span>
                    )}
                  </div>
                  <div className="text-slate-500 sm:text-right shrink-0">
                    <div className="font-mono">{t("freeze.event", { p: culprit.provider, id: culprit.event_id })}</div>
                    <div className="font-mono">
                      {culprit.count > 1 && culprit.first_seen !== culprit.timestamp
                        ? t("freeze.seenRange", { a: culprit.first_seen, b: culprit.timestamp })
                        : t("freeze.seenOnce", { t: culprit.timestamp })}
                    </div>
                  </div>
                </div>

                <AdviceCard
                  tone={SEVERITY_TONE[culprit.severity] ?? "medium"}
                  advice={culprit.advice}
                  action={{ label: t("freeze.openEventViewer"), onClick: openEventViewer }}
                />

                {culprit.message && (
                  <details className="group">
                    <summary className="cursor-pointer text-slate-500 hover:text-slate-300 select-none">{t("freeze.showMessage")}</summary>
                    <p className="mt-2 text-slate-300 font-mono text-xs bg-slate-900/80 p-2.5 rounded-lg border border-slate-800/80 whitespace-pre-wrap break-words">
                      {culprit.message}
                    </p>
                  </details>
                )}
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
