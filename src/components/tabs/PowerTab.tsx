import React from "react";
import { BatteryCharging, RefreshCw, Play, CheckCircle2 } from "lucide-react";
import { PowerInfo, BatteryHealthReport } from "../../types";

interface PowerTabProps {
  powerData: PowerInfo | null;
  batteryReport: BatteryHealthReport | null;
  isTestingBattery: boolean;
  runBatteryTest: () => void;
}

export const PowerTab: React.FC<PowerTabProps> = ({
  powerData,
  batteryReport,
  isTestingBattery,
  runBatteryTest,
}) => {
  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <BatteryCharging className="w-5 h-5 text-amber-400" />
              Stroomvoorziening &amp; Batterij Gezondheid
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Inspecteert netstroomvoeding, batterijlading, en voert een diepgaande degradatietest uit van de accucapaciteit.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={runBatteryTest}
              disabled={isTestingBattery}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 disabled:opacity-50 transition-all flex items-center gap-2 cursor-pointer"
            >
              {isTestingBattery ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Accu Meten...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-slate-950" />
                  Start Batterij Slijtagetest
                </>
              )}
            </button>
          </div>
        </div>

        {/* Power Cards */}
        {powerData && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            {/* Card 1: AC Netstroom */}
            <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2">
              <span className="text-slate-400 block">Stroomtoevoer (AC Line)</span>
              <div className="flex items-center gap-2">
                <span
                  className={`w-3 h-3 rounded-full ${
                    powerData.ac_connected ? "bg-emerald-400" : "bg-amber-400 animate-pulse"
                  }`}
                />
                <span className="text-base font-bold text-slate-200">
                  {powerData.ac_connected ? "Netstroom Aangesloten" : "Op Batterij"}
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                {powerData.is_laptop
                  ? "Voedingsadapter levert stroom"
                  : "Directe voeding via PC-voeding (PSU)"}
              </p>
            </div>

            {/* Card 2: Lading % */}
            <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2">
              <span className="text-slate-400 block">
                {powerData.is_laptop ? "Actuele Batterijlading" : "Batterijstatus"}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold font-mono text-amber-400">
                  {powerData.battery_percent !== null && powerData.battery_percent !== undefined
                    ? `${powerData.battery_percent}%`
                    : "Geen (N.v.t.)"}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                {powerData.battery_status_desc}
              </p>
            </div>

            {/* Card 3: Energieplan */}
            <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2">
              <span className="text-slate-400 block">Actief Energieplan</span>
              <div className="text-base font-bold text-cyan-400">
                {powerData.power_plan_name}
              </div>
              <p className="text-[11px] text-slate-500">
                Bepaalt throttling, slaapstanden en CPU kloksnelheden
              </p>
            </div>
          </div>
        )}

        {/* Battery Health Report Box */}
        {batteryReport && (
          <div className="p-5 bg-slate-950/90 border border-amber-900/60 rounded-2xl space-y-4 animate-in fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-white text-sm">
                  Resultaat Batterijslijtage &amp; Gezondheidstest
                </h3>
              </div>
              <span className="px-3 py-1 rounded-lg text-xs font-bold bg-amber-950 border border-amber-800 text-amber-300">
                {batteryReport.grade}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800">
                <span className="text-slate-500 block mb-1">Batterij Gezondheid</span>
                <span className="text-xl font-bold font-mono text-emerald-400">
                  {batteryReport.health_percent.toFixed(1)}%
                </span>
              </div>
              <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800">
                <span className="text-slate-500 block mb-1">Capaciteitsslijtage</span>
                <span className="text-xl font-bold font-mono text-amber-400">
                  {batteryReport.wear_percent.toFixed(1)}%
                </span>
              </div>
              <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800">
                <span className="text-slate-500 block mb-1">Volledig Geladen</span>
                <span className="text-base font-bold font-mono text-slate-200">
                  {batteryReport.full_charge_capacity_mwh} mWh
                </span>
              </div>
              <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800">
                <span className="text-slate-500 block mb-1">Fabrieksontwerp</span>
                <span className="text-base font-bold font-mono text-slate-200">
                  {batteryReport.design_capacity_mwh} mWh
                </span>
              </div>
            </div>

            <div className="p-3.5 bg-slate-900/70 rounded-xl border border-slate-800/80 text-xs text-slate-300 space-y-1">
              <span className="font-semibold text-amber-300 block">Diagnose &amp; Advies:</span>
              <p>{batteryReport.advice}</p>
              <div className="text-[11px] text-slate-400 pt-1 flex gap-4">
                <span>Chemie: {batteryReport.chemistry}</span>
                <span>Fabrikant: {batteryReport.manufacturer}</span>
                <span>Geschatte accuduur: {batteryReport.estimated_runtime}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
