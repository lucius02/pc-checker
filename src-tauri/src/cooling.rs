use std::sync::Mutex;
use std::time::{Duration, Instant};
use sysinfo::Components;

use crate::models::{CoolingOverview, FanInfo, TemperatureSensorInfo};
use crate::watchdog::ensure_watchdog_started;

struct WmiCoolingCache {
    fetched_at: Instant,
    thermal_zones: Vec<TemperatureSensorInfo>,
    fans: Vec<FanInfo>,
    passive_limit: u32,
}

static WMI_COOLING_CACHE: Mutex<Option<WmiCoolingCache>> = Mutex::new(None);

/// ACPI-thermal-zone in tienden van Kelvin → °C; `None` voor onrealistische waarden.
pub fn decikelvin_to_celsius(raw: u32) -> Option<f32> {
    let c = (raw as f32 - 2732.0) / 10.0;
    (c > 0.0 && c < 125.0).then_some(c)
}

/// Thermal zones + ventilatoren via native WMI (geen PowerShell-proces per poll).
#[cfg(windows)]
fn query_cooling_wmi() -> (Vec<TemperatureSensorInfo>, Vec<FanInfo>, Option<u32>) {
    use serde::Deserialize;
    use wmi::WMIConnection;

    #[derive(Deserialize)]
    #[serde(
        rename = "Win32_PerfFormattedData_Counters_ThermalZoneInformation",
        rename_all = "PascalCase"
    )]
    struct ThermalZone {
        name: Option<String>,
        high_precision_temperature: Option<u32>,
        percent_passive_limit: Option<u32>,
    }
    #[derive(Deserialize)]
    #[serde(rename = "Win32_Fan", rename_all = "PascalCase")]
    struct Fan {
        name: Option<String>,
        status: Option<String>,
        desired_speed: Option<u64>,
    }

    let mut zones = Vec::new();
    let mut fans = Vec::new();
    let mut passive = None;
    let Ok(con) = WMIConnection::new() else {
        return (zones, fans, passive);
    };
    for tz in con.query::<ThermalZone>().unwrap_or_default() {
        let name = tz.name.unwrap_or_else(|| "ACPI Thermal Zone".to_string());
        if let Some(c) = tz
            .high_precision_temperature
            .and_then(decikelvin_to_celsius)
        {
            zones.push(TemperatureSensorInfo {
                label: format!("CPU / Moederbord Zone ({})", name),
                temperature_celsius: c,
                max_celsius: Some(100.0),
                critical_celsius: Some(105.0),
            });
        }
        if let Some(pl) = tz.percent_passive_limit {
            passive = Some(pl);
        }
    }
    for f in con.query::<Fan>().unwrap_or_default() {
        fans.push(FanInfo {
            name: f.name.unwrap_or_else(|| "Systeem Ventilator".to_string()),
            status: f.status.unwrap_or_else(|| "Actief".to_string()),
            speed_rpm: f.desired_speed.map(|n| n.min(u32::MAX as u64) as u32),
        });
    }
    (zones, fans, passive)
}

/// Linux/macOS: sysinfo levert hwmon/SMC-temperaturen al; ventilatoren uit hwmon `fan*_input`.
#[cfg(not(windows))]
fn query_cooling_wmi() -> (Vec<TemperatureSensorInfo>, Vec<FanInfo>, Option<u32>) {
    let mut fans = Vec::new();
    #[cfg(target_os = "linux")]
    if let Ok(dirs) = std::fs::read_dir("/sys/class/hwmon") {
        for dir in dirs.flatten() {
            let path = dir.path();
            let chip = std::fs::read_to_string(path.join("name"))
                .unwrap_or_default()
                .trim()
                .to_string();
            for i in 1..=8 {
                if let Ok(raw) = std::fs::read_to_string(path.join(format!("fan{i}_input"))) {
                    if let Ok(rpm) = raw.trim().parse::<u32>() {
                        fans.push(FanInfo {
                            name: format!("{} fan{}", chip, i),
                            status: if rpm > 0 {
                                "Actief".into()
                            } else {
                                "Stil".into()
                            },
                            speed_rpm: Some(rpm),
                        });
                    }
                }
            }
        }
    }
    (Vec::new(), fans, None)
}

pub fn get_cooling_and_fan_info() -> CoolingOverview {
    ensure_watchdog_started();

    let mut temps: Vec<TemperatureSensorInfo> = Vec::new();

    // 1. Hardware Temperature Sensors via sysinfo (super fast native memory read, < 1ms)
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

    // 2. Query ACPI Thermal Zone & Fans via WMI (cached for 30s to prevent powershell lags)
    let mut passive_limit = 100;
    let mut fans: Vec<FanInfo> = Vec::new();
    let mut cached_tz: Vec<TemperatureSensorInfo> = Vec::new();

    let needs_wmi_refresh = if let Ok(guard) = WMI_COOLING_CACHE.lock() {
        if let Some(ref c) = *guard {
            if c.fetched_at.elapsed() < Duration::from_secs(30) {
                cached_tz = c.thermal_zones.clone();
                fans = c.fans.clone();
                passive_limit = c.passive_limit;
                false
            } else {
                true
            }
        } else {
            true
        }
    } else {
        true
    };

    if needs_wmi_refresh {
        let (tz, wmi_fans, pl) = query_cooling_wmi();
        cached_tz = tz;
        fans = wmi_fans;
        if let Some(pl) = pl {
            passive_limit = pl;
        }

        if let Ok(mut guard) = WMI_COOLING_CACHE.lock() {
            *guard = Some(WmiCoolingCache {
                fetched_at: Instant::now(),
                thermal_zones: cached_tz.clone(),
                fans: fans.clone(),
                passive_limit,
            });
        }
    }

    temps.extend(cached_tz);

    // If no RPM fan is directly exposed via WMI, add the Embedded Controller fan curve status
    if fans.is_empty() {
        fans.push(FanInfo {
            name: "Systeem Ventilator & Koelprofiel (Moederbord EC/BIOS)".to_string(),
            status: format!("{}% Koelcapaciteit Actief", passive_limit),
            speed_rpm: None,
        });
    }

    let is_throttling_suspected = temps.iter().any(|t| t.temperature_celsius >= 90.0);

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decikelvin_conversion() {
        assert_eq!(decikelvin_to_celsius(3132), Some(40.0));
        assert_eq!(decikelvin_to_celsius(2732), None);
        assert_eq!(decikelvin_to_celsius(5000), None);
    }
}
