import type { ComponentType } from "react";
import {
  Layers,
  ShieldAlert,
  BatteryCharging,
  Fan,
  Cpu,
  Zap,
  HardDrive,
  Activity,
  ListTree,
  Timer,
  Puzzle,
  Keyboard,
  Monitor,
  MousePointer,
  Volume2,
  Camera,
  Wifi,
  Database,
  History,
  Gpu,
  Flame,
} from "lucide-react";
import type { TabType } from "../types";
import type { MessageKey } from "../i18n";

export type TabIcon = ComponentType<{ className?: string }>;

/** Eén icoon per tabblad, gedeeld door het menu, het commandopalet en de statusbalk. */
export const TAB_ICONS: Record<TabType, TabIcon> = {
  overview: Layers,
  live: Activity,
  processes: ListTree,
  history: History,
  freeze: ShieldAlert,
  latency: Timer,
  drivers: Puzzle,
  storage: Database,
  power: BatteryCharging,
  cooling: Fan,
  cpu: Cpu,
  ram: Zap,
  disk: HardDrive,
  gpu: Gpu,
  burnin: Flame,
  keyboard: Keyboard,
  screen: Monitor,
  touchpad: MousePointer,
  audio: Volume2,
  camera: Camera,
  network: Wifi,
};

export const NAV_GROUPS: { title: MessageKey; items: TabType[] }[] = [
  { title: "navGroup.overview", items: ["overview", "live", "processes", "history"] },
  { title: "navGroup.diagnosis", items: ["freeze", "latency", "drivers", "storage", "power", "cooling"] },
  { title: "navGroup.stress", items: ["cpu", "ram", "disk", "gpu", "burnin"] },
  { title: "navGroup.devices", items: ["keyboard", "screen", "touchpad", "audio", "camera", "network"] },
];

/** Alle tabbladen in menuvolgorde. */
export const ALL_TABS: TabType[] = NAV_GROUPS.flatMap((g) => g.items);

export const tabLabelKey = (tab: TabType) => `nav.${tab}` as MessageKey;
