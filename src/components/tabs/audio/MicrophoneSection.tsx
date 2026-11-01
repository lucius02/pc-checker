import React from "react";
import { Mic, MicOff, Play, AlertTriangle, ShieldCheck } from "lucide-react";
import { cn } from "../../../utils/cn";

interface MicrophoneSectionProps {
  isMicTesting: boolean;
  startMicTest: () => void;
  stopMicTest: () => void;
  micError: string | null;
  micDeviceName: string;
  micVolume: number;
  micPeak: number;
  micClipping: boolean;
}

export const MicrophoneSection: React.FC<MicrophoneSectionProps> = ({
  isMicTesting,
  startMicTest,
  stopMicTest,
  micError,
  micDeviceName,
  micVolume,
  micPeak,
  micClipping,
}) => {
  return (
    <div className="p-5 bg-slate-900/70 border border-slate-800 rounded-2xl space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mic className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-bold text-white">Microfoon Live Ingangstest</h3>
        </div>
        <button
          onClick={isMicTesting ? stopMicTest : startMicTest}
          aria-label={isMicTesting ? "Stop microfoontest" : "Start microfoontest"}
          className={cn(
            "px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2",
            isMicTesting
              ? "bg-rose-950/80 border-rose-700 text-rose-300 focus-visible:outline-rose-400"
              : "bg-emerald-950/80 border-emerald-700 text-emerald-300 focus-visible:outline-emerald-400"
          )}
        >
          {isMicTesting ? (
            <>
              <MicOff className="w-3.5 h-3.5" />
              Stop Test
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5" />
              Start Microfoontest
            </>
          )}
        </button>
      </div>

      <p className="text-xs text-slate-400 leading-relaxed">
        Spreek of klap in je handen om te verifiëren of Windows audio registreert. De balk toont live het signaalniveau.
      </p>

      {micError && (
        <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{micError}</span>
        </div>
      )}

      {/* Volume Meter Visualizer */}
      <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400">Gedetecteerd Apparaat:</span>
          <span className="font-mono text-slate-200 font-semibold truncate max-w-xs">
            {micDeviceName || "Geen opname actief"}
          </span>
        </div>

        {/* Level Bar */}
        <div className="w-full bg-slate-800 rounded-full h-4 overflow-hidden relative border border-slate-700/60">
          <div
            className={cn(
              "h-full transition-all duration-75 rounded-full",
              micClipping
                ? "bg-rose-500 shadow-md shadow-rose-500/50"
                : micVolume > 60
                ? "bg-amber-400"
                : "bg-emerald-400"
            )}
            style={{ width: `${micVolume}%` }}
          />
          {/* Peak indicator tick */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-white shadow-sm"
            style={{ left: `${micPeak}%` }}
            title={`Piek: ${micPeak}%`}
          />
        </div>

        <div className="flex justify-between text-[10px] font-mono text-slate-500">
          <span>0% (Stil)</span>
          <span>Piek: {micPeak}%</span>
          <span>100% (Clipping)</span>
        </div>
      </div>

      {/* Hardware Advice */}
      <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl text-xs space-y-1">
        <span className="font-semibold text-slate-300 flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          Privacy &amp; Beveiliging:
        </span>
        <p className="text-slate-400 text-[11px] leading-relaxed">
          PC Checker verwerkt audio 100% lokaal in het RAM-geheugen. Er worden nooit audio-opnames opgeslagen op schijf of verzonden over het netwerk.
        </p>
      </div>
    </div>
  );
};
