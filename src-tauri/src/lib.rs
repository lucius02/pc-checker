pub mod commands;
pub mod cooling;
pub mod driver_latency;
pub mod drivers;
pub mod elevation;
pub mod freeze;
pub mod freeze_advice;
pub mod health;
pub mod history;
pub mod i18n;
pub mod latency;
pub mod latency_explain;
pub mod models;
pub mod monitor;
pub mod power;
pub mod power_delivery;
pub mod processes;
pub mod shell;
pub mod storage;
pub mod stress;
pub mod system;
pub mod watchdog;

// Blokkerende implementaties (o.a. voor tests); de Tauri-commando's staan in `commands`.
pub use cooling::get_cooling_and_fan_info;
pub use freeze::scan_freeze_diagnostic;
pub use models::*;
pub use power::{get_power_and_battery_info, run_battery_health_check};
pub use stress::{run_cpu_stress_test, run_disk_benchmark, run_ram_stress_test};
pub use system::get_system_overview;
pub use watchdog::ensure_watchdog_started;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    ensure_watchdog_started();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            if let Ok(dir) = app.path().app_data_dir() {
                history::init(dir);
                // Freezes die vóór de initialisatie al door de Watchdog zijn gezien.
                for rec in watchdog::get_freeze_records() {
                    history::record_freeze(rec);
                }
            }
            monitor::start(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_system_overview,
            commands::get_power_and_battery_info,
            commands::run_battery_health_check,
            commands::get_cooling_and_fan_info,
            commands::scan_freeze_diagnostic,
            commands::run_cpu_stress_test,
            commands::run_ram_stress_test,
            commands::run_disk_benchmark,
            commands::get_metrics_history,
            commands::get_process_snapshot,
            commands::get_freeze_process_context,
            commands::scan_drivers,
            commands::open_device_manager,
            commands::open_windows_update,
            commands::open_event_viewer,
            commands::run_latency_test,
            commands::compute_health_score,
            commands::check_hardware_power_delivery,
            commands::scan_storage_health,
            commands::get_history,
            commands::clear_history,
            commands::get_elevation_status,
            commands::restart_as_admin,
            commands::run_driver_latency_trace,
            commands::set_language
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_system_overview_metrics() {
        let overview = get_system_overview();
        assert!(!overview.os_name.is_empty(), "OS name should not be empty");
        assert!(
            overview.cpu.logical_cores > 0,
            "Logical cores should be > 0"
        );
        assert!(overview.ram.total_bytes > 0, "Total RAM should be > 0");
        assert!(!overview.session_started_at.is_empty());
        assert!(!overview.gpus.is_empty(), "GPUs should not be empty");
        assert!(
            !overview.motherboard.manufacturer.is_empty(),
            "Motherboard should not be empty"
        );
        println!(
            "Session uptime: {}s | GPU: {} | Moederbord: {} {}",
            overview.session_uptime_secs,
            overview.gpus[0].name,
            overview.motherboard.manufacturer,
            overview.motherboard.product
        );
    }

    #[test]
    fn test_power_and_battery_info() {
        let power = get_power_and_battery_info();
        assert!(!power.power_plan_name.is_empty());
        assert!(!power.battery_status_desc.is_empty());
    }

    #[test]
    fn test_battery_health_check() {
        let batt = run_battery_health_check();
        assert!(!batt.grade.is_empty());
        println!(
            "Battery Health: {:.1}% | Wear: {:.1}% | Grade: {}",
            batt.health_percent, batt.wear_percent, batt.grade
        );
    }

    #[test]
    fn test_cooling_and_fans() {
        let cooling = get_cooling_and_fan_info();
        assert!(!cooling.summary.is_empty());
        println!(
            "Cooling Summary: {} | Temp sensors: {}",
            cooling.summary,
            cooling.temperatures.len()
        );
    }

    #[test]
    fn test_freeze_diagnostic_scanner() {
        let diag = scan_freeze_diagnostic();
        assert!(!diag.system_freeze_risk.is_empty());
        assert!(!diag.recommended_actions.is_empty());
    }

    #[test]
    fn test_cpu_stress_computation() {
        let result = run_cpu_stress_test(1, Some(2));
        assert!(result.success);
    }

    #[test]
    fn test_ram_integrity_check() {
        let result = run_ram_stress_test(16, Some(1));
        assert!(result.success);
    }

    #[test]
    fn test_disk_benchmark_and_cleanup() {
        let result = run_disk_benchmark(None, Some(16));
        assert!(result.success);
    }
}
