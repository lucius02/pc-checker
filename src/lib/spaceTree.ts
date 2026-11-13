import type { SpaceEntry, SpaceReport } from "../types";

/** Eén regel in de mappenlijst: een submap, de losse bestanden of de samengevoegde kleine mappen. */
export type SpaceRow =
  | { kind: "dir"; key: string; size: number; entry: SpaceEntry }
  | { kind: "files"; key: string; size: number; count: number }
  | { kind: "other"; key: string; size: number; count: number };

/** Volgt het pad (lijst met map-paden vanaf de root) zo ver als het in de boom bestaat. */
export function resolveTrail(root: SpaceEntry, trail: string[]): SpaceEntry[] {
  const chain = [root];
  for (const path of trail) {
    const next = chain[chain.length - 1].children.find((c) => c.path === path);
    if (!next) break;
    chain.push(next);
  }
  return chain;
}

/** Regels voor één map, aflopend op grootte. */
export function folderRows(entry: SpaceEntry): SpaceRow[] {
  const rows: SpaceRow[] = entry.children.map((c) => ({ kind: "dir", key: c.path, size: c.size_bytes, entry: c }));
  if (entry.own_file_count > 0) {
    rows.push({ kind: "files", key: "__files", size: entry.own_files_bytes, count: entry.own_file_count });
  }
  if (entry.other_count > 0) {
    rows.push({ kind: "other", key: "__other", size: entry.other_bytes, count: entry.other_count });
  }
  return rows.sort((a, b) => b.size - a.size);
}

function normalizePath(p: string): string {
  return p.replace(/\//g, "\\").replace(/\\+$/, "").toLowerCase();
}

/** Is de gescande map de hele schijf (het koppelpunt zelf)? */
export function isVolumeRoot(report: SpaceReport): boolean {
  return report.volume_mount != null && normalizePath(report.root.path) === normalizePath(report.volume_mount);
}

/**
 * Gebruikte ruimte op de schijf die de scan niet aan mappen kon toewijzen. Alleen zinvol als de
 * hele schijf is gescand en de scan niet is afgebroken; kleine verschillen tellen niet mee.
 */
export function unaccountedBytes(report: SpaceReport): number {
  if (report.cancelled || !isVolumeRoot(report)) return 0;
  const total = report.volume_total_bytes ?? 0;
  const used = total - (report.volume_available_bytes ?? 0);
  const diff = used - report.root.size_bytes;
  const minimum = Math.max(1024 ** 3, used * 0.02);
  return diff >= minimum ? diff : 0;
}

/** Map waarin een bestand staat (voor weergave onder de bestandsnaam). */
export function parentDir(path: string): string {
  const i = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return i > 0 ? path.slice(0, i) : path;
}
