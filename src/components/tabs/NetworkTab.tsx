import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Wifi,
  RotateCcw,
  Play,
  Square,
  Activity,
  Zap,
  ShieldCheck,
  Radio,
} from "lucide-react";
import { cn } from "../../utils/cn";

interface NetworkTabProps {
  onUpdateResult?: (data: {
    online: boolean;
    avgPingMs: number;
    jitterMs: number;
    packetLossPercent: number;
  }) => void;
}

interface PingSample {
  time: string;
  latencyMs: number | null; // null represents packet loss/timeout
}

export const NetworkTab: React.FC<NetworkTabProps> = ({ onUpdateResult }) => {
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [isMonitoring, setIsMonitoring] = useState<boolean>(false);
  const [samples, setSamples] = useState<PingSample[]>([]);

  const [currentPing, setCurrentPing] = useState<number | null>(null);
  const [minPing, setMinPing] = useState<number | null>(null);
  const [avgPing, setAvgPing] = useState<number | null>(null);
  const [maxPing, setMaxPing] = useState<number | null>(null);
  const [jitter, setJitter] = useState<number | null>(null);
  const [packetLossPercent, setPacketLossPercent] = useState<number>(0);

  const monitorIntervalRef = useRef<number | null>(null);

  // Connection metadata (Chromium Network Information API)
  const navConn = (navigator as unknown as {
    connection?: {
      effectiveType?: string;
      downlink?: number;
      rtt?: number;
    };
  }).connection;

  const connType = navConn?.effectiveType || "LAN / Wi-Fi";
  const downlinkSpeed = navConn?.downlink || 10;

  // Listen to browser online/offline events
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Measure single ping sample
  const measurePing = useCallback(async (): Promise<number | null> => {
    const startTime = performance.now();
    try {
      // Use cache-busted fetch to lightweight high-availability endpoint
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);

      const res = await fetch(`https://1.1.1.1/cdn-cgi/trace?_t=${Date.now()}`, {
        method: "HEAD",
        mode: "no-cors",
        cache: "no-store",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      if (res) {
        const rtt = Math.max(1, Math.round(performance.now() - startTime));
        return rtt;
      }
      return null;
    } catch {
      // Timeout or DNS error
      return null;
    }
  }, []);

  // Process a new ping sample and recalculate stats
  const recordSample = useCallback((latency: number | null) => {
    setCurrentPing(latency);
    const timeStr = new Date().toLocaleTimeString();

    setSamples((prev) => {
      const next = [...prev, { time: timeStr, latencyMs: latency }];
      if (next.length > 30) next.shift();

      // Calculate stats over all recorded samples
      const validPings = next
        .map((s) => s.latencyMs)
        .filter((l): l is number => l !== null);

      if (validPings.length > 0) {
        const min = Math.min(...validPings);
        const max = Math.max(...validPings);
        const sum = validPings.reduce((a, b) => a + b, 0);
        const avg = Math.round(sum / validPings.length);

        setMinPing(min);
        setMaxPing(max);
        setAvgPing(avg);

        // Jitter: average difference between consecutive pings
        if (validPings.length > 1) {
          let jitterSum = 0;
          for (let i = 1; i < validPings.length; i++) {
            jitterSum += Math.abs(validPings[i] - validPings[i - 1]);
          }
          setJitter(Math.round(jitterSum / (validPings.length - 1)));
        }
      }

      const dropped = next.filter((s) => s.latencyMs === null).length;
      const lossPct = Math.round((dropped / next.length) * 100);
      setPacketLossPercent(lossPct);

      return next;
    });
  }, []);

  // Single test run

  // Continuous monitoring toggle
  const toggleMonitoring = useCallback(() => {
    if (isMonitoring) {
      if (monitorIntervalRef.current) {
        clearInterval(monitorIntervalRef.current);
        monitorIntervalRef.current = null;
      }
      setIsMonitoring(false);
    } else {
      setIsMonitoring(true);
      void measurePing().then(recordSample);
      monitorIntervalRef.current = window.setInterval(async () => {
        const lat = await measurePing();
        recordSample(lat);
      }, 1200);
    }
  }, [isMonitoring, measurePing, recordSample]);

  useEffect(() => {
    return () => {
      if (monitorIntervalRef.current) {
        clearInterval(monitorIntervalRef.current);
      }
    };
  }, []);

  // Update parent for export
  useEffect(() => {
    onUpdateResult?.({
      online: isOnline,
      avgPingMs: avgPing || 0,
      jitterMs: jitter || 0,
      packetLossPercent,
    });
  }, [isOnline, avgPing, jitter, packetLossPercent, onUpdateResult]);

  const resetTest = () => {
    setSamples([]);
    setCurrentPing(null);
    setMinPing(null);
    setAvgPing(null);
    setMaxPing(null);
    setJitter(null);
    setPacketLossPercent(0);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="p-2 rounded-xl bg-blue-950 border border-blue-800 text-blue-400">
              <Wifi className="w-6 h-6" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white">Netwerk, Wi-Fi &amp; Ping Stabiliteit</h2>
                <span className={cn(
                  "px-2 py-0.5 rounded-full text-[10px] font-semibold border",
                  isOnline
                    ? "bg-emerald-950/80 border-emerald-700/60 text-emerald-300"
                    : "bg-rose-950/80 border-rose-700/60 text-rose-300"
                )}>
                  {isOnline ? "Online Verbonden" : "Offline"}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Meet latency (ping), jitter en packet loss in realtime om micro-onderbrekingen en Wi-Fi storingen op te sporen.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleMonitoring}
              aria-label={isMonitoring ? "Stop live ping monitoring" : "Start live ping monitoring"}
              className={cn(
                "px-3.5 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2",
                isMonitoring
                  ? "bg-rose-950/80 border-rose-700 hover:border-rose-600 text-rose-300 focus-visible:outline-rose-400"
                  : "bg-blue-950/80 border-blue-700 hover:border-blue-600 text-blue-300 focus-visible:outline-blue-400"
              )}
            >
              {isMonitoring ? (
                <>
                  <Square className="w-3.5 h-3.5" />
                  Stop Monitor
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  Live Ping Starten
                </>
              )}
            </button>

            <button
              onClick={resetTest}
              aria-label="Reset netwerk teststatistieken"
              className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 hover:border-slate-600 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
            >
              <RotateCcw className="w-3.5 h-3.5 text-blue-400" />
              Reset
            </button>
          </div>
        </div>

        {/* Telemetry Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-1">
            <span className="text-slate-400 block">Actuele Ping</span>
            <span className={cn(
              "text-lg font-bold font-mono",
              currentPing === null ? "text-slate-500" : currentPing < 30 ? "text-emerald-400" : currentPing < 80 ? "text-amber-400" : "text-rose-400"
            )}>
              {currentPing !== null ? `${currentPing} ms` : "—"}
            </span>
          </div>

          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-1">
            <span className="text-slate-400 block">Gemiddelde Ping</span>
            <span className="text-lg font-bold font-mono text-cyan-400">
              {avgPing !== null ? `${avgPing} ms` : "—"}
            </span>
          </div>

          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-1">
            <span className="text-slate-400 block">Jitter (Stabiliteit)</span>
            <div className="flex items-center gap-1.5">
              <span className={cn(
                "text-lg font-bold font-mono",
                jitter === null ? "text-slate-500" : jitter < 8 ? "text-emerald-400" : "text-amber-400"
              )}>
                {jitter !== null ? `±${jitter} ms` : "—"}
              </span>
            </div>
          </div>

          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-1">
            <span className="text-slate-400 block">Packet Loss</span>
            <span className={cn(
              "text-lg font-bold font-mono",
              packetLossPercent === 0 ? "text-emerald-400" : "text-rose-400"
            )}>
              {packetLossPercent}%
            </span>
          </div>

          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-1">
            <span className="text-slate-400 block">Min / Max / Link</span>
            <span className="text-xs font-mono font-bold text-slate-200 block mt-1 truncate">
              {minPing !== null ? `${minPing} / ${maxPing} ms` : "—"} • {connType.toUpperCase()} ({downlinkSpeed}M)
            </span>
          </div>
        </div>
      </div>

      {/* Latency History Graph */}
      <div className="p-5 bg-slate-900/70 border border-slate-800 rounded-2xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <span className="font-semibold text-slate-200 flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-400" />
            Ping Grafiek (Laatste 30 metingen):
          </span>
          <div className="flex items-center gap-3 text-[11px] text-slate-400">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400" /> &lt;30ms (Snel)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-400" /> 30-80ms (Normaal)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-rose-400" /> &gt;80ms of Time-out
            </span>
          </div>
        </div>

        {/* Visual Bar Chart */}
        <div className="h-44 bg-slate-950/90 border border-slate-800 rounded-xl p-4 flex items-end gap-1.5 overflow-x-auto">
          {samples.length === 0 ? (
            <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 text-xs">
              <Radio className="w-6 h-6 mb-2 text-slate-600 animate-pulse" />
              <span>Klik op &lsquo;Live Ping Starten&rsquo; om de stabiliteitstest te beginnen</span>
            </div>
          ) : (
            samples.map((s, idx) => {
              const maxDisplay = 150;
              const heightPct = s.latencyMs === null ? 100 : Math.min(100, Math.max(10, (s.latencyMs / maxDisplay) * 100));

              return (
                <div
                  key={idx}
                  className="flex-1 min-w-[12px] flex flex-col items-center justify-end h-full group relative"
                >
                  <div
                    className={cn(
                      "w-full rounded-t transition-all",
                      s.latencyMs === null
                        ? "bg-rose-600/80 animate-pulse"
                        : s.latencyMs < 30
                        ? "bg-emerald-500/80 group-hover:bg-emerald-400"
                        : s.latencyMs < 80
                        ? "bg-amber-500/80 group-hover:bg-amber-400"
                        : "bg-rose-500/80 group-hover:bg-rose-400"
                    )}
                    style={{ height: `${heightPct}%` }}
                  />
                  {/* Tooltip */}
                  <div className="absolute -top-7 hidden group-hover:flex px-1.5 py-0.5 rounded bg-slate-800 text-[10px] font-mono text-white whitespace-nowrap z-10 border border-slate-700 shadow-md">
                    {s.latencyMs !== null ? `${s.latencyMs} ms` : "Time-out"}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Networking Advice */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-2">
          <h4 className="font-semibold text-slate-200 flex items-center gap-2">
            <Zap className="w-4 h-4 text-blue-400" />
            Wat is Jitter &amp; Packet Loss?
          </h4>
          <p className="text-slate-400 text-xs leading-relaxed">
            <strong>Jitter</strong> meet de schommeling in reactiesnelheid. Een lage jitter (&lt; 10 ms) zorgt voor vloeiende Zoom/Teams-gesprekken en lag-vrij online gamen. 
            <strong> Packet loss</strong> betekent dat datapakketjes verdwijnen door slechte Wi-Fi ontvangst of overbelaste routers.
          </p>
        </div>

        <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-2">
          <h4 className="font-semibold text-slate-200 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            Wi-Fi Optimalisatie Advies
          </h4>
          <p className="text-slate-400 text-xs leading-relaxed">
            Als je packet loss ervaart op Wi-Fi: schakel over naar een <strong>5 GHz of 6 GHz (Wi-Fi 6)</strong> netwerk in plaats van 2.4 GHz. 
            2.4 GHz stoort snel door magnetrons, bluetooth en routers van buren. Voor gaming is een bekabelde ethernetkabel altijd superieur.
          </p>
        </div>
      </div>
    </div>
  );
};
