//! Opslaggezondheid (SMART). Bronnen, in volgorde van voorkeur:
//!
//! 1. `smartctl` (smartmontools, zie `storage_smartctl.rs`): Windows, Linux en macOS, met de
//!    meeste gegevens (defecte sectoren, falende attributen, NVMe critical warning). Vereist
//!    administrator-/root-rechten.
//! 2. Windows `Get-PhysicalDisk` + `Get-StorageReliabilityCounter` (Storage Management API).
//!    Temperatuur, slijtage en foutentellers zijn vaak alleen met beheerdersrechten leesbaar;
//!    zonder die rechten blijft `HealthStatus` wel beschikbaar.
//!
//! Beide bronnen leveren dezelfde [`StorageHealthEntry`] en worden met [`assess`] beoordeeld,
//! dus de drempels zijn overal gelijk. De beoordeling is puur en wordt los getest.

use serde_json::Value;

use crate::elevation::is_elevated;
use crate::models::{StorageHealthEntry, StorageHealthReport};
use crate::shell::{json_items, run_ps_json, str_field};

#[path = "storage_smartctl.rs"]
mod smartctl;

const PS_SCRIPT: &str = r#"$out = foreach ($d in Get-PhysicalDisk) { $r = $d | Get-StorageReliabilityCounter; [pscustomobject]@{ FriendlyName=$d.FriendlyName; SerialNumber=$d.SerialNumber; MediaType=[string]$d.MediaType; BusType=[string]$d.BusType; HealthStatus=[string]$d.HealthStatus; OperationalStatus=(@($d.OperationalStatus) -join ', '); Size=[uint64]$d.Size; Temperature=$r.Temperature; TemperatureMax=$r.TemperatureMax; Wear=$r.Wear; PowerOnHours=$r.PowerOnHours; ReadErrorsTotal=$r.ReadErrorsTotal; WriteErrorsTotal=$r.WriteErrorsTotal; ReadErrorsUncorrected=$r.ReadErrorsUncorrected; WriteErrorsUncorrected=$r.WriteErrorsUncorrected } }; ConvertTo-Json -InputObject @($out) -Compress -Depth 3"#;

pub const VERDICT_GOOD: &str = "Goed";
pub const VERDICT_WARN: &str = "Let op";
pub const VERDICT_CRIT: &str = "Kritiek";

/// Slijtage vanaf dit percentage = waarschuwing / kritiek.
const WEAR_WARN: u32 = 70;
const WEAR_CRIT: u32 = 90;
/// Defecte sectoren: elke sector is een signaal; vanaf zoveel degradeert de schijf actief.
const REALLOCATED_CRIT: u64 = 100;
const PENDING_CRIT: u64 = 10;
/// Temperatuurgrenzen (°C) per schijfsoort: (let op, te heet).
/// - HDD: draaiende schijven slijten merkbaar sneller boven ~55 °C.
/// - SATA-SSD: gespecificeerd tot 70 °C.
/// - NVMe-SSD: worden onder belasting normaal 50-70 °C en remmen zichzelf pas rond 80+ °C af.
///
/// Onbekend type: voorzichtige middenwaarde.
pub fn temp_limits(media_type: &str, bus_type: &str) -> (u32, u32) {
    if bus_type.eq_ignore_ascii_case("NVMe") {
        (75, 85)
    } else if media_type == "SSD" {
        (70, 80)
    } else if media_type == "HDD" {
        (55, 60)
    } else {
        (65, 75)
    }
}

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
    let (entry, findings) = windows_entry(v);
    assess(entry, findings)
}

/// Ernst van een bevinding; de zwaarste bepaalt het oordeel van de schijf.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum Level {
    Warning,
    Critical,
}

/// Eén bevinding over een schijf.
#[derive(Debug, Clone, PartialEq)]
pub struct Finding {
    pub level: Level,
    pub message: String,
}

impl Finding {
    pub fn warning(message: impl Into<String>) -> Self {
        Self {
            level: Level::Warning,
            message: message.into(),
        }
    }
    pub fn critical(message: impl Into<String>) -> Self {
        Self {
            level: Level::Critical,
            message: message.into(),
        }
    }
}

/// Ruwe gegevens uit `Get-PhysicalDisk` + `Get-StorageReliabilityCounter`, plus de bevindingen
/// die alleen Windows kent (HealthStatus, OperationalStatus).
fn windows_entry(v: &Value) -> (StorageHealthEntry, Vec<Finding>) {
    let health_status = str_field(v, "HealthStatus").unwrap_or_else(|| "Unknown".to_string());
    let entry = StorageHealthEntry {
        model: str_field(v, "FriendlyName")
            .unwrap_or_else(|| crate::tr!("Onbekende schijf", "Unknown disk").to_string()),
        serial: str_field(v, "SerialNumber").unwrap_or_default(),
        media_type: normalize_media(&str_field(v, "MediaType").unwrap_or_default()),
        bus_type: str_field(v, "BusType")
            .unwrap_or_else(|| crate::tr!("Onbekend", "Unknown").to_string()),
        size_bytes: u64_field(v, "Size").unwrap_or(0),
        health_status,
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
        ..Default::default()
    };
    let mut findings = Vec::new();
    match entry.health_status.as_str() {
        "Unhealthy" => findings.push(Finding::critical(crate::tr!(
            "Windows meldt de schijf als 'Unhealthy' (SMART-drempel overschreden).",
            "Windows reports the disk as 'Unhealthy' (SMART threshold exceeded)."
        ))),
        "Warning" => findings.push(Finding::warning(crate::tr!(
            "Windows meldt een SMART-waarschuwing voor deze schijf.",
            "Windows reports a SMART warning for this disk."
        ))),
        _ => {}
    }
    let op = &entry.operational_status;
    if !op.is_empty() && !op.contains("OK") && !op.eq_ignore_ascii_case("Online") {
        findings.push(Finding::warning(crate::tr!(
            format!("Operationele status: {}.", op),
            format!("Operational status: {}.", op)
        )));
    }
    (entry, findings)
}

/// Beoordeelt een schijf, ongeacht de bron (Windows of smartctl). `source_findings` zijn de
/// bevindingen die alleen de bron kent; daarna volgen de algemene controles op de tellers.
pub fn assess(mut entry: StorageHealthEntry, source_findings: Vec<Finding>) -> StorageHealthEntry {
    let mut findings = source_findings;

    let uncorrected =
        entry.read_errors_uncorrected.unwrap_or(0) + entry.write_errors_uncorrected.unwrap_or(0);
    if uncorrected > 0 {
        findings.push(Finding::critical(crate::tr!(
            format!(
                "{} niet-corrigeerbare lees-/schrijffouten: kans op dataverlies, maak een back-up.",
                uncorrected
            ),
            format!(
                "{} uncorrectable read/write errors: risk of data loss, make a backup.",
                uncorrected
            )
        )));
    }

    if let Some(n) = entry.reallocated_sectors.filter(|n| *n > 0) {
        let msg = crate::tr!(
            format!(
                "{n} omgewisselde (defecte) sectoren: de schijf vervangt beschadigde plekken. Maak een back-up en houd dit aantal in de gaten."
            ),
            format!(
                "{n} reallocated (bad) sectors: the disk is replacing damaged areas. Make a backup and keep an eye on this number."
            )
        );
        findings.push(if n >= REALLOCATED_CRIT {
            Finding::critical(msg)
        } else {
            Finding::warning(msg)
        });
    }

    if let Some(n) = entry.pending_sectors.filter(|n| *n > 0) {
        let msg = crate::tr!(
            format!(
                "{n} instabiele sectoren wachten op omwisseling: de schijf kon ze niet betrouwbaar lezen. Maak een back-up."
            ),
            format!(
                "{n} unstable sectors are waiting to be reallocated: the disk could not read them reliably. Make a backup."
            )
        );
        findings.push(if n >= PENDING_CRIT {
            Finding::critical(msg)
        } else {
            Finding::warning(msg)
        });
    }

    if let Some(w) = entry.wear_percent {
        if w >= WEAR_CRIT {
            findings.push(Finding::critical(crate::tr!(
                format!("SSD-slijtage {}%: einde levensduur nadert.", w),
                format!("SSD wear {}%: end of life is approaching.", w)
            )));
        } else if w >= WEAR_WARN {
            findings.push(Finding::warning(crate::tr!(
                format!("SSD-slijtage {}%: plan vervanging.", w),
                format!("SSD wear {}%: plan a replacement.", w)
            )));
        }
    }

    if let Some(t) = entry.temperature_celsius {
        let (warn, crit) = temp_limits(&entry.media_type, &entry.bus_type);
        let hdd = entry.media_type == "HDD";
        if t >= crit {
            findings.push(Finding::critical(if hdd {
                crate::tr!(
                    format!(
                        "Schijftemperatuur {t} °C is te hoog voor een harde schijf (grens {crit} °C): hij slijt zo snel. Zorg dat er lucht langs de schijf kan en dat de kastventilatoren en stoffilters schoon zijn."
                    ),
                    format!(
                        "Disk temperature {t} °C is too high for a hard drive (limit {crit} °C): it wears quickly at this level. Make sure air can reach the drive and that the case fans and dust filters are clean."
                    )
                )
            } else {
                crate::tr!(
                    format!(
                        "Schijftemperatuur {t} °C is te hoog (grens {crit} °C): de SSD remt zichzelf af. Controleer of de ventilatoren draaien en de luchtroosters niet vol stof zitten; bij een desktop helpt een koelplaatje (heatsink) op de SSD. Je ventilatorinstellingen hoef je hiervoor niet aan te passen."
                    ),
                    format!(
                        "Disk temperature {t} °C is too high (limit {crit} °C): the SSD slows itself down. Check that the fans spin and the vents are not clogged with dust; in a desktop a heatsink on the SSD helps. You don't need to change your fan settings for this."
                    )
                )
            }));
        } else if t >= warn {
            findings.push(Finding::warning(if hdd {
                crate::tr!(
                    format!(
                        "Schijftemperatuur {t} °C is warm voor een harde schijf (ideaal onder {warn} °C). Geen probleem op korte termijn; houd de airflow in de kast vrij."
                    ),
                    format!(
                        "Disk temperature {t} °C is warm for a hard drive (ideally below {warn} °C). Not a problem short term; keep the airflow in the case clear."
                    )
                )
            } else {
                crate::tr!(
                    format!(
                        "Schijftemperatuur {t} °C is warm, maar nog binnen de specificatie (pas vanaf {crit} °C remt de SSD af). Tijdens zware belasting is dit normaal; aan de ventilatoren hoef je niets te veranderen."
                    ),
                    format!(
                        "Disk temperature {t} °C is warm, but still within spec (the SSD only slows down from {crit} °C). This is normal under heavy load; no need to change anything about the fans."
                    )
                )
            }));
        }
    }

    let corrected = entry.read_errors_total.unwrap_or(0) + entry.write_errors_total.unwrap_or(0);
    if corrected > uncorrected && corrected - uncorrected > 100 && entry.media_type == "HDD" {
        findings.push(Finding::warning(crate::tr!(
            format!(
                "{} gecorrigeerde leesfouten: de schijf heeft moeite met uitlezen.",
                corrected - uncorrected
            ),
            format!(
                "{} corrected read errors: the disk is struggling to read.",
                corrected - uncorrected
            )
        )));
    }

    entry.verdict = match findings.iter().map(|f| f.level).max() {
        Some(Level::Critical) => VERDICT_CRIT,
        Some(Level::Warning) => VERDICT_WARN,
        None => VERDICT_GOOD,
    }
    .to_string();
    entry.findings = findings.into_iter().map(|f| f.message).collect();
    entry
}

/// Rapport uit de Windows-uitvoer (`None` = PowerShell/Storage API niet beschikbaar).
pub fn build_report(
    raw: Option<&Value>,
    scanned_at: String,
    elevated: bool,
) -> StorageHealthReport {
    match raw {
        Some(raw) => report_from_disks(
            json_items(raw).iter().map(evaluate_disk).collect(),
            SOURCE_WINDOWS,
            scanned_at,
            elevated,
        ),
        None => unavailable_report(scanned_at, elevated),
    }
}

const SOURCE_SMARTCTL: &str = "smartctl";
const SOURCE_WINDOWS: &str = "windows";

fn unavailable_report(scanned_at: String, elevated: bool) -> StorageHealthReport {
    StorageHealthReport {
        is_available: false,
        scanned_at,
        is_elevated: elevated,
        summary: crate::tr!(
            "Schijfgezondheid kon niet worden uitgelezen.",
            "Disk health could not be read."
        )
        .into(),
        ..Default::default()
    }
}

fn report_from_disks(
    disks: Vec<StorageHealthEntry>,
    source: &str,
    scanned_at: String,
    elevated: bool,
) -> StorageHealthReport {
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
        source: source.to_string(),
        notes: Vec::new(),
    }
}

fn note_install_smartctl() -> String {
    crate::tr!(
        "Installeer smartmontools (smartctl) voor uitgebreide SMART-gegevens zoals defecte sectoren en NVMe-waarschuwingen, bijv. `sudo pacman -S smartmontools` of `sudo apt install smartmontools`; voor Windows via smartmontools.org.",
        "Install smartmontools (smartctl) for detailed SMART data such as bad sectors and NVMe warnings, e.g. `sudo pacman -S smartmontools` or `sudo apt install smartmontools`; for Windows via smartmontools.org."
    )
    .to_string()
}

fn note_needs_root() -> String {
    crate::tr!(
        "smartctl heeft root-rechten nodig om de schijven te openen. Start PC Checker met root-rechten (bijv. `sudo -E pc-checker`) om de SMART-gegevens te lezen.",
        "smartctl needs root privileges to open the disks. Start PC Checker with root privileges (e.g. `sudo -E pc-checker`) to read the SMART data."
    )
    .to_string()
}

pub fn scan_storage_health() -> StorageHealthReport {
    let scanned_at = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let elevated = is_elevated();
    let mut notes = Vec::new();

    match smartctl::scan() {
        smartctl::Outcome::Disks(disks) => {
            let disks = disks.into_iter().map(|(e, f)| assess(e, f)).collect();
            return report_from_disks(disks, SOURCE_SMARTCTL, scanned_at, elevated);
        }
        smartctl::Outcome::NotInstalled => notes.push(note_install_smartctl()),
        // Op Windows valt de scan terug op de Storage API, met de bestaande beheerdershint.
        smartctl::Outcome::PermissionDenied if !cfg!(windows) => notes.push(note_needs_root()),
        smartctl::Outcome::PermissionDenied | smartctl::Outcome::NoDisks => {}
    }

    let raw = if cfg!(windows) {
        run_ps_json(PS_SCRIPT)
    } else {
        None
    };
    let mut report = build_report(raw.as_ref(), scanned_at, elevated);
    report.notes = notes;
    report
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
            evaluate_disk(&json!({"Temperature": 66})).verdict,
            VERDICT_WARN
        );
        assert_eq!(
            evaluate_disk(&json!({"Temperature": 76})).verdict,
            VERDICT_CRIT
        );
        // NVMe op 60-65 °C is normaal (feedback: "klaagt bij 60 °C").
        let nvme = |t: u32| {
            evaluate_disk(&json!({"MediaType": "SSD", "BusType": "NVMe", "Temperature": t})).verdict
        };
        assert_eq!(nvme(60), VERDICT_GOOD);
        assert_eq!(nvme(65), VERDICT_GOOD);
        assert_eq!(nvme(78), VERDICT_WARN);
        assert_eq!(nvme(86), VERDICT_CRIT);
        let hdd = |t: u32| evaluate_disk(&json!({"MediaType": "HDD", "Temperature": t})).verdict;
        assert_eq!(hdd(50), VERDICT_GOOD);
        assert_eq!(hdd(57), VERDICT_WARN);
        assert_eq!(hdd(61), VERDICT_CRIT);
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

    /// Echte scan op deze machine: `cargo test storage_live_scan -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn storage_live_scan() {
        let r = scan_storage_health();
        println!(
            "available={} source={:?} disks={} notes={:?}\n{}",
            r.is_available,
            r.source,
            r.disks.len(),
            r.notes,
            r.summary
        );
        for d in &r.disks {
            println!("[{}] {} {:?}", d.verdict, d.model, d.findings);
        }
    }

    #[test]
    fn findings_follow_language_but_verdict_stays_code() {
        let d =
            crate::i18n::with_language(true, || evaluate_disk(&json!({"HealthStatus": "Warning"})));
        assert_eq!(d.verdict, VERDICT_WARN);
        assert!(d.findings[0].starts_with("Windows reports"));
    }
}
