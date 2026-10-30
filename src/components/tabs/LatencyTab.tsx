import React, { useEffect, useState } from "react";
import {
  Timer,
  Play,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Cpu,
  Lightbulb,
  HardDrive,
  Info,
  BarChart3,
} from "lucide-react";
import { LatencyTestResult, LatencyBucket } from "../../types";
import { cn } from "../../utils/cn";

interface LatencyTabProps {
  latencyResult: LatencyTestResult | null;
  isTestingLatency: boolean;
  latencyDuration: number;
  setLatencyDuration: (secs: number) => void;
  runLatencyTest: () => void;
}

/** Binnen het bereik dat de backend accepteert (5–60 s). */
const DURATION_OPTIONS = [5, 10, 30, 60];

/** PowerShell/Get-Counter heeft ~1–2 s extra nodig na de meting. */
const TEARDOWN_SECS = 2;

// Starttijd overleeft het wisselen van tab (component wordt dan ge-unmount).
let testStartedAt: number | null = null;

const nf = (digits: number) =>
  new Intl.NumberFormat("nl-NL", { minimumFractionDigits: digits, maximumFractionDigits: digits });

const formatUs = (us: number): string => {
  if (us >= 1000) return `${nf(2).format(us / 1000)} ms`;
  if (us >= 10) return `${nf(0).format(us)} µs`;
  return `${nf(2).format(us)} µs`;
};

const formatCount = (n: number): string => new Intl.NumberFormat("nl-NL").format(n);

const formatPct = (p: number | null): string =>
  p === null ? "Niet beschikbaar" : `${nf(2).format(p)} %`;

// Status-tokens (vaste statuskleuren, altijd met icoon + tekst).
const STATUS = {
  good: { color: "#0ca30c", text: "text-emerald-400", label: "Normaal" },
  warning: { color: "#fab219", text: "text-amber-400", label: "Verhoogd" },
  critical: { color: "#d03b3b", text: "text-rose-400", label: "Probleem" },
} as const;

/** Welke zone een histogram-bucket vertegenwoordigt (op index, volgorde uit backend). */
const bucketZone = (idx: number) => (idx <= 1 ? STATUS.good : idx === 2 ? STATUS.warning : STATUS.critical);

const BAR_COLOR = "#3987e5"; // één reeks → één kleur (dataviz slot 1, donkere modus)

const VerdictBadge: React.FC<{ verdict: string }> = ({ verdict }) => {
  const cfg =
    verdict === "Goed"
      ? { cls: "bg-emerald-950 border-emerald-800 text-emerald-400", Icon: CheckCircle2 }
      : verdict === "Slecht"
      ? { cls: "bg-rose-950 border-rose-800 text-rose-400", Icon: XCircle }
      : { cls: "bg-amber-950 border-amber-800 text-amber-400", Icon: AlertTriangle };
  return (
    <span className={cn("px-3 py-1.5 text-xs font-bold rounded-lg border flex items-center gap-1.5", cfg.cls)}>
      <cfg.Icon className="w-4 h-4" />
      Latency: {verdict}
    </span>
  );
};

const KpiTile: React.FC<{ label: string; value: string; hint?: string; muted?: boolean }> = ({
  label,
  value,
  hint,
  muted,
}) => (
  <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl">
    <div className="text-xs font-medium text-slate-400">{label}</div>
    <div className={cn("mt-1 font-semibold", muted ? "text-sm text-slate-500" : "text-xl text-white")}>{value}</div>
    {hint && <div className="text-xs text-slate-500 mt-0.5">{hint}</div>}
  </div>
);

const Histogram: React.FC<{ buckets: LatencyBucket[]; total: number }> = ({ buckets, total }) => {
  const [hover, setHover] = useState<number | null>(null);
  // Logaritmische lengte: <50 µs bevat vrijwel alle metingen, de staart zou anders onzichtbaar zijn.
  const maxLog = Math.max(1, ...buckets.map((b) => Math.log10(b.count + 1)));

  return (
    <div className="space-y-1.5" role="table" aria-label="Verdeling van onderbrekingen">
      <div role="row" className="grid grid-cols-[96px_1fr_150px] gap-3 text-xs text-slate-500 px-1">
        <span role="columnheader">Onderbreking</span>
        <span role="columnheader">Aantal (log-schaal)</span>
        <span role="columnheader" className="text-right">Aantal · aandeel</span>
      </div>
      {buckets.map((b, i) => {
        const widthPct = b.count > 0 ? Math.max(1.5, (Math.log10(b.count + 1) / maxLog) * 100) : 0;
        const share = total > 0 ? (b.count / total) * 100 : 0;
        const zone = bucketZone(i);
        const active = hover === i;
        return (
          <div
            key={b.label}
            role="row"
            tabIndex={0}
            onPointerEnter={() => setHover(i)}
            onPointerLeave={() => setHover(null)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            className={cn(
              "relative grid grid-cols-[96px_1fr_150px] gap-3 items-center px-1 py-1.5 rounded-lg outline-none transition-colors focus-visible:ring-2 focus-visible:ring-cyan-500",
              active && "bg-slate-800/50"
            )}
          >
            <span role="cell" className="text-xs text-slate-300 font-mono flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: zone.color }} aria-hidden />
              {b.label}
            </span>
            <span role="cell" className="h-5 flex items-center">
              {/* 1px baseline-hairline; balk ≤ 20px dik, afgerond aan het data-einde */}
              <span className="relative w-full h-full border-l border-slate-700">
                <span
                  className="absolute left-0 top-1/2 -translate-y-1/2 h-3.5 rounded-r transition-[filter]"
                  style={{
                    width: `${widthPct}%`,
                    backgroundColor: BAR_COLOR,
                    filter: active ? "brightness(1.2)" : undefined,
                  }}
                />
              </span>
            </span>
            <span role="cell" className="text-xs text-right tabular-nums">
              <span className="text-slate-200 font-semibold">{formatCount(b.count)}</span>
              <span className="text-slate-500"> · {share < 0.01 && b.count > 0 ? "<0,01" : nf(2).format(share)} %</span>
            </span>
            {active && (
              <div className="absolute z-10 left-28 -top-11 pointer-events-none px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg shadow-xl text-xs whitespace-nowrap">
                <div className="text-white font-semibold">
                  {formatCount(b.count)} onderbrekingen
                </div>
                <div className="text-slate-400 flex items-center gap-1.5">
                  {b.label} · <span className={zone.text}>{zone.label}</span>
                </div>
              </div>
            )}
          </div>
        );
      })}
      <div className="flex flex-wrap gap-4 pt-2 px-1 text-xs text-slate-400">
        {[STATUS.good, STATUS.warning, STATUS.critical].map((z, i) => (
          <span key={z.label} className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: z.color }} aria-hidden />
            {z.label} {i === 0 ? "(< 250 µs)" : i === 1 ? "(250 µs–1 ms)" : "(≥ 1 ms)"}
          </span>
        ))}
      </div>
    </div>
  );
};

export const LatencyTab: React.FC<LatencyTabProps> = ({
  latencyResult,
  isTestingLatency,
  latencyDuration,
  setLatencyDuration,
  runLatencyTest,
}) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!isTestingLatency) {
      testStartedAt = null;
      setElapsed(0);
      return;
    }
    if (testStartedAt === null) testStartedAt = Date.now();
    const tick = () => setElapsed((Date.now() - (testStartedAt ?? Date.now())) / 1000);
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [isTestingLatency]);

  const handleStart = () => {
    testStartedAt = Date.now();
    runLatencyTest();
  };

  const totalSecs = latencyDuration + TEARDOWN_SECS;
  const progress = Math.min(100, (elapsed / totalSecs) * 100);
  const r = latencyResult;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header + bediening */}
      <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Timer className="w-5 h-5 text-cyan-400" />
              DPC- &amp; Interrupt-Latency Test
            </h2>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl">
              Meet hoe lang Windows een thread onderbreekt voor drivers (DPC's/ISR's). Lange onderbrekingen veroorzaken audio-crackles, micro-stutters en haperende muis. Laat de PC tijdens de test zo normaal mogelijk draaien.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-xl p-1 text-xs">
              {DURATION_OPTIONS.map((sec) => (
                <button
                  key={sec}
                  onClick={() => setLatencyDuration(sec)}
                  disabled={isTestingLatency}
                  className={cn(
                    "px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400",
                    latencyDuration === sec ? "bg-cyan-500 text-slate-950" : "text-slate-400 hover:text-white"
                  )}
                >
                  {sec}s
                </button>
              ))}
            </div>

            <button
              onClick={handleStart}
              disabled={isTestingLatency}
              className="px-5 py-2.5 rounded-xl bg-linear-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-sm shadow-lg shadow-cyan-500/20 disabled:opacity-50 transition-all flex items-center gap-2 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
            >
              {isTestingLatency ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Meting bezig...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-slate-950" />
                  Start Latency Test
                </>
              )}
            </button>
          </div>
        </div>

        {isTestingLatency && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-slate-400">
              <span>Bezig met meten… één CPU-kern draait tijdelijk op 100 %.</span>
              <span className="tabular-nums">
                {Math.min(Math.floor(elapsed), totalSecs)} / {totalSecs} s
              </span>
            </div>
            <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-cyan-500 rounded-full transition-[width] duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {!r && !isTestingLatency && (
          <div className="p-4 bg-slate-950/50 rounded-xl border border-slate-800/80 text-xs text-slate-400 flex items-center gap-2">
            <Info className="w-4 h-4 text-cyan-400 shrink-0" />
            Nog geen meting uitgevoerd. Kies een duur en klik op "Start Latency Test" (standaard 10 s).
          </div>
        )}
      </div>

      {r && (
        <div className={cn("space-y-6 transition-opacity", isTestingLatency && "opacity-50")}>
          {/* Oordeel + KPI's */}
          <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-5">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-200">Resultaat</h3>
                <p className="text-xs text-slate-300 max-w-3xl">{r.summary}</p>
                {r.error && <p className="text-xs text-rose-400">{r.error}</p>}
              </div>
              <VerdictBadge verdict={r.verdict} />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <KpiTile label="Langste onderbreking" value={formatUs(r.timer_max_gap_us)} hint="Goed < 500 µs · slecht ≥ 2 ms" />
              <KpiTile label="p99 onderbreking" value={formatUs(r.timer_p99_gap_us)} hint="99 % van de metingen korter" />
              <KpiTile label="Gemiddelde gap" value={formatUs(r.timer_avg_gap_us)} hint={`${formatCount(r.timer_samples)} metingen`} />
              <KpiTile
                label="DPC-tijd (gemiddeld)"
                value={formatPct(r.dpc_time_percent_avg)}
                muted={r.dpc_time_percent_avg === null}
                hint={
                  r.dpc_time_percent_max === null
                    ? "Gezond < 1 %"
                    : `Piek ${formatPct(r.dpc_time_percent_max)} · gezond < 1 %`
                }
              />
              <KpiTile
                label="Interrupt-tijd (gemiddeld)"
                value={formatPct(r.interrupt_time_percent_avg)}
                muted={r.interrupt_time_percent_avg === null}
                hint={
                  r.interrupt_time_percent_max === null
                    ? "Gezond < 1 %"
                    : `Piek ${formatPct(r.interrupt_time_percent_max)} · gezond < 1 %`
                }
              />
              <KpiTile
                label="DPC's in wachtrij"
                value={
                  r.dpcs_queued_per_sec_avg === null
                    ? "Niet beschikbaar"
                    : `${formatCount(Math.round(r.dpcs_queued_per_sec_avg))}/s`
                }
                muted={r.dpcs_queued_per_sec_avg === null}
                hint="Gemiddeld per seconde"
              />
            </div>
          </div>

          {/* Histogram */}
          <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-cyan-400" />
                Verdeling van onderbrekingen
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Tijd tussen twee opeenvolgende timer-metingen gedurende {nf(1).format(r.duration_ms / 1000)} s. Vrijwel alles hoort in "&lt;50 µs"; elke meting in de rode zones is een merkbare onderbreking.
              </p>
            </div>
            <Histogram buckets={r.histogram} total={r.timer_samples} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Verdachte drivers */}
            <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-3">
              <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-cyan-400" />
                Waarschijnlijke verdachte drivers
              </h3>
              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl text-xs text-slate-400 flex gap-2">
                <Info className="w-4 h-4 text-slate-500 shrink-0 mt-px" />
                <span>
                  Deze lijst is afgeleid uit de Driver Check (netwerk, audio, GPU, opslag en USB), niet gemeten per driver. Gebruik LatencyMon (Resplendence) voor een exacte DPC/ISR-toewijzing per driver.
                </span>
              </div>
              {r.suspected_drivers.length > 0 ? (
                <ul className="space-y-1.5">
                  {r.suspected_drivers.map((d) => (
                    <li
                      key={d}
                      className="p-2.5 bg-slate-950/80 border border-slate-800 rounded-lg text-xs text-slate-200 flex items-center gap-2"
                    >
                      <Cpu className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      {d}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="p-3 bg-slate-950/50 rounded-xl border border-slate-800/80 text-xs text-slate-400 flex items-center gap-2">
                  {r.verdict === "Goed" ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      Geen verdachte drivers: de latency is in orde.
                    </>
                  ) : r.advice.some((a) => a.startsWith("Voer eerst de Driver Check uit")) ? (
                    <>
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                      Geen drivergegevens beschikbaar. Voer eerst de Driver Check uit en herhaal deze test.
                    </>
                  ) : (
                    <>
                      <Info className="w-4 h-4 text-slate-500 shrink-0" />
                      De Driver Check vond geen netwerk-, audio-, GPU-, opslag- of USB-drivers om aan te wijzen.
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Advies */}
            <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-3">
              <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-cyan-400" />
                Advies
              </h3>
              <ul className="space-y-1.5">
                {r.advice.map((a) => (
                  <li
                    key={a}
                    className="p-2.5 bg-cyan-950/20 border border-cyan-900/50 rounded-lg text-xs text-cyan-200 flex gap-2"
                  >
                    <span className="text-cyan-500 shrink-0">•</span>
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
