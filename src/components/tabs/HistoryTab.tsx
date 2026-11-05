import React, { useEffect } from "react";
import { History, RefreshCw, Trash2 } from "lucide-react";
import { useT } from "../../i18n";
import { useDiagnosticsStore } from "../../store/diagnosticsStore";
import { scorePolyline, summarizeFreezes } from "../../utils/historyStats";
import { cn } from "../../utils/cn";

const CHART_W = 600;
const CHART_H = 120;

export const HistoryTab: React.FC = () => {
  const t = useT();
  const history = useDiagnosticsStore((s) => s.history);
  const loading = useDiagnosticsStore((s) => !!s.busy.history);
  const load = useDiagnosticsStore((s) => s.loadHistory);
  const clear = useDiagnosticsStore((s) => s.clearHistory);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = summarizeFreezes(history?.freezes ?? [], Date.now());
  const maxPerDay = Math.max(1, ...summary.perDay);
  const health = history?.health ?? [];
  const recentFreezes = [...(history?.freezes ?? [])].reverse().slice(0, 25);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <History className="w-5 h-5 text-slate-200" /> {t("history.title")}
          </h2>
          <p className="text-xs text-slate-400 max-w-3xl">{t("history.intro")}</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-2 cursor-pointer"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} /> {t("history.refresh")}
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm(t("history.confirmClear"))) void clear();
            }}
            className="px-3 py-2 rounded-lg border border-red-900 text-red-300 hover:bg-red-950/40 text-xs font-semibold flex items-center gap-2 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" /> {t("history.clear")}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(
          [
            ["history.freezes", String(summary.total)],
            ["history.freezes7d", String(summary.last7d)],
            ["history.freezes30d", String(summary.last30d)],
            ["history.longest", summary.longestMs ? `${(summary.longestMs / 1000).toFixed(1)} s` : "–"],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="p-4 bg-slate-900/80 border border-slate-800 rounded-2xl">
            <div className="text-[10px] uppercase text-slate-500">{t(k)}</div>
            <div className="text-2xl font-mono text-white">{v}</div>
          </div>
        ))}
      </div>

      <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-2xl">
        <h3 className="text-sm font-semibold text-white mb-3">{t("history.freezes")} · 14 d</h3>
        <div className="flex items-end gap-1 h-24" role="img" aria-label={`${t("history.freezes")} per dag`}>
          {summary.perDay.map((n, i) => (
            <div key={i} className="flex-1 flex flex-col justify-end h-full" title={`${n}`}>
              <div className={cn("rounded-t", n > 0 ? "bg-rose-500" : "bg-slate-800")} style={{ height: `${Math.max(4, (n / maxPerDay) * 100)}%` }} />
            </div>
          ))}
        </div>
      </div>

      <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-2xl">
        <h3 className="text-sm font-semibold text-white mb-3">{t("history.scores")}</h3>
        {health.length === 0 ? (
          <p className="text-xs text-slate-500">{t("history.noScores")}</p>
        ) : (
          <>
            <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full h-32" preserveAspectRatio="none" role="img" aria-label={t("history.scores")}>
              {[25, 50, 75].map((g) => (
                <line key={g} x1={0} x2={CHART_W} y1={CHART_H - (g / 100) * CHART_H} y2={CHART_H - (g / 100) * CHART_H} stroke="#1e293b" strokeWidth={1} />
              ))}
              <polyline points={scorePolyline(health, CHART_W, CHART_H)} fill="none" stroke="#22d3ee" strokeWidth={2} vectorEffect="non-scaling-stroke" />
            </svg>
            <table className="w-full text-xs mt-3">
              <thead className="text-slate-500 text-left">
                <tr>
                  <th className="py-1">{t("history.when")}</th>
                  <th>{t("history.score")}</th>
                  <th>{t("history.topIssue")}</th>
                </tr>
              </thead>
              <tbody>
                {[...health].reverse().slice(0, 10).map((h) => (
                  <tr key={h.at_epoch_ms} className="border-t border-slate-800 text-slate-300">
                    <td className="py-1 pr-3 whitespace-nowrap">{new Date(h.at_epoch_ms).toLocaleString()}</td>
                    <td className="pr-3 font-mono">
                      {h.grade} · {h.score}
                    </td>
                    <td className="text-slate-400">{h.top_issue ?? "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-2xl">
        <h3 className="text-sm font-semibold text-white mb-3">{t("history.freezes")}</h3>
        {recentFreezes.length === 0 ? (
          <p className="text-xs text-slate-500">{t("history.noFreezes")}</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="text-slate-500 text-left">
              <tr>
                <th className="py-1">{t("history.when")}</th>
                <th>{t("history.duration")}</th>
              </tr>
            </thead>
            <tbody>
              {recentFreezes.map((f) => (
                <tr key={f.at_epoch_ms} className="border-t border-slate-800 text-slate-300">
                  <td className="py-1 pr-3">{new Date(f.at_epoch_ms).toLocaleString()}</td>
                  <td className="font-mono">{(f.duration_ms / 1000).toFixed(2)} s</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
