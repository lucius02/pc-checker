import React, { useId, useMemo } from "react";
import { ArrowRight, Cpu, HardDrive, MemoryStick, Network, Thermometer, type LucideIcon } from "lucide-react";
import { useLiveMetricsStore } from "../../../store/liveMetricsStore";
import { formatPercent, formatRate } from "../../live/chartUtils";
import { useT } from "../../../i18n";
import type { TabType } from "../../../types";
import { cn } from "../../../utils/cn";

/** Aantal metingen (= seconden) in de minigrafiek. */
const WINDOW = 60;
const W = 120;
const H = 32;

/** Minigrafiek zonder assen; ontbrekende metingen (null) onderbreken de lijn. */
const Sparkline: React.FC<{ values: (number | null)[]; max: number; color: string }> = ({ values, max, color }) => {
  const gradientId = useId();
  const paths = useMemo(() => {
    // Rechts uitgelijnd: de nieuwste meting staat altijd tegen de rechterrand.
    const offset = WINDOW - values.length;
    const x = (i: number) => ((offset + i) / (WINDOW - 1)) * W;
    const y = (v: number) => H - 1 - (Math.min(max, Math.max(0, v)) / Math.max(1, max)) * (H - 2);
    const segments: string[][] = [];
    let current: string[] = [];
    values.forEach((v, i) => {
      if (v === null) {
        if (current.length) segments.push(current);
        current = [];
      } else {
        current.push(`${x(i).toFixed(1)},${y(v).toFixed(1)}`);
      }
    });
    if (current.length) segments.push(current);
    return segments
      .filter((seg) => seg.length > 1)
      .map((seg) => {
        const line = `M${seg.join("L")}`;
        const firstX = seg[0].split(",")[0];
        const lastX = seg[seg.length - 1].split(",")[0];
        return { line, area: `${line}L${lastX},${H}L${firstX},${H}Z` };
      });
  }, [values, max]);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-8 block" aria-hidden>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.35} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {paths.map((p, i) => (
        <g key={i}>
          <path d={p.area} fill={`url(#${gradientId})`} />
          <path d={p.line} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        </g>
      ))}
    </svg>
  );
};

interface Vital {
  key: string;
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  values: (number | null)[];
  max: number;
  color: string;
  /** Hoge waarde: de tegel kleurt mee, zodat een piek opvalt. */
  hot?: boolean;
}

/**
 * Live meters boven aan het overzicht: elke seconde een nieuwe waarde met het verloop van de
 * laatste minuut. Een klik opent de Live Monitor met de volledige grafieken.
 */
export const LiveVitals: React.FC<{ onOpen: (tab: TabType) => void }> = ({ onOpen }) => {
  const t = useT();
  const samples = useLiveMetricsStore((s) => s.samples);
  const conn = useLiveMetricsStore((s) => s.conn);

  const vitals = useMemo<Vital[]>(() => {
    const recent = samples.slice(-WINDOW);
    const latest = recent[recent.length - 1];
    const temps = recent.map((s) => s.max_temp_celsius);
    const hasTemp = temps.some((v) => v !== null);
    const net = recent.map((s) => s.net_rx_bytes_per_sec + s.net_tx_bytes_per_sec);
    const disk = recent.map((s) => s.disk_read_bytes_per_sec + s.disk_write_bytes_per_sec);
    const dash = "—";

    const third: Vital = hasTemp
      ? {
          key: "temp",
          icon: Thermometer,
          label: t("vitals.temp"),
          value: latest?.max_temp_celsius != null ? `${latest.max_temp_celsius.toFixed(0)}°C` : dash,
          values: temps,
          max: 100,
          color: "#f59e0b",
          hot: (latest?.max_temp_celsius ?? 0) >= 90,
        }
      : {
          // Geen temperatuursensor leesbaar: toon het schijfverkeer.
          key: "disk",
          icon: HardDrive,
          label: t("live.disk"),
          value: latest ? formatRate(disk[disk.length - 1]) : dash,
          values: disk,
          max: Math.max(1024 * 1024, ...disk),
          color: "#f59e0b",
        };

    return [
      {
        key: "cpu",
        icon: Cpu,
        label: "CPU",
        value: latest ? formatPercent(latest.cpu_usage) : dash,
        sub: latest?.top_processes[0]?.name,
        values: recent.map((s) => s.cpu_usage),
        max: 100,
        color: "#22d3ee",
        hot: (latest?.cpu_usage ?? 0) >= 90,
      },
      {
        key: "ram",
        icon: MemoryStick,
        label: "RAM",
        value: latest ? formatPercent(latest.ram_used_percent) : dash,
        values: recent.map((s) => s.ram_used_percent),
        max: 100,
        color: "#a78bfa",
        hot: (latest?.ram_used_percent ?? 0) >= 90,
      },
      third,
      {
        key: "net",
        icon: Network,
        label: t("live.network"),
        value: latest ? formatRate(net[net.length - 1]) : dash,
        sub: latest ? `↓ ${formatRate(latest.net_rx_bytes_per_sec)} · ↑ ${formatRate(latest.net_tx_bytes_per_sec)}` : undefined,
        values: net,
        max: Math.max(64 * 1024, ...net),
        color: "#34d399",
      },
    ];
  }, [samples, t]);

  return (
    <section aria-labelledby="vitals-title" className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <h3 id="vitals-title" className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
          {t("vitals.title")}
          <span
            className={cn(
              "w-2 h-2 rounded-full",
              conn === "live" ? "bg-emerald-400 animate-pulse" : conn === "error" ? "bg-rose-500" : "bg-slate-500 animate-pulse",
            )}
            aria-hidden
          />
          {conn === "error" && <span className="text-xs font-normal normal-case tracking-normal text-rose-400">{t("live.noConnection")}</span>}
        </h3>
        <button
          type="button"
          onClick={() => onOpen("live")}
          className="text-xs text-slate-400 hover:text-cyan-300 flex items-center gap-1 transition-colors cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
        >
          {t("vitals.open")}
          <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {vitals.map((v) => {
          const Icon = v.icon;
          return (
            <button
              key={v.key}
              type="button"
              onClick={() => onOpen("live")}
              aria-label={`${v.label}: ${v.value}. ${t("vitals.open")}`}
              className={cn(
                "group text-left bg-slate-900/70 border rounded-2xl overflow-hidden transition-all duration-200 cursor-pointer hover:-translate-y-0.5 hover:border-slate-600",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400",
                v.hot ? "border-rose-800/80" : "border-slate-800",
              )}
            >
              <div className="px-4 pt-3.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  <Icon className="w-3.5 h-3.5" />
                  <span className="truncate">{v.label}</span>
                </div>
                <div className={cn("mt-1 text-2xl font-bold tabular-nums", v.hot ? "text-rose-300" : "text-white")}>{v.value}</div>
                <div className="h-4 text-xs text-slate-500 truncate">{v.sub}</div>
              </div>
              <Sparkline values={v.values} max={v.max} color={v.hot ? "#fb7185" : v.color} />
            </button>
          );
        })}
      </div>
    </section>
  );
};
