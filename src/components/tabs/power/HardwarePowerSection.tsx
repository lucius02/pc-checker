import React from "react";
import {
  Zap,
  Cpu,
  Monitor,
  Usb,
  HardDrive,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ShieldCheck,
  RefreshCw,
  Play,
  Lightbulb,
} from "lucide-react";
import { HardwarePowerCheckReport } from "../../../types";
import { cn } from "../../../utils/cn";

interface HardwarePowerSectionProps {
  report: HardwarePowerCheckReport | null;
  isTesting: boolean;
  onRunTest: () => void;
}

export const HardwarePowerSection: React.FC<HardwarePowerSectionProps> = ({
  report,
  isTesting,
  onRunTest,
}) => {
  const getIconForComponent = (name: string) => {
    if (name.includes("Processor") || name.includes("CPU")) {
      return <Cpu className="w-4 h-4 text-cyan-400" />;
    }
    if (name.includes("Grafische") || name.includes("GPU")) {
      return <Monitor className="w-4 h-4 text-purple-400" />;
    }
    if (name.includes("USB")) {
      return <Usb className="w-4 h-4 text-blue-400" />;
    }
    if (name.includes("Opslag") || name.includes("SSD")) {
      return <HardDrive className="w-4 h-4 text-amber-400" />;
    }
    return <Zap className="w-4 h-4 text-emerald-400" />;
  };

  return (
    <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="p-2.5 rounded-xl bg-amber-950 border border-amber-800 text-amber-400 shadow-sm">
            <Zap className="w-6 h-6" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-white">Hardware Stroomvoorziening &amp; Voedingscontrole</h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-950/80 border border-amber-700/60 text-amber-300">
                Component Test
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Controleert of processor, videokaart, USB-poorten, NVMe-schijven en adapter voldoende en stabiele stroom ontvangen zonder spanningsdips.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onRunTest}
          disabled={isTesting}
          aria-label={isTesting ? "Hardware stroomtoevoer testen..." : "Start test of componenten genoeg stroom krijgen"}
          className={cn(
            "px-4 py-2.5 rounded-xl font-bold text-xs shadow-lg transition-all flex items-center gap-2 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2",
            "bg-linear-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 shadow-amber-500/20 focus-visible:outline-amber-300",
            isTesting && "opacity-50 cursor-not-allowed"
          )}
        >
          {isTesting ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              Stroomtoevoer Meten...
            </>
          ) : (
            <>
              <Play className="w-4 h-4 fill-slate-950" />
              Test Hardware Stroomtoevoer
            </>
          )}
        </button>
      </div>

      {report ? (
        <div className="space-y-5 animate-in fade-in duration-200">
          {/* Top Overall Verdict Card */}
          <div className={cn(
            "p-5 rounded-2xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-4",
            report.is_sufficient
              ? "bg-emerald-950/30 border-emerald-800/80"
              : "bg-rose-950/30 border-rose-800/80"
          )}>
            <div className="flex items-center gap-3.5">
              <span className={cn(
                "p-3 rounded-xl border",
                report.is_sufficient
                  ? "bg-emerald-950 border-emerald-700 text-emerald-400"
                  : "bg-rose-950 border-rose-700 text-rose-400"
              )}>
                {report.is_sufficient ? (
                  <CheckCircle2 className="w-6 h-6" />
                ) : (
                  <AlertTriangle className="w-6 h-6" />
                )}
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-base font-bold text-white">
                    {report.is_sufficient
                      ? "Alle componenten krijgen voldoende stroom"
                      : "Stroombeperking of spanningsafwijking vastgesteld"}
                  </h4>
                  <span className={cn(
                    "px-2.5 py-0.5 rounded-full text-xs font-mono font-bold border",
                    report.is_sufficient
                      ? "bg-emerald-950 border-emerald-700 text-emerald-300"
                      : "bg-rose-950 border-rose-700 text-rose-300"
                  )}>
                    Score: {report.score}/100
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
                  {report.summary}
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row md:flex-col items-start md:items-end gap-1.5 text-xs">
              <span className="text-slate-400">Voedingsbron:</span>
              <span className="font-semibold text-slate-200 bg-slate-900/90 px-3 py-1 rounded-lg border border-slate-800">
                {report.psu_or_adapter_verdict}
              </span>
            </div>
          </div>

          {/* 5 Component Diagnostic Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {report.checks.map((check) => {
              const isOk = check.status === "OK";
              const isWarning = check.status === "Waarschuwing";
              return (
                <div
                  key={check.name}
                  className={cn(
                    "p-4 rounded-xl border transition-all space-y-2.5",
                    isOk
                      ? "bg-slate-950/70 border-slate-800/90"
                      : isWarning
                      ? "bg-amber-950/20 border-amber-800/80"
                      : "bg-rose-950/20 border-rose-800/80"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {getIconForComponent(check.name)}
                      <span className="text-xs font-bold text-white truncate max-w-[180px]">
                        {check.name}
                      </span>
                    </div>
                    <span
                      className={cn(
                        "px-2 py-0.5 rounded-md text-[10px] font-bold border flex items-center gap-1",
                        isOk
                          ? "bg-emerald-950/90 border-emerald-700 text-emerald-300"
                          : isWarning
                          ? "bg-amber-950/90 border-amber-700 text-amber-300"
                          : "bg-rose-950/90 border-rose-700 text-rose-300"
                      )}
                    >
                      {isOk ? (
                        <ShieldCheck className="w-3 h-3 text-emerald-400" />
                      ) : isWarning ? (
                        <AlertTriangle className="w-3 h-3 text-amber-400" />
                      ) : (
                        <XCircle className="w-3 h-3 text-rose-400" />
                      )}
                      {check.status}
                    </span>
                  </div>

                  <div className="text-[11px] font-mono text-slate-300 bg-slate-900/80 p-2 rounded-lg border border-slate-800/70 truncate">
                    {check.metric}
                  </div>

                  <p className="text-xs text-slate-400 leading-relaxed">
                    {check.details}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Recommendations Box */}
          {report.recommendations && report.recommendations.length > 0 && (
            <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2 text-xs">
              <div className="flex items-center gap-2 text-amber-300 font-semibold">
                <Lightbulb className="w-4 h-4 text-amber-400" />
                <span>Voedingsaanbevelingen &amp; Technische Analyse:</span>
              </div>
              <ul className="space-y-1.5 pl-6 list-disc text-slate-300">
                {report.recommendations.map((rec, idx) => (
                  <li key={idx}>{rec}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <div className="p-6 rounded-xl bg-slate-950/60 border border-slate-800 text-center space-y-2">
          <p className="text-xs text-slate-400">
            Nog geen hardware vermogenscontrole uitgevoerd. Klik hierboven op &lsquo;Test Hardware Stroomtoevoer&rsquo; om te controleren of alle onderdelen (CPU, GPU, USB, NVMe) voldoende spanning ontvangen.
          </p>
        </div>
      )}
    </div>
  );
};
