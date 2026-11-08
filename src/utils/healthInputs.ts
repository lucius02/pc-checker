import {
  SystemOverview,
  CoolingOverview,
  FreezeDiagnosticReport,
  BatteryHealthReport,
  StressTestResult,
  DriverReport,
  LatencyTestResult,
  HealthInputs,
  StorageHealthReport,
} from "../types";

export interface HealthInputSources {
  data: SystemOverview;
  coolingData: CoolingOverview | null;
  freezeData: FreezeDiagnosticReport | null;
  batteryReport: BatteryHealthReport | null;
  driverReport: DriverReport | null;
  latencyResult: LatencyTestResult | null;
  cpuResult: StressTestResult | null;
  ramResult: StressTestResult | null;
  diskResult: StressTestResult | null;
  storageReport?: StorageHealthReport | null;
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Bouwt de invoer voor `compute_health_score` uit de al opgehaalde app-state.
 *
 * Live waarden (RAM-gebruik, vrije schijfruimte, temperatuur) worden op hele
 * getallen afgerond, zodat de JSON-sleutel niet bij elke 3 s-refresh verandert
 * en de backend alleen opnieuw wordt aangeroepen als er echt iets verschuift.
 */
export function buildHealthInputs(src: HealthInputSources): HealthInputs {
  const {
    data,
    coolingData,
    freezeData,
    batteryReport,
    driverReport,
    latencyResult,
    cpuResult,
    ramResult,
    diskResult,
    storageReport,
  } = src;

  const temps = (coolingData?.temperatures ?? [])
    .map((t) => t.temperature_celsius)
    .filter((t) => isNum(t) && t > 0);
  const maxTemp = temps.length > 0 ? Math.round(Math.max(...temps)) : null;

  const ramPercent =
    data.ram.total_bytes > 0
      ? Math.round(Math.min(100, (data.ram.used_bytes / data.ram.total_bytes) * 100))
      : 0;

  const diskFree = data.disks
    .filter((d) => d.total_bytes > 0)
    .map((d) => (d.available_bytes / d.total_bytes) * 100);
  const minDiskFree = diskFree.length > 0 ? Math.round(Math.min(...diskFree)) : null;

  const battery =
    batteryReport?.is_available && isNum(batteryReport.health_percent)
      ? Math.round(batteryReport.health_percent)
      : null;

  const drivers = driverReport?.is_available ? driverReport : null;
  const latency = latencyResult?.success ? latencyResult : null;

  return {
    max_temp_celsius: maxTemp,
    is_throttling_suspected: coolingData?.is_throttling_suspected ?? false,
    freeze_scanned: freezeData !== null,
    watchdog_freeze_count: freezeData?.watchdog_freezes_detected.length ?? 0,
    event_log_culprit_count: freezeData?.event_log_culprits.length ?? 0,
    battery_health_percent: battery,
    ram_used_percent: ramPercent,
    min_disk_free_percent: minDiskFree,
    driver_problem_count: drivers ? drivers.problem_count : null,
    driver_outdated_count: drivers ? drivers.outdated_count : null,
    latency_verdict: latency ? latency.verdict : null,
    latency_max_gap_us: latency && isNum(latency.timer_max_gap_us) ? latency.timer_max_gap_us : null,
    dpc_time_percent_max:
      latency && isNum(latency.dpc_time_percent_max) ? latency.dpc_time_percent_max : null,
    cpu_stress_ok: cpuResult ? cpuResult.success : null,
    ram_test_ok: ramResult ? ramResult.success : null,
    disk_test_ok: diskResult ? diskResult.success : null,
    storage_smart_warning_count: storageReport?.is_available ? storageReport.warning_count : null,
    storage_smart_critical_count: storageReport?.is_available ? storageReport.critical_count : null,
    storage_smart_findings: storageReport?.is_available
      ? storageReport.disks
          .filter((d) => d.verdict !== "Goed")
          .flatMap((d) => d.findings.map((f) => `${d.model}: ${f}`))
      : null,
  };
}
