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
  TabType,
} from "../../types";
import { formatBytes, formatUptime } from "../../utils/formatters";
import { cn } from "../../utils/cn";
import { OverviewCardsGrid } from "./overview/OverviewCardsGrid";

interface OverviewTabProps {
  data: SystemOverview;
  powerData: PowerInfo | null;
  coolingData: CoolingOverview | null;
  freezeData: FreezeDiagnosticReport | null;
  batteryReport: BatteryHealthReport | null;
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
  cpuResult,
  ramResult,
  diskResult,
  setActiveTab,
}) => {
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
            Hardware Status &amp; Diagnostische Testen
          </h2>
          <p className="text-xs text-slate-400">
            Live overzicht van alle hardware-modules en diagnoses. Klik op een knop om de gewenste test direct te openen.
          </p>
        </div>
      </div>

      {/* 6 Rich Diagnostic & Hardware Cards Grid */}
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
              <span className="font-semibold text-cyan-400 uppercase tracking-wider text-xs">
                Huidige Werksessie (Actueel)
              </span>
              <span className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 font-mono text-xs border border-cyan-800">
                {data.session_started_at}
              </span>
            </div>
            <div className="text-2xl font-bold font-mono text-white">
              {formatUptime(data.session_uptime_secs)}
            </div>
            <p className="text-slate-400 text-xs">
              Exacte tijd dat de computer actief in gebruik is sinds het openklappen of ontwaken vandaag.
            </p>
          </div>

          <div className="p-4 bg-slate-950/80 rounded-xl border border-slate-800 space-y-1">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-slate-400 uppercase tracking-wider text-xs">
                Totale Windows Kernel Uptime
              </span>
              <span className="px-2 py-0.5 rounded bg-slate-900 text-slate-400 font-mono text-xs border border-slate-800">
                Sinds laatste herstart
              </span>
            </div>
            <div className="text-2xl font-bold font-mono text-slate-300">
              {formatUptime(data.kernel_uptime_secs)}
            </div>
            <p className="text-slate-400 text-xs flex items-center gap-1">
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
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 flex items-center gap-1">
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
            <div className="flex items-center gap-1.5 text-slate-400 text-xs">
              <Cpu className="w-3.5 h-3.5 text-cyan-400" />
              <span>Processor (CPU)</span>
            </div>
            <div className="font-semibold text-slate-100 truncate" title={data.cpu.brand}>
              {data.cpu.brand}
            </div>
            <div className="text-xs text-slate-400">
              {data.cpu.physical_cores} Fysiek • {data.cpu.logical_cores} Threads ({data.cpu.vendor_id || "x86_64"})
            </div>
          </div>

          {/* Videokaart (GPU) */}
          <div className="p-3.5 bg-slate-950/70 rounded-xl border border-slate-800/80 space-y-1">
            <div className="flex items-center gap-1.5 text-slate-400 text-xs">
              <Monitor className="w-3.5 h-3.5 text-indigo-400" />
              <span>Grafische Kaart (GPU)</span>
            </div>
            <div className="font-semibold text-slate-100 truncate" title={primaryGpu?.name || "Grafische Adapter"}>
              {primaryGpu?.name || "Standaard GPU"}
            </div>
            <div className="text-xs text-slate-400 truncate">
              {primaryGpu?.driver_version ? `Driver v${primaryGpu.driver_version}` : "Standaard driver"}
              {primaryGpu?.vram_bytes ? ` • ${formatBytes(primaryGpu.vram_bytes)}` : ""}
            </div>
          </div>

          {/* Moederbord */}
          <div className="p-3.5 bg-slate-950/70 rounded-xl border border-slate-800/80 space-y-1">
            <div className="flex items-center gap-1.5 text-slate-400 text-xs">
              <Layers className="w-3.5 h-3.5 text-amber-400" />
              <span>Moederbord (Baseboard)</span>
            </div>
            <div className="font-semibold text-slate-100 truncate" title={`${data.motherboard.manufacturer} ${data.motherboard.product}`}>
              {data.motherboard.manufacturer}
            </div>
            <div className="text-xs text-slate-400 truncate">
              Model: {data.motherboard.product}
            </div>
          </div>

          {/* BIOS / UEFI */}
          <div className="p-3.5 bg-slate-950/70 rounded-xl border border-slate-800/80 space-y-1">
            <div className="flex items-center gap-1.5 text-slate-400 text-xs">
              <Info className="w-3.5 h-3.5 text-blue-400" />
              <span>BIOS / Firmware</span>
            </div>
            <div className="font-semibold text-slate-100 truncate" title={data.motherboard.bios_vendor}>
              {data.motherboard.bios_vendor}
            </div>
            <div className="text-xs text-slate-400 truncate">
              Versie: {data.motherboard.bios_version}
            </div>
          </div>

          {/* Werkgeheugen (RAM) */}
          <div className="p-3.5 bg-slate-950/70 rounded-xl border border-slate-800/80 space-y-1">
            <div className="flex items-center gap-1.5 text-slate-400 text-xs">
              <Zap className="w-3.5 h-3.5 text-purple-400" />
              <span>Werkgeheugen (RAM)</span>
            </div>
            <div className="font-semibold text-slate-100">
              {formatBytes(data.ram.total_bytes)} Totaal
            </div>
            <div className="text-xs text-slate-400">
              Vrij: {formatBytes(data.ram.free_bytes)} • Swap: {formatBytes(data.ram.total_swap_bytes)}
            </div>
          </div>

          {/* Totale Opslag */}
          <div className="p-3.5 bg-slate-950/70 rounded-xl border border-slate-800/80 space-y-1">
            <div className="flex items-center gap-1.5 text-slate-400 text-xs">
              <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
              <span>Totale Opslagcapaciteit</span>
            </div>
            <div className="font-semibold text-slate-100">
              {formatBytes(totalDiskBytes)} ({data.disks.length} Volume{data.disks.length === 1 ? "" : "s"})
            </div>
            <div className="text-xs text-slate-400 truncate">
              Hoofdschijf: {data.disks[0]?.disk_type || "SSD"} ({data.disks[0]?.mount_point || "C:"})
            </div>
          </div>

          {/* Besturingssysteem */}
          <div className="p-3.5 bg-slate-950/70 rounded-xl border border-slate-800/80 space-y-1">
            <div className="flex items-center gap-1.5 text-slate-400 text-xs">
              <Monitor className="w-3.5 h-3.5 text-cyan-400" />
              <span>Besturingssysteem</span>
            </div>
            <div className="font-semibold text-slate-100 truncate">
              {data.os_name} {data.os_version}
            </div>
            <div className="text-xs text-slate-400 truncate">
              Kernel: {data.kernel_version || "Windows 11"}
            </div>
          </div>

          {/* Hostnaam & Netwerk */}
          <div className="p-3.5 bg-slate-950/70 rounded-xl border border-slate-800/80 space-y-1">
            <div className="flex items-center gap-1.5 text-slate-400 text-xs">
              <Laptop className="w-3.5 h-3.5 text-rose-400" />
              <span>Netwerk Hostnaam</span>
            </div>
            <div className="font-semibold text-slate-100 truncate">
              {data.host_name}
            </div>
            <div className="text-xs text-slate-400 truncate">
              {powerData?.is_laptop ? "Mobiel Systeem (Accu)" : "Desktop Workstation (AC Line)"}
            </div>
          </div>
        </div>
      </div>

      {/* Algemene Systeemgezondheid & Aanbevelingen */}
      <div className="p-6 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-cyan-400" />
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
            Systeemgezondheid &amp; Directe Aanbevelingen
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 text-xs">
          {/* Aanbeveling 1: Opslag */}
          <button
            type="button"
            onClick={() => setActiveTab("disk")}
            className={cn(
              "w-full text-left p-4 bg-slate-950/80 border border-slate-800 hover:border-slate-700 rounded-xl space-y-2 cursor-pointer transition-colors",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
            )}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                <HardDrive className="w-4 h-4 text-amber-400" /> Opslagstatus
              </span>
              {fullDisks.length > 0 ? (
                <span className="text-xs px-2 py-0.5 rounded bg-amber-950 border border-amber-800 text-amber-300 font-bold">
                  Opschonen
                </span>
              ) : (
                <span className="text-xs px-2 py-0.5 rounded bg-emerald-950 border border-emerald-800 text-emerald-400 font-bold">
                  Gezond
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400">
              {fullDisks.length > 0
                ? `${fullDisks.length} schijfvolume(s) zijn voor >85% vol. Klik om schijfopruiming tips te bekijken.`
                : "Voldoende vrije ruimte beschikbaar voor TRIM en SSD wear-leveling."}
            </p>
          </button>

          {/* Aanbeveling 2: Koeling */}
          <button
            type="button"
            onClick={() => setActiveTab("cooling")}
            className={cn(
              "w-full text-left p-4 bg-slate-950/80 border border-slate-800 hover:border-slate-700 rounded-xl space-y-2 cursor-pointer transition-colors",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
            )}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                <Fan className="w-4 h-4 text-blue-400" /> Koelconditie
              </span>
              {coolingData?.is_throttling_suspected ? (
                <span className="text-xs px-2 py-0.5 rounded bg-rose-950 border border-rose-800 text-rose-300 font-bold animate-pulse">
                  Throttling
                </span>
              ) : (
                <span className="text-xs px-2 py-0.5 rounded bg-emerald-950 border border-emerald-800 text-emerald-400 font-bold">
                  Normaal
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400">
              {coolingData?.is_throttling_suspected
                ? "Temperaturen overschrijden 90°C. Maak de ventilatieroosters stofvrij en controleer koelpasta."
                : "Thermische sensoren rapporteren stabiele en veilige bedrijfstemperaturen."}
            </p>
          </button>

          {/* Aanbeveling 3: Herstart & Kernel Uptime */}
          <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                <RefreshCw className="w-4 h-4 text-purple-400" /> Systeemonderhoud
              </span>
              {isLongKernelUptime ? (
                <span className="text-xs px-2 py-0.5 rounded bg-purple-950 border border-purple-800 text-purple-300 font-bold">
                  Herstart Advies
                </span>
              ) : (
                <span className="text-xs px-2 py-0.5 rounded bg-emerald-950 border border-emerald-800 text-emerald-400 font-bold">
                  Vers
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400">
              {isLongKernelUptime
                ? `Kernel draait al ${formatUptime(data.kernel_uptime_secs)}. Kies in Start voor 'Opnieuw opstarten' om stuurprogramma's te verversen.`
                : "Windows kernel is recent herstart; systeemcaches en drivers zijn schoon geïnitialiseerd."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
