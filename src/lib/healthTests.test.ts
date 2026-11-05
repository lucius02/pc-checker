import { describe, expect, it } from "vitest";
import { planHealthTests } from "./healthTests";

const none = {
  freezeData: null,
  driverReport: null,
  storageReport: null,
  batteryReport: null,
  latencyResult: null,
  diskResult: null,
  ramResult: null,
  cpuResult: null,
  powerData: null,
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const done = {} as any;

describe("planHealthTests", () => {
  it("runs every untested component, quick scans first and stress tests last", () => {
    const p = planHealthTests(none);
    expect(p.mode).toBe("untested");
    expect(p.steps.map((s) => s.id)).toEqual(["freeze", "drivers", "storage", "latency", "disk", "ram", "cpu"]);
  });

  it("only includes the battery test when a battery is present", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const laptop = { ...none, powerData: { battery_present: true } as any };
    expect(planHealthTests(laptop).steps.map((s) => s.id)).toContain("battery");
  });

  it("skips tests that were already run", () => {
    const p = planHealthTests({ ...none, freezeData: done, cpuResult: done, latencyResult: done });
    expect(p.mode).toBe("untested");
    expect(p.steps.map((s) => s.id)).toEqual(["drivers", "storage", "disk", "ram"]);
  });

  it("re-runs everything when all tests are done", () => {
    const all = { ...none, freezeData: done, driverReport: done, storageReport: done, latencyResult: done, diskResult: done, ramResult: done, cpuResult: done };
    const p = planHealthTests(all);
    expect(p.mode).toBe("all");
    expect(p.steps).toHaveLength(7);
  });
});
