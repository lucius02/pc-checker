import React from "react";
import { Database, RefreshCw, ShieldAlert } from "lucide-react";
import { useT } from "../../i18n";
import { useDiagnosticsStore } from "../../store/diagnosticsStore";
import { formatBytes } from "../../utils/formatters";
import { cn } from "../../utils/cn";
import { useStatusLabel } from "../../i18n/status";
import type { StorageHealthEntry } from "../../types";

const verdictClass = (v: string) =>
  v === "Kritiek"
    ? "border-red-800 bg-red-950/40 text-red-300"
    : v === "Let op"
      ? "border-amber-800 bg-amber-950/40 text-amber-300"
      : "border-emerald-800 bg-emerald-950/40 text-emerald-300";

const DiskCard: React.FC<{ d: StorageHealthEntry }> = ({ d }) => {
  const t = useT();
  const status = useStatusLabel();
  const na = t("storage.unknown");
  const uncorrected =
    d.read_errors_uncorrected == null && d.write_errors_uncorrected == null
      ? null
      : (d.read_errors_uncorrected ?? 0) + (d.write_errors_uncorrected ?? 0);
  const metrics: [string, string][] = [
    [t("storage.size"), d.size_bytes ? formatBytes(d.size_bytes) : na],
    [t("storage.health"), d.health_status],
    [t("storage.wear"), d.wear_percent != null ? `${d.wear_percent}%` : na],
    [t("storage.temp"), d.temperature_celsius != null ? `${d.temperature_celsius} °C` : na],
    [t("storage.hours"), d.power_on_hours != null ? d.power_on_hours.toLocaleString() : na],
    [t("storage.errors"), uncorrected != null ? String(uncorrected) : na],
  ];
  return (
    <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-white truncate">{d.model}</h3>
          <p className="text-xs text-slate-500">
            {d.bus_type} · {d.media_type}
            {d.serial ? ` · ${d.serial}` : ""}
          </p>
        </div>
        <span className={cn("px-2 py-0.5 text-xs font-semibold rounded-full border shrink-0", verdictClass(d.verdict))}>{status(d.verdict)}</span>
      </div>
      <dl className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {metrics.map(([k, v]) => (
          <div key={k} className="bg-slate-950/60 rounded-lg px-3 py-2">
            <dt className="text-[10px] uppercase text-slate-500">{k}</dt>
            <dd className="text-sm font-mono text-slate-200">{v}</dd>
          </div>
        ))}
      </dl>
      {d.wear_percent != null && (
        <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden" aria-hidden>
          <div
            className={cn("h-full", d.wear_percent >= 90 ? "bg-red-500" : d.wear_percent >= 70 ? "bg-amber-500" : "bg-emerald-500")}
            style={{ width: `${Math.min(100, d.wear_percent)}%` }}
          />
        </div>
      )}
      {d.findings.length ? (
        <ul className="text-xs text-slate-300 list-disc pl-5 space-y-1">
          {d.findings.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-500">{t("storage.noFindings")}</p>
      )}
    </div>
  );
};

export const StorageTab: React.FC = () => {
  const t = useT();
  const report = useDiagnosticsStore((s) => s.storageReport);
  const scanning = useDiagnosticsStore((s) => !!s.busy.storage);
  const scan = useDiagnosticsStore((s) => s.scanStorageHealth);
  const canElevate = useDiagnosticsStore((s) => s.elevation?.can_elevate ?? false);
  const restartAsAdmin = useDiagnosticsStore((s) => s.restartAsAdmin);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Database className="w-5 h-5 text-lime-400" /> {t("storage.title")}
          </h2>
          <p className="text-xs text-slate-400 max-w-3xl">{t("storage.intro")}</p>
        </div>
        <button
          type="button"
          onClick={() => void scan()}
          disabled={scanning}
          className="px-4 py-2 rounded-lg bg-lime-500 hover:bg-lime-400 disabled:opacity-60 text-slate-950 text-sm font-semibold flex items-center gap-2 cursor-pointer shrink-0"
        >
          <RefreshCw className={cn("w-4 h-4", scanning && "animate-spin")} />
          {scanning ? t("storage.scanning") : t("storage.scan")}
        </button>
      </div>

      {report && !report.is_elevated && report.is_available && (
        <div className="p-3 rounded-xl border border-amber-900 bg-amber-950/20 text-amber-300 text-xs flex items-center gap-3">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span className="flex-1">{t("storage.adminHint")}</span>
          {canElevate && (
            <button type="button" onClick={() => void restartAsAdmin()} className="underline hover:text-amber-200 cursor-pointer">
              {t("header.restartAdmin")}
            </button>
          )}
        </div>
      )}

      {!report ? (
        <p className="text-sm text-slate-500">{t("storage.notScanned")}</p>
      ) : !report.is_available ? (
        <p className="text-sm text-slate-400">{report.summary || t("storage.unavailable")}</p>
      ) : (
        <>
          <p className="text-sm text-slate-300">{report.summary}</p>
          <div className="grid md:grid-cols-2 gap-4">
            {report.disks.map((d, i) => (
              <DiskCard key={`${d.serial}-${i}`} d={d} />
            ))}
          </div>
        </>
      )}
    </div>
  );
};
