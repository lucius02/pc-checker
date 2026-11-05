import React, { useState } from "react";
import { Cpu, Play, ShieldAlert, AlertTriangle } from "lucide-react";
import { useT } from "../../../i18n";
import { useDiagnosticsStore } from "../../../store/diagnosticsStore";
import { useStatusLabel } from "../../../i18n/status";
import { cn } from "../../../utils/cn";
import { AdviceCard } from "../../AdviceCard";

const DURATIONS = [10, 30, 60];

const verdictClass = (v: string) =>
  v === "Slecht"
    ? "border-red-800 bg-red-950/40 text-red-300"
    : v === "Matig"
      ? "border-amber-800 bg-amber-950/40 text-amber-300"
      : v === "Goed"
        ? "border-emerald-800 bg-emerald-950/40 text-emerald-300"
        : "border-slate-700 bg-slate-900 text-slate-400";

/** Kleur per uitvoertijd: groen < 500 µs (DPC) / 100 µs (ISR), rood boven de "slecht"-grens. */
const usClass = (us: number, warn: number, bad: number) =>
  us >= bad ? "text-red-400" : us >= warn ? "text-amber-300" : "text-slate-200";

/**
 * Per-driver DPC/ISR-meting via ETW: laat zien wélke driver de latency veroorzaakt, waar de
 * gewone latency-test alleen het totaal meet.
 */
export const DriverLatencySection: React.FC = () => {
  const t = useT();
  const status = useStatusLabel();
  const [duration, setDuration] = useState(30);
  const report = useDiagnosticsStore((s) => s.driverLatency);
  const running = useDiagnosticsStore((s) => !!s.busy.driverLatency);
  const runTrace = useDiagnosticsStore((s) => s.runDriverLatencyTrace);
  const elevation = useDiagnosticsStore((s) => s.elevation);
  const restartAsAdmin = useDiagnosticsStore((s) => s.restartAsAdmin);
  const needsAdmin = elevation ? !elevation.is_elevated : false;

  return (
    <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-4">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-white flex items-center gap-2">
            <Cpu className="w-4 h-4 text-orange-400" /> {t("driverLatency.title")}
          </h3>
          <p className="text-xs text-slate-400 max-w-3xl">{t("driverLatency.intro")}</p>
        </div>
        <div className="flex items-end gap-2 shrink-0">
          <label className="text-xs text-slate-400 flex flex-col gap-1">
            {t("driverLatency.duration")}
            <select
              value={duration}
              disabled={running}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-200"
            >
              {DURATIONS.map((d) => (
                <option key={d} value={d}>
                  {d} s
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void runTrace(duration)}
            disabled={running || needsAdmin}
            className="px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-slate-950 text-sm font-semibold flex items-center gap-2 cursor-pointer"
          >
            <Play className="w-4 h-4" />
            {running ? t("driverLatency.running") : t("driverLatency.start")}
          </button>
        </div>
      </div>

      {needsAdmin && (
        <div className="p-3 rounded-xl border border-amber-900 bg-amber-950/20 text-amber-300 text-xs flex items-center gap-3">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span className="flex-1">{t("driverLatency.needsAdmin")}</span>
          {elevation?.can_elevate && (
            <button type="button" onClick={() => void restartAsAdmin()} className="underline hover:text-amber-200 cursor-pointer">
              {t("header.restartAdmin")}
            </button>
          )}
        </div>
      )}

      {running && <p className="text-xs text-slate-400 animate-pulse">{t("driverLatency.runningHint", { s: duration })}</p>}

      {report && (
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <span className={cn("px-2 py-0.5 text-xs font-semibold rounded-full border shrink-0", verdictClass(report.verdict))}>
              {status(report.verdict)}
            </span>
            <p className="text-sm text-slate-300">{report.summary}</p>
          </div>
          {report.error && <p className="text-xs text-red-400 font-mono">{report.error}</p>}
          {report.fix && <AdviceCard tone={report.verdict === "Slecht" ? "critical" : "medium"} advice={report.fix} />}
          {report.events_lost > 0 && (
            <p className="text-xs text-amber-300 flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5" /> {t("driverLatency.eventsLost", { n: report.events_lost })}
            </p>
          )}

          {report.is_available && report.drivers.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-slate-500 text-left">
                  <tr>
                    <th className="py-1.5 pr-3">{t("driverLatency.driver")}</th>
                    <th className="pr-3 text-right">{t("driverLatency.dpcMax")}</th>
                    <th className="pr-3 text-right">{t("driverLatency.dpcCount")}</th>
                    <th className="pr-3 text-right">{t("driverLatency.isrMax")}</th>
                    <th className="pr-3 text-right">{t("driverLatency.isrCount")}</th>
                    <th className="text-right">{t("driverLatency.totalMs")}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.drivers.map((d) => (
                    <tr key={d.driver} className="border-t border-slate-800">
                      <td className="py-1.5 pr-3">
                        <div className="font-mono text-slate-200">{d.driver}</div>
                        {d.description && <div className="text-slate-500">{d.description}</div>}
                      </td>
                      <td className={cn("pr-3 text-right font-mono", usClass(d.dpc_max_us, 500, 2000))}>
                        {d.dpc_count ? d.dpc_max_us.toFixed(0) : "–"}
                      </td>
                      <td className="pr-3 text-right font-mono text-slate-400">{d.dpc_count.toLocaleString()}</td>
                      <td className={cn("pr-3 text-right font-mono", usClass(d.isr_max_us, 100, 500))}>
                        {d.isr_count ? d.isr_max_us.toFixed(0) : "–"}
                      </td>
                      <td className="pr-3 text-right font-mono text-slate-400">{d.isr_count.toLocaleString()}</td>
                      <td className="text-right font-mono text-slate-400">{(d.dpc_total_ms + d.isr_total_ms).toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[11px] text-slate-500 mt-2">{t("driverLatency.legend")}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
