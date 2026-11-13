import React, { useState } from "react";
import { ChartPie, FolderInput, HardDrive, Info, Loader2, Play, ShieldAlert, Square, AlertTriangle } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import type { DiskInfo, SpaceReport } from "../../types";
import { useI18nStore, useT } from "../../i18n";
import { RichText } from "../../i18n/RichText";
import { useDiagnosticsStore } from "../../store/diagnosticsStore";
import { toast } from "../../store/toastStore";
import { errorMessage } from "../../lib/api";
import { isVolumeRoot, unaccountedBytes } from "../../lib/spaceTree";
import { formatBytes } from "../../utils/formatters";
import { cn } from "../../utils/cn";
import { FolderBrowser } from "./space/FolderBrowser";
import { LargestFiles } from "./space/LargestFiles";

const NO_DISKS: DiskInfo[] = [];

/** Kleuren voor de grootste mappen in de schijfbalk (de rest is "overig"). */
const SEGMENT_COLORS = ["bg-violet-500", "bg-cyan-500", "bg-amber-500", "bg-emerald-500", "bg-rose-500", "bg-sky-400"];

const VolumeBar: React.FC<{ report: SpaceReport }> = ({ report }) => {
  const t = useT();
  const total = report.volume_total_bytes ?? 0;
  const free = report.volume_available_bytes ?? 0;
  if (!total) return null;
  const top = report.root.children.slice(0, SEGMENT_COLORS.length);
  const rest = Math.max(0, total - free - top.reduce((a, c) => a + c.size_bytes, 0));
  const segments = [
    ...top.map((c, i) => ({ key: c.path, label: c.name, size: c.size_bytes, color: SEGMENT_COLORS[i] })),
    { key: "__rest", label: t("space.otherSegment"), size: rest, color: "bg-slate-500" },
    { key: "__free", label: t("space.free"), size: free, color: "bg-slate-800" },
  ].filter((s) => s.size > 0);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-400">
        <span className="font-semibold text-slate-300 flex items-center gap-1.5">
          <HardDrive className="w-3.5 h-3.5" aria-hidden />
          {t("space.volume", { m: report.volume_mount ?? "" })}
        </span>
        <span>{t("space.volumeUsed", { u: formatBytes(total - free), f: formatBytes(free), t: formatBytes(total) })}</span>
      </div>
      <div className="flex h-3 w-full rounded-full overflow-hidden bg-slate-800" aria-hidden>
        {segments.map((s) => (
          <div key={s.key} className={cn("h-full border-r border-slate-950/60 last:border-r-0", s.color)} style={{ width: `${(s.size / total) * 100}%` }} />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
        {segments.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5 min-w-0">
            <span className={cn("w-2.5 h-2.5 rounded-sm shrink-0", s.color, s.key === "__free" && "border border-slate-600")} aria-hidden />
            <span className="truncate max-w-40">{s.label}</span>
            <span className="font-mono text-slate-300">{formatBytes(s.size)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export const SpaceTab: React.FC = () => {
  const t = useT();
  const lang = useI18nStore((s) => s.lang);
  const disks = useDiagnosticsStore((s) => s.data?.disks ?? NO_DISKS);
  const report = useDiagnosticsStore((s) => s.spaceReport);
  const progress = useDiagnosticsStore((s) => s.spaceProgress);
  const scanning = useDiagnosticsStore((s) => !!s.busy.space);
  const analyze = useDiagnosticsStore((s) => s.analyzeSpace);
  const cancel = useDiagnosticsStore((s) => s.cancelSpaceScan);
  const canElevate = useDiagnosticsStore((s) => s.elevation?.can_elevate ?? false);
  const restartAsAdmin = useDiagnosticsStore((s) => s.restartAsAdmin);

  const [picked, setPicked] = useState<string | null>(null);
  // Het mappenpad hoort bij één rapport; bij een nieuw rapport begint de lijst weer bovenaan.
  const [nav, setNav] = useState<{ report: SpaceReport | null; trail: string[] }>({ report: null, trail: [] });
  const trail = nav.report === report ? nav.trail : [];
  const setTrail = (next: string[]) => setNav({ report, trail: next });

  const target = picked ?? report?.root.path ?? disks.find((d) => !d.is_removable)?.mount_point ?? disks[0]?.mount_point ?? "";
  const isDisk = disks.some((d) => d.mount_point === target);
  const num = (n: number) => n.toLocaleString(lang);

  const start = (path: string) => {
    setPicked(path);
    void analyze(path);
  };

  const pickFolder = async () => {
    try {
      const dir = await open({ directory: true, multiple: false, defaultPath: target || undefined });
      if (typeof dir === "string") start(dir);
    } catch (err) {
      toast.error(t("error.space"), errorMessage(err));
    }
  };

  const reveal = (path: string) => {
    revealItemInDir(path).catch((err: unknown) => toast.error(t("space.revealFailed"), errorMessage(err)));
  };

  const unaccounted = report ? unaccountedBytes(report) : 0;

  return (
    <div className="space-y-6">
      <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-5">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <ChartPie className="w-5 h-5 text-violet-400" /> {t("space.title")}
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-3xl">{t("space.intro")}</p>
        </div>

        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{t("space.target")}</h3>
          <div className="flex flex-wrap gap-2">
            {disks.map((d) => {
              const active = d.mount_point === target;
              return (
                <button
                  key={d.mount_point}
                  type="button"
                  onClick={() => setPicked(d.mount_point)}
                  disabled={scanning}
                  aria-pressed={active}
                  className={cn(
                    "px-3 py-2 rounded-xl border text-left cursor-pointer transition-colors disabled:cursor-not-allowed",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400",
                    active ? "border-violet-500 bg-violet-500/10" : "border-slate-800 bg-slate-950/60 hover:border-slate-600",
                  )}
                >
                  <span className={cn("block text-sm font-semibold", active ? "text-violet-200" : "text-slate-200")}>
                    {d.mount_point}
                    {d.name && d.name !== d.mount_point && <span className="ml-1.5 font-normal text-slate-500">{d.name}</span>}
                  </span>
                  <span className="block text-[11px] text-slate-500">
                    {t("space.freeOf", { f: formatBytes(d.available_bytes), t: formatBytes(d.total_bytes) })}
                  </span>
                </button>
              );
            })}
            {!isDisk && target && (
              <span className="px-3 py-2 rounded-xl border border-violet-500 bg-violet-500/10 text-sm font-semibold text-violet-200 max-w-full truncate" title={target}>
                {target}
              </span>
            )}
            <button
              type="button"
              onClick={() => void pickFolder()}
              disabled={scanning}
              className="px-3 py-2 rounded-xl border border-dashed border-slate-700 text-sm text-slate-300 hover:border-slate-500 hover:text-white flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400"
            >
              <FolderInput className="w-4 h-4" aria-hidden />
              {t("space.chooseFolder")}
            </button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          {scanning ? (
            <button
              type="button"
              onClick={cancel}
              className="px-5 py-2.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-white font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400"
            >
              <Square className="w-3.5 h-3.5 fill-current" aria-hidden />
              {t("space.cancel")}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => start(target)}
              disabled={!target}
              className="px-5 py-2.5 rounded-xl bg-violet-500 hover:bg-violet-400 disabled:opacity-50 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 cursor-pointer max-w-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300"
            >
              <Play className="w-4 h-4 fill-slate-950 shrink-0" aria-hidden />
              <span className="truncate">{target ? t("space.analyze", { p: target }) : t("space.analyzeShort")}</span>
            </button>
          )}
          {scanning && (
            <div className="min-w-0 flex-1 text-xs text-slate-400" role="status" aria-live="polite">
              <p className="flex items-center gap-2 text-slate-300">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-400" aria-hidden />
                {t("space.scanning")}
                {progress && (
                  <span className="tabular-nums">
                    {t("space.progress", { f: num(progress.files), d: num(progress.dirs), s: formatBytes(progress.bytes) })}
                  </span>
                )}
              </p>
              {progress?.current && (
                <p className="truncate font-mono text-[11px] text-slate-500 mt-0.5" title={progress.current}>
                  {progress.current}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {!report ? (
        !scanning && <p className="text-sm text-slate-500">{t("space.notScanned")}</p>
      ) : (
        <>
          <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-4">
            <div>
              <p className="text-2xl font-bold text-white font-mono">{formatBytes(report.root.size_bytes)}</p>
              <p className="text-sm text-slate-300">
                {t("space.summary", {
                  p: report.root.path,
                  f: num(report.root.file_count),
                  d: num(report.root.dir_count),
                })}
              </p>
              <p className="text-xs text-slate-500">
                {t("space.duration", { t: (report.duration_ms / 1000).toFixed(1), at: report.scanned_at })}
              </p>
            </div>

            {isVolumeRoot(report) && <VolumeBar report={report} />}

            {report.cancelled && (
              <div className="p-3 rounded-xl border border-amber-900 bg-amber-950/20 text-amber-300 text-xs flex items-center gap-3">
                <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden />
                {t("space.cancelled")}
              </div>
            )}

            {report.skipped_dirs > 0 && (
              <div className="p-3 rounded-xl border border-amber-900 bg-amber-950/20 text-amber-300 text-xs flex items-center gap-3">
                <ShieldAlert className="w-4 h-4 shrink-0" aria-hidden />
                <span className="flex-1">
                  {t("space.skipped", { n: num(report.skipped_dirs) })} {!report.is_elevated && t("space.adminHint")}
                </span>
                {!report.is_elevated && canElevate && (
                  <button type="button" onClick={() => void restartAsAdmin()} className="underline hover:text-amber-200 cursor-pointer shrink-0">
                    {t("header.restartAdmin")}
                  </button>
                )}
              </div>
            )}

            {unaccounted > 0 && (
              <div className="p-3 rounded-xl border border-slate-800 bg-slate-950/60 text-xs text-slate-400 flex items-start gap-3">
                <Info className="w-4 h-4 shrink-0 text-slate-500 mt-0.5" aria-hidden />
                <p>
                  <span className="text-slate-300">{t("space.unaccounted", { s: formatBytes(unaccounted) })}</span> {t("space.unaccountedWhy")}
                </p>
              </div>
            )}
          </div>

          <div className="grid xl:grid-cols-2 gap-6 items-start">
            <FolderBrowser root={report.root} trail={trail} setTrail={setTrail} onReveal={reveal} onScanFolder={start} scanning={scanning} />
            <LargestFiles files={report.largest_files} onReveal={reveal} />
          </div>
        </>
      )}

      <div className="p-5 bg-slate-900/50 border border-slate-800 rounded-2xl space-y-2">
        <h3 className="font-semibold text-white text-sm">{t("space.tipsTitle")}</h3>
        <ul className="text-xs text-slate-400 list-disc pl-5 space-y-1.5 leading-relaxed">
          <li>
            <RichText text={t("space.tip1")} />
          </li>
          <li>
            <RichText text={t("space.tip2")} />
          </li>
          <li>
            <RichText text={t("space.tip3")} />
          </li>
        </ul>
      </div>
    </div>
  );
};
