import React from "react";
import { HardDrive, RefreshCw, Play, CheckCircle2, AlertTriangle } from "lucide-react";
import { SystemOverview, StressTestResult } from "../../types";
import { formatBytes } from "../../utils/formatters";

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
  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <HardDrive className="w-5 h-5 text-amber-400" />
              Opslag Snelheid &amp; Data-Integriteit Benchmark
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Meet sequentiële schrijf- en leessnelheden op de hoofdschijf en verifieert de geschreven data byte-voor-byte om corrupte sectoren op te sporen.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-xl p-1 text-xs">
              {[32, 64, 128].map((mb) => (
                <button
                  key={mb}
                  onClick={() => setDiskSizeMb(mb)}
                  disabled={isTestingDisk}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                    diskSizeMb === mb
                      ? "bg-amber-500 text-slate-950 font-bold"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  {mb} MB
                </button>
              ))}
            </div>

            <button
              onClick={handleDiskBenchmark}
              disabled={isTestingDisk}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-bold text-sm shadow-lg shadow-amber-500/20 disabled:opacity-50 transition-all flex items-center gap-2 cursor-pointer"
            >
              {isTestingDisk ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Schijf Testen...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-slate-950" />
                  Start Benchmark
                </>
              )}
            </button>
          </div>
        </div>

        {/* Connected Disks List */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Gedetecteerde Schijven ({data.disks.length})
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {data.disks.map((d, i) => {
              const usedPercent = Math.round(
                ((d.total_bytes - d.available_bytes) / Math.max(1, d.total_bytes)) * 100
              );
              return (
                <div
                  key={i}
                  className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-3"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2.5">
                      <HardDrive className="w-4 h-4 text-amber-400" />
                      <div>
                        <span className="font-semibold text-slate-200 text-sm">
                          {d.name || d.mount_point}
                        </span>
                        <span className="text-[11px] text-slate-500 block">
                          Koppelpunt: {d.mount_point} ({d.file_system})
                        </span>
                      </div>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-slate-400">
                      {d.disk_type}
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>{formatBytes(d.total_bytes - d.available_bytes)} gebruikt</span>
                      <span>{formatBytes(d.total_bytes)} totaal</span>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-amber-400 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${usedPercent}%` }}
                      />
                    </div>
                    <div className="text-[11px] text-emerald-400 text-right">
                      {formatBytes(d.available_bytes)} vrij ({100 - usedPercent}%)
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
            className={`p-4 rounded-xl border ${
              diskResult.success
                ? "bg-emerald-950/30 border-emerald-800/80 text-emerald-300"
                : "bg-red-950/30 border-red-800/80 text-red-300"
            } space-y-2`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold">
                {diskResult.success ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                )}
                <span>{diskResult.test_name} - {diskResult.success ? "Geslaagd" : "Mislukt"}</span>
              </div>
              <span className="font-mono font-bold text-lg">
                {diskResult.score_or_speed.toFixed(1)} {diskResult.unit}
              </span>
            </div>
            <p className="text-xs opacity-90">{diskResult.details}</p>
          </div>
        )}
      </div>
    </div>
  );
};
