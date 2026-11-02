import React from "react";
import {
  BatteryCharging,
  RefreshCw,
  Play,
  CheckCircle2,
  Info,
  ShieldCheck,
  Sparkles,
  Plug,
} from "lucide-react";
import { PowerInfo, BatteryHealthReport, HardwarePowerCheckReport } from "../../types";
import { cn } from "../../utils/cn";
import { HardwarePowerSection } from "./power/HardwarePowerSection";

interface PowerTabProps {
  powerData: PowerInfo | null;
  batteryReport: BatteryHealthReport | null;
  isTestingBattery: boolean;
  runBatteryTest: () => void;
  powerDeliveryReport: HardwarePowerCheckReport | null;
  isTestingPowerDelivery: boolean;
  runPowerDeliveryCheck: () => void;
}

export const PowerTab: React.FC<PowerTabProps> = ({
  powerData,
  batteryReport,
  isTestingBattery,
  runBatteryTest,
  powerDeliveryReport,
  isTestingPowerDelivery,
  runPowerDeliveryCheck,
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
              type="button"
              onClick={runBatteryTest}
              disabled={isTestingBattery}
              className={cn(
                "px-4 py-2.5 rounded-xl bg-linear-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition-all flex items-center gap-2 cursor-pointer",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300",
                isTestingBattery && "opacity-50 cursor-not-allowed"
              )}
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
                  className={cn(
                    "w-3 h-3 rounded-full",
                    powerData.ac_connected ? "bg-emerald-400" : "bg-amber-400 animate-pulse"
                  )}
                />
                <span className="text-base font-bold text-slate-200">
                  {powerData.ac_connected ? "Netstroom Aangesloten" : "Op Batterij"}
                </span>
              </div>
              <p className="text-xs text-slate-500">
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
              <p className="text-xs text-slate-400">
                {powerData.battery_status_desc}
              </p>
            </div>

            {/* Card 3: Energieplan */}
            <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2">
              <span className="text-slate-400 block">Actief Energieplan</span>
              <div className="text-base font-bold text-cyan-400">
                {powerData.power_plan_name}
              </div>
              <p className="text-xs text-slate-500">
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
              <div className="text-xs text-slate-400 pt-1 flex gap-4">
                <span>Chemie: {batteryReport.chemistry}</span>
                <span>Fabrikant: {batteryReport.manufacturer}</span>
                <span>Geschatte accuduur: {batteryReport.estimated_runtime}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Hardware Stroomvoorziening & Componenten Vermogenstest */}
      <HardwarePowerSection
        report={powerDeliveryReport}
        isTesting={isTestingPowerDelivery}
        onRunTest={runPowerDeliveryCheck}
      />

      {/* Info & Aanbevelingen Blok voor Stroom & Batterij */}
      <div className="p-6 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-5">
        <div className="flex items-center gap-2">
          <Info className="w-5 h-5 text-amber-400" />
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
            Richtlijnen, Accugezondheid &amp; Voedingsaanbevelingen
          </h3>
        </div>

        {/* Uitleg Batterijgradaties & Slijtage */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-3">
            <h4 className="font-semibold text-slate-200 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Wat betekenen de accugezondheidspercentages?
            </h4>
            <div className="space-y-2">
              <div className="flex justify-between items-center p-2 rounded-lg bg-slate-900/80 border border-slate-800/80">
                <div>
                  <span className="font-medium text-emerald-400 block">90% – 100% • Graad A (Uitmuntend)</span>
                  <span className="text-xs text-slate-400">Accucellen presteren nagenoeg conform fabrieksspecificatie.</span>
                </div>
              </div>
              <div className="flex justify-between items-center p-2 rounded-lg bg-slate-900/80 border border-slate-800/80">
                <div>
                  <span className="font-medium text-cyan-300 block">80% – 89% • Graad B (Goed)</span>
                  <span className="text-xs text-slate-400">Normale chemische veroudering; uitstekend betrouwbaar.</span>
                </div>
              </div>
              <div className="flex justify-between items-center p-2 rounded-lg bg-slate-900/80 border border-slate-800/80">
                <div>
                  <span className="font-medium text-amber-300 block">65% – 79% • Graad C (Matig)</span>
                  <span className="text-xs text-slate-400">Capaciteit merkbaar verminderd; laptop loopt sneller leeg.</span>
                </div>
              </div>
              <div className="flex justify-between items-center p-2 rounded-lg bg-slate-900/80 border border-slate-800/80">
                <div>
                  <span className="font-medium text-rose-400 block">&lt;65% • Graad D (Versleten)</span>
                  <span className="text-xs text-slate-400">Kans op plotselinge shutdowns bij pieken; vervanging aangeraden.</span>
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-3">
            <h4 className="font-semibold text-slate-200 flex items-center gap-2">
              <Plug className="w-4 h-4 text-cyan-400" />
              Desktop vs. Laptop Voedingsverschillen
            </h4>
            <p className="text-slate-400 text-xs leading-relaxed">
              <strong>Desktop PC's:</strong> Zijn aangesloten op continue wisselstroom (AC Line). Een stabiele PSU (voeding) met 80 Plus certificering voorkomt spanningsdips op de 12V-lijn naar GPU en CPU.
            </p>
            <p className="text-slate-400 text-xs leading-relaxed">
              <strong>Laptops:</strong> Schakelen dynamisch tussen batterij en netstroom. Veel laptops halveren de CPU en GPU klokfrequentie zodra de adapter wordt losgekoppeld om piekontlading te voorkomen.
            </p>
            <div className="p-2.5 bg-slate-900/80 border border-slate-800 rounded-lg text-slate-300 text-xs">
              <strong>Laadcycli:</strong> Een lithium-ion batterij gaat gemiddeld 500 tot 800 volledige laadcycli mee voordat de slijtage merkbaar wordt.
            </div>
          </div>
        </div>

        {/* Tips voor een langere accuduur */}
        <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-3 text-xs">
          <div className="flex items-center gap-2 text-amber-300 font-semibold">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>Praktische Tips om de Acculevensduur te Verlengen</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-slate-300">
            <div className="p-3 bg-slate-900/60 rounded-lg border border-slate-800/70 space-y-1">
              <span className="font-medium text-white block">1. Activeer 80% Laadlimiet</span>
              <p className="text-xs text-slate-400">
                Als je laptop meestal aan de netstroom hangt, stel dan via de fabrikantsoftware (Lenovo Vantage, ASUS MyASUS, etc.) een 80% batterijdrempel in. Dit voorkomt celspanning-slijtage.
              </p>
            </div>

            <div className="p-3 bg-slate-900/60 rounded-lg border border-slate-800/70 space-y-1">
              <span className="font-medium text-white block">2. Vermijd Volledige Ontlading (0%)</span>
              <p className="text-xs text-slate-400">
                Lithiumcellen hebben een hekel aan diepe ontlading. Sluit de lader bij voorkeur aan zodra de batterij rond de 20% komt om celcorruptie te voorkomen.
              </p>
            </div>

            <div className="p-3 bg-slate-900/60 rounded-lg border border-slate-800/70 space-y-1">
              <span className="font-medium text-white block">3. Vermijd Hoge Accutemperaturen</span>
              <p className="text-xs text-slate-400">
                Laad een laptop niet op in direct zonlicht of op een warm dekbed. Boven de 35°C treedt versnelde chemische degradatie op in het lithium-elektrolyt.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
