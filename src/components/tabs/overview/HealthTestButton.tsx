import React from "react";
import { PlayCircle, RotateCcw, Square, Loader2 } from "lucide-react";
import { useT } from "../../../i18n";
import { useShallow } from "zustand/react/shallow";
import { useDiagnosticsStore } from "../../../store/diagnosticsStore";
import { planHealthTests } from "../../../lib/healthTests";
import { cn } from "../../../utils/cn";

/**
 * Knop bij de gezondheidsscore: test alle onderdelen die nog niet getest zijn, of alles opnieuw
 * als alles al getest is. Toont tijdens het testen de voortgang en een stopknop.
 */
export const HealthTestButton: React.FC = () => {
  const t = useT();
  const run = useDiagnosticsStore((s) => s.healthRun);
  const start = useDiagnosticsStore((s) => s.runHealthTests);
  const stop = useDiagnosticsStore((s) => s.stopHealthTests);
  // Alleen de velden die het plan bepalen, ondiep vergeleken (geen nieuw object per render).
  const slice = useDiagnosticsStore(
    useShallow((s) => ({
      freezeData: s.freezeData,
      driverReport: s.driverReport,
      storageReport: s.storageReport,
      batteryReport: s.batteryReport,
      latencyResult: s.latencyResult,
      diskResult: s.diskResult,
      ramResult: s.ramResult,
      cpuResult: s.cpuResult,
      powerData: s.powerData,
    })),
  );
  const plan = planHealthTests(slice);
  // Een losse test die al loopt (bijv. vanuit een tabblad): niet tegelijk starten.
  const otherBusy = useDiagnosticsStore((s) => !s.healthRun && Object.values(s.busy).some(Boolean));

  if (run) {
    const step = run.steps[run.index];
    const pct = Math.round((run.index / run.steps.length) * 100);
    return (
      <div className="flex items-center gap-3 min-w-0" role="status" aria-live="polite">
        <div className="min-w-0 text-right">
          <div className="text-xs text-slate-200 flex items-center justify-end gap-1.5">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
            <span className="truncate">
              {run.stopping
                ? t("hs.testStopping")
                : t("hs.testProgress", { i: run.index + 1, n: run.steps.length, name: step ? t(step.label) : "" })}
            </span>
          </div>
          <div className="mt-1 h-1 w-48 max-w-full ml-auto rounded-full bg-slate-800 overflow-hidden">
            <div className="h-full bg-cyan-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <button
          type="button"
          onClick={stop}
          disabled={run.stopping}
          className="px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-medium flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
          title={t("hs.testStopTitle")}
        >
          <Square className="w-3 h-3" /> {t("hs.testStop")}
        </button>
      </div>
    );
  }

  const all = plan.mode === "all";
  const Icon = all ? RotateCcw : PlayCircle;
  return (
    <button
      type="button"
      onClick={() => void start()}
      disabled={otherBusy}
      title={all ? t("hs.testAllTitle") : t("hs.testUntestedTitle", { list: plan.steps.map((s) => t(s.label)).join(", ") })}
      className={cn(
        "px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300",
        all
          ? "border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200"
          : "bg-cyan-600 hover:bg-cyan-500 text-slate-950 shadow-md shadow-cyan-600/20",
      )}
    >
      <Icon className="w-3.5 h-3.5" />
      {all ? t("hs.testAll") : t("hs.testUntested", { n: plan.steps.length })}
    </button>
  );
};
