import React from "react";
import {
  Zap,
  RefreshCw,
  Play,
  CheckCircle2,
  AlertTriangle,
  Info,
  ShieldAlert,
  Sparkles,
  Layers,
} from "lucide-react";
import { SystemOverview, StressTestResult } from "../../types";
import { formatBytes } from "../../utils/formatters";
import { cn } from "../../utils/cn";

interface RamTabProps {
  data: SystemOverview;
  isTestingRam: boolean;
  ramSizeMb: number;
  setRamSizeMb: (mb: number) => void;
  handleRamStress: () => void;
  ramResult: StressTestResult | null;
}

export const RamTab: React.FC<RamTabProps> = ({
  data,
  isTestingRam,
  ramSizeMb,
  setRamSizeMb,
  handleRamStress,
  ramResult,
}) => {
  const ramUsagePercent = Math.min(
    100,
    Math.round((data.ram.used_bytes / Math.max(1, data.ram.total_bytes)) * 100)
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Zap className="w-5 h-5 text-purple-400" />
              RAM Geheugenintegriteit &amp; Bit-Flip Verificatie
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Allokeert een dynamisch geheugenblok en voert walking-bit en checkerboard patronen (0xAA / 0x55) uit om corrupte geheugencellen op te sporen.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-xl p-1 text-xs">
              {[256, 1024, 4096].map((mb) => (
                <button
                  key={mb}
                  type="button"
                  onClick={() => setRamSizeMb(mb)}
                  disabled={isTestingRam}
                  className={cn(
                    "px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-400",
                    ramSizeMb === mb
                      ? "bg-purple-500 text-slate-950 font-bold"
                      : "text-slate-400 hover:text-white"
                  )}
                >
                  {mb} MB
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleRamStress}
              disabled={isTestingRam}
              className={cn(
                "px-5 py-2.5 rounded-xl bg-linear-to-r from-purple-500 to-indigo-600 hover:from-purple-400 hover:to-indigo-500 text-slate-950 font-bold text-sm shadow-lg shadow-purple-500/20 transition-all flex items-center gap-2 cursor-pointer",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-300",
                isTestingRam && "opacity-50 cursor-not-allowed"
              )}
            >
              {isTestingRam ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  RAM Testen...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-slate-950" />
                  Start Integriteitstest
                </>
              )}
            </button>
          </div>
        </div>

        {/* RAM Breakdown Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl">
            <span className="text-slate-400 block mb-1">Totaal Fysiek RAM</span>
            <span className="text-lg font-bold text-slate-200">
              {formatBytes(data.ram.total_bytes)}
            </span>
          </div>
          <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl">
            <span className="text-slate-400 block mb-1">In Gebruik</span>
            <span className="text-lg font-bold text-purple-400">
              {formatBytes(data.ram.used_bytes)} ({ramUsagePercent}%)
            </span>
          </div>
          <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl">
            <span className="text-slate-400 block mb-1">Beschikbaar / Vrij</span>
            <span className="text-lg font-bold text-emerald-400">
              {formatBytes(data.ram.free_bytes)}
            </span>
          </div>
        </div>

        {/* RAM Result Box */}
        {ramResult && (
          <div
            className={cn(
              "p-4 rounded-xl border space-y-2",
              ramResult.success
                ? "bg-emerald-950/30 border-emerald-800/80 text-emerald-300"
                : "bg-red-950/30 border-red-800/80 text-red-300"
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold">
                {ramResult.success ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                )}
                <span>{ramResult.test_name} - {ramResult.success ? "Geslaagd" : "Mislukt"}</span>
              </div>
              <span className="font-mono font-bold text-lg">
                {ramResult.score_or_speed.toFixed(1)} {ramResult.unit}
              </span>
            </div>
            <p className="text-xs opacity-90">{ramResult.details}</p>
          </div>
        )}
      </div>

      {/* Info & Aanbevelingen Blok voor Werkgeheugen */}
      <div className="p-6 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-5">
        <div className="flex items-center gap-2">
          <Info className="w-5 h-5 text-purple-400" />
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
            RAM Richtlijnen, Geheugengebruik &amp; Integriteitsadvies
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          {/* Wat is een normaal RAM-gebruik? */}
          <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
            <h4 className="font-semibold text-slate-200 flex items-center gap-2">
              <Layers className="w-4 h-4 text-purple-400" />
              Wat is een normaal geheugengebruik in Windows?
            </h4>
            <p className="text-slate-400 text-xs leading-relaxed">
              Een bezettingsgraad tussen <strong>40% en 75%</strong> is volkomen normaal. Windows gebruikt ongebruikt RAM actief als <em>SuperFetch / Standby Cache</em> om geopende bestanden direct klaar te zetten.
            </p>
            <p className="text-slate-300 text-xs">
              Pas wanneer het geheugengebruik continu boven de <strong>85% - 90%</strong> blijft, moet Windows gegevens wegschrijven naar het tragere schijf-wisselbestand (pagefile). Dit veroorzaakt haperingen en vertragingen.
            </p>
          </div>

          {/* Waarom zijn 0 bit-flips vereist? */}
          <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
            <h4 className="font-semibold text-slate-200 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-400" />
              Waarom is 0 bit-flips een harde vereiste?
            </h4>
            <p className="text-slate-400 text-xs leading-relaxed">
              Consumentengeheugen (Non-ECC RAM) heeft geen ingebouwde foutcorrectie. Als één enkele transistor een '1' naar een '0' flipt (een bit-flip), raakt de data in het geheugen direct corrupt.
            </p>
            <p className="text-slate-300 text-xs">
              Dit leidt vaak tot onverklaarbare crashes, plotseling afsluitende browser-tabbladen of beruchte Blue Screens zoals <code>MEMORY_MANAGEMENT</code> of <code>PAGE_FAULT_IN_NONPAGED_AREA</code>.
            </p>
          </div>
        </div>

        {/* Concrete Tips & Aanbevelingen */}
        <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-3 text-xs">
          <div className="flex items-center gap-2 text-purple-300 font-semibold">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span>Aanbevelingen bij Geheugenfouten of Hoog RAM-Gebruik</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-slate-300">
            <div className="p-3 bg-slate-900/60 rounded-lg border border-slate-800/70 space-y-1">
              <span className="font-medium text-white block">1. XMP / EXPO Klokprofiel Testen</span>
              <p className="text-xs text-slate-400">
                Verschijnen er bitfouten in de test? Schakel dan tijdelijk het XMP of AMD EXPO overklokprofiel uit in de BIOS en test opnieuw op de standaard JEDEC-snelheid.
              </p>
            </div>

            <div className="p-3 bg-slate-900/60 rounded-lg border border-slate-800/70 space-y-1">
              <span className="font-medium text-white block">2. RAM Modules Herplaatsen</span>
              <p className="text-xs text-slate-400">
                Soms maakt een RAM-stick slecht contact door stof of oxidatie in het slot. Schakel de pc uit, haal de modules eruit en klik ze stevig opnieuw vast (in slot 2 en 4 bij dual-channel).
              </p>
            </div>

            <div className="p-3 bg-slate-900/60 rounded-lg border border-slate-800/70 space-y-1">
              <span className="font-medium text-white block">3. Controleer op Geheugenlekken</span>
              <p className="text-xs text-slate-400">
                Loopt het RAM-geheugen vol zonder dat er zware programma's openstaan? Open Taakbeheer (Ctrl+Shift+Esc), sorteer op 'Geheugen' en beëindig achtergrondprocessen met geheugenlekken.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
