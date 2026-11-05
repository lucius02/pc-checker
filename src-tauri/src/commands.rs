//! Alle Tauri-commando's.
//!
//! In Tauri v2 draaien niet-`async` commando's op de hoofdthread: elke trage WMI-query of
//! stresstest bevriest dan het hele venster (en verstoort de eigen freeze-/latencymetingen).
//! Daarom is hier elk commando `async` en gaat het eigenlijke werk via `spawn_blocking` naar een
//! worker-thread. Fouten (incl. een panic in een worker) komen als `Err(String)` bij de UI aan.

use tauri::AppHandle;

use crate::models::*;
use crate::{
    cooling, driver_latency, drivers, elevation, freeze, health, history, latency, monitor, power,
    power_delivery, processes, storage, stress, system,
};

async fn blocking<T, F>(what: &str, f: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> T + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(f).await.map_err(|e| {
        crate::tr!(
            format!("{} is onverwacht afgebroken: {}", what, e),
            format!("{} stopped unexpectedly: {}", what, e)
        )
    })
}

#[tauri::command]
pub async fn get_system_overview() -> Result<SystemOverview, String> {
    blocking(
        crate::tr!("Systeemoverzicht", "System overview"),
        system::get_system_overview,
    )
    .await
}

#[tauri::command]
pub async fn get_power_and_battery_info() -> Result<PowerInfo, String> {
    blocking(
        crate::tr!("Voedingsinformatie", "Power information"),
        power::get_power_and_battery_info,
    )
    .await
}

#[tauri::command]
pub async fn run_battery_health_check() -> Result<BatteryHealthReport, String> {
    blocking(
        crate::tr!("Batterijtest", "Battery test"),
        power::run_battery_health_check,
    )
    .await
}

#[tauri::command]
pub async fn get_cooling_and_fan_info() -> Result<CoolingOverview, String> {
    blocking(
        crate::tr!("Koelingsinformatie", "Cooling information"),
        cooling::get_cooling_and_fan_info,
    )
    .await
}

#[tauri::command]
pub async fn scan_freeze_diagnostic() -> Result<FreezeDiagnosticReport, String> {
    blocking(
        crate::tr!("Freeze-diagnose", "Freeze diagnosis"),
        freeze::scan_freeze_diagnostic,
    )
    .await
}

#[tauri::command]
pub async fn run_cpu_stress_test(
    duration_secs: u64,
    thread_count: Option<usize>,
) -> Result<StressTestResult, String> {
    blocking(crate::tr!("CPU-stresstest", "CPU stress test"), move || {
        stress::run_cpu_stress_test(duration_secs, thread_count)
    })
    .await
}

#[tauri::command]
pub async fn run_ram_stress_test(
    size_mb: usize,
    passes: Option<usize>,
) -> Result<StressTestResult, String> {
    blocking(crate::tr!("RAM-test", "RAM test"), move || {
        stress::run_ram_stress_test(size_mb, passes)
    })
    .await
}

#[tauri::command]
pub async fn run_disk_benchmark(
    target_dir: Option<String>,
    file_size_mb: Option<usize>,
) -> Result<StressTestResult, String> {
    blocking(crate::tr!("Schijftest", "Disk test"), move || {
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
    blocking(crate::tr!("Procesmonitor", "Process monitor"), move || {
        processes::get_process_snapshot(sort_by, limit)
    })
    .await
}

#[tauri::command]
pub async fn get_freeze_process_context() -> Result<Vec<FreezeProcessContext>, String> {
    blocking(
        crate::tr!("Freeze-procescontext", "Freeze process context"),
        processes::get_freeze_process_context,
    )
    .await
}

#[tauri::command]
pub async fn scan_drivers() -> Result<DriverReport, String> {
    blocking(
        crate::tr!("Driver-scan", "Driver scan"),
        drivers::scan_drivers_blocking,
    )
    .await
}

#[tauri::command]
pub async fn open_device_manager() -> Result<(), String> {
    drivers::open_device_manager()
}

#[tauri::command]
pub async fn open_event_viewer() -> Result<(), String> {
    drivers::open_event_viewer()
}

#[tauri::command]
pub async fn open_windows_update() -> Result<(), String> {
    drivers::open_windows_update()
}

#[tauri::command]
pub async fn run_latency_test(duration_secs: u64) -> Result<LatencyTestResult, String> {
    blocking(crate::tr!("Latency-test", "Latency test"), move || {
        latency::run_latency_test_blocking(duration_secs)
    })
    .await
}

#[tauri::command]
pub async fn compute_health_score(inputs: HealthInputs) -> Result<HealthScore, String> {
    blocking(crate::tr!("Gezondheidsscore", "Health score"), move || {
        let score = health::compute_health_score(inputs);
        history::record_health(&score);
        score
    })
    .await
}

#[tauri::command]
pub async fn check_hardware_power_delivery() -> Result<HardwarePowerCheckReport, String> {
    blocking(
        crate::tr!("Stroomtoevoercontrole", "Power delivery check"),
        power_delivery::check_hardware_power_delivery,
    )
    .await
}

#[tauri::command]
pub async fn scan_storage_health() -> Result<StorageHealthReport, String> {
    blocking(
        crate::tr!("Schijfgezondheid", "Disk health"),
        storage::scan_storage_health,
    )
    .await
}

#[tauri::command]
pub async fn get_history() -> Result<HistoryData, String> {
    blocking(crate::tr!("Historie", "History"), history::load).await
}

#[tauri::command]
pub async fn clear_history() -> Result<(), String> {
    blocking(
        crate::tr!("Historie wissen", "Clearing history"),
        history::clear,
    )
    .await?
}

#[tauri::command]
pub async fn get_elevation_status() -> Result<ElevationStatus, String> {
    Ok(elevation::elevation_status())
}

/// Start de app opnieuw als beheerder. Bij succes wordt deze instantie afgesloten;
/// `Ok(false)` betekent dat de gebruiker de UAC-prompt heeft geweigerd.
#[tauri::command]
pub async fn restart_as_admin(app: AppHandle) -> Result<bool, String> {
    let started = blocking(
        crate::tr!("Herstarten als beheerder", "Restarting as administrator"),
        elevation::relaunch_elevated,
    )
    .await??;
    if started {
        app.exit(0);
    }
    Ok(started)
}

/// Per-driver DPC/ISR-meting via ETW (vereist beheerdersrechten).
#[tauri::command]
pub async fn run_driver_latency_trace(duration_secs: u64) -> Result<DriverLatencyReport, String> {
    blocking(
        crate::tr!("Driver-latency-meting", "Driver latency measurement"),
        move || driver_latency::run_driver_latency_trace(duration_secs),
    )
    .await
}

/// Taal van backendteksten ("nl" of "en").
#[tauri::command]
pub async fn set_language(lang: String) -> Result<(), String> {
    crate::i18n::set_language(&lang);
    Ok(())
}
