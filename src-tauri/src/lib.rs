pub mod cooling;
pub mod drivers;
pub mod freeze;
pub mod health;
pub mod latency;
pub mod models;
pub mod monitor;
pub mod power;
pub mod power_delivery;
pub mod processes;
pub mod stress;
pub mod system;
pub mod watchdog;

// Re-export models and commands for clean public API and test access
pub use cooling::get_cooling_and_fan_info;
pub use drivers::{open_device_manager, open_windows_update, scan_drivers};
pub use freeze::scan_freeze_diagnostic;
pub use health::compute_health_score;
pub use latency::run_latency_test;
pub use models::*;
pub use monitor::get_metrics_history;
pub use power::{get_power_and_battery_info, run_battery_health_check};
pub use power_delivery::check_hardware_power_delivery;
pub use processes::{get_freeze_process_context, get_process_snapshot};
pub use stress::{run_cpu_stress_test, run_disk_benchmark, run_ram_stress_test};
pub use system::get_system_overview;
pub use watchdog::ensure_watchdog_started;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    ensure_watchdog_started();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            monitor::start(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_system_overview,
            get_power_and_battery_info,
            run_battery_health_check,
            get_cooling_and_fan_info,
            scan_freeze_diagnostic,
            run_cpu_stress_test,
            run_ram_stress_test,
            run_disk_benchmark,
            get_metrics_history,
            get_process_snapshot,
            get_freeze_process_context,
            scan_drivers,
            open_device_manager,
            open_windows_update,
            run_latency_test,
            compute_health_score,
            check_hardware_power_delivery
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
