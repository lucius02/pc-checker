import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Keyboard,
  RotateCcw,
  Info,
  Zap,
} from "lucide-react";
import { cn } from "../../utils/cn";

interface KeyDef {
  code: string;
  label: string;
  width?: string;
}

// Keyboard rows definition
const KEYBOARD_ROWS: KeyDef[][] = [
  // Function Row
  [
    { code: "Escape", label: "ESC", width: "w-11" },
    { code: "F1", label: "F1" },
    { code: "F2", label: "F2" },
    { code: "F3", label: "F3" },
    { code: "F4", label: "F4" },
    { code: "F5", label: "F5" },
    { code: "F6", label: "F6" },
    { code: "F7", label: "F7" },
    { code: "F8", label: "F8" },
    { code: "F9", label: "F9" },
    { code: "F10", label: "F10" },
    { code: "F11", label: "F11" },
    { code: "F12", label: "F12" },
    { code: "PrintScreen", label: "PRT" },
    { code: "ScrollLock", label: "SCR" },
    { code: "Pause", label: "PAU" },
  ],
  // Number Row
  [
    { code: "Backquote", label: "` ~" },
    { code: "Digit1", label: "1" },
    { code: "Digit2", label: "2" },
    { code: "Digit3", label: "3" },
    { code: "Digit4", label: "4" },
    { code: "Digit5", label: "5" },
    { code: "Digit6", label: "6" },
    { code: "Digit7", label: "7" },
    { code: "Digit8", label: "8" },
    { code: "Digit9", label: "9" },
    { code: "Digit0", label: "0" },
    { code: "Minus", label: "- _" },
    { code: "Equal", label: "= +" },
    { code: "Backspace", label: "Backspace", width: "w-20 sm:w-24" },
    { code: "Insert", label: "INS" },
    { code: "Delete", label: "DEL" },
  ],
  // QWERTY Row
  [
    { code: "Tab", label: "Tab", width: "w-14 sm:w-16" },
    { code: "KeyQ", label: "Q" },
    { code: "KeyW", label: "W" },
    { code: "KeyE", label: "E" },
    { code: "KeyR", label: "R" },
    { code: "KeyT", label: "T" },
    { code: "KeyY", label: "Y" },
    { code: "KeyU", label: "U" },
    { code: "KeyI", label: "I" },
    { code: "KeyO", label: "O" },
    { code: "KeyP", label: "P" },
    { code: "BracketLeft", label: "[ {" },
    { code: "BracketRight", label: "] }" },
    { code: "Backslash", label: "\\ |", width: "w-14 sm:w-16" },
    { code: "Home", label: "HOME" },
    { code: "End", label: "END" },
  ],
  // ASDF Row
  [
    { code: "CapsLock", label: "Caps Lock", width: "w-16 sm:w-20" },
    { code: "KeyA", label: "A" },
    { code: "KeyS", label: "S" },
    { code: "KeyD", label: "D" },
    { code: "KeyF", label: "F" },
    { code: "KeyG", label: "G" },
    { code: "KeyH", label: "H" },
    { code: "KeyJ", label: "J" },
    { code: "KeyK", label: "K" },
    { code: "KeyL", label: "L" },
    { code: "Semicolon", label: "; :" },
    { code: "Quote", label: "' \"" },
    { code: "Enter", label: "Enter", width: "w-20 sm:w-24" },
    { code: "PageUp", label: "PGUP" },
    { code: "PageDown", label: "PGDN" },
  ],
  // ZXCV Row
  [
    { code: "ShiftLeft", label: "Shift", width: "w-20 sm:w-24" },
    { code: "KeyZ", label: "Z" },
    { code: "KeyX", label: "X" },
    { code: "KeyC", label: "C" },
    { code: "KeyV", label: "V" },
    { code: "KeyB", label: "B" },
    { code: "KeyN", label: "N" },
    { code: "KeyM", label: "M" },
    { code: "Comma", label: ", <" },
    { code: "Period", label: ". >" },
    { code: "Slash", label: "/ ?" },
    { code: "ShiftRight", label: "Shift", width: "w-24 sm:w-28" },
    { code: "ArrowUp", label: "▲" },
  ],
  // Bottom Row
  [
    { code: "ControlLeft", label: "Ctrl", width: "w-12 sm:w-14" },
    { code: "MetaLeft", label: "Win", width: "w-11 sm:w-12" },
    { code: "AltLeft", label: "Alt", width: "w-12 sm:w-14" },
    { code: "Space", label: "Spacebar", width: "flex-1 max-w-sm sm:max-w-md" },
    { code: "AltRight", label: "AltGr", width: "w-12 sm:w-14" },
    { code: "MetaRight", label: "Win", width: "w-11 sm:w-12" },
    { code: "ContextMenu", label: "Menu", width: "w-11 sm:w-12" },
    { code: "ControlRight", label: "Ctrl", width: "w-12 sm:w-14" },
    { code: "ArrowLeft", label: "◀" },
    { code: "ArrowDown", label: "▼" },
    { code: "ArrowRight", label: "▶" },
  ],
];

export const KeyboardTab: React.FC = () => {
  const [pressedCodes, setPressedCodes] = useState<Set<string>>(new Set());
  const [testedCodes, setTestedCodes] = useState<Set<string>>(new Set());
  const [maxRollover, setMaxRollover] = useState<number>(0);
  const [lastEvent, setLastEvent] = useState<{
    key: string;
    code: string;
    time: string;
  } | null>(null);

  const totalKeysCount = useMemo(() => {
    return KEYBOARD_ROWS.reduce((acc, row) => acc + row.length, 0);
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Prevent default browser shortcuts for testing purposes
    if (["Tab", "Space", "Backspace", "Alt", "F1", "F3", "F5", "F6", "F7"].includes(e.key)) {
      e.preventDefault();
    }

    const code = e.code;
    setPressedCodes((prev) => {
      const next = new Set(prev);
      next.add(code);
      if (next.size > maxRollover) {
        setMaxRollover(next.size);
      }
      return next;
    });

    setTestedCodes((prev) => {
      const next = new Set(prev);
      next.add(code);
      return next;
    });

    setLastEvent({
      key: e.key,
      code: e.code,
      time: new Date().toLocaleTimeString(),
    });
  }, [maxRollover]);

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    setPressedCodes((prev) => {
      const next = new Set(prev);
      next.delete(e.code);
      return next;
    });
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [handleKeyDown, handleKeyUp]);

  const resetTest = () => {
    setPressedCodes(new Set());
    setTestedCodes(new Set());
    setMaxRollover(0);
    setLastEvent(null);
  };

  const progressPercent = Math.min(
    100,
    Math.round((testedCodes.size / totalKeysCount) * 100)
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="p-2 rounded-xl bg-emerald-950 border border-emerald-800 text-emerald-400">
              <Keyboard className="w-6 h-6" />
            </span>
            <div>
              <h2 className="text-lg font-bold text-white">Toetsenbord &amp; Ghosting Test</h2>
              <p className="text-xs text-slate-400 mt-1">
                Druk op willekeurige toetsen op je laptop of losse toetsenbord. Elke werkende toets licht groen op en registreert rollover/ghosting.
              </p>
            </div>
          </div>

          <button
            onClick={resetTest}
            className="px-4 py-2 rounded-xl bg-slate-900 border border-slate-700 hover:border-slate-600 text-slate-200 text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
          >
            <RotateCcw className="w-4 h-4 text-emerald-400" />
            Reset Toetsentest
          </button>
        </div>

        {/* Progress & Stat Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-1">
            <span className="text-slate-400 block">Geteste Toetsen</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-bold font-mono text-emerald-400">
                {testedCodes.size}
              </span>
              <span className="text-slate-500">/ {totalKeysCount} ({progressPercent}%)</span>
            </div>
          </div>

          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-1">
            <span className="text-slate-400 block">Live Ingedrukt</span>
            <span className="text-xl font-bold font-mono text-cyan-400">
              {pressedCodes.size}
            </span>
          </div>

          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-1">
            <span className="text-slate-400 block">Max Gelijktijdig (Rollover)</span>
            <span className="text-xl font-bold font-mono text-purple-400">
              {maxRollover} toetsen
            </span>
          </div>

          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-1">
            <span className="text-slate-400 block">Laatste Aanslag</span>
            <span className="text-xs font-mono font-bold text-slate-200 truncate block">
              {lastEvent ? `${lastEvent.key} (${lastEvent.code})` : "Nog geen"}
            </span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
          <div
            className="bg-emerald-400 h-1.5 rounded-full transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Visual Keyboard Matrix */}
      <div className="p-5 bg-slate-900/70 border border-slate-800 rounded-2xl space-y-2 overflow-x-auto">
        <div className="min-w-[760px] space-y-1.5 py-2">
          {KEYBOARD_ROWS.map((row, rIdx) => (
            <div key={rIdx} className="flex gap-1.5 justify-center">
              {row.map((k) => {
                const isPressed = pressedCodes.has(k.code);
                const isTested = testedCodes.has(k.code);

                return (
                  <div
                    key={k.code}
                    className={cn(
                      "h-9 sm:h-10 rounded-lg text-xs font-mono font-medium flex items-center justify-center transition-all select-none border",
                      k.width || "w-9 sm:w-10",
                      isPressed
                        ? "bg-emerald-500 border-emerald-400 text-slate-950 font-bold scale-95 shadow-md shadow-emerald-500/40"
                        : isTested
                        ? "bg-emerald-950/60 border-emerald-700/80 text-emerald-300"
                        : "bg-slate-950/80 border-slate-800/90 text-slate-400 hover:border-slate-700"
                    )}
                    title={`Code: ${k.code}`}
                  >
                    {k.label}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Advice and Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-2">
          <h4 className="font-semibold text-slate-200 flex items-center gap-2">
            <Zap className="w-4 h-4 text-emerald-400" />
            Wat is Ghosting &amp; N-Key Rollover (NKRO)?
          </h4>
          <p className="text-slate-400 text-xs leading-relaxed">
            Veel kantoor- en goedkopere laptop-toetsenborden gebruiken een gedeelde printplaatmatrix. Hierdoor registreren ze maximaal <strong>3 tot 6 gelijktijdige toetsen</strong>. 
            Gaming-toetsenborden hebben <em>N-Key Rollover (NKRO)</em>, waardoor je tientallen toetsen tegelijk kunt indrukken zonder dat er toetsen wegvallen (ghosting).
          </p>
        </div>

        <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-2">
          <h4 className="font-semibold text-slate-200 flex items-center gap-2">
            <Info className="w-4 h-4 text-cyan-400" />
            Toets weigert of typt dubbel (Key Chatter)?
          </h4>
          <p className="text-slate-400 text-xs leading-relaxed">
            Als een toets niet oplicht of dubbele letters typt, zit er vaak stof onder het membraan of is een schakelaar vervuild. 
            Reiniging met perslucht (bij laptops) of isopropylalcohol (bij mechanische switches) lost dit in 90% van de gevallen op zonder reparatiekosten.
          </p>
        </div>
      </div>
    </div>
  );
};
