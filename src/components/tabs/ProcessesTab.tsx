import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, errorMessage } from "../../lib/api";
import { AlertTriangle, Cpu, HardDrive, ListTree, MemoryStick, Snowflake, Zap } from "lucide-react";
import { FreezeProcessContext, ProcessInfo, ProcessSnapshot } from "../../types";
import { formatBytes } from "../../utils/formatters";
import { SERIES_COLORS, formatClock, formatPercent, formatRate } from "../live/chartUtils";
import { cn } from "../../utils/cn";

type SortKey = "cpu" | "memory" | "disk";

const SORT_OPTIONS: { key: SortKey; label: string; icon: React.ReactNode }[] = [
  { key: "cpu", label: "CPU", icon: <Cpu className="w-3.5 h-3.5" /> },
  { key: "memory", label: "RAM", icon: <MemoryStick className="w-3.5 h-3.5" /> },
  { key: "disk", label: "Schijf", icon: <HardDrive className="w-3.5 h-3.5" /> },
];

const POLL_MS = 2000;
const FREEZE_POLL_MS = 5000;
const LIMIT = 15;

function diskTotal(p: ProcessInfo): number {
  return p.disk_read_bytes_per_sec + p.disk_write_bytes_per_sec;
}

function metricOf(p: ProcessInfo, key: SortKey): number {
  if (key === "memory") return p.memory_bytes;
  if (key === "disk") return diskTotal(p);
  return p.cpu_usage;
}

/** Klein meetlatje voor de sorteerkolom: vulling = aandeel t.o.v. de grootste in de lijst. */
const Meter: React.FC<{ fraction: number }> = ({ fraction }) => (
  <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden" aria-hidden>
    <div
      className="h-full rounded-full"
      style={{ width: `${Math.max(0, Math.min(1, fraction)) * 100}%`, backgroundColor: SERIES_COLORS[0] }}
    />
  </div>
);

interface AggregatedProcess {
  pid: number;
  name: string;
  avgCpu: number;
  peakCpu: number;
  peakMemory: number;
  seen: number;
}

/** Combineert de top-5 lijsten uit de metingen vóór een freeze tot één ranglijst. */
function aggregateBeforeFreeze(ctx: FreezeProcessContext): AggregatedProcess[] {
  const map = new Map<number, AggregatedProcess & { sumCpu: number }>();
  for (const s of ctx.samples_before) {
    for (const p of s.top_processes) {
      const cur = map.get(p.pid) ?? {
        pid: p.pid,
        name: p.name,
        avgCpu: 0,
        peakCpu: 0,
        peakMemory: 0,
        seen: 0,
        sumCpu: 0,
      };
      cur.sumCpu += p.cpu_usage;
      cur.peakCpu = Math.max(cur.peakCpu, p.cpu_usage);
      cur.peakMemory = Math.max(cur.peakMemory, p.memory_bytes);
      cur.seen += 1;
      map.set(p.pid, cur);
    }
  }
  const n = Math.max(1, ctx.samples_before.length);
  return Array.from(map.values())
    .map(({ sumCpu, ...rest }) => ({ ...rest, avgCpu: sumCpu / n }))
    .sort((a, b) => b.avgCpu - a.avgCpu || b.peakCpu - a.peakCpu)
    .slice(0, 5);
}

const FreezeCard: React.FC<{ ctx: FreezeProcessContext }> = ({ ctx }) => {
  const top = useMemo(() => aggregateBeforeFreeze(ctx), [ctx]);
  const last = ctx.samples_before.length ? ctx.samples_before[ctx.samples_before.length - 1] : null;
  const windowSec =
    ctx.samples_before.length > 1
      ? Math.round((ctx.freeze.at_epoch_ms - ctx.samples_before[0].at_epoch_ms) / 1000)
      : null;

  return (
    <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-rose-950 border border-rose-800 text-rose-400">
            <Snowflake className="w-4 h-4" />
          </div>
          <div>
            <span className="font-semibold text-slate-100 text-sm block">
              Freeze van {(ctx.freeze.duration_ms / 1000).toFixed(2)} s
            </span>
            <span className="text-xs text-slate-500">
              Begon om {formatClock(ctx.freeze.at_epoch_ms)} · gemeld {ctx.freeze.timestamp}
            </span>
          </div>
        </div>
        {last && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
            <span>
              CPU <span className="font-semibold text-slate-100">{formatPercent(last.cpu_usage)}</span>
            </span>
            <span>
              RAM <span className="font-semibold text-slate-100">{formatPercent(last.ram_used_percent)}</span>
            </span>
            <span>
              Schijf{" "}
              <span className="font-semibold text-slate-100">
                {formatRate(last.disk_read_bytes_per_sec + last.disk_write_bytes_per_sec)}
              </span>
            </span>
            {last.max_temp_celsius !== null && (
              <span>
                Temp <span className="font-semibold text-slate-100">{last.max_temp_celsius.toFixed(0)}°C</span>
              </span>
            )}
          </div>
        )}
      </div>

      {top.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-slate-500">
              <tr>
                <th className="text-left font-semibold py-1 pr-3">Proces</th>
                <th className="text-right font-semibold py-1 px-3">PID</th>
                <th className="text-right font-semibold py-1 px-3">Gem. CPU</th>
                <th className="text-right font-semibold py-1 px-3">Piek CPU</th>
                <th className="text-right font-semibold py-1 pl-3">Geheugen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 text-slate-300" style={{ fontVariantNumeric: "tabular-nums" }}>
              {top.map((p) => (
                <tr key={p.pid}>
                  <td className="py-1.5 pr-3 font-medium text-slate-200 truncate max-w-56" title={p.name}>
                    {p.name}
                  </td>
                  <td className="py-1.5 px-3 text-right text-slate-500">{p.pid}</td>
                  <td className="py-1.5 px-3 text-right">{formatPercent(p.avgCpu)}</td>
                  <td className="py-1.5 px-3 text-right">{formatPercent(p.peakCpu)}</td>
                  <td className="py-1.5 pl-3 text-right">{formatBytes(p.peakMemory)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-slate-500 mt-2">
            Gebaseerd op {ctx.samples_before.length} meting{ctx.samples_before.length === 1 ? "" : "en"}
            {windowSec !== null ? ` in de ${windowSec} s vóór de freeze` : " vlak vóór de freeze"}.
          </p>
        </div>
      ) : (
        <p className="text-xs text-slate-500">
          Geen metingen beschikbaar van vlak vóór deze freeze — hij gebeurde waarschijnlijk tijdens het opstarten van de monitor.
        </p>
      )}
    </div>
  );
};

export const ProcessesTab: React.FC = () => {
  const [sortBy, setSortBy] = useState<SortKey>("cpu");
  const [snapshot, setSnapshot] = useState<ProcessSnapshot | null>(null);
  const [snapshotSort, setSnapshotSort] = useState<SortKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [freezes, setFreezes] = useState<FreezeProcessContext[] | null>(null);
  const inFlight = useRef(false);

  const loadSnapshot = useCallback(async (key: SortKey, isCancelled: () => boolean) => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const snap = await api.getProcessSnapshot(key, LIMIT);
      if (!isCancelled()) {
        setSnapshot(snap);
        setSnapshotSort(key);
        setError(null);
      }
    } catch (e) {
      if (!isCancelled()) setError(errorMessage(e));
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const isCancelled = () => cancelled;
    inFlight.current = false;
    loadSnapshot(sortBy, isCancelled);
    const id = window.setInterval(() => loadSnapshot(sortBy, isCancelled), POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [sortBy, loadSnapshot]);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      api.getFreezeProcessContext()
        .then((list) => {
          if (!cancelled) setFreezes(list);
        })
        .catch(() => {
          if (!cancelled) setFreezes([]);
        });
    load();
    const id = window.setInterval(load, FREEZE_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const processes = snapshot?.processes ?? [];
  const maxMetric = Math.max(0, ...processes.map((p) => metricOf(p, sortBy)));
  const refetching = snapshotSort !== null && snapshotSort !== sortBy;
  const warming = snapshot !== null && snapshot.total_processes === 0;
  const freezesNewestFirst = useMemo(
    () => (freezes ? [...freezes].sort((a, b) => b.freeze.at_epoch_ms - a.freeze.at_epoch_ms) : []),
    [freezes]
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <ListTree className="w-5 h-5 text-cyan-400" />
              Procesmonitor
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              De zwaarste processen van dit moment, elke 2 seconden ververst. CPU is een percentage van de hele processor (alle kernen samen).
            </p>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-xl p-1 text-xs shrink-0">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => setSortBy(opt.key)}
                aria-pressed={sortBy === opt.key}
                className={cn(
                  "px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400",
                  sortBy === opt.key ? "bg-cyan-500 text-slate-950" : "text-slate-400 hover:text-white"
                )}
              >
                {opt.icon}
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="text-xs text-slate-500">
          {snapshot && snapshot.total_processes > 0
            ? `${snapshot.total_processes} processen actief · top ${processes.length} gesorteerd op ${
                SORT_OPTIONS.find((o) => o.key === sortBy)?.label
              } · meting van ${formatClock(snapshot.taken_at_epoch_ms)}`
            : error
            ? "Procesgegevens konden niet worden opgehaald."
            : "Eerste meting wordt verzameld…"}
        </div>

        {error && (
          <div className="p-3 bg-rose-950/40 border border-rose-900 rounded-xl text-xs text-rose-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        <div
          className={cn(
            "overflow-x-auto rounded-xl border border-slate-800 transition-opacity",
            refetching ? "opacity-50" : "opacity-100"
          )}
        >
          <table className="w-full text-xs">
            <thead className="bg-slate-950/80 text-slate-400">
              <tr>
                <th className="text-left font-semibold px-3 py-2">Proces</th>
                <th className="text-right font-semibold px-3 py-2">PID</th>
                <th className="text-right font-semibold px-3 py-2">CPU</th>
                <th className="text-right font-semibold px-3 py-2">Geheugen</th>
                <th className="text-right font-semibold px-3 py-2 whitespace-nowrap">Schijf lezen</th>
                <th className="text-right font-semibold px-3 py-2 whitespace-nowrap">Schijf schrijven</th>
                <th className="font-semibold px-3 py-2 w-32 text-left">
                  <span className="sr-only">Aandeel</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 text-slate-300" style={{ fontVariantNumeric: "tabular-nums" }}>
              {processes.map((p) => {
                const value = metricOf(p, sortBy);
                return (
                  <tr key={p.pid} className="hover:bg-slate-800/30">
                    <td className="px-3 py-2 font-medium text-slate-200 truncate max-w-64" title={p.name}>
                      {p.name}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-500">{p.pid}</td>
                    <td className={cn("px-3 py-2 text-right", sortBy === "cpu" && "text-slate-100 font-semibold")}>
                      {formatPercent(p.cpu_usage)}
                    </td>
                    <td className={cn("px-3 py-2 text-right", sortBy === "memory" && "text-slate-100 font-semibold")}>
                      {formatBytes(p.memory_bytes)}
                    </td>
                    <td className={cn("px-3 py-2 text-right", sortBy === "disk" && "text-slate-100 font-semibold")}>
                      {formatRate(p.disk_read_bytes_per_sec)}
                    </td>
                    <td className={cn("px-3 py-2 text-right", sortBy === "disk" && "text-slate-100 font-semibold")}>
                      {formatRate(p.disk_write_bytes_per_sec)}
                    </td>
                    <td className="px-3 py-2">
                      <Meter fraction={maxMetric > 0 ? value / maxMetric : 0} />
                    </td>
                  </tr>
                );
              })}
              {processes.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                    {warming || !snapshot
                      ? "De monitor verzamelt de eerste meting; de lijst verschijnt binnen enkele seconden."
                      : "Geen processen gevonden."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Processen vlak vóór een freeze */}
      <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-400" />
            Processen vlak vóór een freeze
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Welke processen het drukst waren in de seconden voordat het systeem vastliep. Handig om een terugkerende boosdoener (bijv. een updater, virusscanner of driverhulpprogramma) te herkennen.
          </p>
        </div>

        {freezes === null ? (
          <div className="p-4 bg-slate-950/50 rounded-xl border border-slate-800 text-xs text-slate-400">Laden…</div>
        ) : freezesNewestFirst.length === 0 ? (
          <div className="p-4 bg-slate-950/50 rounded-xl border border-slate-800 text-xs text-slate-400 flex items-start gap-2.5">
            <Snowflake className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <span>
              Nog geen freezes gedetecteerd sinds de app is gestart. De watchdog controleert continu of het systeem
              stilstaat en legt elke onderbreking van meer dan 1,2 seconde vast. Laat PC Checker op de achtergrond
              openstaan; zodra er een freeze optreedt, zie je hier welke processen vlak daarvoor de meeste CPU gebruikten.
            </span>
          </div>
        ) : (
          <div className="space-y-3">
            {freezesNewestFirst.map((ctx) => (
              <FreezeCard key={`${ctx.freeze.at_epoch_ms}-${ctx.freeze.duration_ms}`} ctx={ctx} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
