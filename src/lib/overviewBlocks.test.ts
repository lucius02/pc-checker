import { describe, expect, it } from "vitest";
import { buildOverviewBlocks, OVERVIEW_BLOCK_ORDER, type OverviewSlice } from "./overviewBlocks";
import type { BurnInResult, StressTestResult } from "../types";

const empty: OverviewSlice = {
  data: null,
  powerData: null,
  coolingData: null,
  freezeData: null,
  driverReport: null,
  latencyResult: null,
  storageReport: null,
  batteryReport: null,
  powerDeliveryReport: null,
  cpuResult: null,
  ramResult: null,
  diskResult: null,
  gpuResult: null,
  burninResult: null,
  peripherals: {},
};

const stress = (success: boolean): StressTestResult => ({
  success,
  test_name: "x",
  duration_ms: 1000,
  operations_or_bytes: 1,
  score_or_speed: 1234.5,
  unit: "MOps/s",
  details: "",
  error: null,
});

const byId = (s: OverviewSlice) => Object.fromEntries(buildOverviewBlocks(s).map((b) => [b.id, b]));

describe("buildOverviewBlocks", () => {
  it("has one block per test tab and none for the non-test tabs", () => {
    const ids = buildOverviewBlocks(empty).map((b) => b.id);
    expect(ids).toHaveLength(17);
    expect(new Set(ids).size).toBe(17);
    for (const notATest of ["overview", "live", "processes", "history"]) expect(ids).not.toContain(notATest);
    expect(ids).toEqual(OVERVIEW_BLOCK_ORDER.map((b) => b.id));
  });

  it("marks everything untested on a fresh start", () => {
    expect(buildOverviewBlocks(empty).every((b) => b.status === "untested")).toBe(true);
  });

  it("maps stress test outcomes to good/bad", () => {
    const b = byId({ ...empty, cpuResult: stress(true), ramResult: stress(false) });
    expect(b.cpu.status).toBe("good");
    expect(b.cpu.detail.vars?.v).toBe("1234.5 MOps/s");
    expect(b.ram.status).toBe("bad");
  });

  it("reads the GPU verdict from the summary prefix", () => {
    expect(byId({ ...empty, gpuResult: "OK — 60.0 avg / 58.0 min FPS, 60 s" }).gpu.status).toBe("good");
    expect(byId({ ...empty, gpuResult: "FPS DROPS — 30.0 avg / 2.0 min FPS, 60 s" }).gpu.status).toBe("warn");
    expect(byId({ ...empty, gpuResult: "CONTEXT LOST — 0 avg" }).gpu.status).toBe("bad");
  });

  it("names the failed parts of a burn-in", () => {
    const r: BurnInResult = { cpuOk: true, cpuDetail: "", ramOk: false, ramDetail: "", gpuOk: false, gpuDetail: "", maxTemp: 80, freezes: 0 };
    const b = byId({ ...empty, burninResult: r }).burnin;
    expect(b.status).toBe("bad");
    expect(b.detail).toEqual({ key: "blk.burnin.failed", vars: { v: "RAM, GPU" } });
  });

  it("flags packet loss and offline in the network block", () => {
    const net = (packetLossPercent: number, online = true) =>
      byId({ ...empty, peripherals: { network: { online, avgPingMs: 20, jitterMs: 2, packetLossPercent } } }).network.status;
    expect(net(0)).toBe("good");
    expect(net(1)).toBe("warn");
    expect(net(8)).toBe("bad");
    expect(net(0, false)).toBe("bad");
  });

  it("treats a peripheral tab that was only opened as untested", () => {
    const b = byId({
      ...empty,
      peripherals: {
        keyboard: { testedKeys: 0, totalKeys: 104, maxRollover: 0, formFactor: "", keymap: "", enterStyle: "" },
        audio: { stereoTested: false, frequenciesTested: false, micWorking: false },
      },
    });
    expect(b.keyboard.status).toBe("untested");
    expect(b.audio.status).toBe("untested");
  });

  it("uses the freeze risk for the freeze block", () => {
    const freeze = (risk: string) =>
      byId({
        ...empty,
        freezeData: {
          watchdog_freezes_detected: [],
          event_log_culprits: [],
          max_scheduling_jitter_ms: 0,
          system_freeze_risk: risk,
          diagnosis_summary: "",
          recommended_actions: [],
        },
      }).freeze.status;
    expect(freeze("Laag")).toBe("good");
    expect(freeze("Middel")).toBe("warn");
    expect(freeze("Hoog")).toBe("bad");
  });
});
