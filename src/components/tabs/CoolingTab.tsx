import React from "react";
import { Fan, AlertTriangle, CheckCircle2, Thermometer } from "lucide-react";
import { CoolingOverview } from "../../types";

interface CoolingTabProps {
  coolingData: CoolingOverview | null;
}

export const CoolingTab: React.FC<CoolingTabProps> = ({ coolingData }) => {
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
    </div>
  );
};
