import React, { useCallback, useEffect, useState } from "react";
import { Wifi, Cable, RefreshCw, CheckCircle2, Activity } from "lucide-react";
import type { NetworkAdapterHealth, NetworkHealthReport } from "../../../types";
import { api, errorMessage } from "../../../lib/api";
import { intlLocale, useT, useI18nStore } from "../../../i18n";
import { toast } from "../../../store/toastStore";
import { AdviceCard } from "../../AdviceCard";
import { cn } from "../../../utils/cn";

const fmtMbps = (v: number) =>
  v >= 1000
    ? `${(v / 1000).toLocaleString(intlLocale(), { maximumFractionDigits: 1 })} Gbit/s`
    : `${Math.round(v).toLocaleString(intlLocale())} Mbit/s`;

/** Signaalsterkte → label + kleur (zelfde grenzen als de backend: -67 / -75 dBm). */
function signalLevel(dbm: number): { key: "net.sig.excellent" | "net.sig.good" | "net.sig.fair" | "net.sig.weak"; color: string; bar: string } {
  if (dbm >= -60) return { key: "net.sig.excellent", color: "text-emerald-400", bar: "bg-emerald-500" };
  if (dbm >= -67) return { key: "net.sig.good", color: "text-emerald-300", bar: "bg-emerald-400" };
  if (dbm >= -75) return { key: "net.sig.fair", color: "text-amber-300", bar: "bg-amber-400" };
  return { key: "net.sig.weak", color: "text-rose-400", bar: "bg-rose-500" };
}

const Stat: React.FC<{ label: string; value: React.ReactNode; tone?: string }> = ({ label, value, tone }) => (
  <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl">
    <div className="text-[11px] text-slate-500">{label}</div>
    <div className={cn("text-sm font-semibold text-slate-100 mt-0.5", tone)}>{value}</div>
  </div>
);

const AdapterCard: React.FC<{ a: NetworkAdapterHealth }> = ({ a }) => {
  const t = useT();
  const lang = useI18nStore((s) => s.lang);
  const w = a.wifi;
  const bandLabel = w ? (lang === "en" ? w.band : w.band.replace(".", ",")) : "";
  const dbm = w ? (w.rssi_dbm ?? Math.round(w.signal_quality / 2 - 100)) : null;
  const sig = dbm !== null ? signalLevel(dbm) : null;
  const errors = a.rx_errors + a.tx_errors;
  const discards = a.rx_discards + a.tx_discards;
  const Icon = a.kind === "wifi" ? Wifi : Cable;

  return (
    <div className="p-4 bg-slate-950/50 border border-slate-800 rounded-xl space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="p-2 rounded-lg bg-blue-950 border border-blue-800 text-blue-400 shrink-0">
            <Icon className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-100 truncate">
              {w?.ssid ? w.ssid : a.name}
              <span className="text-slate-500 font-normal"> · {a.kind === "wifi" ? t("net.wifi") : t("net.ethernet")}</span>
            </div>
            <div className="text-xs text-slate-500 truncate">
              {a.description}
              {a.driver_version && ` · driver ${a.driver_version}${a.driver_date ? ` (${a.driver_date})` : ""}`}
            </div>
          </div>
        </div>
        {a.link_speed_mbps !== null && (
          <span className="text-xs font-mono text-slate-300 shrink-0">{fmtMbps(a.link_speed_mbps)}</span>
        )}
      </div>

      {w && sig && dbm !== null && (
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-slate-400">{t("net.signal")}</span>
            <span className={cn("font-semibold", sig.color)}>
              {t(sig.key)} · {dbm} dBm ({w.signal_quality} %)
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-800 overflow-hidden" aria-hidden>
            <div className={cn("h-full rounded-full", sig.bar)} style={{ width: `${Math.max(3, w.signal_quality)}%` }} />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {w && (
          <>
            <Stat
              label={t("net.band")}
              value={`${bandLabel}${w.channel ? ` · ${t("net.channel", { c: w.channel })}` : ""}`}
              tone={w.band === "2.4 GHz" ? "text-amber-300" : undefined}
            />
            <Stat label={t("net.standard")} value={w.standard} />
            <Stat label={t("net.rate")} value={`↓ ${fmtMbps(w.rx_rate_mbps)} · ↑ ${fmtMbps(w.tx_rate_mbps)}`} />
          </>
        )}
        <Stat
          label={t("net.errors")}
          value={t("net.errorsValue", { e: errors.toLocaleString(intlLocale()), d: discards.toLocaleString(intlLocale()) })}
          tone={errors + discards > 0 ? "text-amber-300" : "text-emerald-400"}
        />
        <Stat
          label={t("net.powerSaving")}
          value={
            a.power_saving.length > 0 || a.allow_turn_off === true
              ? t("net.powerOn")
              : t("net.powerOff")
          }
          tone={a.power_saving.length > 0 || a.allow_turn_off === true ? "text-amber-300" : "text-emerald-400"}
        />
      </div>
    </div>
  );
};

/** Wifi-kwaliteit en adaptergezondheid, met uitleg en stappen bij problemen. */
export const NetworkHealthSection: React.FC = () => {
  const t = useT();
  const lang = useI18nStore((s) => s.lang);
  const [report, setReport] = useState<NetworkHealthReport | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setReport(await api.getNetworkHealth());
    } catch (err) {
      toast.error(t("net.healthFailed"), errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [t]);

  // Bij openen van het tabblad en na een taalwissel (backendteksten).
  useEffect(() => {
    void load();
  }, [load, lang]);

  return (
    <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-400" />
            {t("net.healthTitle")}
          </h3>
          <p className="text-xs text-slate-400 mt-0.5 max-w-3xl">{t("net.healthIntro")}</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-medium flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
          {t("net.healthRefresh")}
        </button>
      </div>

      {!report ? (
        <p className="text-xs text-slate-500">{loading ? t("net.healthLoading") : ""}</p>
      ) : !report.is_available ? (
        <p className="text-xs text-slate-400">{report.summary}</p>
      ) : (
        <>
          <div className="space-y-3">
            {report.adapters.map((a) => (
              <AdapterCard key={a.name} a={a} />
            ))}
          </div>

          {report.issues.length === 0 ? (
            report.adapters.length > 0 && (
              <p className="text-xs text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" /> {report.summary}
              </p>
            )
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-slate-300">{report.summary}</p>
              {report.issues.map((i, idx) => (
                <div key={idx} className="space-y-1">
                  {report.adapters.length > 1 && (
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{i.adapter}</div>
                  )}
                  <AdviceCard tone={i.severity === "Hoog" ? "high" : "medium"} advice={i.advice} />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};
