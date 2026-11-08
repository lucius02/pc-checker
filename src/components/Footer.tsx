import React from "react";
import { formatUptime } from "../utils/formatters";
import { useT } from "../i18n";
import { useDiagnosticsStore } from "../store/diagnosticsStore";

const APP_VERSION = "0.1.1";

export const Footer: React.FC = () => {
  const t = useT();
  const data = useDiagnosticsStore((s) => s.data);
  const lastUpdated = useDiagnosticsStore((s) => s.lastUpdated);

  return (
    <footer className="border-t border-slate-900 bg-slate-950 px-6 py-2.5 text-xs text-slate-500 flex justify-between items-center gap-4 print:hidden">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="w-2 h-2 rounded-full bg-emerald-500" />
        <span>{t("footer.online")}</span>
        <span>•</span>
        <span>
          {t("footer.session")}{" "}
          {data ? `${formatUptime(data.session_uptime_secs)} (${data.session_started_at})` : t("footer.loading")}
        </span>
        <span>•</span>
        <span>{t("footer.watchdog")}</span>
        <span>•</span>
        <span>
          {t("footer.lastMeasurement")} {lastUpdated.toLocaleTimeString()}
        </span>
      </div>
      <div className="shrink-0">
        <span>
          PC Checker v{APP_VERSION} • {t("footer.platforms")}
        </span>
      </div>
    </footer>
  );
};
