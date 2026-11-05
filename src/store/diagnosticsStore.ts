import { create } from "zustand";
import { api, errorMessage } from "../lib/api";
import { t, type MessageKey } from "../i18n";
import { toast } from "./toastStore";
import { planHealthTests, type HealthTestId, type HealthTestStep } from "../lib/healthTests";
import type {
  BatteryHealthReport,
  CoolingOverview,
  DriverLatencyReport,
  DriverReport,
  ElevationStatus,
  FreezeDiagnosticReport,
  HardwarePowerCheckReport,
  HealthScore,
  HistoryData,
  LatencyTestResult,
  PeripheralTestResults,
  PowerInfo,
  StorageHealthReport,
  StressTestResult,
  SystemOverview,
} from "../types";

/** Langlopende acties; per sleutel staat er een "bezig"-vlag in `busy`. */
export type BusyKey =
  | "freeze"
  | "battery"
  | "powerDelivery"
  | "drivers"
  | "latency"
  | "driverLatency"
  | "storage"
  | "history"
  | "cpu"
  | "ram"
  | "disk";

export interface DiagnosticsState {
  // Live telemetrie
  data: SystemOverview | null;
  powerData: PowerInfo | null;
  coolingData: CoolingOverview | null;
  isLoading: boolean;
  lastUpdated: Date;
  autoRefresh: boolean;

  // Rapporten van door de gebruiker gestarte scans/tests
  freezeData: FreezeDiagnosticReport | null;
  batteryReport: BatteryHealthReport | null;
  powerDeliveryReport: HardwarePowerCheckReport | null;
  driverReport: DriverReport | null;
  latencyResult: LatencyTestResult | null;
  driverLatency: DriverLatencyReport | null;
  storageReport: StorageHealthReport | null;
  history: HistoryData | null;
  elevation: ElevationStatus | null;
  cpuResult: StressTestResult | null;
  ramResult: StressTestResult | null;
  diskResult: StressTestResult | null;
  gpuResult: string | null;
  healthScore: HealthScore | null;
  peripherals: PeripheralTestResults;

  // Instellingen van tests
  latencyDuration: number;
  cpuDuration: number;
  ramSizeMb: number;
  diskSizeMb: number;

  busy: Partial<Record<BusyKey, boolean>>;

  /** Voortgang van "alles testen" vanaf de gezondheidsscore (null = niet actief). */
  healthRun: { mode: "untested" | "all"; steps: HealthTestStep[]; index: number; stopping: boolean } | null;

  setAutoRefresh: (v: boolean) => void;
  setLatencyDuration: (v: number) => void;
  setCpuDuration: (v: number) => void;
  setRamSizeMb: (v: number) => void;
  setDiskSizeMb: (v: number) => void;
  setPeripheral: <K extends keyof PeripheralTestResults>(key: K, value: PeripheralTestResults[K]) => void;
  setGpuResult: (v: string | null) => void;
  setHealthScore: (v: HealthScore) => void;

  fetchOverview: () => Promise<void>;
  scanFreezeDiagnostic: () => Promise<void>;
  runBatteryTest: () => Promise<void>;
  runPowerDeliveryCheck: () => Promise<void>;
  scanDrivers: () => Promise<void>;
  runLatencyTest: () => Promise<void>;
  runDriverLatencyTrace: (durationSecs: number) => Promise<void>;
  scanStorageHealth: () => Promise<void>;
  loadHistory: () => Promise<void>;
  clearHistory: () => Promise<void>;
  loadElevation: () => Promise<void>;
  restartAsAdmin: () => Promise<void>;
  runCpuStress: (durationSecs?: number) => Promise<StressTestResult>;
  runRamStress: (sizeMb?: number) => Promise<StressTestResult>;
  runDiskBenchmark: () => Promise<StressTestResult>;
  /** Draait alle nog niet uitgevoerde gezondheidstests, of alles opnieuw als alles al gedaan is. */
  runHealthTests: () => Promise<void>;
  /** Stopt na de test die nu loopt. */
  stopHealthTests: () => void;
}

function failedStress(name: string, unit: string, err: unknown): StressTestResult {
  return {
    success: false,
    test_name: name,
    duration_ms: 0,
    operations_or_bytes: 0,
    score_or_speed: 0,
    unit,
    details: t("error.stress"),
    error: errorMessage(err),
  };
}

let overviewInFlight = false;

export const useDiagnosticsStore = create<DiagnosticsState>((set, get) => {
  /**
   * Voert een backend-actie uit met bezig-vlag en foutmelding (toast) op één plek, zodat geen
   * enkele fout meer stil in `console.error` verdwijnt.
   */
  async function run<T>(key: BusyKey, errorKey: MessageKey, fn: () => Promise<T>): Promise<T | undefined> {
    set((s) => ({ busy: { ...s.busy, [key]: true } }));
    try {
      return await fn();
    } catch (err) {
      toast.error(t(errorKey), errorMessage(err));
      return undefined;
    } finally {
      set((s) => ({ busy: { ...s.busy, [key]: false } }));
    }
  }

  return {
    data: null,
    powerData: null,
    coolingData: null,
    isLoading: true,
    lastUpdated: new Date(),
    autoRefresh: true,

    freezeData: null,
    batteryReport: null,
    powerDeliveryReport: null,
    driverReport: null,
    latencyResult: null,
    driverLatency: null,
    storageReport: null,
    history: null,
    elevation: null,
    cpuResult: null,
    ramResult: null,
    diskResult: null,
    gpuResult: null,
    healthScore: null,
    peripherals: {},

    latencyDuration: 10,
    cpuDuration: 5,
    ramSizeMb: 512,
    diskSizeMb: 256,

    busy: {},
    healthRun: null,

    setAutoRefresh: (autoRefresh) => set({ autoRefresh }),
    setLatencyDuration: (latencyDuration) => set({ latencyDuration }),
    setCpuDuration: (cpuDuration) => set({ cpuDuration }),
    setRamSizeMb: (ramSizeMb) => set({ ramSizeMb }),
    setDiskSizeMb: (diskSizeMb) => set({ diskSizeMb }),
    setPeripheral: (key, value) =>
      set((s) =>
        // Zelfde resultaat opnieuw gemeld? Geen update (voorkomt onnodige renders/lussen).
        JSON.stringify(s.peripherals[key]) === JSON.stringify(value)
          ? s
          : { peripherals: { ...s.peripherals, [key]: value } },
      ),
    setGpuResult: (gpuResult) => set({ gpuResult }),
    setHealthScore: (healthScore) => set({ healthScore }),

    fetchOverview: async () => {
      if (overviewInFlight) return;
      overviewInFlight = true;
      try {
        // allSettled: één falende bron (bijv. WMI-time-out) mag de rest niet blokkeren.
        const [o, p, c] = await Promise.allSettled([
          api.getSystemOverview(),
          api.getPowerAndBatteryInfo(),
          api.getCoolingAndFanInfo(),
        ]);
        const patch: Partial<DiagnosticsState> = { lastUpdated: new Date() };
        if (o.status === "fulfilled") patch.data = o.value;
        if (p.status === "fulfilled") patch.powerData = p.value;
        if (c.status === "fulfilled") patch.coolingData = c.value;
        set(patch);
        const failed = [o, p, c].find((r): r is PromiseRejectedResult => r.status === "rejected");
        if (failed) toast.error(t("error.overview"), errorMessage(failed.reason));
      } finally {
        overviewInFlight = false;
        set({ isLoading: false });
      }
    },

    scanFreezeDiagnostic: async () => {
      const r = await run("freeze", "error.freeze", api.scanFreezeDiagnostic);
      if (r) set({ freezeData: r });
    },
    runBatteryTest: async () => {
      const r = await run("battery", "error.battery", api.runBatteryHealthCheck);
      if (r) set({ batteryReport: r });
    },
    runPowerDeliveryCheck: async () => {
      const r = await run("powerDelivery", "error.powerDelivery", api.checkHardwarePowerDelivery);
      if (r) set({ powerDeliveryReport: r });
    },
    scanDrivers: async () => {
      const r = await run("drivers", "error.drivers", api.scanDrivers);
      if (r) set({ driverReport: r });
    },
    runLatencyTest: async () => {
      set({ latencyResult: null });
      const r = await run("latency", "error.latency", () => api.runLatencyTest(get().latencyDuration));
      if (r) set({ latencyResult: r });
    },
    runDriverLatencyTrace: async (durationSecs) => {
      set({ driverLatency: null });
      const r = await run("driverLatency", "error.driverLatency", () => api.runDriverLatencyTrace(durationSecs));
      if (r) set({ driverLatency: r });
    },
    scanStorageHealth: async () => {
      const r = await run("storage", "error.storage", api.scanStorageHealth);
      if (r) set({ storageReport: r });
    },
    loadHistory: async () => {
      const r = await run("history", "error.history", api.getHistory);
      if (r) set({ history: r });
    },
    clearHistory: async () => {
      const ok = await run("history", "error.history", async () => {
        await api.clearHistory();
        return true;
      });
      if (ok) {
        set({ history: { freezes: [], health: [] } });
        toast.success(t("toast.historyCleared"));
      }
    },
    loadElevation: async () => {
      try {
        set({ elevation: await api.getElevationStatus() });
      } catch {
        /* niet kritiek: badge wordt dan niet getoond */
      }
    },
    restartAsAdmin: async () => {
      try {
        const started = await api.restartAsAdmin();
        if (!started) toast.info(t("toast.adminDeclined"));
      } catch (err) {
        toast.error(t("error.admin"), errorMessage(err));
      }
    },

    runCpuStress: async (durationSecs) => {
      set({ cpuResult: null });
      const res =
        (await run("cpu", "error.stress", () => api.runCpuStressTest(durationSecs ?? get().cpuDuration))) ??
        failedStress("CPU Stress Test", "MOps/s", t("error.stress"));
      set({ cpuResult: res });
      void get().fetchOverview();
      return res;
    },
    runRamStress: async (sizeMb) => {
      set({ ramResult: null });
      const res =
        (await run("ram", "error.stress", () => api.runRamStressTest(sizeMb ?? get().ramSizeMb))) ??
        failedStress("RAM Geheugentest", "MB/s", t("error.stress"));
      set({ ramResult: res });
      void get().fetchOverview();
      return res;
    },
    runHealthTests: async () => {
      if (get().healthRun) return;
      const plan = planHealthTests(get());
      set({ healthRun: { mode: plan.mode, steps: plan.steps, index: 0, stopping: false } });
      const runners: Record<HealthTestId, () => Promise<unknown>> = {
        freeze: () => get().scanFreezeDiagnostic(),
        drivers: () => get().scanDrivers(),
        storage: () => get().scanStorageHealth(),
        battery: () => get().runBatteryTest(),
        latency: () => get().runLatencyTest(),
        disk: () => get().runDiskBenchmark(),
        ram: () => get().runRamStress(),
        cpu: () => get().runCpuStress(),
      };
      try {
        for (let i = 0; i < plan.steps.length; i++) {
          if (get().healthRun?.stopping) break;
          set((s) => ({ healthRun: s.healthRun && { ...s.healthRun, index: i } }));
          // Fouten worden al als melding getoond; ga gewoon door met de volgende test.
          await runners[plan.steps[i].id]().catch(() => undefined);
        }
        if (!get().healthRun?.stopping) toast.success(t("hs.testDone"));
      } finally {
        set({ healthRun: null });
      }
    },
    stopHealthTests: () => set((s) => ({ healthRun: s.healthRun && { ...s.healthRun, stopping: true } })),
    runDiskBenchmark: async () => {
      set({ diskResult: null });
      const res =
        (await run("disk", "error.stress", () => api.runDiskBenchmark(get().diskSizeMb))) ??
        failedStress("Schijf Benchmark", "MB/s", t("error.stress"));
      set({ diskResult: res });
      void get().fetchOverview();
      return res;
    },
  };
});
