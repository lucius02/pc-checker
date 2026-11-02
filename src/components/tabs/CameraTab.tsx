import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Camera,
  CameraOff,
  Play,
  RotateCw,
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  Sun,
} from "lucide-react";
import { cn } from "../../utils/cn";

interface CameraTabProps {
  onUpdateResult?: (data: {
    cameraName: string;
    resolution: string;
    fps: number;
    tested: boolean;
  }) => void;
}

interface VideoDevice {
  deviceId: string;
  label: string;
}

export const CameraTab: React.FC<CameraTabProps> = ({ onUpdateResult }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const frameCountRef = useRef<number>(0);
  const lastFpsTimeRef = useRef<number>(performance.now());

  const [devices, setDevices] = useState<VideoDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [isActive, setIsActive] = useState<boolean>(false);
  const [isMirrored, setIsMirrored] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Stream Metrics
  const [resolution, setResolution] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [fps, setFps] = useState<number>(0);
  const [brightness, setBrightness] = useState<number>(0);
  const [cameraLabel, setCameraLabel] = useState<string>("Onbekende Webcam");
  const [hasTested, setHasTested] = useState<boolean>(false);
  const [snapshotUri, setSnapshotUri] = useState<string | null>(null);

  // Enumerate video devices
  const loadDevices = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const all = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = all
        .filter((d) => d.kind === "videoinput")
        .map((d, idx) => ({
          deviceId: d.deviceId,
          label: d.label || `Camera ${idx + 1}`,
        }));
      setDevices(videoInputs);
      if (videoInputs.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(videoInputs[0].deviceId);
      }
    } catch (err) {
      console.error("Camera enumerate error:", err);
    }
  }, [selectedDeviceId]);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  // Update parent for export
  useEffect(() => {
    onUpdateResult?.({
      cameraName: cameraLabel,
      resolution: resolution.width > 0 ? `${resolution.width}x${resolution.height}` : "Niet gedetecteerd",
      fps,
      tested: hasTested,
    });
  }, [cameraLabel, resolution, fps, hasTested, onUpdateResult]);

  // Clean stop of camera tracks
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    setIsActive(false);
    setFps(0);
  }, []);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  // Start webcam stream
  const startCamera = async (deviceIdToUse?: string) => {
    stopCamera();
    setErrorMsg(null);
    setSnapshotUri(null);

    const devId = deviceIdToUse || selectedDeviceId;

    try {
      const constraints: MediaStreamConstraints = {
        video: {
          deviceId: devId ? { exact: devId } : undefined,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      const track = stream.getVideoTracks()[0];
      const settings = track.getSettings();
      setCameraLabel(track.label || "Standaard Webcam");
      setResolution({
        width: settings.width || 1280,
        height: settings.height || 720,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          if (videoRef.current) {
            setResolution({
              width: videoRef.current.videoWidth,
              height: videoRef.current.videoHeight,
            });
          }
        };
      }

      setIsActive(true);
      setHasTested(true);
      loadDevices(); // Refresh labels if they were blank before permission

      // FPS and brightness sampling
      frameCountRef.current = 0;
      lastFpsTimeRef.current = performance.now();

      const sampleLoop = () => {
        frameCountRef.current += 1;
        const now = performance.now();
        const diff = now - lastFpsTimeRef.current;

        if (diff >= 1000) {
          const currentFps = Math.round((frameCountRef.current * 1000) / diff);
          setFps(currentFps);
          frameCountRef.current = 0;
          lastFpsTimeRef.current = now;

          // Quick luminance sample
          if (videoRef.current && videoRef.current.videoWidth > 0) {
            try {
              const canvas = document.createElement("canvas");
              canvas.width = 32;
              canvas.height = 32;
              const ctx = canvas.getContext("2d");
              if (ctx) {
                ctx.drawImage(videoRef.current, 0, 0, 32, 32);
                const imgData = ctx.getImageData(0, 0, 32, 32).data;
                let sum = 0;
                for (let i = 0; i < imgData.length; i += 4) {
                  sum += 0.299 * imgData[i] + 0.587 * imgData[i + 1] + 0.114 * imgData[i + 2];
                }
                const avgLuma = Math.round((sum / (32 * 32) / 255) * 100);
                setBrightness(avgLuma);
              }
            } catch {}
          }
        }

        animFrameRef.current = requestAnimationFrame(sampleLoop);
      };

      animFrameRef.current = requestAnimationFrame(sampleLoop);
    } catch (err) {
      console.error("Camera access error:", err);
      setErrorMsg("Cameratoegang geweigerd of camera is al in gebruik door een andere app.");
      setIsActive(false);
    }
  };

  // Take quick diagnostic snapshot
  const takeSnapshot = () => {
    if (!videoRef.current || !isActive) return;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = videoRef.current.videoWidth || 1280;
      canvas.height = videoRef.current.videoHeight || 720;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        if (isMirrored) {
          ctx.translate(canvas.width, 0);
          ctx.scale(-1, 1);
        }
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        setSnapshotUri(canvas.toDataURL("image/jpeg", 0.85));
      }
    } catch (err) {
      console.error("Snapshot error:", err);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header & Controls */}
      <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="p-2 rounded-xl bg-rose-950 border border-rose-800 text-rose-400">
              <Camera className="w-6 h-6" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white">Webcam &amp; Video Diagnosetest</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-950/80 border border-rose-700/60 text-rose-300">
                  WebRTC MediaStream
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Controleer de sensorresolutie, framerate (FPS), sensorbelichting en privacy-afsluiting van je ingebouwde of USB-camera.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isActive ? (
              <button
                onClick={stopCamera}
                aria-label="Camera uitschakelen"
                className="px-3.5 py-2 rounded-xl bg-rose-950/80 border border-rose-700 hover:border-rose-600 text-rose-300 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400"
              >
                <CameraOff className="w-4 h-4 text-rose-400" />
                Camera Uitschakelen
              </button>
            ) : (
              <button
                onClick={() => startCamera()}
                aria-label="Start cameracheck"
                className="px-3.5 py-2 rounded-xl bg-emerald-950/80 border border-emerald-700 hover:border-emerald-600 text-emerald-300 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
              >
                <Play className="w-4 h-4 text-emerald-400" />
                Start Cameracheck
              </button>
            )}
          </div>
        </div>

        {/* Telemetry Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-1">
            <span className="text-slate-400 block">Sensor Resolutie</span>
            <span className="text-lg font-bold font-mono text-rose-400">
              {resolution.width > 0 ? `${resolution.width} × ${resolution.height}` : "—"}
            </span>
          </div>

          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-1">
            <span className="text-slate-400 block">Gemeten Framerate</span>
            <span className="text-lg font-bold font-mono text-cyan-400">
              {fps > 0 ? `${fps} FPS` : "—"}
            </span>
          </div>

          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-1">
            <span className="text-slate-400 block">Belichting &amp; Contrast</span>
            <span className="text-lg font-bold font-mono text-amber-400">
              {brightness > 0 ? `${brightness}% Luma` : "—"}
            </span>
          </div>

          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-1">
            <span className="text-slate-400 block">Actieve Camera</span>
            <span className="text-xs font-mono font-bold text-slate-200 truncate block mt-1" title={cameraLabel}>
              {cameraLabel}
            </span>
          </div>
        </div>
      </div>

      {/* Main Video Viewfinder */}
      <div className="p-5 bg-slate-900/70 border border-slate-800 rounded-2xl space-y-4">
        {/* Viewfinder Controls Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Kies Camera:</span>
            <select
              value={selectedDeviceId}
              onChange={(e) => {
                setSelectedDeviceId(e.target.value);
                if (isActive) startCamera(e.target.value);
              }}
              className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-200 text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400"
            >
              {devices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsMirrored((m) => !m)}
              aria-label="Camerabeeld spiegelen toggle"
              className={cn(
                "px-2.5 py-1 rounded-lg border text-xs font-medium flex items-center gap-1 transition-all cursor-pointer",
                isMirrored
                  ? "bg-rose-950/80 border-rose-700 text-rose-300"
                  : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
              )}
            >
              <RotateCw className="w-3 h-3" />
              Spiegelen ({isMirrored ? "Aan" : "Uit"})
            </button>

            {isActive && (
              <button
                onClick={takeSnapshot}
                aria-label="Diagnostische testfoto maken"
                className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 hover:border-slate-600 text-slate-200 text-xs font-medium flex items-center gap-1 cursor-pointer"
              >
                <Sparkles className="w-3 h-3 text-amber-400" />
                Testfoto Maken
              </button>
            )}
          </div>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Video Canvas Container */}
        <div className="relative aspect-video max-h-[440px] w-full rounded-2xl bg-slate-950 border border-slate-800 overflow-hidden flex items-center justify-center shadow-inner">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={cn(
              "w-full h-full object-contain transition-transform",
              isMirrored && "-scale-x-100",
              !isActive && "hidden"
            )}
          />

          {!isActive && (
            <div className="text-center space-y-3 p-6">
              <span className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 text-slate-600 inline-block">
                <CameraOff className="w-8 h-8" />
              </span>
              <div>
                <h4 className="text-sm font-semibold text-slate-300">Camera staat uitgeschakeld</h4>
                <p className="text-xs text-slate-500 mt-1 max-w-sm">
                  Klik hierboven op &lsquo;Start Cameracheck&rsquo; om het live beeld, de scherpte en de framerate te verifiëren.
                </p>
              </div>
            </div>
          )}

          {/* Real-time OSD Overlay */}
          {isActive && (
            <div className="absolute top-3 left-3 px-2.5 py-1 rounded-md bg-slate-950/80 backdrop-blur border border-slate-800 text-[11px] font-mono text-emerald-400 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>LIVE • {resolution.width}x{resolution.height} @ {fps}fps</span>
            </div>
          )}
        </div>

        {/* Snapshot Modal/Preview */}
        {snapshotUri && (
          <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                Vastgelegde Testfoto:
              </span>
              <button
                onClick={() => setSnapshotUri(null)}
                className="text-slate-400 hover:text-slate-200 text-xs font-mono"
              >
                Sluiten ✕
              </button>
            </div>
            <div className="max-h-48 overflow-hidden rounded-lg border border-slate-800 flex justify-center bg-black">
              <img src={snapshotUri} alt="Testfoto" className="object-contain max-h-48" />
            </div>
          </div>
        )}
      </div>

      {/* Hardware Advice */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-2">
          <h4 className="font-semibold text-slate-200 flex items-center gap-2">
            <Sun className="w-4 h-4 text-amber-400" />
            Belichting &amp; Ruis Tips
          </h4>
          <p className="text-slate-400 text-xs leading-relaxed">
            Als het beeld donker of korrelig (ruis) is, compenseert de camerasensor door de ISO-gevoeligheid te verhogen. 
            Zorg voor indirect daglicht of een lamp vóór je gezicht in plaats van achter je om tegenlicht te voorkomen.
          </p>
        </div>

        <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-2">
          <h4 className="font-semibold text-slate-200 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            Privacy &amp; Beveiliging
          </h4>
          <p className="text-slate-400 text-xs leading-relaxed">
            Zodra je op &lsquo;Camera Uitschakelen&rsquo; klikt of van tab wisselt, worden alle hardware-streams 
            direct losgekoppeld. Het fysieke privacy-lampje (LED) naast je webcam moet dan direct doven.
          </p>
        </div>
      </div>
    </div>
  );
};
