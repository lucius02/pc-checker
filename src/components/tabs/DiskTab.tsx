import React from "react";
import {
  HardDrive,
  RefreshCw,
  Play,
  CheckCircle2,
  AlertTriangle,
  Info,
  Trash2,
  Layers,
} from "lucide-react";
import { SystemOverview, StressTestResult } from "../../types";
import { formatBytes } from "../../utils/formatters";

interface DiskTabProps {
  data: SystemOverview;
  isTestingDisk: boolean;
  diskSizeMb: number;
  setDiskSizeMb: (mb: number) => void;
  handleDiskBenchmark: () => void;
  diskResult: StressTestResult | null;
}

export const DiskTab: React.FC<DiskTabProps> = ({
  data,
  isTestingDisk,
  diskSizeMb,
  setDiskSizeMb,
  handleDiskBenchmark,
  diskResult,
}) => {
  // Vind schijven die vol dreigen te raken (>85% bezet)
  const fullDisks = data.disks.filter((d) => {
    const usedPercent = Math.round(
      ((d.total_bytes - d.available_bytes) / Math.max(1, d.total_bytes)) * 100
    );
    return usedPercent >= 85;
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <HardDrive className="w-5 h-5 text-amber-400" />
              Opslag Snelheid &amp; Data-Integriteit Benchmark
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Meet sequentiële schrijf- en leessnelheden op de hoofdschijf en verifieert de geschreven data byte-voor-byte om corrupte sectoren op te sporen.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-xl p-1 text-xs">
              {[32, 64, 128].map((mb) => (
                <button
                  key={mb}
                  onClick={() => setDiskSizeMb(mb)}
                  disabled={isTestingDisk}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                    diskSizeMb === mb
                      ? "bg-amber-500 text-slate-950 font-bold"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  {mb} MB
                </button>
              ))}
            </div>

            <button
              onClick={handleDiskBenchmark}
              disabled={isTestingDisk}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-bold text-sm shadow-lg shadow-amber-500/20 disabled:opacity-50 transition-all flex items-center gap-2 cursor-pointer"
            >
              {isTestingDisk ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Schijf Testen...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-slate-950" />
                  Start Benchmark
                </>
              )}
            </button>
          </div>
        </div>

        {/* Dynamic Alert: Schijf raakt vol (>85%) */}
        {fullDisks.length > 0 && (
          <div className="p-4 bg-amber-950/40 border border-amber-800/90 rounded-xl text-xs text-amber-200 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold text-sm text-amber-300 block">
                Waarschuwing: Schijfruimte raakt vol op {fullDisks.map((d) => d.mount_point || d.name).join(", ")}!
              </span>
              <p className="text-[11px] text-amber-300/90 leading-relaxed">
                Een of meerdere schijven zijn voor meer dan 85% bezet. SSD's verliezen schrijfprestaties en levensduur wanneer de vrije capaciteit onder 10-15% zakt. We raden aan onnodige bestanden op te schonen om vertragingen en Windows crashes te voorkomen.
              </p>
            </div>
          </div>
        )}

        {/* Connected Disks List */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Gedetecteerde Schijven ({data.disks.length})
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {data.disks.map((d, i) => {
              const usedPercent = Math.round(
                ((d.total_bytes - d.available_bytes) / Math.max(1, d.total_bytes)) * 100
              );
              const isCriticallyFull = usedPercent >= 90;
              const isWarningFull = usedPercent >= 80;

              return (
                <div
                  key={i}
                  className={`p-4 bg-slate-950/70 border rounded-xl space-y-3 transition-colors ${
                    isCriticallyFull
                      ? "border-rose-800/80 bg-rose-950/10"
                      : isWarningFull
                      ? "border-amber-800/80 bg-amber-950/10"
                      : "border-slate-800"
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2.5">
                      <HardDrive
                        className={`w-4 h-4 ${
                          isCriticallyFull
                            ? "text-rose-400"
                            : isWarningFull
                            ? "text-amber-400"
                            : "text-cyan-400"
                        }`}
                      />
                      <div>
                        <span className="font-semibold text-slate-200 text-sm">
                          {d.name || d.mount_point}
                        </span>
                        <span className="text-[11px] text-slate-500 block">
                          Koppelpunt: {d.mount_point} ({d.file_system})
                        </span>
                      </div>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-slate-400">
                      {d.disk_type}
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>{formatBytes(d.total_bytes - d.available_bytes)} gebruikt</span>
                      <span>{formatBytes(d.total_bytes)} totaal</span>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-2 rounded-full transition-all duration-300 ${
                          isCriticallyFull
                            ? "bg-rose-500"
                            : isWarningFull
                            ? "bg-amber-400"
                            : "bg-cyan-400"
                        }`}
                        style={{ width: `${usedPercent}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-500">
                        {usedPercent}% bezet
                      </span>
                      <span
                        className={
                          isCriticallyFull
                            ? "text-rose-400 font-bold"
                            : isWarningFull
                            ? "text-amber-400 font-semibold"
                            : "text-emerald-400"
                        }
                      >
                        {formatBytes(d.available_bytes)} vrij ({100 - usedPercent}%)
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Disk Result Box */}
        {diskResult && (
          <div
            className={`p-4 rounded-xl border ${
              diskResult.success
                ? "bg-emerald-950/30 border-emerald-800/80 text-emerald-300"
                : "bg-red-950/30 border-red-800/80 text-red-300"
            } space-y-2`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold">
                {diskResult.success ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                )}
                <span>{diskResult.test_name} - {diskResult.success ? "Geslaagd" : "Mislukt"}</span>
              </div>
              <span className="font-mono font-bold text-lg">
                {diskResult.score_or_speed.toFixed(1)} {diskResult.unit}
              </span>
            </div>
            <p className="text-xs opacity-90">{diskResult.details}</p>
          </div>
        )}
      </div>

      {/* Info & Aanbevelingen voor Schijf- en Opslagbeheer */}
      <div className="p-6 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-5">
        <div className="flex items-center gap-2">
          <Info className="w-5 h-5 text-amber-400" />
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
            Opslagrichtlijnen &amp; Aanbevelingen bij Volle Schijven
          </h3>
        </div>

        {/* Waarom vrije schijfruimte essentieel is */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
            <h4 className="font-semibold text-slate-200 flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-cyan-400" />
              Waarom heeft een SSD 15% tot 20% vrije ruimte nodig?
            </h4>
            <p className="text-slate-400 leading-relaxed text-[11px]">
              Solid State Drives (SSD's) gebruiken interne flash-blokken. Om data snel te kunnen overschrijven, voert de schijf op de achtergrond <em>wear-leveling</em> en <em>TRIM-garbage collection</em> uit.
            </p>
            <p className="text-slate-300 text-[11px]">
              Wanneer de schijf voor &gt;85% vol raakt, moet de schijfcontroller continu datablokken verplaatsen (write amplification). Hierdoor daalt de schrijfsnelheid tot wel 70% en slijt het flash-geheugen aanzienlijk sneller.
            </p>
          </div>

          <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
            <h4 className="font-semibold text-slate-200 flex items-center gap-2">
              <Layers className="w-4 h-4 text-amber-400" />
              Wat gebeurt er als de C: schijf 100% vol raakt?
            </h4>
            <p className="text-slate-400 leading-relaxed text-[11px]">
              De C: schijf bevat het virtuele geheugenbestand (<code>pagefile.sys</code>) en het slaapstandbestand (<code>hiberfil.sys</code>).
            </p>
            <p className="text-slate-300 text-[11px]">
              Als Windows geen tijdelijke swapruimte meer kan toewijzen, crashen applicaties direct met "Out of Memory", mislukken Windows Updates, en kunnen er desktop freezes of Blue Screens optreden.
            </p>
          </div>
        </div>

        {/* 4 Concrete Stappen om Onnodige Bestanden te Verwijderen */}
        <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-3 text-xs">
          <div className="flex items-center gap-2 text-amber-300 font-semibold">
            <Trash2 className="w-4 h-4 text-amber-400" />
            <span>Aanbevolen Stappen om Snel Veel Schijfruimte Vrij te Maken</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-slate-300">
            {/* Stap 1 */}
            <div className="p-3 bg-slate-900/60 rounded-lg border border-slate-800/70 space-y-1">
              <span className="font-medium text-white block">1. Windows Schijfopruiming</span>
              <p className="text-[11px] text-slate-400">
                Druk op <kbd className="px-1 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px]">Win + R</kbd>, typ <code>cleanmgr</code> en klik op <em>Systeembestanden opschonen</em>. Dit ruimt oude Windows updates en logs op.
              </p>
            </div>

            {/* Stap 2 */}
            <div className="p-3 bg-slate-900/60 rounded-lg border border-slate-800/70 space-y-1">
              <span className="font-medium text-white block">2. Opslaginzicht (Storage Sense)</span>
              <p className="text-[11px] text-slate-400">
                Ga naar <em>Instellingen &gt; Systeem &gt; Opslag</em> en activeer <strong>Opslaginzicht</strong>. Windows verwijdert dan periodiek automatische tijdelijke app-bestanden en caches.
              </p>
            </div>

            {/* Stap 3 */}
            <div className="p-3 bg-slate-900/60 rounded-lg border border-slate-800/70 space-y-1">
              <span className="font-medium text-white block">3. Downloads &amp; Tijdelijke Mappen</span>
              <p className="text-[11px] text-slate-400">
                Controleer je map <code>C:\Users\...\Downloads</code> op oude installatiebestanden (.exe, .zip, .iso) en leeg de Prullenbak. Dit levert vaak tientallen gigabytes op.
              </p>
            </div>

            {/* Stap 4 */}
            <div className="p-3 bg-slate-900/60 rounded-lg border border-slate-800/70 space-y-1">
              <span className="font-medium text-white block">4. Grote Games &amp; Media</span>
              <p className="text-[11px] text-slate-400">
                Verplaats geïnstalleerde games (via bijv. Steam Bibliotheekbeheer) of grote videobestanden naar een tweede SSD of externe harde schijf.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
