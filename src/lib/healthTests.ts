import type { MessageKey } from "../i18n";
import type { DiagnosticsState } from "../store/diagnosticsStore";

/** Een test die bijdraagt aan de gezondheidsscore. */
export type HealthTestId = "freeze" | "drivers" | "storage" | "battery" | "latency" | "disk" | "ram" | "cpu";

export interface HealthTestStep {
  id: HealthTestId;
  label: MessageKey;
}

/**
 * Volgorde is bewust: eerst de snelle scans, dan de latency-test (die een rustig systeem nodig
 * heeft), en pas daarna de zware stresstests, zodat die de latency-meting niet verstoren.
 */
export const HEALTH_TEST_ORDER: HealthTestStep[] = [
  { id: "freeze", label: "hs.test.freeze" },
  { id: "drivers", label: "hs.test.drivers" },
  { id: "storage", label: "hs.test.storage" },
  { id: "battery", label: "hs.test.battery" },
  { id: "latency", label: "hs.test.latency" },
  { id: "disk", label: "hs.test.disk" },
  { id: "ram", label: "hs.test.ram" },
  { id: "cpu", label: "hs.test.cpu" },
];

type StateSlice = Pick<
  DiagnosticsState,
  | "freezeData"
  | "driverReport"
  | "storageReport"
  | "batteryReport"
  | "latencyResult"
  | "diskResult"
  | "ramResult"
  | "cpuResult"
  | "powerData"
>;

/** Is deze test van toepassing op dit systeem? (Batterij alleen als er een batterij is.) */
export function isApplicable(id: HealthTestId, s: StateSlice): boolean {
  if (id === "battery") return s.powerData?.battery_present === true;
  return true;
}

/** Is deze test al uitgevoerd in deze sessie? */
export function isDone(id: HealthTestId, s: StateSlice): boolean {
  switch (id) {
    case "freeze":
      return s.freezeData !== null;
    case "drivers":
      return s.driverReport !== null;
    case "storage":
      return s.storageReport !== null;
    case "battery":
      return s.batteryReport !== null;
    case "latency":
      return s.latencyResult !== null;
    case "disk":
      return s.diskResult !== null;
    case "ram":
      return s.ramResult !== null;
    case "cpu":
      return s.cpuResult !== null;
  }
}

/**
 * Welke tests de knop moet draaien: alle nog niet uitgevoerde tests, of, als alles al gedaan
 * is, alles opnieuw.
 */
export function planHealthTests(s: StateSlice): { mode: "untested" | "all"; steps: HealthTestStep[] } {
  const applicable = HEALTH_TEST_ORDER.filter((step) => isApplicable(step.id, s));
  const untested = applicable.filter((step) => !isDone(step.id, s));
  return untested.length > 0 ? { mode: "untested", steps: untested } : { mode: "all", steps: applicable };
}
