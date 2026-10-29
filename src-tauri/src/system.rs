use chrono::Local;
use std::process::Command;
use std::sync::Mutex;
use std::time::Duration;
use sysinfo::{CpuRefreshKind, Disks, MemoryRefreshKind, RefreshKind, System};

use crate::models::{CpuCoreInfo, CpuInfo, DiskInfo, GpuInfo, MotherboardInfo, RamInfo, SystemOverview};
use crate::watchdog::ensure_watchdog_started;

static HARDWARE_CACHE: Mutex<Option<(Vec<GpuInfo>, MotherboardInfo)>> = Mutex::new(None);

fn get_static_hardware() -> (Vec<GpuInfo>, MotherboardInfo) {
    if let Ok(guard) = HARDWARE_CACHE.lock() {
        if let Some(cached) = guard.as_ref() {
            return cached.clone();
        }
    }

    let mut gpus = Vec::new();
    let mut motherboard = MotherboardInfo {
        manufacturer: "Generiek Moederbord".to_string(),
        product: "Systeemkaart".to_string(),
        bios_vendor: "UEFI / BIOS".to_string(),
        bios_version: "Onbekend".to_string(),
    };

    #[cfg(target_os = "windows")]
    {
        let ps_cmd = r#"@{ Gpus = @(Get-CimInstance Win32_VideoController -ErrorAction SilentlyContinue | Select-Object Name, DriverVersion, AdapterRAM); Board = (Get-CimInstance Win32_BaseBoard -ErrorAction SilentlyContinue | Select-Object Manufacturer, Product); Bios = (Get-CimInstance Win32_BIOS -ErrorAction SilentlyContinue | Select-Object Manufacturer, SMBIOSBIOSVersion) } | ConvertTo-Json -Compress"#;
        let output = Command::new("powershell")
            .args(&["-NoProfile", "-Command", ps_cmd])
            .output();

        if let Ok(out) = output {
            let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&text) {
                // GPUs
                if let Some(arr) = val["Gpus"].as_array() {
                    for it in arr {
                        let name = it["Name"].as_str().unwrap_or("").trim().to_string();
                        if !name.is_empty() {
                            let driver_version = it["DriverVersion"].as_str().unwrap_or("").trim().to_string();
                            let vram_bytes = it["AdapterRAM"].as_u64().unwrap_or(0);
                            gpus.push(GpuInfo {
                                name,
                                driver_version,
                                vram_bytes,
                            });
                        }
                    }
                }

                // Motherboard
                if let Some(mfg) = val["Board"]["Manufacturer"].as_str() {
                    let trimmed = mfg.trim();
                    if !trimmed.is_empty() {
                        motherboard.manufacturer = trimmed.to_string();
                    }
                }
                if let Some(prod) = val["Board"]["Product"].as_str() {
                    let trimmed = prod.trim();
                    if !trimmed.is_empty() {
                        motherboard.product = trimmed.to_string();
                    }
                }

                // BIOS
                if let Some(v) = val["Bios"]["Manufacturer"].as_str() {
                    let trimmed = v.trim();
                    if !trimmed.is_empty() {
                        motherboard.bios_vendor = trimmed.to_string();
                    }
                }
                if let Some(v) = val["Bios"]["SMBIOSBIOSVersion"].as_str() {
                    let trimmed = v.trim();
                    if !trimmed.is_empty() {
                        motherboard.bios_version = trimmed.to_string();
                    }
                }
            }
        }
    }

    if gpus.is_empty() {
        gpus.push(GpuInfo {
            name: "Geïntegreerde Grafische Adapter".to_string(),
            driver_version: "".to_string(),
            vram_bytes: 0,
        });
    }

    let result = (gpus, motherboard);
    if let Ok(mut guard) = HARDWARE_CACHE.lock() {
        *guard = Some(result.clone());
    }

    result
}

pub fn calculate_session_uptime(kernel_uptime: u64) -> (u64, String) {
    let output = Command::new("powershell")
        .args(&[
            "-NoProfile",
            "-Command",
            "(Get-WinEvent -FilterHashtable @{LogName='System'; ProviderName='Microsoft-Windows-Kernel-Power','Microsoft-Windows-Power-Troubleshooter'; Id=507, 107, 1} -MaxEvents 1 -ErrorAction SilentlyContinue).TimeCreated.ToString('yyyy-MM-dd HH:mm:ss')",
        ])
        .output();

    if let Ok(out) = output {
        let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if !text.is_empty() {
            if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(&text, "%Y-%m-%d %H:%M:%S") {
                let now = Local::now().naive_local();
                let diff = now.signed_duration_since(dt);
                if diff.num_seconds() > 0 {
                    let secs = diff.num_seconds() as u64;
                    let started_at = if dt.date() == now.date() {
                        format!("Vandaag om {}", dt.format("%H:%M"))
                    } else {
                        dt.format("%d-%m om %H:%M").to_string()
                    };
                    return (secs, started_at);
                }
            }
        }
    }

    (kernel_uptime, "Sinds koude systeemstart".to_string())
}

#[tauri::command]
pub fn get_system_overview() -> SystemOverview {
    ensure_watchdog_started();

    let (gpus, motherboard) = get_static_hardware();

    let mut sys = match System::new_with_specifics(
        RefreshKind::nothing()
            .with_cpu(CpuRefreshKind::everything())
            .with_memory(MemoryRefreshKind::everything()),
    ) {
        Ok(s) => s,
        Err(_) => match System::new() {
            Ok(s) => s,
            Err(_) => {
                return SystemOverview {
                    os_name: "Windows".to_string(),
                    os_version: "".to_string(),
                    host_name: "".to_string(),
                    kernel_version: "".to_string(),
                    kernel_uptime_secs: 0,
                    session_uptime_secs: 0,
                    session_started_at: "".to_string(),
                    cpu: CpuInfo {
                        brand: "".to_string(),
                        vendor_id: "".to_string(),
                        physical_cores: 0,
                        logical_cores: 0,
                        global_usage: 0.0,
                        cores: vec![],
                    },
                    ram: RamInfo {
                        total_bytes: 0,
                        used_bytes: 0,
                        free_bytes: 0,
                        total_swap_bytes: 0,
                        used_swap_bytes: 0,
                    },
                    disks: vec![],
                    gpus,
                    motherboard,
                }
            }
        },
    };

    std::thread::sleep(Duration::from_millis(150));
    sys.refresh_cpu_all();
    sys.refresh_memory();

    let cpus = sys.cpus();
    let global_usage = sys.global_cpu_usage();
    let brand = cpus.first().map(|c| c.brand().to_string()).unwrap_or_else(|| "CPU".to_string());
    let vendor_id = cpus.first().map(|c| c.vendor_id().to_string()).unwrap_or_default();

    let cores = cpus
        .iter()
        .map(|c| CpuCoreInfo {
            name: c.name().to_string(),
            usage: c.usage(),
            frequency_mhz: c.frequency(),
        })
        .collect();

    let physical_cores = System::physical_core_count().unwrap_or(cpus.len());
    let logical_cores = cpus.len();

    let cpu = CpuInfo {
        brand,
        vendor_id,
        physical_cores,
        logical_cores,
        global_usage,
        cores,
    };

    let ram = RamInfo {
        total_bytes: sys.total_memory(),
        used_bytes: sys.used_memory(),
        free_bytes: sys.free_memory(),
        total_swap_bytes: sys.total_swap(),
        used_swap_bytes: sys.used_swap(),
    };

    let disks_obj = Disks::new_with_refreshed_list();
    let disks = match disks_obj {
        Ok(d_list) => d_list
            .iter()
            .map(|d| {
                let disk_kind = format!("{:?}", d.kind());
                DiskInfo {
                    name: d.name().to_string_lossy().to_string(),
                    mount_point: d.mount_point().to_string_lossy().to_string(),
                    file_system: d.file_system().to_string_lossy().to_string(),
                    total_bytes: d.total_space(),
                    available_bytes: d.available_space(),
                    is_removable: d.is_removable(),
                    disk_type: disk_kind,
                }
            })
            .collect(),
        Err(_) => Vec::new(),
    };

    let kernel_uptime_secs = System::uptime().unwrap_or(0);
    let (session_uptime_secs, session_started_at) = calculate_session_uptime(kernel_uptime_secs);

    SystemOverview {
        os_name: System::name().ok().unwrap_or_else(|| "Windows".to_string()),
        os_version: System::os_version().ok().unwrap_or_default(),
        host_name: System::host_name().ok().unwrap_or_default(),
        kernel_version: System::kernel_version().ok().unwrap_or_default(),
        kernel_uptime_secs,
        session_uptime_secs,
        session_started_at,
        cpu,
        ram,
        disks,
        gpus,
        motherboard,
    }
}
