//! Driver Check (#10): spoort drivers op die (zeer) verouderd zijn, een Apparaatbeheer-
//! foutcode hebben of niet digitaal ondertekend zijn. De focus ligt op de klassen die in de
//! praktijk freezes/stotteringen veroorzaken: videokaart, chipset/systeem, opslagcontrollers,
//! netwerk, audio en USB.
//!
//! Gegevensbron: één PowerShell-aanroep die zowel `Win32_PnPSignedDriver` (alle geïnstalleerde
//! drivers) als `Win32_PnPEntity` met `ConfigManagerErrorCode -ne 0` (apparaten met een
//! probleemcode) als JSON teruggeeft. Op Linux gebruikt de scan sysfs, `lspci` en de kernel-log
//! (zie `drivers_linux.rs`); op macOS degradeert hij netjes naar `is_available: false`.

use std::sync::Mutex;

use chrono::{Datelike, NaiveDate};
use serde_json::Value;

use crate::models::{Advice, DriverEntry, DriverReport};

#[path = "drivers_helpers.rs"]
mod drivers_helpers;
use drivers_helpers::*;

pub use drivers_helpers::problem_code_meaning;

#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
#[path = "drivers_linux.rs"]
mod linux;

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
/// Opent een Windows-beheeronderdeel (`*.msc` uit System32) of een `ms-settings:`-pagina, op
/// dezelfde manier als dubbelklikken in Verkenner (ShellExecute).
///
/// Bewust niet via een verborgen `cmd /c start`: een onzichtbare cmd.exe die `eventvwr.msc` start
/// is precies hoe een bekende UAC-omzeiling werkt, en virusscanners (o.a. Bitdefender) sluiten de
/// app daarom af.
fn open_windows_target(target: &str, what: &str) -> Result<(), String> {
    #[cfg(windows)]
    {
        let result = if target.contains(':') {
            tauri_plugin_opener::open_url(target, None::<&str>)
        } else {
            let root = std::env::var_os("SystemRoot").unwrap_or_else(|| r"C:\Windows".into());
            tauri_plugin_opener::open_path(
                std::path::Path::new(&root).join("System32").join(target),
                None::<&str>,
            )
        };
        result.map_err(|e| {
            crate::tr!(
                format!("Kon {} niet openen: {}", what, e),
                format!("Could not open {}: {}", what, e)
            )
        })?;
    }
    #[cfg(not(windows))]
    {
        let _ = (target, what);
    }
    Ok(())
}

pub fn open_device_manager() -> Result<(), String> {
    open_windows_target(
        "devmgmt.msc",
        crate::tr!("Apparaatbeheer", "Device Manager"),
    )
}

pub fn open_event_viewer() -> Result<(), String> {
    open_windows_target("eventvwr.msc", crate::tr!("Logboeken", "Event Viewer"))
}

pub fn open_windows_update() -> Result<(), String> {
    open_windows_target("ms-settings:windowsupdate", "Windows Update")
}

pub fn scan_drivers_blocking() -> DriverReport {
    let scanned_at = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let today = chrono::Local::now().date_naive();

    let report = if cfg!(target_os = "linux") {
        linux::scan(today, scanned_at)
    } else {
        match run_powershell(PS_SCRIPT) {
            Some(raw) => parse_report(&raw, today, scanned_at),
            None => unavailable_report(
                scanned_at,
                crate::tr!(
                    "Driver Check is alleen beschikbaar op Windows en Linux (PowerShell/WMI niet gevonden).",
                    "The Driver Check is only available on Windows and Linux (PowerShell/WMI not found)."
                ),
            ),
        }
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
        unsupported_count: 0,
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
            crate::tr!(
                "Driver-informatie kon niet worden uitgelezen (geen geldige WMI-uitvoer van PowerShell). Probeer de scan opnieuw of controleer of de WMI-service (Winmgmt) draait.",
                "Driver information could not be read (no valid WMI output from PowerShell). Try the scan again or check that the WMI service (Winmgmt) is running."
            ),
        );
    }
    let parsed: Value = match serde_json::from_str(trimmed) {
        Ok(v) => v,
        Err(_) => {
            return unavailable_report(
                scanned_at,
                crate::tr!(
                    "Driver-informatie kon niet worden verwerkt (ongeldige JSON van PowerShell).",
                    "Driver information could not be processed (invalid JSON from PowerShell)."
                ),
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
            crate::tr!(
                "WMI gaf geen driverinformatie terug. Probeer de scan opnieuw (eventueel als administrator).",
                "WMI returned no driver information. Try the scan again (possibly as administrator)."
            ),
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
    let unsupported_count = entries.iter().filter(|e| e.support.is_some()).count();

    let mut summary = build_summary(
        total_drivers,
        problem_count,
        outdated_count,
        unsigned_count,
        &entries,
    );
    if unsupported_count > 0 {
        summary.push_str(&crate::tr!(
            format!(
                " {unsupported_count} driver(s) worden door de fabrikant niet meer (volledig) ondersteund. Dat is geen fout: je hoeft alleen iets te doen als je problemen merkt met dat apparaat."
            ),
            format!(
                " {unsupported_count} driver(s) are no longer (fully) supported by the manufacturer. That is not an error: you only need to act if you notice problems with that device."
            )
        ));
    }

    DriverReport {
        is_available: true,
        scanned_at,
        total_drivers,
        outdated_count,
        problem_count,
        unsigned_count,
        unsupported_count,
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
        return crate::tr!(
            format!(
                "{} drivers gescand: geen probleemapparaten, verouderde of niet-ondertekende drivers gevonden in de freeze-gevoelige klassen.",
                total
            ),
            format!(
                "{} drivers scanned: no problem devices, outdated or unsigned drivers found in the freeze-sensitive classes.",
                total
            )
        );
    }
    let mut parts = Vec::new();
    if problems > 0 {
        parts.push(crate::tr!(
            format!("{} apparaat/apparaten met een foutcode", problems),
            format!("{} device(s) with an error code", problems)
        ));
    }
    if unsigned > 0 {
        parts.push(crate::tr!(
            format!("{} niet-ondertekende driver(s)", unsigned),
            format!("{} unsigned driver(s)", unsigned)
        ));
    }
    if outdated > 0 {
        parts.push(crate::tr!(
            format!("{} mogelijk verouderde driver(s)", outdated),
            format!("{} possibly outdated driver(s)", outdated)
        ));
    }
    let gpu_flag = entries
        .iter()
        .any(|e| e.device_class == "DISPLAY" && e.status != "OK");
    let storage_flag = entries
        .iter()
        .any(|e| is_storage_class(&e.device_class) && e.status != "OK");
    let mut s = crate::tr!(
        format!("{} drivers gescand: {}.", total, parts.join(", ")),
        format!("{} drivers scanned: {}.", total, parts.join(", "))
    );
    if gpu_flag {
        s.push_str(crate::tr!(
            " Let op: de videokaartdriver is gemarkeerd — een bekende oorzaak van freezes (TDR).",
            " Note: the graphics driver is flagged — a known cause of freezes (TDR)."
        ));
    }
    if storage_flag {
        s.push_str(crate::tr!(" Let op: een opslagcontroller-driver is gemarkeerd — kan schijf-time-outs en freezes van enkele seconden veroorzaken.", " Note: a storage controller driver is flagged — it can cause disk timeouts and freezes of a few seconds."));
    }
    if outdated > 0 {
        s.push_str(crate::tr!(" Controleer verouderde drivers bij de fabrikant (moederbord/laptop of chip-leverancier).", " Check outdated drivers with the manufacturer (motherboard/laptop or chip vendor)."));
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

    let t = |nl: &str, en: &str| crate::tr!(nl, en).to_string();
    let guide = class_guidance(&d.class);

    let (status, detail) = if let Some(code) = problem_code {
        let title = problem_code_meaning(code).to_string();
        match code {
            22 => (
                "Probleem",
                Advice {
                    title,
                    steps: vec![
                        t(
                            "Heb je dit apparaat bewust uitgeschakeld? Dan hoef je niets te doen.",
                            "Did you disable this device on purpose? Then there is nothing to do.",
                        ),
                        t(
                            "Zo niet: open Apparaatbeheer, klik met rechts op het apparaat en kies 'Apparaat inschakelen'.",
                            "If not: open Device Manager, right-click the device and choose 'Enable device'.",
                        ),
                    ],
                    ..Default::default()
                },
            ),
            14 | 38 => (
                "Probleem",
                Advice {
                    title,
                    steps: vec![
                        t("Herstart de computer.", "Restart the computer."),
                        t(
                            "Voer de driver-scan opnieuw uit.",
                            "Run the driver scan again.",
                        ),
                    ],
                    ..Default::default()
                },
            ),
            28 | 18 | 39 | 31 | 37 | 10 | 43 | 52 => (
                "Probleem",
                Advice {
                    title,
                    why: Some(t(
                        "De juiste driver staat meestal al op je pc. Zo laat je Windows hem veilig opnieuw installeren, zonder iets te downloaden:",
                        "The right driver is usually already on your PC. This lets Windows reinstall it safely, without downloading anything:",
                    )),
                    steps: vec![
                        t(
                            "Open Apparaatbeheer (knop hieronder).",
                            "Open Device Manager (button below).",
                        ),
                        t(
                            "Klik met rechts op dit apparaat en kies 'Apparaat verwijderen'. Laat het vinkje 'Stuurprogramma verwijderen' UIT staan.",
                            "Right-click this device and choose 'Uninstall device'. Leave 'Delete the driver software' UNCHECKED.",
                        ),
                        t(
                            "Klik bovenin op 'Actie' → 'Zoeken naar gewijzigde apparaten'. Windows installeert de driver opnieuw.",
                            "Click 'Action' → 'Scan for hardware changes' at the top. Windows reinstalls the driver.",
                        ),
                    ],
                    fallback_title: Some(t(
                        "Blijft de fout daarna? Werk de driver bij:",
                        "Still failing after that? Update the driver:",
                    )),
                    fallback_steps: guide.steps,
                },
            ),
            _ => (
                "Probleem",
                Advice {
                    title,
                    why: guide.why,
                    steps: guide.steps,
                    ..Default::default()
                },
            ),
        }
    } else if d.is_signed == Some(false) {
        (
            "Niet ondertekend",
            Advice {
                title: t(
                    "Deze driver is niet digitaal ondertekend.",
                    "This driver is not digitally signed.",
                ),
                why: Some(t(
                    "Niet-ondertekende kernel-drivers kunnen instabiliteit, blauwe schermen en freezes veroorzaken.",
                    "Unsigned kernel drivers can cause instability, blue screens and freezes.",
                )),
                steps: vec![
                    t(
                        "Zoek uit bij welke software deze driver hoort (de leverancier staat hierboven).",
                        "Find out which software this driver belongs to (the vendor is shown above).",
                    ),
                    t(
                        "Verwijder die software, of vervang de driver door een ondertekende versie van de fabrikant.",
                        "Uninstall that software, or replace the driver with a signed version from the manufacturer.",
                    ),
                ],
                ..Default::default()
            },
        )
    } else if is_basic_display {
        (
            "Verouderd",
            Advice {
                title: t(
                    "Er is geen echte videokaartdriver geïnstalleerd.",
                    "No real graphics driver is installed.",
                ),
                why: Some(t(
                    "Windows gebruikt nu de generieke 'Microsoft Basic Display Adapter'. Dat geeft schokkerig beeld en geen hardwareversnelling.",
                    "Windows is using the generic 'Microsoft Basic Display Adapter'. That causes choppy video and no hardware acceleration.",
                )),
                steps: guide.steps,
                ..Default::default()
            },
        )
    } else if let (false, Some(a), Some(max)) = (inbox, age, max_age_for_class(&d.class)) {
        if a > max {
            (
                "Verouderd",
                Advice {
                    title: crate::tr!(
                        format!(
                            "Mogelijk verouderd: deze driver is {:.1} jaar oud (grens voor dit type: {} jaar).",
                            a, max
                        ),
                        format!(
                            "Possibly outdated: this driver is {:.1} years old (limit for this type: {} years).",
                            a, max
                        )
                    ),
                    why: guide.why,
                    steps: guide.steps,
                    ..Default::default()
                },
            )
        } else {
            (
                "OK",
                Advice {
                    title: t("Geen actie nodig.", "No action needed."),
                    ..Default::default()
                },
            )
        }
    } else if inbox {
        (
            "OK",
            Advice {
                title: t("Microsoft-standaarddriver, wordt bijgewerkt via Windows Update.", "Microsoft inbox driver, updated via Windows Update."),
                why: is_storage_class(&d.class).then(|| {
                    t(
                        "Meestal stabiel. Alleen bij schijf-freezes is de driver van de fabrikant het proberen waard.",
                        "Usually stable. Only if you get disk freezes is the manufacturer's driver worth trying.",
                    )
                }),
                ..Default::default()
            },
        )
    } else {
        (
            "OK",
            Advice {
                title: t("Geen actie nodig.", "No action needed."),
                ..Default::default()
            },
        )
    };
    let advice = flatten_advice(&detail);
    let parsed_date = NaiveDate::parse_from_str(&d.date, "%Y-%m-%d")
        .ok()
        .filter(|x| !is_placeholder_date(x, &d.date));
    let support = crate::driver_support::support_for(&d.name, &d.class, parsed_date, inbox);

    DriverEntry {
        device_name: if d.name.is_empty() {
            crate::tr!("(onbekend apparaat)", "(unknown device)").to_string()
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
        advice_detail: detail,
        support,
    }
}

/// Platte tekstversie van het advies (rapport, tests, oudere weergaven).
pub fn flatten_advice(a: &Advice) -> String {
    a.flatten()
}

#[cfg(test)]
#[path = "drivers_tests.rs"]
mod tests;
