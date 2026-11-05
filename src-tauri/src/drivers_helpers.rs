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
        1 => crate::tr!(
            "Code 1: het apparaat is niet juist geconfigureerd.",
            "Code 1: the device is not configured correctly."
        ),
        3 => crate::tr!(
            "Code 3: de driver is mogelijk beschadigd of het systeem heeft te weinig geheugen.",
            "Code 3: the driver may be corrupted or the system is low on memory."
        ),
        10 => {
            crate::tr!(
                "Code 10: het apparaat kan niet worden gestart — meestal een defecte, verkeerde of verouderde driver.",
                "Code 10: the device cannot start — usually a faulty, wrong or outdated driver."
            )
        }
        12 => crate::tr!(
            "Code 12: onvoldoende vrije resources (IRQ/geheugen) voor dit apparaat.",
            "Code 12: not enough free resources (IRQ/memory) for this device."
        ),
        14 => crate::tr!(
            "Code 14: het apparaat werkt pas goed na een herstart.",
            "Code 14: the device won't work properly until you restart."
        ),
        18 => crate::tr!(
            "Code 18: de drivers voor dit apparaat moeten opnieuw worden geïnstalleerd.",
            "Code 18: the drivers for this device need to be reinstalled."
        ),
        19 => crate::tr!(
            "Code 19: de configuratie in het register is onvolledig of beschadigd.",
            "Code 19: the registry configuration is incomplete or damaged."
        ),
        21 => crate::tr!(
            "Code 21: Windows is dit apparaat aan het verwijderen.",
            "Code 21: Windows is removing this device."
        ),
        22 => crate::tr!(
            "Code 22: het apparaat is uitgeschakeld (meestal handmatig in Apparaatbeheer).",
            "Code 22: the device is disabled (usually manually in Device Manager)."
        ),
        24 => {
            crate::tr!(
                "Code 24: het apparaat is niet aanwezig, werkt niet goed of niet alle drivers zijn geïnstalleerd.",
                "Code 24: the device is not present, not working properly, or not all drivers are installed."
            )
        }
        28 => crate::tr!(
            "Code 28: de drivers voor dit apparaat zijn niet geïnstalleerd.",
            "Code 28: the drivers for this device are not installed."
        ),
        29 => crate::tr!(
            "Code 29: het apparaat is uitgeschakeld door de firmware (BIOS/UEFI).",
            "Code 29: the device is disabled by the firmware (BIOS/UEFI)."
        ),
        31 => crate::tr!(
            "Code 31: het apparaat werkt niet goed; Windows kan de benodigde drivers niet laden.",
            "Code 31: the device isn't working properly; Windows cannot load the required drivers."
        ),
        32 => crate::tr!(
            "Code 32: de driver(service) voor dit apparaat is uitgeschakeld.",
            "Code 32: the driver (service) for this device is disabled."
        ),
        37 => crate::tr!(
            "Code 37: de driver kon niet worden geïnitialiseerd.",
            "Code 37: the driver could not be initialised."
        ),
        38 => crate::tr!(
            "Code 38: een vorige instantie van de driver staat nog in het geheugen — herstart.",
            "Code 38: a previous instance of the driver is still in memory — restart."
        ),
        39 => crate::tr!(
            "Code 39: de driver is beschadigd of ontbreekt.",
            "Code 39: the driver is corrupted or missing."
        ),
        40 => {
            crate::tr!(
                "Code 40: de service-informatie van de driver in het register ontbreekt of is onjuist.",
                "Code 40: the driver's service information in the registry is missing or incorrect."
            )
        }
        41 => crate::tr!(
            "Code 41: de driver is geladen maar het hardware-apparaat wordt niet gevonden.",
            "Code 41: the driver is loaded but the hardware device cannot be found."
        ),
        43 => {
            crate::tr!(
                "Code 43: Windows heeft het apparaat gestopt omdat het problemen meldde — vaak een driver- of hardwarefout (GPU/USB).",
                "Code 43: Windows stopped the device because it reported problems — often a driver or hardware fault (GPU/USB)."
            )
        }
        45 => crate::tr!(
            "Code 45: het apparaat is momenteel niet aangesloten.",
            "Code 45: the device is not currently connected."
        ),
        47 => crate::tr!(
            "Code 47: het apparaat is voorbereid op veilig verwijderen.",
            "Code 47: the device has been prepared for safe removal."
        ),
        48 => crate::tr!(
            "Code 48: de driver is geblokkeerd omdat deze bekende problemen met Windows heeft.",
            "Code 48: the driver is blocked because it has known problems with Windows."
        ),
        49 => crate::tr!(
            "Code 49: het systeemregister is te groot (registerlimiet bereikt).",
            "Code 49: the system registry is too large (registry limit reached)."
        ),
        52 => crate::tr!(
            "Code 52: de digitale handtekening van de driver kan niet worden geverifieerd.",
            "Code 52: the driver's digital signature cannot be verified."
        ),
        _ => crate::tr!(
            "Apparaatbeheer meldt een probleem met dit apparaat.",
            "Device Manager reports a problem with this device."
        ),
    }
}

/// Klassespecifiek advies voor het bijwerken van een driver: waarom het ertoe doet en de stappen.
pub struct ClassGuidance {
    pub why: Option<String>,
    pub steps: Vec<String>,
}

fn s(nl: &str, en: &str) -> String {
    crate::tr!(nl, en).to_string()
}

pub fn class_guidance(class: &str) -> ClassGuidance {
    let (why, steps) = match class {
        "DISPLAY" => (
            Some(s(
                "Verouderde of beschadigde videodrivers zijn een bekende oorzaak van TDR-freezes: het scherm bevriest een paar seconden.",
                "Outdated or corrupted graphics drivers are a known cause of TDR freezes: the screen freezes for a few seconds.",
            )),
            vec![
                s(
                    "Download de nieuwste driver van de officiële site van NVIDIA, AMD of Intel.",
                    "Download the latest driver from the official NVIDIA, AMD or Intel website.",
                ),
                s(
                    "Start Windows in Veilige modus en verwijder de huidige driver met DDU (Display Driver Uninstaller).",
                    "Start Windows in Safe Mode and remove the current driver with DDU (Display Driver Uninstaller).",
                ),
                s(
                    "Start normaal op en installeer de gedownloade driver.",
                    "Restart normally and install the downloaded driver.",
                ),
            ],
        ),
        "SCSIADAPTER" | "HDC" => (
            Some(s(
                "Verouderde opslagcontroller-drivers veroorzaken schijf-time-outs (storahci/stornvme) en freezes van enkele seconden.",
                "Outdated storage controller drivers cause disk timeouts (storahci/stornvme) and freezes of a few seconds.",
            )),
            vec![
                s(
                    "Ga naar de supportpagina van je moederbord- of laptopfabrikant.",
                    "Go to your motherboard or laptop manufacturer's support page.",
                ),
                s(
                    "Installeer de nieuwste chipset-, AHCI- of NVMe-driver (of Intel RST, AMD chipset of Samsung NVMe).",
                    "Install the latest chipset, AHCI or NVMe driver (or Intel RST, AMD chipset or Samsung NVMe).",
                ),
            ],
        ),
        "SYSTEM" => (
            Some(s(
                "Chipsetdrivers regelen het energiebeheer en de communicatie tussen de processor en de rest van de pc.",
                "Chipset drivers handle power management and communication between the processor and the rest of the PC.",
            )),
            vec![
                s(
                    "Installeer het nieuwste chipset-/platformpakket van Intel of AMD.",
                    "Install the latest chipset/platform package from Intel or AMD.",
                ),
                s(
                    "Of gebruik de tool van je fabrikant, zoals Lenovo Vantage, Dell SupportAssist of MSI Center.",
                    "Or use your manufacturer's tool, such as Lenovo Vantage, Dell SupportAssist or MSI Center.",
                ),
            ],
        ),
        "NET" => (
            Some(s(
                "Oude netwerkdrivers veroorzaken vaak hoge DPC-latency (ndis.sys) en haperingen.",
                "Old network drivers often cause high DPC latency (ndis.sys) and stutters.",
            )),
            vec![
                s(
                    "Download de nieuwste netwerkdriver van Intel, Realtek, Killer of je laptopfabrikant.",
                    "Download the latest network driver from Intel, Realtek, Killer or your laptop manufacturer.",
                ),
                s(
                    "Hapert het daarna nog? Zet 'Energy Efficient Ethernet' en de energiebesparing van de adapter uit (Apparaatbeheer → adapter → Geavanceerd / Energiebeheer).",
                    "Still stuttering? Turn off 'Energy Efficient Ethernet' and the adapter's power saving (Device Manager → adapter → Advanced / Power Management).",
                ),
            ],
        ),
        "MEDIA" | "AUDIOENDPOINT" => (
            Some(s(
                "Audiodrivers zijn een bekende bron van DPC-latency, krakend geluid en micro-stutters.",
                "Audio drivers are a known source of DPC latency, crackling sound and micro-stutters.",
            )),
            vec![s(
                "Update de audiodriver via de fabrikant (Realtek, Intel Smart Sound of NVIDIA/AMD HDMI-audio).",
                "Update the audio driver from the manufacturer (Realtek, Intel Smart Sound or NVIDIA/AMD HDMI audio).",
            )],
        ),
        "USB" => (
            None,
            vec![
                s(
                    "Update de USB-/Thunderbolt-controllerdriver via het chipsetpakket van de fabrikant.",
                    "Update the USB/Thunderbolt controller driver via the manufacturer's chipset package.",
                ),
                s(
                    "Vallen apparaten weg of hapert het? Zet 'Selectief onderbreken van USB' uit in Energiebeheer.",
                    "Devices dropping out or stuttering? Turn off 'USB selective suspend' in Power Options.",
                ),
            ],
        ),
        _ => (
            None,
            vec![s(
                "Zoek een recentere driver bij de fabrikant van het apparaat, of via Windows Update → Geavanceerde opties → Optionele updates.",
                "Look for a newer driver from the device manufacturer, or via Windows Update → Advanced options → Optional updates.",
            )],
        ),
    };
    ClassGuidance { why, steps }
}
