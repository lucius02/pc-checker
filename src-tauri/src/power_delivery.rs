use serde_json::Value;

use crate::models::{HardwarePowerCheckReport, PowerComponentCheck};
use crate::power::{WinSystemPowerStatus, get_system_power_status};
use crate::shell::run_ps_json;
use crate::watchdog::ensure_watchdog_started;

/// Evalueert de stroomtoevoer op basis van WMI/EventLog telemetrie en Windows Power API.
pub fn evaluate_hardware_power(
    ps_data: &Value,
    power_status: WinSystemPowerStatus,
) -> HardwarePowerCheckReport {
    let cpu_name = ps_data["CpuName"]
        .as_str()
        .unwrap_or("Processor")
        .to_string();
    let cpu_clock = ps_data["CpuClock"].as_u64().unwrap_or(0);
    let cpu_max = ps_data["CpuMax"].as_u64().unwrap_or(0);

    let gpu_names = ps_data["GpuNames"]
        .as_str()
        .unwrap_or(crate::tr!("Videokaart", "Graphics card"))
        .to_string();
    let gpu_statuses = ps_data["GpuStatuses"].as_str().unwrap_or("OK").to_string();

    let usb_count = ps_data["UsbCount"].as_u64().unwrap_or(0);
    let usb_statuses = ps_data["UsbStatuses"].as_str().unwrap_or("OK").to_string();

    let disk_count = ps_data["DiskCount"].as_u64().unwrap_or(0);
    let disk_statuses = ps_data["DiskStatuses"].as_str().unwrap_or("OK").to_string();

    let kp41_count = ps_data["KP41Count"].as_u64().unwrap_or(0) as u32;
    let kpp37_count = ps_data["KPP37Count"].as_u64().unwrap_or(0) as u32;
    let usb_surge_count = ps_data["UsbSurgeCount"].as_u64().unwrap_or(0) as u32;

    let ac_connected = power_status.ac_line_status == 1;
    let is_laptop =
        (power_status.battery_flag & 128) == 0 && power_status.battery_life_percent <= 100;
    let is_discharging = (power_status.battery_flag & 1) != 0;

    let mut checks = Vec::new();
    let mut penalty: u32 = 0;
    let mut recommendations = Vec::new();

    // 1. CPU Voeding & Throttling
    let cpu_is_throttled =
        kpp37_count > 0 || (cpu_max > 0 && cpu_clock > 0 && cpu_clock < (cpu_max * 35 / 100));
    let (cpu_status, cpu_ok, cpu_details) = if cpu_is_throttled {
        penalty += 25;
        recommendations.push(
            crate::tr!("CPU vermogensbeperking gedetecteerd (Power Limit Throttling). Controleer de VRM-temperatuur en sluit de officiële zwaardere adapter aan.", "CPU power limit detected (power limit throttling). Check the VRM temperature and connect the official, more powerful adapter.").to_string(),
        );
        (
            "Waarschuwing".to_string(),
            false,
            crate::tr!(
                format!(
                    "Processor kloksnelheid ({cpu_clock} MHz) wordt geremd door systeemfirmware of stroomlimieten ({kpp37_count} throttling events geregistreerd)."
                ),
                format!(
                    "Processor clock speed ({cpu_clock} MHz) is held back by system firmware or power limits ({kpp37_count} throttling events recorded)."
                )
            ),
        )
    } else {
        (
            "OK".to_string(),
            true,
            crate::tr!(
                format!(
                    "Processor VRM-stroomtoevoer is stabiel. De CPU ({cpu_name}) werkt op {cpu_clock} MHz zonder stroombeperkingen."
                ),
                format!(
                    "Processor VRM power delivery is stable. The CPU ({cpu_name}) runs at {cpu_clock} MHz without power limits."
                )
            ),
        )
    };
    checks.push(PowerComponentCheck {
        name: crate::tr!(
            "Processor (CPU) Voedingslijnen & VRM",
            "Processor (CPU) power rails & VRM"
        )
        .to_string(),
        status: cpu_status,
        is_sufficient: cpu_ok,
        metric: crate::tr!(
            format!("{cpu_clock} MHz / {cpu_max} MHz basisklok • {kpp37_count} throttling events"),
            format!("{cpu_clock} MHz / {cpu_max} MHz base clock • {kpp37_count} throttling events")
        ),
        details: cpu_details,
    });

    // 2. GPU & PCIe Stroom
    let gpu_has_error = gpu_statuses.to_uppercase().contains("ERROR")
        || gpu_statuses.to_uppercase().contains("DEGRADED");
    let (gpu_status, gpu_ok, gpu_details) = if gpu_has_error {
        penalty += 20;
        recommendations.push(
            crate::tr!("Een videokaart rapporteert een storingsstatus. Controleer de PCIe-voedingskabels (6/8-pins aansluitingen).", "A graphics card reports a fault status. Check the PCIe power cables (6/8-pin connectors).").to_string(),
        );
        (
            "Kritiek".to_string(),
            false,
            crate::tr!(
                format!("Grafische kaart ({gpu_names}) meldt statusafwijking: {gpu_statuses}."),
                format!("Graphics card ({gpu_names}) reports an abnormal status: {gpu_statuses}.")
            ),
        )
    } else {
        (
            "OK".to_string(),
            true,
            crate::tr!(
                format!(
                    "PCIe-voedingsrail naar GPU ({gpu_names}) functioneert normaal. Geen spanningsdips gedetecteerd."
                ),
                format!(
                    "PCIe power rail to the GPU ({gpu_names}) works normally. No voltage dips detected."
                )
            ),
        )
    };
    checks.push(PowerComponentCheck {
        name: crate::tr!(
            "Grafische Kaart (GPU) & PCIe Vermogen",
            "Graphics card (GPU) & PCIe power"
        )
        .to_string(),
        status: gpu_status,
        is_sufficient: gpu_ok,
        metric: format!("{gpu_names} • Status: {gpu_statuses}"),
        details: gpu_details,
    });

    // 3. USB Hubs & Overstroombeveiliging
    let usb_has_surge = usb_surge_count > 0
        || usb_statuses.to_uppercase().contains("ERROR")
        || usb_statuses.to_uppercase().contains("DEGRADED");
    let (usb_status, usb_ok, usb_details) = if usb_has_surge {
        penalty += 20;
        recommendations.push(
            crate::tr!("USB Overstroom (Power Surge) gedetecteerd! Een aangesloten USB-accessoire trekt te veel stroom. Koppel onnodige USB-apparaten los of gebruik een powered hub.", "USB overcurrent (power surge) detected! A connected USB accessory draws too much current. Disconnect unnecessary USB devices or use a powered hub.").to_string(),
        );
        (
            "Kritiek".to_string(),
            false,
            crate::tr!(
                format!(
                    "{usb_surge_count} overstroompieken (USB Power Surge) vastgelegd in Windows Event Log. Beveiliging is geactiveerd om poortschade te voorkomen."
                ),
                format!(
                    "{usb_surge_count} overcurrent spikes (USB power surge) recorded in the Windows event log. Protection was triggered to prevent port damage."
                )
            ),
        )
    } else {
        (
            "OK".to_string(),
            true,
            crate::tr!(
                format!(
                    "{usb_count} USB-hubs en poortcircuits actief. Geen overbelasting van de 5V/9V/20V spanningsrails."
                ),
                format!(
                    "{usb_count} USB hubs and port circuits active. No overload of the 5V/9V/20V rails."
                )
            ),
        )
    };
    checks.push(PowerComponentCheck {
        name: crate::tr!(
            "USB Poorten & Randapparatuur (5V Overstroom)",
            "USB ports & peripherals (5V overcurrent)"
        )
        .to_string(),
        status: usb_status,
        is_sufficient: usb_ok,
        metric: crate::tr!(
            format!("{usb_count} hubs actief • {usb_surge_count} overstroompieken"),
            format!("{usb_count} hubs active • {usb_surge_count} overcurrent spikes")
        ),
        details: usb_details,
    });

    // 4. Opslag (NVMe/SSD) & Moederbord 12V Rail
    let disk_has_error = disk_statuses.to_uppercase().contains("ERROR");
    let has_dirty_powercuts = kp41_count > 0;
    let (disk_status, disk_ok, disk_details) = if disk_has_error {
        penalty += 25;
        recommendations.push(crate::tr!("Een opslagmedium meldt hardwarefouten door mogelijke spanningsuitval. Maak direct een back-up.", "A storage device reports hardware errors, possibly from power loss. Make a backup immediately.").to_string());
        (
            "Kritiek".to_string(),
            false,
            crate::tr!(
                format!("Opslagschijven melden fout: {disk_statuses}."),
                format!("Storage drives report an error: {disk_statuses}.")
            ),
        )
    } else if has_dirty_powercuts {
        penalty += 15;
        recommendations.push(
            crate::tr!(format!("Er zijn {kp41_count} onverwachte stroomonderbrekingen (Kernel-Power 41) gevonden. Controleer stekkers en de voedingseenheid (PSU)."), format!("{kp41_count} unexpected power interruptions (Kernel-Power 41) were found. Check the plugs and the power supply unit (PSU)."))
        );
        (
            "Waarschuwing".to_string(),
            true,
            crate::tr!(
                format!(
                    "Opslagschijven zijn operationeel ({disk_count} schijven OK), maar Windows registreerde {kp41_count} abrupte stroomonderbrekingen (Kernel-Power 41)."
                ),
                format!(
                    "Storage drives are operational ({disk_count} drives OK), but Windows recorded {kp41_count} abrupt power interruptions (Kernel-Power 41)."
                )
            ),
        )
    } else {
        (
            "OK".to_string(),
            true,
            crate::tr!(
                format!(
                    "Alle {disk_count} opslagstations (NVMe/SATA) ontvangen stabiele spanning zonder stroomonderbrekingen."
                ),
                format!(
                    "All {disk_count} storage drives (NVMe/SATA) receive stable voltage without power interruptions."
                )
            ),
        )
    };
    checks.push(PowerComponentCheck {
        name: crate::tr!(
            "Opslag (NVMe/SSD) & Moederbord 12V Rails",
            "Storage (NVMe/SSD) & motherboard 12V rails"
        )
        .to_string(),
        status: disk_status,
        is_sufficient: disk_ok,
        metric: format!("{disk_count} schijven OK • {kp41_count} Kernel-Power 41 events"),
        details: disk_details,
    });

    // 5. Adapter / PSU Vermogenstoets
    let is_hybrid_drain = is_laptop && ac_connected && is_discharging;
    let (psu_status, psu_ok, psu_verdict, psu_details) = if is_hybrid_drain {
        penalty += 30;
        recommendations.push(
            crate::tr!("Ondermaatse adapter: De accu loopt leeg terwijl de adapter aangesloten is. Sluit een adapter aan met een hoger wattage (bijv. 100W+ i.p.v. 45W/65W).", "Undersized adapter: the battery drains while the adapter is connected. Use an adapter with a higher wattage (e.g. 100W+ instead of 45W/65W).").to_string(),
        );
        (
            "Kritiek".to_string(),
            false,
            crate::tr!("Ondermaatse Oplader (Hybrid Drain)", "Undersized charger (hybrid drain)").to_string(),
            crate::tr!("De laptop vraagt onder belasting meer vermogen dan de aangesloten lader kan leveren. De accu ontlaadt om het tekort op te vangen.", "Under load the laptop needs more power than the connected charger can supply. The battery discharges to make up the difference.").to_string(),
        )
    } else if is_laptop && ac_connected {
        (
            "OK".to_string(),
            true,
            crate::tr!("Netstroomadapter Voldoende", "Power adapter sufficient").to_string(),
            crate::tr!("De netstroomadapter levert ruim voldoende vermogen voor zowel de interne hardware als het opladen van de batterij.", "The power adapter supplies plenty of power for both the internal hardware and charging the battery.").to_string(),
        )
    } else if is_laptop {
        (
            "OK".to_string(),
            true,
            crate::tr!("Op Batterijvoeding", "On battery power").to_string(),
            crate::tr!(
                format!(
                    "Laptop draait op accu ({}%). Klokfrequenties kunnen gematigd worden om piekbelasting te beperken.",
                    power_status.battery_life_percent
                ),
                format!(
                    "Laptop is running on battery ({}%). Clock speeds may be reduced to limit peak load.",
                    power_status.battery_life_percent
                )
            ),
        )
    } else {
        (
            "OK".to_string(),
            true,
            crate::tr!("Desktop PSU Geverifieerd", "Desktop PSU verified").to_string(),
            crate::tr!("Vaste computer aangesloten op continue netstroomvoeding (AC Line). Geen stroomtekorten gedetecteerd.", "Desktop computer connected to continuous mains power (AC line). No power shortages detected.").to_string(),
        )
    };
    checks.push(PowerComponentCheck {
        name: crate::tr!(
            "Netstroomadapter & Voedingscapaciteit",
            "Power adapter & supply capacity"
        )
        .to_string(),
        status: psu_status,
        is_sufficient: psu_ok,
        metric: format!(
            "{psu_verdict} (AC: {})",
            if ac_connected {
                crate::tr!("Ja", "Yes")
            } else {
                crate::tr!("Nee", "No")
            }
        ),
        details: psu_details,
    });

    let score = 100u32.saturating_sub(penalty);
    let overall_sufficient = score >= 80 && !is_hybrid_drain && !usb_has_surge;

    let summary = if overall_sufficient {
        crate::tr!("Alle interne hardware-onderdelen (CPU, GPU, USB, opslag en moederbord) ontvangen voldoende en stabiel elektrisch vermogen.", "All internal hardware components (CPU, GPU, USB, storage and motherboard) receive enough stable power.").to_string()
    } else {
        crate::tr!("Er zijn stroombeperkingen of spanningsafwijkingen aangetroffen. Raadpleeg de onderstaande componentendetails.", "Power limitations or voltage anomalies were found. See the component details below.").to_string()
    };

    if recommendations.is_empty() {
        recommendations.push(
            crate::tr!(
                "Stroomtoevoer is optimaal. Geen hardware-ingrepen vereist.",
                "Power delivery is optimal. No hardware changes needed."
            )
            .to_string(),
        );
    }

    HardwarePowerCheckReport {
        is_sufficient: overall_sufficient,
        score,
        summary,
        ac_connected,
        is_laptop,
        psu_or_adapter_verdict: psu_verdict,
        checks,
        dirty_shutdowns_count: kp41_count,
        throttling_events_count: kpp37_count,
        usb_surge_count,
        recommendations,
    }
}

/// Hardware-stroomtoevoercontrole (blokkerend; via `commands.rs` op een worker-thread).
pub fn check_hardware_power_delivery() -> HardwarePowerCheckReport {
    ensure_watchdog_started();

    let power_status = get_system_power_status().unwrap_or_default();

    let ps_script = r#"
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1 Name, CurrentClockSpeed, MaxClockSpeed, CurrentVoltage
$gpus = @(Get-CimInstance Win32_VideoController | Select-Object Name, Status)
$usb = @(Get-CimInstance Win32_USBHub | Select-Object Description, Status)
$disks = @(Get-CimInstance Win32_DiskDrive | Select-Object Model, Status)
$kp41 = @(Get-WinEvent -FilterHashtable @{LogName='System'; ProviderName='Microsoft-Windows-Kernel-Power'; Id=41} -MaxEvents 5 -ErrorAction SilentlyContinue).Count
$kpp37 = @(Get-WinEvent -FilterHashtable @{LogName='System'; ProviderName='Microsoft-Windows-Kernel-Processor-Power'; Id=37} -MaxEvents 5 -ErrorAction SilentlyContinue).Count
$usbSurge = @(Get-WinEvent -FilterHashtable @{LogName='System'; ProviderName='Microsoft-Windows-USB-USBHUB3'; Id=4} -MaxEvents 5 -ErrorAction SilentlyContinue).Count

[PSCustomObject]@{
    CpuName = if ($cpu) { $cpu.Name } else { "Processor" }
    CpuClock = if ($cpu) { $cpu.CurrentClockSpeed } else { 2000 }
    CpuMax = if ($cpu) { $cpu.MaxClockSpeed } else { 2000 }
    GpuNames = if ($gpus.Count -gt 0) { ($gpus | ForEach-Object { $_.Name }) -join '; ' } else { "Standaard Videokaart" }
    GpuStatuses = if ($gpus.Count -gt 0) { ($gpus | ForEach-Object { $_.Status }) -join '; ' } else { "OK" }
    UsbCount = $usb.Count
    UsbStatuses = if ($usb.Count -gt 0) { ($usb | ForEach-Object { $_.Status }) -join '; ' } else { "OK" }
    DiskCount = $disks.Count
    DiskStatuses = if ($disks.Count -gt 0) { ($disks | ForEach-Object { $_.Status }) -join '; ' } else { "OK" }
    KP41Count = $kp41
    KPP37Count = $kpp37
    UsbSurgeCount = $usbSurge
} | ConvertTo-Json -Compress
"#;

    let parsed_data = if cfg!(windows) {
        run_ps_json(ps_script).unwrap_or(Value::Null)
    } else {
        Value::Null
    };

    evaluate_hardware_power(&parsed_data, power_status)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_evaluate_hardware_power_all_ok() {
        let json_val = serde_json::json!({
            "CpuName": "Intel Core Ultra 7",
            "CpuClock": 2000,
            "CpuMax": 2000,
            "GpuNames": "Intel Arc 140T",
            "GpuStatuses": "OK",
            "UsbCount": 4,
            "UsbStatuses": "OK; OK",
            "DiskCount": 2,
            "DiskStatuses": "OK; OK",
            "KP41Count": 0,
            "KPP37Count": 0,
            "UsbSurgeCount": 0
        });

        let status = WinSystemPowerStatus {
            ac_line_status: 1,
            battery_flag: 8, // charging
            battery_life_percent: 85,
            system_status_flag: 0,
            battery_life_time: 0xFFFFFFFF,
            battery_full_life_time: 0xFFFFFFFF,
        };

        let report = evaluate_hardware_power(&json_val, status);
        assert_eq!(report.score, 100);
        assert!(report.is_sufficient);
        assert_eq!(report.checks.len(), 5);
        assert!(report.checks.iter().all(|c| c.is_sufficient));
    }

    #[test]
    fn test_evaluate_hardware_power_throttling_and_surge() {
        let json_val = serde_json::json!({
            "CpuName": "Intel Core i7",
            "CpuClock": 600,
            "CpuMax": 2400,
            "GpuNames": "RTX 3070",
            "GpuStatuses": "OK",
            "UsbCount": 2,
            "UsbStatuses": "OK",
            "DiskCount": 1,
            "DiskStatuses": "OK",
            "KP41Count": 1,
            "KPP37Count": 3,
            "UsbSurgeCount": 1
        });

        let status = WinSystemPowerStatus {
            ac_line_status: 1,
            battery_flag: 128, // desktop
            battery_life_percent: 100,
            system_status_flag: 0,
            battery_life_time: 0xFFFFFFFF,
            battery_full_life_time: 0xFFFFFFFF,
        };

        let report = evaluate_hardware_power(&json_val, status);
        assert!(report.score < 80);
        assert!(!report.is_sufficient);
        assert_eq!(report.throttling_events_count, 3);
        assert_eq!(report.usb_surge_count, 1);
        assert_eq!(report.dirty_shutdowns_count, 1);
    }

    #[test]
    fn test_live_check_hardware_power_delivery() {
        let report = check_hardware_power_delivery();
        assert_eq!(report.checks.len(), 5);
        assert!(report.score <= 100);
        assert!(!report.summary.is_empty());
    }
}
