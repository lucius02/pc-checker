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
import { cn } from "../../utils/cn";
import { useT } from "../../i18n";
import { RichText } from "../../i18n/RichText";

interface CoolingTabProps {
  coolingData: CoolingOverview | null;
}

export const CoolingTab: React.FC<CoolingTabProps> = ({ coolingData }) => {
  const t = useT();
  const maxTemp = coolingData?.temperatures.reduce(
    (max, s) => Math.max(max, s.temperature_celsius),
    0
  ) || 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Fan className="w-5 h-5 text-blue-400" />
              {t("cooling.title")}
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              {t("cooling.intro")}
            </p>
          </div>

          {coolingData && (
            <span
              className={cn(
                "px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-2",
                coolingData.is_throttling_suspected
                  ? "bg-rose-950 border-rose-800 text-rose-400 animate-pulse"
                  : "bg-emerald-950 border-emerald-800 text-emerald-400"
              )}
            >
              {coolingData.is_throttling_suspected ? (
                <>
                  <AlertTriangle className="w-4 h-4" /> {t("cooling.throttling")}
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" /> {t("cooling.normal")}
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
            {t("cooling.sensors", { n: coolingData?.temperatures.length || 0 })}
          </h4>
          {coolingData && coolingData.temperatures.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {coolingData.temperatures.map((sensor, idx) => (
                <div
                  key={idx}
                  className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl flex items-center justify-between text-xs"
                >
                  <div>
                    <span className="font-semibold text-slate-200 block text-sm">{sensor.label}</span>
                    <span className="text-xs text-slate-500">
                      {t("cooling.maxAllowed", { v: sensor.max_celsius !== null ? `${sensor.max_celsius.toFixed(0)}°C` : "100°C" })}
                    </span>
                  </div>
                  <span
                    className={cn(
                      "text-2xl font-bold font-mono",
                      sensor.temperature_celsius > 85
                        ? "text-rose-400"
                        : sensor.temperature_celsius > 70
                        ? "text-amber-400"
                        : "text-cyan-400"
                    )}
                  >
                    {sensor.temperature_celsius.toFixed(1)}°C
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 bg-slate-950/50 rounded-xl border border-slate-800 text-xs text-slate-400">
              {t("cooling.noSensors")}
            </div>
          )}
        </div>

        {/* Fans Grid */}
        <div>
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
            {t("cooling.fans")}
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
                    <span className="text-xs text-slate-400">{f.status}</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-lg font-bold font-mono text-cyan-400 block">
                    {f.speed_rpm !== null ? `${f.speed_rpm} RPM` : t("cooling.dynamic")}
                  </span>
                  <span className="text-xs text-slate-500">
                    {f.speed_rpm !== null ? t("cooling.tacho") : t("cooling.ecCurve")}
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
            {t("cooling.guideTitle")}
          </h3>
        </div>

        {/* Referentietabellen: Temperatuur & RPM */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
          {/* Wat is een normale temperatuur? */}
          <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-3">
            <h4 className="font-semibold text-slate-200 flex items-center gap-2">
              <Thermometer className="w-4 h-4 text-cyan-400" />
              {t("cooling.tempTitle")}
            </h4>
            <div className="space-y-2">
              <div className="flex justify-between items-center p-2 rounded-lg bg-slate-900/80 border border-slate-800/80">
                <div>
                  <span className="font-medium text-emerald-400 block">{t("cooling.t1")}</span>
                  <span className="text-xs text-slate-400">{t("cooling.t1Text")}</span>
                </div>
                <span className="text-xs px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 font-semibold border border-emerald-800">
                  {t("cooling.t1Badge")}
                </span>
              </div>

              <div className="flex justify-between items-center p-2 rounded-lg bg-slate-900/80 border border-slate-800/80">
                <div>
                  <span className="font-medium text-cyan-300 block">{t("cooling.t2")}</span>
                  <span className="text-xs text-slate-400">{t("cooling.t2Text")}</span>
                </div>
                <span className="text-xs px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 font-semibold border border-cyan-800">
                  {t("cooling.t2Badge")}
                </span>
              </div>

              <div className="flex justify-between items-center p-2 rounded-lg bg-slate-900/80 border border-slate-800/80">
                <div>
                  <span className="font-medium text-amber-300 block">{t("cooling.t3")}</span>
                  <span className="text-xs text-slate-400">{t("cooling.t3Text")}</span>
                </div>
                <span className="text-xs px-2 py-0.5 rounded bg-amber-950 text-amber-300 font-semibold border border-amber-800">
                  {t("cooling.t3Badge")}
                </span>
              </div>

              <div className="flex justify-between items-center p-2 rounded-lg bg-slate-900/80 border border-slate-800/80">
                <div>
                  <span className="font-medium text-rose-400 block">{t("cooling.t4")}</span>
                  <span className="text-xs text-slate-400">{t("cooling.t4Text")}</span>
                </div>
                <span className="text-xs px-2 py-0.5 rounded bg-rose-950 text-rose-300 font-semibold border border-rose-800">
                  {t("cooling.t4Badge")}
                </span>
              </div>
            </div>
          </div>

          {/* Hoeveel RPM is normaal? */}
          <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-3">
            <h4 className="font-semibold text-slate-200 flex items-center gap-2">
              <Fan className="w-4 h-4 text-blue-400" />
              {t("cooling.rpmTitle")}
            </h4>
            <div className="space-y-2">
              <div className="flex justify-between items-center p-2 rounded-lg bg-slate-900/80 border border-slate-800/80">
                <div>
                  <span className="font-medium text-emerald-400 block">{t("cooling.r1")}</span>
                  <span className="text-xs text-slate-400">{t("cooling.r1Text")}</span>
                </div>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-900 text-slate-300 font-semibold border border-slate-800">
                  {t("cooling.r1Badge")}
                </span>
              </div>

              <div className="flex justify-between items-center p-2 rounded-lg bg-slate-900/80 border border-slate-800/80">
                <div>
                  <span className="font-medium text-cyan-300 block">{t("cooling.r2")}</span>
                  <span className="text-xs text-slate-400">{t("cooling.r2Text")}</span>
                </div>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-900 text-slate-300 font-semibold border border-slate-800">
                  {t("cooling.r2Badge")}
                </span>
              </div>

              <div className="flex justify-between items-center p-2 rounded-lg bg-slate-900/80 border border-slate-800/80">
                <div>
                  <span className="font-medium text-amber-300 block">{t("cooling.r3")}</span>
                  <span className="text-xs text-slate-400">{t("cooling.r3Text")}</span>
                </div>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-900 text-slate-300 font-semibold border border-slate-800">
                  {t("cooling.r3Badge")}
                </span>
              </div>

              <div className="flex justify-between items-center p-2 rounded-lg bg-slate-900/80 border border-slate-800/80">
                <div>
                  <span className="font-medium text-purple-300 block">{t("cooling.r4")}</span>
                  <span className="text-xs text-slate-400">{t("cooling.r4Text")}</span>
                </div>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-900 text-slate-300 font-semibold border border-slate-800">
                  {t("cooling.r4Badge")}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Concrete Aanbevelingen & Onderhoudstips */}
        <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-3 text-xs">
          <div className="flex items-center gap-2 text-amber-300 font-semibold">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>{t("cooling.tipsTitle")}</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-slate-300">
            <div className="p-3 bg-slate-900/60 rounded-lg border border-slate-800/70 space-y-1">
              <span className="font-medium text-white block">{t("cooling.tip1Title")}</span>
              <p className="text-xs text-slate-400">
                {t("cooling.tip1")}
              </p>
            </div>

            <div className="p-3 bg-slate-900/60 rounded-lg border border-slate-800/70 space-y-1">
              <span className="font-medium text-white block">{t("cooling.tip2Title")}</span>
              <p className="text-xs text-slate-400">
                {t("cooling.tip2")}
              </p>
            </div>

            <div className="p-3 bg-slate-900/60 rounded-lg border border-slate-800/70 space-y-1">
              <span className="font-medium text-white block">{t("cooling.tip3Title")}</span>
              <p className="text-xs text-slate-400">
                {t("cooling.tip3")}
              </p>
            </div>
          </div>

          {maxTemp >= 85 && (
            <div className="p-3 bg-rose-950/40 border border-rose-800/80 rounded-lg text-rose-300 flex items-center gap-2 mt-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>
                <RichText text={t("cooling.currentWarning", { t: maxTemp.toFixed(1) })} />
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
