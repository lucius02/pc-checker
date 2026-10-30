import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AXIS_TEXT_COLOR,
  BASELINE_COLOR,
  CHART_SURFACE,
  GRID_COLOR,
  SERIES_COLORS,
  formatClock,
} from "./chartUtils";

export interface ChartSeries {
  key: string;
  label: string;
  /** Eén waarde per tijdstip in `times`; `null` = geen meting. */
  values: (number | null)[];
}

interface TimeSeriesChartProps {
  /** Epoch-ms, oplopend. */
  times: number[];
  /** Maximaal twee series (één y-as). */
  series: ChartSeries[];
  /** Zichtbaar tijdvenster, bijv. 5 minuten. */
  windowMs: number;
  /** Y-as ticks; het domein loopt van 0 tot de laatste tick. */
  yTicks: number[];
  formatTick: (v: number) => string;
  formatValue: (v: number) => string;
  ariaLabel: string;
  plotHeight?: number;
}

const MARGIN = { top: 8, right: 14, bottom: 22, left: 56 };
/** Groter gat tussen twee metingen dan dit = lijn onderbreken (bijv. tijdens een freeze). */
const GAP_BREAK_MS = 2500;

function nearestIndex(times: number[], t: number): number {
  let lo = 0;
  let hi = times.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(times[lo - 1] - t) <= Math.abs(times[lo] - t)) return lo - 1;
  return lo;
}

export const TimeSeriesChart: React.FC<TimeSeriesChartProps> = ({
  times,
  series,
  windowMs,
  yTicks,
  formatTick,
  formatValue,
  ariaLabel,
  plotHeight = 150,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setWidth(Math.max(240, Math.floor(el.clientWidth)));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const height = MARGIN.top + plotHeight + MARGIN.bottom;
  const innerW = width - MARGIN.left - MARGIN.right;
  const yMax = yTicks[yTicks.length - 1] || 1;
  const tEnd = times.length ? times[times.length - 1] : Date.now();
  const tStart = tEnd - windowMs;

  const x = (t: number) => MARGIN.left + ((t - tStart) / windowMs) * innerW;
  const y = (v: number) => MARGIN.top + plotHeight - (Math.min(Math.max(v, 0), yMax) / yMax) * plotHeight;
  const baselineY = MARGIN.top + plotHeight;

  const paths = useMemo(() => {
    return series.map((s) => {
      let line = "";
      let area = "";
      let segStartX: number | null = null;
      let lastX = 0;
      let prevT: number | null = null;
      const closeArea = () => {
        if (segStartX !== null) area += `L${lastX.toFixed(1)},${baselineY}L${segStartX.toFixed(1)},${baselineY}Z`;
        segStartX = null;
      };
      for (let i = 0; i < times.length; i++) {
        const v = s.values[i];
        const t = times[i];
        if (t < tStart - 1000 || v === null || v === undefined || !Number.isFinite(v)) {
          closeArea();
          prevT = null;
          continue;
        }
        const px = x(t);
        const py = y(v);
        const broken = prevT === null || t - prevT > GAP_BREAK_MS;
        if (broken) {
          closeArea();
          line += `M${px.toFixed(1)},${py.toFixed(1)}`;
          area += `M${px.toFixed(1)},${baselineY}L${px.toFixed(1)},${py.toFixed(1)}`;
          segStartX = px;
        } else {
          line += `L${px.toFixed(1)},${py.toFixed(1)}`;
          area += `L${px.toFixed(1)},${py.toFixed(1)}`;
        }
        lastX = px;
        prevT = t;
      }
      closeArea();
      return { line, area };
    });
  }, [series, times, width, yMax, tStart, windowMs, plotHeight]);

  // Tijd-ticks: elke minuut vanaf "nu" terug.
  const xTicks: { t: number; label: string }[] = [];
  const minutes = Math.floor(windowMs / 60000);
  for (let m = minutes; m >= 0; m--) {
    xTicks.push({ t: tEnd - m * 60000, label: m === 0 ? "nu" : `-${m} min` });
  }

  const lastIdx = times.length - 1;
  const activeIdx = hoverIndex !== null && hoverIndex <= lastIdx ? hoverIndex : null;

  const handlePointer = (e: React.PointerEvent<SVGRectElement>) => {
    if (!times.length) return;
    const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * width;
    const t = tStart + ((px - MARGIN.left) / innerW) * windowMs;
    setHoverIndex(nearestIndex(times, t));
  };

  const handleKey = (e: React.KeyboardEvent<SVGSVGElement>) => {
    if (!times.length) return;
    const cur = activeIdx ?? lastIdx;
    if (e.key === "ArrowLeft") {
      setHoverIndex(Math.max(0, cur - 1));
      e.preventDefault();
    } else if (e.key === "ArrowRight") {
      setHoverIndex(Math.min(lastIdx, cur + 1));
      e.preventDefault();
    } else if (e.key === "Escape") {
      setHoverIndex(null);
    }
  };

  const hoverX = activeIdx !== null ? x(times[activeIdx]) : null;
  const tooltipLeft = hoverX !== null ? Math.min(Math.max(hoverX + 12, 0), width - 170) : 0;
  const tooltipFlip = hoverX !== null && hoverX + 12 + 170 > width;

  return (
    <div ref={containerRef} className="relative w-full select-none">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={ariaLabel}
        tabIndex={0}
        onKeyDown={handleKey}
        onFocus={() => setHoverIndex(lastIdx >= 0 ? lastIdx : null)}
        onBlur={() => setHoverIndex(null)}
        className="block outline-none focus-visible:ring-1 focus-visible:ring-slate-600 rounded-lg"
      >
        {/* Gridlijnen + y-labels */}
        {yTicks.map((tick) => (
          <g key={tick}>
            <line
              x1={MARGIN.left}
              x2={width - MARGIN.right}
              y1={y(tick)}
              y2={y(tick)}
              stroke={tick === 0 ? BASELINE_COLOR : GRID_COLOR}
              strokeWidth={1}
              shapeRendering="crispEdges"
            />
            <text
              x={MARGIN.left - 8}
              y={y(tick)}
              dy="0.32em"
              textAnchor="end"
              fontSize={10}
              fill={AXIS_TEXT_COLOR}
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {formatTick(tick)}
            </text>
          </g>
        ))}

        {/* x-labels */}
        {xTicks.map(({ t, label }, i) => (
          <text
            key={label}
            x={x(t)}
            y={height - 6}
            textAnchor={i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"}
            fontSize={10}
            fill={AXIS_TEXT_COLOR}
          >
            {label}
          </text>
        ))}

        {/* Area-wash alleen bij één serie (overlappende washes vertroebelen) */}
        {series.length === 1 && paths[0] && (
          <path d={paths[0].area} fill={SERIES_COLORS[0]} fillOpacity={0.1} stroke="none" />
        )}
        {paths.map((p, i) => (
          <path
            key={series[i].key}
            d={p.line}
            fill="none"
            stroke={SERIES_COLORS[i]}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}

        {/* Eindpunten met oppervlakte-ring */}
        {lastIdx >= 0 &&
          activeIdx === null &&
          series.map((s, i) => {
            const v = s.values[lastIdx];
            if (v === null || v === undefined || !Number.isFinite(v)) return null;
            return (
              <circle
                key={s.key}
                cx={x(times[lastIdx])}
                cy={y(v)}
                r={4}
                fill={SERIES_COLORS[i]}
                stroke={CHART_SURFACE}
                strokeWidth={2}
              />
            );
          })}

        {/* Crosshair */}
        {activeIdx !== null && hoverX !== null && (
          <g pointerEvents="none">
            <line
              x1={hoverX}
              x2={hoverX}
              y1={MARGIN.top}
              y2={baselineY}
              stroke="#475569"
              strokeWidth={1}
              shapeRendering="crispEdges"
            />
            {series.map((s, i) => {
              const v = s.values[activeIdx];
              if (v === null || v === undefined || !Number.isFinite(v)) return null;
              return (
                <circle
                  key={s.key}
                  cx={hoverX}
                  cy={y(v)}
                  r={4}
                  fill={SERIES_COLORS[i]}
                  stroke={CHART_SURFACE}
                  strokeWidth={2}
                />
              );
            })}
          </g>
        )}

        {/* Hit-laag over het hele plotvlak */}
        <rect
          x={MARGIN.left}
          y={MARGIN.top}
          width={Math.max(0, innerW)}
          height={plotHeight}
          fill="transparent"
          onPointerMove={handlePointer}
          onPointerDown={handlePointer}
          onPointerLeave={() => setHoverIndex(null)}
        />
      </svg>

      {activeIdx !== null && hoverX !== null && (
        <div
          className="pointer-events-none absolute top-1 z-10 min-w-40 rounded-lg border border-slate-700 bg-slate-950/95 px-3 py-2 text-xs shadow-xl"
          style={{ left: tooltipFlip ? Math.max(0, hoverX - 12 - 170) : tooltipLeft }}
        >
          <div className="text-slate-500 mb-1" style={{ fontVariantNumeric: "tabular-nums" }}>
            {formatClock(times[activeIdx])}
          </div>
          {series.map((s, i) => {
            const v = s.values[activeIdx];
            return (
              <div key={s.key} className="flex items-center gap-2 py-0.5">
                <span className="inline-block h-0.5 w-3 rounded" style={{ backgroundColor: SERIES_COLORS[i] }} />
                <span className="font-semibold text-slate-100" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {v === null || v === undefined || !Number.isFinite(v) ? "—" : formatValue(v)}
                </span>
                <span className="text-slate-400">{s.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
