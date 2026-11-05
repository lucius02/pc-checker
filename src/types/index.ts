// Rust-modellen worden automatisch gegenereerd door ts-rs (`cargo test` in src-tauri).
// Pas ze aan in src-tauri/src/models.rs, niet hier.
export type { BatteryHealthReport } from "./generated/BatteryHealthReport";
export type { CoolingOverview } from "./generated/CoolingOverview";
export type { CpuCoreInfo } from "./generated/CpuCoreInfo";
export type { CpuInfo } from "./generated/CpuInfo";
export type { DiskInfo } from "./generated/DiskInfo";
export type { Advice } from "./generated/Advice";
export type { DriverEntry } from "./generated/DriverEntry";
export type { DriverLatencyEntry } from "./generated/DriverLatencyEntry";
export type { DriverLatencyReport } from "./generated/DriverLatencyReport";
export type { DriverReport } from "./generated/DriverReport";
export type { ElevationStatus } from "./generated/ElevationStatus";
export type { FanInfo } from "./generated/FanInfo";
export type { FreezeDiagnosticReport } from "./generated/FreezeDiagnosticReport";
export type { FreezeEventEntry } from "./generated/FreezeEventEntry";
export type { FreezeProcessContext } from "./generated/FreezeProcessContext";
export type { FreezeRecord } from "./generated/FreezeRecord";
export type { GpuInfo } from "./generated/GpuInfo";
export type { HardwarePowerCheckReport } from "./generated/HardwarePowerCheckReport";
export type { HealthCategoryScore } from "./generated/HealthCategoryScore";
export type { HealthHistoryEntry } from "./generated/HealthHistoryEntry";
export type { HealthInputs } from "./generated/HealthInputs";
export type { HealthScore } from "./generated/HealthScore";
export type { HistoryData } from "./generated/HistoryData";
export type { LatencyBucket } from "./generated/LatencyBucket";
export type { LatencyFinding } from "./generated/LatencyFinding";
export type { LatencyTestResult } from "./generated/LatencyTestResult";
export type { MetricsHistory } from "./generated/MetricsHistory";
export type { MetricsSample } from "./generated/MetricsSample";
export type { MotherboardInfo } from "./generated/MotherboardInfo";
export type { PowerComponentCheck } from "./generated/PowerComponentCheck";
export type { PowerInfo } from "./generated/PowerInfo";
export type { ProcessInfo } from "./generated/ProcessInfo";
export type { ProcessSnapshot } from "./generated/ProcessSnapshot";
export type { RamInfo } from "./generated/RamInfo";
export type { StorageHealthEntry } from "./generated/StorageHealthEntry";
export type { StorageHealthReport } from "./generated/StorageHealthReport";
export type { StressTestResult } from "./generated/StressTestResult";
export type { SystemOverview } from "./generated/SystemOverview";
export type { TemperatureSensorInfo } from "./generated/TemperatureSensorInfo";

export type { NetworkAdapterHealth } from "./generated/NetworkAdapterHealth";
export type { NetworkHealthReport } from "./generated/NetworkHealthReport";
export type { NetworkIssue } from "./generated/NetworkIssue";
export type { WifiInfo } from "./generated/WifiInfo";
/**
 * Beschikbare navigatietabbladen in de applicatie.
 */
export type TabType =
  | "overview"
  | "live"
  | "processes"
  | "cpu"
  | "ram"
  | "disk"
  | "power"
  | "cooling"
  | "freeze"
  | "drivers"
  | "latency"
  | "storage"
  | "history"
  | "gpu"
  | "burnin"
  | "keyboard"
  | "screen"
  | "touchpad"
  | "audio"
  | "camera"
  | "network";

export interface PeripheralTestResults {
  keyboard?: {
    testedKeys: number;
    totalKeys: number;
    maxRollover: number;
    formFactor: string;
    keymap: string;
    enterStyle: string;
  };
  screen?: {
    width: number;
    height: number;
    dpr: number;
    colorDepth: number;
    refreshRateHz: number;
  };
  touchpad?: {
    coveragePercent: number;
    doubleClickMs: number | null;
    hasSwitchChatter: boolean;
    pollingRateHz: number;
    scrollSteps: number;
  };
  audio?: {
    stereoTested: boolean;
    frequenciesTested: boolean;
    micWorking: boolean;
    peakDecibels?: number;
  };
  camera?: {
    cameraName: string;
    resolution: string;
    fps: number;
    tested: boolean;
  };
  network?: {
    online: boolean;
    avgPingMs: number;
    jitterMs: number;
    packetLossPercent: number;
  };
}

