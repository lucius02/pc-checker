import React from "react";
import { Flame, RefreshCw, Play, CheckCircle2, AlertTriangle } from "lucide-react";
import { SystemOverview, StressTestResult } from "../../types";

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
                  onClick={() => setCpuDuration(sec)}
                  disabled={isTestingCpu}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                    cpuDuration === sec
                      ? "bg-cyan-500 text-slate-950"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  {sec}s
                </button>
              ))}
            </div>

            <button
              onClick={handleCpuStress}
              disabled={isTestingCpu}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-sm shadow-lg shadow-cyan-500/20 disabled:opacity-50 transition-all flex items-center gap-2 cursor-pointer"
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
                <div className="flex justify-between items-center text-[11px] mb-1.5">
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
                <span className="text-[10px] text-slate-500 mt-1.5 text-right font-mono">
                  {core.frequency_mhz} MHz
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Result Box */}
        {cpuResult && (
          <div
            className={`p-4 rounded-xl border ${
              cpuResult.success
                ? "bg-emerald-950/30 border-emerald-800/80 text-emerald-300"
                : "bg-red-950/30 border-red-800/80 text-red-300"
            } space-y-2`}
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
    </div>
  );
};
