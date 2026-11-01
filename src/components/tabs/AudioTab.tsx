import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Volume2,
  Square,
  Radio,
  Sliders,
} from "lucide-react";
import { cn } from "../../utils/cn";
import { MicrophoneSection } from "./audio/MicrophoneSection";

interface AudioTabProps {
  onUpdateResult?: (data: {
    stereoTested: boolean;
    frequenciesTested: boolean;
    micWorking: boolean;
    peakDecibels?: number;
  }) => void;
}

export const AudioTab: React.FC<AudioTabProps> = ({ onUpdateResult }) => {
  // Audio output state
  const [activeChannel, setActiveChannel] = useState<"left" | "right" | "both" | null>(null);
  const [activeFrequency, setActiveFrequency] = useState<number | null>(null);
  const [isPlayingTone, setIsPlayingTone] = useState(false);
  const [stereoTested, setStereoTested] = useState(false);
  const [frequenciesTested, setFrequenciesTested] = useState(false);

  // Microphone state
  const [isMicTesting, setIsMicTesting] = useState(false);
  const [micVolume, setMicVolume] = useState<number>(0);
  const [micPeak, setMicPeak] = useState<number>(0);
  const [micClipping, setMicClipping] = useState(false);
  const [micDeviceName, setMicDeviceName] = useState<string>("");
  const [micError, setMicError] = useState<string | null>(null);

  // Audio Context refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const currentOscRef = useRef<OscillatorNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const micAnimFrameRef = useRef<number | null>(null);

  // Helper: get or create AudioContext safely
  const getAudioContext = useCallback(() => {
    if (!audioCtxRef.current) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtxRef.current = new AudioCtx();
    }
    if (audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, []);

  // Update parent for export
  useEffect(() => {
    onUpdateResult?.({
      stereoTested,
      frequenciesTested,
      micWorking: micPeak > 15,
      peakDecibels: micPeak,
    });
  }, [stereoTested, frequenciesTested, micPeak, onUpdateResult]);

  // Clean up all audio nodes on unmount
  useEffect(() => {
    return () => {
      if (currentOscRef.current) {
        try {
          currentOscRef.current.stop();
        } catch {}
      }
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (micAnimFrameRef.current) {
        cancelAnimationFrame(micAnimFrameRef.current);
      }
      if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
        try {
          audioCtxRef.current.close();
        } catch {}
      }
    };
  }, []);

  // Play a stereo directional chime
  const playStereoBeep = useCallback((channel: "left" | "right" | "both") => {
    try {
      const ctx = getAudioContext();
      setActiveChannel(channel);
      setStereoTested(true);

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(channel === "left" ? 520 : channel === "right" ? 660 : 587, ctx.currentTime);

      if ("createStereoPanner" in ctx) {
        const panner = (ctx as AudioContext).createStereoPanner();
        panner.pan.value = channel === "left" ? -1 : channel === "right" ? 1 : 0;
        osc.connect(gain);
        gain.connect(panner);
        panner.connect((ctx as AudioContext).destination);
      } else {
        osc.connect(gain);
        gain.connect((ctx as AudioContext).destination);
      }

      const now = ctx.currentTime;
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.35, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

      osc.start(now);
      osc.stop(now + 0.75);

      setTimeout(() => {
        setActiveChannel(null);
      }, 750);
    } catch (err) {
      console.error("Audio playback error:", err);
    }
  }, [getAudioContext]);

  // Play frequency tone
  const playTone = useCallback((freq: number) => {
    try {
      const ctx = getAudioContext();

      if (currentOscRef.current) {
        currentOscRef.current.stop();
        currentOscRef.current = null;
      }

      if (activeFrequency === freq && isPlayingTone) {
        setIsPlayingTone(false);
        setActiveFrequency(null);
        return;
      }

      setActiveFrequency(freq);
      setIsPlayingTone(true);
      setFrequenciesTested(true);

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime);

      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + 0.05);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      currentOscRef.current = osc;

      setTimeout(() => {
        if (currentOscRef.current === osc) {
          gain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 0.1);
          setTimeout(() => {
            try {
              osc.stop();
            } catch {}
            setIsPlayingTone(false);
            setActiveFrequency(null);
          }, 120);
        }
      }, 2500);
    } catch (err) {
      console.error("Tone error:", err);
    }
  }, [activeFrequency, getAudioContext, isPlayingTone]);

  const stopTone = useCallback(() => {
    if (currentOscRef.current) {
      try {
        currentOscRef.current.stop();
      } catch {}
      currentOscRef.current = null;
    }
    setIsPlayingTone(false);
    setActiveFrequency(null);
  }, []);

  // Start microphone hardware test
  const startMicTest = async () => {
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false },
      });
      micStreamRef.current = stream;

      const track = stream.getAudioTracks()[0];
      setMicDeviceName(track?.label || "Standaard Systeammicrofoon");

      const ctx = getAudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.5;
      source.connect(analyser);
      micAnalyserRef.current = analyser;

      setIsMicTesting(true);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const checkVolume = () => {
        if (!micAnalyserRef.current) return;
        micAnalyserRef.current.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        const normalized = Math.min(100, Math.round((avg / 128) * 100));

        setMicVolume(normalized);
        setMicPeak((prev) => Math.max(prev, normalized));
        setMicClipping(normalized > 90);

        micAnimFrameRef.current = requestAnimationFrame(checkVolume);
      };

      micAnimFrameRef.current = requestAnimationFrame(checkVolume);
    } catch (err) {
      setMicError("Microfoontoegang geweigerd of geen microfoon gedetecteerd.");
      console.error(err);
      setIsMicTesting(false);
    }
  };

  // Stop microphone hardware test
  const stopMicTest = () => {
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (micAnimFrameRef.current) {
      cancelAnimationFrame(micAnimFrameRef.current);
      micAnimFrameRef.current = null;
    }
    setIsMicTesting(false);
    setMicVolume(0);
    setMicClipping(false);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="p-2 rounded-xl bg-pink-950 border border-pink-800 text-pink-400">
              <Volume2 className="w-6 h-6" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white">Luidspreker, Stereo &amp; Microfoontest</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-pink-950/80 border border-pink-700/60 text-pink-300">
                  Web Audio Engine
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Controleer je linker- en rechter luidsprekerkanalen, frequentierespons (bas/midden/hoog) en realtime microfoon-ingangsniveau.
              </p>
            </div>
          </div>
        </div>

        {/* Status Indicators */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-1">
            <span className="text-slate-400 block">Stereo Balans</span>
            <span className={cn("text-base font-bold font-mono", stereoTested ? "text-emerald-400" : "text-slate-400")}>
              {stereoTested ? "Getest ✓" : "Nog niet getest"}
            </span>
          </div>

          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-1">
            <span className="text-slate-400 block">Frequentiebereik</span>
            <span className={cn("text-base font-bold font-mono", frequenciesTested ? "text-emerald-400" : "text-slate-400")}>
              {frequenciesTested ? "Getest ✓" : "Nog niet getest"}
            </span>
          </div>

          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-1">
            <span className="text-slate-400 block">Microfoon Piek</span>
            <span className={cn("text-base font-bold font-mono", micPeak > 15 ? "text-emerald-400" : "text-slate-400")}>
              {micPeak > 0 ? `${micPeak}%` : "—"}
            </span>
          </div>

          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-1">
            <span className="text-slate-400 block">Ingangsstatus</span>
            <span className="text-xs font-mono font-bold text-slate-200 truncate block mt-0.5">
              {isMicTesting ? (micClipping ? "⚠️ Te hard (clipping)" : "Actief aan het luisteren") : "Uitgeschakeld"}
            </span>
          </div>
        </div>
      </div>

      {/* Grid: Stereo & Frequency (Left) | Microphone (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Section 1: Speaker & Stereo Balance */}
        <div className="p-5 bg-slate-900/70 border border-slate-800 rounded-2xl space-y-5">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-pink-400" />
            <h3 className="text-sm font-bold text-white">Stereokanaal Balanstest</h3>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Klik op Links of Rechts om te testen of het geluid daadwerkelijk uit het juiste fysieke luidspreker- of koptelefoonkanaal komt.
          </p>

          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => playStereoBeep("left")}
              aria-label="Test linkerkanaal audio"
              className={cn(
                "p-4 rounded-xl border text-center transition-all cursor-pointer font-semibold text-xs flex flex-col items-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2",
                activeChannel === "left"
                  ? "bg-pink-600 border-pink-400 text-white shadow-lg shadow-pink-500/30 scale-95 focus-visible:outline-pink-400"
                  : "bg-slate-950/80 border-slate-800 text-slate-300 hover:border-slate-700 focus-visible:outline-slate-400"
              )}
            >
              <Volume2 className="w-5 h-5 text-pink-400" />
              <span>Linkerkanaal (L)</span>
            </button>

            <button
              onClick={() => playStereoBeep("both")}
              aria-label="Test beide audiokanalen"
              className={cn(
                "p-4 rounded-xl border text-center transition-all cursor-pointer font-semibold text-xs flex flex-col items-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2",
                activeChannel === "both"
                  ? "bg-cyan-600 border-cyan-400 text-white shadow-lg shadow-cyan-500/30 scale-95 focus-visible:outline-cyan-400"
                  : "bg-slate-950/80 border-slate-800 text-slate-300 hover:border-slate-700 focus-visible:outline-slate-400"
              )}
            >
              <Volume2 className="w-5 h-5 text-cyan-400" />
              <span>Beide Kanalen (L+R)</span>
            </button>

            <button
              onClick={() => playStereoBeep("right")}
              aria-label="Test rechterkanaal audio"
              className={cn(
                "p-4 rounded-xl border text-center transition-all cursor-pointer font-semibold text-xs flex flex-col items-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2",
                activeChannel === "right"
                  ? "bg-purple-600 border-purple-400 text-white shadow-lg shadow-purple-500/30 scale-95 focus-visible:outline-purple-400"
                  : "bg-slate-950/80 border-slate-800 text-slate-300 hover:border-slate-700 focus-visible:outline-slate-400"
              )}
            >
              <Volume2 className="w-5 h-5 text-purple-400" />
              <span>Rechterkanaal (R)</span>
            </button>
          </div>

          {/* Frequency Pitches */}
          <div className="pt-3 border-t border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                Frequentie Toongenerator:
              </span>
              {isPlayingTone && (
                <button
                  onClick={stopTone}
                  className="px-2 py-0.5 rounded-md bg-rose-950/80 border border-rose-800 text-rose-300 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <Square className="w-3 h-3" />
                  Stop Toon
                </button>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs">
              {[
                { freq: 80, label: "Lage Bas (80 Hz)" },
                { freq: 440, label: "Midden A (440 Hz)" },
                { freq: 1000, label: "Referentie (1 kHz)" },
                { freq: 3500, label: "Hoge Stem (3.5 kHz)" },
                { freq: 8000, label: "Hoge Tonen (8 kHz)" },
                { freq: 12000, label: "Detail (12 kHz)" },
              ].map((item) => (
                <button
                  key={item.freq}
                  onClick={() => playTone(item.freq)}
                  className={cn(
                    "p-2.5 rounded-lg border text-center font-mono text-[11px] transition-all cursor-pointer",
                    activeFrequency === item.freq && isPlayingTone
                      ? "bg-cyan-600 border-cyan-400 text-white font-bold scale-95 shadow-md shadow-cyan-500/30"
                      : "bg-slate-950/70 border-slate-800 text-slate-300 hover:border-slate-700"
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Section 2: Microphone Input Check */}
        <MicrophoneSection
          isMicTesting={isMicTesting}
          startMicTest={startMicTest}
          stopMicTest={stopMicTest}
          micError={micError}
          micDeviceName={micDeviceName}
          micVolume={micVolume}
          micPeak={micPeak}
          micClipping={micClipping}
        />
      </div>
    </div>
  );
};
