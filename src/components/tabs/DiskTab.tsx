import React from "react";
import {
  HardDrive,
  RefreshCw,
  Play,
  CheckCircle2,
  AlertTriangle,
  Info,
  Trash2,
  Layers,
} from "lucide-react";
import { SystemOverview, StressTestResult } from "../../types";
import { formatBytes } from "../../utils/formatters";
import { cn } from "../../utils/cn";
import { useT } from "../../i18n";
import { RichText } from "../../i18n/RichText";
import { DiskSpeedResult } from "./disk/DiskSpeedResult";

interface DiskTabProps {
  data: SystemOverview;
  isTestingDisk: boolean;
  diskSizeMb: number;
  setDiskSizeMb: (mb: number) => void;
  handleDiskBenchmark: () => void;
  diskResult: StressTestResult | null;
}

export const DiskTab: React.FC<DiskTabProps> = ({
  data,
  isTestingDisk,
  diskSizeMb,
  setDiskSizeMb,
  handleDiskBenchmark,
  diskResult,
}) => {
  const t = useT();
  // Vind schijven die vol dreigen te raken (>85% bezet)
  const fullDisks = data.disks.filter((d) => {
    const usedPercent = Math.round(
      ((d.total_bytes - d.available_bytes) / Math.max(1, d.total_bytes)) * 100
    );
    return usedPercent >= 85;
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <HardDrive className="w-5 h-5 text-amber-400" />
              {t("disk.title")}
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              {t("disk.intro")}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-xl p-1 text-xs">
              {[64, 256, 1024].map((mb) => (
                <button
                  key={mb}
                  type="button"
                  onClick={() => setDiskSizeMb(mb)}
                  disabled={isTestingDisk}
                  className={cn(
                    "px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400",
                    diskSizeMb === mb
                      ? "bg-amber-500 text-slate-950 font-bold"
                      : "text-slate-400 hover:text-white"
                  )}
                >
                  {mb} MB
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleDiskBenchmark}
              disabled={isTestingDisk}
              className={cn(
                "px-5 py-2.5 rounded-xl bg-linear-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-bold text-sm shadow-lg shadow-amber-500/20 transition-all flex items-center gap-2 cursor-pointer",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300",
                isTestingDisk && "opacity-50 cursor-not-allowed"
              )}
            >
              {isTestingDisk ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  {t("disk.running")}
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-slate-950" />
                  {t("disk.start")}
                </>
              )}
            </button>
          </div>
        </div>

        {/* Dynamic Alert: Schijf raakt vol (>85%) */}
        {fullDisks.length > 0 && (
          <div className="p-4 bg-amber-950/40 border border-amber-800/90 rounded-xl text-xs text-amber-200 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold text-sm text-amber-300 block">
                {t("disk.fullWarning", { disks: fullDisks.map((d) => d.mount_point || d.name).join(", ") })}
              </span>
              <p className="text-xs text-amber-300/90 leading-relaxed">
                {t("disk.fullBody")}
              </p>
            </div>
          </div>
        )}

        {/* Connected Disks List */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            {t("disk.detected", { n: data.disks.length })}
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {data.disks.map((d, i) => {
              const usedPercent = Math.round(
                ((d.total_bytes - d.available_bytes) / Math.max(1, d.total_bytes)) * 100
              );
              const isCriticallyFull = usedPercent >= 90;
              const isWarningFull = usedPercent >= 80;

              return (
                <div
                  key={i}
                  className={cn(
                    "p-4 bg-slate-950/70 border rounded-xl space-y-3 transition-colors",
                    isCriticallyFull
                      ? "border-rose-800/80 bg-rose-950/10"
                      : isWarningFull
                      ? "border-amber-800/80 bg-amber-950/10"
                      : "border-slate-800"
                  )}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2.5">
                      <HardDrive
                        className={cn(
                          "w-4 h-4",
                          isCriticallyFull
                            ? "text-rose-400"
                            : isWarningFull
                            ? "text-amber-400"
                            : "text-cyan-400"
                        )}
                      />
                      <div>
                        <span className="font-semibold text-slate-200 text-sm">
                          {d.name || d.mount_point}
                        </span>
                        <span className="text-xs text-slate-500 block">
                          {t("disk.mount", { m: d.mount_point, fs: d.file_system })}
                        </span>
                      </div>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-slate-400">
                      {d.disk_type}
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>{t("disk.used", { v: formatBytes(d.total_bytes - d.available_bytes) })}</span>
                      <span>{t("disk.total", { v: formatBytes(d.total_bytes) })}</span>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                      <div
                        className={cn(
                          "h-2 rounded-full transition-all duration-300",
                          isCriticallyFull
                            ? "bg-rose-500"
                            : isWarningFull
                            ? "bg-amber-400"
                            : "bg-cyan-400"
                        )}
                        style={{ width: `${usedPercent}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">
                        {t("disk.usedPct", { p: usedPercent })}
                      </span>
                      <span
                        className={cn(
                          isCriticallyFull
                            ? "text-rose-400 font-bold"
                            : isWarningFull
                            ? "text-amber-400 font-semibold"
                            : "text-emerald-400"
                        )}
                      >
                        {t("disk.free", { v: formatBytes(d.available_bytes), p: 100 - usedPercent })}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Disk Result Box */}
        {diskResult && (
          <div
            className={cn(
              "p-4 rounded-xl border space-y-2",
              diskResult.success
                ? "bg-emerald-950/30 border-emerald-800/80 text-emerald-300"
                : "bg-red-950/30 border-red-800/80 text-red-300"
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold">
                {diskResult.success ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                )}
                <span>{diskResult.test_name} - {diskResult.success ? t("common.passed") : t("common.failed")}</span>
              </div>
              {!diskResult.disk_speeds && (
                <span className="font-mono font-bold text-lg">
                  {diskResult.score_or_speed.toFixed(1)} {diskResult.unit}
                </span>
              )}
            </div>
            {diskResult.disk_speeds && <DiskSpeedResult speeds={diskResult.disk_speeds} />}
            <p className="text-xs opacity-90">{diskResult.details}</p>
          </div>
        )}
      </div>

      {/* Info & Aanbevelingen voor Schijf- en Opslagbeheer */}
      <div className="p-6 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-5">
        <div className="flex items-center gap-2">
          <Info className="w-5 h-5 text-amber-400" />
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
            {t("disk.guideTitle")}
          </h3>
        </div>

        {/* Waarom vrije schijfruimte essentieel is */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
            <h4 className="font-semibold text-slate-200 flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-cyan-400" />
              {t("disk.ssdTitle")}
            </h4>
            <p className="text-slate-400 leading-relaxed text-xs">
              <RichText text={t("disk.ssd1")} />
            </p>
            <p className="text-slate-300 text-xs">
              {t("disk.ssd2")}
            </p>
          </div>

          <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
            <h4 className="font-semibold text-slate-200 flex items-center gap-2">
              <Layers className="w-4 h-4 text-amber-400" />
              {t("disk.cTitle")}
            </h4>
            <p className="text-slate-400 leading-relaxed text-xs">
              <RichText text={t("disk.c1")} />
            </p>
            <p className="text-slate-300 text-xs">
              {t("disk.c2")}
            </p>
          </div>
        </div>

        {/* 4 Concrete Stappen om Onnodige Bestanden te Verwijderen */}
        <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-3 text-xs">
          <div className="flex items-center gap-2 text-amber-300 font-semibold">
            <Trash2 className="w-4 h-4 text-amber-400" />
            <span>{t("disk.stepsTitle")}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-slate-300">
            {/* Stap 1 */}
            <div className="p-3 bg-slate-900/60 rounded-lg border border-slate-800/70 space-y-1">
              <span className="font-medium text-white block">{t("disk.step1Title")}</span>
              <p className="text-xs text-slate-400">
                <RichText text={t("disk.step1")} />
              </p>
            </div>

            {/* Stap 2 */}
            <div className="p-3 bg-slate-900/60 rounded-lg border border-slate-800/70 space-y-1">
              <span className="font-medium text-white block">{t("disk.step2Title")}</span>
              <p className="text-xs text-slate-400">
                <RichText text={t("disk.step2")} />
              </p>
            </div>

            {/* Stap 3 */}
            <div className="p-3 bg-slate-900/60 rounded-lg border border-slate-800/70 space-y-1">
              <span className="font-medium text-white block">{t("disk.step3Title")}</span>
              <p className="text-xs text-slate-400">
                <RichText text={t("disk.step3")} />
              </p>
            </div>

            {/* Stap 4 */}
            <div className="p-3 bg-slate-900/60 rounded-lg border border-slate-800/70 space-y-1">
              <span className="font-medium text-white block">{t("disk.step4Title")}</span>
              <p className="text-xs text-slate-400">
                {t("disk.step4")}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
