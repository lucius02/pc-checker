import React from "react";
import {
  ShieldAlert,
  BatteryCharging,
  Fan,
  Cpu,
  Zap,
  HardDrive,
  Timer,
  Puzzle,
  Keyboard,
  Monitor,
  MousePointer,
  Volume2,
  Camera,
  Wifi,
  Database,
  Gpu,
  Flame,
  ChevronRight,
  Loader2,
  Play,
  type LucideIcon,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import type { TabType } from "../../../types";
import { useT, type MessageKey } from "../../../i18n";
import { useDiagnosticsStore } from "../../../store/diagnosticsStore";
import { buildOverviewBlocks, type BlockGroup, type BlockStatus, type OverviewBlock } from "../../../lib/overviewBlocks";
import { BUSY_FOR_TAB, anyTestRunning, quickActionFor } from "../../../lib/tabActions";
import { cn } from "../../../utils/cn";

const ICONS: Partial<Record<TabType, LucideIcon>> = {
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

const STATUS_STYLE: Record<BlockStatus, { badge: string; icon: string; bar: string; edge: string }> = {
  untested: {
    badge: "bg-slate-800 border-slate-700 text-slate-400",
    icon: "bg-slate-800/80 border-slate-700 text-slate-400",
    bar: "bg-slate-500",
    edge: "hover:border-slate-600",
  },
  good: {
    badge: "bg-emerald-950 border-emerald-800 text-emerald-400",
    icon: "bg-emerald-950 border-emerald-800/80 text-emerald-400",
    bar: "bg-emerald-400",
    edge: "hover:border-emerald-800",
  },
  partial: {
    badge: "bg-indigo-950 border-indigo-800 text-indigo-300",
    icon: "bg-indigo-950 border-indigo-800/80 text-indigo-400",
    bar: "bg-indigo-400",
    edge: "hover:border-indigo-800",
  },
  live: {
    badge: "bg-cyan-950 border-cyan-800 text-cyan-300",
    icon: "bg-cyan-950 border-cyan-800/80 text-cyan-400",
    bar: "bg-cyan-400",
    edge: "hover:border-cyan-800",
  },
  warn: {
    badge: "bg-amber-950 border-amber-800 text-amber-300",
    icon: "bg-amber-950 border-amber-800/80 text-amber-400",
    bar: "bg-amber-400",
    edge: "border-amber-900/70 hover:border-amber-700",
  },
  bad: {
    badge: "bg-rose-950 border-rose-800 text-rose-300",
    icon: "bg-rose-950 border-rose-800/80 text-rose-400",
    bar: "bg-rose-500",
    edge: "border-rose-900/70 hover:border-rose-700",
  },
};

const GROUPS: BlockGroup[] = ["health", "stress", "devices"];

const TestBlock: React.FC<{ block: OverviewBlock; onOpen: (tab: TabType) => void }> = ({ block, onOpen }) => {
  const t = useT();
  const Icon = ICONS[block.id] ?? ShieldAlert;
  const style = STATUS_STYLE[block.status];
  const title = t(`nav.${block.id}` as MessageKey);
  const powerData = useDiagnosticsStore((s) => s.powerData);
  const action = quickActionFor(block.id, { powerData });
  const running = useDiagnosticsStore((s) => (BUSY_FOR_TAB[block.id] ?? []).some((k) => s.busy[k]));
  // Zware tests tegelijk draaien vertekent de uitkomsten: één tegelijk.
  const blocked = useDiagnosticsStore(anyTestRunning);
  const actionName = action ? t(action.label) : "";

  return (
    <div
      className={cn(
        "group relative p-4 bg-slate-900/70 border border-slate-800 rounded-2xl flex flex-col gap-3 transition-all duration-200",
        "hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/30",
        running ? "border-cyan-800/80" : style.edge,
      )}
    >
      <div className="flex items-center justify-between gap-2 w-full">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={cn("p-2 rounded-xl border shrink-0", style.icon)}>
            <Icon className="w-4 h-4" />
          </span>
          {/* De knop beslaat via ::after de hele kaart; de startknop ligt daar bovenop. */}
          <button
            type="button"
            onClick={() => onOpen(block.id)}
            aria-label={`${title}: ${t(`blk.status.${block.status}`)}. ${t("blk.open")}`}
            className={cn(
              "font-semibold text-sm text-slate-200 truncate text-left cursor-pointer outline-none",
              "after:absolute after:inset-0 after:rounded-2xl",
              "focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-cyan-400",
            )}
          >
            {title}
          </button>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {block.metric && <span className="text-lg font-bold font-mono text-slate-100">{block.metric}</span>}
          {action ? (
            <button
              type="button"
              onClick={() => void action.run(useDiagnosticsStore.getState())}
              disabled={blocked}
              title={
                running
                  ? t("blk.running", { name: actionName })
                  : blocked
                    ? t("pal.busy")
                    : t("act.start", { name: actionName })
              }
              aria-label={running ? t("blk.running", { name: actionName }) : t("act.start", { name: actionName })}
              className={cn(
                "relative z-10 w-7 h-7 rounded-full border flex items-center justify-center transition-colors cursor-pointer",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400",
                running
                  ? "border-cyan-700 bg-cyan-950 text-cyan-300"
                  : "border-slate-700 bg-slate-800/80 text-slate-300 hover:bg-cyan-500 hover:border-cyan-400 hover:text-slate-950",
                blocked && !running && "opacity-40 cursor-not-allowed hover:bg-slate-800/80 hover:border-slate-700 hover:text-slate-300",
                blocked && running && "cursor-default",
              )}
            >
              {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3 h-3 fill-current ml-0.5" />}
            </button>
          ) : (
            !block.metric && (
              <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-400 group-hover:translate-x-0.5 transition-all" />
            )
          )}
        </div>
      </div>

      {block.bar !== undefined && (
        <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden" aria-hidden>
          <div
            className={cn("h-1.5 rounded-full transition-all duration-500", style.bar)}
            style={{ width: `${Math.max(2, Math.min(100, block.bar))}%` }}
          />
        </div>
      )}

      <div className="flex items-end justify-between gap-2 w-full mt-auto">
        <p className={cn("text-xs leading-snug", block.status === "untested" && !running ? "text-slate-500" : "text-slate-300")}>
          {running ? t("blk.running", { name: actionName }) : t(block.detail.key, block.detail.vars)}
        </p>
        <span
          className={cn(
            "text-[11px] px-2 py-0.5 rounded-md border font-semibold shrink-0 whitespace-nowrap",
            running ? "bg-cyan-950 border-cyan-800 text-cyan-300 animate-pulse" : style.badge,
          )}
        >
          {running ? t("blk.status.running") : t(`blk.status.${block.status}`)}
        </span>
      </div>
    </div>
  );
};

/** Eén blok per testtabblad, gegroepeerd, met status en een klik naar het tabblad. */
export const OverviewCardsGrid: React.FC<{ setActiveTab: (tab: TabType) => void }> = ({ setActiveTab }) => {
  const t = useT();
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
  const blocks = buildOverviewBlocks(slice);
  const done = blocks.filter((b) => b.status !== "untested").length;

  return (
    <section className="space-y-5" aria-labelledby="all-tests-title">
      <div className="flex items-baseline justify-between gap-2">
        <h3 id="all-tests-title" className="text-sm font-bold text-white uppercase tracking-wider">
          {t("blk.title")}
        </h3>
        <span className="text-xs text-slate-400">{t("blk.summary", { done, n: blocks.length })}</span>
      </div>
      {GROUPS.map((g) => (
        <div key={g} className="space-y-2.5">
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{t(`blk.group.${g}`)}</h4>
          <div className="stagger grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {blocks
              .filter((b) => b.group === g)
              .map((b) => (
                <TestBlock key={b.id} block={b} onOpen={setActiveTab} />
              ))}
          </div>
        </div>
      ))}
    </section>
  );
};
