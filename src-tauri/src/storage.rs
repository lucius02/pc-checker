//! Opslaggezondheid: SMART-achtige tellers via `Get-PhysicalDisk` + `Get-StorageReliabilityCounter`
//! (Windows Storage Management API). Temperatuur, slijtage en foutentellers zijn vaak alleen met
//! beheerdersrechten leesbaar; zonder die rechten blijft `HealthStatus` wel beschikbaar.
//!
//! De evaluatie ([`evaluate_disk`]) is puur en wordt los getest.

use serde_json::Value;

use crate::elevation::is_elevated;
use crate::models::{StorageHealthEntry, StorageHealthReport};
use crate::shell::{json_items, run_ps_json, str_field};

const PS_SCRIPT: &str = r#"$out = foreach ($d in Get-PhysicalDisk) { $r = $d | Get-StorageReliabilityCounter; [pscustomobject]@{ FriendlyName=$d.FriendlyName; SerialNumber=$d.SerialNumber; MediaType=[string]$d.MediaType; BusType=[string]$d.BusType; HealthStatus=[string]$d.HealthStatus; OperationalStatus=(@($d.OperationalStatus) -join ', '); Size=[uint64]$d.Size; Temperature=$r.Temperature; TemperatureMax=$r.TemperatureMax; Wear=$r.Wear; PowerOnHours=$r.PowerOnHours; ReadErrorsTotal=$r.ReadErrorsTotal; WriteErrorsTotal=$r.WriteErrorsTotal; ReadErrorsUncorrected=$r.ReadErrorsUncorrected; WriteErrorsUncorrected=$r.WriteErrorsUncorrected } }; ConvertTo-Json -InputObject @($out) -Compress -Depth 3"#;

pub const VERDICT_GOOD: &str = "Goed";
pub const VERDICT_WARN: &str = "Let op";
pub const VERDICT_CRIT: &str = "Kritiek";

/// Slijtage vanaf dit percentage = waarschuwing / kritiek.
const WEAR_WARN: u32 = 70;
const WEAR_CRIT: u32 = 90;
/// Temperatuur (°C) vanaf waar een schijf als te heet geldt.
const TEMP_WARN: u32 = 60;
const TEMP_CRIT: u32 = 70;

fn u64_field(v: &Value, key: &str) -> Option<u64> {
    v.get(key).and_then(|x| x.as_u64())
}

fn u32_field(v: &Value, key: &str) -> Option<u32> {
    u64_field(v, key).map(|n| n.min(u32::MAX as u64) as u32)
}

fn normalize_media(raw: &str) -> String {
    match raw {
        "SSD" | "4" => "SSD".to_string(),
        "HDD" | "3" => "HDD".to_string(),
        _ => crate::tr!("Onbekend", "Unknown").to_string(),
    }
}

/// Zet één PowerShell-object om in een beoordeelde schijf.
pub fn evaluate_disk(v: &Value) -> StorageHealthEntry {
    let health_status = str_field(v, "HealthStatus").unwrap_or_else(|| "Unknown".to_string());
    let mut entry = StorageHealthEntry {
        model: str_field(v, "FriendlyName")
            .unwrap_or_else(|| crate::tr!("Onbekende schijf", "Unknown disk").to_string()),
        serial: str_field(v, "SerialNumber").unwrap_or_default(),
        media_type: normalize_media(&str_field(v, "MediaType").unwrap_or_default()),
        bus_type: str_field(v, "BusType")
            .unwrap_or_else(|| crate::tr!("Onbekend", "Unknown").to_string()),
        size_bytes: u64_field(v, "Size").unwrap_or(0),
        health_status: health_status.clone(),
        operational_status: str_field(v, "OperationalStatus").unwrap_or_default(),
        temperature_celsius: u32_field(v, "Temperature").filter(|t| *t > 0 && *t < 150),
        temperature_max_celsius: u32_field(v, "TemperatureMax").filter(|t| *t > 0 && *t < 150),
        wear_percent: u32_field(v, "Wear").filter(|w| *w <= 100),
        power_on_hours: u64_field(v, "PowerOnHours"),
        read_errors_uncorrected: u64_field(v, "ReadErrorsUncorrected"),
        write_errors_uncorrected: u64_field(v, "WriteErrorsUncorrected"),
        read_errors_total: u64_field(v, "ReadErrorsTotal"),
        write_errors_total: u64_field(v, "WriteErrorsTotal"),
        verdict: VERDICT_GOOD.to_string(),
        findings: Vec::new(),
    };

    let mut level = 0u8; // 0 = goed, 1 = let op, 2 = kritiek
    let mut flag = |lvl: u8, msg: String, findings: &mut Vec<String>| {
        level = level.max(lvl);
        findings.push(msg);
    };
    let mut findings = Vec::new();

    match health_status.as_str() {
        "Unhealthy" => flag(
            2,
            crate::tr!(
                "Windows meldt de schijf als 'Unhealthy' (SMART-drempel overschreden).",
                "Windows reports the disk as 'Unhealthy' (SMART threshold exceeded)."
            )
            .into(),
            &mut findings,
        ),
        "Warning" => flag(
            1,
            crate::tr!(
                "Windows meldt een SMART-waarschuwing voor deze schijf.",
                "Windows reports a SMART warning for this disk."
            )
            .into(),
            &mut findings,
        ),
        _ => {}
    }

    let uncorrected =
        entry.read_errors_uncorrected.unwrap_or(0) + entry.write_errors_uncorrected.unwrap_or(0);
    if uncorrected > 0 {
        flag(
            2,
            crate::tr!(
                format!(
                    "{} niet-corrigeerbare lees-/schrijffouten: kans op dataverlies, maak een back-up.",
                    uncorrected
                ),
                format!(
                    "{} uncorrectable read/write errors: risk of data loss, make a backup.",
                    uncorrected
                )
            ),
            &mut findings,
        );
    }

    if let Some(w) = entry.wear_percent {
        if w >= WEAR_CRIT {
            flag(
                2,
                crate::tr!(
                    format!("SSD-slijtage {}%: einde levensduur nadert.", w),
                    format!("SSD wear {}%: end of life is approaching.", w)
                ),
                &mut findings,
            );
        } else if w >= WEAR_WARN {
            flag(
                1,
                crate::tr!(
                    format!("SSD-slijtage {}%: plan vervanging.", w),
                    format!("SSD wear {}%: plan a replacement.", w)
                ),
                &mut findings,
            );
        }
    }

    if let Some(t) = entry.temperature_celsius {
        if t >= TEMP_CRIT {
            flag(
                2,
                crate::tr!(
                    format!(
                        "Schijftemperatuur {} °C is te hoog (thermal throttling / slijtage).",
                        t
                    ),
                    format!(
                        "Disk temperature {} °C is too high (thermal throttling / wear).",
                        t
                    )
                ),
                &mut findings,
            );
        } else if t >= TEMP_WARN {
            flag(
                1,
                crate::tr!(
                    format!(
                        "Schijftemperatuur {} °C is aan de hoge kant; controleer de airflow.",
                        t
                    ),
                    format!(
                        "Disk temperature {} °C is on the high side; check the airflow.",
                        t
                    )
                ),
                &mut findings,
            );
        }
    }

    let corrected = entry.read_errors_total.unwrap_or(0) + entry.write_errors_total.unwrap_or(0);
    if corrected > uncorrected && corrected - uncorrected > 100 && entry.media_type == "HDD" {
        flag(
            1,
            crate::tr!(
                format!(
                    "{} gecorrigeerde leesfouten: de schijf heeft moeite met uitlezen.",
                    corrected - uncorrected
                ),
                format!(
                    "{} corrected read errors: the disk is struggling to read.",
                    corrected - uncorrected
                )
            ),
            &mut findings,
        );
    }

    if !entry.operational_status.is_empty()
        && !entry.operational_status.contains("OK")
        && !entry.operational_status.eq_ignore_ascii_case("Online")
    {
        flag(
            1,
            crate::tr!(
                format!("Operationele status: {}.", entry.operational_status),
                format!("Operational status: {}.", entry.operational_status)
            ),
            &mut findings,
        );
    }

    entry.verdict = match level {
        2 => VERDICT_CRIT,
        1 => VERDICT_WARN,
        _ => VERDICT_GOOD,
    }
    .to_string();
    entry.findings = findings;
    entry
}

pub fn build_report(
    raw: Option<&Value>,
    scanned_at: String,
    elevated: bool,
) -> StorageHealthReport {
    let Some(raw) = raw else {
        return StorageHealthReport {
            is_available: false,
            scanned_at,
            is_elevated: elevated,
            summary: crate::tr!("Schijfgezondheid is alleen beschikbaar op Windows (Storage Management API niet gevonden).", "Disk health is only available on Windows (Storage Management API not found).").into(),
            ..Default::default()
        };
    };
    let disks: Vec<StorageHealthEntry> = json_items(raw).iter().map(evaluate_disk).collect();
    let critical_count = disks.iter().filter(|d| d.verdict == VERDICT_CRIT).count();
    let warning_count = disks.iter().filter(|d| d.verdict == VERDICT_WARN).count();
    let summary = if disks.is_empty() {
        crate::tr!(
            "Geen fysieke schijven gevonden.",
            "No physical disks found."
        )
        .to_string()
    } else if critical_count > 0 {
        crate::tr!(
            format!(
                "{} van {} schijf/schijven in kritieke staat. Maak direct een back-up.",
                critical_count,
                disks.len()
            ),
            format!(
                "{} of {} disk(s) in critical condition. Make a backup immediately.",
                critical_count,
                disks.len()
            )
        )
    } else if warning_count > 0 {
        crate::tr!(
            format!(
                "{} van {} schijf/schijven vragen aandacht.",
                warning_count,
                disks.len()
            ),
            format!(
                "{} of {} disk(s) need attention.",
                warning_count,
                disks.len()
            )
        )
    } else {
        crate::tr!(
            format!(
                "Alle {} schijf/schijven melden een gezonde status.",
                disks.len()
            ),
            format!("All {} disk(s) report a healthy status.", disks.len())
        )
    };
    StorageHealthReport {
        is_available: true,
        scanned_at,
        is_elevated: elevated,
        disks,
        warning_count,
        critical_count,
        summary,
    }
}

pub fn scan_storage_health() -> StorageHealthReport {
    let scanned_at = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let elevated = is_elevated();
    let raw = if cfg!(windows) {
        run_ps_json(PS_SCRIPT)
    } else {
        None
    };
    build_report(raw.as_ref(), scanned_at, elevated)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn healthy_ssd_is_good() {
        let d = evaluate_disk(&json!({
            "FriendlyName": "Samsung SSD 980", "MediaType": "SSD", "BusType": "NVMe",
            "HealthStatus": "Healthy", "OperationalStatus": "OK", "Size": 1_000_204_886_016u64,
            "Temperature": 38, "Wear": 3, "PowerOnHours": 4200,
            "ReadErrorsUncorrected": 0, "WriteErrorsUncorrected": 0
        }));
        assert_eq!(d.verdict, VERDICT_GOOD);
        assert!(d.findings.is_empty());
        assert_eq!(d.wear_percent, Some(3));
    }

    #[test]
    fn uncorrected_errors_are_critical() {
        let d = evaluate_disk(&json!({"HealthStatus": "Healthy", "ReadErrorsUncorrected": 4}));
        assert_eq!(d.verdict, VERDICT_CRIT);
    }

    #[test]
    fn wear_and_temp_thresholds() {
        assert_eq!(
            evaluate_disk(&json!({"MediaType": "SSD", "Wear": 75})).verdict,
            VERDICT_WARN
        );
        assert_eq!(
            evaluate_disk(&json!({"MediaType": "SSD", "Wear": 95})).verdict,
            VERDICT_CRIT
        );
        assert_eq!(
            evaluate_disk(&json!({"Temperature": 64})).verdict,
            VERDICT_WARN
        );
        assert_eq!(
            evaluate_disk(&json!({"Temperature": 72})).verdict,
            VERDICT_CRIT
        );
    }

    #[test]
    fn windows_health_status_maps() {
        assert_eq!(
            evaluate_disk(&json!({"HealthStatus": "Warning"})).verdict,
            VERDICT_WARN
        );
        assert_eq!(
            evaluate_disk(&json!({"HealthStatus": "Unhealthy"})).verdict,
            VERDICT_CRIT
        );
    }

    #[test]
    fn missing_counters_without_admin_are_none() {
        let d =
            evaluate_disk(&json!({"HealthStatus": "Healthy", "Temperature": null, "Wear": null}));
        assert_eq!(d.temperature_celsius, None);
        assert_eq!(d.wear_percent, None);
        assert_eq!(d.verdict, VERDICT_GOOD);
    }

    #[test]
    fn report_counts_and_single_object_shape() {
        let r = build_report(
            Some(&json!({"HealthStatus": "Unhealthy"})),
            "t".into(),
            false,
        );
        assert!(r.is_available);
        assert_eq!(r.disks.len(), 1);
        assert_eq!(r.critical_count, 1);
        let none = build_report(None, "t".into(), false);
        assert!(!none.is_available);
    }

    #[test]
    fn findings_follow_language_but_verdict_stays_code() {
        let d =
            crate::i18n::with_language(true, || evaluate_disk(&json!({"HealthStatus": "Warning"})));
        assert_eq!(d.verdict, VERDICT_WARN);
        assert!(d.findings[0].starts_with("Windows reports"));
    }
}
