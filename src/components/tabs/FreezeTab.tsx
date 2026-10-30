import React from "react";
import {
  ShieldAlert,
  Search,
  Activity,
  AlertTriangle,
  CheckCircle,
  HelpCircle,
} from "lucide-react";
import { FreezeDiagnosticReport } from "../../types";
import { cn } from "../../utils/cn";

interface FreezeTabProps {
  freezeData: FreezeDiagnosticReport | null;
  isScanningFreeze: boolean;
  scanFreezeDiagnostic: () => void;
}

export const FreezeTab: React.FC<FreezeTabProps> = ({
  freezeData,
  isScanningFreeze,
  scanFreezeDiagnostic,
}) => {
  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="p-6 bg-gradient-to-r from-rose-950/40 via-slate-900/80 to-slate-900 border border-rose-900/50 rounded-2xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-rose-950 border border-rose-800 text-rose-400">
                <ShieldAlert className="w-6 h-6" />
              </span>
              <div>
                <h2 className="text-lg font-bold text-white">
                  Freeze Detective &amp; Watchdog
                </h2>
                <p className="text-xs text-slate-300">
                  Gespecialiseerd in het opsporen van Windows freezes (SATA link resets, GPU TDR crashes &amp; driver DPC latency).
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={scanFreezeDiagnostic}
              disabled={isScanningFreeze}
              className={cn(
                "px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs flex items-center gap-2 shadow-lg shadow-rose-600/20 transition-all cursor-pointer",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-300",
                isScanningFreeze && "opacity-50 cursor-not-allowed"
              )}
            >
              <Search className={cn("w-4 h-4", isScanningFreeze && "animate-spin")} />
              {isScanningFreeze ? "Logboek Scannen..." : "Herscan Windows Logboek"}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 p-3 bg-slate-950/80 border border-slate-800 rounded-xl text-xs">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-semibold text-emerald-400">
              Achtergrond Watchdog Actief
            </span>
          </div>
          <span className="text-slate-600">•</span>
          <span className="text-slate-400">
            Monitort live thread-scheduling. Zodra het systeem &gt;1.2s bevriest, wordt de precieze freeze-duur en datum geregistreerd.
          </span>
        </div>
      </div>

      {/* Live Watchdog Incidents Box */}
      <div className="p-5 bg-slate-900/70 border border-slate-800 rounded-2xl space-y-3">
        <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
          <Activity className="w-4 h-4 text-rose-400" />
          Live Geregistreerde Freeze Incidenten
        </h3>
        {freezeData && freezeData.watchdog_freezes_detected.length > 0 ? (
          <div className="space-y-2">
            {freezeData.watchdog_freezes_detected.map((alert, idx) => (
              <div
                key={idx}
                className="p-3 bg-rose-950/40 border border-rose-800/80 rounded-xl text-xs text-rose-300 font-mono flex items-center gap-2"
              >
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{alert}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-4 bg-slate-950/50 rounded-xl border border-slate-800/80 text-xs text-slate-400 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            <span>
              Nog geen live freezes geregistreerd sinds de app is geopend. Laat PC Checker op de achtergrond draaien om een eventuele freeze direct vast te leggen.
            </span>
          </div>
        )}
      </div>

      {/* Event Log Findings */}
      <div className="p-5 bg-slate-900/70 border border-slate-800 rounded-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <Search className="w-4 h-4 text-cyan-400" />
              Gevonden Freeze-Oorzaken in Windows Systeemlogboek
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {freezeData?.diagnosis_summary}
            </p>
          </div>

          {freezeData && (
            <span
              className={cn(
                "px-3 py-1 text-xs font-bold rounded-lg border",
                freezeData.system_freeze_risk === "Hoog"
                  ? "bg-rose-950 border-rose-800 text-rose-400"
                  : freezeData.system_freeze_risk === "Middel"
                  ? "bg-amber-950 border-amber-800 text-amber-400"
                  : "bg-emerald-950 border-emerald-800 text-emerald-400"
              )}
            >
              Freeze Risico: {freezeData.system_freeze_risk}
            </span>
          )}
        </div>

        {freezeData && freezeData.event_log_culprits.length > 0 ? (
          <div className="space-y-3">
            {freezeData.event_log_culprits.map((culprit, idx) => (
              <div
                key={idx}
                className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2 text-xs"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-semibold">
                    <span className="px-2 py-0.5 rounded bg-rose-950 border border-rose-800 text-rose-400">
                      {culprit.category}
                    </span>
                    <span className="text-slate-200">{culprit.provider} (Event {culprit.event_id})</span>
                  </div>
                  <span className="text-slate-500 font-mono">{culprit.timestamp}</span>
                </div>
                <p className="text-slate-300 font-mono text-xs bg-slate-900/80 p-2.5 rounded-lg border border-slate-800/80">
                  {culprit.message}
                </p>
                <div className="p-2.5 bg-cyan-950/30 border border-cyan-800/60 rounded-lg text-cyan-300">
                  <strong>Aanbevolen Actie:</strong> {culprit.suggestion}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-4 bg-slate-950/50 rounded-xl border border-slate-800/80 text-xs text-slate-400 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            <span>
              Geen actieve driver crashes of SATA time-outs gevonden in recente Windows logs.
            </span>
          </div>
        )}
      </div>

      {/* Stappenplan */}
      <div className="p-5 bg-slate-900/50 border border-slate-800 rounded-2xl space-y-4">
        <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-cyan-400" />
          Bewezen Oplossingen voor Systeem Freezes op Desktops
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-1.5">
            <h4 className="font-semibold text-amber-400">1. SATA Link Power Management (LPM / HIPM / DIPM)</h4>
            <p className="text-slate-300">
              Als een SSD of extra HDD na enkele seconden in slaap valt (D3/Slumber), bevriest Windows kortstondig bij het ontwaken.
            </p>
            <p className="text-slate-400 text-xs">
              <strong>Oplossing:</strong> Open Geavanceerd Energiebeheer en zet "Harde schijf uitschakelen na" op 0 (Nooit). Schakel SATA LPM uit in de storage driver.
            </p>
          </div>

          <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-1.5">
            <h4 className="font-semibold text-cyan-400">2. Slechte SATA Datakabel of Extra Harde Schijf</h4>
            <p className="text-slate-300">
              Een defecte of loszittende SATA-kabel veroorzaakt CRC-overdrachtsfouten. Windows wacht op een retry vóór time-out.
            </p>
            <p className="text-slate-400 text-xs">
              <strong>Oplossing:</strong> Vervang de SATA-datakabel van extra schijven of koppel tijdelijk niet-essentiële harde schijven los.
            </p>
          </div>

          <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-1.5">
            <h4 className="font-semibold text-rose-400">3. GPU Driver Timeout Detection (TDR)</h4>
            <p className="text-slate-300">
              Als de videokaart niet tijdig antwoordt door een spanningsdip of driverbug, bevriest het scherm en reset de driver.
            </p>
            <p className="text-slate-400 text-xs">
              <strong>Oplossing:</strong> Schone installatie van de nieuwste videokaart-driver via DDU (Display Driver Uninstaller).
            </p>
          </div>

          <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-1.5">
            <h4 className="font-semibold text-purple-400">4. Bloatware &amp; RGB Monitoring Software</h4>
            <p className="text-slate-300">
              Programma's zoals Asus Armoury Crate, iCUE, Synapse of verouderde antivirussen scannen continu de SMBus/PCIe sensoren en kunnen CPU cores tijdelijk blokkeren en freezes veroorzaken.
            </p>
            <p className="text-slate-400 text-xs">
              <strong>Oplossing:</strong> Sluit overbodige RGB- en monitoringsoftware tijdelijk af om te testen.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
