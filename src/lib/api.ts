import { invoke } from "@tauri-apps/api/core";
import type {
  BatteryHealthReport,
  CoolingOverview,
  DriverLatencyReport,
  DriverReport,
  ElevationStatus,
  FreezeDiagnosticReport,
  FreezeProcessContext,
  HardwarePowerCheckReport,
  HealthInputs,
  HealthScore,
  HistoryData,
  LatencyTestResult,
  MetricsHistory,
  PowerInfo,
  ProcessSnapshot,
  StorageHealthReport,
  StressTestResult,
  SystemOverview,
} from "../types";

/**
 * Getypeerde wrappers rond alle Tauri-commando's. Commandonamen staan alleen hier, zodat een
 * hernoemd commando in de Rust-backend op één plek wordt bijgewerkt.
 */
export const api = {
  getSystemOverview: () => invoke<SystemOverview>("get_system_overview"),
  getPowerAndBatteryInfo: () => invoke<PowerInfo>("get_power_and_battery_info"),
  runBatteryHealthCheck: () => invoke<BatteryHealthReport>("run_battery_health_check"),
  getCoolingAndFanInfo: () => invoke<CoolingOverview>("get_cooling_and_fan_info"),
  scanFreezeDiagnostic: () => invoke<FreezeDiagnosticReport>("scan_freeze_diagnostic"),
  runCpuStressTest: (durationSecs: number, threadCount: number | null = null) =>
    invoke<StressTestResult>("run_cpu_stress_test", { durationSecs, threadCount }),
  runRamStressTest: (sizeMb: number, passes = 1) =>
    invoke<StressTestResult>("run_ram_stress_test", { sizeMb, passes }),
  runDiskBenchmark: (fileSizeMb: number, targetDir: string | null = null) =>
    invoke<StressTestResult>("run_disk_benchmark", { targetDir, fileSizeMb }),
  getMetricsHistory: () => invoke<MetricsHistory>("get_metrics_history"),
  getProcessSnapshot: (sortBy: string, limit: number) =>
    invoke<ProcessSnapshot>("get_process_snapshot", { sortBy, limit }),
  getFreezeProcessContext: () => invoke<FreezeProcessContext[]>("get_freeze_process_context"),
  scanDrivers: () => invoke<DriverReport>("scan_drivers"),
  openDeviceManager: () => invoke<void>("open_device_manager"),
  openWindowsUpdate: () => invoke<void>("open_windows_update"),
  runLatencyTest: (durationSecs: number) =>
    invoke<LatencyTestResult>("run_latency_test", { durationSecs }),
  computeHealthScore: (inputs: HealthInputs) =>
    invoke<HealthScore>("compute_health_score", { inputs }),
  checkHardwarePowerDelivery: () =>
    invoke<HardwarePowerCheckReport>("check_hardware_power_delivery"),
  scanStorageHealth: () => invoke<StorageHealthReport>("scan_storage_health"),
  getHistory: () => invoke<HistoryData>("get_history"),
  clearHistory: () => invoke<void>("clear_history"),
  getElevationStatus: () => invoke<ElevationStatus>("get_elevation_status"),
  restartAsAdmin: () => invoke<boolean>("restart_as_admin"),
  runDriverLatencyTrace: (durationSecs: number) =>
    invoke<DriverLatencyReport>("run_driver_latency_trace", { durationSecs }),
  setLanguage: (lang: string) => invoke<void>("set_language", { lang }),
};

/** Zet een onbekende fout (Tauri geeft strings terug) om in een leesbare melding. */
export function errorMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
