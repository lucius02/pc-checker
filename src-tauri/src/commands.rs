//! Alle Tauri-commando's.
//!
//! In Tauri v2 draaien niet-`async` commando's op de hoofdthread: elke trage WMI-query of
//! stresstest bevriest dan het hele venster (en verstoort de eigen freeze-/latencymetingen).
//! Daarom is hier elk commando `async` en gaat het eigenlijke werk via `spawn_blocking` naar een
//! worker-thread. Fouten (incl. een panic in een worker) komen als `Err(String)` bij de UI aan.

use tauri::AppHandle;

use crate::models::*;
use crate::{
    cooling, drivers, elevation, freeze, health, history, latency, monitor, power, power_delivery,
    processes, storage, stress, system,
};

async fn blocking<T, F>(what: &str, f: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> T + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| format!("{} is onverwacht afgebroken: {}", what, e))
}

#[tauri::command]
pub async fn get_system_overview() -> Result<SystemOverview, String> {
    blocking("Systeemoverzicht", system::get_system_overview).await
}

#[tauri::command]
pub async fn get_power_and_battery_info() -> Result<PowerInfo, String> {
    blocking("Voedingsinformatie", power::get_power_and_battery_info).await
}

#[tauri::command]
pub async fn run_battery_health_check() -> Result<BatteryHealthReport, String> {
    blocking("Batterijtest", power::run_battery_health_check).await
}

#[tauri::command]
pub async fn get_cooling_and_fan_info() -> Result<CoolingOverview, String> {
    blocking("Koelingsinformatie", cooling::get_cooling_and_fan_info).await
}

#[tauri::command]
pub async fn scan_freeze_diagnostic() -> Result<FreezeDiagnosticReport, String> {
    blocking("Freeze-diagnose", freeze::scan_freeze_diagnostic).await
}

#[tauri::command]
pub async fn run_cpu_stress_test(
    duration_secs: u64,
    thread_count: Option<usize>,
) -> Result<StressTestResult, String> {
    blocking("CPU-stresstest", move || {
        stress::run_cpu_stress_test(duration_secs, thread_count)
    })
    .await
}

#[tauri::command]
pub async fn run_ram_stress_test(
    size_mb: usize,
    passes: Option<usize>,
) -> Result<StressTestResult, String> {
    blocking("RAM-test", move || {
        stress::run_ram_stress_test(size_mb, passes)
    })
    .await
}

#[tauri::command]
pub async fn run_disk_benchmark(
    target_dir: Option<String>,
    file_size_mb: Option<usize>,
) -> Result<StressTestResult, String> {
    blocking("Schijftest", move || {
        stress::run_disk_benchmark(target_dir, file_size_mb)
    })
    .await
}

#[tauri::command]
pub async fn get_metrics_history() -> Result<MetricsHistory, String> {
    Ok(monitor::get_metrics_history())
}

#[tauri::command]
pub async fn get_process_snapshot(
    sort_by: Option<String>,
    limit: Option<usize>,
) -> Result<ProcessSnapshot, String> {
    blocking("Procesmonitor", move || {
        processes::get_process_snapshot(sort_by, limit)
    })
    .await
}

#[tauri::command]
pub async fn get_freeze_process_context() -> Result<Vec<FreezeProcessContext>, String> {
    blocking(
        "Freeze-procescontext",
        processes::get_freeze_process_context,
    )
    .await
}

#[tauri::command]
pub async fn scan_drivers() -> Result<DriverReport, String> {
    blocking("Driver-scan", drivers::scan_drivers_blocking).await
}

#[tauri::command]
pub async fn open_device_manager() -> Result<(), String> {
    drivers::open_device_manager()
}

#[tauri::command]
pub async fn open_windows_update() -> Result<(), String> {
    drivers::open_windows_update()
}

#[tauri::command]
pub async fn run_latency_test(duration_secs: u64) -> Result<LatencyTestResult, String> {
    blocking("Latency-test", move || {
        latency::run_latency_test_blocking(duration_secs)
    })
    .await
}

#[tauri::command]
pub async fn compute_health_score(inputs: HealthInputs) -> Result<HealthScore, String> {
    blocking("Gezondheidsscore", move || {
        let score = health::compute_health_score(inputs);
        history::record_health(&score);
        score
    })
    .await
}

#[tauri::command]
pub async fn check_hardware_power_delivery() -> Result<HardwarePowerCheckReport, String> {
    blocking(
        "Stroomtoevoercontrole",
        power_delivery::check_hardware_power_delivery,
    )
    .await
}

#[tauri::command]
pub async fn scan_storage_health() -> Result<StorageHealthReport, String> {
    blocking("Schijfgezondheid", storage::scan_storage_health).await
}

#[tauri::command]
pub async fn get_history() -> Result<HistoryData, String> {
    blocking("Historie", history::load).await
}

#[tauri::command]
pub async fn clear_history() -> Result<(), String> {
    blocking("Historie wissen", history::clear).await?
}

#[tauri::command]
pub async fn get_elevation_status() -> Result<ElevationStatus, String> {
    Ok(elevation::elevation_status())
}

/// Start de app opnieuw als beheerder. Bij succes wordt deze instantie afgesloten;
/// `Ok(false)` betekent dat de gebruiker de UAC-prompt heeft geweigerd.
#[tauri::command]
pub async fn restart_as_admin(app: AppHandle) -> Result<bool, String> {
    let started = blocking("Herstarten als beheerder", elevation::relaunch_elevated).await??;
    if started {
        app.exit(0);
    }
    Ok(started)
}
