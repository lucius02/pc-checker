import React, { useMemo } from "react";
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
  ChartPie,
  History,
  Gpu,
  Flame,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import type { TabType } from "../types";
import { cn } from "../utils/cn";
import { useT, type MessageKey } from "../i18n";
import { useDiagnosticsStore, type BusyKey } from "../store/diagnosticsStore";
import { buildOverviewBlocks, type BlockStatus } from "../lib/overviewBlocks";

/** Status van een onderdeel, getoond als indicator naast het menu-item. */
export type NavStatus = "running" | "ok" | "warn" | "fail";

interface NavigationProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

interface NavItem {
  id: TabType;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_GROUPS: { title: MessageKey; items: NavItem[] }[] = [
  {
    title: "navGroup.overview",
    items: [
      { id: "overview", icon: Layers },
      { id: "live", icon: Activity },
      { id: "processes", icon: ListTree },
      { id: "history", icon: History },
    ],
  },
  {
    title: "navGroup.diagnosis",
    items: [
      { id: "freeze", icon: ShieldAlert },
      { id: "latency", icon: Timer },
      { id: "drivers", icon: Puzzle },
      { id: "storage", icon: Database },
      { id: "space", icon: ChartPie },
      { id: "power", icon: BatteryCharging },
      { id: "cooling", icon: Fan },
    ],
  },
  {
    title: "navGroup.stress",
    items: [
      { id: "cpu", icon: Cpu },
      { id: "ram", icon: Zap },
      { id: "disk", icon: HardDrive },
      { id: "gpu", icon: Gpu },
      { id: "burnin", icon: Flame },
    ],
  },
  {
    title: "navGroup.devices",
    items: [
      { id: "keyboard", icon: Keyboard },
      { id: "screen", icon: Monitor },
      { id: "touchpad", icon: MousePointer },
      { id: "audio", icon: Volume2 },
      { id: "camera", icon: Camera },
      { id: "network", icon: Wifi },
    ],
  },
];

/** Welke lopende taak bij welk tabblad hoort (voor de draai-indicator). */
const BUSY_FOR_TAB: Partial<Record<TabType, BusyKey[]>> = {
  freeze: ["freeze"],
  latency: ["latency", "driverLatency"],
  drivers: ["drivers"],
  storage: ["storage"],
  space: ["space"],
  power: ["battery", "powerDelivery"],
  cpu: ["cpu"],
  ram: ["ram"],
  disk: ["disk"],
};

/** Status van het overzichtsblok → indicator. "Deels getest" en "Live" krijgen geen bolletje. */
const FROM_BLOCK: Partial<Record<BlockStatus, NavStatus>> = { good: "ok", warn: "warn", bad: "fail" };

const STATUS_DOT: Record<Exclude<NavStatus, "running">, string> = {
  ok: "bg-emerald-400",
  warn: "bg-amber-400",
  fail: "bg-rose-500",
};

const StatusIndicator: React.FC<{ status: NavStatus; className?: string }> = ({ status, className }) =>
  status === "running" ? (
    <Loader2 className={cn("w-3.5 h-3.5 animate-spin text-cyan-400", className)} aria-hidden />
  ) : (
    <span className={cn("w-2 h-2 rounded-full", STATUS_DOT[status], className)} aria-hidden />
  );

/** Per tabblad de status: dezelfde beoordeling als de blokken op het overzicht, plus "bezig". */
function useNavStatuses(): Partial<Record<TabType, NavStatus>> {
  const slice = useDiagnosticsStore(
    useShallow((s) => ({
      data: s.data,
      powerData: s.powerData,
      coolingData: s.coolingData,
      freezeData: s.freezeData,
      driverReport: s.driverReport,
      latencyResult: s.latencyResult,
      storageReport: s.storageReport,
      batteryReport: s.batteryReport,
      powerDeliveryReport: s.powerDeliveryReport,
      cpuResult: s.cpuResult,
      ramResult: s.ramResult,
      diskResult: s.diskResult,
      gpuResult: s.gpuResult,
      burninResult: s.burninResult,
      peripherals: s.peripherals,
    })),
  );
  const busy = useDiagnosticsStore((s) => s.busy);
  return useMemo(() => {
    const out: Partial<Record<TabType, NavStatus>> = {};
    for (const b of buildOverviewBlocks(slice)) {
      const st = FROM_BLOCK[b.status];
      if (st) out[b.id] = st;
    }
    for (const [tab, keys] of Object.entries(BUSY_FOR_TAB) as [TabType, BusyKey[]][]) {
      if (keys.some((k) => busy[k])) out[tab] = "running";
    }
    return out;
  }, [slice, busy]);
}

export const Navigation: React.FC<NavigationProps> = ({ activeTab, setActiveTab, collapsed, onToggleCollapsed }) => {
  const t = useT();
  const statuses = useNavStatuses();

  return (
    <nav
      aria-label={t("nav.main")}
      className={cn(
        "shrink-0 border-r border-slate-800/60 bg-slate-900/40 flex flex-col transition-[width] duration-200 print:hidden",
        collapsed ? "w-14" : "w-56",
      )}
    >
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-2 space-y-4">
        {NAV_GROUPS.map((group, groupIndex) => (
          <div key={group.title} role="group" aria-label={t(group.title)}>
            {collapsed ? (
              groupIndex > 0 && <div className="mx-2 mb-3 border-t border-slate-800" />
            ) : (
              <h2 className="px-2.5 mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                {t(group.title)}
              </h2>
            )}

            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const label = t(`nav.${item.id}` as MessageKey);
                const isActive = activeTab === item.id;
                const status = statuses[item.id];
                const statusText = status ? ` (${t(`navStatus.${status}`)})` : "";

                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setActiveTab(item.id)}
                      aria-current={isActive ? "page" : undefined}
                      title={collapsed ? `${label}${statusText}` : undefined}
                      className={cn(
                        "relative w-full h-9 rounded-lg text-sm flex items-center gap-2.5 transition-colors cursor-pointer",
                        "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cyan-400",
                        collapsed ? "justify-center px-0" : "px-2.5",
                        isActive
                          ? "bg-cyan-500/10 text-cyan-300 font-semibold"
                          : "text-slate-400 font-medium hover:bg-slate-800/60 hover:text-slate-100",
                      )}
                    >
                      {isActive && <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-cyan-400" />}
                      <Icon className="w-4 h-4 shrink-0" />
                      {!collapsed && <span className="truncate flex-1 text-left">{label}</span>}
                      {status && (
                        <StatusIndicator status={status} className={collapsed ? "absolute top-1 right-1.5" : "shrink-0"} />
                      )}
                      {status && <span className="sr-only">{statusText}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onToggleCollapsed}
        aria-expanded={!collapsed}
        title={collapsed ? t("nav.expand") : t("nav.collapse")}
        className={cn(
          "h-10 shrink-0 border-t border-slate-800/60 text-xs text-slate-500 hover:text-slate-200 hover:bg-slate-800/40 flex items-center gap-2.5 transition-colors cursor-pointer",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-cyan-400",
          collapsed ? "justify-center" : "px-4.5",
        )}
      >
        {collapsed ? (
          <PanelLeftOpen className="w-4 h-4" />
        ) : (
          <>
            <PanelLeftClose className="w-4 h-4" />
            {t("nav.collapse")}
          </>
        )}
      </button>
    </nav>
  );
};
