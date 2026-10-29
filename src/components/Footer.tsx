import React from "react";
import { SystemOverview } from "../types";
import { formatUptime } from "../utils/formatters";

interface FooterProps {
  data: SystemOverview | null;
  lastUpdated: Date;
}

export const Footer: React.FC<FooterProps> = ({ data, lastUpdated }) => {
  return (
    <footer className="border-t border-slate-900 bg-slate-950 px-6 py-2.5 text-xs text-slate-500 flex justify-between items-center">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-emerald-500" />
        <span>Status: Systeem Online</span>
        <span>•</span>
        <span>
          Sessie:{" "}
          {data
            ? `${formatUptime(data.session_uptime_secs)} (${data.session_started_at})`
            : "Bezig..."}
        </span>
        <span>•</span>
        <span>Watchdog Actief</span>
        <span>•</span>
        <span>Laatste meting: {lastUpdated.toLocaleTimeString()}</span>
      </div>
      <div>
        <span>PC Checker v0.2.0 • Windows, Linux &amp; macOS</span>
      </div>
    </footer>
  );
};
