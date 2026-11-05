use std::fs::File;
use std::io::Read;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use crate::models::{BatteryHealthReport, PowerInfo};
use crate::shell::hidden_command;
use crate::watchdog::ensure_watchdog_started;

static POWER_PLAN_CACHE: Mutex<Option<(Instant, String)>> = Mutex::new(None);

#[repr(C)]
#[derive(Default, Debug, Clone, Copy, PartialEq, Eq)]
pub struct WinSystemPowerStatus {
    pub ac_line_status: u8,
    pub battery_flag: u8,
    pub battery_life_percent: u8,
    pub system_status_flag: u8,
    pub battery_life_time: u32,
    pub battery_full_life_time: u32,
}

#[cfg(target_os = "windows")]
unsafe extern "system" {
    fn GetSystemPowerStatus(lpSystemPowerStatus: *mut WinSystemPowerStatus) -> i32;
}

/// Haalt de Win32 System Power Status op via de officiële Windows API.
pub fn get_system_power_status() -> Result<WinSystemPowerStatus, String> {
    #[cfg(target_os = "windows")]
    {
        let mut status = WinSystemPowerStatus::default();
        let res = unsafe { GetSystemPowerStatus(&mut status) };
        if res != 0 {
            Ok(status)
        } else {
            Err("Win32 GetSystemPowerStatus aanroep mislukt".to_string())
        }
    }
    #[cfg(target_os = "linux")]
    {
        Ok(linux_power_status(std::path::Path::new(
            "/sys/class/power_supply",
        )))
    }
    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        Ok(WinSystemPowerStatus {
            ac_line_status: 1,
            battery_flag: 128,
            battery_life_percent: 100,
            system_status_flag: 0,
            battery_life_time: 0xFFFFFFFF,
            battery_full_life_time: 0xFFFFFFFF,
        })
    }
}

fn read_trim(path: &std::path::Path) -> Option<String> {
    std::fs::read_to_string(path)
        .ok()
        .map(|s| s.trim().to_string())
}

fn read_u64(path: &std::path::Path) -> Option<u64> {
    read_trim(path).and_then(|s| s.parse().ok())
}

/// Zoekt de eerste batterij in `/sys/class/power_supply`.
pub fn find_linux_battery(root: &std::path::Path) -> Option<std::path::PathBuf> {
    let mut entries: Vec<_> = std::fs::read_dir(root)
        .ok()?
        .flatten()
        .map(|e| e.path())
        .collect();
    entries.sort();
    entries
        .into_iter()
        .find(|p| read_trim(&p.join("type")).as_deref() == Some("Battery"))
}

/// Vertaalt Linux sysfs power_supply naar dezelfde structuur als Win32 `GetSystemPowerStatus`.
pub fn linux_power_status(root: &std::path::Path) -> WinSystemPowerStatus {
    let mut status = WinSystemPowerStatus {
        ac_line_status: 0,
        battery_flag: 128,
        battery_life_percent: 255,
        system_status_flag: 0,
        battery_life_time: 0xFFFFFFFF,
        battery_full_life_time: 0xFFFFFFFF,
    };
    let Ok(dir) = std::fs::read_dir(root) else {
        status.ac_line_status = 1;
        return status;
    };
    let mut saw_mains = false;
    for entry in dir.flatten() {
        let p = entry.path();
        match read_trim(&p.join("type")).as_deref() {
            Some("Mains") | Some("USB") => {
                saw_mains = true;
                if read_u64(&p.join("online")) == Some(1) {
                    status.ac_line_status = 1;
                }
            }
            _ => {}
        }
    }
    if let Some(bat) = find_linux_battery(root) {
        status.battery_flag = 0;
        if let Some(cap) = read_u64(&bat.join("capacity")) {
            status.battery_life_percent = cap.min(100) as u8;
        }
        let st = read_trim(&bat.join("status")).unwrap_or_default();
        if st == "Charging" {
            status.battery_flag |= 8;
        }
        if st == "Discharging" {
            let now =
                read_u64(&bat.join("energy_now")).or_else(|| read_u64(&bat.join("charge_now")));
            let rate =
                read_u64(&bat.join("power_now")).or_else(|| read_u64(&bat.join("current_now")));
            if let (Some(now), Some(rate)) = (now, rate)
                && rate > 0
            {
                status.battery_life_time = ((now as f64 / rate as f64) * 3600.0) as u32;
            }
        }
    } else if !saw_mains {
        status.ac_line_status = 1;
    }
    status
}

/// Haalt de schemanaam tussen haakjes uit `powercfg /getactivescheme`.
pub fn parse_power_scheme(text: &str) -> String {
    match (text.find('('), text.rfind(')')) {
        (Some(a), Some(b)) if b > a => text[a + 1..b].trim().to_string(),
        _ => "Gebalanceerd (Standaard)".to_string(),
    }
}

/// Haalt de naam op van het actieve Windows energiebeheerschema (gecachet voor 30s).
fn get_active_power_plan() -> String {
    if let Ok(guard) = POWER_PLAN_CACHE.lock()
        && let Some((fetched_at, ref plan)) = *guard
        && fetched_at.elapsed() < Duration::from_secs(30)
    {
        return plan.clone();
    }

    let plan = if cfg!(windows) {
        match hidden_command("powercfg").arg("/getactivescheme").output() {
            Ok(out) => parse_power_scheme(&String::from_utf8_lossy(&out.stdout)),
            Err(_) => "Gebalanceerd".to_string(),
        }
    } else {
        read_trim(std::path::Path::new("/sys/firmware/acpi/platform_profile"))
            .map(|p| format!("Platformprofiel: {}", p))
            .unwrap_or_else(|| "Standaard (OS-beheerd)".to_string())
    };

    if let Ok(mut guard) = POWER_PLAN_CACHE.lock() {
        *guard = Some((Instant::now(), plan.clone()));
    }

    plan
}

/// Realtime voedings- en batterijtelemetrie.
pub fn get_power_and_battery_info() -> PowerInfo {
    ensure_watchdog_started();

    let status = get_system_power_status().unwrap_or_default();
    let ac_connected = status.ac_line_status == 1;
    let battery_present = (status.battery_flag & 128) == 0 && status.battery_life_percent <= 100;

    let (is_laptop, battery_percent, battery_status_desc, battery_life_time_secs) =
        if battery_present {
            let pct = Some(status.battery_life_percent);
            let desc = if (status.battery_flag & 8) != 0 {
                format!("Opladen via Netstroom ({}%)", status.battery_life_percent)
            } else if ac_connected {
                format!(
                    "Netstroom aangesloten, batterij vol ({}%)",
                    status.battery_life_percent
                )
            } else {
                format!("Draait op batterij ({}%)", status.battery_life_percent)
            };
            let life_secs = if status.battery_life_time != 0xFFFFFFFF {
                Some(status.battery_life_time)
            } else {
                None
            };
            (true, pct, desc, life_secs)
        } else {
            (
                false,
                None,
                "Vaste Netstroom (Desktop Workstation)".to_string(),
                None,
            )
        };

    let power_plan_name = get_active_power_plan();

    let details = if is_laptop {
        format!(
            "Laptop mobiele voeding actief. AC Adapter: {}. Batterijlading: {}%. Resterend: {}",
            if ac_connected {
                "Verbonden"
            } else {
                "Niet aangesloten"
            },
            battery_percent.unwrap_or(0),
            battery_life_time_secs
                .map(|s| format!("{}u {}m", s / 3600, (s % 3600) / 60))
                .unwrap_or_else(|| "Aan netstroom / Berekenen...".to_string())
        )
    } else {
        format!(
            "Desktop Workstation aangesloten op continue netstroom (AC Line Online). Energiebeheerschema: {}.",
            power_plan_name
        )
    };

    PowerInfo {
        is_laptop,
        ac_connected,
        battery_present,
        battery_percent,
        battery_status_desc,
        power_plan_name,
        battery_life_time_secs,
        details,
    }
}

/// Voert `powercfg /batteryreport /xml` uit naar een tijdelijk bestand en retourneert de XML-tekst.
pub fn run_powercfg_batteryreport() -> Result<String, String> {
    let temp_xml = std::env::temp_dir().join(format!("pc_checker_batt_{}.xml", std::process::id()));
    let temp_path_str = temp_xml.to_string_lossy().to_string();

    let output = hidden_command("powercfg")
        .args(["/batteryreport", "/xml", "/output", &temp_path_str])
        .output()
        .map_err(|e| format!("Powercfg uitvoerfout: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "powercfg commando gaf exitcode: {:?}",
            output.status.code()
        ));
    }

    let mut xml_content = String::new();
    if let Ok(mut f) = File::open(&temp_xml) {
        let _ = f.read_to_string(&mut xml_content);
    }
    let _ = std::fs::remove_file(&temp_xml);

    if xml_content.is_empty() {
        Err("Geen batterijrapport XML kunnen genereren of lezen".to_string())
    } else {
        Ok(xml_content)
    }
}

/// Pure parser die de XML-inhoud van het Windows batterijrapport omzet in een `BatteryHealthReport`.
pub fn parse_battery_report(xml_content: &str) -> BatteryHealthReport {
    let mut design_capacity: u64 = 0;
    let mut full_charge: u64 = 0;
    let mut cycles: u32 = 0;
    let mut chemistry = "LION".to_string();
    let mut manufacturer = "Notebook".to_string();
    let mut runtime_est = "Onbekend".to_string();

    if let Some(pos) = xml_content.find("<DesignCapacity>")
        && let Some(end) = xml_content[pos..].find("</DesignCapacity>")
    {
        let val_str = &xml_content[pos + 16..pos + end];
        design_capacity = val_str.trim().parse().unwrap_or(0);
    }

    if let Some(pos) = xml_content.find("<FullChargeCapacity>")
        && let Some(end) = xml_content[pos..].find("</FullChargeCapacity>")
    {
        let val_str = &xml_content[pos + 20..pos + end];
        full_charge = val_str.trim().parse().unwrap_or(0);
    }

    if let Some(pos) = xml_content.find("<CycleCount>")
        && let Some(end) = xml_content[pos..].find("</CycleCount>")
    {
        let val_str = &xml_content[pos + 12..pos + end];
        cycles = val_str.trim().parse().unwrap_or(0);
    }

    if let Some(pos) = xml_content.find("<Chemistry>")
        && let Some(end) = xml_content[pos..].find("</Chemistry>")
    {
        chemistry = xml_content[pos + 11..pos + end].trim().to_string();
    }

    if let Some(pos) = xml_content.find("<Manufacturer>")
        && let Some(end) = xml_content[pos..].find("</Manufacturer>")
    {
        manufacturer = xml_content[pos + 14..pos + end].trim().to_string();
    }

    if let Some(pos) = xml_content.find("<ActiveRuntime>")
        && let Some(end) = xml_content[pos..].find("</ActiveRuntime>")
    {
        let rt_raw = &xml_content[pos + 15..pos + end];
        let h = rt_raw
            .find('H')
            .and_then(|idx| {
                let start = rt_raw.find('T').map(|t| t + 1).unwrap_or(0);
                rt_raw[start..idx].parse::<u32>().ok()
            })
            .unwrap_or(0);
        let m = rt_raw
            .find('M')
            .and_then(|idx| {
                let prev = rt_raw
                    .find('H')
                    .map(|h_idx| h_idx + 1)
                    .unwrap_or_else(|| rt_raw.find('T').map(|t| t + 1).unwrap_or(0));
                rt_raw[prev..idx].parse::<u32>().ok()
            })
            .unwrap_or(0);
        if h > 0 || m > 0 {
            runtime_est = format!("{} uur {} min", h, m);
        }
    }

    build_battery_report(
        design_capacity,
        full_charge,
        cycles,
        chemistry,
        manufacturer,
        runtime_est,
    )
}

/// Rapport voor wanneer er geen (leesbare) capaciteitsgegevens zijn. Er worden bewust geen
/// verzonnen waarden getoond.
pub fn unavailable_battery_report(
    grade: &str,
    manufacturer: &str,
    advice: &str,
) -> BatteryHealthReport {
    BatteryHealthReport {
        is_available: false,
        health_percent: 0.0,
        wear_percent: 0.0,
        design_capacity_mwh: 0,
        full_charge_capacity_mwh: 0,
        cycle_count: 0,
        chemistry: "N.v.t.".to_string(),
        manufacturer: manufacturer.to_string(),
        estimated_runtime: "Onbekend".to_string(),
        grade: grade.to_string(),
        advice: advice.to_string(),
    }
}

pub fn build_battery_report(
    design_capacity: u64,
    full_charge: u64,
    cycles: u32,
    chemistry: String,
    manufacturer: String,
    runtime_est: String,
) -> BatteryHealthReport {
    if design_capacity == 0 || full_charge == 0 {
        return unavailable_battery_report(
            "Onbekend",
            &manufacturer,
            "De batterijcapaciteit kon niet worden uitgelezen (ontbrekende gegevens in het batterijrapport). Probeer het opnieuw met beheerdersrechten.",
        );
    }

    let health_percent = ((full_charge as f64 / design_capacity as f64) * 100.0).clamp(0.0, 100.0);
    let wear_percent = (100.0 - health_percent).max(0.0);

    let (grade, advice) = if health_percent >= 90.0 {
        (
            "Uitmuntend (Graad A)".to_string(),
            "De batterij verkeert in uitstekende staat met minimale slijtage. De accucellen presteren nagenoeg conform fabrieksspecificatie.".to_string(),
        )
    } else if health_percent >= 80.0 {
        (
            "Goed (Graad B)".to_string(),
            "De batterij heeft lichte, normale gebruiksslijtage maar functioneert nog zeer betrouwbaar.".to_string(),
        )
    } else if health_percent >= 65.0 {
        (
            "Matig (Graad C)".to_string(),
            "De batterijcapaciteit is merkbaar afgenomen. Je zult merken dat de laptop sneller leegloopt.".to_string(),
        )
    } else {
        (
            "Versleten (Graad D)".to_string(),
            "De accucapaciteit is sterk gedegradeerd. Vervanging van de interne accu wordt aangeraden.".to_string(),
        )
    };

    BatteryHealthReport {
        is_available: true,
        health_percent,
        wear_percent,
        design_capacity_mwh: design_capacity,
        full_charge_capacity_mwh: full_charge,
        cycle_count: cycles,
        chemistry,
        manufacturer,
        estimated_runtime: runtime_est,
        grade,
        advice,
    }
}

/// Batterijconditietest (blokkerend; wordt via `commands.rs` op een worker-thread gestart).
pub fn run_battery_health_check() -> BatteryHealthReport {
    ensure_watchdog_started();

    // Controleer eerst of er een batterij aanwezig is
    if let Ok(status) = get_system_power_status()
        && (status.battery_flag & 128) != 0
    {
        let mut r = unavailable_battery_report(
            "Desktop PC",
            "Desktop PSU",
            "Geen batterij aanwezig op dit systeem. Dit is een Desktop Workstation aangesloten op continue netstroomvoeding.",
        );
        r.health_percent = 100.0;
        r.estimated_runtime = "Onbeperkt (Netstroom)".to_string();
        return r;
    }

    #[cfg(target_os = "linux")]
    {
        return linux_battery_report(std::path::Path::new("/sys/class/power_supply"));
    }

    #[allow(unreachable_code)]
    match run_powercfg_batteryreport() {
        Ok(xml_content) => parse_battery_report(&xml_content),
        Err(e) => unavailable_battery_report(
            "Onbekend",
            "Notebook",
            &format!("Batterijrapport kon niet worden gegenereerd: {}", e),
        ),
    }
}

/// Linux: capaciteit uit `energy_full(_design)` (uWh) of `charge_full(_design)` (uAh).
pub fn linux_battery_report(root: &std::path::Path) -> BatteryHealthReport {
    let Some(bat) = find_linux_battery(root) else {
        return unavailable_battery_report(
            "Onbekend",
            "Onbekend",
            "Geen batterij gevonden in /sys/class/power_supply.",
        );
    };
    let pick = |a: &str, b: &str| read_u64(&bat.join(a)).or_else(|| read_u64(&bat.join(b)));
    // uWh -> mWh (bij charge_* is dit uAh -> mAh; de verhouding blijft correct).
    let design = pick("energy_full_design", "charge_full_design").unwrap_or(0) / 1000;
    let full = pick("energy_full", "charge_full").unwrap_or(0) / 1000;
    let cycles = read_u64(&bat.join("cycle_count")).unwrap_or(0) as u32;
    let chemistry = read_trim(&bat.join("technology")).unwrap_or_else(|| "Onbekend".into());
    let manufacturer = read_trim(&bat.join("manufacturer")).unwrap_or_else(|| "Onbekend".into());
    build_battery_report(
        design,
        full,
        cycles,
        chemistry,
        manufacturer,
        "Onbekend".into(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_battery_report_xml() {
        let sample_xml = r#"
            <BatteryReport>
                <DesignCapacity>52000</DesignCapacity>
                <FullChargeCapacity>46800</FullChargeCapacity>
                <CycleCount>145</CycleCount>
                <Chemistry>LION</Chemistry>
                <Manufacturer>SMP</Manufacturer>
                <ActiveRuntime>PT4H30M</ActiveRuntime>
            </BatteryReport>
        "#;
        let report = parse_battery_report(sample_xml);
        assert_eq!(report.design_capacity_mwh, 52000);
        assert_eq!(report.full_charge_capacity_mwh, 46800);
        assert_eq!(report.cycle_count, 145);
        assert_eq!(report.chemistry, "LION");
        assert_eq!(report.manufacturer, "SMP");
        assert_eq!(report.estimated_runtime, "4 uur 30 min");
        assert_eq!(report.health_percent, 90.0);
        assert_eq!(report.grade, "Uitmuntend (Graad A)");
    }

    #[test]
    fn missing_capacity_is_reported_as_unavailable() {
        let report = parse_battery_report("");
        assert!(!report.is_available);
        assert_eq!(report.design_capacity_mwh, 0);
    }

    #[test]
    fn power_scheme_name_is_extracted() {
        assert_eq!(
            parse_power_scheme(
                "GUID van energiebeheerschema: 381b4222-f694-41f0-9685-ff5bb260df2e  (Gebalanceerd)"
            ),
            "Gebalanceerd"
        );
        assert_eq!(parse_power_scheme("garbage"), "Gebalanceerd (Standaard)");
    }

    #[test]
    fn linux_sysfs_battery_is_parsed() {
        let root = std::env::temp_dir().join(format!("pcc_ps_{}", std::process::id()));
        let bat = root.join("BAT0");
        let ac = root.join("AC");
        std::fs::create_dir_all(&bat).unwrap();
        std::fs::create_dir_all(&ac).unwrap();
        for (f, v) in [
            ("type", "Battery"),
            ("capacity", "77"),
            ("status", "Discharging"),
            ("energy_now", "30000000"),
            ("power_now", "10000000"),
            ("energy_full", "45000000"),
            ("energy_full_design", "50000000"),
            ("cycle_count", "312"),
            ("technology", "Li-ion"),
            ("manufacturer", "SMP"),
        ] {
            std::fs::write(bat.join(f), v).unwrap();
        }
        std::fs::write(ac.join("type"), "Mains").unwrap();
        std::fs::write(ac.join("online"), "0").unwrap();

        let st = linux_power_status(&root);
        assert_eq!(st.ac_line_status, 0);
        assert_eq!(st.battery_flag & 128, 0);
        assert_eq!(st.battery_life_percent, 77);
        assert_eq!(st.battery_life_time, 3 * 3600);

        let rep = linux_battery_report(&root);
        assert!(rep.is_available);
        assert_eq!(rep.design_capacity_mwh, 50000);
        assert_eq!(rep.health_percent, 90.0);
        assert_eq!(rep.cycle_count, 312);
        let _ = std::fs::remove_dir_all(&root);
    }
}
