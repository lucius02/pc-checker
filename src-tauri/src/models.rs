use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CpuCoreInfo {
    pub name: String,
    pub usage: f32,
    pub frequency_mhz: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CpuInfo {
    pub brand: String,
    pub vendor_id: String,
    pub physical_cores: usize,
    pub logical_cores: usize,
    pub global_usage: f32,
    pub cores: Vec<CpuCoreInfo>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct RamInfo {
    pub total_bytes: u64,
    pub used_bytes: u64,
    pub free_bytes: u64,
    pub total_swap_bytes: u64,
    pub used_swap_bytes: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DiskInfo {
    pub name: String,
    pub mount_point: String,
    pub file_system: String,
    pub total_bytes: u64,
    pub available_bytes: u64,
    pub is_removable: bool,
    pub disk_type: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct GpuInfo {
    pub name: String,
    pub driver_version: String,
    pub vram_bytes: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct MotherboardInfo {
    pub manufacturer: String,
    pub product: String,
    pub bios_vendor: String,
    pub bios_version: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SystemOverview {
    pub os_name: String,
    pub os_version: String,
    pub host_name: String,
    pub kernel_version: String,
    pub kernel_uptime_secs: u64,
    pub session_uptime_secs: u64,
    pub session_started_at: String,
    pub cpu: CpuInfo,
    pub ram: RamInfo,
    pub disks: Vec<DiskInfo>,
    pub gpus: Vec<GpuInfo>,
    pub motherboard: MotherboardInfo,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct StressTestResult {
    pub success: bool,
    pub test_name: String,
    pub duration_ms: u128,
    pub operations_or_bytes: u64,
    pub score_or_speed: f64,
    pub unit: String,
    pub details: String,
    pub error: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct PowerInfo {
    pub is_laptop: bool,
    pub ac_connected: bool,
    pub battery_present: bool,
    pub battery_percent: Option<u8>,
    pub battery_status_desc: String,
    pub power_plan_name: String,
    pub battery_life_time_secs: Option<u32>,
    pub details: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct BatteryHealthReport {
    pub is_available: bool,
    pub health_percent: f64,
    pub wear_percent: f64,
    pub design_capacity_mwh: u64,
    pub full_charge_capacity_mwh: u64,
    pub cycle_count: u32,
    pub chemistry: String,
    pub manufacturer: String,
    pub estimated_runtime: String,
    pub grade: String,
    pub advice: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TemperatureSensorInfo {
    pub label: String,
    pub temperature_celsius: f32,
    pub max_celsius: Option<f32>,
    pub critical_celsius: Option<f32>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct FanInfo {
    pub name: String,
    pub status: String,
    pub speed_rpm: Option<u32>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CoolingOverview {
    pub fans: Vec<FanInfo>,
    pub temperatures: Vec<TemperatureSensorInfo>,
    pub is_throttling_suspected: bool,
    pub summary: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct FreezeEventEntry {
    pub timestamp: String,
    pub provider: String,
    pub event_id: u32,
    pub level: String,
    pub message: String,
    pub category: String,
    pub suggestion: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct FreezeDiagnosticReport {
    pub watchdog_freezes_detected: Vec<String>,
    pub event_log_culprits: Vec<FreezeEventEntry>,
    pub max_scheduling_jitter_ms: f64,
    pub system_freeze_risk: String,
    pub diagnosis_summary: String,
    pub recommended_actions: Vec<String>,
}

// ===== Watchdog: gestructureerde freeze-records =====

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct FreezeRecord {
    pub at_epoch_ms: u64,
    pub duration_ms: u64,
    pub timestamp: String,
}

// ===== Live Monitor (grafieken) & Procesmonitor =====

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ProcessInfo {
    pub pid: u32,
    pub name: String,
    /// Percentage van de totale machine (0-100), niet per kern
    pub cpu_usage: f32,
    pub memory_bytes: u64,
    pub disk_read_bytes_per_sec: u64,
    pub disk_write_bytes_per_sec: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ProcessSnapshot {
    pub taken_at_epoch_ms: u64,
    pub total_processes: usize,
    pub processes: Vec<ProcessInfo>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct MetricsSample {
    pub at_epoch_ms: u64,
    pub cpu_usage: f32,
    pub cpu_freq_avg_mhz: u64,
    pub ram_used_percent: f32,
    pub swap_used_percent: f32,
    pub max_temp_celsius: Option<f32>,
    pub disk_read_bytes_per_sec: u64,
    pub disk_write_bytes_per_sec: u64,
    pub net_rx_bytes_per_sec: u64,
    pub net_tx_bytes_per_sec: u64,
    /// Top processen op CPU-gebruik op dit moment (max 5)
    pub top_processes: Vec<ProcessInfo>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct MetricsHistory {
    pub interval_ms: u64,
    pub samples: Vec<MetricsSample>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct FreezeProcessContext {
    pub freeze: FreezeRecord,
    /// Metingen vlak vóór de freeze (oudste eerst)
    pub samples_before: Vec<MetricsSample>,
}

// ===== Driver Check =====

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DriverEntry {
    pub device_name: String,
    pub device_class: String,
    pub provider: String,
    pub version: String,
    /// "YYYY-MM-DD" of leeg als onbekend
    pub date: String,
    pub age_years: Option<f32>,
    pub is_signed: Option<bool>,
    /// "OK" | "Verouderd" | "Probleem" | "Niet ondertekend"
    pub status: String,
    pub problem_code: Option<u32>,
    pub advice: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DriverReport {
    pub is_available: bool,
    pub scanned_at: String,
    pub total_drivers: usize,
    pub outdated_count: usize,
    pub problem_count: usize,
    pub unsigned_count: usize,
    pub entries: Vec<DriverEntry>,
    pub summary: String,
}

// ===== DPC / Interrupt Latency =====

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct LatencyBucket {
    pub label: String,
    pub count: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct LatencyTestResult {
    pub success: bool,
    pub duration_ms: u64,
    pub timer_samples: u64,
    pub timer_max_gap_us: f64,
    pub timer_avg_gap_us: f64,
    pub timer_p99_gap_us: f64,
    pub histogram: Vec<LatencyBucket>,
    pub dpc_time_percent_avg: Option<f64>,
    pub dpc_time_percent_max: Option<f64>,
    pub interrupt_time_percent_avg: Option<f64>,
    pub interrupt_time_percent_max: Option<f64>,
    pub dpcs_queued_per_sec_avg: Option<f64>,
    /// "Goed" | "Matig" | "Slecht"
    pub verdict: String,
    pub summary: String,
    pub suspected_drivers: Vec<String>,
    pub advice: Vec<String>,
    pub error: Option<String>,
}

// ===== Gezondheidsscore =====

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct HealthInputs {
    pub max_temp_celsius: Option<f32>,
    pub is_throttling_suspected: bool,
    pub freeze_scanned: bool,
    pub watchdog_freeze_count: usize,
    pub event_log_culprit_count: usize,
    pub battery_health_percent: Option<f64>,
    pub ram_used_percent: f32,
    pub min_disk_free_percent: Option<f32>,
    pub driver_problem_count: Option<usize>,
    pub driver_outdated_count: Option<usize>,
    pub latency_verdict: Option<String>,
    pub latency_max_gap_us: Option<f64>,
    pub dpc_time_percent_max: Option<f64>,
    pub cpu_stress_ok: Option<bool>,
    pub ram_test_ok: Option<bool>,
    pub disk_test_ok: Option<bool>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct HealthCategoryScore {
    pub key: String,
    pub label: String,
    /// 0-100
    pub score: u8,
    pub weight: f32,
    /// "Goed" | "Let op" | "Kritiek" | "Niet getest"
    pub status: String,
    pub detail: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct HealthScore {
    /// 0-100
    pub score: u8,
    /// "A" | "B" | "C" | "D" | "E" | "F"
    pub grade: String,
    pub label: String,
    pub categories: Vec<HealthCategoryScore>,
    pub top_issues: Vec<String>,
}
