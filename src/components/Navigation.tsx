import React from "react";
import {
  Layers,
  ShieldAlert,
  BatteryCharging,
  Fan,
  Cpu,
  Zap,
  HardDrive,
} from "lucide-react";
import { TabType, FreezeDiagnosticReport } from "../types";

interface NavigationProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  freezeData: FreezeDiagnosticReport | null;
}

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  setActiveTab,
  freezeData,
}) => {
  return (
    <nav className="border-b border-slate-800/60 bg-slate-900/40 px-6 flex items-center gap-2 overflow-x-auto">
      <button
        onClick={() => setActiveTab("overview")}
        className={`py-3 px-3.5 text-sm font-medium border-b-2 flex items-center gap-2 transition-all shrink-0 cursor-pointer ${
          activeTab === "overview"
            ? "border-cyan-400 text-cyan-400 font-semibold"
            : "border-transparent text-slate-400 hover:text-slate-200"
        }`}
      >
        <Layers className="w-4 h-4" />
        Systeem Overzicht
      </button>

      <button
        onClick={() => setActiveTab("freeze")}
        className={`py-3 px-3.5 text-sm font-medium border-b-2 flex items-center gap-2 transition-all shrink-0 cursor-pointer ${
          activeTab === "freeze"
            ? "border-rose-400 text-rose-400 font-semibold"
            : "border-transparent text-slate-400 hover:text-slate-200"
        }`}
      >
        <ShieldAlert className="w-4 h-4 text-rose-400" />
        Freeze Detective (5s Freeze)
        {freezeData && freezeData.system_freeze_risk === "Hoog" && (
          <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
        )}
      </button>

      <button
        onClick={() => setActiveTab("power")}
        className={`py-3 px-3.5 text-sm font-medium border-b-2 flex items-center gap-2 transition-all shrink-0 cursor-pointer ${
          activeTab === "power"
            ? "border-amber-400 text-amber-400 font-semibold"
            : "border-transparent text-slate-400 hover:text-slate-200"
        }`}
      >
        <BatteryCharging className="w-4 h-4" />
        Stroom &amp; Batterij
      </button>

      <button
        onClick={() => setActiveTab("cooling")}
        className={`py-3 px-3.5 text-sm font-medium border-b-2 flex items-center gap-2 transition-all shrink-0 cursor-pointer ${
          activeTab === "cooling"
            ? "border-blue-400 text-blue-400 font-semibold"
            : "border-transparent text-slate-400 hover:text-slate-200"
        }`}
      >
        <Fan className="w-4 h-4" />
        Koeling &amp; Fans
      </button>

      <button
        onClick={() => setActiveTab("cpu")}
        className={`py-3 px-3.5 text-sm font-medium border-b-2 flex items-center gap-2 transition-all shrink-0 cursor-pointer ${
          activeTab === "cpu"
            ? "border-cyan-400 text-cyan-400 font-semibold"
            : "border-transparent text-slate-400 hover:text-slate-200"
        }`}
      >
        <Cpu className="w-4 h-4" />
        CPU Stresstest
      </button>

      <button
        onClick={() => setActiveTab("ram")}
        className={`py-3 px-3.5 text-sm font-medium border-b-2 flex items-center gap-2 transition-all shrink-0 cursor-pointer ${
          activeTab === "ram"
            ? "border-purple-400 text-purple-400 font-semibold"
            : "border-transparent text-slate-400 hover:text-slate-200"
        }`}
      >
        <Zap className="w-4 h-4" />
        RAM Geheugencheck
      </button>

      <button
        onClick={() => setActiveTab("disk")}
        className={`py-3 px-3.5 text-sm font-medium border-b-2 flex items-center gap-2 transition-all shrink-0 cursor-pointer ${
          activeTab === "disk"
            ? "border-cyan-400 text-cyan-400 font-semibold"
            : "border-transparent text-slate-400 hover:text-slate-200"
        }`}
      >
        <HardDrive className="w-4 h-4" />
        Schijf Benchmark
      </button>
    </nav>
  );
};
