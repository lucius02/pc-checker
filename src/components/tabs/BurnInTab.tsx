import React, { useEffect, useRef, useState } from "react";
import { Flame, Play, AlertTriangle, CheckCircle2, Thermometer } from "lucide-react";
import { api, errorMessage } from "../../lib/api";
import { GpuStress, gpuVerdict } from "../../lib/gpuStress";
import { useT } from "../../i18n";
import { useDiagnosticsStore } from "../../store/diagnosticsStore";
import { toast } from "../../store/toastStore";
import { cn } from "../../utils/cn";

interface BurnInResult {
  cpuOk: boolean;
  cpuDetail: string;
  ramOk: boolean;
  ramDetail: string;
  gpuOk: boolean;
  gpuDetail: string;
  maxTemp: number | null;
  freezes: number;
}

const DURATIONS_MIN = [5, 15, 30, 60];
const TEMP_POLL_MS = 5000;

export const BurnInTab: React.FC = () => {
  const t = useT();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [minutes, setMinutes] = useState(15);
  const [ramMb, setRamMb] = useState(1024);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [liveTemp, setLiveTemp] = useState<number | null>(null);
  const [result, setResult] = useState<BurnInResult | null>(null);
  const cancelled = useRef(false);
  const setAutoRefresh = useDiagnosticsStore((s) => s.setAutoRefresh);

  useEffect(
    () => () => {
      cancelled.current = true;
    },
    [],
  );

  const run = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    cancelled.current = false;
    setResult(null);
    setRunning(true);
    setElapsed(0);
    // Overzicht-polling pauzeren: die zou de metingen verstoren.
    setAutoRefresh(false);

    const durationMs = minutes * 60_000;
    const startedAt = Date.now();
    const deadline = startedAt + durationMs;
    let maxTemp: number | null = null;

    const tick = window.setInterval(() => setElapsed(Date.now() - startedAt), 1000);
    const tempPoll = window.setInterval(async () => {
      try {
        const c = await api.getCoolingAndFanInfo();
        const temps = c.temperatures.map((x) => x.temperature_celsius).filter((x) => x > 0);
        if (temps.length) {
          const m = Math.max(...temps);
          setLiveTemp(m);
          maxTemp = Math.max(maxTemp ?? 0, m);
        }
      } catch {
        /* temperatuur is optioneel */
      }
    }, TEMP_POLL_MS);

    const gpu = new GpuStress(canvas, { intensity: 6 });
    const gpuSupported = gpu.supported;
    if (gpuSupported) gpu.startLoop();

    const cpuTask = api
      .runCpuStressTest(Math.max(1, Math.round(durationMs / 1000)))
      .then((r) => ({ ok: r.success, detail: r.details }))
      .catch((e) => ({ ok: false, detail: errorMessage(e) }));

    const ramTask = (async () => {
      let passes = 0;
      while (Date.now() < deadline && !cancelled.current) {
        try {
          const r = await api.runRamStressTest(ramMb);
          passes++;
          if (!r.success) return { ok: false, detail: r.details };
        } catch (e) {
          return { ok: false, detail: errorMessage(e) };
        }
      }
      return { ok: true, detail: `${passes} × ${ramMb} MB, 0 fouten` };
    })();

    const [cpu, ram] = await Promise.all([cpuTask, ramTask]);
    gpu.stop();
    const gs = gpu.stats();
    gpu.dispose();
    window.clearInterval(tick);
    window.clearInterval(tempPoll);

    let freezes = 0;
    try {
      const h = await api.getHistory();
      freezes = h.freezes.filter((f) => f.at_epoch_ms >= startedAt).length;
    } catch {
      /* historie optioneel */
    }

    const gv = gpuSupported ? gpuVerdict(gs) : "ok";
    const res: BurnInResult = {
      cpuOk: cpu.ok,
      cpuDetail: cpu.detail,
      ramOk: ram.ok,
      ramDetail: ram.detail,
      gpuOk: gv === "ok",
      gpuDetail: gpuSupported
        ? `${gs.avgFps.toFixed(1)} avg / ${gs.minFps.toFixed(1)} min FPS${gs.contextLost ? " — context lost" : ""}`
        : t("gpu.unsupported"),
      maxTemp,
      freezes,
    };
    setResult(res);
    setRunning(false);
    setAutoRefresh(true);
    const passed = res.cpuOk && res.ramOk && res.gpuOk && freezes === 0 && (maxTemp ?? 0) < 95;
    toast[passed ? "success" : "error"](passed ? t("burnin.passed") : t("burnin.failed"));
  };

  const passed = result && result.cpuOk && result.ramOk && result.gpuOk && result.freezes === 0 && (result.maxTemp ?? 0) < 95;
  const progress = Math.min(100, (elapsed / (minutes * 60_000)) * 100);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <Flame className="w-5 h-5 text-red-400" /> {t("burnin.title")}
        </h2>
        <p className="text-xs text-slate-400 max-w-3xl">{t("burnin.intro")}</p>
      </div>

      <div className="flex flex-wrap items-end gap-4 p-4 bg-slate-900/80 border border-slate-800 rounded-2xl">
        <label className="text-xs text-slate-400 flex flex-col gap-1">
          {t("burnin.duration")}
          <select value={minutes} disabled={running} onChange={(e) => setMinutes(Number(e.target.value))} className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-200">
            {DURATIONS_MIN.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-400 flex flex-col gap-1">
          {t("burnin.ramMb")}
          <select value={ramMb} disabled={running} onChange={(e) => setRamMb(Number(e.target.value))} className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-200">
            {[512, 1024, 2048, 4096].map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => void run()}
          disabled={running}
          className="px-4 py-2 rounded-lg bg-red-500 hover:bg-red-400 disabled:opacity-60 text-slate-950 text-sm font-semibold flex items-center gap-2 cursor-pointer"
        >
          <Play className="w-4 h-4" /> {running ? t("burnin.running") : t("burnin.start")}
        </button>
        {running && (
          <div className="flex items-center gap-2 text-sm text-slate-300 ml-auto">
            <Thermometer className="w-4 h-4 text-orange-400" />
            {liveTemp != null ? `${liveTemp.toFixed(0)} °C` : "–"}
            <span className="text-slate-500">· {Math.floor(elapsed / 60000)}:{String(Math.floor((elapsed % 60000) / 1000)).padStart(2, "0")}</span>
          </div>
        )}
      </div>

      <p className="text-xs text-amber-300/80">{t("burnin.warning")}</p>

      {running && (
        <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
          <div className="h-full bg-red-500 transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}

      <canvas ref={canvasRef} className={cn("w-full rounded-2xl border border-slate-800 bg-black", running ? "h-64" : "h-0 border-0")} />

      {result && (
        <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-3">
          <div className={cn("flex items-center gap-2 font-semibold", passed ? "text-emerald-300" : "text-red-300")}>
            {passed ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
            {passed ? t("burnin.passed") : t("burnin.failed")}
          </div>
          <table className="w-full text-xs">
            <tbody>
              {(
                [
                  [t("burnin.cpu"), result.cpuOk, result.cpuDetail],
                  [t("burnin.ram"), result.ramOk, result.ramDetail],
                  [t("burnin.gpu"), result.gpuOk, result.gpuDetail],
                  [t("burnin.maxTemp"), (result.maxTemp ?? 0) < 95, result.maxTemp != null ? `${result.maxTemp.toFixed(0)} °C` : "–"],
                  [t("burnin.freezes"), result.freezes === 0, String(result.freezes)],
                ] as const
              ).map(([label, ok, detail]) => (
                <tr key={label} className="border-t border-slate-800">
                  <th className="py-2 pr-3 text-left text-slate-400 font-medium w-40">{label}</th>
                  <td className={cn("pr-3 font-semibold", ok ? "text-emerald-400" : "text-red-400")}>{ok ? "OK" : "!"}</td>
                  <td className="text-slate-300">{detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
