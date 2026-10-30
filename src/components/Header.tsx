import React from "react";
import { Activity, Laptop, PcCase, Clock, RefreshCw, FileDown } from "lucide-react";
import { SystemOverview, PowerInfo } from "../types";
import { formatUptime } from "../utils/formatters";
import { cn } from "../utils/cn";

interface HeaderProps {
  data: SystemOverview | null;
  powerData: PowerInfo | null;
  autoRefresh: boolean;
  setAutoRefresh: (val: boolean) => void;
  fetchOverview: () => void;
  isLoading: boolean;
  exportReport: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  data,
  powerData,
  autoRefresh,
  setAutoRefresh,
  fetchOverview,
  isLoading,
  exportReport,
}) => {
  return (
    <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md px-6 py-3.5 flex items-center justify-between sticky top-0 z-30">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-linear-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
          <Activity className="w-5 h-5 text-slate-950 font-bold" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold tracking-tight bg-linear-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
              PC CHECKER
            </h1>
            <span className="px-2 py-0.5 text-xs font-semibold bg-cyan-950/80 border border-cyan-800 text-cyan-400 rounded-full">
              Diagnostics Suite
            </span>
            {powerData && (
              <span className="px-2 py-0.5 text-xs font-medium bg-slate-800 text-slate-300 rounded-full border border-slate-700 flex items-center gap-1">
                {powerData.is_laptop ? (
                  <>
                    <Laptop className="w-3 h-3 text-cyan-400" /> Laptop
                  </>
                ) : (
                  <>
                    <PcCase className="w-3 h-3 text-cyan-400" /> Desktop PC
                  </>
                )}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400">
            Hardware tests, ventilatoren, stroom &amp; freeze detective
          </p>
        </div>
      </div>

      {/* Global System Quick Actions */}
      <div className="flex items-center gap-3">
        {data && (
          <div className="hidden md:flex items-center gap-2 text-xs bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg text-slate-300">
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            <span>
              <strong>Sessie:</strong> {formatUptime(data.session_uptime_secs)}
            </span>
            <span className="text-slate-500">({data.session_started_at})</span>
          </div>
        )}

        <button
          onClick={() => setAutoRefresh(!autoRefresh)}
          className={cn(
            "px-3 py-1.5 text-xs font-medium rounded-lg border flex items-center gap-1.5 transition-colors cursor-pointer",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400",
            autoRefresh
              ? "bg-emerald-950/50 border-emerald-800/80 text-emerald-400"
              : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
          )}
          title="Auto-refresh elke 3 seconden"
        >
          <span
            className={cn(
              "w-2 h-2 rounded-full",
              autoRefresh ? "bg-emerald-400 animate-pulse" : "bg-slate-600"
            )}
          />
          {autoRefresh ? "Live" : "Gepauzeerd"}
        </button>

        <button
          onClick={fetchOverview}
          disabled={isLoading}
          className={cn(
            "p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400",
            isLoading && "opacity-50 cursor-not-allowed"
          )}
          title="Nu vernieuwen"
        >
          <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
        </button>

        <button
          onClick={exportReport}
          className={cn(
            "px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-semibold text-xs flex items-center gap-1.5 shadow-md shadow-cyan-600/20 transition-colors cursor-pointer",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
          )}
        >
          <FileDown className="w-3.5 h-3.5" />
          Exporteer Rapport
        </button>
      </div>
    </header>
  );
};
