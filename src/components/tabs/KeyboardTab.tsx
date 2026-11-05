import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Keyboard,
  RotateCcw,
  Info,
  Zap,
  Laptop,
  Monitor,
  Layers,
  Sparkles,
  HelpCircle,
  Maximize,
  Minimize,
} from "lucide-react";
import { cn } from "../../utils/cn";
import {
  FormFactor,
  KeymapType,
  EnterStyle,
  generateKeyboardRows,
  NUMPAD_ROWS,
  scanKeyboardLayout,
} from "./keyboard/keyboardLayouts";
import { useT } from "../../i18n";
import { RichText } from "../../i18n/RichText";

interface KeyboardTabProps {
  isLaptop?: boolean;
  onUpdateResult?: (data: {
    testedKeys: number;
    totalKeys: number;
    maxRollover: number;
    formFactor: string;
    keymap: string;
    enterStyle: string;
  }) => void;
}

export const KeyboardTab: React.FC<KeyboardTabProps> = ({
  isLaptop = false,
  onUpdateResult,
}) => {
  const t = useT();
  const [formFactor, setFormFactor] = useState<FormFactor>(isLaptop ? "laptop" : "full");
  const [keymapType, setKeymapType] = useState<KeymapType>("qwerty");
  const [enterStyle, setEnterStyle] = useState<EnterStyle>("ansi");
  const [scanInfo, setScanInfo] = useState<string>("");
  const [hasScanned, setHasScanned] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [pressedCodes, setPressedCodes] = useState<Set<string>>(new Set());
  const [testedCodes, setTestedCodes] = useState<Set<string>>(new Set());
  const [maxRollover, setMaxRollover] = useState<number>(0);
  const [lastEvent, setLastEvent] = useState<{
    key: string;
    code: string;
    time: string;
  } | null>(null);

  // Track fullscreen state
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.error("Fullscreen error:", err);
    }
  };

  // Scan layout on mount or when isLaptop changes
  const runAutoScan = useCallback(async () => {
    try {
      const res = await scanKeyboardLayout(isLaptop);
      setFormFactor(res.formFactor);
      setKeymapType(res.keymapType);
      setEnterStyle(res.enterStyle);
      setScanInfo(res.details);
      setHasScanned(true);
    } catch {
      setScanInfo(t("kb.scanFallback"));
    }
  }, [isLaptop, t]);

  useEffect(() => {
    runAutoScan();
  }, [runAutoScan]);

  // Generate rows dynamically
  const mainRows = useMemo(() => {
    return generateKeyboardRows(formFactor, keymapType, enterStyle);
  }, [formFactor, keymapType, enterStyle]);

  // Calculate total key count
  const totalKeysCount = useMemo(() => {
    const mainCount = mainRows.reduce((acc, row) => acc + row.length, 0);
    const numpadCount =
      formFactor === "full"
        ? NUMPAD_ROWS.reduce((acc, row) => acc + row.length, 0)
        : 0;
    return mainCount + numpadCount;
  }, [mainRows, formFactor]);

  useEffect(() => {
    onUpdateResult?.({
      testedKeys: testedCodes.size,
      totalKeys: totalKeysCount,
      maxRollover,
      formFactor,
      keymap: keymapType,
      enterStyle,
    });
  }, [testedCodes.size, totalKeysCount, maxRollover, formFactor, keymapType, enterStyle, onUpdateResult]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Prevent default browser shortcuts for testing purposes
    if (["Tab", "Space", "Backspace", "Alt", "F1", "F3", "F5", "F6", "F7"].includes(e.key)) {
      e.preventDefault();
    }

    const code = e.code;

    // Smart sniffing: If user presses ISO backslash key (< > |), switch to ISO enter
    if (code === "IntlBackslash" && enterStyle !== "iso") {
      setEnterStyle("iso");
    }

    // Smart sniffing: If user presses a Numpad key while in laptop/tkl mode, offer/switch to Full
    if (code.startsWith("Numpad") && formFactor !== "full") {
      setFormFactor("full");
    }

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
  }, [enterStyle, formFactor, maxRollover]);

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
      {/* Header & Controls */}
      <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="p-2 rounded-xl bg-emerald-950 border border-emerald-800 text-emerald-400">
              <Keyboard className="w-6 h-6" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white">{t("kb.title")}</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950/80 border border-emerald-700/60 text-emerald-300">
                  {formFactor === "laptop" ? "Laptop 75%" : formFactor === "tkl" ? "TKL 80%" : t("kb.ffFull")}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {t("kb.intro")}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleFullscreen}
              title={t("kb.fsTitle")}
              aria-label={isFullscreen ? t("kb.fsExit") : t("kb.fsEnter")}
              className={cn(
                "px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2",
                isFullscreen
                  ? "bg-purple-950/80 border-purple-700 text-purple-300 focus-visible:outline-purple-400"
                  : "bg-slate-900 border-slate-700 hover:border-slate-600 text-slate-300 focus-visible:outline-slate-400"
              )}
            >
              {isFullscreen ? (
                <>
                  <Minimize className="w-3.5 h-3.5 text-purple-400" />
                  {t("kb.leaveFocus")}
                </>
              ) : (
                <>
                  <Maximize className="w-3.5 h-3.5 text-purple-400" />
                  {t("kb.focusMode")}
                </>
              )}
            </button>
            <button
              onClick={runAutoScan}
              title={t("kb.scanTitle")}
              aria-label={t("kb.scanAria")}
              className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 hover:border-slate-600 text-cyan-300 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
            >
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              {t("kb.scan")}
            </button>
            <button
              onClick={resetTest}
              aria-label={t("kb.resetAria")}
              className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 hover:border-slate-600 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
            >
              <RotateCcw className="w-3.5 h-3.5 text-emerald-400" />
              {t("kb.reset")}
            </button>
          </div>
        </div>

        {/* Scan Status banner */}
        <div className="px-4 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-slate-300">
            <HelpCircle className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="font-mono text-[11px] text-slate-300">
              {hasScanned ? scanInfo : t("kb.scanning")}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            {/* Form factor switcher */}
            <div className="flex items-center rounded-lg bg-slate-900 border border-slate-800 p-0.5">
              <button
                onClick={() => setFormFactor("laptop")}
                className={cn(
                  "px-2 py-1 rounded-md transition-all font-medium flex items-center gap-1",
                  formFactor === "laptop"
                    ? "bg-emerald-600 text-white font-semibold"
                    : "text-slate-400 hover:text-slate-200"
                )}
              >
                <Laptop className="w-3 h-3" />
                Laptop 75%
              </button>
              <button
                onClick={() => setFormFactor("tkl")}
                className={cn(
                  "px-2 py-1 rounded-md transition-all font-medium flex items-center gap-1",
                  formFactor === "tkl"
                    ? "bg-emerald-600 text-white font-semibold"
                    : "text-slate-400 hover:text-slate-200"
                )}
              >
                <Layers className="w-3 h-3" />
                TKL 80%
              </button>
              <button
                onClick={() => setFormFactor("full")}
                className={cn(
                  "px-2 py-1 rounded-md transition-all font-medium flex items-center gap-1",
                  formFactor === "full"
                    ? "bg-emerald-600 text-white font-semibold"
                    : "text-slate-400 hover:text-slate-200"
                )}
              >
                <Monitor className="w-3 h-3" />
                100% Numpad
              </button>
            </div>

            {/* Layout switcher */}
            <div className="flex items-center rounded-lg bg-slate-900 border border-slate-800 p-0.5">
              {(["qwerty", "azerty", "qwertz"] as KeymapType[]).map((km) => (
                <button
                  key={km}
                  onClick={() => setKeymapType(km)}
                  className={cn(
                    "px-2 py-1 rounded-md uppercase font-mono transition-all font-medium",
                    keymapType === km
                      ? "bg-cyan-600 text-white font-semibold"
                      : "text-slate-400 hover:text-slate-200"
                  )}
                >
                  {km}
                </button>
              ))}
            </div>

            {/* Enter style switcher */}
            <div className="flex items-center rounded-lg bg-slate-900 border border-slate-800 p-0.5">
              {(["ansi", "iso"] as EnterStyle[]).map((es) => (
                <button
                  key={es}
                  onClick={() => setEnterStyle(es)}
                  className={cn(
                    "px-2 py-1 rounded-md uppercase font-mono transition-all font-medium",
                    enterStyle === es
                      ? "bg-purple-600 text-white font-semibold"
                      : "text-slate-400 hover:text-slate-200"
                  )}
                >
                  {es === "ansi" ? t("kb.ansi") : t("kb.iso")}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Progress & Stat Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-1">
            <span className="text-slate-400 block">{t("kb.tested")}</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-bold font-mono text-emerald-400">
                {testedCodes.size}
              </span>
              <span className="text-slate-500">/ {totalKeysCount} ({progressPercent}%)</span>
            </div>
          </div>

          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-1">
            <span className="text-slate-400 block">{t("kb.pressed")}</span>
            <span className="text-xl font-bold font-mono text-cyan-400">
              {pressedCodes.size}
            </span>
          </div>

          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-1">
            <span className="text-slate-400 block">{t("kb.rollover")}</span>
            <span className="text-xl font-bold font-mono text-purple-400">
              {t("kb.keys", { n: maxRollover })}
            </span>
          </div>

          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-1">
            <span className="text-slate-400 block">{t("kb.last")}</span>
            <span className="text-xs font-mono font-bold text-slate-200 truncate block">
              {lastEvent ? `${lastEvent.key} (${lastEvent.code})` : t("kb.none")}
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

      {/* Visual Keyboard Matrix with Optional Numpad */}
      <div className="p-5 bg-slate-900/70 border border-slate-800 rounded-2xl space-y-2 overflow-x-auto">
        <div className="flex justify-center gap-4 min-w-[760px] py-2">
          {/* Main Alpha Cluster */}
          <div className="space-y-1.5 flex flex-col items-center">
            {mainRows.map((row, rIdx) => (
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

          {/* Dedicated Numpad for 100% format */}
          {formFactor === "full" && (
            <div className="pl-3 border-l border-slate-800/80 space-y-1.5 flex flex-col justify-end pb-0.5">
              <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider text-center block mb-1">
                Numpad
              </span>
              {NUMPAD_ROWS.map((nrow, nIdx) => (
                <div key={nIdx} className="flex gap-1.5 justify-center">
                  {nrow.map((nk) => {
                    const isPressed = pressedCodes.has(nk.code);
                    const isTested = testedCodes.has(nk.code);

                    return (
                      <div
                        key={nk.code}
                        className={cn(
                          "h-9 sm:h-10 rounded-lg text-xs font-mono font-medium flex items-center justify-center transition-all select-none border",
                          nk.width || "w-9 sm:w-10",
                          isPressed
                            ? "bg-emerald-500 border-emerald-400 text-slate-950 font-bold scale-95 shadow-md shadow-emerald-500/40"
                            : isTested
                            ? "bg-emerald-950/60 border-emerald-700/80 text-emerald-300"
                            : "bg-slate-950/80 border-slate-800/90 text-slate-400 hover:border-slate-700"
                        )}
                        title={`Code: ${nk.code}`}
                      >
                        {nk.label}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Advice and Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-2">
          <h4 className="font-semibold text-slate-200 flex items-center gap-2">
            <Zap className="w-4 h-4 text-emerald-400" />
            {t("kb.howTitle")}
          </h4>
          <p className="text-slate-400 text-xs leading-relaxed">
            <RichText text={t("kb.how")} />
          </p>
        </div>

        <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-2">
          <h4 className="font-semibold text-slate-200 flex items-center gap-2">
            <Info className="w-4 h-4 text-cyan-400" />
            {t("kb.chatterTitle")}
          </h4>
          <p className="text-slate-400 text-xs leading-relaxed">
            {t("kb.chatter")}
          </p>
        </div>
      </div>
    </div>
  );
};
