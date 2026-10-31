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
} from "lucide-react";
import { TabType, FreezeDiagnosticReport } from "../types";
import { cn } from "../utils/cn";

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
  const isHighFreezeRisk = freezeData?.system_freeze_risk === "Hoog";

  const navItems: NavItem[] = [
    {
      id: "overview",
      label: "Systeem Overzicht",
      icon: Layers,
      activeClass: "border-cyan-400 text-cyan-400 font-semibold",
      focusClass: "focus-visible:outline-cyan-400",
    },
    {
      id: "live",
      label: "Live Monitor",
      icon: Activity,
      activeClass: "border-emerald-400 text-emerald-400 font-semibold",
      focusClass: "focus-visible:outline-emerald-400",
    },
    {
      id: "processes",
      label: "Processen",
      icon: ListTree,
      activeClass: "border-sky-400 text-sky-400 font-semibold",
      focusClass: "focus-visible:outline-sky-400",
    },
    {
      id: "freeze",
      label: "Freeze Detective",
      icon: ShieldAlert,
      activeClass: "border-rose-400 text-rose-400 font-semibold",
      focusClass: "focus-visible:outline-rose-400",
      badge: isHighFreezeRisk ? (
        <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
      ) : undefined,
    },
    {
      id: "latency",
      label: "DPC Latency",
      icon: Timer,
      activeClass: "border-orange-400 text-orange-400 font-semibold",
      focusClass: "focus-visible:outline-orange-400",
    },
    {
      id: "drivers",
      label: "Drivers",
      icon: Puzzle,
      activeClass: "border-indigo-400 text-indigo-400 font-semibold",
      focusClass: "focus-visible:outline-indigo-400",
    },
    {
      id: "power",
      label: "Stroom & Batterij",
      icon: BatteryCharging,
      activeClass: "border-amber-400 text-amber-400 font-semibold",
      focusClass: "focus-visible:outline-amber-400",
    },
    {
      id: "cooling",
      label: "Koeling & Fans",
      icon: Fan,
      activeClass: "border-blue-400 text-blue-400 font-semibold",
      focusClass: "focus-visible:outline-blue-400",
    },
    {
      id: "cpu",
      label: "CPU Stresstest",
      icon: Cpu,
      activeClass: "border-cyan-400 text-cyan-400 font-semibold",
      focusClass: "focus-visible:outline-cyan-400",
    },
    {
      id: "ram",
      label: "RAM Geheugencheck",
      icon: Zap,
      activeClass: "border-purple-400 text-purple-400 font-semibold",
      focusClass: "focus-visible:outline-purple-400",
    },
    {
      id: "disk",
      label: "Schijf Benchmark",
      icon: HardDrive,
      activeClass: "border-cyan-400 text-cyan-400 font-semibold",
      focusClass: "focus-visible:outline-cyan-400",
    },
    {
      id: "keyboard",
      label: "Toetsenbord",
      icon: Keyboard,
      activeClass: "border-emerald-400 text-emerald-400 font-semibold",
      focusClass: "focus-visible:outline-emerald-400",
    },
    {
      id: "screen",
      label: "Beeldscherm",
      icon: Monitor,
      activeClass: "border-teal-400 text-teal-400 font-semibold",
      focusClass: "focus-visible:outline-teal-400",
    },
    {
      id: "touchpad",
      label: "Touchpad & Muis",
      icon: MousePointer,
      activeClass: "border-violet-400 text-violet-400 font-semibold",
      focusClass: "focus-visible:outline-violet-400",
    },
  ];

  return (
    <nav className="border-b border-slate-800/60 bg-slate-900/40 px-6 flex items-center gap-2 overflow-x-auto">
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
