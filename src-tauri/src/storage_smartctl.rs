//! Schijfgezondheid via `smartctl` (smartmontools). Werkt op Windows, Linux en macOS en geeft
//! meer dan de Windows Storage API: omgewisselde en hangende sectoren, falende ATA-attributen
//! en de NVMe critical warning. Vereist administrator-/root-rechten om schijven te openen.
//!
//! Het parsen is puur (zie `storage_smartctl_tests.rs`); de beoordeling gebeurt in
//! [`super::assess`], net als voor de Windows-gegevens.

use std::time::Duration;

use serde_json::Value;

use super::Finding;
use crate::models::StorageHealthEntry;

const SCAN_TIMEOUT: Duration = Duration::from_secs(10);
const DEVICE_TIMEOUT: Duration = Duration::from_secs(15);

/// ATA-attributen waarvan de genormaliseerde waarde de resterende levensduur in % is
/// (100 = nieuw). Verschilt per fabrikant.
const ATA_LIFE_LEFT_IDS: [u64; 5] = [
    169, // Remaining_Lifetime_Perc (WD/SanDisk)
    177, // Wear_Leveling_Count (Samsung)
    202, // Percent_Lifetime_Remain (Crucial/Micron)
    231, // SSD_Life_Left (Kingston e.a.)
    233, // Media_Wearout_Indicator (Intel)
];
const ATA_REALLOCATED: u64 = 5;
const ATA_PENDING: u64 = 197;
/// Reported_Uncorrect en Offline_Uncorrectable: we nemen de hoogste.
const ATA_UNCORRECTABLE: [u64; 2] = [187, 198];

pub enum Outcome {
    NotInstalled,
    /// smartctl draait, maar mocht geen enkele schijf openen.
    PermissionDenied,
    /// smartctl draait, maar vond geen (leesbare) schijven.
    NoDisks,
    Disks(Vec<(StorageHealthEntry, Vec<Finding>)>),
}

pub fn scan() -> Outcome {
    let Some((exe, devices)) = candidates().into_iter().find_map(|exe| {
        crate::shell::run_command_any_status(exe, &["--scan", "-j"], SCAN_TIMEOUT)
            .map(|raw| (exe, parse_scan(&raw)))
    }) else {
        return Outcome::NotInstalled;
    };

    let mut disks = Vec::new();
    let mut denied = false;
    for dev in &devices {
        let args = ["-a", "-j", "-d", dev.dev_type.as_str(), dev.name.as_str()];
        let Some(raw) = crate::shell::run_command_any_status(exe, &args, DEVICE_TIMEOUT) else {
            continue;
        };
        match parse_device(&raw) {
            Ok(disk) => disks.push(disk),
            Err(DeviceError::PermissionDenied) => denied = true,
            Err(DeviceError::Other) => {}
        }
    }

    match (disks.is_empty(), denied) {
        (false, _) => Outcome::Disks(disks),
        (true, true) => Outcome::PermissionDenied,
        (true, false) => Outcome::NoDisks,
    }
}

/// smartctl staat op Windows vaak niet in PATH; probeer ook de standaard installatiemap.
fn candidates() -> Vec<&'static str> {
    let mut c = vec!["smartctl"];
    if cfg!(windows) {
        c.push(r"C:\Program Files\smartmontools\bin\smartctl.exe");
    }
    c
}

// ===== Parsing (puur) =====

fn u64_at(v: &Value, ptr: &str) -> Option<u64> {
    let x = v.pointer(ptr)?;
    x.as_u64()
        .or_else(|| x.as_f64().filter(|f| *f >= 0.0).map(|f| f as u64))
}

fn str_at(v: &Value, ptr: &str) -> String {
    v.pointer(ptr)
        .and_then(Value::as_str)
        .map(|s| s.trim().to_string())
        .unwrap_or_default()
}

/// Temperaturen van 0 of absurd hoog betekenen "niet gemeten".
fn temperature_at(v: &Value, ptr: &str) -> Option<u32> {
    u64_at(v, ptr)
        .filter(|t| *t > 0 && *t < 150)
        .map(|t| t as u32)
}

/// Eén apparaat uit `smartctl --scan -j`.
#[derive(Debug, Clone, PartialEq)]
pub struct ScannedDevice {
    pub name: String,
    pub dev_type: String,
}

pub fn parse_scan(raw: &str) -> Vec<ScannedDevice> {
    let Ok(v) = serde_json::from_str::<Value>(raw) else {
        return Vec::new();
    };
    v["devices"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|d| {
            Some(ScannedDevice {
                name: d["name"].as_str()?.to_string(),
                dev_type: d["type"].as_str().unwrap_or("auto").to_string(),
            })
        })
        .collect()
}

#[derive(Debug, Clone, PartialEq)]
pub enum DeviceError {
    PermissionDenied,
    Other,
}

/// Parseert `smartctl -a -j <apparaat>` tot een schijf plus de bevindingen die alleen smartctl
/// kent (SMART-oordeel van de schijf zelf, falende attributen, NVMe critical warning).
pub fn parse_device(raw: &str) -> Result<(StorageHealthEntry, Vec<Finding>), DeviceError> {
    let v: Value = serde_json::from_str(raw).map_err(|_| DeviceError::Other)?;

    let model = str_at(&v, "/model_name");
    if model.is_empty() {
        let denied = v["smartctl"]["messages"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|m| m["string"].as_str())
            .map(str::to_lowercase)
            .any(|m| m.contains("permission denied") || m.contains("access is denied"));
        return Err(if denied {
            DeviceError::PermissionDenied
        } else {
            DeviceError::Other
        });
    }

    let protocol = str_at(&v, "/device/protocol");
    let is_nvme = protocol.eq_ignore_ascii_case("NVMe");
    let unknown = || crate::tr!("Onbekend", "Unknown").to_string();
    let media_type = match (is_nvme, u64_at(&v, "/rotation_rate")) {
        (true, _) | (_, Some(0)) => "SSD".to_string(),
        (_, Some(_)) => "HDD".to_string(),
        _ => unknown(),
    };
    let bus_type = match protocol.as_str() {
        "NVMe" => "NVMe".to_string(),
        "ATA" => "SATA".to_string(),
        "" => unknown(),
        other => other.to_string(),
    };
    let smart_passed = v.pointer("/smart_status/passed").and_then(Value::as_bool);

    let mut entry = StorageHealthEntry {
        model,
        serial: str_at(&v, "/serial_number"),
        media_type,
        bus_type,
        size_bytes: u64_at(&v, "/user_capacity/bytes")
            .or_else(|| u64_at(&v, "/nvme_total_capacity"))
            .unwrap_or(0),
        health_status: match smart_passed {
            Some(true) => "PASSED",
            Some(false) => "FAILED",
            None => "Unknown",
        }
        .to_string(),
        temperature_celsius: temperature_at(&v, "/temperature/current"),
        temperature_max_celsius: temperature_at(&v, "/temperature/lifetime_max"),
        // smartctl >= 7.3 leest dit uit de ATA Device Statistics.
        wear_percent: u64_at(&v, "/endurance_used/current_percent").map(clamp_percent),
        power_on_hours: u64_at(&v, "/power_on_time/hours"),
        ..Default::default()
    };

    let mut findings = Vec::new();
    if smart_passed == Some(false) {
        findings.push(Finding::critical(crate::tr!(
            "De schijf meldt zelf dat SMART faalt. Maak direct een back-up en vervang de schijf.",
            "The disk itself reports a SMART failure. Make a backup immediately and replace the disk."
        )));
    }

    let nvme_log = &v["nvme_smart_health_information_log"];
    if is_nvme && !nvme_log.is_null() {
        apply_nvme_log(&mut entry, nvme_log, &mut findings);
    } else if let Some(table) = v
        .pointer("/ata_smart_attributes/table")
        .and_then(Value::as_array)
    {
        apply_ata_attributes(&mut entry, table, &mut findings);
    }

    Ok((entry, findings))
}

fn clamp_percent(p: u64) -> u32 {
    p.min(100) as u32
}

fn apply_nvme_log(entry: &mut StorageHealthEntry, log: &Value, findings: &mut Vec<Finding>) {
    entry.wear_percent = entry
        .wear_percent
        .or(u64_at(log, "/percentage_used").map(clamp_percent));
    entry.read_errors_uncorrected = u64_at(log, "/media_errors");
    entry.power_on_hours = entry.power_on_hours.or(u64_at(log, "/power_on_hours"));
    entry.temperature_celsius = entry
        .temperature_celsius
        .or(temperature_at(log, "/temperature"));
    if let Some(bits) = u64_at(log, "/critical_warning") {
        findings.extend(nvme_critical_warning_findings(bits));
    }
}

/// Vertaalt de bits van de NVMe "critical warning" (NVMe-specificatie, SMART/Health log).
pub fn nvme_critical_warning_findings(bits: u64) -> Vec<Finding> {
    let mut out = Vec::new();
    let has = |bit: u32| bits & (1 << bit) != 0;
    if has(0) {
        out.push(Finding::critical(crate::tr!(
            "NVMe-waarschuwing: de reserveblokken zijn onder de drempel. De SSD is bijna versleten.",
            "NVMe warning: spare blocks are below the threshold. The SSD is nearly worn out."
        )));
    }
    if has(1) {
        out.push(Finding::warning(crate::tr!(
            "NVMe-waarschuwing: de temperatuur is buiten het veilige bereik geweest.",
            "NVMe warning: the temperature has been outside the safe range."
        )));
    }
    if has(2) {
        out.push(Finding::critical(crate::tr!(
            "NVMe-waarschuwing: de betrouwbaarheid is verminderd door media- of interne fouten. Maak een back-up.",
            "NVMe warning: reliability is degraded by media or internal errors. Make a backup."
        )));
    }
    if has(3) {
        out.push(Finding::critical(crate::tr!(
            "NVMe-waarschuwing: de SSD staat in alleen-lezen modus. Kopieer je gegevens en vervang de SSD.",
            "NVMe warning: the SSD is in read-only mode. Copy your data and replace the SSD."
        )));
    }
    if has(4) {
        out.push(Finding::warning(crate::tr!(
            "NVMe-waarschuwing: de back-up van het vluchtige geheugen is mislukt.",
            "NVMe warning: the volatile memory backup has failed."
        )));
    }
    out
}

fn apply_ata_attributes(
    entry: &mut StorageHealthEntry,
    table: &[Value],
    findings: &mut Vec<Finding>,
) {
    let mut life_left: Option<u64> = None;
    let mut uncorrectable: Option<u64> = None;

    for attr in table {
        let Some(id) = attr["id"].as_u64() else {
            continue;
        };
        let raw = u64_at(attr, "/raw/value");
        let name = attr["name"].as_str().unwrap_or("?");

        if attr["when_failed"].as_str() == Some("now") {
            findings.push(Finding::critical(crate::tr!(
                format!("SMART-attribuut {name} ({id}) is onder de drempel van de fabrikant gezakt: de schijf voorspelt zelf dat ze gaat falen."),
                format!("SMART attribute {name} ({id}) has dropped below the manufacturer's threshold: the disk itself predicts it will fail.")
            )));
        }

        match id {
            ATA_REALLOCATED => entry.reallocated_sectors = raw,
            ATA_PENDING => entry.pending_sectors = raw,
            _ if ATA_UNCORRECTABLE.contains(&id) => {
                uncorrectable = uncorrectable.max(raw);
            }
            _ if ATA_LIFE_LEFT_IDS.contains(&id) && life_left.is_none() => {
                life_left = attr["value"].as_u64();
            }
            _ => {}
        }
    }

    entry.read_errors_uncorrected = uncorrectable;
    if entry.wear_percent.is_none() {
        entry.wear_percent = life_left.map(|l| clamp_percent(100u64.saturating_sub(l)));
    }
}

#[cfg(test)]
#[path = "storage_smartctl_tests.rs"]
mod tests;
