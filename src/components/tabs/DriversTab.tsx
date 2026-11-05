import React, { useMemo, useState } from "react";
import { api, errorMessage } from "../../lib/api";
import { toast } from "../../store/toastStore";
import {
  CircuitBoard,
  Clock,
  Cpu,
  HardDrive,
  Info,
  Monitor,
  Network,
  OctagonAlert,
  Puzzle,
  Search,
  ShieldOff,
  CircleCheck,
  Usb,
  Volume2,
  Wrench,
  Layers,
  ShieldCheck,
  ExternalLink,
} from "lucide-react";
import { DriverEntry, DriverReport } from "../../types";
import { cn } from "../../utils/cn";
import { intlLocale, useT, type MessageKey } from "../../i18n";
import { RichText } from "../../i18n/RichText";
import { useStatusLabel } from "../../i18n/status";
import { DriverAdviceView } from "./drivers/DriverAdviceView";

type TFn = (key: MessageKey, vars?: Record<string, string | number>) => string;

interface DriversTabProps {
  driverReport: DriverReport | null;
  isScanningDrivers: boolean;
  scanDrivers: () => void;
}

type FilterMode = "all" | "issues";

const CLASS_INFO: Record<string, { label: MessageKey; icon: React.ElementType }> = {
  DISPLAY: { label: "drivers.class.DISPLAY", icon: Monitor },
  SYSTEM: { label: "drivers.class.SYSTEM", icon: Cpu },
  SCSIADAPTER: { label: "drivers.class.STORAGE", icon: HardDrive },
  HDC: { label: "drivers.class.STORAGE", icon: HardDrive },
  NET: { label: "drivers.class.NET", icon: Network },
  MEDIA: { label: "drivers.class.MEDIA", icon: Volume2 },
  AUDIOENDPOINT: { label: "drivers.class.AUDIOENDPOINT", icon: Volume2 },
  USB: { label: "drivers.class.USB", icon: Usb },
};

const classInfo = (cls: string, t: TFn) => {
  const known = CLASS_INFO[cls];
  if (known) return { label: t(known.label), icon: known.icon };
  return { label: cls ? cls.charAt(0) + cls.slice(1).toLowerCase() : t("drivers.unknown"), icon: Puzzle };
};

const STATUS_STYLE: Record<string, { badge: string; card: string; icon: React.ElementType }> = {
  Probleem: {
    badge: "bg-rose-950 border-rose-800 text-rose-400",
    card: "border-rose-900/70 bg-rose-950/20",
    icon: OctagonAlert,
  },
  "Niet ondertekend": {
    badge: "bg-orange-950 border-orange-800 text-orange-400",
    card: "border-orange-900/60 bg-orange-950/10",
    icon: ShieldOff,
  },
  Verouderd: {
    badge: "bg-amber-950 border-amber-800 text-amber-400",
    card: "border-amber-900/50 bg-amber-950/10",
    icon: Clock,
  },
  OK: {
    badge: "bg-emerald-950 border-emerald-800 text-emerald-400",
    card: "border-slate-800 bg-slate-950/70",
    icon: CircleCheck,
  },
};

const statusStyle = (status: string) => STATUS_STYLE[status] ?? STATUS_STYLE.OK;

const formatDate = (entry: DriverEntry, t: TFn) => {
  if (!entry.date) return t("drivers.unknown");
  if (entry.age_years === null) return t("drivers.genericDate", { d: entry.date });
  const age =
    entry.age_years < 1
      ? t("drivers.lessThanYear")
      : t("drivers.years", { n: entry.age_years.toLocaleString(intlLocale(), { maximumFractionDigits: 1, minimumFractionDigits: 1 }) });
  return `${entry.date} (${age})`;
};

const signedLabel = (signed: boolean | null, t: TFn) =>
  signed === null ? "—" : signed ? t("drivers.yes") : t("drivers.no");

export const DriversTab: React.FC<DriversTabProps> = ({
  driverReport,
  isScanningDrivers,
  scanDrivers,
}) => {
  const t = useT();
  const status = useStatusLabel();
  const [filter, setFilter] = useState<FilterMode>("all");

  const handleOpenDeviceManager = async () => {
    try {
      await api.openDeviceManager();
    } catch (err) {
      toast.error(t("drivers.openDmFailed"), errorMessage(err));
    }
  };

  const handleOpenWindowsUpdate = async () => {
    try {
      await api.openWindowsUpdate();
    } catch (err) {
      toast.error(t("drivers.openWuFailed"), errorMessage(err));
    }
  };

  const issueCount = driverReport
    ? driverReport.problem_count + driverReport.outdated_count + driverReport.unsigned_count
    : 0;

  const visibleEntries = useMemo(() => {
    if (!driverReport) return [];
    return filter === "issues"
      ? driverReport.entries.filter((e) => e.status !== "OK")
      : driverReport.entries;
  }, [driverReport, filter]);

  const counters = driverReport
    ? [
        { label: t("drivers.cScanned"), value: driverReport.total_drivers, color: "text-cyan-400", icon: Layers },
        { label: t("drivers.cProblems"), value: driverReport.problem_count, color: driverReport.problem_count > 0 ? "text-rose-400" : "text-slate-300", icon: OctagonAlert },
        { label: t("drivers.cOutdated"), value: driverReport.outdated_count, color: driverReport.outdated_count > 0 ? "text-amber-400" : "text-slate-300", icon: Clock },
        { label: t("drivers.cUnsigned"), value: driverReport.unsigned_count, color: driverReport.unsigned_count > 0 ? "text-orange-400" : "text-slate-300", icon: ShieldOff },
      ]
    : [];

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="p-2 rounded-xl bg-blue-950 border border-blue-800 text-blue-400">
              <CircuitBoard className="w-6 h-6" />
            </span>
            <div>
              <h2 className="text-lg font-bold text-white">Driver Check</h2>
              <p className="text-xs text-slate-400 mt-1">
                {t("drivers.intro")}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              onClick={handleOpenDeviceManager}
              className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 hover:border-slate-600 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
              title={t("drivers.dmTitle")}
            >
              <Wrench className="w-3.5 h-3.5 text-blue-400" />
              {t("drivers.dm")}
            </button>

            <button
              onClick={handleOpenWindowsUpdate}
              className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 hover:border-slate-600 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
              title={t("drivers.wuTitle")}
            >
              <ExternalLink className="w-3.5 h-3.5 text-cyan-400" />
              Windows Update
            </button>

            <button
              onClick={scanDrivers}
              disabled={isScanningDrivers}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs flex items-center gap-2 shadow-lg shadow-blue-600/20 disabled:opacity-50 transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
            >
              <Search className={cn("w-4 h-4", isScanningDrivers && "animate-spin")} />
              {isScanningDrivers ? t("drivers.scanning") : driverReport ? t("drivers.rescan") : t("drivers.start")}
            </button>
          </div>
        </div>

        {driverReport && (
          <div
            className={cn(
              "p-4 rounded-xl border text-xs flex items-start gap-2.5",
              !driverReport.is_available
                ? "bg-slate-950/70 border-slate-800 text-slate-300"
                : issueCount > 0
                ? "bg-amber-950/30 border-amber-900/60 text-amber-200"
                : "bg-emerald-950/30 border-emerald-900/60 text-emerald-300"
            )}
          >
            {driverReport.is_available && issueCount === 0 ? (
              <CircleCheck className="w-4 h-4 shrink-0 mt-0.5" />
            ) : (
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            <div className="space-y-1">
              <span>{driverReport.summary}</span>
              {driverReport.scanned_at && (
                <span className="block text-xs text-slate-500">{t("drivers.scannedAt", { t: driverReport.scanned_at })}</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Empty state */}
      {!driverReport && (
        <div className="p-10 bg-slate-900/70 border border-slate-800 rounded-2xl flex flex-col items-center text-center gap-3">
          <span className="p-3 rounded-2xl bg-slate-950 border border-slate-800 text-slate-500">
            {isScanningDrivers ? (
              <Search className="w-8 h-8 animate-spin text-blue-400" />
            ) : (
              <CircuitBoard className="w-8 h-8" />
            )}
          </span>
          <h3 className="text-sm font-bold text-slate-200">
            {isScanningDrivers ? t("drivers.readingAll") : t("drivers.notScanned")}
          </h3>
          <p className="text-xs text-slate-400 max-w-md">
            {isScanningDrivers
              ? t("drivers.readingHint")
              : t("drivers.startHint")}
          </p>
        </div>
      )}

      {/* Not available */}
      {driverReport && !driverReport.is_available && (
        <div className="p-10 bg-slate-900/70 border border-slate-800 rounded-2xl flex flex-col items-center text-center gap-3">
          <span className="p-3 rounded-2xl bg-slate-950 border border-slate-800 text-slate-500">
            <Monitor className="w-8 h-8" />
          </span>
          <h3 className="text-sm font-bold text-slate-200">{t("drivers.unavailable")}</h3>
          <p className="text-xs text-slate-400 max-w-md">{driverReport.summary}</p>
          <p className="text-xs text-slate-500 max-w-md">
            {t("drivers.unavailableHint")}
          </p>
        </div>
      )}

      {driverReport && driverReport.is_available && (
        <>
          {/* Counters */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {counters.map((c) => {
              const Icon = c.icon;
              return (
                <div
                  key={c.label}
                  className="p-4 bg-slate-900/80 border border-slate-800 rounded-2xl flex items-center justify-between"
                >
                  <div>
                    <span className="text-xs text-slate-400 uppercase tracking-wider block">{c.label}</span>
                    <span className={cn("text-2xl font-bold font-mono", c.color)}>{c.value}</span>
                  </div>
                  <Icon className={cn("w-6 h-6 opacity-70", c.color)} />
                </div>
              );
            })}
          </div>

          {/* Safe Resolution Advice Guide */}
          {driverReport.problem_count > 0 && (
            <div className="p-5 bg-blue-950/30 border border-blue-900/60 rounded-2xl space-y-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-bold text-white">
                  {t("drivers.safeTitle")}
                </h3>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                <RichText text={t("drivers.safeIntro")} />
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs pt-1">
                <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-1.5">
                  <span className="font-semibold text-cyan-400 block">{t("drivers.step1Title")}</span>
                  <p className="text-slate-400 text-xs">
                    <RichText text={t("drivers.step1")} />
                  </p>
                </div>
                <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-1.5">
                  <span className="font-semibold text-emerald-400 block">{t("drivers.step2Title")}</span>
                  <p className="text-slate-400 text-xs">
                    <RichText text={t("drivers.step2")} />
                  </p>
                </div>
                <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-1.5">
                  <span className="font-semibold text-amber-400 block">{t("drivers.step3Title")}</span>
                  <p className="text-slate-400 text-xs">
                    <RichText text={t("drivers.step3")} />
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* List */}
          <div className="p-5 bg-slate-900/70 border border-slate-800 rounded-2xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <Wrench className="w-4 h-4 text-blue-400" />
                {t("drivers.relevant", { n: visibleEntries.length })}
              </h3>
              <div className="flex items-center gap-2 text-xs">
                {(
                  [
                    { id: "all", label: t("drivers.filterAll", { n: driverReport.entries.length }) },
                    { id: "issues", label: t("drivers.filterIssues", { n: issueCount }) },
                  ] as { id: FilterMode; label: string }[]
                ).map((chip) => (
                  <button
                    key={chip.id}
                    onClick={() => setFilter(chip.id)}
                    className={cn(
                      "px-3 py-1.5 rounded-xl border font-semibold transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400",
                      filter === chip.id
                        ? "bg-blue-950 border-blue-700 text-blue-300"
                        : "bg-slate-950/70 border-slate-800 text-slate-400 hover:text-slate-200"
                    )}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>

            {visibleEntries.length === 0 ? (
              <div className="p-4 bg-emerald-950/20 border border-emerald-900/50 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
                <CircleCheck className="w-4 h-4 shrink-0" />
                {t("drivers.noIssues")}
              </div>
            ) : (
              <div className="space-y-2">
                {visibleEntries.map((entry, idx) => {
                  const st = statusStyle(entry.status);
                  const StatusIcon = st.icon;
                  const ci = classInfo(entry.device_class, t);
                  const ClassIcon = ci.icon;
                  return (
                    <div
                      key={`${entry.device_name}-${idx}`}
                      className={cn("p-4 border rounded-xl text-xs space-y-3", st.card)}
                    >
                      <div className="flex flex-col md:flex-row md:items-start justify-between gap-2">
                        <div className="flex items-start gap-3 min-w-0">
                          <span className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 shrink-0">
                            <ClassIcon className="w-4 h-4" />
                          </span>
                          <div className="min-w-0">
                            <span className="font-semibold text-slate-100 text-sm block break-words">
                              {entry.device_name}
                            </span>
                            <span className="text-xs text-slate-400">
                              {ci.label}
                              {entry.provider && <> &middot; {entry.provider}</>}
                            </span>
                          </div>
                        </div>
                        <span
                          className={cn(
                            "px-2.5 py-1 rounded-lg border text-xs font-semibold flex items-center gap-1.5 self-start shrink-0",
                            st.badge
                          )}
                        >
                          <StatusIcon className="w-3.5 h-3.5" />
                          {status(entry.status)}
                          {entry.problem_code !== null && t("drivers.code", { c: entry.problem_code })}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                        <div className="px-3 py-2 bg-slate-950/70 border border-slate-800 rounded-lg">
                          <span className="text-slate-500 block">{t("drivers.version")}</span>
                          <span className="font-mono text-slate-200">{entry.version || "—"}</span>
                        </div>
                        <div className="px-3 py-2 bg-slate-950/70 border border-slate-800 rounded-lg">
                          <span className="text-slate-500 block">{t("drivers.dateAge")}</span>
                          <span
                            className={cn(
                              "font-mono",
                              entry.status === "Verouderd" ? "text-amber-400" : "text-slate-200"
                            )}
                          >
                            {formatDate(entry, t)}
                          </span>
                        </div>
                        <div className="px-3 py-2 bg-slate-950/70 border border-slate-800 rounded-lg">
                          <span className="text-slate-500 block">{t("drivers.signed")}</span>
                          <span
                            className={cn(
                              "font-mono",
                              entry.is_signed === false ? "text-orange-400" : "text-slate-200"
                            )}
                          >
                            {signedLabel(entry.is_signed, t)}
                          </span>
                        </div>
                      </div>

                      {entry.status !== "OK" || entry.advice_detail.why || !/^(Geen actie nodig|No action needed)\.$/.test(entry.advice_detail.title) ? (
                        <DriverAdviceView
                          status={entry.status}
                          advice={entry.advice_detail}
                          onOpenDeviceManager={entry.status === "Probleem" ? handleOpenDeviceManager : undefined}
                        />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
