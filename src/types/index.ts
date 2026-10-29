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

export type TabType =
  | "overview"
  | "cpu"
  | "ram"
  | "disk"
  | "power"
  | "cooling"
  | "freeze";
