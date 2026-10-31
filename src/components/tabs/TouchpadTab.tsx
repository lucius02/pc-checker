import React, { useState, useEffect, useRef } from "react";
import {
  MousePointer,
  RotateCcw,
  Info,
  Laptop,
} from "lucide-react";
import { cn } from "../../utils/cn";

interface ClickState {
  left: boolean;
  right: boolean;
  middle: boolean;
  leftCount: number;
  rightCount: number;
  middleCount: number;
  lastDoubleSpeedMs: number | null;
}

export const TouchpadTab: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [coords, setCoords] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [eventRateHz, setEventRateHz] = useState<number>(0);
  const [scrollDelta, setScrollDelta] = useState<{ y: number; x: number }>({ y: 0, x: 0 });
  const [clicks, setClicks] = useState<ClickState>({
    left: false,
    right: false,
    middle: false,
    leftCount: 0,
    rightCount: 0,
    middleCount: 0,
    lastDoubleSpeedMs: null,
  });

  const lastClickTimeRef = useRef<number>(0);
  const eventCounterRef = useRef<number>(0);
  const pointsRef = useRef<{ x: number; y: number; time: number }[]>([]);

  // Polling rate counter
  useEffect(() => {
    const interval = setInterval(() => {
      setEventRateHz(eventCounterRef.current);
      eventCounterRef.current = 0;
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Canvas drawing loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Grid background
      ctx.strokeStyle = "rgba(51, 65, 85, 0.3)";
      ctx.lineWidth = 1;
      const step = 25;
      for (let x = 0; x < canvas.width; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      // Draw pointer trail
      const now = performance.now();
      const points = pointsRef.current;

      if (points.length > 1) {
        for (let i = 1; i < points.length; i++) {
          const age = now - points[i].time;
          if (age > 3000) continue; // Keep trail for 3 seconds

          const alpha = Math.max(0.1, 1 - age / 3000);
          ctx.beginPath();
          ctx.moveTo(points[i - 1].x, points[i - 1].y);
          ctx.lineTo(points[i].x, points[i].y);
          ctx.strokeStyle = `rgba(168, 85, 247, ${alpha})`;
          ctx.lineWidth = 3;
          ctx.lineCap = "round";
          ctx.stroke();
        }
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, []);

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = Math.round(e.clientX - rect.left);
    const y = Math.round(e.clientY - rect.top);

    setCoords({ x, y });
    eventCounterRef.current += 1;

    pointsRef.current.push({ x, y, time: performance.now() });
    if (pointsRef.current.length > 600) {
      pointsRef.current.shift();
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const now = performance.now();
    const diff = now - lastClickTimeRef.current;
    lastClickTimeRef.current = now;

    if (e.button === 0) {
      setClicks((prev) => ({
        ...prev,
        left: true,
        leftCount: prev.leftCount + 1,
        lastDoubleSpeedMs: diff < 450 ? Math.round(diff) : prev.lastDoubleSpeedMs,
      }));
    } else if (e.button === 1) {
      setClicks((prev) => ({ ...prev, middle: true, middleCount: prev.middleCount + 1 }));
    } else if (e.button === 2) {
      setClicks((prev) => ({ ...prev, right: true, rightCount: prev.rightCount + 1 }));
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button === 0) setClicks((prev) => ({ ...prev, left: false }));
    if (e.button === 1) setClicks((prev) => ({ ...prev, middle: false }));
    if (e.button === 2) setClicks((prev) => ({ ...prev, right: false }));
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    setScrollDelta({
      x: Math.round(e.deltaX),
      y: Math.round(e.deltaY),
    });
  };

  const clearCanvas = () => {
    pointsRef.current = [];
    setClicks({
      left: false,
      right: false,
      middle: false,
      leftCount: 0,
      rightCount: 0,
      middleCount: 0,
      lastDoubleSpeedMs: null,
    });
    setScrollDelta({ x: 0, y: 0 });
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
              <h2 className="text-lg font-bold text-white">Touchpad &amp; Muis Test</h2>
              <p className="text-xs text-slate-400 mt-1">
                Beweeg en klik op het interactieve touchpad-canvas om dode hoeken, cursorhaperingen, klikknoppen en de polling rate (Hz) te testen.
              </p>
            </div>
          </div>

          <button
            onClick={clearCanvas}
            className="px-4 py-2 rounded-xl bg-slate-900 border border-slate-700 hover:border-slate-600 text-slate-200 text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400"
          >
            <RotateCcw className="w-4 h-4 text-violet-400" />
            Spoor Wissen &amp; Reset
          </button>
        </div>

        {/* Real-time Telemetry Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-1">
            <span className="text-slate-400 block">Positie (X, Y)</span>
            <span className="text-lg font-bold font-mono text-violet-400">
              {coords.x}, {coords.y}
            </span>
          </div>

          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-1">
            <span className="text-slate-400 block">Muis Reactiesnelheid (Rate)</span>
            <span className="text-lg font-bold font-mono text-cyan-400">
              {eventRateHz} Hz (events/s)
            </span>
          </div>

          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-1">
            <span className="text-slate-400 block">Dubbelklik Snelheid</span>
            <span className="text-lg font-bold font-mono text-emerald-400">
              {clicks.lastDoubleSpeedMs !== null ? `${clicks.lastDoubleSpeedMs} ms` : "—"}
            </span>
          </div>

          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-1">
            <span className="text-slate-400 block">Scrollwiel Delta (Y / X)</span>
            <span className="text-lg font-bold font-mono text-amber-400">
              {scrollDelta.y} / {scrollDelta.x}
            </span>
          </div>
        </div>
      </div>

      {/* Interactive Touchpad Surface & Buttons */}
      <div
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
        className="p-5 bg-slate-900/70 border border-slate-800 rounded-2xl space-y-4 select-none"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <span className="text-xs font-semibold text-slate-300 flex items-center gap-2">
            <Laptop className="w-4 h-4 text-violet-400" />
            Interactief Touchpad Tekenvlak (beweeg met je vinger of muis):
          </span>
          <span className="text-xs text-slate-500">
            Linker-, rechter- en middenmuisklik worden direct geregistreerd
          </span>
        </div>

        {/* Canvas Area */}
        <div className="relative rounded-xl border border-slate-700/80 bg-slate-950/90 overflow-hidden shadow-inner flex items-center justify-center">
          <canvas
            ref={canvasRef}
            width={720}
            height={260}
            onPointerMove={handlePointerMove}
            className="w-full h-64 touch-none cursor-crosshair"
          />
          <div className="absolute top-3 left-3 text-xs text-slate-500 font-mono pointer-events-none">
            Touchpad Traceer-Zone
          </div>
        </div>

        {/* Physical / Gesture Click Zones */}
        <div className="grid grid-cols-3 gap-3 pt-1">
          <div
            className={cn(
              "p-4 rounded-xl border text-center transition-all cursor-pointer font-semibold text-xs",
              clicks.left
                ? "bg-violet-600 border-violet-400 text-white shadow-lg shadow-violet-500/30 scale-98"
                : "bg-slate-950/80 border-slate-800 text-slate-300 hover:border-slate-700"
            )}
          >
            <span className="block text-slate-400 text-xs">Linkerklik (LMB)</span>
            <span className="text-lg font-bold font-mono text-violet-400 block mt-0.5">
              {clicks.leftCount}x
            </span>
          </div>

          <div
            className={cn(
              "p-4 rounded-xl border text-center transition-all cursor-pointer font-semibold text-xs",
              clicks.middle
                ? "bg-cyan-600 border-cyan-400 text-white shadow-lg shadow-cyan-500/30 scale-98"
                : "bg-slate-950/80 border-slate-800 text-slate-300 hover:border-slate-700"
            )}
          >
            <span className="block text-slate-400 text-xs">Middenklik / Scrollklik</span>
            <span className="text-lg font-bold font-mono text-cyan-400 block mt-0.5">
              {clicks.middleCount}x
            </span>
          </div>

          <div
            className={cn(
              "p-4 rounded-xl border text-center transition-all cursor-pointer font-semibold text-xs",
              clicks.right
                ? "bg-purple-600 border-purple-400 text-white shadow-lg shadow-purple-500/30 scale-98"
                : "bg-slate-950/80 border-slate-800 text-slate-300 hover:border-slate-700"
            )}
          >
            <span className="block text-slate-400 text-xs">Rechterklik (RMB)</span>
            <span className="text-lg font-bold font-mono text-purple-400 block mt-0.5">
              {clicks.rightCount}x
            </span>
          </div>
        </div>
      </div>

      {/* Laptop & Touchpad Troubleshooting Advice */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-2">
          <h4 className="font-semibold text-slate-200 flex items-center gap-2">
            <Laptop className="w-4 h-4 text-violet-400" />
            Zwevende of schokkende muisaanwijzer op laptop?
          </h4>
          <p className="text-slate-400 text-xs leading-relaxed">
            Als de muisaanwijzer vanzelf beweegt of schokt tijdens het aanraken, wordt dit meestal veroorzaakt door:
          </p>
          <ul className="list-disc list-inside text-slate-400 space-y-1">
            <li><strong>Slechte aarding van de oplader:</strong> test of het probleem stopt als je de laptop op de accu gebruikt.</li>
            <li><strong>Vettig of vochtig oppervlak:</strong> reinig het touchpad met een droge microvezeldoek.</li>
            <li><strong>Opbollende batterij:</strong> een versleten lithium-accu zit direct onder het touchpad en kan van binnenuit druk uitoefenen.</li>
          </ul>
        </div>

        <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-2">
          <h4 className="font-semibold text-slate-200 flex items-center gap-2">
            <Info className="w-4 h-4 text-cyan-400" />
            Windows Precision Touchpad Drivers
          </h4>
          <p className="text-slate-400 text-xs leading-relaxed">
            Moderne laptops gebruiken <em>Microsoft Precision Touchpad</em> stuurprogramma's. Hiermee werken soepele tweevinger-scrollbewegingen, pinch-to-zoom en drievings-swipes direct in Windows zonder hapering. 
            Controleer in <strong>Instellingen &rarr; Bluetooth en apparaten &rarr; Touchpad</strong> of alle gebaren actief zijn.
          </p>
        </div>
      </div>
    </div>
  );
};
