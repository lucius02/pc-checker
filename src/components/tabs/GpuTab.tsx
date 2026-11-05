import React, { useEffect, useRef, useState } from "react";
import { Gpu, Play, Square, AlertTriangle, CheckCircle2 } from "lucide-react";
import { GpuStress, gpuVerdict, type GpuStressStats } from "../../lib/gpuStress";
import { useT } from "../../i18n";
import { useDiagnosticsStore } from "../../store/diagnosticsStore";
import { toast } from "../../store/toastStore";
import { cn } from "../../utils/cn";

const DURATIONS = [30, 60, 180, 600];

export const GpuTab: React.FC = () => {
  const t = useT();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stressRef = useRef<GpuStress | null>(null);
  const timerRef = useRef<number>(0);
  const [running, setRunning] = useState(false);
  const [duration, setDuration] = useState(60);
  const [intensity, setIntensity] = useState(6);
  const [stats, setStats] = useState<GpuStressStats | null>(null);
  const [renderer, setRenderer] = useState("");
  const [final, setFinal] = useState<GpuStressStats | null>(null);
  const setGpuResult = useDiagnosticsStore((s) => s.setGpuResult);
  const supported = GpuStress.isSupported();

  useEffect(
    () => () => {
      window.clearTimeout(timerRef.current);
      stressRef.current?.dispose();
    },
    [],
  );

  const finish = () => {
    const s = stressRef.current;
    if (!s) return;
    window.clearTimeout(timerRef.current);
    s.stop();
    const st = s.stats();
    setFinal(st);
    setRunning(false);
    const verdict = gpuVerdict(st);
    const summary = `${verdict === "ok" ? "OK" : verdict === "lost" ? "CONTEXT LOST" : "FPS DROPS"} — ${st.avgFps.toFixed(1)} avg / ${st.minFps.toFixed(1)} min FPS, ${(st.elapsedMs / 1000).toFixed(0)} s, intensity ${intensity}, ${s.renderer}`;
    setGpuResult(summary);
    toast[verdict === "ok" ? "success" : "error"](t("gpu.done"), summary);
    s.dispose();
    stressRef.current = null;
  };

  const start = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    stressRef.current?.dispose();
    setFinal(null);
    setStats(null);
    const s = new GpuStress(canvas, {
      intensity,
      onStats: setStats,
      onContextLost: () => finish(),
    });
    if (!s.supported) {
      toast.error(t("gpu.unsupported"));
      return;
    }
    stressRef.current = s;
    setRenderer(s.renderer);
    setRunning(true);
    s.startLoop();
    timerRef.current = window.setTimeout(finish, duration * 1000);
  };

  const verdict = final ? gpuVerdict(final) : null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <Gpu className="w-5 h-5 text-fuchsia-400" /> {t("gpu.title")}
        </h2>
        <p className="text-xs text-slate-400 max-w-3xl">{t("gpu.intro")}</p>
      </div>

      {!supported ? (
        <div className="p-4 rounded-xl border border-amber-800 bg-amber-950/30 text-amber-300 text-sm">{t("gpu.unsupported")}</div>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-4 p-4 bg-slate-900/80 border border-slate-800 rounded-2xl">
            <label className="text-xs text-slate-400 flex flex-col gap-1">
              {t("gpu.duration")}
              <select
                value={duration}
                disabled={running}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-200"
              >
                {DURATIONS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-slate-400 flex flex-col gap-1">
              {t("gpu.intensity")}: {intensity}
              <input type="range" min={1} max={10} value={intensity} disabled={running} onChange={(e) => setIntensity(Number(e.target.value))} />
            </label>
            {running ? (
              <button type="button" onClick={finish} className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm font-semibold flex items-center gap-2 cursor-pointer">
                <Square className="w-4 h-4" /> {t("gpu.stop")}
              </button>
            ) : (
              <button type="button" onClick={start} className="px-4 py-2 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 text-slate-950 text-sm font-semibold flex items-center gap-2 cursor-pointer">
                <Play className="w-4 h-4" /> {t("gpu.start")}
              </button>
            )}
            <div className="ml-auto grid grid-cols-3 gap-4 text-center">
              {(
                [
                  ["gpu.fps", stats?.fps],
                  ["gpu.avgFps", (final ?? stats)?.avgFps],
                  ["gpu.minFps", (final ?? stats)?.minFps],
                ] as const
              ).map(([k, v]) => (
                <div key={k}>
                  <div className="text-[10px] uppercase text-slate-500">{t(k)}</div>
                  <div className="text-lg font-mono text-white">{v != null ? v.toFixed(1) : "–"}</div>
                </div>
              ))}
            </div>
          </div>

          {renderer && (
            <p className="text-xs text-slate-500">
              {t("gpu.renderer")}: <span className="text-slate-300">{renderer}</span>
            </p>
          )}

          <canvas
            ref={canvasRef}
            className={cn("w-full rounded-2xl border border-slate-800 bg-black", running ? "h-[420px]" : "h-48 opacity-40")}
          />

          {verdict && (
            <div
              className={cn(
                "p-4 rounded-xl border text-sm flex items-start gap-3",
                verdict === "ok" ? "border-emerald-800 bg-emerald-950/30 text-emerald-300" : "border-red-800 bg-red-950/30 text-red-300",
              )}
            >
              {verdict === "ok" ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertTriangle className="w-5 h-5 shrink-0" />}
              <span>{verdict === "ok" ? t("gpu.verdictOk") : verdict === "lost" ? t("gpu.contextLost") : t("gpu.verdictDrops")}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
};
