import React from "react";
import { Zap, RefreshCw, Play, CheckCircle2, AlertTriangle } from "lucide-react";
import { SystemOverview, StressTestResult } from "../../types";
import { formatBytes } from "../../utils/formatters";

interface RamTabProps {
  data: SystemOverview;
  isTestingRam: boolean;
  ramSizeMb: number;
  setRamSizeMb: (mb: number) => void;
  handleRamStress: () => void;
  ramResult: StressTestResult | null;
}

export const RamTab: React.FC<RamTabProps> = ({
  data,
  isTestingRam,
  ramSizeMb,
  setRamSizeMb,
  handleRamStress,
  ramResult,
}) => {
  const ramUsagePercent = Math.min(
    100,
    Math.round((data.ram.used_bytes / Math.max(1, data.ram.total_bytes)) * 100)
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Zap className="w-5 h-5 text-purple-400" />
              RAM Geheugenintegriteit &amp; Bit-Flip Verificatie
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Allokeert een dynamisch geheugenblok en voert walking-bit en checkerboard patronen (0xAA / 0x55) uit om corrupte geheugencellen op te sporen.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-xl p-1 text-xs">
              {[128, 256, 512].map((mb) => (
                <button
                  key={mb}
                  onClick={() => setRamSizeMb(mb)}
                  disabled={isTestingRam}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                    ramSizeMb === mb
                      ? "bg-purple-500 text-slate-950 font-bold"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  {mb} MB
                </button>
              ))}
            </div>

            <button
              onClick={handleRamStress}
              disabled={isTestingRam}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-400 hover:to-indigo-500 text-slate-950 font-bold text-sm shadow-lg shadow-purple-500/20 disabled:opacity-50 transition-all flex items-center gap-2 cursor-pointer"
            >
              {isTestingRam ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  RAM Testen...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-slate-950" />
                  Start Integriteitstest
                </>
              )}
            </button>
          </div>
        </div>

        {/* RAM Breakdown Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl">
            <span className="text-slate-400 block mb-1">Totaal Fysiek RAM</span>
            <span className="text-lg font-bold text-slate-200">
              {formatBytes(data.ram.total_bytes)}
            </span>
          </div>
          <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl">
            <span className="text-slate-400 block mb-1">In Gebruik</span>
            <span className="text-lg font-bold text-purple-400">
              {formatBytes(data.ram.used_bytes)} ({ramUsagePercent}%)
            </span>
          </div>
          <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl">
            <span className="text-slate-400 block mb-1">Beschikbaar / Vrij</span>
            <span className="text-lg font-bold text-emerald-400">
              {formatBytes(data.ram.free_bytes)}
            </span>
          </div>
        </div>

        {/* RAM Result Box */}
        {ramResult && (
          <div
            className={`p-4 rounded-xl border ${
              ramResult.success
                ? "bg-emerald-950/30 border-emerald-800/80 text-emerald-300"
                : "bg-red-950/30 border-red-800/80 text-red-300"
            } space-y-2`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold">
                {ramResult.success ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                )}
                <span>{ramResult.test_name} - {ramResult.success ? "Geslaagd" : "Mislukt"}</span>
              </div>
              <span className="font-mono font-bold text-lg">
                {ramResult.score_or_speed.toFixed(1)} {ramResult.unit}
              </span>
            </div>
            <p className="text-xs opacity-90">{ramResult.details}</p>
          </div>
        )}
      </div>
    </div>
  );
};
