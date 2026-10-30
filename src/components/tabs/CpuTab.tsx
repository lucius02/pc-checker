import React from "react";
import {
  Flame,
  RefreshCw,
  Play,
  CheckCircle2,
  AlertTriangle,
  Info,
  Activity,
  Cpu,
  Sparkles,
} from "lucide-react";
import { SystemOverview, StressTestResult } from "../../types";
import { cn } from "../../utils/cn";

interface CpuTabProps {
  data: SystemOverview;
  isTestingCpu: boolean;
  cpuDuration: number;
  setCpuDuration: (sec: number) => void;
  handleCpuStress: () => void;
  cpuResult: StressTestResult | null;
}

export const CpuTab: React.FC<CpuTabProps> = ({
  data,
  isTestingCpu,
  cpuDuration,
  setCpuDuration,
  handleCpuStress,
  cpuResult,
}) => {
  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Flame className="w-5 h-5 text-cyan-400" />
              Multi-Core Processor Stresstest
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Voert intensieve wiskundige berekeningen uit op alle {data.cpu.logical_cores} threads om stabiliteit, throttling en piekprestaties te controleren.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-xl p-1 text-xs">
              {[5, 10, 30].map((sec) => (
                <button
                  key={sec}
                  type="button"
                  onClick={() => setCpuDuration(sec)}
                  disabled={isTestingCpu}
                  className={cn(
                    "px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400",
                    cpuDuration === sec
                      ? "bg-cyan-500 text-slate-950 font-bold"
                      : "text-slate-400 hover:text-white"
                  )}
                >
                  {sec}s
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleCpuStress}
              disabled={isTestingCpu}
              className={cn(
                "px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-sm shadow-lg shadow-cyan-500/20 transition-all flex items-center gap-2 cursor-pointer",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300",
                isTestingCpu && "opacity-50 cursor-not-allowed"
              )}
            >
              {isTestingCpu ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Stresstest Bezig...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-slate-950" />
                  Start Stresstest
                </>
              )}
            </button>
          </div>
        </div>

        {/* Per Core Usage Grid */}
        <div>
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
            Live Belasting per Kern ({data.cpu.cores.length} threads)
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2.5">
            {data.cpu.cores.map((core, i) => (
              <div
                key={i}
                className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-xl flex flex-col justify-between"
              >
                <div className="flex justify-between items-center text-xs mb-1.5">
                  <span className="text-slate-400 font-medium">Core {i}</span>
                  <span className="font-mono font-bold text-cyan-400">
                    {core.usage.toFixed(0)}%
                  </span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-cyan-400 h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, core.usage)}%` }}
                  />
                </div>
                <span className="text-xs text-slate-500 mt-1.5 text-right font-mono">
                  {core.frequency_mhz} MHz
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Result Box */}
        {cpuResult && (
          <div
            className={cn(
              "p-4 rounded-xl border space-y-2",
              cpuResult.success
                ? "bg-emerald-950/30 border-emerald-800/80 text-emerald-300"
                : "bg-red-950/30 border-red-800/80 text-red-300"
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold">
                {cpuResult.success ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                )}
                <span>{cpuResult.test_name} - {cpuResult.success ? "Geslaagd" : "Mislukt"}</span>
              </div>
              <span className="font-mono font-bold text-lg">
                {cpuResult.score_or_speed.toFixed(2)} {cpuResult.unit}
              </span>
            </div>
            <p className="text-xs opacity-90">{cpuResult.details}</p>
          </div>
        )}
      </div>

      {/* Info & Aanbevelingen Blok voor Processor & Stresstest */}
      <div className="p-6 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-5">
        <div className="flex items-center gap-2">
          <Info className="w-5 h-5 text-cyan-400" />
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
            CPU Richtlijnen, Prestatiescores &amp; Stabiliteitsadvies
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          {/* Wat meet deze stresstest? */}
          <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
            <h4 className="font-semibold text-slate-200 flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-400" />
              Wat meet deze stresstest precies?
            </h4>
            <p className="text-slate-400 text-xs leading-relaxed">
              De test voert miljoenen non-lineaire goniometrische en drijvende-komma berekeningen (sinus/cosinus) per seconde uit via een multi-threaded Rayon threadpool.
            </p>
            <p className="text-slate-300 text-xs">
              Hiermee worden alle logische kernen 100% belast. Dit brengt zwakke plekken zoals VRM spanningsdips, instabiele overkloks of overmatige hitte onmiddellijk aan het licht.
            </p>
          </div>

          {/* Wat is een normale score? */}
          <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
            <h4 className="font-semibold text-slate-200 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-emerald-400" />
              Wat is een normale score in MOps/sec?
            </h4>
            <div className="space-y-1.5 text-xs text-slate-300">
              <div className="flex justify-between border-b border-slate-800/80 pb-1">
                <span className="text-slate-400">4 – 8 threads (Quad-core laptops):</span>
                <span className="font-mono text-cyan-300">10 – 30 MOps/s</span>
              </div>
              <div className="flex justify-between border-b border-slate-800/80 pb-1">
                <span className="text-slate-400">12 – 16 threads (Moderne i7/Ultra/Ryzen):</span>
                <span className="font-mono text-emerald-400">40 – 90 MOps/s</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">24+ threads (Desktop Workstations):</span>
                <span className="font-mono text-purple-400">100+ MOps/s</span>
              </div>
            </div>
            <p className="text-slate-500 text-xs pt-1">
              Een hogere score betekent snellere multi-core rekenkracht en betere stabiliteit onder continue zware belasting.
            </p>
          </div>
        </div>

        {/* Aanbevelingen bij haperingen of inzakken */}
        <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-3 text-xs">
          <div className="flex items-center gap-2 text-cyan-300 font-semibold">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <span>Aanbevelingen bij CPU Instabiliteit of Prestatieverlies</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-slate-300">
            <div className="p-3 bg-slate-900/60 rounded-lg border border-slate-800/70 space-y-1">
              <span className="font-medium text-white block">1. Controleer Klokfrequenties</span>
              <p className="text-xs text-slate-400">
                Als de score na 10-30 seconden sterk keldert, verlaagt het moederbord de MHz (Thermal Throttling). Bekijk het tabblad <em>Koeling &amp; Fans</em> om te zien of de temperatuur boven 90°C piekt.
              </p>
            </div>

            <div className="p-3 bg-slate-900/60 rounded-lg border border-slate-800/70 space-y-1">
              <span className="font-medium text-white block">2. Reset Overclock &amp; Undervolt</span>
              <p className="text-xs text-slate-400">
                Crasht de pc tijdens een stresstest met een Blue Screen (zoals WHEA_UNCORRECTABLE_ERROR)? Zet eventuele CPU-overclock of undervolt instellingen in de BIOS terug naar fabriekswaarden.
              </p>
            </div>

            <div className="p-3 bg-slate-900/60 rounded-lg border border-slate-800/70 space-y-1">
              <span className="font-medium text-white block">3. Energiebeheerschema</span>
              <p className="text-xs text-slate-400">
                Stel Windows Energiebeheer in op 'Gebalanceerd' of 'Beste Prestaties'. Vermijd energiebesparende profielen tijdens zware reken- of renderklussen.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
