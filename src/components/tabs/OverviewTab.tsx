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
import { OverviewCardsGrid } from "./overview/OverviewCardsGrid";
import { HealthScoreCard } from "./overview/HealthScoreCard";

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
  const totalDiskBytes = data.disks.reduce((acc, d) => acc + d.total_bytes, 0);
  const primaryGpu = data.gpus[0];

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header Title with Quick Subtitle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-cyan-400" />
            Hardware Status &amp; Diagnostische Testen
          </h2>
          <p className="text-xs text-slate-400">
            Live overzicht van alle hardware-modules en diagnoses. Klik op een knop om de gewenste test direct te openen.
          </p>
        </div>
      </div>

      {/* 6 Rich Diagnostic & Hardware Cards Grid */}
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

      <OverviewCardsGrid
        data={data}
        powerData={powerData}
        coolingData={coolingData}
        freezeData={freezeData}
        batteryReport={batteryReport}
        cpuResult={cpuResult}
        ramResult={ramResult}
        diskResult={diskResult}
        setActiveTab={setActiveTab}
      />

      {/* Systeem Uptime & Sessie Info Box */}
      <div className="p-5 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
            <Clock className="w-4 h-4 text-cyan-400" />
            <span>Actuele Werksessie &amp; Systeemuptime</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="p-4 bg-slate-950/80 rounded-xl border border-cyan-800/50 space-y-1">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-cyan-400 uppercase tracking-wider text-[11px]">
                Huidige Werksessie (Actueel)
              </span>
              <span className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 font-mono text-[10px] border border-cyan-800">
                {data.session_started_at}
              </span>
            </div>
            <div className="text-2xl font-bold font-mono text-white">
              {formatUptime(data.session_uptime_secs)}
            </div>
            <p className="text-slate-400 text-[11px]">
              Exacte tijd dat de computer actief in gebruik is sinds het openklappen of ontwaken vandaag.
            </p>
          </div>

          <div className="p-4 bg-slate-950/80 rounded-xl border border-slate-800 space-y-1">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-slate-400 uppercase tracking-wider text-[11px]">
                Totale Windows Kernel Uptime
              </span>
              <span className="px-2 py-0.5 rounded bg-slate-900 text-slate-400 font-mono text-[10px] border border-slate-800">
                Sinds laatste herstart
              </span>
            </div>
            <div className="text-2xl font-bold font-mono text-slate-300">
              {formatUptime(data.kernel_uptime_secs)}
            </div>
            <p className="text-slate-400 text-[11px] flex items-center gap-1">
              <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>
                Windows Snel Opstarten (Fast Startup) &amp; Standby houden de kernel actief bij afsluiten.
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
            <span>Volledige Systeemspecificaties &amp; Hardware Profiel</span>
          </div>
          <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 flex items-center gap-1">
            {powerData?.is_laptop ? (
              <>
                <Laptop className="w-3 h-3 text-cyan-400" /> Laptop
              </>
            ) : (
              <>
                <PcCase className="w-3 h-3 text-cyan-400" /> Desktop Workstation
              </>
            )}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 text-xs">
          {/* Processor (CPU) */}
          <div className="p-3.5 bg-slate-950/70 rounded-xl border border-slate-800/80 space-y-1">
            <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
              <Cpu className="w-3.5 h-3.5 text-cyan-400" />
              <span>Processor (CPU)</span>
            </div>
            <div className="font-semibold text-slate-100 truncate" title={data.cpu.brand}>
              {data.cpu.brand}
            </div>
            <div className="text-[11px] text-slate-400">
              {data.cpu.physical_cores} Fysiek • {data.cpu.logical_cores} Threads ({data.cpu.vendor_id || "x86_64"})
            </div>
          </div>

          {/* Videokaart (GPU) */}
          <div className="p-3.5 bg-slate-950/70 rounded-xl border border-slate-800/80 space-y-1">
            <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
              <Monitor className="w-3.5 h-3.5 text-indigo-400" />
              <span>Grafische Kaart (GPU)</span>
            </div>
            <div className="font-semibold text-slate-100 truncate" title={primaryGpu?.name || "Grafische Adapter"}>
              {primaryGpu?.name || "Standaard GPU"}
            </div>
            <div className="text-[11px] text-slate-400 truncate">
              {primaryGpu?.driver_version ? `Driver v${primaryGpu.driver_version}` : "Standaard driver"}
              {primaryGpu?.vram_bytes ? ` • ${formatBytes(primaryGpu.vram_bytes)}` : ""}
            </div>
          </div>

          {/* Moederbord */}
          <div className="p-3.5 bg-slate-950/70 rounded-xl border border-slate-800/80 space-y-1">
            <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
              <Layers className="w-3.5 h-3.5 text-amber-400" />
              <span>Moederbord (Baseboard)</span>
            </div>
            <div className="font-semibold text-slate-100 truncate" title={`${data.motherboard.manufacturer} ${data.motherboard.product}`}>
              {data.motherboard.manufacturer}
            </div>
            <div className="text-[11px] text-slate-400 truncate">
              Model: {data.motherboard.product}
            </div>
          </div>

          {/* BIOS / UEFI */}
          <div className="p-3.5 bg-slate-950/70 rounded-xl border border-slate-800/80 space-y-1">
            <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
              <Info className="w-3.5 h-3.5 text-blue-400" />
              <span>BIOS / Firmware</span>
            </div>
            <div className="font-semibold text-slate-100 truncate" title={data.motherboard.bios_vendor}>
              {data.motherboard.bios_vendor}
            </div>
            <div className="text-[11px] text-slate-400 truncate">
              Versie: {data.motherboard.bios_version}
            </div>
          </div>

          {/* Werkgeheugen (RAM) */}
          <div className="p-3.5 bg-slate-950/70 rounded-xl border border-slate-800/80 space-y-1">
            <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
              <Zap className="w-3.5 h-3.5 text-purple-400" />
              <span>Werkgeheugen (RAM)</span>
            </div>
            <div className="font-semibold text-slate-100">
              {formatBytes(data.ram.total_bytes)} Totaal
            </div>
            <div className="text-[11px] text-slate-400">
              Vrij: {formatBytes(data.ram.free_bytes)} • Swap: {formatBytes(data.ram.total_swap_bytes)}
            </div>
          </div>

          {/* Totale Opslag */}
          <div className="p-3.5 bg-slate-950/70 rounded-xl border border-slate-800/80 space-y-1">
            <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
              <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
              <span>Totale Opslagcapaciteit</span>
            </div>
            <div className="font-semibold text-slate-100">
              {formatBytes(totalDiskBytes)} ({data.disks.length} Volume{data.disks.length === 1 ? "" : "s"})
            </div>
            <div className="text-[11px] text-slate-400 truncate">
              Hoofdschijf: {data.disks[0]?.disk_type || "SSD"} ({data.disks[0]?.mount_point || "C:"})
            </div>
          </div>

          {/* Besturingssysteem */}
          <div className="p-3.5 bg-slate-950/70 rounded-xl border border-slate-800/80 space-y-1">
            <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
              <Monitor className="w-3.5 h-3.5 text-cyan-400" />
              <span>Besturingssysteem</span>
            </div>
            <div className="font-semibold text-slate-100 truncate">
              {data.os_name} {data.os_version}
            </div>
            <div className="text-[11px] text-slate-400 truncate">
              Kernel: {data.kernel_version || "Windows 11"}
            </div>
          </div>

          {/* Hostnaam & Netwerk */}
          <div className="p-3.5 bg-slate-950/70 rounded-xl border border-slate-800/80 space-y-1">
            <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
              <Laptop className="w-3.5 h-3.5 text-rose-400" />
              <span>Netwerk Hostnaam</span>
            </div>
            <div className="font-semibold text-slate-100 truncate">
              {data.host_name}
            </div>
            <div className="text-[11px] text-slate-400 truncate">
              {powerData?.is_laptop ? "Mobiel Systeem (Accu)" : "Desktop Workstation (AC Line)"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
