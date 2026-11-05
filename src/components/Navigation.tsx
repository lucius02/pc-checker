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
  Database,
  History,
  Gpu,
  Flame,
} from "lucide-react";
import { TabType, FreezeDiagnosticReport } from "../types";
import { cn } from "../utils/cn";
import { useT } from "../i18n";
import { useDiagnosticsStore } from "../store/diagnosticsStore";

interface NavigationProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  freezeData: FreezeDiagnosticReport | null;
}

interface NavItem {
  id: TabType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  activeClass: string;
  focusClass: string;
  badge?: React.ReactNode;
}

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  setActiveTab,
  freezeData,
}) => {
  const t = useT();
  const storageCritical = useDiagnosticsStore((s) => (s.storageReport?.critical_count ?? 0) > 0);
  const isHighFreezeRisk = freezeData?.system_freeze_risk === "Hoog";

  const navItems: NavItem[] = [
    {
      id: "overview",
      label: t("nav.overview"),
      icon: Layers,
      activeClass: "border-cyan-400 text-cyan-400 font-semibold",
      focusClass: "focus-visible:outline-cyan-400",
    },
    {
      id: "live",
      label: t("nav.live"),
      icon: Activity,
      activeClass: "border-emerald-400 text-emerald-400 font-semibold",
      focusClass: "focus-visible:outline-emerald-400",
    },
    {
      id: "processes",
      label: t("nav.processes"),
      icon: ListTree,
      activeClass: "border-sky-400 text-sky-400 font-semibold",
      focusClass: "focus-visible:outline-sky-400",
    },
    {
      id: "freeze",
      label: t("nav.freeze"),
      icon: ShieldAlert,
      activeClass: "border-rose-400 text-rose-400 font-semibold",
      focusClass: "focus-visible:outline-rose-400",
      badge: isHighFreezeRisk ? (
        <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
      ) : undefined,
    },
    {
      id: "latency",
      label: t("nav.latency"),
      icon: Timer,
      activeClass: "border-orange-400 text-orange-400 font-semibold",
      focusClass: "focus-visible:outline-orange-400",
    },
    {
      id: "drivers",
      label: t("nav.drivers"),
      icon: Puzzle,
      activeClass: "border-indigo-400 text-indigo-400 font-semibold",
      focusClass: "focus-visible:outline-indigo-400",
    },
    {
      id: "storage",
      label: t("nav.storage"),
      icon: Database,
      activeClass: "border-lime-400 text-lime-400 font-semibold",
      focusClass: "focus-visible:outline-lime-400",
      badge: storageCritical ? <span className="w-2 h-2 rounded-full bg-rose-500" /> : undefined,
    },
    {
      id: "history",
      label: t("nav.history"),
      icon: History,
      activeClass: "border-slate-200 text-slate-200 font-semibold",
      focusClass: "focus-visible:outline-slate-200",
    },
    {
      id: "power",
      label: t("nav.power"),
      icon: BatteryCharging,
      activeClass: "border-amber-400 text-amber-400 font-semibold",
      focusClass: "focus-visible:outline-amber-400",
    },
    {
      id: "cooling",
      label: t("nav.cooling"),
      icon: Fan,
      activeClass: "border-blue-400 text-blue-400 font-semibold",
      focusClass: "focus-visible:outline-blue-400",
    },
    {
      id: "cpu",
      label: t("nav.cpu"),
      icon: Cpu,
      activeClass: "border-cyan-400 text-cyan-400 font-semibold",
      focusClass: "focus-visible:outline-cyan-400",
    },
    {
      id: "ram",
      label: t("nav.ram"),
      icon: Zap,
      activeClass: "border-purple-400 text-purple-400 font-semibold",
      focusClass: "focus-visible:outline-purple-400",
    },
    {
      id: "disk",
      label: t("nav.disk"),
      icon: HardDrive,
      activeClass: "border-cyan-400 text-cyan-400 font-semibold",
      focusClass: "focus-visible:outline-cyan-400",
    },
    {
      id: "gpu",
      label: t("nav.gpu"),
      icon: Gpu,
      activeClass: "border-fuchsia-400 text-fuchsia-400 font-semibold",
      focusClass: "focus-visible:outline-fuchsia-400",
    },
    {
      id: "burnin",
      label: t("nav.burnin"),
      icon: Flame,
      activeClass: "border-red-400 text-red-400 font-semibold",
      focusClass: "focus-visible:outline-red-400",
    },
    {
      id: "keyboard",
      label: t("nav.keyboard"),
      icon: Keyboard,
      activeClass: "border-emerald-400 text-emerald-400 font-semibold",
      focusClass: "focus-visible:outline-emerald-400",
    },
    {
      id: "screen",
      label: t("nav.screen"),
      icon: Monitor,
      activeClass: "border-teal-400 text-teal-400 font-semibold",
      focusClass: "focus-visible:outline-teal-400",
    },
    {
      id: "touchpad",
      label: t("nav.touchpad"),
      icon: MousePointer,
      activeClass: "border-violet-400 text-violet-400 font-semibold",
      focusClass: "focus-visible:outline-violet-400",
    },
    {
      id: "audio",
      label: t("nav.audio"),
      icon: Volume2,
      activeClass: "border-pink-400 text-pink-400 font-semibold",
      focusClass: "focus-visible:outline-pink-400",
    },
    {
      id: "camera",
      label: t("nav.camera"),
      icon: Camera,
      activeClass: "border-rose-400 text-rose-400 font-semibold",
      focusClass: "focus-visible:outline-rose-400",
    },
    {
      id: "network",
      label: t("nav.network"),
      icon: Wifi,
      activeClass: "border-blue-400 text-blue-400 font-semibold",
      focusClass: "focus-visible:outline-blue-400",
    },
  ];

  return (
    <nav className="border-b border-slate-800/60 bg-slate-900/40 px-6 flex items-center gap-2 overflow-x-auto print:hidden">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = activeTab === item.id;

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => setActiveTab(item.id)}
            className={cn(
              "py-3 px-3.5 text-sm font-medium border-b-2 flex items-center gap-2 transition-all shrink-0 cursor-pointer",
              "focus-visible:outline-2 focus-visible:outline-offset-2",
              isActive
                ? cn(item.activeClass, item.focusClass)
                : "border-transparent text-slate-400 hover:text-slate-200 focus-visible:outline-slate-400"
            )}
          >
            <Icon className={cn("w-4 h-4", isActive ? "text-current" : "text-slate-400")} />
            {item.label}
            {item.badge}
          </button>
        );
      })}
    </nav>
  );
};
