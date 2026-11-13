use chrono::Local;
use std::sync::Mutex;
use std::time::Duration;
use sysinfo::{CpuRefreshKind, Disks, MemoryRefreshKind, RefreshKind, System};

use crate::models::{
    CpuCoreInfo, CpuInfo, DiskInfo, GpuInfo, MotherboardInfo, RamInfo, SystemOverview,
};
use crate::watchdog::ensure_watchdog_started;

static HARDWARE_CACHE: Mutex<Option<(Vec<GpuInfo>, MotherboardInfo)>> = Mutex::new(None);
static SESSION_START_CACHE: Mutex<Option<(chrono::NaiveDateTime, String)>> = Mutex::new(None);

fn get_static_hardware() -> (Vec<GpuInfo>, MotherboardInfo) {
    if let Ok(guard) = HARDWARE_CACHE.lock()
        && let Some(cached) = guard.as_ref()
    {
        return cached.clone();
    }

    let mut gpus = Vec::new();
    let mut motherboard = MotherboardInfo {
        manufacturer: crate::tr!("Generiek Moederbord", "Generic motherboard").to_string(),
        product: crate::tr!("Systeemkaart", "System board").to_string(),
        bios_vendor: "UEFI / BIOS".to_string(),
        bios_version: crate::tr!("Onbekend", "Unknown").to_string(),
    };

    #[cfg(windows)]
    query_static_hardware_wmi(&mut gpus, &mut motherboard);
    #[cfg(target_os = "linux")]
    query_static_hardware_linux(&mut gpus, &mut motherboard);

    if gpus.is_empty() {
        gpus.push(GpuInfo {
            name: crate::tr!(
                "Geïntegreerde Grafische Adapter",
                "Integrated graphics adapter"
            )
            .to_string(),
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

fn set_if_present(target: &mut String, value: Option<String>) {
    if let Some(v) = value
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
    {
        *target = v;
    }
}

/// Native WMI-query (geen PowerShell-proces): GPU's, moederbord en BIOS.
#[cfg(windows)]
fn query_static_hardware_wmi(gpus: &mut Vec<GpuInfo>, motherboard: &mut MotherboardInfo) {
    use serde::Deserialize;
    use wmi::WMIConnection;

    #[derive(Deserialize)]
    #[serde(rename = "Win32_VideoController", rename_all = "PascalCase")]
    struct VideoController {
        name: Option<String>,
        driver_version: Option<String>,
        #[serde(rename = "AdapterRAM")]
        adapter_ram: Option<u32>,
    }
    #[derive(Deserialize)]
    #[serde(rename = "Win32_BaseBoard", rename_all = "PascalCase")]
    struct BaseBoard {
        manufacturer: Option<String>,
        product: Option<String>,
    }
    #[derive(Deserialize)]
    #[serde(rename = "Win32_BIOS")]
    struct Bios {
        #[serde(rename = "Manufacturer")]
        manufacturer: Option<String>,
        #[serde(rename = "SMBIOSBIOSVersion")]
        version: Option<String>,
    }

    let Ok(con) = WMIConnection::new() else {
        return;
    };
    if let Ok(list) = con.query::<VideoController>() {
        for vc in list {
            let name = vc.name.unwrap_or_default().trim().to_string();
            if !name.is_empty() {
                gpus.push(GpuInfo {
                    name,
                    driver_version: vc.driver_version.unwrap_or_default().trim().to_string(),
                    vram_bytes: vc.adapter_ram.unwrap_or(0) as u64,
                });
            }
        }
    }
    if let Some(board) = con
        .query::<BaseBoard>()
        .ok()
        .and_then(|v| v.into_iter().next())
    {
        set_if_present(&mut motherboard.manufacturer, board.manufacturer);
        set_if_present(&mut motherboard.product, board.product);
    }
    if let Some(bios) = con.query::<Bios>().ok().and_then(|v| v.into_iter().next()) {
        set_if_present(&mut motherboard.bios_vendor, bios.manufacturer);
        set_if_present(&mut motherboard.bios_version, bios.version);
    }
}

/// Linux: DMI-gegevens uit sysfs en GPU's via `lspci` (indien aanwezig).
#[cfg(target_os = "linux")]
fn query_static_hardware_linux(gpus: &mut Vec<GpuInfo>, motherboard: &mut MotherboardInfo) {
    let dmi = |f: &str| std::fs::read_to_string(format!("/sys/class/dmi/id/{f}")).ok();
    set_if_present(&mut motherboard.manufacturer, dmi("board_vendor"));
    set_if_present(&mut motherboard.product, dmi("board_name"));
    set_if_present(&mut motherboard.bios_vendor, dmi("bios_vendor"));
    set_if_present(&mut motherboard.bios_version, dmi("bios_version"));

    if let Ok(out) = crate::shell::hidden_command("lspci").output() {
        gpus.extend(parse_lspci_gpus(&String::from_utf8_lossy(&out.stdout)));
    }
}

/// Haalt GPU-regels uit `lspci`-uitvoer ("00:02.0 VGA compatible controller: Intel ...").
pub fn parse_lspci_gpus(text: &str) -> Vec<GpuInfo> {
    text.lines()
        .filter(|l| {
            l.contains("VGA compatible controller")
                || l.contains("3D controller")
                || l.contains("Display controller")
        })
        .filter_map(|l| l.splitn(3, ':').nth(2))
        .map(|name| GpuInfo {
            name: name.trim().to_string(),
            driver_version: String::new(),
            vram_bytes: 0,
        })
        .collect()
}

pub fn calculate_session_uptime(kernel_uptime: u64) -> (u64, String) {
    let now = Local::now().naive_local();

    // Check if session start was already calculated once (persists for the entire app session)
    if let Ok(guard) = SESSION_START_CACHE.lock()
        && let Some((dt, ref started_at)) = *guard
    {
        let diff = now.signed_duration_since(dt);
        let secs = if diff.num_seconds() > 0 {
            diff.num_seconds() as u64
        } else {
            kernel_uptime
        };
        return (secs, started_at.clone());
    }

    // Laatste ontwaak-/opstartmoment (slaapstand en Fast Startup tellen niet als "nieuwe boot").
    let output = if cfg!(windows) {
        crate::shell::run_ps(
            "(Get-WinEvent -FilterHashtable @{LogName='System'; ProviderName='Microsoft-Windows-Kernel-Power','Microsoft-Windows-Power-Troubleshooter'; Id=507, 107, 1} -MaxEvents 1 -ErrorAction SilentlyContinue).TimeCreated.ToString('yyyy-MM-dd HH:mm:ss')",
        )
    } else {
        None
    };

    if let Some(text) = output.map(|o| o.trim().to_string())
        && !text.is_empty()
        && let Ok(dt) = chrono::NaiveDateTime::parse_from_str(&text, "%Y-%m-%d %H:%M:%S")
    {
        let diff = now.signed_duration_since(dt);
        if diff.num_seconds() > 0 {
            let secs = diff.num_seconds() as u64;
            let started_at = if dt.date() == now.date() {
                crate::tr!(
                    format!("Vandaag om {}", dt.format("%H:%M")),
                    format!("Today at {}", dt.format("%H:%M"))
                )
            } else {
                dt.format(crate::tr!("%d-%m om %H:%M", "%d-%m at %H:%M"))
                    .to_string()
            };
            if let Ok(mut guard) = SESSION_START_CACHE.lock() {
                *guard = Some((dt, started_at.clone()));
            }
            return (secs, started_at);
        }
    }

    let default_str = crate::tr!("Sinds koude systeemstart", "Since cold boot").to_string();
    if let Ok(mut guard) = SESSION_START_CACHE.lock() {
        *guard = Some((
            now - chrono::Duration::seconds(kernel_uptime as i64),
            default_str.clone(),
        ));
    }
    (kernel_uptime, default_str)
}

/// Bestandssystemen zonder eigen, beschrijfbare opslag: container-lagen, ingepakte apps
/// (snap/AppImage), RAM-schijven en optische schijven of gekoppelde ISO's. Die staan altijd op
/// "0% vrij" of 0 B en gaven anders een vals "schijf vol"/"Kritiek" in de gezondheidsscore.
const NON_STORAGE_FS: &[&str] = &[
    "overlay", "squashfs", "tmpfs", "devtmpfs", "ramfs", "iso9660", "udf", "cdfs",
];

/// Hoort dit volume in de schijvenlijst (capaciteit, "bijna vol"-waarschuwingen, score)?
pub fn is_storage_volume(file_system: &str, total_bytes: u64) -> bool {
    let fs = file_system.to_ascii_lowercase();
    total_bytes > 0 && !NON_STORAGE_FS.contains(&fs.as_str()) && !fs.contains("appimage")
}

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
                };
            }
        },
    };

    std::thread::sleep(Duration::from_millis(150));
    sys.refresh_cpu_all();
    sys.refresh_memory();

    let cpus = sys.cpus();
    let global_usage = sys.global_cpu_usage();
    let brand = cpus
        .first()
        .map(|c| c.brand().to_string())
        .unwrap_or_else(|| "CPU".to_string());
    let vendor_id = cpus
        .first()
        .map(|c| c.vendor_id().to_string())
        .unwrap_or_default();

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
            .filter(|d| is_storage_volume(&d.file_system().to_string_lossy(), d.total_space()))
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lspci_gpu_lines_are_parsed() {
        let out = "00:00.0 Host bridge: Intel Corporation Device 9a14
00:02.0 VGA compatible controller: Intel Corporation TigerLake GT2 [Iris Xe Graphics]
01:00.0 3D controller: NVIDIA Corporation GA107M [GeForce RTX 3050 Mobile]
";
        let gpus = parse_lspci_gpus(out);
        assert_eq!(gpus.len(), 2);
        assert_eq!(
            gpus[0].name,
            "Intel Corporation TigerLake GT2 [Iris Xe Graphics]"
        );
        assert!(gpus[1].name.contains("RTX 3050"));
    }

    #[test]
    fn pseudo_and_read_only_volumes_are_not_storage() {
        assert!(is_storage_volume("NTFS", 500 << 30));
        assert!(is_storage_volume("btrfs", 500 << 30));
        assert!(is_storage_volume("fuseblk", 1 << 40)); // NTFS-schijf via ntfs-3g
        assert!(!is_storage_volume("ext4", 0));
        assert!(!is_storage_volume("overlay", 0)); // Docker
        assert!(!is_storage_volume("fuse.orca-linux.AppImage", 256 << 20));
        assert!(!is_storage_volume("squashfs", 100 << 20)); // snap
        assert!(!is_storage_volume("CDFS", 4 << 30)); // dvd-station (Windows)
        assert!(!is_storage_volume("UDF", 4 << 30));
        assert!(!is_storage_volume("iso9660", 700 << 20));
    }
}
