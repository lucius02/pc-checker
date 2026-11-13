import React, { useEffect, useMemo, useRef, useState } from "react";
import { api, errorMessage } from "../../../lib/api";
import { useDiagnosticsStore } from "../../../store/diagnosticsStore";
import {
  HeartPulse,
  Thermometer,
  Activity,
  Puzzle,
  Timer,
  HardDrive,
  MemoryStick,
  BatteryMedium,
  Cpu,
  CircleCheck,
  TriangleAlert,
  CircleX,
  CircleDashed,
  ChevronRight,
  Info,
  LucideIcon,
} from "lucide-react";
import {
  SystemOverview,
  CoolingOverview,
  FreezeDiagnosticReport,
  BatteryHealthReport,
  StressTestResult,
  DriverReport,
  LatencyTestResult,
  HealthScore,
  HealthCategoryScore,
  TabType,
} from "../../../types";
import { buildHealthInputs } from "../../../utils/healthInputs";
import { cn } from "../../../utils/cn";
import { useI18nStore, useT } from "../../../i18n";
import { useStatusLabel } from "../../../i18n/status";
import { HealthTestButton } from "./HealthTestButton";

export interface HealthScoreCardProps {
  data: SystemOverview;
  coolingData: CoolingOverview | null;
  freezeData: FreezeDiagnosticReport | null;
  batteryReport: BatteryHealthReport | null;
  driverReport: DriverReport | null;
  latencyResult: LatencyTestResult | null;
  cpuResult: StressTestResult | null;
  ramResult: StressTestResult | null;
  diskResult: StressTestResult | null;
  setActiveTab: (tab: TabType) => void;
}

// Vaste statuskleuren (dataviz status-palet); nooit zonder icoon + label gebruikt.
const STATUS_COLOR = {
  good: "#0ca30c",
  warning: "#fab219",
  critical: "#d03b3b",
} as const;

type StatusTone = keyof typeof STATUS_COLOR | "none";

interface StatusStyle {
  tone: StatusTone;
  icon: LucideIcon;
  badge: string;
}

const STATUS_STYLES: Record<string, StatusStyle> = {
  Goed: {
    tone: "good",
    icon: CircleCheck,
    badge: "bg-emerald-950/60 border-emerald-800/70 text-emerald-300",
  },
  "Let op": {
    tone: "warning",
    icon: TriangleAlert,
    badge: "bg-amber-950/60 border-amber-800/70 text-amber-300",
  },
  Kritiek: {
    tone: "critical",
    icon: CircleX,
    badge: "bg-red-950/60 border-red-800/70 text-red-300",
  },
  "Niet getest": {
    tone: "none",
    icon: CircleDashed,
    badge: "bg-slate-800/60 border-slate-700 text-slate-400",
  },
};

const statusStyle = (status: string): StatusStyle =>
  STATUS_STYLES[status] ?? STATUS_STYLES["Niet getest"];

const CATEGORY_META: Record<string, { icon: LucideIcon; tab: TabType }> = {
  thermal: { icon: Thermometer, tab: "cooling" },
  stability: { icon: Activity, tab: "freeze" },
  drivers: { icon: Puzzle, tab: "drivers" },
  latency: { icon: Timer, tab: "latency" },
  storage: { icon: HardDrive, tab: "disk" },
  memory: { icon: MemoryStick, tab: "ram" },
  battery: { icon: BatteryMedium, tab: "power" },
  cpu: { icon: Cpu, tab: "cpu" },
};

const gradeTone = (grade: string): keyof typeof STATUS_COLOR => {
  if (grade === "A" || grade === "B") return "good";
  if (grade === "C" || grade === "D") return "warning";
  return "critical";
};

/** Telt vloeiend naar een nieuwe waarde toe, zodat een gewijzigde score opvalt. */
function useCountUp(target: number, durationMs = 600): number {
  const [value, setValue] = useState(target);
  const shown = useRef(target);
  useEffect(() => {
    const from = shown.current;
    if (from === target) return;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / durationMs);
      // ease-out: snel beginnen, rustig uitkomen
      shown.current = Math.round(from + (target - from) * (1 - Math.pow(1 - p, 3)));
      setValue(shown.current);
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs]);
  return value;
}

/** Ringmeter: gevulde boog draagt de ernst, de baan is dezelfde kleur, lichter. */
const ScoreRing: React.FC<{ score: number; grade: string }> = ({ score, grade }) => {
  const t = useT();
  const size = 132;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const color = STATUS_COLOR[gradeTone(grade)];
  const shownScore = useCountUp(score);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="block"
        role="img"
        aria-label={t("hs.aria", { s: score, g: grade })}
      >
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeOpacity={0.18} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dasharray 600ms ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-5xl font-bold text-white leading-none tabular-nums">{shownScore}</span>
        <span className="text-xs text-slate-400 mt-1">{t("hs.of100")}</span>
      </div>
    </div>
  );
};

const CategoryRow: React.FC<{
  cat: HealthCategoryScore;
  onOpen: (tab: TabType) => void;
}> = ({ cat, onOpen }) => {
  const t = useT();
  const status = useStatusLabel();
  const meta = CATEGORY_META[cat.key];
  const st = statusStyle(cat.status);
  const Icon = meta?.icon ?? Info;
  const StatusIcon = st.icon;
  const untested = st.tone === "none";
  const color = untested ? null : STATUS_COLOR[st.tone as keyof typeof STATUS_COLOR];

  return (
    <button
      type="button"
      onClick={() => meta && onOpen(meta.tab)}
      title={t("hs.rowTitle", { label: cat.label, detail: cat.detail, score: untested ? "" : t("hs.rowScore", { s: cat.score }) })}
      className="group w-full text-left px-3 py-2 rounded-xl bg-slate-950/60 border border-slate-800/80 hover:border-slate-600 hover:bg-slate-950 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
    >
      <div className="flex items-center gap-2">
        <Icon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <span className="text-xs font-medium text-slate-200 truncate flex-1">{cat.label}</span>
        <span className="text-xs font-semibold text-slate-200 w-7 text-right tabular-nums">
          {untested ? "—" : cat.score}
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-xs font-medium whitespace-nowrap",
            st.badge
          )}
        >
          <StatusIcon className="w-3 h-3" />
          {status(cat.status)}
        </span>
        <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-300 group-hover:translate-x-0.5 transition-all shrink-0" />
      </div>
      <div
        className="mt-1.5 h-1.5 w-full rounded-full overflow-hidden"
        style={{ backgroundColor: color ? `${color}2e` : "rgb(30 41 59)" }}
      >
        {color && (
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${cat.score}%`, backgroundColor: color }}
          />
        )}
      </div>
      <p className="mt-1 text-xs text-slate-400 truncate">{cat.detail}</p>
    </button>
  );
};

export const HealthScoreCard: React.FC<HealthScoreCardProps> = ({
  data,
  coolingData,
  freezeData,
  batteryReport,
  driverReport,
  latencyResult,
  cpuResult,
  ramResult,
  diskResult,
  setActiveTab,
}) => {
  const t = useT();
  const status = useStatusLabel();
  const lang = useI18nStore((s) => s.lang);
  const storageReport = useDiagnosticsStore((s) => s.storageReport);
  const setHealthScore = useDiagnosticsStore((s) => s.setHealthScore);
  // `data` ververst elke 3 s; buildHealthInputs rondt live waarden af zodat deze
  // sleutel alleen verandert als de invoer echt verschuift.
  const inputsKey = useMemo(
    () =>
      JSON.stringify(
        buildHealthInputs({
          data,
          coolingData,
          freezeData,
          batteryReport,
          driverReport,
          latencyResult,
          cpuResult,
          ramResult,
          diskResult,
          storageReport,
        })
      ),
    [data, coolingData, freezeData, batteryReport, driverReport, latencyResult, cpuResult, ramResult, diskResult, storageReport]
  );

  const [health, setHealth] = useState<HealthScore | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .computeHealthScore(JSON.parse(inputsKey))
      .then((res) => {
        if (cancelled) return;
        setHealth(res);
        setHealthScore(res);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [inputsKey, setHealthScore, lang]);

  if (!health) {
    return (
      <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-2xl flex items-center gap-3 text-xs text-slate-400">
        <HeartPulse className="w-4 h-4 text-cyan-400" />
        {error ? t("hs.failed", { e: error }) : t("hs.computing")}
      </div>
    );
  }

  const untested = health.categories.filter((c) => c.status === "Niet getest");
  // De "Nog niet getest: ..."-zin staat hieronder al als klikbare rij.
  const issues = untested.length > 0
    ? health.top_issues.filter((s) => !s.startsWith("Nog niet getest") && !s.startsWith("Not yet tested"))
    : health.top_issues;
  const tone = gradeTone(health.grade);
  const gradeStyle = statusStyle(tone === "good" ? "Goed" : tone === "warning" ? "Let op" : "Kritiek");
  const GradeIcon = gradeStyle.icon;

  return (
    <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <HeartPulse className="w-4 h-4 text-cyan-400" />
          <span>{t("hs.title")}</span>
          {error && (
            <span className="text-xs font-normal text-amber-300 truncate" title={error}>
              {t("hs.lastFailed")}
            </span>
          )}
        </div>
        <HealthTestButton />
      </div>

      <div className="flex flex-col lg:flex-row gap-5">
        {/* Totaalscore */}
        <div className="flex items-center gap-4 lg:w-72 shrink-0">
          <ScoreRing score={health.score} grade={health.grade} />
          <div className="space-y-2 min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="text-xs text-slate-400">{t("hs.grade")}</span>
              <span className="text-3xl font-bold text-white leading-none">{health.grade}</span>
            </div>
            <span
              className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-medium",
                gradeStyle.badge
              )}
            >
              <GradeIcon className="w-3.5 h-3.5" />
              {status(health.label)}
            </span>
            <p className="text-xs text-slate-400 leading-snug">
              {t("hs.basedOn", { n: health.categories.length - untested.length, m: health.categories.length })}
            </p>
          </div>
        </div>

        {/* Categorieën */}
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2 min-w-0">
          {health.categories.map((cat) => (
            <CategoryRow key={cat.key} cat={cat} onOpen={setActiveTab} />
          ))}
        </div>
      </div>

      {issues.length > 0 && (
        <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80 space-y-1.5">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            {t("hs.issues")}
          </div>
          <ol className="space-y-1">
            {issues.map((issue, idx) => (
              <li key={idx} className="flex gap-2 text-xs text-slate-300 leading-snug">
                <span className="text-slate-500 font-mono shrink-0">{idx + 1}.</span>
                <span>{issue}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {untested.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
          <Info className="w-3.5 h-3.5 shrink-0" />
          <span>{t("hs.untested")}</span>
          {untested.map((c) => {
            const meta = CATEGORY_META[c.key];
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => meta && setActiveTab(meta.tab)}
                className="px-2 py-0.5 rounded-md bg-slate-800/60 border border-slate-700 text-slate-300 hover:border-cyan-700 hover:text-cyan-300 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
              >
                {c.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
