import React from "react";
import { formatUptime } from "../utils/formatters";
import { useT } from "../i18n";
import { useDiagnosticsStore } from "../store/diagnosticsStore";
import { useUiStore } from "../store/uiStore";
import { BUSY_META } from "../lib/tabActions";
import { cn } from "../utils/cn";
import { Loader2 } from "lucide-react";
import type { BusyKey } from "../store/diagnosticsStore";

const APP_VERSION = "0.1.2";

/** Wat de achtergrondmetingen nu doen. */
export type ConnectionState = "live" | "paused" | "suspended" | "error";

const DOT: Record<ConnectionState, string> = {
  live: "bg-emerald-500",
  paused: "bg-slate-500",
  suspended: "bg-amber-400",
  error: "bg-red-500",
};

/** Lopende tests, altijd zichtbaar; een klik springt naar het tabblad van de test. */
const RunningTasks: React.FC = () => {
  const t = useT();
  const busy = useDiagnosticsStore((s) => s.busy);
  const healthRun = useDiagnosticsStore((s) => s.healthRun);
  const navigate = useUiStore((s) => s.navigate);
  const running = (Object.keys(busy) as BusyKey[]).filter((k) => busy[k] && BUSY_META[k]);
  if (running.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 min-w-0" role="status" aria-live="polite">
      {healthRun && (
        <span className="text-slate-400 shrink-0 tabular-nums">
          {healthRun.index + 1}/{healthRun.steps.length}
        </span>
      )}
      {running.map((key) => {
        const meta = BUSY_META[key]!;
        return (
          <button
            key={key}
            type="button"
            onClick={() => navigate(meta.tab)}
            title={t("footer.goToTest")}
            className="-my-1 px-2 py-0.5 rounded-md border border-cyan-800/80 bg-cyan-950/60 text-cyan-300 hover:bg-cyan-900/60 flex items-center gap-1.5 min-w-0 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cyan-400"
          >
            <Loader2 className="w-3 h-3 animate-spin shrink-0" />
            <span className="truncate">{t("blk.running", { name: t(meta.label) })}</span>
          </button>
        );
      })}
    </div>
  );
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
      <RunningTasks />
      <span className="shrink-0 hidden lg:inline">
        PC Checker v{APP_VERSION} • {t("footer.platforms")}
      </span>
    </footer>
  );
};
