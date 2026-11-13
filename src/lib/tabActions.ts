import type { MessageKey } from "../i18n";
import type { BusyKey, DiagnosticsState } from "../store/diagnosticsStore";
import type { TabType } from "../types";

/** Welke lopende taak bij welk tabblad hoort (voor de draai-indicator en de statusbalk). */
export const BUSY_FOR_TAB: Partial<Record<TabType, BusyKey[]>> = {
  freeze: ["freeze"],
  latency: ["latency", "driverLatency"],
  drivers: ["drivers"],
  storage: ["storage"],
  power: ["battery", "powerDelivery"],
  cpu: ["cpu"],
  ram: ["ram"],
  disk: ["disk"],
};

/** Bij welk tabblad het resultaat van een taak te zien is, en hoe de taak heet. */
export const BUSY_META: Partial<Record<BusyKey, { tab: TabType; label: MessageKey }>> = {
  freeze: { tab: "freeze", label: "hs.test.freeze" },
  latency: { tab: "latency", label: "hs.test.latency" },
  driverLatency: { tab: "latency", label: "act.test.driverLatency" },
  drivers: { tab: "drivers", label: "hs.test.drivers" },
  storage: { tab: "storage", label: "hs.test.storage" },
  battery: { tab: "power", label: "hs.test.battery" },
  powerDelivery: { tab: "power", label: "act.test.powerDelivery" },
  cpu: { tab: "cpu", label: "hs.test.cpu" },
  ram: { tab: "ram", label: "hs.test.ram" },
  disk: { tab: "disk", label: "hs.test.disk" },
};

/** Een test die zonder verdere invoer te starten is, vanaf het overzicht of het commandopalet. */
export interface QuickAction {
  tab: TabType;
  busyKey: BusyKey;
  /** Naam van de test, bijv. "CPU-stresstest". */
  label: MessageKey;
  run: (s: DiagnosticsState) => Promise<unknown>;
}

const QUICK_ACTIONS: Partial<Record<TabType, QuickAction>> = {
  freeze: { tab: "freeze", busyKey: "freeze", label: "hs.test.freeze", run: (s) => s.scanFreezeDiagnostic() },
  latency: { tab: "latency", busyKey: "latency", label: "hs.test.latency", run: (s) => s.runLatencyTest() },
  drivers: { tab: "drivers", busyKey: "drivers", label: "hs.test.drivers", run: (s) => s.scanDrivers() },
  storage: { tab: "storage", busyKey: "storage", label: "hs.test.storage", run: (s) => s.scanStorageHealth() },
  cpu: { tab: "cpu", busyKey: "cpu", label: "hs.test.cpu", run: (s) => s.runCpuStress() },
  ram: { tab: "ram", busyKey: "ram", label: "hs.test.ram", run: (s) => s.runRamStress() },
  disk: { tab: "disk", busyKey: "disk", label: "hs.test.disk", run: (s) => s.runDiskBenchmark() },
};

const BATTERY: QuickAction = { tab: "power", busyKey: "battery", label: "hs.test.battery", run: (s) => s.runBatteryTest() };
const POWER_DELIVERY: QuickAction = {
  tab: "power",
  busyKey: "powerDelivery",
  label: "act.test.powerDelivery",
  run: (s) => s.runPowerDeliveryCheck(),
};

/** De snelle actie van een tabblad, of null als de test daar interactief is (toetsenbord, webcam…). */
export function quickActionFor(tab: TabType, s: Pick<DiagnosticsState, "powerData">): QuickAction | null {
  if (tab === "power") return s.powerData?.battery_present ? BATTERY : POWER_DELIVERY;
  return QUICK_ACTIONS[tab] ?? null;
}

/** Loopt er op dit moment een test? Zware tests tegelijk draaien vertekent de uitkomsten. */
export function anyTestRunning(s: Pick<DiagnosticsState, "busy" | "healthRun">): boolean {
  return s.healthRun !== null || Object.entries(s.busy).some(([k, v]) => v && k !== "history");
}
