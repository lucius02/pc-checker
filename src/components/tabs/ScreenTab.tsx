import React, { useState, useEffect, useCallback } from "react";
import {
  Monitor,
  Maximize,
  Palette,
  Sliders,
  Info,
  Eye,
} from "lucide-react";

const SOLID_COLORS = [
  { name: "Zwart", hex: "#000000", desc: "Controleert op vastzittende (stuck) heldere subpixels & backlight bleed" },
  { name: "Wit", hex: "#ffffff", desc: "Controleert op dode (zwarte) pixels en vlekken op het diffusiepaneel" },
  { name: "Puur Rood", hex: "#ff0000", desc: "Controleert op ontbrekende of defecte rode subpixels" },
  { name: "Puur Groen", hex: "#00ff00", desc: "Controleert op ontbrekende of defecte groene subpixels" },
  { name: "Puur Blauw", hex: "#0000ff", desc: "Controleert op ontbrekende of defecte blauwe subpixels" },
  { name: "Geel", hex: "#ffff00", desc: "Combinatietest rood + groen" },
  { name: "Cyaan", hex: "#00ffff", desc: "Combinatietest groen + blauw" },
  { name: "Magenta", hex: "#ff00ff", desc: "Combinatietest rood + blauw" },
];

export const ScreenTab: React.FC = () => {
  const [isFullscreenMode, setIsFullscreenMode] = useState(false);
  const [colorIndex, setColorIndex] = useState(0);
  const [measuredHz, setMeasuredHz] = useState<number | null>(null);

  // Measure display refresh rate using requestAnimationFrame
  useEffect(() => {
    let frameCount = 0;
    let startTime = performance.now();
    let animId: number;

    const measure = (now: number) => {
      frameCount++;
      const elapsed = now - startTime;
      if (elapsed >= 1000) {
        const fps = Math.round((frameCount * 1000) / elapsed);
        setMeasuredHz(fps);
        frameCount = 0;
        startTime = now;
      }
      animId = requestAnimationFrame(measure);
    };

    animId = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(animId);
  }, []);

  // Handle keyboard navigation in fullscreen mode
  const nextColor = useCallback(() => {
    setColorIndex((prev) => (prev + 1) % SOLID_COLORS.length);
  }, []);

  const prevColor = useCallback(() => {
    setColorIndex((prev) => (prev - 1 + SOLID_COLORS.length) % SOLID_COLORS.length);
  }, []);

  useEffect(() => {
    if (!isFullscreenMode) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsFullscreenMode(false);
      } else if (e.key === "ArrowRight" || e.key === " " || e.key === "Enter") {
        nextColor();
      } else if (e.key === "ArrowLeft") {
        prevColor();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreenMode, nextColor, prevColor]);

  const currentColor = SOLID_COLORS[colorIndex];
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio : 1;
  const scalingPercent = Math.round(dpr * 100);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Fullscreen Dode Pixel Overlay */}
      {isFullscreenMode && (
        <div
          onClick={nextColor}
          style={{ backgroundColor: currentColor.hex }}
          className="fixed inset-0 z-50 flex flex-col justify-between p-6 cursor-pointer select-none"
        >
          <div className="flex items-center justify-between text-xs bg-slate-950/80 backdrop-blur-md px-4 py-2.5 rounded-xl border border-slate-800 text-white shadow-xl max-w-xl mx-auto opacity-70 hover:opacity-100 transition-opacity">
            <span>
              Kleur {colorIndex + 1}/{SOLID_COLORS.length}: <strong>{currentColor.name}</strong> ({currentColor.desc})
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsFullscreenMode(false);
              }}
              className="ml-4 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold cursor-pointer"
            >
              Sluiten (ESC)
            </button>
          </div>

          <div className="text-center text-xs text-white/50 bg-slate-950/50 backdrop-blur-xs py-1 rounded-full max-w-sm mx-auto">
            Klik op het scherm of druk op Spatiebalk / Pijltjes om van kleur te wisselen
          </div>
        </div>
      )}

      {/* Header */}
      <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="p-2 rounded-xl bg-teal-950 border border-teal-800 text-teal-400">
              <Monitor className="w-6 h-6" />
            </span>
            <div>
              <h2 className="text-lg font-bold text-white">Beeldscherm &amp; Dode Pixel Test</h2>
              <p className="text-xs text-slate-400 mt-1">
                Controleer op dode of vastzittende pixels, schermbanding, kleurweergave en verversingssnelheid (Hz).
              </p>
            </div>
          </div>

          <button
            onClick={() => setIsFullscreenMode(true)}
            className="px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-lg shadow-teal-600/20 transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-400"
          >
            <Maximize className="w-4 h-4 text-slate-950" />
            Start Dode Pixel Test (Volledig Scherm)
          </button>
        </div>

        {/* Display Hardware Specs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-1">
            <span className="text-slate-400 block">Schermresolutie</span>
            <span className="text-lg font-bold font-mono text-teal-400">
              {window.screen.width} × {window.screen.height}
            </span>
          </div>

          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-1">
            <span className="text-slate-400 block">Verversingssnelheid (FPS/Hz)</span>
            <span className="text-lg font-bold font-mono text-cyan-400">
              {measuredHz ? `${measuredHz} Hz` : "Meting..."}
            </span>
          </div>

          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-1">
            <span className="text-slate-400 block">Windows Schaling</span>
            <span className="text-lg font-bold font-mono text-purple-400">
              {scalingPercent}% ({dpr}x)
            </span>
          </div>

          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-1">
            <span className="text-slate-400 block">Kleurdiepte</span>
            <span className="text-lg font-bold font-mono text-emerald-400">
              {window.screen.colorDepth}-bit kleur
            </span>
          </div>
        </div>
      </div>

      {/* Mini Color Swatches Selector */}
      <div className="p-5 bg-slate-900/70 border border-slate-800 rounded-2xl space-y-3">
        <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
          <Palette className="w-4 h-4 text-teal-400" />
          Kleurpalet &amp; Subpixel Tester
        </h3>
        <p className="text-xs text-slate-400">
          Klik op een kleurvak om de inspectiemodus te openen of bekijk de egale tinten direct hieronder:
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          {SOLID_COLORS.map((col, idx) => (
            <button
              key={col.hex}
              onClick={() => {
                setColorIndex(idx);
                setIsFullscreenMode(true);
              }}
              className="p-3 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl flex items-center gap-3 text-left transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-400"
            >
              <div
                style={{ backgroundColor: col.hex }}
                className="w-7 h-7 rounded-lg border border-slate-700/80 shrink-0 shadow-sm"
              />
              <div className="min-w-0">
                <span className="font-semibold text-slate-200 text-xs block truncate">
                  {col.name}
                </span>
                <span className="text-slate-500 text-xs font-mono block">
                  {col.hex}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Grayscale Banding & Contrast Check */}
      <div className="p-5 bg-slate-900/70 border border-slate-800 rounded-2xl space-y-4">
        <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
          <Sliders className="w-4 h-4 text-cyan-400" />
          Dynamisch Bereik &amp; Grijswaarden Banding Check
        </h3>
        <p className="text-xs text-slate-400">
          Een goed beeldscherm toont een vloeiend verloop zonder harde strepen (color banding) en laat subtiele donkere tinten duidelijk onderscheiden.
        </p>

        {/* 256-step Gradient Bar */}
        <div className="space-y-1.5">
          <span className="text-xs text-slate-400 font-medium">Vloeiend Zwart naar Wit Verloop:</span>
          <div className="w-full h-8 rounded-lg bg-linear-to-r from-black via-slate-500 to-white border border-slate-700 shadow-inner" />
        </div>

        {/* RGB Gradients */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          <div className="space-y-1">
            <span className="text-xs text-slate-400">Rood verloop:</span>
            <div className="w-full h-6 rounded-lg bg-linear-to-r from-black to-red-500 border border-slate-700" />
          </div>
          <div className="space-y-1">
            <span className="text-xs text-slate-400">Groen verloop:</span>
            <div className="w-full h-6 rounded-lg bg-linear-to-r from-black to-green-500 border border-slate-700" />
          </div>
          <div className="space-y-1">
            <span className="text-xs text-slate-400">Blauw verloop:</span>
            <div className="w-full h-6 rounded-lg bg-linear-to-r from-black to-blue-500 border border-slate-700" />
          </div>
        </div>

        {/* Low Contrast Step Blocks */}
        <div className="space-y-1.5 pt-2">
          <span className="text-xs text-slate-400 font-medium">Zwart-niveau details (kun je de blokjes onderscheiden?):</span>
          <div className="grid grid-cols-5 gap-2 text-center text-xs font-mono">
            <div className="p-3 bg-[#050505] border border-slate-800 rounded-lg text-slate-400">2%</div>
            <div className="p-3 bg-[#0a0a0a] border border-slate-800 rounded-lg text-slate-400">4%</div>
            <div className="p-3 bg-[#111111] border border-slate-800 rounded-lg text-slate-300">7%</div>
            <div className="p-3 bg-[#181818] border border-slate-800 rounded-lg text-slate-200">10%</div>
            <div className="p-3 bg-[#222222] border border-slate-800 rounded-lg text-slate-100">14%</div>
          </div>
        </div>
      </div>

      {/* Informative Guidance */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-2">
          <h4 className="font-semibold text-slate-200 flex items-center gap-2">
            <Eye className="w-4 h-4 text-teal-400" />
            Vastzittende pixel (stuck) vs. Dode pixel (dead)
          </h4>
          <p className="text-slate-400 text-xs leading-relaxed">
            Een <strong>dode pixel</strong> is permanent zwart doordat de transistor defect is. 
            Een <strong>vastzittende pixel</strong> geeft continu rood, groen of blauw licht. Vastzittende pixels kunnen soms herstellen door snelle kleurcycli of door zachtjes met een microvezeldoekje over het paneel te wrijven.
          </p>
        </div>

        <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-2">
          <h4 className="font-semibold text-slate-200 flex items-center gap-2">
            <Info className="w-4 h-4 text-cyan-400" />
            Garantienormen (ISO 9241-307)
          </h4>
          <p className="text-slate-400 text-xs leading-relaxed">
            Fabrikanten hanteren doorgaans ISO Klasse II. Dit betekent dat 1 tot 3 dode pixels op een consumentenlaptop of monitor binnen de fabricagetolerantie vallen. 
            Bij méér dan 3 defecte pixels heb je doorgaans recht op garantie of vervanging van het beeldscherm.
          </p>
        </div>
      </div>
    </div>
  );
};
