import React, { useEffect, useState } from "react";
import { useT } from "../i18n";
import { cn } from "../utils/cn";

const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * Voortgangsbalk voor een test met een vaste duur: hoeveel procent, en hoeveel tijd er nog over
 * is. Na afloop (de app verwerkt dan nog de resultaten) toont hij "Resultaten verwerken…".
 */
export const TimedProgress: React.FC<{
  startedAt: number;
  durationMs: number;
  /** Tailwind-kleur van de balk, bijv. "bg-orange-400". */
  barClass?: string;
  className?: string;
}> = ({ startedAt, durationMs, barClass = "bg-cyan-400", className }) => {
  const t = useT();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);
  const elapsed = Math.max(0, now - startedAt);
  const pct = Math.min(100, (elapsed / Math.max(1, durationMs)) * 100);
  const finishing = elapsed >= durationMs;
  return (
    <div className={cn("space-y-1.5", className)}>
      <div
        className="w-full h-2 bg-slate-800 rounded-full overflow-hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        aria-label={t("progress.label")}
      >
        <div className={cn("h-2 rounded-full transition-[width] duration-300", barClass, finishing && "animate-pulse")} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between text-xs text-slate-400">
        <span>{finishing ? t("progress.finishing") : t("progress.remaining", { t: mmss(durationMs - elapsed) })}</span>
        <span className="font-mono">{Math.round(pct)}%</span>
      </div>
    </div>
  );
};
