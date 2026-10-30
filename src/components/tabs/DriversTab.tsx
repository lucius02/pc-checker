import React, { useMemo, useState } from "react";
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
} from "lucide-react";
import { DriverEntry, DriverReport } from "../../types";
import { cn } from "../../utils/cn";

interface DriversTabProps {
  driverReport: DriverReport | null;
  isScanningDrivers: boolean;
  scanDrivers: () => void;
}

type FilterMode = "all" | "issues";

const CLASS_INFO: Record<string, { label: string; icon: React.ElementType }> = {
  DISPLAY: { label: "Videokaart", icon: Monitor },
  SYSTEM: { label: "Chipset / Systeem", icon: Cpu },
  SCSIADAPTER: { label: "Opslagcontroller", icon: HardDrive },
  HDC: { label: "Opslagcontroller", icon: HardDrive },
  NET: { label: "Netwerk", icon: Network },
  MEDIA: { label: "Audio", icon: Volume2 },
  AUDIOENDPOINT: { label: "Audio-eindpunt", icon: Volume2 },
  USB: { label: "USB", icon: Usb },
};

const classInfo = (cls: string) =>
  CLASS_INFO[cls] ?? { label: cls ? cls.charAt(0) + cls.slice(1).toLowerCase() : "Onbekend", icon: Puzzle };

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

const formatDate = (entry: DriverEntry) => {
  if (!entry.date) return "Onbekend";
  if (entry.age_years === null) return `${entry.date} (generieke datum)`;
  const age = entry.age_years < 1 ? "< 1 jaar" : `${entry.age_years.toFixed(1).replace(".", ",")} jaar`;
  return `${entry.date} (${age})`;
};

const signedLabel = (signed: boolean | null) =>
  signed === null ? "—" : signed ? "Ja" : "Nee";

export const DriversTab: React.FC<DriversTabProps> = ({
  driverReport,
  isScanningDrivers,
  scanDrivers,
}) => {
  const [filter, setFilter] = useState<FilterMode>("all");

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
        { label: "Drivers gescand", value: driverReport.total_drivers, color: "text-cyan-400", icon: Layers },
        { label: "Problemen", value: driverReport.problem_count, color: driverReport.problem_count > 0 ? "text-rose-400" : "text-slate-300", icon: OctagonAlert },
        { label: "Verouderd", value: driverReport.outdated_count, color: driverReport.outdated_count > 0 ? "text-amber-400" : "text-slate-300", icon: Clock },
        { label: "Niet ondertekend", value: driverReport.unsigned_count, color: driverReport.unsigned_count > 0 ? "text-orange-400" : "text-slate-300", icon: ShieldOff },
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
                Zoekt verouderde, niet-ondertekende en probleem-drivers (Apparaatbeheer-foutcodes) in de klassen die
                het vaakst freezes en stotteringen veroorzaken: videokaart, chipset, opslag, netwerk, audio en USB.
              </p>
            </div>
          </div>

          <button
            onClick={scanDrivers}
            disabled={isScanningDrivers}
            className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs flex items-center gap-2 shadow-lg shadow-blue-600/20 disabled:opacity-50 transition-all cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            <Search className={cn("w-4 h-4", isScanningDrivers && "animate-spin")} />
            {isScanningDrivers ? "Drivers scannen..." : driverReport ? "Opnieuw scannen" : "Start driver-scan"}
          </button>
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
                <span className="block text-xs text-slate-500">Gescand op {driverReport.scanned_at}</span>
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
            {isScanningDrivers ? "Bezig met het uitlezen van alle drivers..." : "Nog geen driver-scan uitgevoerd"}
          </h3>
          <p className="text-xs text-slate-400 max-w-md">
            {isScanningDrivers
              ? "Windows wordt via WMI bevraagd naar alle geïnstalleerde drivers en apparaten met foutcodes. Dit duurt meestal enkele seconden."
              : "Klik op 'Start driver-scan' om alle geïnstalleerde drivers te controleren op leeftijd, digitale handtekening en Apparaatbeheer-foutcodes."}
          </p>
        </div>
      )}

      {/* Not available */}
      {driverReport && !driverReport.is_available && (
        <div className="p-10 bg-slate-900/70 border border-slate-800 rounded-2xl flex flex-col items-center text-center gap-3">
          <span className="p-3 rounded-2xl bg-slate-950 border border-slate-800 text-slate-500">
            <Monitor className="w-8 h-8" />
          </span>
          <h3 className="text-sm font-bold text-slate-200">Driver-informatie niet beschikbaar</h3>
          <p className="text-xs text-slate-400 max-w-md">{driverReport.summary}</p>
          <p className="text-xs text-slate-500 max-w-md">
            De Driver Check gebruikt Windows Management Instrumentation (WMI) via PowerShell en werkt alleen op Windows.
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

          {/* List */}
          <div className="p-5 bg-slate-900/70 border border-slate-800 rounded-2xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <Wrench className="w-4 h-4 text-blue-400" />
                Relevante drivers ({visibleEntries.length})
              </h3>
              <div className="flex items-center gap-2 text-xs">
                {(
                  [
                    { id: "all", label: `Alle (${driverReport.entries.length})` },
                    { id: "issues", label: `Alleen problemen (${issueCount})` },
                  ] as { id: FilterMode; label: string }[]
                ).map((chip) => (
                  <button
                    key={chip.id}
                    onClick={() => setFilter(chip.id)}
                    className={cn(
                      "px-3 py-1.5 rounded-xl border font-semibold transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400",
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
                Geen problemen, verouderde of niet-ondertekende drivers gevonden.
              </div>
            ) : (
              <div className="space-y-2">
                {visibleEntries.map((entry, idx) => {
                  const st = statusStyle(entry.status);
                  const StatusIcon = st.icon;
                  const ci = classInfo(entry.device_class);
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
                          {entry.status}
                          {entry.problem_code !== null && ` (code ${entry.problem_code})`}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                        <div className="px-3 py-2 bg-slate-950/70 border border-slate-800 rounded-lg">
                          <span className="text-slate-500 block">Versie</span>
                          <span className="font-mono text-slate-200">{entry.version || "—"}</span>
                        </div>
                        <div className="px-3 py-2 bg-slate-950/70 border border-slate-800 rounded-lg">
                          <span className="text-slate-500 block">Datum / leeftijd</span>
                          <span
                            className={cn(
                              "font-mono",
                              entry.status === "Verouderd" ? "text-amber-400" : "text-slate-200"
                            )}
                          >
                            {formatDate(entry)}
                          </span>
                        </div>
                        <div className="px-3 py-2 bg-slate-950/70 border border-slate-800 rounded-lg">
                          <span className="text-slate-500 block">Digitaal ondertekend</span>
                          <span
                            className={cn(
                              "font-mono",
                              entry.is_signed === false ? "text-orange-400" : "text-slate-200"
                            )}
                          >
                            {signedLabel(entry.is_signed)}
                          </span>
                        </div>
                      </div>

                      {entry.status !== "OK" || entry.advice !== "Geen actie nodig." ? (
                        <div
                          className={cn(
                            "flex items-start gap-2 text-xs leading-relaxed",
                            entry.status === "OK" ? "text-slate-400" : "text-slate-300"
                          )}
                        >
                          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-blue-400" />
                          <span>{entry.advice}</span>
                        </div>
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
