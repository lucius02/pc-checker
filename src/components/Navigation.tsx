import React from "react";
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
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { TabType } from "../types";
import { cn } from "../utils/cn";

/** Status van een onderdeel, getoond als indicator naast het menu-item. */
export type NavStatus = "running" | "ok" | "warn" | "fail";

interface NavigationProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  statuses: Partial<Record<TabType, NavStatus>>;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

interface NavItem {
  id: TabType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: "Overzicht",
    items: [
      { id: "overview", label: "Systeem Overzicht", icon: Layers },
      { id: "live", label: "Live Monitor", icon: Activity },
      { id: "processes", label: "Processen", icon: ListTree },
    ],
  },
  {
    title: "Diagnose",
    items: [
      { id: "freeze", label: "Freeze Detective", icon: ShieldAlert },
      { id: "latency", label: "DPC Latency", icon: Timer },
      { id: "drivers", label: "Drivers", icon: Puzzle },
      { id: "power", label: "Stroom & Batterij", icon: BatteryCharging },
      { id: "cooling", label: "Koeling & Fans", icon: Fan },
    ],
  },
  {
    title: "Stresstests",
    items: [
      { id: "cpu", label: "CPU Stresstest", icon: Cpu },
      { id: "ram", label: "RAM Geheugencheck", icon: Zap },
      { id: "disk", label: "Schijf Benchmark", icon: HardDrive },
    ],
  },
  {
    title: "Randapparatuur",
    items: [
      { id: "keyboard", label: "Toetsenbord", icon: Keyboard },
      { id: "screen", label: "Beeldscherm", icon: Monitor },
      { id: "touchpad", label: "Touchpad & Muis", icon: MousePointer },
      { id: "audio", label: "Audio & Mic", icon: Volume2 },
      { id: "camera", label: "Webcam", icon: Camera },
      { id: "network", label: "Netwerk & Wi-Fi", icon: Wifi },
    ],
  },
];

const STATUS_LABEL: Record<NavStatus, string> = {
  running: "bezig",
  ok: "in orde",
  warn: "aandacht nodig",
  fail: "probleem gevonden",
};

const STATUS_DOT: Record<Exclude<NavStatus, "running">, string> = {
  ok: "bg-emerald-400",
  warn: "bg-amber-400",
  fail: "bg-rose-500",
};

const StatusIndicator: React.FC<{ status: NavStatus; className?: string }> = ({
  status,
  className,
}) =>
  status === "running" ? (
    <Loader2 className={cn("w-3.5 h-3.5 animate-spin text-cyan-400", className)} aria-hidden />
  ) : (
    <span
      className={cn("w-2 h-2 rounded-full", STATUS_DOT[status], className)}
      aria-hidden
    />
  );

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  setActiveTab,
  statuses,
  collapsed,
  onToggleCollapsed,
}) => {
  return (
    <nav
      aria-label="Hoofdnavigatie"
      className={cn(
        "shrink-0 border-r border-slate-800/60 bg-slate-900/40 flex flex-col transition-[width] duration-200",
        collapsed ? "w-14" : "w-56"
      )}
    >
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-2 space-y-4">
        {NAV_GROUPS.map((group, groupIndex) => (
          <div key={group.title} role="group" aria-label={group.title}>
            {collapsed ? (
              groupIndex > 0 && <div className="mx-2 mb-3 border-t border-slate-800" />
            ) : (
              <h2 className="px-2.5 mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                {group.title}
              </h2>
            )}

            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                const status = statuses[item.id];
                const statusText = status ? ` (${STATUS_LABEL[status]})` : "";

                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setActiveTab(item.id)}
                      aria-current={isActive ? "page" : undefined}
                      title={collapsed ? `${item.label}${statusText}` : undefined}
                      className={cn(
                        "relative w-full h-9 rounded-lg text-sm flex items-center gap-2.5 transition-colors cursor-pointer",
                        "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cyan-400",
                        collapsed ? "justify-center px-0" : "px-2.5",
                        isActive
                          ? "bg-cyan-500/10 text-cyan-300 font-semibold"
                          : "text-slate-400 font-medium hover:bg-slate-800/60 hover:text-slate-100"
                      )}
                    >
                      {isActive && (
                        <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-cyan-400" />
                      )}
                      <Icon className="w-4 h-4 shrink-0" />
                      {!collapsed && <span className="truncate flex-1 text-left">{item.label}</span>}
                      {status && (
                        <StatusIndicator
                          status={status}
                          className={collapsed ? "absolute top-1 right-1.5" : "shrink-0"}
                        />
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
        title={collapsed ? "Menu uitklappen" : "Menu inklappen"}
        className={cn(
          "h-10 shrink-0 border-t border-slate-800/60 text-xs text-slate-500 hover:text-slate-200 hover:bg-slate-800/40 flex items-center gap-2.5 transition-colors cursor-pointer",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-cyan-400",
          collapsed ? "justify-center" : "px-4.5"
        )}
      >
        {collapsed ? (
          <PanelLeftOpen className="w-4 h-4" />
        ) : (
          <>
            <PanelLeftClose className="w-4 h-4" />
            Menu inklappen
          </>
        )}
      </button>
    </nav>
  );
};
