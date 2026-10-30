import React, { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
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
import { MetricsHistory, MetricsSample } from "../../types";
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

    invoke<MetricsHistory>("get_metrics_history")
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
    const temp: ChartSeries[] = [{ key: "temp", label: "Max. temperatuur", values: tempValues }];
    const freqValues = samples.map((s) => (s.cpu_freq_avg_mhz > 0 ? s.cpu_freq_avg_mhz : null));
    const freq: ChartSeries[] = [{ key: "freq", label: "Gem. frequentie", values: freqValues }];
    const disk: ChartSeries[] = [
      { key: "read", label: "Lezen", values: samples.map((s) => s.disk_read_bytes_per_sec) },
      { key: "write", label: "Schrijven", values: samples.map((s) => s.disk_write_bytes_per_sec) },
    ];
    const net: ChartSeries[] = [
      { key: "rx", label: "Ontvangen", values: samples.map((s) => s.net_rx_bytes_per_sec) },
      { key: "tx", label: "Verzonden", values: samples.map((s) => s.net_tx_bytes_per_sec) },
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
  }, [samples]);

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
              Live Monitor
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Elke seconde een meting van CPU, geheugen, temperatuur, kloksnelheid, schijf- en netwerkverkeer. De grafieken tonen de laatste 5 minuten; onderbrekingen in een lijn wijzen op een moment waarop het systeem stilstond.
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
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> Live
                </>
              ) : conn === "fout" ? (
                <>
                  <AlertTriangle className="w-4 h-4" /> Geen verbinding met de monitor
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-slate-500 animate-pulse" /> Verbinden…
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
                <LineChart className="w-3.5 h-3.5" /> Grafieken
              </button>
              <button
                onClick={() => setShowTable(true)}
                className={cn(
                  "px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400",
                  showTable ? "bg-cyan-500 text-slate-950" : "text-slate-400 hover:text-white"
                )}
              >
                <Table2 className="w-3.5 h-3.5" /> Tabel
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
            sub={samples.length ? `Gem. ${formatPercent(derived.avgCpu)} · piek ${formatPercent(derived.peakCpu)}` : "Wachten op meting"}
          />
          <StatTile
            icon={<MemoryStick className="w-3.5 h-3.5 text-cyan-400" />}
            label="RAM"
            value={latest ? formatPercent(latest.ram_used_percent) : "—"}
            sub={latest ? `Swap ${formatPercent(latest.swap_used_percent)}` : undefined}
          />
          <StatTile
            icon={<Thermometer className="w-3.5 h-3.5 text-cyan-400" />}
            label="Max. temp"
            value={latest && latest.max_temp_celsius !== null ? formatTemp(latest.max_temp_celsius) : "n.v.t."}
            sub={
              latest && latest.max_temp_celsius !== null && latest.max_temp_celsius >= 90 ? (
                <span className="flex items-center gap-1 text-rose-400">
                  <AlertTriangle className="w-3 h-3" /> Throttling-risico
                </span>
              ) : derived.peakTemp !== null ? (
                `Piek ${formatTemp(derived.peakTemp)}`
              ) : (
                "Geen sensoren gevonden"
              )
            }
          />
          <StatTile
            icon={<Gauge className="w-3.5 h-3.5 text-cyan-400" />}
            label="Kloksnelheid"
            value={latest && latest.cpu_freq_avg_mhz > 0 ? formatFreq(latest.cpu_freq_avg_mhz) : "n.v.t."}
            sub="Gemiddeld over alle kernen"
          />
          <StatTile
            icon={<HardDrive className="w-3.5 h-3.5 text-cyan-400" />}
            label="Schijf"
            value={latest ? formatRate(latest.disk_read_bytes_per_sec + latest.disk_write_bytes_per_sec) : "—"}
            sub={latest ? `L ${formatRate(latest.disk_read_bytes_per_sec)} · S ${formatRate(latest.disk_write_bytes_per_sec)}` : undefined}
          />
          <StatTile
            icon={<Network className="w-3.5 h-3.5 text-cyan-400" />}
            label="Netwerk"
            value={latest ? formatRate(latest.net_rx_bytes_per_sec + latest.net_tx_bytes_per_sec) : "—"}
            sub={latest ? `↓ ${formatRate(latest.net_rx_bytes_per_sec)} · ↑ ${formatRate(latest.net_tx_bytes_per_sec)}` : undefined}
          />
        </div>

        <div className="text-xs text-slate-500">
          {samples.length > 0
            ? `${samples.length} metingen in buffer (${Math.floor(spanSec / 60)} min ${spanSec % 60} s) · laatste om ${formatClock(latest!.at_epoch_ms)}`
            : conn === "fout"
            ? "De achtergrondmonitor reageert niet. Start de app opnieuw als dit blijft."
            : "De eerste meting verschijnt binnen enkele seconden."}
        </div>
      </div>

      {showTable ? (
        <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Table2 className="w-4 h-4 text-cyan-400" />
            Laatste 20 metingen
          </h3>
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-xs">
              <thead className="bg-slate-950/80 text-slate-400">
                <tr>
                  {["Tijd", "CPU", "RAM", "Temp", "Klok", "Schijf lezen", "Schijf schrijven", "Ontvangen", "Verzonden"].map((h, i) => (
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
                      Nog geen metingen ontvangen.
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
            title="CPU-belasting"
            subtitle="Percentage van de hele processor"
            current={latest ? formatPercent(latest.cpu_usage) : undefined}
          >
            <TimeSeriesChart
              times={times}
              series={derived.cpu}
              windowMs={WINDOW_MS}
              yTicks={PERCENT_TICKS}
              formatTick={(v) => `${v}%`}
              formatValue={formatPercent}
              ariaLabel="CPU-belasting van de laatste 5 minuten"
            />
          </ChartCard>

          <ChartCard
            icon={<MemoryStick className="w-4 h-4 text-cyan-400" />}
            title="Geheugengebruik"
            subtitle="Percentage van het fysieke RAM in gebruik"
            current={latest ? formatPercent(latest.ram_used_percent) : undefined}
          >
            <TimeSeriesChart
              times={times}
              series={derived.ram}
              windowMs={WINDOW_MS}
              yTicks={PERCENT_TICKS}
              formatTick={(v) => `${v}%`}
              formatValue={formatPercent}
              ariaLabel="Geheugengebruik van de laatste 5 minuten"
            />
          </ChartCard>

          <ChartCard
            icon={<Thermometer className="w-4 h-4 text-cyan-400" />}
            title="Maximale temperatuur"
            subtitle="Hoogste waarde over alle uitleesbare sensoren"
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
                ariaLabel="Maximale temperatuur van de laatste 5 minuten"
              />
            ) : (
              <div className="h-44 p-4 bg-slate-950/50 rounded-xl border border-slate-800 text-xs text-slate-400 flex flex-col items-center justify-center text-center gap-2">
                <Thermometer className="w-5 h-5 text-slate-600" />
                <span className="font-semibold text-slate-300">Geen temperatuursensoren gevonden</span>
                <span className="max-w-sm">
                  Windows geeft sensorwaarden vaak alleen via fabrikantsoftware vrij (en in WSL/VM's zijn ze er niet). Bekijk het tabblad Koeling voor een uitgebreidere uitlezing.
                </span>
              </div>
            )}
          </ChartCard>

          <ChartCard
            icon={<Gauge className="w-4 h-4 text-cyan-400" />}
            title="Kloksnelheid"
            subtitle="Gemiddelde frequentie over alle kernen"
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
                ariaLabel="Gemiddelde kloksnelheid van de laatste 5 minuten"
              />
            ) : (
              <div className="h-44 p-4 bg-slate-950/50 rounded-xl border border-slate-800 text-xs text-slate-400 flex items-center justify-center text-center">
                Kloksnelheid kan op dit systeem niet worden uitgelezen.
              </div>
            )}
          </ChartCard>

          <ChartCard
            icon={<HardDrive className="w-4 h-4 text-cyan-400" />}
            title="Schijfactiviteit"
            subtitle="Bytes per seconde, alle schijven samen"
            legend={[
              { label: "Lezen", value: latest ? formatRate(latest.disk_read_bytes_per_sec) : "—" },
              { label: "Schrijven", value: latest ? formatRate(latest.disk_write_bytes_per_sec) : "—" },
            ]}
          >
            <TimeSeriesChart
              times={times}
              series={derived.disk}
              windowMs={WINDOW_MS}
              yTicks={derived.diskTicks}
              formatTick={formatByteTick}
              formatValue={formatRate}
              ariaLabel="Schijf lezen en schrijven van de laatste 5 minuten"
            />
          </ChartCard>

          <ChartCard
            icon={<Network className="w-4 h-4 text-cyan-400" />}
            title="Netwerkverkeer"
            subtitle="Bytes per seconde, alle adapters samen"
            legend={[
              { label: "Ontvangen", value: latest ? formatRate(latest.net_rx_bytes_per_sec) : "—" },
              { label: "Verzonden", value: latest ? formatRate(latest.net_tx_bytes_per_sec) : "—" },
            ]}
          >
            <TimeSeriesChart
              times={times}
              series={derived.net}
              windowMs={WINDOW_MS}
              yTicks={derived.netTicks}
              formatTick={formatByteTick}
              formatValue={formatRate}
              ariaLabel="Netwerk ontvangen en verzonden van de laatste 5 minuten"
            />
          </ChartCard>
        </div>
      )}
    </div>
  );
};
