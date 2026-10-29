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
