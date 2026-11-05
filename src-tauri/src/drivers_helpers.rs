use chrono::NaiveDate;
use serde_json::Value;

/// Ruwe driverregel uit Win32_PnPSignedDriver.
#[derive(Debug, Clone, Default)]
pub struct RawDriver {
    pub name: String,
    pub class: String,
    pub provider: String,
    pub version: String,
    pub date: String,
    pub is_signed: Option<bool>,
    pub device_id: String,
}

/// Apparaat met probleemcode uit Win32_PnPEntity.
#[derive(Debug, Clone, Default)]
pub struct RawProblem {
    pub name: String,
    pub class: String,
    pub code: u32,
    pub device_id: String,
}

pub fn str_field(v: &Value, key: &str) -> String {
    v.get(key)
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .trim()
        .to_string()
}

/// PowerShell geeft een array, een los object of null terug; normaliseer naar een lijst.
pub fn as_list(v: Option<&Value>) -> Vec<Value> {
    match v {
        Some(Value::Array(a)) => a.clone(),
        Some(obj @ Value::Object(_)) => vec![obj.clone()],
        _ => Vec::new(),
    }
}

pub fn parse_raw_driver(v: &Value) -> RawDriver {
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

pub fn parse_raw_problem(v: &Value) -> RawProblem {
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
pub fn normalize_date(s: &str) -> String {
    let head: String = s.chars().take(10).collect();
    match NaiveDate::parse_from_str(&head, "%Y-%m-%d") {
        Ok(d) => d.format("%Y-%m-%d").to_string(),
        Err(_) => String::new(),
    }
}

/// Betekenis van een Apparaatbeheer-foutcode (ConfigManagerErrorCode) in het Nederlands.
pub fn problem_code_meaning(code: u32) -> &'static str {
    match code {
        1 => "Code 1: het apparaat is niet juist geconfigureerd.",
        3 => "Code 3: de driver is mogelijk beschadigd of het systeem heeft te weinig geheugen.",
        10 => {
            "Code 10: het apparaat kan niet worden gestart — meestal een defecte, verkeerde of verouderde driver."
        }
        12 => "Code 12: onvoldoende vrije resources (IRQ/geheugen) voor dit apparaat.",
        14 => "Code 14: het apparaat werkt pas goed na een herstart.",
        18 => "Code 18: de drivers voor dit apparaat moeten opnieuw worden geïnstalleerd.",
        19 => "Code 19: de configuratie in het register is onvolledig of beschadigd.",
        21 => "Code 21: Windows is dit apparaat aan het verwijderen.",
        22 => "Code 22: het apparaat is uitgeschakeld (meestal handmatig in Apparaatbeheer).",
        24 => {
            "Code 24: het apparaat is niet aanwezig, werkt niet goed of niet alle drivers zijn geïnstalleerd."
        }
        28 => "Code 28: de drivers voor dit apparaat zijn niet geïnstalleerd.",
        29 => "Code 29: het apparaat is uitgeschakeld door de firmware (BIOS/UEFI).",
        31 => "Code 31: het apparaat werkt niet goed; Windows kan de benodigde drivers niet laden.",
        32 => "Code 32: de driver(service) voor dit apparaat is uitgeschakeld.",
        37 => "Code 37: de driver kon niet worden geïnitialiseerd.",
        38 => "Code 38: een vorige instantie van de driver staat nog in het geheugen — herstart.",
        39 => "Code 39: de driver is beschadigd of ontbreekt.",
        40 => {
            "Code 40: de service-informatie van de driver in het register ontbreekt of is onjuist."
        }
        41 => "Code 41: de driver is geladen maar het hardware-apparaat wordt niet gevonden.",
        43 => {
            "Code 43: Windows heeft het apparaat gestopt omdat het problemen meldde — vaak een driver- of hardwarefout (GPU/USB)."
        }
        45 => "Code 45: het apparaat is momenteel niet aangesloten.",
        47 => "Code 47: het apparaat is voorbereid op veilig verwijderen.",
        48 => "Code 48: de driver is geblokkeerd omdat deze bekende problemen met Windows heeft.",
        49 => "Code 49: het systeemregister is te groot (registerlimiet bereikt).",
        52 => "Code 52: de digitale handtekening van de driver kan niet worden geverifieerd.",
        _ => "Apparaatbeheer meldt een probleem met dit apparaat.",
    }
}

/// Klassespecifiek advies voor het bijwerken van een driver.
pub fn class_advice(class: &str) -> &'static str {
    match class {
        "DISPLAY" => {
            "Doe een schone installatie: verwijder de huidige driver met DDU (Display Driver Uninstaller) in Veilige modus en installeer daarna de nieuwste driver van NVIDIA, AMD of Intel. Verouderde/beschadigde GPU-drivers zijn een bekende oorzaak van TDR-freezes (scherm bevriest enkele seconden)."
        }
        "SCSIADAPTER" | "HDC" => {
            "Update de chipset-, AHCI- of NVMe-driver via de supportpagina van je moederbord- of laptopfabrikant (of Intel RST / AMD chipset / Samsung NVMe). Verouderde opslagcontroller-drivers veroorzaken schijf-time-outs (storahci/stornvme) en freezes van enkele seconden."
        }
        "SYSTEM" => {
            "Installeer het nieuwste chipset-/platformpakket van Intel of AMD, of via de supportpagina/tool van je moederbord- of laptopfabrikant (bijv. Lenovo Vantage, Dell SupportAssist, MSI Center)."
        }
        "NET" => {
            "Download de nieuwste netwerkdriver van Intel, Realtek, Killer of de laptopfabrikant. Oude netwerkdrivers veroorzaken vaak hoge DPC-latency (ndis.sys) en haperingen; schakel bij stotteringen ook 'Energy Efficient Ethernet' en energiebesparing van de adapter uit."
        }
        "MEDIA" | "AUDIOENDPOINT" => {
            "Update de audiodriver (Realtek, Intel Smart Sound, NVIDIA/AMD HDMI-audio) via de fabrikant. Audiodrivers zijn een bekende bron van DPC-latency, krakend geluid en micro-stutters."
        }
        "USB" => {
            "Update de USB-/Thunderbolt-controllerdriver via het chipsetpakket van de fabrikant en schakel 'Selectief onderbreken van USB' uit in Energiebeheer bij haperingen of wegvallende apparaten."
        }
        _ => {
            "Zoek een recentere driver bij de fabrikant van het apparaat of via Windows Update (optionele updates)."
        }
    }
}
