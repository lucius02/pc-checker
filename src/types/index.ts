export interface CpuCoreInfo {
  name: string;
  usage: number;
  frequency_mhz: number;
}

export interface CpuInfo {
  brand: string;
  vendor_id: string;
  physical_cores: number;
  logical_cores: number;
  global_usage: number;
  cores: CpuCoreInfo[];
}

export interface RamInfo {
  total_bytes: number;
  used_bytes: number;
  free_bytes: number;
  total_swap_bytes: number;
  used_swap_bytes: number;
}

export interface DiskInfo {
  name: string;
  mount_point: string;
  file_system: string;
  total_bytes: number;
  available_bytes: number;
  is_removable: boolean;
  disk_type: string;
}

export interface GpuInfo {
  name: string;
  driver_version: string;
  vram_bytes: number;
}

export interface MotherboardInfo {
  manufacturer: string;
  product: string;
  bios_vendor: string;
  bios_version: string;
}

export interface SystemOverview {
  os_name: string;
  os_version: string;
  host_name: string;
  kernel_version: string;
  kernel_uptime_secs: number;
  session_uptime_secs: number;
  session_started_at: string;
  cpu: CpuInfo;
  ram: RamInfo;
  disks: DiskInfo[];
  gpus: GpuInfo[];
  motherboard: MotherboardInfo;
}

export interface PowerInfo {
  is_laptop: boolean;
  ac_connected: boolean;
  battery_present: boolean;
  battery_percent: number | null;
  battery_status_desc: string;
  power_plan_name: string;
  battery_life_time_secs: number | null;
  details: string;
}

export interface BatteryHealthReport {
  is_available: boolean;
  health_percent: number;
  wear_percent: number;
  design_capacity_mwh: number;
  full_charge_capacity_mwh: number;
  cycle_count: number;
  chemistry: string;
  manufacturer: string;
  estimated_runtime: string;
  grade: string;
  advice: string;
}

export interface TemperatureSensorInfo {
  label: string;
  temperature_celsius: number;
  max_celsius: number | null;
  critical_celsius: number | null;
}

export interface FanInfo {
  name: string;
  status: string;
  speed_rpm: number | null;
}

export interface CoolingOverview {
  fans: FanInfo[];
  temperatures: TemperatureSensorInfo[];
  is_throttling_suspected: boolean;
  summary: string;
}

export interface FreezeEventEntry {
  timestamp: string;
  provider: string;
  event_id: number;
  level: string;
  message: string;
  category: string;
  suggestion: string;
}

export interface FreezeDiagnosticReport {
  watchdog_freezes_detected: string[];
  event_log_culprits: FreezeEventEntry[];
  max_scheduling_jitter_ms: number;
  system_freeze_risk: string;
  diagnosis_summary: string;
  recommended_actions: string[];
}

export interface StressTestResult {
  success: boolean;
  test_name: string;
  duration_ms: number;
  operations_or_bytes: number;
  score_or_speed: number;
  unit: string;
  details: string;
  error?: string | null;
}

export interface FreezeRecord {
  at_epoch_ms: number;
  duration_ms: number;
  timestamp: string;
}

export interface ProcessInfo {
  pid: number;
  name: string;
  /** Percentage van de totale machine (0-100), niet per kern */
  cpu_usage: number;
  memory_bytes: number;
  disk_read_bytes_per_sec: number;
  disk_write_bytes_per_sec: number;
}

export interface ProcessSnapshot {
  taken_at_epoch_ms: number;
  total_processes: number;
  processes: ProcessInfo[];
}

export interface MetricsSample {
  at_epoch_ms: number;
  cpu_usage: number;
  cpu_freq_avg_mhz: number;
  ram_used_percent: number;
  swap_used_percent: number;
  max_temp_celsius: number | null;
  disk_read_bytes_per_sec: number;
  disk_write_bytes_per_sec: number;
  net_rx_bytes_per_sec: number;
  net_tx_bytes_per_sec: number;
  top_processes: ProcessInfo[];
}

export interface MetricsHistory {
  interval_ms: number;
  samples: MetricsSample[];
}

export interface FreezeProcessContext {
  freeze: FreezeRecord;
  samples_before: MetricsSample[];
}

export interface DriverEntry {
  device_name: string;
  device_class: string;
  provider: string;
  version: string;
  date: string;
  age_years: number | null;
  is_signed: boolean | null;
  status: "OK" | "Verouderd" | "Probleem" | "Niet ondertekend" | string;
  problem_code: number | null;
  advice: string;
}

export interface DriverReport {
  is_available: boolean;
  scanned_at: string;
  total_drivers: number;
  outdated_count: number;
  problem_count: number;
  unsigned_count: number;
  entries: DriverEntry[];
  summary: string;
}

export interface LatencyBucket {
  label: string;
  count: number;
}

export interface LatencyTestResult {
  success: boolean;
  duration_ms: number;
  timer_samples: number;
  timer_max_gap_us: number;
  timer_avg_gap_us: number;
  timer_p99_gap_us: number;
  histogram: LatencyBucket[];
  dpc_time_percent_avg: number | null;
  dpc_time_percent_max: number | null;
  interrupt_time_percent_avg: number | null;
  interrupt_time_percent_max: number | null;
  dpcs_queued_per_sec_avg: number | null;
  verdict: "Goed" | "Matig" | "Slecht" | string;
  summary: string;
  suspected_drivers: string[];
  advice: string[];
  error: string | null;
}

export interface HealthInputs {
  max_temp_celsius: number | null;
  is_throttling_suspected: boolean;
  freeze_scanned: boolean;
  watchdog_freeze_count: number;
  event_log_culprit_count: number;
  battery_health_percent: number | null;
  ram_used_percent: number;
  min_disk_free_percent: number | null;
  driver_problem_count: number | null;
  driver_outdated_count: number | null;
  latency_verdict: string | null;
  latency_max_gap_us: number | null;
  dpc_time_percent_max: number | null;
  cpu_stress_ok: boolean | null;
  ram_test_ok: boolean | null;
  disk_test_ok: boolean | null;
}

export interface HealthCategoryScore {
  key: string;
  label: string;
  score: number;
  weight: number;
  status: "Goed" | "Let op" | "Kritiek" | "Niet getest" | string;
  detail: string;
}

export interface HealthScore {
  score: number;
  grade: "A" | "B" | "C" | "D" | "E" | "F" | string;
  label: string;
  categories: HealthCategoryScore[];
  top_issues: string[];
}

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
  | "latency";
