import type { DiskSpeeds } from "../types";

/** Schijfsoorten om mee te vergelijken. */
export type DiskClassId = "hdd" | "sata" | "nvme3" | "nvme4";

/**
 * Typische snelheden van een gezonde schijf **in deze test**: sequentieel, blokken van 1 MB, één
 * opdracht tegelijk, OS-cache omzeild. Dat is lager dan de getallen op de doos (die worden met
 * tientallen opdrachten tegelijk gemeten), maar komt overeen met wat je merkt bij het opstarten
 * en laden van programma's. Ijkpunt: een Samsung 990 EVO Plus haalt hier ±2.250 / 1.200 MB/s.
 */
export const DISK_CLASSES: readonly { id: DiskClassId; read: number; write: number }[] = [
  { id: "hdd", read: 150, write: 140 },
  { id: "sata", read: 480, write: 430 },
  { id: "nvme3", read: 1500, write: 1000 },
  { id: "nvme4", read: 2500, write: 1800 },
];

/** "fast" = sneller dan gebruikelijk voor dit type, "ok" = normaal, "slow" = wat traag, "bad" = veel te traag. */
export type SpeedRating = "fast" | "ok" | "slow" | "bad";

const ref = (id: DiskClassId) => DISK_CLASSES.find((c) => c.id === id)!;

/** Met welke soort de gemeten schijf vergeleken wordt; `null` bij USB/onbekend (geen oordeel). */
export const baselineFor = (kind: string): DiskClassId | null =>
  kind === "nvme" ? "nvme3" : kind === "ssd" ? "sata" : kind === "hdd" ? "hdd" : null;

/** Beoordeelt één snelheid (lezen óf schrijven) tegenover het typische niveau van dit type schijf. */
export function rateSpeed(kind: string, metric: "read" | "write", mbps: number): SpeedRating | null {
  const base = baselineFor(kind);
  if (!base || !Number.isFinite(mbps)) return null;
  const typical = ref(base)[metric];
  // NVMe: wie het PCIe 4.0-niveau haalt is echt snel.
  const fastAt = kind === "nvme" ? ref("nvme4")[metric] * 0.8 : typical * 1.15;
  if (mbps >= fastAt) return "fast";
  if (mbps >= typical * 0.7) return "ok";
  if (mbps >= typical * 0.4) return "slow";
  return "bad";
}

export interface DiskComparison {
  baseline: DiskClassId | null;
  read: SpeedRating | null;
  write: SpeedRating | null;
}

export const compareDisk = (s: DiskSpeeds): DiskComparison => ({
  baseline: baselineFor(s.drive_kind),
  read: rateSpeed(s.drive_kind, "read", s.read_mbps),
  write: rateSpeed(s.drive_kind, "write", s.write_mbps),
});
