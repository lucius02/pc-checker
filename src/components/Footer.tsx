import React from "react";
import { formatUptime } from "../utils/formatters";
import { useT } from "../i18n";
import { useDiagnosticsStore } from "../store/diagnosticsStore";
import { cn } from "../utils/cn";

const APP_VERSION = "0.1.2";

/** Wat de achtergrondmetingen nu doen. */
export type ConnectionState = "live" | "paused" | "suspended" | "error";

const DOT: Record<ConnectionState, string> = {
  live: "bg-emerald-500",
  paused: "bg-slate-500",
  suspended: "bg-amber-400",
  error: "bg-red-500",
};

export const Footer: React.FC<{ connection: ConnectionState }> = ({ connection }) => {
  const t = useT();
  const data = useDiagnosticsStore((s) => s.data);
  const lastUpdated = useDiagnosticsStore((s) => s.lastUpdated);

  return (
    <footer className="shrink-0 border-t border-slate-800/60 bg-slate-950 px-4 py-2 text-xs text-slate-500 flex justify-between items-center gap-4 print:hidden">
      <div className="flex items-center gap-2 min-w-0">
        <span className={cn("w-2 h-2 rounded-full shrink-0", DOT[connection])} />
        <span className={cn("truncate", connection === "error" && "text-red-400")}>{t(`footer.conn.${connection}`)}</span>
        <span>•</span>
        <span className="hidden md:inline shrink-0">
          {t("footer.session")}{" "}
          {data ? `${formatUptime(data.session_uptime_secs)} (${data.session_started_at})` : t("footer.loading")}
        </span>
        <span className="hidden md:inline">•</span>
        <span className="shrink-0">
          {t("footer.lastMeasurement")} {data ? lastUpdated.toLocaleTimeString() : t("footer.none")}
        </span>
      </div>
      <span className="shrink-0 hidden sm:inline">
        PC Checker v{APP_VERSION} • {t("footer.platforms")}
      </span>
    </footer>
  );
};
