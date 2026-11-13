import { formatBytes } from "../../utils/formatters";
import { intlLocale } from "../../i18n";

/** Categorische series-kleuren (dark-stappen), gevalideerd tegen het kaartoppervlak #0c1326. */
export const SERIES_COLORS = ["#3987e5", "#d95926"] as const;
/** Kaartoppervlak (slate-900/80 over slate-950) — voor de ring om eindpunten. */
export const CHART_SURFACE = "#0c1326";
export const GRID_COLOR = "#1e293b"; // slate-800
export const BASELINE_COLOR = "#334155"; // slate-700
export const AXIS_TEXT_COLOR = "#64748b"; // slate-500

/** Nette as-maxima en ticks voor decimale waarden (MHz, °C). */
export function niceTicks(maxValue: number, count = 4): number[] {
  const max = maxValue > 0 ? maxValue : 1;
  const raw = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const mult = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  const step = mult * mag;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step * 0.999; v += step) ticks.push(Number(v.toFixed(6)));
  return ticks;
}

/** Ticks op 1024-basis zodat `formatBytes` ronde labels oplevert (0 / 512 KB / 1 MB). */
export function byteTicks(maxValue: number, count = 4): number[] {
  const max = maxValue > 0 ? maxValue : 1024;
  const raw = max / count;
  const unit = Math.pow(1024, Math.max(0, Math.floor(Math.log(raw) / Math.log(1024))));
  const m = raw / unit;
  const mult = [1, 2, 5, 10, 20, 50, 100, 200, 256, 512, 1024].find((x) => x >= m) ?? 1024;
  const step = mult * unit;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step * 0.999; v += step) ticks.push(v);
  return ticks;
}

export function formatRate(bytesPerSec: number): string {
  return `${formatBytes(Math.max(0, Math.round(bytesPerSec)))}/s`;
}

export function formatClock(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString(intlLocale(), {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatPercent(v: number): string {
  return `${v.toFixed(v >= 10 ? 0 : 1)}%`;
}
