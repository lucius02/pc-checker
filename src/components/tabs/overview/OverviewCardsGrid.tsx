import React from "react";
import {
  Cpu,
  Flame,
  Zap,
  HardDrive,
  BatteryCharging,
  Fan,
  ShieldAlert,
} from "lucide-react";
import {
  SystemOverview,
  PowerInfo,
  CoolingOverview,
  FreezeDiagnosticReport,
  BatteryHealthReport,
  StressTestResult,
  TabType,
} from "../../../types";
import { formatBytes } from "../../../utils/formatters";
import { cn } from "../../../utils/cn";

interface OverviewCardsGridProps {
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

export const OverviewCardsGrid: React.FC<OverviewCardsGridProps> = ({
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
  const ramUsagePercent = Math.min(
    100,
    Math.round((data.ram.used_bytes / Math.max(1, data.ram.total_bytes)) * 100)
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
      {/* 1. CPU & Stresstest Card */}
      <div className="p-5 bg-slate-900/70 border border-slate-800 rounded-2xl relative overflow-hidden flex flex-col justify-between hover:border-slate-700 transition-all">
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-cyan-950 border border-cyan-800/80 text-cyan-400">
                <Cpu className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-200">Processor (CPU)</h3>
                <p className="text-xs text-slate-400 truncate max-w-40">
                  {data.cpu.brand}
                </p>
              </div>
            </div>
            <span className="text-2xl font-bold font-mono text-cyan-400">
              {data.cpu.global_usage.toFixed(0)}%
            </span>
          </div>

          <div className="space-y-2 mb-3">
            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
              <div
                className="bg-cyan-400 h-2 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, data.cpu.global_usage)}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-slate-400">
              <span>{data.cpu.physical_cores} Cores / {data.cpu.logical_cores} Threads</span>
              <span>{data.cpu.cores[0]?.frequency_mhz || 0} MHz</span>
            </div>
          </div>

          <div className="text-xs text-slate-400 bg-slate-950/60 p-2 rounded-lg border border-slate-800/80">
            {cpuResult ? (
              <span className="text-emerald-400 font-medium">
                Laatste test: {cpuResult.score_or_speed.toFixed(2)} {cpuResult.unit}
              </span>
            ) : (
              <span>Multi-core rekenstresstest &amp; throttling verificatie</span>
            )}
          </div>
        </div>

        <button
          onClick={() => setActiveTab("cpu")}
          className={cn(
            "mt-4 w-full py-2.5 bg-cyan-950/60 hover:bg-cyan-900/80 text-xs text-cyan-300 font-semibold rounded-xl border border-cyan-800/80 transition-colors flex items-center justify-center gap-1.5 shadow-sm cursor-pointer",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
          )}
        >
          <Flame className="w-4 h-4 text-cyan-400" />
          Open CPU Stresstest
        </button>
      </div>

      {/* 2. RAM Integriteit Card */}
      <div className="p-5 bg-slate-900/70 border border-slate-800 rounded-2xl relative overflow-hidden flex flex-col justify-between hover:border-slate-700 transition-all">
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-purple-950 border border-purple-800/80 text-purple-400">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-200">Werkgeheugen (RAM)</h3>
                <p className="text-xs text-slate-400">
                  {formatBytes(data.ram.used_bytes)} / {formatBytes(data.ram.total_bytes)}
                </p>
              </div>
            </div>
            <span className="text-2xl font-bold font-mono text-purple-400">
              {ramUsagePercent}%
            </span>
          </div>

          <div className="space-y-2 mb-3">
            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
              <div
                className="bg-purple-400 h-2 rounded-full transition-all duration-500"
                style={{ width: `${ramUsagePercent}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-slate-400">
              <span>Vrij: {formatBytes(data.ram.free_bytes)}</span>
              <span>Swap: {formatBytes(data.ram.used_swap_bytes)}</span>
            </div>
          </div>

          <div className="text-xs text-slate-400 bg-slate-950/60 p-2 rounded-lg border border-slate-800/80">
            {ramResult ? (
              <span className="text-emerald-400 font-medium">
                Laatste test: {ramResult.success ? "0 bitfouten gedetecteerd" : "Fouten gevonden!"}
              </span>
            ) : (
              <span>Walking-bit &amp; checkerboard geheugentest</span>
            )}
          </div>
        </div>

        <button
          onClick={() => setActiveTab("ram")}
          className={cn(
            "mt-4 w-full py-2.5 bg-purple-950/60 hover:bg-purple-900/80 text-xs text-purple-300 font-semibold rounded-xl border border-purple-800/80 transition-colors flex items-center justify-center gap-1.5 shadow-sm cursor-pointer",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-400"
          )}
        >
          <Zap className="w-4 h-4 text-purple-400" />
          Open Geheugencheck
        </button>
      </div>

      {/* 3. Schijven & Benchmark Card */}
      <div className="p-5 bg-slate-900/70 border border-slate-800 rounded-2xl relative overflow-hidden flex flex-col justify-between hover:border-slate-700 transition-all">
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-amber-950 border border-amber-800/80 text-amber-400">
                <HardDrive className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-200">Opslag &amp; Schijven</h3>
                <p className="text-xs text-slate-400">
                  {data.disks.length} volume(s) aangesloten
                </p>
              </div>
            </div>
            <span className="text-2xl font-bold font-mono text-amber-400">
              {data.disks.length > 0
                ? `${Math.round(
                    ((data.disks[0].total_bytes - data.disks[0].available_bytes) /
                      Math.max(1, data.disks[0].total_bytes)) *
                      100
                  )}%`
                : "0%"}
            </span>
          </div>

          <div className="space-y-2 mb-3">
            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
              <div
                className="bg-amber-400 h-2 rounded-full transition-all duration-500"
                style={{
                  width:
                    data.disks.length > 0
                      ? `${Math.round(
                          ((data.disks[0].total_bytes - data.disks[0].available_bytes) /
                            Math.max(1, data.disks[0].total_bytes)) *
                            100
                        )}%`
                      : "0%",
                }}
              />
            </div>
            <div className="flex justify-between text-xs text-slate-400">
              <span className="truncate max-w-40">
                {data.disks[0]?.name || "C:"} ({data.disks[0]?.disk_type || "SSD"})
              </span>
              <span>
                {data.disks[0] ? formatBytes(data.disks[0].available_bytes) : "0 B"} vrij
              </span>
            </div>
          </div>

          <div className="text-xs text-slate-400 bg-slate-950/60 p-2 rounded-lg border border-slate-800/80">
            {diskResult ? (
              <span className="text-emerald-400 font-medium">
                Benchmark: {diskResult.score_or_speed.toFixed(1)} {diskResult.unit}
              </span>
            ) : (
              <span>Sequentiële lees/schrijftest &amp; data-integriteit</span>
            )}
          </div>
        </div>

        <button
          onClick={() => setActiveTab("disk")}
          className={cn(
            "mt-4 w-full py-2.5 bg-amber-950/60 hover:bg-amber-900/80 text-xs text-amber-300 font-semibold rounded-xl border border-amber-800/80 transition-colors flex items-center justify-center gap-1.5 shadow-sm cursor-pointer",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
          )}
        >
          <HardDrive className="w-4 h-4 text-amber-400" />
          Open Schijf Benchmark
        </button>
      </div>

      {/* 4. Stroom & Batterij Card */}
      <div className="p-5 bg-slate-900/70 border border-slate-800 rounded-2xl relative overflow-hidden flex flex-col justify-between hover:border-slate-700 transition-all">
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-amber-950 border border-amber-800/80 text-amber-400">
                <BatteryCharging className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-200">Stroom &amp; Batterij</h3>
                <p className="text-xs text-slate-400 truncate max-w-40">
                  {powerData?.power_plan_name || "Netstroom"}
                </p>
              </div>
            </div>
            <span className="text-2xl font-bold font-mono text-amber-400">
              {powerData?.battery_percent !== null && powerData?.battery_percent !== undefined
                ? `${powerData.battery_percent}%`
                : "AC"}
            </span>
          </div>

          <div className="space-y-2 mb-3">
            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
              <div
                className="bg-amber-400 h-2 rounded-full transition-all duration-500"
                style={{
                  width: `${
                    powerData?.battery_percent !== null && powerData?.battery_percent !== undefined
                      ? powerData.battery_percent
                      : 100
                  }%`,
                }}
              />
            </div>
            <div className="flex justify-between text-xs text-slate-400">
              <span>{powerData?.is_laptop ? "Mobiele Accu" : "Vaste Netstroom (Desktop)"}</span>
              <span className="text-emerald-400 font-medium">
                {powerData?.ac_connected ? "Aangesloten" : "Op batterij"}
              </span>
            </div>
          </div>

          <div className="text-xs text-slate-400 bg-slate-950/60 p-2 rounded-lg border border-slate-800/80">
            {batteryReport ? (
              <span className="text-emerald-400 font-medium">
                Gezondheid: {batteryReport.health_percent.toFixed(1)}% ({batteryReport.grade})
              </span>
            ) : (
              <span>Slijtagetest van accucellen &amp; voedingsanalyse</span>
            )}
          </div>
        </div>

        <button
          onClick={() => setActiveTab("power")}
          className={cn(
            "mt-4 w-full py-2.5 bg-amber-950/60 hover:bg-amber-900/80 text-xs text-amber-300 font-semibold rounded-xl border border-amber-800/80 transition-colors flex items-center justify-center gap-1.5 shadow-sm cursor-pointer",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
          )}
        >
          <BatteryCharging className="w-4 h-4 text-amber-400" />
          Open Stroom &amp; Batterij
        </button>
      </div>

      {/* 5. Koeling & Ventilatoren Card */}
      <div className="p-5 bg-slate-900/70 border border-slate-800 rounded-2xl relative overflow-hidden flex flex-col justify-between hover:border-slate-700 transition-all">
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-blue-950 border border-blue-800/80 text-blue-400">
                <Fan className="w-5 h-5 animate-spin" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-200">Koeling &amp; Fans</h3>
                <p className="text-xs text-slate-400">
                  {coolingData?.fans.length || 1} koelmodule(s) actief
                </p>
              </div>
            </div>
            <span className="text-2xl font-bold font-mono text-blue-400">
              {coolingData?.temperatures[0]?.temperature_celsius
                ? `${coolingData.temperatures[0].temperature_celsius.toFixed(0)}°C`
                : "Normaal"}
            </span>
          </div>

          <div className="space-y-2 mb-3">
            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
              <div
                className={cn(
                  "h-2 rounded-full transition-all duration-500",
                  coolingData?.is_throttling_suspected ? "bg-rose-500" : "bg-blue-400"
                )}
                style={{
                  width: `${
                    coolingData?.temperatures[0]?.temperature_celsius
                      ? Math.min(100, (coolingData.temperatures[0].temperature_celsius / 100) * 100)
                      : 50
                  }%`,
                }}
              />
            </div>
            <div className="flex justify-between text-xs text-slate-400">
              <span>
                {coolingData?.fans[0]?.speed_rpm
                  ? `${coolingData.fans[0].speed_rpm} RPM`
                  : "Dynamische BIOS/EC Curve"}
              </span>
              <span
                className={cn(
                  coolingData?.is_throttling_suspected
                    ? "text-rose-400 font-bold"
                    : "text-emerald-400 font-medium"
                )}
              >
                {coolingData?.is_throttling_suspected ? "Throttling" : "Thermisch Stabiel"}
              </span>
            </div>
          </div>

          <div className="text-xs text-slate-400 bg-slate-950/60 p-2 rounded-lg border border-slate-800/80 truncate">
            <span>Live ACPI sensoren &amp; ventilator toerentallen</span>
          </div>
        </div>

        <button
          onClick={() => setActiveTab("cooling")}
          className={cn(
            "mt-4 w-full py-2.5 bg-blue-950/60 hover:bg-blue-900/80 text-xs text-blue-300 font-semibold rounded-xl border border-blue-800/80 transition-colors flex items-center justify-center gap-1.5 shadow-sm cursor-pointer",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
          )}
        >
          <Fan className="w-4 h-4 text-blue-400" />
          Open Koeling &amp; Fans
        </button>
      </div>

      {/* 6. Freeze Detective Card */}
      <div className="p-5 bg-slate-900/70 border border-slate-800 rounded-2xl relative overflow-hidden flex flex-col justify-between hover:border-slate-700 transition-all">
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-rose-950 border border-rose-800/80 text-rose-400">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-200">Freeze Detective</h3>
                <p className="text-xs text-slate-400">
                  Systeem freeze detectie
                </p>
              </div>
            </div>
            <span
              className={cn(
                "text-xs px-2.5 py-1 rounded-lg font-bold border",
                freezeData?.system_freeze_risk === "Hoog"
                  ? "bg-rose-950 border-rose-800 text-rose-400"
                  : "bg-emerald-950 border-emerald-800 text-emerald-400"
              )}
            >
              Risico: {freezeData?.system_freeze_risk || "Laag"}
            </span>
          </div>

          <div className="space-y-2 mb-3">
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <span className="truncate">Live Achtergrond Watchdog actief</span>
            </div>
            <div className="flex justify-between text-xs text-slate-400">
              <span>
                {freezeData?.watchdog_freezes_detected.length || 0} live freeze(s)
              </span>
              <span>
                {freezeData?.event_log_culprits.length || 0} logboek incidenten
              </span>
            </div>
          </div>

          <div className="text-xs text-slate-400 bg-slate-950/60 p-2 rounded-lg border border-slate-800/80 truncate">
            <span>SATA resets, GPU TDR crashes &amp; DPC latency</span>
          </div>
        </div>

        <button
          onClick={() => setActiveTab("freeze")}
          className={cn(
            "mt-4 w-full py-2.5 bg-rose-950/60 hover:bg-rose-900/80 text-xs text-rose-300 font-semibold rounded-xl border border-rose-800/80 transition-colors flex items-center justify-center gap-1.5 shadow-sm cursor-pointer",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400"
          )}
        >
          <ShieldAlert className="w-4 h-4 text-rose-400" />
          Open Freeze Detective
        </button>
      </div>
    </div>
  );
};
