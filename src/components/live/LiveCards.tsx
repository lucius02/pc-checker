import React from "react";
import { SERIES_COLORS } from "./chartUtils";

export interface StatTileProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: React.ReactNode;
}

export const StatTile: React.FC<StatTileProps> = ({ icon, label, value, sub }) => (
  <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl">
    <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
      {icon}
      {label}
    </div>
    <div className="mt-2 text-xl font-bold text-white">{value}</div>
    {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
  </div>
);

export interface LegendItem {
  label: string;
  value: string;
}

export interface ChartCardProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  current?: string;
  legend?: LegendItem[];
  children: React.ReactNode;
}

export const ChartCard: React.FC<ChartCardProps> = ({ icon, title, subtitle, current, legend, children }) => (
  <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-3 min-w-0">
    <div className="flex items-start justify-between gap-3">
      <div>
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          {icon}
          {title}
        </h3>
        <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
      </div>
      {current && <span className="text-lg font-bold text-slate-100 whitespace-nowrap">{current}</span>}
    </div>
    {legend && (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        {legend.map((item, i) => (
          <span key={item.label} className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 rounded" style={{ backgroundColor: SERIES_COLORS[i] }} />
            <span className="text-slate-400">{item.label}</span>
            <span className="font-semibold text-slate-100" style={{ fontVariantNumeric: "tabular-nums" }}>
              {item.value}
            </span>
          </span>
        ))}
      </div>
    )}
    {children}
  </div>
);
