//! Driver Check (#10): spoort drivers op die (zeer) verouderd zijn, een Apparaatbeheer-
//! foutcode hebben of niet digitaal ondertekend zijn. De focus ligt op de klassen die in de
//! praktijk freezes/stotteringen veroorzaken: videokaart, chipset/systeem, opslagcontrollers,
//! netwerk, audio en USB.
//!
//! Gegevensbron: één PowerShell-aanroep die zowel `Win32_PnPSignedDriver` (alle geïnstalleerde
//! drivers) als `Win32_PnPEntity` met `ConfigManagerErrorCode -ne 0` (apparaten met een
//! probleemcode) als JSON teruggeeft. Op Linux/macOS (geen PowerShell) degradeert de scan
//! netjes naar `is_available: false`.

use std::process::Command;
use std::sync::Mutex;

use chrono::{Datelike, NaiveDate};
use serde_json::Value;

use crate::models::{DriverEntry, DriverReport};

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

/// Async zodat de WMI-scan (3-4 s) niet de UI-thread blokkeert.
#[tauri::command]
pub async fn scan_drivers() -> DriverReport {
    tauri::async_runtime::spawn_blocking(scan_drivers_blocking)
        .await
        .unwrap_or_else(|_| {
            unavailable_report(
                chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
                "Driver-scan is onverwacht afgebroken.",
            )
        })
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

/// Voert het script uit via `powershell` en valt terug op `powershell.exe` (WSL-interop).
/// Geeft `None` als geen van beide gestart kan worden.
fn run_powershell(script: &str) -> Option<String> {
    for exe in ["powershell", "powershell.exe"] {
        let mut cmd = Command::new(exe);
        cmd.args(["-NoProfile", "-NonInteractive", "-Command", script]);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }
        if let Ok(out) = cmd.output() {
            return Some(String::from_utf8_lossy(&out.stdout).into_owned());
        }
    }
    None
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

/// Ruwe driverregel uit Win32_PnPSignedDriver.
#[derive(Debug, Clone, Default)]
struct RawDriver {
    name: String,
    class: String,
    provider: String,
    version: String,
    date: String,
    is_signed: Option<bool>,
    device_id: String,
}

/// Apparaat met probleemcode uit Win32_PnPEntity.
#[derive(Debug, Clone, Default)]
struct RawProblem {
    name: String,
    class: String,
    code: u32,
    device_id: String,
}

fn str_field(v: &Value, key: &str) -> String {
    v.get(key)
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .trim()
        .to_string()
}

/// PowerShell geeft een array, een los object of null terug; normaliseer naar een lijst.
fn as_list(v: Option<&Value>) -> Vec<Value> {
    match v {
        Some(Value::Array(a)) => a.clone(),
        Some(obj @ Value::Object(_)) => vec![obj.clone()],
        _ => Vec::new(),
    }
}

fn parse_raw_driver(v: &Value) -> RawDriver {
    RawDriver {
        name: str_field(v, "DeviceName"),
        class: str_field(v, "DeviceClass").to_uppercase(),
        provider: str_field(v, "DriverProviderName"),
        version: str_field(v, "DriverVersion"),
        date: normalize_date(&str_field(v, "DriverDate")),
        is_signed: v.get("IsSigned").and_then(|x| x.as_bool()),
        device_id: str_field(v, "DeviceID"),
    }
}

fn parse_raw_problem(v: &Value) -> RawProblem {
    RawProblem {
        name: str_field(v, "Name"),
        class: str_field(v, "PNPClass").to_uppercase(),
        code: v
            .get("ConfigManagerErrorCode")
            .and_then(|x| x.as_u64())
            .unwrap_or(0) as u32,
        device_id: str_field(v, "DeviceID"),
    }
}

/// Accepteert "YYYY-MM-DD" (of een langere ISO-string) en geeft "YYYY-MM-DD" of "" terug.
fn normalize_date(s: &str) -> String {
    let head: String = s.chars().take(10).collect();
    match NaiveDate::parse_from_str(&head, "%Y-%m-%d") {
        Ok(d) => d.format("%Y-%m-%d").to_string(),
        Err(_) => String::new(),
    }
}

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
            )
        }
    };

    // Normaal: {"Signed":[...],"Problems":[...]}. Wees tolerant voor een losse
    // driver-array of een los driver-object.
    let (signed_vals, problem_vals) = if parsed.get("Signed").is_some() || parsed.get("Problems").is_some() {
        (as_list(parsed.get("Signed")), as_list(parsed.get("Problems")))
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
        let problem_idx = problems
            .iter()
            .position(|p| !p.device_id.is_empty() && p.device_id.eq_ignore_ascii_case(&d.device_id));
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
            name: if p.name.is_empty() { p.device_id.clone() } else { p.name.clone() },
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
            .then(a.device_name.to_lowercase().cmp(&b.device_name.to_lowercase()))
    });

    let problem_count = entries.iter().filter(|e| e.status == "Probleem").count();
    let outdated_count = entries.iter().filter(|e| e.status == "Verouderd").count();
    let unsigned_count = entries.iter().filter(|e| e.status == "Niet ondertekend").count();

    let summary = build_summary(total_drivers, problem_count, outdated_count, unsigned_count, &entries);

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
        s.push_str(" Let op: de videokaartdriver is gemarkeerd — een bekende oorzaak van freezes (TDR).");
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
        let hw_class = matches!(d.class.as_str(), "SCSIADAPTER" | "HDC" | "USB" | "NET" | "MEDIA");
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

/// Betekenis van een Apparaatbeheer-foutcode (ConfigManagerErrorCode) in het Nederlands.
pub fn problem_code_meaning(code: u32) -> &'static str {
    match code {
        1 => "Code 1: het apparaat is niet juist geconfigureerd.",
        3 => "Code 3: de driver is mogelijk beschadigd of het systeem heeft te weinig geheugen.",
        10 => "Code 10: het apparaat kan niet worden gestart — meestal een defecte, verkeerde of verouderde driver.",
        12 => "Code 12: onvoldoende vrije resources (IRQ/geheugen) voor dit apparaat.",
        14 => "Code 14: het apparaat werkt pas goed na een herstart.",
        18 => "Code 18: de drivers voor dit apparaat moeten opnieuw worden geïnstalleerd.",
        19 => "Code 19: de configuratie in het register is onvolledig of beschadigd.",
        21 => "Code 21: Windows is dit apparaat aan het verwijderen.",
        22 => "Code 22: het apparaat is uitgeschakeld (meestal handmatig in Apparaatbeheer).",
        24 => "Code 24: het apparaat is niet aanwezig, werkt niet goed of niet alle drivers zijn geïnstalleerd.",
        28 => "Code 28: de drivers voor dit apparaat zijn niet geïnstalleerd.",
        29 => "Code 29: het apparaat is uitgeschakeld door de firmware (BIOS/UEFI).",
        31 => "Code 31: het apparaat werkt niet goed; Windows kan de benodigde drivers niet laden.",
        32 => "Code 32: de driver(service) voor dit apparaat is uitgeschakeld.",
        37 => "Code 37: de driver kon niet worden geïnitialiseerd.",
        38 => "Code 38: een vorige instantie van de driver staat nog in het geheugen — herstart.",
        39 => "Code 39: de driver is beschadigd of ontbreekt.",
        40 => "Code 40: de service-informatie van de driver in het register ontbreekt of is onjuist.",
        41 => "Code 41: de driver is geladen maar het hardware-apparaat wordt niet gevonden.",
        43 => "Code 43: Windows heeft het apparaat gestopt omdat het problemen meldde — vaak een driver- of hardwarefout (GPU/USB).",
        45 => "Code 45: het apparaat is momenteel niet aangesloten.",
        47 => "Code 47: het apparaat is voorbereid op veilig verwijderen.",
        48 => "Code 48: de driver is geblokkeerd omdat deze bekende problemen met Windows heeft.",
        49 => "Code 49: het systeemregister is te groot (registerlimiet bereikt).",
        52 => "Code 52: de digitale handtekening van de driver kan niet worden geverifieerd.",
        _ => "Apparaatbeheer meldt een probleem met dit apparaat.",
    }
}

/// Klassespecifiek advies voor het bijwerken van een driver.
fn class_advice(class: &str) -> &'static str {
    match class {
        "DISPLAY" => "Doe een schone installatie: verwijder de huidige driver met DDU (Display Driver Uninstaller) in Veilige modus en installeer daarna de nieuwste driver van NVIDIA, AMD of Intel. Verouderde/beschadigde GPU-drivers zijn een bekende oorzaak van TDR-freezes (scherm bevriest enkele seconden).",
        "SCSIADAPTER" | "HDC" => "Update de chipset-, AHCI- of NVMe-driver via de supportpagina van je moederbord- of laptopfabrikant (of Intel RST / AMD chipset / Samsung NVMe). Verouderde opslagcontroller-drivers veroorzaken schijf-time-outs (storahci/stornvme) en freezes van enkele seconden.",
        "SYSTEM" => "Installeer het nieuwste chipset-/platformpakket van Intel of AMD, of via de supportpagina/tool van je moederbord- of laptopfabrikant (bijv. Lenovo Vantage, Dell SupportAssist, MSI Center).",
        "NET" => "Download de nieuwste netwerkdriver van Intel, Realtek, Killer of de laptopfabrikant. Oude netwerkdrivers veroorzaken vaak hoge DPC-latency (ndis.sys) en haperingen; schakel bij stotteringen ook 'Energy Efficient Ethernet' en energiebesparing van de adapter uit.",
        "MEDIA" | "AUDIOENDPOINT" => "Update de audiodriver (Realtek, Intel Smart Sound, NVIDIA/AMD HDMI-audio) via de fabrikant. Audiodrivers zijn een bekende bron van DPC-latency, krakend geluid en micro-stutters.",
        "USB" => "Update de USB-/Thunderbolt-controllerdriver via het chipsetpakket van de fabrikant en schakel 'Selectief onderbreken van USB' uit in Energiebeheer bij haperingen of wegvallende apparaten.",
        _ => "Zoek een recentere driver bij de fabrikant van het apparaat of via Windows Update (optionele updates).",
    }
}

/// Bepaalt status, leeftijd en advies voor één driver. Prioriteit:
/// Probleem > Niet ondertekend > Verouderd > OK.
fn classify(d: &RawDriver, problem_code: Option<u32>, today: NaiveDate) -> DriverEntry {
    let age = age_years(&d.date, today);
    let inbox = is_microsoft_inbox(d);
    let is_basic_display = d.class == "DISPLAY"
        && d.name.to_lowercase().contains("basic display");

    let (status, advice) = if let Some(code) = problem_code {
        let meaning = problem_code_meaning(code);
        let action = match code {
            22 => "Heb je dit apparaat bewust uitgeschakeld, dan is er geen actie nodig. Zo niet: schakel het weer in via Apparaatbeheer.".to_string(),
            14 | 38 => "Herstart de computer en scan opnieuw.".to_string(),
            28 | 18 | 39 | 31 | 37 | 10 | 43 | 52 => format!(
                "Verwijder het apparaat in Apparaatbeheer (vink 'driver verwijderen' aan) en installeer de juiste driver opnieuw. {}",
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
                    a, max, class_advice(&d.class)
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
        device_name: if d.name.is_empty() { "(onbekend apparaat)".to_string() } else { d.name.clone() },
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
mod tests {
    use super::*;

    fn today() -> NaiveDate {
        NaiveDate::from_ymd_opt(2026, 10, 29).unwrap()
    }

    fn parse(raw: &str) -> DriverReport {
        parse_report(raw, today(), "test".to_string())
    }

    fn find<'a>(r: &'a DriverReport, name: &str) -> Option<&'a DriverEntry> {
        r.entries.iter().find(|e| e.device_name == name)
    }

    /// Echte regels van een Windows 11-laptop (Win32_PnPSignedDriver), aangevuld met een
    /// synthetisch probleemapparaat (code 43), een oude GPU-driver en een niet-ondertekende driver.
    const FIXTURE: &str = r#"{"Signed":[
{"DeviceName":"WAN Miniport (IP)","DeviceClass":"NET","DriverProviderName":"Microsoft","DriverVersion":"10.0.26100.1","DriverDate":"2006-06-21","IsSigned":true,"DeviceID":"SWD\\MSRRAS\\MS_NDISWANIP"},
{"DeviceName":"AAP Server","DeviceClass":null,"DriverProviderName":null,"DriverVersion":null,"DriverDate":"","IsSigned":null,"DeviceID":"BTHENUM\\{74EC2172-0BAD-4D01-8F77-997B2BE0722A}_VID&0001004C_PID&200F\\7&15C6D04F&2&201582531B4E_C00000000"},
{"DeviceName":"Intel(R) Iris(R) Xe Graphics","DeviceClass":"DISPLAY","DriverProviderName":"Intel Corporation","DriverVersion":"32.0.101.7085","DriverDate":"2026-03-03","IsSigned":true,"DeviceID":"PCI\\VEN_8086&DEV_9A49&SUBSYS_508817AA&REV_01\\3&11583659&1&10"},
{"DeviceName":"NVIDIA GeForce GTX 1060 6GB","DeviceClass":"DISPLAY","DriverProviderName":"NVIDIA","DriverVersion":"31.0.15.3623","DriverDate":"2023-06-02","IsSigned":true,"DeviceID":"PCI\\VEN_10DE&DEV_1C03&SUBSYS_85AE1043&REV_A1\\4&2B8C1A3&0&0008"},
{"DeviceName":"Realtek PCIe GbE Family Controller","DeviceClass":"NET","DriverProviderName":"Realtek","DriverVersion":"10.50.511.2021","DriverDate":"2021-05-11","IsSigned":true,"DeviceID":"PCI\\VEN_10EC&DEV_8168&SUBSYS_508717AA&REV_15\\01000000684CE00000"},
{"DeviceName":"Intel(R) PCI Express Root Port #9 - A0B0","DeviceClass":"SYSTEM","DriverProviderName":"INTEL","DriverVersion":"10.1.24.6","DriverDate":"1968-07-18","IsSigned":true,"DeviceID":"PCI\\VEN_8086&DEV_A0B0&SUBSYS_508717AA&REV_20\\3&11583659&1&E8"},
{"DeviceName":"Intel(R) Platform Monitoring Technology Driver","DeviceClass":"SYSTEM","DriverProviderName":"Intel(R) Platform Monitoring Technology Device","DriverVersion":"10.0.26100.8972","DriverDate":"2006-06-21","IsSigned":true,"DeviceID":"PCI\\VEN_8086&DEV_9A0D&SUBSYS_508717AA&REV_01\\3&11583659&1&50"},
{"DeviceName":"Standard NVM Express Controller","DeviceClass":"SCSIADAPTER","DriverProviderName":"Microsoft","DriverVersion":"10.0.26100.9549","DriverDate":"2006-06-21","IsSigned":true,"DeviceID":"PCI\\VEN_144D&DEV_A809&SUBSYS_A801144D&REV_00\\4&1B840BBE&0&00E8"},
{"DeviceName":"Microsoft Storage Spaces Controller","DeviceClass":"SCSIADAPTER","DriverProviderName":"Microsoft","DriverVersion":"10.0.26100.9711","DriverDate":"2006-06-21","IsSigned":true,"DeviceID":"ROOT\\SPACEPORT\\0000"},
{"DeviceName":"Intel® Smart Sound Technology for Digital Microphones","DeviceClass":"MEDIA","DriverProviderName":"Intel(R) Corporation","DriverVersion":"10.29.0.7767","DriverDate":"2022-05-30","IsSigned":true,"DeviceID":"INTELAUDIO\\CTLR_DEV_A0C8&LINKTYPE_02&DEVTYPE_00&VEN_8086&DEV_AE20&SUBSYS_508717AA&REV_0001\\4&2BE61CE6&0&0000"},
{"DeviceName":"USB Composite Device","DeviceClass":"USB","DriverProviderName":"Microsoft","DriverVersion":"10.0.26100.9711","DriverDate":"2006-06-21","IsSigned":true,"DeviceID":"USB\\VID_3554&PID_FA09\\5&C5FC33B&0&5"},
{"DeviceName":"Generic USB Hub","DeviceClass":"USB","DriverProviderName":"Microsoft","DriverVersion":"10.0.26100.9711","DriverDate":"2006-06-21","IsSigned":true,"DeviceID":"USB\\VID_05E3&PID_0610\\6&1A2B3C&0&1"},
{"DeviceName":"Cheap RGB Controller","DeviceClass":"HIDCLASS","DriverProviderName":"RGBSoft","DriverVersion":"1.0.0.1","DriverDate":"2019-01-01","IsSigned":false,"DeviceID":"ROOT\\RGBCTRL\\0000"}
],"Problems":[
{"Name":"Generic USB Hub","PNPClass":"USB","ConfigManagerErrorCode":43,"DeviceID":"usb\\vid_05e3&pid_0610\\6&1a2b3c&0&1"},
{"Name":"Onbekend apparaat","PNPClass":null,"ConfigManagerErrorCode":28,"DeviceID":"ACPI\\VEN_XYZ\\1"}
]}"#;

    #[test]
    fn drivers_problem_device_is_probleem() {
        let r = parse(FIXTURE);
        assert!(r.is_available);
        let hub = find(&r, "Generic USB Hub").expect("probleemapparaat ontbreekt");
        assert_eq!(hub.status, "Probleem");
        assert_eq!(hub.problem_code, Some(43));
        assert!(hub.advice.contains("Code 43"));
        // Niet-gematcht probleemapparaat (code 28) komt ook in de lijst.
        let unk = find(&r, "Onbekend apparaat").expect("code 28 ontbreekt");
        assert_eq!(unk.status, "Probleem");
        assert_eq!(unk.problem_code, Some(28));
        assert_eq!(r.problem_count, 2);
        // Problemen staan bovenaan.
        assert_eq!(r.entries[0].status, "Probleem");
        assert_eq!(r.entries[1].status, "Probleem");
    }

    #[test]
    fn drivers_old_gpu_is_verouderd() {
        let r = parse(FIXTURE);
        let gpu = find(&r, "NVIDIA GeForce GTX 1060 6GB").unwrap();
        assert_eq!(gpu.status, "Verouderd");
        assert!(gpu.advice.contains("DDU"));
        assert!(gpu.age_years.unwrap() > 3.0);
        // Recente Intel-GPU-driver (7 maanden) is OK.
        let iris = find(&r, "Intel(R) Iris(R) Xe Graphics").unwrap();
        assert_eq!(iris.status, "OK");
        // Realtek NIC uit 2021 (> 3 jaar) is verouderd.
        assert_eq!(find(&r, "Realtek PCIe GbE Family Controller").unwrap().status, "Verouderd");
        // Intel SST uit 2022 (4,4 jaar) is verouderd en het ®-teken blijft intact.
        let sst = find(&r, "Intel® Smart Sound Technology for Digital Microphones").unwrap();
        assert_eq!(sst.status, "Verouderd");
    }

    #[test]
    fn drivers_microsoft_inbox_2006_is_ok() {
        let r = parse(FIXTURE);
        let nvme = find(&r, "Standard NVM Express Controller").unwrap();
        assert_eq!(nvme.status, "OK");
        assert_eq!(nvme.age_years, None);
        assert_eq!(nvme.date, "2006-06-21");
        // Misleidende leveranciersnaam met 10.0.x + 2006-datum: inbox, niet in de lijst.
        assert!(find(&r, "Intel(R) Platform Monitoring Technology Driver").is_none());
    }

    #[test]
    fn drivers_intel_1968_placeholder_is_ok() {
        let r = parse(FIXTURE);
        let rp = find(&r, "Intel(R) PCI Express Root Port #9 - A0B0").unwrap();
        assert_eq!(rp.status, "OK");
        assert_eq!(rp.age_years, None);
    }

    #[test]
    fn drivers_unsigned_and_noise_filtering() {
        let r = parse(FIXTURE);
        let rgb = find(&r, "Cheap RGB Controller").unwrap();
        assert_eq!(rgb.status, "Niet ondertekend");
        assert_eq!(r.unsigned_count, 1);
        // Ruis: WAN Miniport, BTHENUM zonder driver, MS Storage Spaces, MS USB composite.
        assert!(find(&r, "WAN Miniport (IP)").is_none());
        assert!(find(&r, "AAP Server").is_none());
        assert!(find(&r, "Microsoft Storage Spaces Controller").is_none());
        assert!(find(&r, "USB Composite Device").is_none());
        // total_drivers telt alle echte drivers (13 regels minus 1 zonder driver).
        assert_eq!(r.total_drivers, 12);
        assert_eq!(r.outdated_count, 3);
    }

    #[test]
    fn drivers_null_is_signed_is_not_unsigned() {
        let raw = r#"{"Signed":{"DeviceName":"Foo","DeviceClass":"NET","DriverProviderName":"Acme","DriverVersion":"1.0","DriverDate":"2026-01-01","IsSigned":null,"DeviceID":"PCI\\VEN_1\\1"},"Problems":[]}"#;
        let r = parse(raw);
        let e = find(&r, "Foo").unwrap();
        assert_eq!(e.status, "OK");
        assert_eq!(e.is_signed, None);
    }

    #[test]
    fn drivers_single_object_json() {
        // "Signed" als los object i.p.v. array, "Problems" null.
        let raw = r#"{"Signed":{"DeviceName":"AMD Radeon RX 580","DeviceClass":"DISPLAY","DriverProviderName":"Advanced Micro Devices, Inc.","DriverVersion":"27.20.1000","DriverDate":"2020-11-05","IsSigned":true,"DeviceID":"PCI\\VEN_1002&DEV_67DF\\1"},"Problems":null}"#;
        let r = parse(raw);
        assert!(r.is_available);
        assert_eq!(r.total_drivers, 1);
        assert_eq!(r.entries.len(), 1);
        assert_eq!(r.entries[0].status, "Verouderd");

        // Helemaal los driver-object zonder wrapper, met BOM.
        let raw2 = "\u{feff}{\"DeviceName\":\"Realtek Audio\",\"DeviceClass\":\"MEDIA\",\"DriverProviderName\":\"Realtek\",\"DriverVersion\":\"6.0\",\"DriverDate\":\"2026-05-01\",\"IsSigned\":true,\"DeviceID\":\"HDAUDIO\\\\1\"}";
        let r2 = parse(raw2);
        assert!(r2.is_available);
        assert_eq!(r2.entries[0].status, "OK");
    }

    #[test]
    fn drivers_empty_or_invalid_output_is_unavailable() {
        for raw in ["", "   \r\n", "Get-CimInstance : Toegang geweigerd", "{not json", "{\"Signed\":[],\"Problems\":[]}"] {
            let r = parse(raw);
            assert!(!r.is_available, "verwacht is_available=false voor {:?}", raw);
            assert!(r.entries.is_empty());
            assert!(!r.summary.is_empty());
        }
    }

    #[test]
    fn drivers_basic_display_adapter_flagged() {
        let raw = r#"{"Signed":[{"DeviceName":"Microsoft Basic Display Adapter","DeviceClass":"DISPLAY","DriverProviderName":"Microsoft","DriverVersion":"10.0.26100.1","DriverDate":"2006-06-21","IsSigned":true,"DeviceID":"PCI\\VEN_10DE&DEV_2484\\1"}],"Problems":[]}"#;
        let r = parse(raw);
        assert_eq!(r.entries[0].status, "Verouderd");
        assert!(r.entries[0].advice.contains("DDU"));
    }

    #[test]
    fn drivers_last_report_is_cached_shape() {
        // last_report() moet zonder panic vanuit een andere thread te lezen zijn.
        let h = std::thread::spawn(last_report);
        let _ = h.join().unwrap();
    }
}

#[cfg(test)]
mod live_tests {
    /// Draait de echte scan (Windows, of WSL via powershell.exe). Handmatig:
    /// `cargo test drivers_live -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn drivers_live_scan() {
        let r = super::scan_drivers_blocking();
        println!(
            "available={} total={} entries={} problems={} outdated={} unsigned={}\n{}",
            r.is_available, r.total_drivers, r.entries.len(), r.problem_count, r.outdated_count, r.unsigned_count, r.summary
        );
        for e in &r.entries {
            println!("[{}] {} | {} | {} | {} | {} | {:?}", e.status, e.device_class, e.device_name, e.provider, e.version, e.date, e.age_years);
        }
        assert!(super::last_report().is_some());
    }
}
