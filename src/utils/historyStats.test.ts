import { describe, expect, it } from "vitest";
import { scorePolyline, summarizeFreezes } from "./historyStats";
import { gpuVerdict } from "../lib/gpuStress";

const DAY = 86_400_000;

describe("summarizeFreezes", () => {
  it("counts windows, longest freeze and per-day buckets", () => {
    const now = new Date(2026, 10, 5, 15, 0).getTime();
    const f = (msAgo: number, duration = 1500) => ({ at_epoch_ms: now - msAgo, duration_ms: duration, timestamp: "" });
    const s = summarizeFreezes([f(60_000), f(2 * 3600_000, 4200), f(3 * DAY), f(20 * DAY), f(40 * DAY)], now, 14);
    expect(s.total).toBe(5);
    expect(s.last7d).toBe(3);
    expect(s.last30d).toBe(4);
    expect(s.longestMs).toBe(4200);
    expect(s.perDay).toHaveLength(14);
    expect(s.perDay[13]).toBe(2); // vandaag
    expect(s.perDay[10]).toBe(1); // 3 dagen geleden
    expect(s.perDay.reduce((a, b) => a + b, 0)).toBe(3);
  });

  it("handles empty history", () => {
    const s = summarizeFreezes([], Date.now());
    expect(s.total).toBe(0);
    expect(s.longestMs).toBe(0);
  });
});

describe("scorePolyline", () => {
  it("maps score 100 to the top and spans the width", () => {
    const pts = scorePolyline(
      [
        { at_epoch_ms: 0, score: 100, grade: "A", top_issue: null },
        { at_epoch_ms: 10, score: 0, grade: "F", top_issue: null },
      ],
      200,
      100,
    );
    expect(pts).toBe("0.0,0.0 200.0,100.0");
    expect(scorePolyline([], 10, 10)).toBe("");
  });
});

describe("gpuVerdict", () => {
  const base = { fps: 60, avgFps: 60, minFps: 55, frames: 600, elapsedMs: 10_000, contextLost: false };
  it("classifies runs", () => {
    expect(gpuVerdict(base)).toBe("ok");
    expect(gpuVerdict({ ...base, minFps: 20 })).toBe("drops");
    expect(gpuVerdict({ ...base, contextLost: true })).toBe("lost");
  });
});
