import React from "react";
import { cn } from "../utils/cn";

export type ConnectionState = "live" | "paused" | "suspended" | "error";

interface FooterProps {
  connection: ConnectionState;
  lastUpdated: Date | null;
}

const CONNECTION: Record<ConnectionState, { label: string; dot: string }> = {
  live: { label: "Live metingen actief", dot: "bg-emerald-500" },
  paused: { label: "Metingen gepauzeerd", dot: "bg-slate-500" },
  suspended: { label: "Metingen gepauzeerd tijdens randapparatuurtest", dot: "bg-amber-400" },
  error: { label: "Geen verbinding met de backend", dot: "bg-red-500" },
};

export const Footer: React.FC<FooterProps> = ({ connection, lastUpdated }) => {
  const { label, dot } = CONNECTION[connection];

  return (
    <footer className="shrink-0 border-t border-slate-800/60 bg-slate-950 px-4 py-2 text-xs text-slate-500 flex justify-between items-center gap-4">
      <div className="flex items-center gap-2 min-w-0">
        <span className={cn("w-2 h-2 rounded-full shrink-0", dot)} />
        <span className={cn("truncate", connection === "error" && "text-red-400")}>{label}</span>
        <span>•</span>
        <span className="shrink-0">
          Laatste meting: {lastUpdated ? lastUpdated.toLocaleTimeString() : "nog geen"}
        </span>
      </div>
      <span className="shrink-0">PC Checker v0.2.0 • Windows, Linux &amp; macOS</span>
    </footer>
  );
};
