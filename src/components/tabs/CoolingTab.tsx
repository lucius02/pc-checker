import React from "react";
import {
  Fan,
  AlertTriangle,
  CheckCircle2,
  Thermometer,
  Info,
  Sparkles,
} from "lucide-react";
import { CoolingOverview } from "../../types";

interface CoolingTabProps {
  coolingData: CoolingOverview | null;
}

export const CoolingTab: React.FC<CoolingTabProps> = ({ coolingData }) => {
  const maxTemp = coolingData?.temperatures.reduce(
    (max, t) => Math.max(max, t.temperature_celsius),
    0
  ) || 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Fan className="w-5 h-5 text-blue-400" />
              Koeling, Ventilatoren &amp; Thermische Sensoren
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Controleert ventilatorsnelheden (RPM), sensortemperaturen van CPU en componenten en waarschuwt bij thermische throttling.
            </p>
          </div>

          {coolingData && (
            <span
              className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
                coolingData.is_throttling_suspected
                  ? "bg-rose-950 border-rose-800 text-rose-400 animate-pulse"
                  : "bg-emerald-950 border-emerald-800 text-emerald-400"
              }`}
            >
              {coolingData.is_throttling_suspected ? (
                <>
                  <AlertTriangle className="w-4 h-4" /> Throttling Gedetecteerd (&gt;90°C)
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" /> Temperaturen Normaal
                </>
              )}
            </span>
          )}
        </div>

        {/* Summary Box */}
        <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl text-xs flex items-center gap-2.5 text-slate-300">
          <Thermometer className="w-4 h-4 text-blue-400 shrink-0" />
          <span>{coolingData?.summary}</span>
        </div>

        {/* Temperatures Grid */}
        <div>
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
            Gedetecteerde Temperatuursensoren ({coolingData?.temperatures.length || 0})
          </h4>
          {coolingData && coolingData.temperatures.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {coolingData.temperatures.map((t, idx) => (
                <div
                  key={idx}
                  className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl flex items-center justify-between text-xs"
                >
                  <div>
                    <span className="font-semibold text-slate-200 block text-sm">{t.label}</span>
                    <span className="text-[11px] text-slate-500">
                      Maximaal toelaatbaar: {t.max_celsius !== null ? `${t.max_celsius.toFixed(0)}°C` : "100°C"}
                    </span>
                  </div>
                  <span
                    className={`text-2xl font-bold font-mono ${
                      t.temperature_celsius > 85
                        ? "text-rose-400"
                        : t.temperature_celsius > 70
                        ? "text-amber-400"
                        : "text-cyan-400"
                    }`}
                  >
                    {t.temperature_celsius.toFixed(1)}°C
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 bg-slate-950/50 rounded-xl border border-slate-800 text-xs text-slate-400">
              Sensoren worden live uitgelezen via Windows ACPI &amp; WMI tellers.
            </div>
          )}
        </div>

        {/* Fans Grid */}
        <div>
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
            Ventilatoren &amp; Toerentallen (RPM)
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {coolingData && coolingData.fans.map((f, idx) => (
              <div
                key={idx}
                className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl flex items-center justify-between text-xs"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-950 border border-blue-800 text-blue-400">
                    <Fan className="w-5 h-5 animate-spin" />
                  </div>
                  <div>
                    <span className="font-semibold text-slate-200 text-sm block">{f.name}</span>
                    <span className="text-[11px] text-slate-400">{f.status}</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-lg font-bold font-mono text-cyan-400 block">
                    {f.speed_rpm !== null ? `${f.speed_rpm} RPM` : "Dynamisch Actief"}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {f.speed_rpm !== null ? "Tachometer RPM" : "EC/BIOS Curve"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Info & Aanbevelingen Blok voor Koeling & Fans */}
      <div className="p-6 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-5">
        <div className="flex items-center gap-2">
          <Info className="w-5 h-5 text-blue-400" />
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
            Richtlijnen, Normale Waarden &amp; Koelingsadvies
          </h3>
        </div>

        {/* Referentietabellen: Temperatuur & RPM */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
          {/* Wat is een normale temperatuur? */}
          <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-3">
            <h4 className="font-semibold text-slate-200 flex items-center gap-2">
              <Thermometer className="w-4 h-4 text-cyan-400" />
              Wat is een normale temperatuur?
            </h4>
            <div className="space-y-2">
              <div className="flex justify-between items-center p-2 rounded-lg bg-slate-900/80 border border-slate-800/80">
                <div>
                  <span className="font-medium text-emerald-400 block">35°C – 50°C • Rust (Idle)</span>
                  <span className="text-[11px] text-slate-400">Bij surfen, tekstverwerken of bureauwerk.</span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 font-semibold border border-emerald-800">
                  Optimaal
                </span>
              </div>

              <div className="flex justify-between items-center p-2 rounded-lg bg-slate-900/80 border border-slate-800/80">
                <div>
                  <span className="font-medium text-cyan-300 block">60°C – 80°C • Normale Belasting</span>
                  <span className="text-[11px] text-slate-400">Tijdens gamen, videobewerking of compileren.</span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 font-semibold border border-cyan-800">
                  Gezond
                </span>
              </div>

              <div className="flex justify-between items-center p-2 rounded-lg bg-slate-900/80 border border-slate-800/80">
                <div>
                  <span className="font-medium text-amber-300 block">85°C – 92°C • Hoge Belasting</span>
                  <span className="text-[11px] text-slate-400">CPU benadert thermische limiet; ventilators draaien op piek.</span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded bg-amber-950 text-amber-300 font-semibold border border-amber-800">
                  Warm
                </span>
              </div>

              <div className="flex justify-between items-center p-2 rounded-lg bg-slate-900/80 border border-slate-800/80">
                <div>
                  <span className="font-medium text-rose-400 block">&gt;95°C • Thermische Throttling</span>
                  <span className="text-[11px] text-slate-400">CPU verlaagt automatisch kloksnelheid om schade te voorkomen.</span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded bg-rose-950 text-rose-300 font-semibold border border-rose-800">
                  Kritiek
                </span>
              </div>
            </div>
          </div>

          {/* Hoeveel RPM is normaal? */}
          <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-3">
            <h4 className="font-semibold text-slate-200 flex items-center gap-2">
              <Fan className="w-4 h-4 text-blue-400" />
              Hoeveel RPM is normaal voor ventilatoren?
            </h4>
            <div className="space-y-2">
              <div className="flex justify-between items-center p-2 rounded-lg bg-slate-900/80 border border-slate-800/80">
                <div>
                  <span className="font-medium text-emerald-400 block">0 – 1.200 RPM • Stiltemodus (Rust)</span>
                  <span className="text-[11px] text-slate-400">Veel laptops/GPU's stoppen ventilatoren volledig (0 RPM modus).</span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded bg-slate-900 text-slate-300 font-semibold border border-slate-800">
                  Stil
                </span>
              </div>

              <div className="flex justify-between items-center p-2 rounded-lg bg-slate-900/80 border border-slate-800/80">
                <div>
                  <span className="font-medium text-cyan-300 block">1.500 – 2.800 RPM • Gemiddeld</span>
                  <span className="text-[11px] text-slate-400">Hoorbare luchtstroom bij actieve werklast; stabiele warmteafvoer.</span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded bg-slate-900 text-slate-300 font-semibold border border-slate-800">
                  Gebalanceerd
                </span>
              </div>

              <div className="flex justify-between items-center p-2 rounded-lg bg-slate-900/80 border border-slate-800/80">
                <div>
                  <span className="font-medium text-amber-300 block">3.000 – 4.800 RPM • Maximaal (Laptops)</span>
                  <span className="text-[11px] text-slate-400">Kleine laptop-blowers hebben hoge RPM nodig voor voldoende airflow.</span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded bg-slate-900 text-slate-300 font-semibold border border-slate-800">
                  Piek Laptop
                </span>
              </div>

              <div className="flex justify-between items-center p-2 rounded-lg bg-slate-900/80 border border-slate-800/80">
                <div>
                  <span className="font-medium text-purple-300 block">EC/BIOS Dynamische Curve</span>
                  <span className="text-[11px] text-slate-400">Moderne moederborden sturen toerentallen traploos aan via PWM/ACPI.</span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded bg-slate-900 text-slate-300 font-semibold border border-slate-800">
                  Automatisch
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Concrete Aanbevelingen & Onderhoudstips */}
        <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-3 text-xs">
          <div className="flex items-center gap-2 text-amber-300 font-semibold">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>Praktische Aanbevelingen voor Optimale Koeling</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-slate-300">
            <div className="p-3 bg-slate-900/60 rounded-lg border border-slate-800/70 space-y-1">
              <span className="font-medium text-white block">1. Stofvrij Maken (Perslucht)</span>
              <p className="text-[11px] text-slate-400">
                Stofnesten in koelribben en ventilators kunnen de koelcapaciteit met 40% verlagen. Blaas de roosters eens per 6-12 maanden schoon met perslucht.
              </p>
            </div>

            <div className="p-3 bg-slate-900/60 rounded-lg border border-slate-800/70 space-y-1">
              <span className="font-medium text-white block">2. Zorg voor Vrije Luchttoevoer</span>
              <p className="text-[11px] text-slate-400">
                Plaats een laptop nooit op een dekbed of kussen. Gebruik een harde ondergrond of een verhoger zodat de ventilatieopeningen aan de onderkant vrij kunnen ademen.
              </p>
            </div>

            <div className="p-3 bg-slate-900/60 rounded-lg border border-slate-800/70 space-y-1">
              <span className="font-medium text-white block">3. Koelpasta &amp; BIOS Profiel</span>
              <p className="text-[11px] text-slate-400">
                Als de CPU na 2-3 jaar structureel 90°C overschrijdt, is de koelpasta vaak uitgedroogd. Controleer in de BIOS ook of het koelprofiel op 'Standaard' of 'Prestaties' staat.
              </p>
            </div>
          </div>

          {maxTemp >= 85 && (
            <div className="p-3 bg-rose-950/40 border border-rose-800/80 rounded-lg text-rose-300 flex items-center gap-2 mt-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>
                <strong>Actuele Waarschuwing:</strong> Je systeem heeft recent <strong>{maxTemp.toFixed(1)}°C</strong> bereikt. We raden aan de ventilatieroosters te controleren en zware achtergrondprocessen af te sluiten.
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
