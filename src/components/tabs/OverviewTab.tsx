import React from "react";
import {
  Layers,
  Clock,
  Info,
  Monitor,
  Cpu,
  Zap,
  HardDrive,
  Laptop,
  PcCase,
  Fan,
  Sparkles,
  RefreshCw,
} from "lucide-react";
import {
  SystemOverview,
  PowerInfo,
  CoolingOverview,
  FreezeDiagnosticReport,
  BatteryHealthReport,
  StressTestResult,
  DriverReport,
  LatencyTestResult,
  TabType,
} from "../../types";
import { formatBytes, formatUptime } from "../../utils/formatters";
import { cn } from "../../utils/cn";
import { useT } from "../../i18n";
import { OverviewCardsGrid } from "./overview/OverviewCardsGrid";
import { HealthScoreCard } from "./overview/HealthScoreCard";
import { LiveVitals } from "./overview/LiveVitals";

interface OverviewTabProps {
  data: SystemOverview;
  powerData: PowerInfo | null;
  coolingData: CoolingOverview | null;
  freezeData: FreezeDiagnosticReport | null;
  batteryReport: BatteryHealthReport | null;
  driverReport: DriverReport | null;
  latencyResult: LatencyTestResult | null;
  cpuResult: StressTestResult | null;
  ramResult: StressTestResult | null;
  diskResult: StressTestResult | null;
  setActiveTab: (tab: TabType) => void;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  data,
  powerData,
  coolingData,
  freezeData,
  batteryReport,
  driverReport,
  latencyResult,
  cpuResult,
  ramResult,
  diskResult,
  setActiveTab,
}) => {
  const t = useT();
  const totalDiskBytes = data.disks.reduce((acc, d) => acc + d.total_bytes, 0);
  const primaryGpu = data.gpus[0];

  const fullDisks = data.disks.filter((d) => {
    const usedPercent = Math.round(
      ((d.total_bytes - d.available_bytes) / Math.max(1, d.total_bytes)) * 100
    );
    return usedPercent >= 85;
  });

  const isLongKernelUptime = data.kernel_uptime_secs > 86400 * 7; // Meer dan 7 dagen

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header Title with Quick Subtitle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-cyan-400" />
            {t("ov.title")}
          </h2>
          <p className="text-xs text-slate-400">
            {t("ov.intro")}
          </p>
        </div>
      </div>

      <HealthScoreCard
        data={data}
        coolingData={coolingData}
        freezeData={freezeData}
        batteryReport={batteryReport}
        driverReport={driverReport}
        latencyResult={latencyResult}
        cpuResult={cpuResult}
        ramResult={ramResult}
        diskResult={diskResult}
        setActiveTab={setActiveTab}
      />

      <LiveVitals onOpen={setActiveTab} />

      <OverviewCardsGrid setActiveTab={setActiveTab} />

      {/* Systeem Uptime & Sessie Info Box */}
      <div className="p-5 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
            <Clock className="w-4 h-4 text-cyan-400" />
            <span>{t("ov.sessionTitle")}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="p-4 bg-slate-950/80 rounded-xl border border-cyan-800/50 space-y-1">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-cyan-400 uppercase tracking-wider text-xs">
                {t("ov.currentSession")}
              </span>
              <span className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 font-mono text-xs border border-cyan-800">
                {data.session_started_at}
              </span>
            </div>
            <div className="text-2xl font-bold font-mono text-white">
              {formatUptime(data.session_uptime_secs)}
            </div>
            <p className="text-slate-400 text-xs">
              {t("ov.sessionHint")}
            </p>
          </div>

          <div className="p-4 bg-slate-950/80 rounded-xl border border-slate-800 space-y-1">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-slate-400 uppercase tracking-wider text-xs">
                {t("ov.kernelUptime")}
              </span>
              <span className="px-2 py-0.5 rounded bg-slate-900 text-slate-400 font-mono text-xs border border-slate-800">
                {t("ov.sinceRestart")}
              </span>
            </div>
            <div className="text-2xl font-bold font-mono text-slate-300">
              {formatUptime(data.kernel_uptime_secs)}
            </div>
            <p className="text-slate-400 text-xs flex items-center gap-1">
              <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>
                {t("ov.fastStartup")}
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* Volledige Hardware Systeemspecificaties & Apparaatprofiel */}
      <div className="p-5 bg-slate-900/60 border border-slate-800/80 rounded-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
            <Monitor className="w-4 h-4 text-cyan-400" />
            <span>{t("ov.specsTitle")}</span>
          </div>
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 flex items-center gap-1">
            {powerData?.is_laptop ? (
              <>
                <Laptop className="w-3 h-3 text-cyan-400" /> Laptop
              </>
            ) : (
              <>
                <PcCase className="w-3 h-3 text-cyan-400" /> {t("ov.desktop")}
              </>
            )}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 text-xs">
          {/* Processor (CPU) */}
          <div className="p-3.5 bg-slate-950/70 rounded-xl border border-slate-800/80 space-y-1">
            <div className="flex items-center gap-1.5 text-slate-400 text-xs">
              <Cpu className="w-3.5 h-3.5 text-cyan-400" />
              <span>{t("ov.cpu")}</span>
            </div>
            <div className="font-semibold text-slate-100 truncate" title={data.cpu.brand}>
              {data.cpu.brand}
            </div>
            <div className="text-xs text-slate-400">
              {t("ov.cpuCores", { p: data.cpu.physical_cores, l: data.cpu.logical_cores, v: data.cpu.vendor_id || "x86_64" })}
            </div>
          </div>

          {/* Videokaart (GPU) */}
          <div className="p-3.5 bg-slate-950/70 rounded-xl border border-slate-800/80 space-y-1">
            <div className="flex items-center gap-1.5 text-slate-400 text-xs">
              <Monitor className="w-3.5 h-3.5 text-indigo-400" />
              <span>{t("ov.gpu")}</span>
            </div>
            <div className="font-semibold text-slate-100 truncate" title={primaryGpu?.name || t("ov.gpuAdapter")}>
              {primaryGpu?.name || t("ov.gpuDefault")}
            </div>
            <div className="text-xs text-slate-400 truncate">
              {primaryGpu?.driver_version ? t("ov.gpuDriver", { v: primaryGpu.driver_version }) : t("ov.gpuDriverDefault")}
              {primaryGpu?.vram_bytes ? ` • ${formatBytes(primaryGpu.vram_bytes)}` : ""}
            </div>
          </div>

          {/* Moederbord */}
          <div className="p-3.5 bg-slate-950/70 rounded-xl border border-slate-800/80 space-y-1">
            <div className="flex items-center gap-1.5 text-slate-400 text-xs">
              <Layers className="w-3.5 h-3.5 text-amber-400" />
              <span>{t("ov.board")}</span>
            </div>
            <div className="font-semibold text-slate-100 truncate" title={`${data.motherboard.manufacturer} ${data.motherboard.product}`}>
              {data.motherboard.manufacturer}
            </div>
            <div className="text-xs text-slate-400 truncate">
              {t("ov.model", { v: data.motherboard.product })}
            </div>
          </div>

          {/* BIOS / UEFI */}
          <div className="p-3.5 bg-slate-950/70 rounded-xl border border-slate-800/80 space-y-1">
            <div className="flex items-center gap-1.5 text-slate-400 text-xs">
              <Info className="w-3.5 h-3.5 text-blue-400" />
              <span>{t("ov.bios")}</span>
            </div>
            <div className="font-semibold text-slate-100 truncate" title={data.motherboard.bios_vendor}>
              {data.motherboard.bios_vendor}
            </div>
            <div className="text-xs text-slate-400 truncate">
              {t("ov.version", { v: data.motherboard.bios_version })}
            </div>
          </div>

          {/* Werkgeheugen (RAM) */}
          <div className="p-3.5 bg-slate-950/70 rounded-xl border border-slate-800/80 space-y-1">
            <div className="flex items-center gap-1.5 text-slate-400 text-xs">
              <Zap className="w-3.5 h-3.5 text-purple-400" />
              <span>{t("ov.ram")}</span>
            </div>
            <div className="font-semibold text-slate-100">
              {t("ov.ramTotal", { v: formatBytes(data.ram.total_bytes) })}
            </div>
            <div className="text-xs text-slate-400">
              {t("ov.ramSub", { f: formatBytes(data.ram.free_bytes), s: formatBytes(data.ram.total_swap_bytes) })}
            </div>
          </div>

          {/* Totale Opslag */}
          <div className="p-3.5 bg-slate-950/70 rounded-xl border border-slate-800/80 space-y-1">
            <div className="flex items-center gap-1.5 text-slate-400 text-xs">
              <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
              <span>{t("ov.storage")}</span>
            </div>
            <div className="font-semibold text-slate-100">
              {t("ov.volumes", { v: formatBytes(totalDiskBytes), n: data.disks.length })}
            </div>
            <div className="text-xs text-slate-400 truncate">
              {t("ov.mainDisk", { t: data.disks[0]?.disk_type || "SSD", m: data.disks[0]?.mount_point || "C:" })}
            </div>
          </div>

          {/* Besturingssysteem */}
          <div className="p-3.5 bg-slate-950/70 rounded-xl border border-slate-800/80 space-y-1">
            <div className="flex items-center gap-1.5 text-slate-400 text-xs">
              <Monitor className="w-3.5 h-3.5 text-cyan-400" />
              <span>{t("ov.os")}</span>
            </div>
            <div className="font-semibold text-slate-100 truncate">
              {data.os_name} {data.os_version}
            </div>
            <div className="text-xs text-slate-400 truncate">
              {t("ov.kernel", { v: data.kernel_version || "–" })}
            </div>
          </div>

          {/* Hostnaam & Netwerk */}
          <div className="p-3.5 bg-slate-950/70 rounded-xl border border-slate-800/80 space-y-1">
            <div className="flex items-center gap-1.5 text-slate-400 text-xs">
              <Laptop className="w-3.5 h-3.5 text-rose-400" />
              <span>{t("ov.host")}</span>
            </div>
            <div className="font-semibold text-slate-100 truncate">
              {data.host_name}
            </div>
            <div className="text-xs text-slate-400 truncate">
              {powerData?.is_laptop ? t("ov.mobile") : t("ov.desktopAc")}
            </div>
          </div>
        </div>
      </div>

      {/* Algemene Systeemgezondheid & Aanbevelingen */}
      <div className="p-6 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-cyan-400" />
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
            {t("ov.healthTitle")}
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 text-xs">
          {/* Aanbeveling 1: Opslag */}
          <button
            type="button"
            onClick={() => setActiveTab("disk")}
            className={cn(
              "w-full text-left p-4 bg-slate-950/80 border border-slate-800 hover:border-slate-700 rounded-xl space-y-2 cursor-pointer transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
            )}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                <HardDrive className="w-4 h-4 text-amber-400" /> {t("ov.storageStatus")}
              </span>
              {fullDisks.length > 0 ? (
                <span className="text-xs px-2 py-0.5 rounded bg-amber-950 border border-amber-800 text-amber-300 font-bold">
                  {t("ov.cleanUp")}
                </span>
              ) : (
                <span className="text-xs px-2 py-0.5 rounded bg-emerald-950 border border-emerald-800 text-emerald-400 font-bold">
                  {t("ov.healthy")}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400">
              {fullDisks.length > 0
                ? t("ov.fullDisks", { n: fullDisks.length })
                : t("ov.enoughSpace")}
            </p>
          </button>

          {/* Aanbeveling 2: Koeling */}
          <button
            type="button"
            onClick={() => setActiveTab("cooling")}
            className={cn(
              "w-full text-left p-4 bg-slate-950/80 border border-slate-800 hover:border-slate-700 rounded-xl space-y-2 cursor-pointer transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
            )}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                <Fan className="w-4 h-4 text-blue-400" /> {t("ov.cooling")}
              </span>
              {coolingData?.is_throttling_suspected ? (
                <span className="text-xs px-2 py-0.5 rounded bg-rose-950 border border-rose-800 text-rose-300 font-bold animate-pulse">
                  {t("ov.throttling")}
                </span>
              ) : (
                <span className="text-xs px-2 py-0.5 rounded bg-emerald-950 border border-emerald-800 text-emerald-400 font-bold">
                  {t("ov.normal")}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400">
              {coolingData?.is_throttling_suspected
                ? t("ov.hot")
                : t("ov.coolOk")}
            </p>
          </button>

          {/* Aanbeveling 3: Herstart & Kernel Uptime */}
          <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                <RefreshCw className="w-4 h-4 text-purple-400" /> {t("ov.maintenance")}
              </span>
              {isLongKernelUptime ? (
                <span className="text-xs px-2 py-0.5 rounded bg-purple-950 border border-purple-800 text-purple-300 font-bold">
                  {t("ov.restartAdvice")}
                </span>
              ) : (
                <span className="text-xs px-2 py-0.5 rounded bg-emerald-950 border border-emerald-800 text-emerald-400 font-bold">
                  {t("ov.fresh")}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400">
              {isLongKernelUptime
                ? t("ov.longUptime", { u: formatUptime(data.kernel_uptime_secs) })
                : t("ov.recentRestart")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
