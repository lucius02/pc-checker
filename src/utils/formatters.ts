export function formatBytes(bytes: number, decimals = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
  // Begrenzen: waarden < 1 B of > 1024 PB gaven anders "undefined" als eenheid.
  const i = Math.min(sizes.length - 1, Math.max(0, Math.floor(Math.log(bytes) / Math.log(k))));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

import { useI18nStore, type Lang } from "../i18n";

/** `2d 1u 0m` (nl) of `2d 1h 0m` (en). */
export function formatUptime(secs: number, lang: Lang = useI18nStore.getState().lang): string {
  const hu = lang === "en" ? "h" : "u";
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (d > 0) return `${d}d ${h}${hu} ${m}m`;
  return `${h}${hu} ${m}m`;
}
