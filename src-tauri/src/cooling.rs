use std::process::Command;
use sysinfo::Components;

use crate::models::{CoolingOverview, FanInfo, TemperatureSensorInfo};
use crate::watchdog::ensure_watchdog_started;

#[tauri::command]
pub fn get_cooling_and_fan_info() -> CoolingOverview {
    ensure_watchdog_started();

    let mut temps: Vec<TemperatureSensorInfo> = Vec::new();

    // 1. Hardware Temperature Sensors via sysinfo
    let components = Components::new_with_refreshed_list();
    if let Ok(c_list) = components {
        for c in c_list.iter() {
            temps.push(TemperatureSensorInfo {
                label: c.label().to_string(),
                temperature_celsius: c.temperature().unwrap_or(0.0),
                max_celsius: c.max(),
                critical_celsius: c.critical(),
            });
        }
    }

    // 2. Query ACPI High Precision Thermal Zone via Windows Performance Counters directly via powershell
    let tz_output = Command::new("powershell")
        .args(&[
            "-NoProfile",
            "-Command",
            "Get-CimInstance Win32_PerfFormattedData_Counters_ThermalZoneInformation -ErrorAction SilentlyContinue | Select-Object Name, HighPrecisionTemperature, PercentPassiveLimit | ConvertTo-Json -Compress",
        ])
        .output();

    let mut passive_limit: u32 = 100;

    if let Ok(out) = tz_output {
        let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if !text.is_empty() && (text.starts_with('{') || text.starts_with('[')) {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&text) {
                let items = if let Some(arr) = val.as_array() {
                    arr.clone()
                } else if val.is_object() {
                    vec![val]
                } else {
                    vec![]
                };

                for it in items {
                    let name = it["Name"].as_str().unwrap_or("ACPI Thermal Zone").to_string();
                    if let Some(raw_kelvin) = it["HighPrecisionTemperature"].as_u64() {
                        let celsius = (raw_kelvin as f32 - 2732.0) / 10.0;
                        if celsius > 0.0 && celsius < 125.0 {
                            temps.push(TemperatureSensorInfo {
                                label: format!("CPU / Moederbord Zone ({})", name),
                                temperature_celsius: celsius,
                                max_celsius: Some(100.0),
                                critical_celsius: Some(105.0),
                            });
                        }
                    }
                    if let Some(pl) = it["PercentPassiveLimit"].as_u64() {
                        passive_limit = pl as u32;
                    }
                }
            }
        }
    }

    // Check if temperatures indicate thermal throttling
    let mut is_throttling_suspected = false;
    for t in &temps {
        if t.temperature_celsius >= 90.0 {
            is_throttling_suspected = true;
            break;
        }
    }

    // 3. Query Fans via Win32 WMI / CIM
    let mut fans: Vec<FanInfo> = Vec::new();
    let fan_output = Command::new("powershell")
        .args(&[
            "-NoProfile",
            "-Command",
            "Get-CimInstance Win32_Fan -ErrorAction SilentlyContinue | Select-Object Name, Status, DesiredSpeed | ConvertTo-Json -Compress",
        ])
        .output();

    if let Ok(out) = fan_output {
        let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if !text.is_empty() && (text.starts_with('{') || text.starts_with('[')) {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&text) {
                if let Some(arr) = val.as_array() {
                    for item in arr {
                        let name = item["Name"].as_str().unwrap_or("Systeem Ventilator").to_string();
                        let status = item["Status"].as_str().unwrap_or("Actief").to_string();
                        let rpm = item["DesiredSpeed"].as_u64().map(|n| n as u32);
                        fans.push(FanInfo { name, status, speed_rpm: rpm });
                    }
                } else if let Some(obj) = val.as_object() {
                    let name = obj.get("Name").and_then(|v| v.as_str()).unwrap_or("Systeem Ventilator").to_string();
                    let status = obj.get("Status").and_then(|v| v.as_str()).unwrap_or("Actief").to_string();
                    let rpm = obj.get("DesiredSpeed").and_then(|v| v.as_u64()).map(|n| n as u32);
                    fans.push(FanInfo { name, status, speed_rpm: rpm });
                }
            }
        }
    }

    // If no RPM fan is directly exposed via WMI, add the Embedded Controller fan curve status
    if fans.is_empty() {
        fans.push(FanInfo {
            name: "Systeem Ventilator & Koelprofiel (Moederbord EC/BIOS)".to_string(),
            status: format!("{}% Koelcapaciteit Actief", passive_limit),
            speed_rpm: None,
        });
    }

    let summary = if is_throttling_suspected {
        "⚠️ WAARSCHUWING: Temperatuur overschrijdt 90°C! Dit kan CPU thermal throttling en prestatiedips veroorzaken.".to_string()
    } else {
        format!(
            "Koeling actief en stabiel. {} temperatuursensor(en) live gemonitord.",
            temps.len()
        )
    };

    CoolingOverview {
        fans,
        temperatures: temps,
        is_throttling_suspected,
        summary,
    }
}
