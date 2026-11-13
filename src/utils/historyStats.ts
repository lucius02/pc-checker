import type { FreezeRecord, HealthHistoryEntry } from "../types";

const DAY_MS = 86_400_000;

export interface FreezeSummary {
  total: number;
  last7d: number;
  last30d: number;
  longestMs: number;
  /** Aantal freezes per dag voor de laatste `days` dagen (oudste eerst). */
  perDay: number[];
}

export function summarizeFreezes(freezes: FreezeRecord[], now: number, days = 14): FreezeSummary {
  const perDay = new Array<number>(days).fill(0);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const todayStart = startOfToday.getTime();
  for (const f of freezes) {
    const day = new Date(f.at_epoch_ms);
    day.setHours(0, 0, 0, 0);
    // Math.round vangt zomer-/wintertijd (23- of 25-uursdagen) op.
    const daysAgo = Math.round((todayStart - day.getTime()) / DAY_MS);
    const slot = days - 1 - daysAgo;
    if (slot >= 0 && slot < days) perDay[slot]++;
  }
  return {
    total: freezes.length,
    last7d: freezes.filter((f) => f.at_epoch_ms >= now - 7 * DAY_MS).length,
    last30d: freezes.filter((f) => f.at_epoch_ms >= now - 30 * DAY_MS).length,
    longestMs: freezes.reduce((m, f) => Math.max(m, f.duration_ms), 0),
    perDay,
  };
}

/** Punten voor een eenvoudige SVG-lijn (x: 0..width, y: 0..height, score 100 = boven). */
export function scorePolyline(entries: HealthHistoryEntry[], width: number, height: number): string {
  if (entries.length === 0) return "";
  if (entries.length === 1) {
    const y = height - (entries[0].score / 100) * height;
    return `0,${y.toFixed(1)} ${width},${y.toFixed(1)}`;
  }
  const t0 = entries[0].at_epoch_ms;
  const span = Math.max(1, entries[entries.length - 1].at_epoch_ms - t0);
  return entries
    .map((e) => {
      const x = ((e.at_epoch_ms - t0) / span) * width;
      const y = height - (Math.min(100, Math.max(0, e.score)) / 100) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}
