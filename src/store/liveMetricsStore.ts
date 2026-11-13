import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { api } from "../lib/api";
import type { MetricsSample } from "../types";

export const MAX_SAMPLES = 300;

export type LiveConnState = "connecting" | "live" | "error";

/** Voegt metingen samen, ontdubbelt op tijdstip en houdt de laatste MAX_SAMPLES. */
export function mergeSamples(a: MetricsSample[], b: MetricsSample[]): MetricsSample[] {
  const byTime = new Map<number, MetricsSample>();
  for (const s of a) byTime.set(s.at_epoch_ms, s);
  for (const s of b) byTime.set(s.at_epoch_ms, s);
  const merged = Array.from(byTime.values()).sort((x, y) => x.at_epoch_ms - y.at_epoch_ms);
  return merged.length > MAX_SAMPLES ? merged.slice(merged.length - MAX_SAMPLES) : merged;
}

interface LiveMetricsState {
  samples: MetricsSample[];
  conn: LiveConnState;
}

/** De secondemetingen van de backend, gedeeld door de Live Monitor en de meters op het overzicht. */
export const useLiveMetricsStore = create<LiveMetricsState>(() => ({ samples: [], conn: "connecting" }));

/**
 * Abonneert één keer (voor de hele app) op het `live-metrics`-event en haalt de buffer van de
 * laatste 5 minuten op. Geeft een functie terug die het abonnement opruimt.
 */
export function startLiveMetrics(): () => void {
  let cancelled = false;
  let unlisten: (() => void) | null = null;
  const { setState } = useLiveMetricsStore;

  listen<MetricsSample>("live-metrics", (event) => {
    if (cancelled) return;
    setState((s) => ({ conn: "live", samples: mergeSamples(s.samples, [event.payload]) }));
  })
    .then((fn) => {
      // StrictMode / snelle unmount: listener alsnog opruimen.
      if (cancelled) fn();
      else unlisten = fn;
    })
    .catch(() => {
      if (!cancelled) setState({ conn: "error" });
    });

  api
    .getMetricsHistory()
    .then((history) => {
      if (cancelled) return;
      setState((s) => ({
        samples: mergeSamples(history.samples, s.samples),
        conn: history.samples.length > 0 ? "live" : s.conn,
      }));
    })
    .catch(() => {
      if (!cancelled) setState({ conn: "error" });
    });

  return () => {
    cancelled = true;
    if (unlisten) unlisten();
  };
}
