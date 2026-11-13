import React from "react";
import type { DiskSpeeds } from "../../../types";
import { DISK_CLASSES, compareDisk, type DiskClassId, type SpeedRating } from "../../../lib/diskReference";
import { intlLocale, useT, type MessageKey } from "../../../i18n";
import { cn } from "../../../utils/cn";

const RATING_STYLE: Record<SpeedRating, string> = {
  fast: "bg-emerald-950 border-emerald-800 text-emerald-300",
  ok: "bg-emerald-950 border-emerald-800 text-emerald-300",
  slow: "bg-amber-950 border-amber-800 text-amber-300",
  bad: "bg-rose-950 border-rose-800 text-rose-300",
};

const KNOWN_KINDS = ["nvme", "ssd", "hdd", "usb"];

const fmt = (n: number) => Math.round(n).toLocaleString(intlLocale());

/** Eén meting (lezen óf schrijven): groot getal, oordeel en de vergelijking met typische schijven. */
const SpeedPanel: React.FC<{
  metric: "read" | "write";
  mbps: number;
  rating: SpeedRating | null;
  baseline: DiskClassId | null;
}> = ({ metric, mbps, rating, baseline }) => {
  const t = useT();
  const max = Math.max(mbps, ...DISK_CLASSES.map((c) => c[metric])) * 1.05;
  const rows = [
    { id: "you", label: t("disk.cmp.you"), value: mbps },
    ...DISK_CLASSES.map((c) => ({ id: c.id as string, label: t(`disk.cmp.${c.id}` as MessageKey), value: c[metric] })),
  ];
  return (
    <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-slate-500">{t(`disk.${metric}`)}</div>
          <div className="text-2xl font-bold font-mono text-white">
            {fmt(mbps)} <span className="text-sm font-normal text-slate-400">MB/s</span>
          </div>
        </div>
        {rating && (
          <span className={cn("text-[11px] px-2 py-0.5 rounded-md border font-semibold whitespace-nowrap", RATING_STYLE[rating])}>
            {t(`disk.rating.${rating}`)}
          </span>
        )}
      </div>
      <ul className="space-y-1.5" aria-label={t("disk.cmp.title")}>
        {rows.map((r) => {
          const isYou = r.id === "you";
          const isBase = r.id === baseline;
          return (
            <li key={r.id} className="grid grid-cols-[7.5rem_1fr_4rem] items-center gap-2 text-xs">
              <span className={cn("truncate", isYou ? "text-white font-semibold" : isBase ? "text-slate-200" : "text-slate-500")}>
                {r.label}
                {isBase && <span className="text-slate-500"> ★</span>}
              </span>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden" aria-hidden>
                <div
                  className={cn("h-2 rounded-full", isYou ? "bg-amber-400" : isBase ? "bg-slate-400" : "bg-slate-600")}
                  style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }}
                />
              </div>
              <span className={cn("text-right font-mono", isYou ? "text-white" : "text-slate-400")}>{fmt(r.value)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

/** Lees- en schrijfsnelheid apart, elk vergeleken met wat gebruikelijk is voor zo'n schijf. */
export const DiskSpeedResult: React.FC<{ speeds: DiskSpeeds }> = ({ speeds }) => {
  const t = useT();
  const cmp = compareDisk(speeds);
  const kind = t(`disk.kind.${KNOWN_KINDS.includes(speeds.drive_kind) ? speeds.drive_kind : "unknown"}` as MessageKey);
  const slow = [cmp.read, cmp.write].some((r) => r === "slow" || r === "bad");
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-300">
        {speeds.drive_model ? t("disk.testedOnModel", { kind, model: speeds.drive_model }) : t("disk.testedOn", { kind })}
        {cmp.baseline && <> {t("disk.cmp.baseline", { c: t(`disk.cmp.${cmp.baseline}` as MessageKey) })}</>}
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <SpeedPanel metric="read" mbps={speeds.read_mbps} rating={cmp.read} baseline={cmp.baseline} />
        <SpeedPanel metric="write" mbps={speeds.write_mbps} rating={cmp.write} baseline={cmp.baseline} />
      </div>
      <p className="text-[11px] text-slate-500 leading-relaxed">{t("disk.cmp.note")}</p>
      {slow && <p className="text-xs text-amber-300">{t("disk.cmp.slowTip")}</p>}
    </div>
  );
};
