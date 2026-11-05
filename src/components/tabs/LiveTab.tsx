import React, { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import {
  Activity,
  AlertTriangle,
  Cpu,
  Gauge,
  HardDrive,
  MemoryStick,
  Network,
  Table2,
  Thermometer,
  LineChart,
} from "lucide-react";
import type { MetricsSample } from "../../types";
import { TimeSeriesChart, ChartSeries } from "../live/TimeSeriesChart";
import { StatTile, ChartCard } from "../live/LiveCards";
import {
  byteTicks,
  formatClock,
  formatPercent,
  formatRate,
  niceTicks,
} from "../live/chartUtils";
import { formatBytes } from "../../utils/formatters";
import { cn } from "../../utils/cn";
import { useT } from "../../i18n";

const MAX_SAMPLES = 300;
const WINDOW_MS = MAX_SAMPLES * 1000;
const PERCENT_TICKS = [0, 25, 50, 75, 100];

type ConnState = "verbinden" | "live" | "fout";

/** Voegt metingen samen, ontdubbelt op tijdstip en houdt de laatste MAX_SAMPLES. */
function mergeSamples(a: MetricsSample[], b: MetricsSample[]): MetricsSample[] {
  const byTime = new Map<number, MetricsSample>();
  for (const s of a) byTime.set(s.at_epoch_ms, s);
  for (const s of b) byTime.set(s.at_epoch_ms, s);
  const merged = Array.from(byTime.values()).sort((x, y) => x.at_epoch_ms - y.at_epoch_ms);
  return merged.length > MAX_SAMPLES ? merged.slice(merged.length - MAX_SAMPLES) : merged;
}

function formatFreq(mhz: number): string {
  return mhz >= 1000 ? `${(mhz / 1000).toFixed(2)} GHz` : `${Math.round(mhz)} MHz`;
}

function formatTemp(c: number): string {
  return `${c.toFixed(0)}°C`;
}

/** Korte as-labels zonder "/s" (de kaarttitel zegt al "per seconde"). */
function formatByteTick(v: number): string {
  return v === 0 ? "0" : formatBytes(v, 0);
}

export const LiveTab: React.FC = () => {
  const t = useT();
  const [samples, setSamples] = useState<MetricsSample[]>([]);
  const [conn, setConn] = useState<ConnState>("verbinden");
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let unlisten: UnlistenFn | null = null;

    listen<MetricsSample>("live-metrics", (event) => {
      if (cancelled) return;
      setConn("live");
      setSamples((prev) => mergeSamples(prev, [event.payload]));
    })
      .then((fn) => {
        // StrictMode / snelle unmount: listener alsnog opruimen.
        if (cancelled) fn();
        else unlisten = fn;
      })
      .catch(() => {
        if (!cancelled) setConn("fout");
      });

    api.getMetricsHistory()
      .then((history) => {
        if (cancelled) return;
        setSamples((prev) => mergeSamples(history.samples, prev));
        if (history.samples.length > 0) setConn("live");
      })
      .catch(() => {
        if (!cancelled) setConn("fout");
      });

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, []);

  const latest = samples.length ? samples[samples.length - 1] : null;
  const times = useMemo(() => samples.map((s) => s.at_epoch_ms), [samples]);

  const derived = useMemo(() => {
    const cpu: ChartSeries[] = [{ key: "cpu", label: "CPU", values: samples.map((s) => s.cpu_usage) }];
    const ram: ChartSeries[] = [{ key: "ram", label: "RAM", values: samples.map((s) => s.ram_used_percent) }];
    const tempValues = samples.map((s) => s.max_temp_celsius);
    const temp: ChartSeries[] = [{ key: "temp", label: t("live.series.temp"), values: tempValues }];
    const freqValues = samples.map((s) => (s.cpu_freq_avg_mhz > 0 ? s.cpu_freq_avg_mhz : null));
    const freq: ChartSeries[] = [{ key: "freq", label: t("live.series.freq"), values: freqValues }];
    const disk: ChartSeries[] = [
      { key: "read", label: t("live.read"), values: samples.map((s) => s.disk_read_bytes_per_sec) },
      { key: "write", label: t("live.write"), values: samples.map((s) => s.disk_write_bytes_per_sec) },
    ];
    const net: ChartSeries[] = [
      { key: "rx", label: t("live.rx"), values: samples.map((s) => s.net_rx_bytes_per_sec) },
      { key: "tx", label: t("live.tx"), values: samples.map((s) => s.net_tx_bytes_per_sec) },
    ];

    const temps = tempValues.filter((v): v is number => v !== null);
    const hasTemp = temps.length > 0;
    const maxTemp = hasTemp ? Math.max(...temps) : 0;
    const peakTemp = hasTemp ? maxTemp : null;
    const tempTicks = maxTemp > 100 ? niceTicks(maxTemp) : PERCENT_TICKS;

    const freqs = freqValues.filter((v): v is number => v !== null);
    const hasFreq = freqs.length > 0;
    const freqTicks = niceTicks(hasFreq ? Math.max(...freqs) * 1.05 : 1000);

    const diskMax = Math.max(0, ...samples.map((s) => Math.max(s.disk_read_bytes_per_sec, s.disk_write_bytes_per_sec)));
    const netMax = Math.max(0, ...samples.map((s) => Math.max(s.net_rx_bytes_per_sec, s.net_tx_bytes_per_sec)));

    const avgCpu = samples.length ? samples.reduce((acc, s) => acc + s.cpu_usage, 0) / samples.length : 0;
    const peakCpu = samples.length ? Math.max(...samples.map((s) => s.cpu_usage)) : 0;

    return {
      cpu,
      ram,
      temp,
      freq,
      disk,
      net,
      hasTemp,
      hasFreq,
      peakTemp,
      tempTicks,
      freqTicks,
      diskTicks: byteTicks(diskMax * 1.1),
      netTicks: byteTicks(netMax * 1.1),
      avgCpu,
      peakCpu,
    };
  }, [samples, t]);

  const tableRows = useMemo(() => samples.slice(-20).reverse(), [samples]);
  const spanSec = samples.length > 1 ? Math.round((samples[samples.length - 1].at_epoch_ms - samples[0].at_epoch_ms) / 1000) : 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Kop */}
      <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-cyan-400" />
              {t("live.title")}
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              {t("live.intro")}
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span
              className={cn(
                "px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-2",
                conn === "live"
                  ? "bg-emerald-950 border-emerald-800 text-emerald-400"
                  : conn === "fout"
                  ? "bg-rose-950 border-rose-800 text-rose-400"
                  : "bg-slate-950 border-slate-800 text-slate-400"
              )}
            >
              {conn === "live" ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> {t("live.live")}
                </>
              ) : conn === "fout" ? (
                <>
                  <AlertTriangle className="w-4 h-4" /> {t("live.noConnection")}
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-slate-500 animate-pulse" /> {t("live.connecting")}
                </>
              )}
            </span>
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-xl p-1 text-xs">
              <button
                onClick={() => setShowTable(false)}
                className={cn(
                  "px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400",
                  !showTable ? "bg-cyan-500 text-slate-950" : "text-slate-400 hover:text-white"
                )}
              >
                <LineChart className="w-3.5 h-3.5" /> {t("live.charts")}
              </button>
              <button
                onClick={() => setShowTable(true)}
                className={cn(
                  "px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400",
                  showTable ? "bg-cyan-500 text-slate-950" : "text-slate-400 hover:text-white"
                )}
              >
                <Table2 className="w-3.5 h-3.5" /> {t("live.table")}
              </button>
            </div>
          </div>
        </div>

        {/* Actuele waarden */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <StatTile
            icon={<Cpu className="w-3.5 h-3.5 text-cyan-400" />}
            label="CPU"
            value={latest ? formatPercent(latest.cpu_usage) : "—"}
            sub={samples.length ? t("live.cpuSub", { avg: formatPercent(derived.avgCpu), peak: formatPercent(derived.peakCpu) }) : t("live.waiting")}
          />
          <StatTile
            icon={<MemoryStick className="w-3.5 h-3.5 text-cyan-400" />}
            label="RAM"
            value={latest ? formatPercent(latest.ram_used_percent) : "—"}
            sub={latest ? t("live.swap", { v: formatPercent(latest.swap_used_percent) }) : undefined}
          />
          <StatTile
            icon={<Thermometer className="w-3.5 h-3.5 text-cyan-400" />}
            label={t("live.maxTemp")}
            value={latest && latest.max_temp_celsius !== null ? formatTemp(latest.max_temp_celsius) : t("live.na")}
            sub={
              latest && latest.max_temp_celsius !== null && latest.max_temp_celsius >= 90 ? (
                <span className="flex items-center gap-1 text-rose-400">
                  <AlertTriangle className="w-3 h-3" /> {t("live.throttleRisk")}
                </span>
              ) : derived.peakTemp !== null ? (
                t("live.peak", { v: formatTemp(derived.peakTemp) })
              ) : (
                t("live.noSensors")
              )
            }
          />
          <StatTile
            icon={<Gauge className="w-3.5 h-3.5 text-cyan-400" />}
            label={t("live.clock")}
            value={latest && latest.cpu_freq_avg_mhz > 0 ? formatFreq(latest.cpu_freq_avg_mhz) : t("live.na")}
            sub={t("live.avgAllCores")}
          />
          <StatTile
            icon={<HardDrive className="w-3.5 h-3.5 text-cyan-400" />}
            label={t("live.disk")}
            value={latest ? formatRate(latest.disk_read_bytes_per_sec + latest.disk_write_bytes_per_sec) : "—"}
            sub={latest ? t("live.diskSub", { r: formatRate(latest.disk_read_bytes_per_sec), w: formatRate(latest.disk_write_bytes_per_sec) }) : undefined}
          />
          <StatTile
            icon={<Network className="w-3.5 h-3.5 text-cyan-400" />}
            label={t("live.network")}
            value={latest ? formatRate(latest.net_rx_bytes_per_sec + latest.net_tx_bytes_per_sec) : "—"}
            sub={latest ? `↓ ${formatRate(latest.net_rx_bytes_per_sec)} · ↑ ${formatRate(latest.net_tx_bytes_per_sec)}` : undefined}
          />
        </div>

        <div className="text-xs text-slate-500">
          {samples.length > 0
            ? t("live.bufferInfo", { n: samples.length, m: Math.floor(spanSec / 60), s: spanSec % 60, t: formatClock(latest!.at_epoch_ms) })
            : conn === "fout"
            ? t("live.monitorDown")
            : t("live.firstSoon")}
        </div>
      </div>

      {showTable ? (
        <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Table2 className="w-4 h-4 text-cyan-400" />
            {t("live.last20")}
          </h3>
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-xs">
              <thead className="bg-slate-950/80 text-slate-400">
                <tr>
                  {[t("live.col.time"), "CPU", "RAM", t("live.col.temp"), t("live.col.clock"), t("live.col.diskRead"), t("live.col.diskWrite"), t("live.rx"), t("live.tx")].map((h, i) => (
                    <th key={h} className={cn("px-3 py-2 font-semibold whitespace-nowrap", i === 0 ? "text-left" : "text-right")}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70" style={{ fontVariantNumeric: "tabular-nums" }}>
                {tableRows.map((s) => (
                  <tr key={s.at_epoch_ms} className="text-slate-300 hover:bg-slate-800/30">
                    <td className="px-3 py-1.5 text-slate-400">{formatClock(s.at_epoch_ms)}</td>
                    <td className="px-3 py-1.5 text-right">{formatPercent(s.cpu_usage)}</td>
                    <td className="px-3 py-1.5 text-right">{formatPercent(s.ram_used_percent)}</td>
                    <td className="px-3 py-1.5 text-right">{s.max_temp_celsius !== null ? formatTemp(s.max_temp_celsius) : "—"}</td>
                    <td className="px-3 py-1.5 text-right">{s.cpu_freq_avg_mhz > 0 ? formatFreq(s.cpu_freq_avg_mhz) : "—"}</td>
                    <td className="px-3 py-1.5 text-right">{formatRate(s.disk_read_bytes_per_sec)}</td>
                    <td className="px-3 py-1.5 text-right">{formatRate(s.disk_write_bytes_per_sec)}</td>
                    <td className="px-3 py-1.5 text-right">{formatRate(s.net_rx_bytes_per_sec)}</td>
                    <td className="px-3 py-1.5 text-right">{formatRate(s.net_tx_bytes_per_sec)}</td>
                  </tr>
                ))}
                {tableRows.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-3 py-4 text-center text-slate-500">
                      {t("live.noSamples")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard
            icon={<Cpu className="w-4 h-4 text-cyan-400" />}
            title={t("live.cpuTitle")}
            subtitle={t("live.cpuSubtitle")}
            current={latest ? formatPercent(latest.cpu_usage) : undefined}
          >
            <TimeSeriesChart
              times={times}
              series={derived.cpu}
              windowMs={WINDOW_MS}
              yTicks={PERCENT_TICKS}
              formatTick={(v) => `${v}%`}
              formatValue={formatPercent}
              ariaLabel={t("live.cpuAria")}
            />
          </ChartCard>

          <ChartCard
            icon={<MemoryStick className="w-4 h-4 text-cyan-400" />}
            title={t("live.ramTitle")}
            subtitle={t("live.ramSubtitle")}
            current={latest ? formatPercent(latest.ram_used_percent) : undefined}
          >
            <TimeSeriesChart
              times={times}
              series={derived.ram}
              windowMs={WINDOW_MS}
              yTicks={PERCENT_TICKS}
              formatTick={(v) => `${v}%`}
              formatValue={formatPercent}
              ariaLabel={t("live.ramAria")}
            />
          </ChartCard>

          <ChartCard
            icon={<Thermometer className="w-4 h-4 text-cyan-400" />}
            title={t("live.tempTitle")}
            subtitle={t("live.tempSubtitle")}
            current={latest && latest.max_temp_celsius !== null ? formatTemp(latest.max_temp_celsius) : undefined}
          >
            {derived.hasTemp ? (
              <TimeSeriesChart
                times={times}
                series={derived.temp}
                windowMs={WINDOW_MS}
                yTicks={derived.tempTicks}
                formatTick={(v) => `${v}°`}
                formatValue={(v) => `${v.toFixed(1)}°C`}
                ariaLabel={t("live.tempAria")}
              />
            ) : (
              <div className="h-44 p-4 bg-slate-950/50 rounded-xl border border-slate-800 text-xs text-slate-400 flex flex-col items-center justify-center text-center gap-2">
                <Thermometer className="w-5 h-5 text-slate-600" />
                <span className="font-semibold text-slate-300">{t("live.noTempSensors")}</span>
                <span className="max-w-sm">
                  {t("live.noTempHint")}
                </span>
              </div>
            )}
          </ChartCard>

          <ChartCard
            icon={<Gauge className="w-4 h-4 text-cyan-400" />}
            title={t("live.clock")}
            subtitle={t("live.freqSubtitle")}
            current={latest && latest.cpu_freq_avg_mhz > 0 ? formatFreq(latest.cpu_freq_avg_mhz) : undefined}
          >
            {derived.hasFreq ? (
              <TimeSeriesChart
                times={times}
                series={derived.freq}
                windowMs={WINDOW_MS}
                yTicks={derived.freqTicks}
                formatTick={(v) => (v === 0 ? "0" : `${(v / 1000).toFixed(1)} GHz`)}
                formatValue={formatFreq}
                ariaLabel={t("live.freqAria")}
              />
            ) : (
              <div className="h-44 p-4 bg-slate-950/50 rounded-xl border border-slate-800 text-xs text-slate-400 flex items-center justify-center text-center">
                {t("live.noFreq")}
              </div>
            )}
          </ChartCard>

          <ChartCard
            icon={<HardDrive className="w-4 h-4 text-cyan-400" />}
            title={t("live.diskTitle")}
            subtitle={t("live.diskSubtitle")}
            legend={[
              { label: t("live.read"), value: latest ? formatRate(latest.disk_read_bytes_per_sec) : "—" },
              { label: t("live.write"), value: latest ? formatRate(latest.disk_write_bytes_per_sec) : "—" },
            ]}
          >
            <TimeSeriesChart
              times={times}
              series={derived.disk}
              windowMs={WINDOW_MS}
              yTicks={derived.diskTicks}
              formatTick={formatByteTick}
              formatValue={formatRate}
              ariaLabel={t("live.diskAria")}
            />
          </ChartCard>

          <ChartCard
            icon={<Network className="w-4 h-4 text-cyan-400" />}
            title={t("live.netTitle")}
            subtitle={t("live.netSubtitle")}
            legend={[
              { label: t("live.rx"), value: latest ? formatRate(latest.net_rx_bytes_per_sec) : "—" },
              { label: t("live.tx"), value: latest ? formatRate(latest.net_tx_bytes_per_sec) : "—" },
            ]}
          >
            <TimeSeriesChart
              times={times}
              series={derived.net}
              windowMs={WINDOW_MS}
              yTicks={derived.netTicks}
              formatTick={formatByteTick}
              formatValue={formatRate}
              ariaLabel={t("live.netAria")}
            />
          </ChartCard>
        </div>
      )}
    </div>
  );
};
