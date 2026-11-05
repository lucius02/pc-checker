//! Driver Check (#10): spoort drivers op die (zeer) verouderd zijn, een Apparaatbeheer-
//! foutcode hebben of niet digitaal ondertekend zijn. De focus ligt op de klassen die in de
//! praktijk freezes/stotteringen veroorzaken: videokaart, chipset/systeem, opslagcontrollers,
//! netwerk, audio en USB.
//!
//! Gegevensbron: één PowerShell-aanroep die zowel `Win32_PnPSignedDriver` (alle geïnstalleerde
//! drivers) als `Win32_PnPEntity` met `ConfigManagerErrorCode -ne 0` (apparaten met een
//! probleemcode) als JSON teruggeeft. Op Linux/macOS (geen PowerShell) degradeert de scan
//! netjes naar `is_available: false`.

use std::sync::Mutex;

use chrono::{Datelike, NaiveDate};
use serde_json::Value;

use crate::models::{DriverEntry, DriverReport};

#[path = "drivers_helpers.rs"]
mod drivers_helpers;
use drivers_helpers::*;

pub use drivers_helpers::problem_code_meaning;

/// Laatst uitgevoerde driver-scan (gecachet), zodat andere modules (bijv. de latency-test)
/// er de namen van verdachte drivers uit kunnen halen. Mag vanuit elke thread worden gelezen.
static LAST_REPORT: Mutex<Option<DriverReport>> = Mutex::new(None);

/// Eén PowerShell-script dat beide datasets in één JSON-object teruggeeft:
/// `{"Signed":[...], "Problems":[...]}`. DriverDate wordt al in PowerShell geformatteerd
/// (yyyy-MM-dd), zodat we geen `/Date(...)/` hoeven te parsen. UTF-8 uitvoer voorkomt dat
/// tekens als ® verminkt worden.
const PS_SCRIPT: &str = r#"[Console]::OutputEncoding=[Text.Encoding]::UTF8; $ErrorActionPreference='SilentlyContinue'; $s = Get-CimInstance Win32_PnPSignedDriver | Select-Object DeviceName,DeviceClass,DriverProviderName,DriverVersion,@{n='DriverDate';e={if($_.DriverDate){$_.DriverDate.ToString('yyyy-MM-dd')}else{''}}},IsSigned,DeviceID; $p = Get-CimInstance Win32_PnPEntity | Where-Object { $_.ConfigManagerErrorCode -ne 0 } | Select-Object Name,PNPClass,ConfigManagerErrorCode,DeviceID; [pscustomobject]@{Signed=@($s);Problems=@($p)} | ConvertTo-Json -Compress -Depth 4"#;

// ===== Drempels voor "Verouderd" (in jaren) =====
// Alleen van toepassing op drivers van niet-Microsoft leveranciers in de relevante klassen;
// Microsoft inbox-drivers worden via Windows Update bijgewerkt en dragen vaak een
// placeholder-datum (2006-06-21), dus die markeren we nooit op leeftijd.
/// Videokaart: GPU-drivers krijgen maandelijks updates met stabiliteitsfixes (TDR/freeze).
const MAX_AGE_DISPLAY_YEARS: f32 = 1.0;
/// Opslagcontrollers (SCSIAdapter/HDC: AHCI, NVMe, RST/RAID).
const MAX_AGE_STORAGE_YEARS: f32 = 3.0;
/// Netwerk, audio (MEDIA/AudioEndpoint) en USB/Thunderbolt-controllers.
const MAX_AGE_PERIPHERAL_YEARS: f32 = 3.0;
/// Chipset/systeemapparaten: platformdrivers (Intel DTT, Serial IO, SST, SMBus) worden door
/// OEM's zelden ververst en zijn zelden een freeze-oorzaak; met 4 jaar markeerde een goed
/// bijgehouden laptop 15 systeemdrivers. Daarom ruim: alleen echt oude (> 6 jaar).
const MAX_AGE_SYSTEM_YEARS: f32 = 6.0;
/// Datums vóór dit jaar zijn placeholders (bijv. Intel chipset-INF's gebruiken 1968-07-18).
const PLACEHOLDER_YEAR_BEFORE: i32 = 1995;
/// Microsoft's standaard placeholder-datum voor inbox-drivers.
const MS_PLACEHOLDER_DATE: &str = "2006-06-21";

pub fn last_report() -> Option<DriverReport> {
    LAST_REPORT
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone()
}

/// Opent een Windows-beheerprogramma of instellingenpagina (no-op op andere platformen).
fn open_windows_target(target: &str, what: &str) -> Result<(), String> {
    #[cfg(windows)]
    {
        crate::shell::hidden_command("cmd")
            .args(["/c", "start", "", target])
            .spawn()
            .map_err(|e| format!("Kon {} niet openen: {}", what, e))?;
    }
    #[cfg(not(windows))]
    {
        let _ = (target, what);
    }
    Ok(())
}

pub fn open_device_manager() -> Result<(), String> {
    open_windows_target("devmgmt.msc", "Apparaatbeheer")
}

pub fn open_windows_update() -> Result<(), String> {
    open_windows_target("ms-settings:windowsupdate", "Windows Update")
}

pub fn scan_drivers_blocking() -> DriverReport {
    let scanned_at = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let today = chrono::Local::now().date_naive();

    let report = match run_powershell(PS_SCRIPT) {
        Some(raw) => parse_report(&raw, today, scanned_at),
        None => unavailable_report(
            scanned_at,
            "Driver Check is alleen beschikbaar op Windows (PowerShell/WMI niet gevonden).",
        ),
    };

    *LAST_REPORT.lock().unwrap_or_else(|e| e.into_inner()) = Some(report.clone());
    report
}

/// Voert het script uit via de gedeelde PowerShell-helper (verborgen venster, time-out).
fn run_powershell(script: &str) -> Option<String> {
    crate::shell::run_powershell(script, std::time::Duration::from_secs(60))
}

fn unavailable_report(scanned_at: String, summary: &str) -> DriverReport {
    DriverReport {
        is_available: false,
        scanned_at,
        total_drivers: 0,
        outdated_count: 0,
        problem_count: 0,
        unsigned_count: 0,
        entries: Vec::new(),
        summary: summary.to_string(),
    }
}

// ===== Parsing (puur, testbaar) =====

/// Parseert de volledige PowerShell-uitvoer tot een rapport.
fn parse_report(raw: &str, today: NaiveDate, scanned_at: String) -> DriverReport {
    let trimmed = raw.trim_start_matches('\u{feff}').trim();
    if !(trimmed.starts_with('{') || trimmed.starts_with('[')) {
        return unavailable_report(
            scanned_at,
            "Driver-informatie kon niet worden uitgelezen (geen geldige WMI-uitvoer van PowerShell). Probeer de scan opnieuw of controleer of de WMI-service (Winmgmt) draait.",
        );
    }
    let parsed: Value = match serde_json::from_str(trimmed) {
        Ok(v) => v,
        Err(_) => {
            return unavailable_report(
                scanned_at,
                "Driver-informatie kon niet worden verwerkt (ongeldige JSON van PowerShell).",
            );
        }
    };

    // Normaal: {"Signed":[...],"Problems":[...]}. Wees tolerant voor een losse
    // driver-array of een los driver-object.
    let (signed_vals, problem_vals) =
        if parsed.get("Signed").is_some() || parsed.get("Problems").is_some() {
            (
                as_list(parsed.get("Signed")),
                as_list(parsed.get("Problems")),
            )
        } else {
            (as_list(Some(&parsed)), Vec::new())
        };

    let drivers: Vec<RawDriver> = signed_vals.iter().map(parse_raw_driver).collect();
    let problems: Vec<RawProblem> = problem_vals
        .iter()
        .map(parse_raw_problem)
        .filter(|p| p.code != 0)
        .collect();

    if drivers.is_empty() && problems.is_empty() {
        return unavailable_report(
            scanned_at,
            "WMI gaf geen driverinformatie terug. Probeer de scan opnieuw (eventueel als administrator).",
        );
    }

    build_report(drivers, problems, today, scanned_at)
}

fn build_report(
    drivers: Vec<RawDriver>,
    problems: Vec<RawProblem>,
    today: NaiveDate,
    scanned_at: String,
) -> DriverReport {
    // Alleen rijen met een echte driver tellen (BTHENUM-services zonder klasse/driver niet).
    let real_drivers: Vec<RawDriver> = drivers
        .into_iter()
        .filter(|d| !(d.class.is_empty() && d.provider.is_empty() && d.version.is_empty()))
        .collect();
    let total_drivers = real_drivers.len();

    let mut matched_problem = vec![false; problems.len()];
    let mut entries: Vec<DriverEntry> = Vec::new();

    for d in &real_drivers {
        let problem_idx = problems.iter().position(|p| {
            !p.device_id.is_empty() && p.device_id.eq_ignore_ascii_case(&d.device_id)
        });
        let problem_code = problem_idx.map(|i| {
            matched_problem[i] = true;
            problems[i].code
        });
        let entry = classify(d, problem_code, today);
        if entry.status != "OK" || is_relevant(d) {
            entries.push(entry);
        }
    }

    // Probleemapparaten zonder (geladen) driver: komen niet voor in Win32_PnPSignedDriver
    // of hebben een afwijkende DeviceID — toch tonen.
    for (i, p) in problems.iter().enumerate() {
        if matched_problem[i] || p.code == 45 {
            // 45 = apparaat momenteel niet aangesloten (spookapparaat) — geen actie nodig.
            continue;
        }
        let d = RawDriver {
            name: if p.name.is_empty() {
                p.device_id.clone()
            } else {
                p.name.clone()
            },
            class: p.class.clone(),
            device_id: p.device_id.clone(),
            ..Default::default()
        };
        entries.push(classify(&d, Some(p.code), today));
    }

    entries.sort_by(|a, b| {
        status_rank(&a.status)
            .cmp(&status_rank(&b.status))
            .then(class_rank(&a.device_class).cmp(&class_rank(&b.device_class)))
            .then(
                a.device_name
                    .to_lowercase()
                    .cmp(&b.device_name.to_lowercase()),
            )
    });

    let problem_count = entries.iter().filter(|e| e.status == "Probleem").count();
    let outdated_count = entries.iter().filter(|e| e.status == "Verouderd").count();
    let unsigned_count = entries
        .iter()
        .filter(|e| e.status == "Niet ondertekend")
        .count();

    let summary = build_summary(
        total_drivers,
        problem_count,
        outdated_count,
        unsigned_count,
        &entries,
    );

    DriverReport {
        is_available: true,
        scanned_at,
        total_drivers,
        outdated_count,
        problem_count,
        unsigned_count,
        entries,
        summary,
    }
}

fn build_summary(
    total: usize,
    problems: usize,
    outdated: usize,
    unsigned: usize,
    entries: &[DriverEntry],
) -> String {
    if problems == 0 && outdated == 0 && unsigned == 0 {
        return format!(
            "{} drivers gescand: geen probleemapparaten, verouderde of niet-ondertekende drivers gevonden in de freeze-gevoelige klassen.",
            total
        );
    }
    let mut parts = Vec::new();
    if problems > 0 {
        parts.push(format!("{} apparaat/apparaten met een foutcode", problems));
    }
    if unsigned > 0 {
        parts.push(format!("{} niet-ondertekende driver(s)", unsigned));
    }
    if outdated > 0 {
        parts.push(format!("{} mogelijk verouderde driver(s)", outdated));
    }
    let gpu_flag = entries
        .iter()
        .any(|e| e.device_class == "DISPLAY" && e.status != "OK");
    let storage_flag = entries
        .iter()
        .any(|e| is_storage_class(&e.device_class) && e.status != "OK");
    let mut s = format!("{} drivers gescand: {}.", total, parts.join(", "));
    if gpu_flag {
        s.push_str(
            " Let op: de videokaartdriver is gemarkeerd — een bekende oorzaak van freezes (TDR).",
        );
    }
    if storage_flag {
        s.push_str(" Let op: een opslagcontroller-driver is gemarkeerd — kan schijf-time-outs en freezes van enkele seconden veroorzaken.");
    }
    if outdated > 0 {
        s.push_str(" Controleer verouderde drivers bij de fabrikant (moederbord/laptop of chip-leverancier).");
    }
    s
}

// ===== Classificatie =====

const RELEVANT_CLASSES: &[&str] = &[
    "DISPLAY",
    "SYSTEM",
    "SCSIADAPTER",
    "HDC",
    "NET",
    "MEDIA",
    "AUDIOENDPOINT",
    "USB",
];

fn is_storage_class(class: &str) -> bool {
    class == "SCSIADAPTER" || class == "HDC"
}

fn is_microsoft_inbox(d: &RawDriver) -> bool {
    d.provider.to_lowercase().contains("microsoft")
        // Inbox-driver met misleidende leveranciersnaam (bijv. "Intel(R) Platform Monitoring
        // Technology Device" met versie 10.0.26100.x en de MS-placeholderdatum).
        || (d.date == MS_PLACEHOLDER_DATE && d.version.starts_with("10.0."))
}

/// Ruis die we nooit tonen tenzij er iets mis mee is.
fn is_noise(d: &RawDriver) -> bool {
    let name = d.name.to_lowercase();
    let id = d.device_id.to_uppercase();
    name.contains("wan miniport")
        || id.starts_with("SWD\\MSRRAS")
        || d.class == "SOFTWARECOMPONENT"
        || d.class == "SOFTWAREDEVICE"
}

/// Moet deze (OK) driver in de lijst? Relevante klassen; voor Microsoft inbox-drivers alleen
/// echte hardware-controllers (PCI) in de klassen GPU/opslag/USB/netwerk/audio.
fn is_relevant(d: &RawDriver) -> bool {
    if is_noise(d) || !RELEVANT_CLASSES.contains(&d.class.as_str()) {
        return false;
    }
    if is_microsoft_inbox(d) {
        if d.class == "DISPLAY" {
            return true;
        }
        let hw_class = matches!(
            d.class.as_str(),
            "SCSIADAPTER" | "HDC" | "USB" | "NET" | "MEDIA"
        );
        return hw_class && d.device_id.to_uppercase().starts_with("PCI\\");
    }
    true
}

fn is_placeholder_date(date: &NaiveDate, raw: &str) -> bool {
    date.year() < PLACEHOLDER_YEAR_BEFORE || raw == MS_PLACEHOLDER_DATE
}

/// Leeftijd in jaren (≥ 0), of None bij onbekende/placeholder-datum.
fn age_years(raw_date: &str, today: NaiveDate) -> Option<f32> {
    let d = NaiveDate::parse_from_str(raw_date, "%Y-%m-%d").ok()?;
    if is_placeholder_date(&d, raw_date) {
        return None;
    }
    let days = (today - d).num_days().max(0) as f32;
    Some((days / 365.25 * 10.0).round() / 10.0)
}

fn max_age_for_class(class: &str) -> Option<f32> {
    match class {
        "DISPLAY" => Some(MAX_AGE_DISPLAY_YEARS),
        "SCSIADAPTER" | "HDC" => Some(MAX_AGE_STORAGE_YEARS),
        "NET" | "MEDIA" | "AUDIOENDPOINT" | "USB" => Some(MAX_AGE_PERIPHERAL_YEARS),
        "SYSTEM" => Some(MAX_AGE_SYSTEM_YEARS),
        _ => None,
    }
}

fn status_rank(status: &str) -> u8 {
    match status {
        "Probleem" => 0,
        "Niet ondertekend" => 1,
        "Verouderd" => 2,
        _ => 3,
    }
}

fn class_rank(class: &str) -> u8 {
    match class {
        "DISPLAY" => 0,
        "SCSIADAPTER" | "HDC" => 1,
        "SYSTEM" => 2,
        "NET" => 3,
        "MEDIA" | "AUDIOENDPOINT" => 4,
        "USB" => 5,
        _ => 6,
    }
}

/// Bepaalt status, leeftijd en advies voor één driver. Prioriteit:
/// Probleem > Niet ondertekend > Verouderd > OK.
fn classify(d: &RawDriver, problem_code: Option<u32>, today: NaiveDate) -> DriverEntry {
    let age = age_years(&d.date, today);
    let inbox = is_microsoft_inbox(d);
    let is_basic_display = d.class == "DISPLAY" && d.name.to_lowercase().contains("basic display");

    let (status, advice) = if let Some(code) = problem_code {
        let meaning = problem_code_meaning(code);
        let action = match code {
            22 => "Heb je dit apparaat bewust uitgeschakeld, dan is er geen actie nodig. Zo niet: schakel het weer in via Apparaatbeheer.".to_string(),
            14 | 38 => "Herstart de computer en scan opnieuw.".to_string(),
            28 | 18 | 39 | 31 | 37 | 10 | 43 | 52 => format!(
                "Veilige oplossing: open Apparaatbeheer, klik met de rechtermuisknop op dit apparaat en kies 'Apparaat verwijderen' (laat 'stuurprogramma verwijderen' UIT). Klik daarna op 'Actie' -> 'Zoeken naar gewijzigde apparaten' zodat Windows de schone driver lokaal herstelt (geen downloads nodig). Blijft de fout? Update via Windows Update (Optionele updates) of de officiële fabrikantsite. {}",
                class_advice(&d.class)
            ),
            _ => class_advice(&d.class).to_string(),
        };
        ("Probleem", format!("{} {}", meaning, action))
    } else if d.is_signed == Some(false) {
        (
            "Niet ondertekend",
            "Deze driver is niet digitaal ondertekend. Niet-ondertekende kernel-drivers kunnen instabiliteit, blauwe schermen en freezes veroorzaken; verwijder de bijbehorende software of vervang de driver door een ondertekende versie van de fabrikant.".to_string(),
        )
    } else if is_basic_display {
        (
            "Verouderd",
            "Windows gebruikt de generieke 'Microsoft Basic Display Adapter': er is geen echte videokaartdriver geïnstalleerd. Dit geeft schokkerig beeld en geen hardwareversnelling. Installeer de driver van NVIDIA, AMD of Intel (bij problemen eerst opschonen met DDU).".to_string(),
        )
    } else if let (false, Some(a), Some(max)) = (inbox, age, max_age_for_class(&d.class)) {
        if a > max {
            (
                "Verouderd",
                format!(
                    "Mogelijk verouderd: deze driver is {:.1} jaar oud (drempel voor deze klasse: {} jaar). {}",
                    a,
                    max,
                    class_advice(&d.class)
                ),
            )
        } else {
            ("OK", "Geen actie nodig.".to_string())
        }
    } else if inbox {
        (
            "OK",
            if is_storage_class(&d.class) {
                "Microsoft standaard-driver (bijv. stornvme/storahci), wordt bijgewerkt via Windows Update. Meestal stabiel; overweeg alleen bij schijf-freezes de driver van de fabrikant.".to_string()
            } else {
                "Microsoft standaard-driver, wordt bijgewerkt via Windows Update.".to_string()
            },
        )
    } else {
        ("OK", "Geen actie nodig.".to_string())
    };

    DriverEntry {
        device_name: if d.name.is_empty() {
            "(onbekend apparaat)".to_string()
        } else {
            d.name.clone()
        },
        device_class: d.class.clone(),
        provider: d.provider.clone(),
        version: d.version.clone(),
        date: d.date.clone(),
        age_years: age,
        is_signed: d.is_signed,
        status: status.to_string(),
        problem_code,
        advice,
    }
}

#[cfg(test)]
#[path = "drivers_tests.rs"]
mod tests;
