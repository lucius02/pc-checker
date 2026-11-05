import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  MousePointer,
  RotateCcw,
  Laptop,
  AlertTriangle,
  Layers,
  Zap,
} from "lucide-react";
import { cn } from "../../utils/cn";
import {
  ClickCounters,
  ClickHeld,
  TouchpadButtonsGrid,
  TouchpadAdviceCards,
} from "./touchpad/TouchpadButtonsGrid";
import { useT, type MessageKey } from "../../i18n";

type TrailMode = "fading" | "permanent";

interface TouchpadTabProps {
  onUpdateResult?: (data: {
    coveragePercent: number;
    doubleClickMs: number | null;
    hasSwitchChatter: boolean;
    pollingRateHz: number;
    scrollSteps: number;
  }) => void;
}

export const TouchpadTab: React.FC<TouchpadTabProps> = ({ onUpdateResult }) => {
  const t = useT();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [coords, setCoords] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [eventRateHz, setEventRateHz] = useState<number>(0);
  const [trailMode, setTrailMode] = useState<TrailMode>("permanent");
  const [coveragePercent, setCoveragePercent] = useState<number>(0);
  const [isDragging, setIsDragging] = useState(false);

  // Click tracking
  const [held, setHeld] = useState<ClickHeld>({
    left: false,
    right: false,
    middle: false,
    back: false,
    forward: false,
  });

  const [counts, setCounts] = useState<ClickCounters>({
    left: 0,
    right: 0,
    middle: 0,
    back: 0,
    forward: 0,
  });

  const [doubleClickSpeed, setDoubleClickSpeed] = useState<number | null>(null);
  const [isSwitchChatterWarning, setIsSwitchChatterWarning] = useState(false);

  // Scroll tracking
  const [scrollDelta, setScrollDelta] = useState<{ y: number; x: number }>({ y: 0, x: 0 });
  const [scrollDirection, setScrollDirection] = useState<MessageKey>("tp.idle");
  const [totalScrollSteps, setTotalScrollSteps] = useState<number>(0);

  // Refs for animation & performance
  const lastClickTimeRef = useRef<number>(0);
  const pointsRef = useRef<{ x: number; y: number; time: number; dragging: boolean }[]>([]);
  const timestampsRef = useRef<number[]>([]);
  const gridCellsRef = useRef<Set<string>>(new Set());
  const canvasSizeRef = useRef<{ w: number; h: number }>({ w: 800, h: 280 });

  // 1. Resize canvas to match container width in high-DPI
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(300, Math.floor(rect.width));
    const h = 280;

    canvasSizeRef.current = { w, h };
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.scale(dpr, dpr);
    }
  }, []);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    return () => window.removeEventListener("resize", resizeCanvas);
  }, [resizeCanvas]);

  // Update parent for export
  useEffect(() => {
    onUpdateResult?.({
      coveragePercent,
      doubleClickMs: doubleClickSpeed,
      hasSwitchChatter: isSwitchChatterWarning,
      pollingRateHz: eventRateHz,
      scrollSteps: totalScrollSteps,
    });
  }, [coveragePercent, doubleClickSpeed, isSwitchChatterWarning, eventRateHz, totalScrollSteps, onUpdateResult]);

  // 2. Accurate Polling Rate (Hz) calculated over a moving window of recent pointer events
  useEffect(() => {
    const interval = setInterval(() => {
      const now = performance.now();
      timestampsRef.current = timestampsRef.current.filter((t) => now - t < 1000);
      setEventRateHz(timestampsRef.current.length);
    }, 500);

    return () => clearInterval(interval);
  }, []);

  // 3. Canvas rendering loop
  useEffect(() => {
    let animId: number;

    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const { w, h } = canvasSizeRef.current;

      ctx.clearRect(0, 0, w, h);

      // Grid background
      ctx.strokeStyle = "rgba(51, 65, 85, 0.35)";
      ctx.lineWidth = 1;
      const step = 28;
      for (let x = 0; x < w; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y < h; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // Draw pointer trail
      const now = performance.now();
      const points = pointsRef.current;

      if (points.length > 1) {
        for (let i = 1; i < points.length; i++) {
          const p = points[i];
          const prev = points[i - 1];

          let alpha = 1;
          if (trailMode === "fading") {
            const age = now - p.time;
            if (age > 2000) continue;
            alpha = Math.max(0.05, 1 - age / 2000);
          }

          ctx.beginPath();
          ctx.moveTo(prev.x, prev.y);
          ctx.lineTo(p.x, p.y);

          if (p.dragging) {
            ctx.strokeStyle = `rgba(16, 185, 129, ${alpha})`; // Emerald during drag
            ctx.lineWidth = 4;
          } else {
            ctx.strokeStyle = `rgba(168, 85, 247, ${alpha})`; // Violet during hover
            ctx.lineWidth = 2.5;
          }

          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.stroke();
        }
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [trailMode]);

  // 4. Pointer move & coordinate resolution
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(Math.round(e.clientX - rect.left), rect.width));
    const y = Math.max(0, Math.min(Math.round(e.clientY - rect.top), rect.height));

    setCoords({ x, y });
    timestampsRef.current.push(performance.now());

    // Record point
    const dragging = e.buttons > 0;
    setIsDragging(dragging);
    pointsRef.current.push({ x, y, time: performance.now(), dragging });

    // Track surface coverage grid (divide into 20x10 sectors)
    const cellCol = Math.floor((x / Math.max(1, rect.width)) * 20);
    const cellRow = Math.floor((y / Math.max(1, rect.height)) * 10);
    const cellKey = `${cellCol}-${cellRow}`;
    if (!gridCellsRef.current.has(cellKey)) {
      gridCellsRef.current.add(cellKey);
      const totalCells = 20 * 10;
      setCoveragePercent(Math.round((gridCellsRef.current.size / totalCells) * 100));
    }

    if (trailMode === "fading" && pointsRef.current.length > 500) {
      pointsRef.current.shift();
    }
  };

  // 5. Button Press Handler with Chatter detection
  const registerButtonPress = useCallback((button: number) => {
    const now = performance.now();
    const diff = now - lastClickTimeRef.current;
    lastClickTimeRef.current = now;

    if (button === 0) {
      if (diff > 5 && diff < 75) {
        setIsSwitchChatterWarning(true);
        setDoubleClickSpeed(Math.round(diff));
      } else if (diff >= 75 && diff < 450) {
        setIsSwitchChatterWarning(false);
        setDoubleClickSpeed(Math.round(diff));
      }

      setHeld((prev) => ({ ...prev, left: true }));
      setCounts((prev) => ({ ...prev, left: prev.left + 1 }));
    } else if (button === 1) {
      setHeld((prev) => ({ ...prev, middle: true }));
      setCounts((prev) => ({ ...prev, middle: prev.middle + 1 }));
    } else if (button === 2) {
      setHeld((prev) => ({ ...prev, right: true }));
      setCounts((prev) => ({ ...prev, right: prev.right + 1 }));
    } else if (button === 3) {
      setHeld((prev) => ({ ...prev, back: true }));
      setCounts((prev) => ({ ...prev, back: prev.back + 1 }));
    } else if (button === 4) {
      setHeld((prev) => ({ ...prev, forward: true }));
      setCounts((prev) => ({ ...prev, forward: prev.forward + 1 }));
    }
  }, []);

  const registerButtonRelease = useCallback((button: number) => {
    if (button === 0) setHeld((prev) => ({ ...prev, left: false }));
    if (button === 1) setHeld((prev) => ({ ...prev, middle: false }));
    if (button === 2) setHeld((prev) => ({ ...prev, right: false }));
    if (button === 3) setHeld((prev) => ({ ...prev, back: false }));
    if (button === 4) setHeld((prev) => ({ ...prev, forward: false }));
  }, []);

  // Window-level release safety so buttons never get stuck
  useEffect(() => {
    const handleGlobalMouseUp = (e: MouseEvent) => {
      registerButtonRelease(e.button);
      setIsDragging(false);
    };

    window.addEventListener("mouseup", handleGlobalMouseUp);
    return () => window.removeEventListener("mouseup", handleGlobalMouseUp);
  }, [registerButtonRelease]);

  // Non-passive wheel event on container so page doesn't scroll during testing
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const dy = Math.round(e.deltaY);
      const dx = Math.round(e.deltaX);

      setScrollDelta({ y: dy, x: dx });
      setTotalScrollSteps((prev) => prev + 1);

      if (Math.abs(dy) > Math.abs(dx)) {
        setScrollDirection(dy < 0 ? "tp.up" : "tp.down");
      } else if (Math.abs(dx) > 0) {
        setScrollDirection(dx < 0 ? "tp.left" : "tp.right");
      }
    };

    container.addEventListener("wheel", onWheel, { passive: false });
    return () => container.removeEventListener("wheel", onWheel);
  }, []);

  const clearCanvas = () => {
    pointsRef.current = [];
    gridCellsRef.current.clear();
    setCoveragePercent(0);
    setCounts({ left: 0, right: 0, middle: 0, back: 0, forward: 0 });
    setDoubleClickSpeed(null);
    setIsSwitchChatterWarning(false);
    setScrollDelta({ x: 0, y: 0 });
    setTotalScrollSteps(0);
    setScrollDirection("tp.idle");
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="p-2 rounded-xl bg-violet-950 border border-violet-800 text-violet-400">
              <MousePointer className="w-6 h-6" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white">{t("tp.title")}</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-violet-950/80 border border-violet-700/60 text-violet-300">
                  {t("tp.badge")}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {t("tp.intro")}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setTrailMode((m) => (m === "permanent" ? "fading" : "permanent"))}
              className={cn(
                "px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2",
                trailMode === "permanent"
                  ? "bg-violet-950/80 border-violet-700 text-violet-300 focus-visible:outline-violet-400"
                  : "bg-slate-900 border-slate-700 text-slate-300 focus-visible:outline-slate-400"
              )}
            >
              <Layers className="w-3.5 h-3.5" />
              {trailMode === "permanent" ? t("tp.modePermanent") : t("tp.modeFading")}
            </button>
            <button
              onClick={clearCanvas}
              className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 hover:border-slate-600 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400"
            >
              <RotateCcw className="w-3.5 h-3.5 text-violet-400" />
              {t("tp.reset")}
            </button>
          </div>
        </div>

        {/* Real-time Telemetry Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-1">
            <span className="text-slate-400 block">{t("tp.position")}</span>
            <span className="text-lg font-bold font-mono text-violet-400">
              {coords.x}, {coords.y}
            </span>
          </div>

          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-1">
            <span className="text-slate-400 block">{t("tp.polling")}</span>
            <span className="text-lg font-bold font-mono text-cyan-400">
              {eventRateHz} Hz
            </span>
          </div>

          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-1">
            <span className="text-slate-400 block">{t("tp.coverage")}</span>
            <span className="text-lg font-bold font-mono text-emerald-400">
              {coveragePercent}%
            </span>
          </div>

          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-1">
            <span className="text-slate-400 block">{t("tp.doubleClick")}</span>
            <div className="flex items-center gap-1.5">
              <span className={cn(
                "text-lg font-bold font-mono",
                isSwitchChatterWarning ? "text-rose-400" : "text-emerald-400"
              )}>
                {doubleClickSpeed !== null ? `${doubleClickSpeed} ms` : "—"}
              </span>
              {isSwitchChatterWarning && (
                <span title={t("tp.chatterHint")}>
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                </span>
              )}
            </div>
          </div>

          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-1">
            <span className="text-slate-400 block">{t("tp.scroll")}</span>
            <span className="text-xs font-bold font-mono text-amber-400 truncate block mt-1">
              {t(scrollDirection)} ({totalScrollSteps}x • ΔY: {scrollDelta.y})
            </span>
          </div>
        </div>
      </div>

      {/* Interactive Surface & 5 Button Zones */}
      <div
        ref={containerRef}
        onContextMenu={(e) => e.preventDefault()}
        onMouseDown={(e) => {
          e.preventDefault();
          registerButtonPress(e.button);
        }}
        onMouseUp={(e) => registerButtonRelease(e.button)}
        onAuxClick={(e) => {
          e.preventDefault();
          registerButtonPress(e.button);
        }}
        className="p-5 bg-slate-900/70 border border-slate-800 rounded-2xl space-y-4 select-none"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <span className="text-xs font-semibold text-slate-300 flex items-center gap-2">
            <Laptop className="w-4 h-4 text-violet-400" />
            {t("tp.surface")}
          </span>
          <div className="flex items-center gap-2 text-xs">
            {isDragging ? (
              <span className="px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-700 text-emerald-300 flex items-center gap-1 font-medium">
                <Zap className="w-3 h-3 text-emerald-400" />
                {t("tp.dragging")}
              </span>
            ) : (
              <span className="text-slate-500">{t("tp.free")}</span>
            )}
          </div>
        </div>

        {/* Dynamic High-DPI Canvas */}
        <div className="relative rounded-xl border border-slate-700/80 bg-slate-950/90 overflow-hidden shadow-inner flex items-center justify-center">
          <canvas
            ref={canvasRef}
            onPointerMove={handlePointerMove}
            className="w-full h-[280px] touch-none cursor-crosshair block"
          />
          <div className="absolute top-3 left-3 text-xs text-slate-500 font-mono pointer-events-none">
            {t("tp.zone")}
          </div>
        </div>

        {/* 5-Button Grid: Left, Middle, Right, Side 1 (Back), Side 2 (Forward) */}
        <TouchpadButtonsGrid held={held} counts={counts} />
      </div>

      {/* Troubleshooting and Hardware Advice Cards */}
      <TouchpadAdviceCards />
    </div>
  );
};
