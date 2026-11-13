use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Informatie over een individuele logische CPU-core.
#[derive(Serialize, Deserialize, TS, Clone, Debug)]
#[ts(export)]
pub struct CpuCoreInfo {
    /// Identificatie of naam van de kern (bijv. "CPU 0", "CPU 1").
    pub name: String,
    /// Percentage processorgebruik tussen 0.0% en 100.0%.
    pub usage: f32,
    /// Actuele klokfrequentie van de kern in Megahertz (MHz).
    pub frequency_mhz: u64,
}

/// Gedetailleerd overzicht van de centrale processor (CPU).
#[derive(Serialize, Deserialize, TS, Clone, Debug)]
#[ts(export)]
pub struct CpuInfo {
    /// Merk en modelaanduiding (bijv. "Intel Core i7-12700H" of "AMD Ryzen 7 5800X").
    pub brand: String,
    /// Hardware vendor identifier (bijv. "GenuineIntel" of "AuthenticAMD").
    pub vendor_id: String,
    /// Aantal fysieke processorkernen.
    pub physical_cores: usize,
    /// Aantal logische threads (inclusief Hyper-Threading / SMT).
    pub logical_cores: usize,
    /// Gewogen gemiddelde CPU-belasting over alle kernen in procenten (0.0 - 100.0%).
    pub global_usage: f32,
    /// Telemetrie en frequentie van elke afzonderlijke CPU-core.
    pub cores: Vec<CpuCoreInfo>,
}

/// Statistieken over het werkgeheugen (RAM) en wisselbestand (Swap/Pagefile).
#[derive(Serialize, Deserialize, TS, Clone, Debug)]
#[ts(export)]
pub struct RamInfo {
    /// Totale fysiek geïnstalleerde geheugencapaciteit in bytes.
    pub total_bytes: u64,
    /// Actueel gealloceerd / in gebruik zijnd werkgeheugen in bytes.
    pub used_bytes: u64,
    /// Direct beschikbaar vrij werkgeheugen in bytes.
    pub free_bytes: u64,
    /// Totale capaciteit van het virtuele geheugen (wisselbestand) in bytes.
    pub total_swap_bytes: u64,
    /// In gebruik zijnd virtueel swapgeheugen in bytes.
    pub used_swap_bytes: u64,
}

/// Informatie over een aangesloten opslagmedium of partitie.
#[derive(Serialize, Deserialize, TS, Clone, Debug)]
#[ts(export)]
pub struct DiskInfo {
    /// Naam of volume-label van de schijf (bijv. "Lokale vaste schijf").
    pub name: String,
    /// Koppelingspunt of stationsletter (bijv. "C:\" of "/").
    pub mount_point: String,
    /// Type bestandssysteem (bijv. "NTFS", "FAT32", "APFS", "ext4").
    pub file_system: String,
    /// Totale volumecapaciteit in bytes.
    pub total_bytes: u64,
    /// Beschikbare vrije ruimte op het volume in bytes.
    pub available_bytes: u64,
    /// Geeft aan of de schijf een verwisselbaar medium is (bijv. USB-stick).
    pub is_removable: bool,
    /// Schijfcategorie (bijv. "SSD", "HDD" of "Onbekend").
    pub disk_type: String,
}

/// Specificaties van een grafische processor (GPU).
#[derive(Serialize, Deserialize, TS, Clone, Debug, Default)]
#[ts(export)]
pub struct GpuInfo {
    /// Commerciële naam van de grafische kaart (bijv. "NVIDIA GeForce RTX 4070").
    pub name: String,
    /// Geïnstalleerde driver-versie gerapporteerd door het besturingssysteem.
    pub driver_version: String,
    /// Dedicated video-werkgeheugen (VRAM) in bytes (0 indien gedeeld/onbekend).
    pub vram_bytes: u64,
}

/// Specificaties van het moederbord en de systeemfirmware (BIOS/UEFI).
#[derive(Serialize, Deserialize, TS, Clone, Debug, Default)]
#[ts(export)]
pub struct MotherboardInfo {
    /// Fabrikant van het moederbord (bijv. "ASUSTeK COMPUTER INC.", "Gigabyte Technology").
    pub manufacturer: String,
    /// Product- of modelnaam van het moederbord (bijv. "ROG STRIX B650-A GAMING").
    pub product: String,
    /// Leverancier van de BIOS/UEFI firmware (bijv. "American Megatrends Inc.").
    pub bios_vendor: String,
    /// Geïnstalleerde firmwareversie of build-datum.
    pub bios_version: String,
}

/// Compleet overzicht van alle statische en dynamische systeemeigenschappen.
#[derive(Serialize, Deserialize, TS, Clone, Debug)]
#[ts(export)]
pub struct SystemOverview {
    /// Naam van het besturingssysteem (bijv. "Windows", "Ubuntu", "macOS").
    pub os_name: String,
    /// Versienummer en build (bijv. "11 (Build 26100)").
    pub os_version: String,
    /// Netwerknaam van de computer (hostname).
    pub host_name: String,
    /// Kernelversie van het besturingssysteem.
    pub kernel_version: String,
    /// Totale tijd sinds de Windows kernel gestart is in seconden (inclusief Fast Startup slaapstand).
    pub kernel_uptime_secs: u64,
    /// Actuele sessie-uptime in seconden sinds de laatste daadwerkelijke boot of herstart.
    pub session_uptime_secs: u64,
    /// Datum en tijdstip waarop de huidige gebruikerssessie/boot is gestart.
    pub session_started_at: String,
    /// Processorarchitectuur en actuele belasting.
    pub cpu: CpuInfo,
    /// Geheugenstatistieken.
    pub ram: RamInfo,
    /// Overzicht van aangesloten opslagschijven en partities.
    pub disks: Vec<DiskInfo>,
    /// Geïnstalleerde grafische videokaarten.
    pub gpus: Vec<GpuInfo>,
    /// Moederbord- en BIOS-informatie.
    pub motherboard: MotherboardInfo,
}

/// Losse lees- en schrijfsnelheid van de schijfbenchmark. Lezen en schrijven zijn verschillende
/// dingen (een SSD schrijft vaak trager dan hij leest), dus er is bewust geen gemiddelde.
#[derive(Serialize, Deserialize, TS, Clone, Debug, Default)]
#[ts(export)]
pub struct DiskSpeeds {
    pub read_mbps: f64,
    pub write_mbps: f64,
    /// Soort schijf waarop getest is: "nvme", "ssd" (SATA), "hdd", "usb" of "unknown".
    pub drive_kind: String,
    /// Modelnaam van die schijf, als die bekend is.
    pub drive_model: Option<String>,
    /// `true` als de OS-cache is omzeild (dan zijn het echte schijfsnelheden).
    pub cache_bypassed: bool,
}

/// Resultaat van een uitgevoerde synthetische hardwarestresstest of benchmark.
#[derive(Serialize, Deserialize, TS, Clone, Debug)]
#[ts(export)]
pub struct StressTestResult {
    /// `true` als de test zonder fouten of crash binnen de tijd is afgerond.
    pub success: bool,
    /// Naam van de uitgevoerde test (bijv. "CPU Multi-Core Stress", "RAM Geheugentest").
    pub test_name: String,
    /// Totale looptijd van de test in milliseconden.
    pub duration_ms: u128,
    /// Aantal uitgevoerde rekenoperaties of getransfereerde bytes.
    pub operations_or_bytes: u64,
    /// Berekende score of doorvoersnelheid (bijv. Mega-operaties per seconde of MB/s).
    pub score_or_speed: f64,
    /// Eenheid van de score (bijv. "MOps/s", "MB/s").
    pub unit: String,
    /// Menselijk leesbare samenvatting van het testresultaat.
    pub details: String,
    /// Foutbericht indien de test voortijdig is afgebroken.
    pub error: Option<String>,
    /// Alleen bij de schijfbenchmark: lees- en schrijfsnelheid apart.
    #[serde(default)]
    #[ts(optional)]
    pub disk_speeds: Option<DiskSpeeds>,
}

/// Telemetrie over de stroomvoorziening en netstroom/accu-status.
#[derive(Serialize, Deserialize, TS, Clone, Debug)]
#[ts(export)]
pub struct PowerInfo {
    /// `true` voor mobiele apparaten met ingebouwde batterij; `false` voor vaste desktops.
    pub is_laptop: bool,
    /// Geeft aan of de externe netstroomadapter verbonden is.
    pub ac_connected: bool,
    /// Geeft aan of er een fysieke batterij aanwezig en operationeel is.
    pub battery_present: bool,
    /// Huidig batterijpercentage (0 - 100%), of `None` indien geen batterij aanwezig is.
    pub battery_percent: Option<u8>,
    /// Beschrijvende tekst van de stroomtoestand (bijv. "Opladen via Netstroom (85%)").
    pub battery_status_desc: String,
    /// Naam van het actieve Windows Energiebeheerschema (bijv. "Gebalanceerd").
    pub power_plan_name: String,
    /// Geschatte resterende accuduur in seconden bij ontladen, of `None`.
    pub battery_life_time_secs: Option<u32>,
    /// Aanvullende technische toelichting over de voedingsconfiguratie.
    pub details: String,
}

/// Uitgebreid diagnostisch rapport over batterijconditie en slijtagegraad.
#[derive(Serialize, Deserialize, TS, Clone, Debug)]
#[ts(export)]
pub struct BatteryHealthReport {
    /// `true` als een batterij aanwezig is en succesvol geanalyseerd kon worden.
    pub is_available: bool,
    /// Resterende capaciteit ten opzichte van fabrieksontwerp in procenten (0.0 - 100.0%).
    pub health_percent: f64,
    /// Percentage slijtage / capaciteitsverlies (0.0 - 100.0%).
    pub wear_percent: f64,
    /// Oorspronkelijke fabriekscapaciteit in milliwattuur (mWh).
    pub design_capacity_mwh: u64,
    /// Huidige maximale laadcapaciteit bij 100% lading in milliwattuur (mWh).
    pub full_charge_capacity_mwh: u64,
    /// Aantal geregistreerde volledige laadcycli.
    pub cycle_count: u32,
    /// Chemische samenstelling van de accucellen (bijv. "LION" of "Li-Poly").
    pub chemistry: String,
    /// Fabrikant van de batterijmodule.
    pub manufacturer: String,
    /// Geschatte gebruiksduur bij volle acculading (bijv. "4 uur 15 min").
    pub estimated_runtime: String,
    /// Conditieschaal (bijv. "Uitmuntend (Graad A)", "Goed (Graad B)", "Matig", "Versleten").
    pub grade: String,
    /// Praktisch advies en eventuele vervangingsaanbeveling.
    pub advice: String,
}

/// Meting van een temperatuursensor (CPU, moederbord of GPU).
#[derive(Serialize, Deserialize, TS, Clone, Debug)]
#[ts(export)]
pub struct TemperatureSensorInfo {
    /// Benaming of locatie van de sensor (bijv. "Core 0", "Package", "GPU Diode").
    pub label: String,
    /// Huidige gemeten temperatuur in graden Celsius (°C).
    pub temperature_celsius: f32,
    /// Maximale geregistreerde temperatuur tijdens de huidige sessie in °C, indien bekend.
    pub max_celsius: Option<f32>,
    /// Kritieke drempelwaarde voor thermische throttling in °C, indien gerapporteerd door ACPI.
    pub critical_celsius: Option<f32>,
}

/// Status en omwentelingssnelheid van een koelventilator.
#[derive(Serialize, Deserialize, TS, Clone, Debug)]
#[ts(export)]
pub struct FanInfo {
    /// Naam van de ventilator (bijv. "CPU Koeler", "Chassis Fan 1").
    pub name: String,
    /// Operationele status (bijv. "Draaiend", "Gestopt", "Geregeld via BIOS/PWM").
    pub status: String,
    /// Gemeten rotatiesnelheid in toeren per minuut (RPM), of `None` indien niet direct meetbaar.
    pub speed_rpm: Option<u32>,
}

/// Samenvattend overzicht van het thermische profiel en ventilatoren.
#[derive(Serialize, Deserialize, TS, Clone, Debug)]
#[ts(export)]
pub struct CoolingOverview {
    /// Overzicht van aangesloten ventilatoren.
    pub fans: Vec<FanInfo>,
    /// Overzicht van actieve temperatuursensoren.
    pub temperatures: Vec<TemperatureSensorInfo>,
    /// `true` als temperaturen gevaarlijk dicht bij de throttling-grens liggen (> 85°C).
    pub is_throttling_suspected: bool,
    /// Conclusie en beoordeling van de thermische conditie.
    pub summary: String,
}

/// Individuele waarschuwing of foutmelding uit het Windows Event Log gerelateerd aan freezes.
#[derive(Serialize, Deserialize, TS, Clone, Debug)]
#[ts(export)]
pub struct FreezeEventEntry {
    /// Tijdstip van de gebeurtenis in het logboek.
    pub timestamp: String,
    /// Bron of stuurprogramma dat de gebeurtenis genereerde (bijv. "storahci", "nvlddmkm", "WHEA").
    pub provider: String,
    /// Uniek Windows Event ID (bijv. 129 voor reset naar apparaat \Device\RaidPort0).
    pub event_id: u32,
    /// Ernstniveau (bijv. "Kritiek", "Fout", "Waarschuwing").
    pub level: String,
    /// Gedetailleerde melding of beschrijving uit het logboek.
    pub message: String,
    /// Categorie van de oorzaak (bijv. "Opslag / Schijf Time-out", "GPU Driver Crash (TDR)").
    pub category: String,
    /// Concrete oplossingsrichting als platte tekst (rapport).
    pub suggestion: String,
    /// Hoe vaak dit event (zelfde bron + ID) in de afgelopen 30 dagen voorkwam.
    pub count: u32,
    /// Eerste keer in die periode (`timestamp` is de laatste keer).
    pub first_seen: String,
    /// "Kritiek" | "Hoog" | "Middel"
    pub severity: String,
    /// Laatste keer binnen de afgelopen 30 dagen? Oudere events wegen minder mee in het risico.
    pub is_recent: bool,
    /// Gestructureerd stappenplan.
    pub advice: Advice,
}

/// Compleet diagnoserapport van de Freeze Detective.
#[derive(Serialize, Deserialize, TS, Clone, Debug)]
#[ts(export)]
pub struct FreezeDiagnosticReport {
    /// Live registraties door de achtergrond-watchdog van scheduling-hickups (> 1000ms).
    pub watchdog_freezes_detected: Vec<String>,
    /// Gevonden gebeurtenissen in het Windows logboek die correleren met hardware/driver freezes.
    pub event_log_culprits: Vec<FreezeEventEntry>,
    /// Maximale gemeten vertraging (jitter) in milliseconden tijdens micro-scheduling tests.
    pub max_scheduling_jitter_ms: f64,
    /// Ingeschat risiconiveau op freezes: "Laag", "Middel" of "Hoog".
    pub system_freeze_risk: String,
    /// Samenvatting van de diagnose.
    pub diagnosis_summary: String,
    /// Stapsgewijs actieplan om hardware- of driver-freezes definitief op te lossen.
    pub recommended_actions: Vec<String>,
    /// Hoeveel dagen terug in het logboek is gekeken (door de gebruiker gekozen).
    pub lookback_days: u32,
}

// ===== Watchdog: gestructureerde freeze-records =====

#[derive(Serialize, Deserialize, TS, Clone, Debug, PartialEq)]
#[ts(export)]
pub struct FreezeRecord {
    pub at_epoch_ms: u64,
    pub duration_ms: u64,
    pub timestamp: String,
}

// ===== Live Monitor (grafieken) & Procesmonitor =====

#[derive(Serialize, Deserialize, TS, Clone, Debug)]
#[ts(export)]
pub struct ProcessInfo {
    pub pid: u32,
    pub name: String,
    /// Percentage van de totale machine (0-100), niet per kern
    pub cpu_usage: f32,
    pub memory_bytes: u64,
    pub disk_read_bytes_per_sec: u64,
    pub disk_write_bytes_per_sec: u64,
}

#[derive(Serialize, Deserialize, TS, Clone, Debug)]
#[ts(export)]
pub struct ProcessSnapshot {
    pub taken_at_epoch_ms: u64,
    pub total_processes: usize,
    pub processes: Vec<ProcessInfo>,
}

#[derive(Serialize, Deserialize, TS, Clone, Debug)]
#[ts(export)]
pub struct MetricsSample {
    pub at_epoch_ms: u64,
    pub cpu_usage: f32,
    pub cpu_freq_avg_mhz: u64,
    pub ram_used_percent: f32,
    pub swap_used_percent: f32,
    pub max_temp_celsius: Option<f32>,
    pub disk_read_bytes_per_sec: u64,
    pub disk_write_bytes_per_sec: u64,
    pub net_rx_bytes_per_sec: u64,
    pub net_tx_bytes_per_sec: u64,
    /// Top processen op CPU-gebruik op dit moment (max 5)
    pub top_processes: Vec<ProcessInfo>,
}

#[derive(Serialize, Deserialize, TS, Clone, Debug)]
#[ts(export)]
pub struct MetricsHistory {
    pub interval_ms: u64,
    pub samples: Vec<MetricsSample>,
}

#[derive(Serialize, Deserialize, TS, Clone, Debug)]
#[ts(export)]
pub struct FreezeProcessContext {
    pub freeze: FreezeRecord,
    /// Metingen vlak vóór de freeze (oudste eerst)
    pub samples_before: Vec<MetricsSample>,
}

// ===== Driver Check =====

#[derive(Serialize, Deserialize, TS, Clone, Debug)]
#[ts(export)]
pub struct DriverEntry {
    pub device_name: String,
    pub device_class: String,
    pub provider: String,
    pub version: String,
    /// "YYYY-MM-DD" of leeg als onbekend
    pub date: String,
    pub age_years: Option<f32>,
    pub is_signed: Option<bool>,
    /// "OK" | "Verouderd" | "Probleem" | "Niet ondertekend"
    pub status: String,
    pub problem_code: Option<u32>,
    /// Hele advies als één tekst (voor het rapport en oudere weergaven).
    pub advice: String,
    /// Hetzelfde advies, opgesplitst voor een overzichtelijke weergave.
    pub advice_detail: Advice,
    /// Gezet als de fabrikant deze driver/dit apparaat niet (meer volledig) ondersteunt.
    pub support: Option<DriverSupport>,
}

/// Ondersteuning door de fabrikant. Geen ondersteuning is géén fout: de laatste driver blijft
/// werken; de handleiding is alleen nodig als je problemen merkt.
#[derive(Serialize, Deserialize, TS, Clone, Debug, PartialEq)]
#[ts(export)]
pub struct DriverSupport {
    /// "ended" (geen drivers meer), "legacy" (alleen nog beveiligings-/kritieke fixes) of
    /// "likely_ended" (vuistregel: driver van vóór Windows 10).
    pub level: String,
    /// Waarom we dit denken (welke fabrikant wat heeft gemeld, of de vuistregel).
    pub reason: String,
    /// Wat je kunt doen, alleen als je er iets van merkt.
    pub guide: Advice,
}

/// Gestructureerd advies (drivers, freeze-oorzaken): wat er mis is, waarom het ertoe doet en wat je moet doen.
#[derive(Serialize, Deserialize, TS, Clone, Debug, Default, PartialEq)]
#[ts(export)]
pub struct Advice {
    /// Korte kop: wat er aan de hand is.
    pub title: String,
    /// Waarom dit ertoe doet (optioneel).
    pub why: Option<String>,
    /// Concrete stappen, in volgorde.
    pub steps: Vec<String>,
    /// Kop voor het vervolgplan als de stappen niet helpen (bijv. "Blijft de fout?").
    pub fallback_title: Option<String>,
    pub fallback_steps: Vec<String>,
}

impl Advice {
    /// Platte tekstversie (rapport, tests, oudere weergaven).
    pub fn flatten(&self) -> String {
        let mut parts = vec![self.title.clone()];
        parts.extend(self.why.clone());
        parts.extend(
            self.steps
                .iter()
                .enumerate()
                .map(|(i, s)| format!("{}. {}", i + 1, s)),
        );
        if !self.fallback_steps.is_empty() {
            parts.extend(self.fallback_title.clone());
            parts.extend(self.fallback_steps.iter().map(|s| format!("- {}", s)));
        }
        parts.join(" ")
    }
}

#[derive(Serialize, Deserialize, TS, Clone, Debug)]
#[ts(export)]
pub struct DriverReport {
    pub is_available: bool,
    pub scanned_at: String,
    pub total_drivers: usize,
    pub outdated_count: usize,
    pub problem_count: usize,
    pub unsigned_count: usize,
    /// Drivers die de fabrikant niet (meer volledig) ondersteunt. Telt niet als probleem.
    #[serde(default)]
    pub unsupported_count: usize,
    pub entries: Vec<DriverEntry>,
    pub summary: String,
}

// ===== DPC / Interrupt Latency =====

#[derive(Serialize, Deserialize, TS, Clone, Debug)]
#[ts(export)]
pub struct LatencyBucket {
    pub label: String,
    pub count: u64,
}

#[derive(Serialize, Deserialize, TS, Clone, Debug)]
#[ts(export)]
pub struct LatencyTestResult {
    pub success: bool,
    pub duration_ms: u64,
    pub timer_samples: u64,
    pub timer_max_gap_us: f64,
    pub timer_avg_gap_us: f64,
    pub timer_p99_gap_us: f64,
    pub histogram: Vec<LatencyBucket>,
    pub dpc_time_percent_avg: Option<f64>,
    pub dpc_time_percent_max: Option<f64>,
    pub interrupt_time_percent_avg: Option<f64>,
    pub interrupt_time_percent_max: Option<f64>,
    pub dpcs_queued_per_sec_avg: Option<f64>,
    /// "Goed" | "Matig" | "Slecht"
    pub verdict: String,
    pub summary: String,
    pub suspected_drivers: Vec<String>,
    pub advice: Vec<String>,
    /// Waarom het oordeel zo uitvalt: gemeten waarden tegenover de grenzen (ernstigste eerst).
    pub reasons: Vec<LatencyFinding>,
    /// Stappenplan dat past bij de bevindingen.
    pub fix: Advice,
    pub error: Option<String>,
}

/// Eén verklaring bij het latency-oordeel.
#[derive(Serialize, Deserialize, TS, Clone, Debug, Default, PartialEq)]
#[ts(export)]
pub struct LatencyFinding {
    /// "Slecht" | "Matig" | "Goed" | "Info"
    pub severity: String,
    /// Wat er gemeten is, met de waarde en de grens.
    pub title: String,
    /// Wat dat betekent en waar het meestal door komt.
    pub detail: String,
}

// ===== Gezondheidsscore =====

#[derive(Serialize, Deserialize, TS, Clone, Debug, Default)]
#[ts(export)]
pub struct HealthInputs {
    pub max_temp_celsius: Option<f32>,
    pub is_throttling_suspected: bool,
    pub freeze_scanned: bool,
    pub watchdog_freeze_count: usize,
    pub event_log_culprit_count: usize,
    pub battery_health_percent: Option<f64>,
    pub ram_used_percent: f32,
    pub min_disk_free_percent: Option<f32>,
    pub driver_problem_count: Option<usize>,
    pub driver_outdated_count: Option<usize>,
    pub latency_verdict: Option<String>,
    pub latency_max_gap_us: Option<f64>,
    pub dpc_time_percent_max: Option<f64>,
    pub cpu_stress_ok: Option<bool>,
    pub ram_test_ok: Option<bool>,
    pub disk_test_ok: Option<bool>,
    /// Aantal schijven met een SMART/betrouwbaarheids-waarschuwing (None = niet gescand).
    #[serde(default)]
    pub storage_smart_warning_count: Option<usize>,
    /// Aantal schijven met een kritieke SMART-status (None = niet gescand).
    #[serde(default)]
    pub storage_smart_critical_count: Option<usize>,
    /// Bevindingen van schijven die niet "Goed" zijn ("Model: reden"), zodat de score kan noemen
    /// wáárom opslag lager scoort.
    #[serde(default)]
    pub storage_smart_findings: Option<Vec<String>>,
}

#[derive(Serialize, Deserialize, TS, Clone, Debug)]
#[ts(export)]
pub struct HealthCategoryScore {
    pub key: String,
    pub label: String,
    /// 0-100
    pub score: u8,
    pub weight: f32,
    /// "Goed" | "Let op" | "Kritiek" | "Niet getest"
    pub status: String,
    pub detail: String,
}

#[derive(Serialize, Deserialize, TS, Clone, Debug)]
#[ts(export)]
pub struct HealthScore {
    /// 0-100
    pub score: u8,
    /// "A" | "B" | "C" | "D" | "E" | "F"
    pub grade: String,
    pub label: String,
    pub categories: Vec<HealthCategoryScore>,
    pub top_issues: Vec<String>,
}

/// Resultaat van de controle op stroomtoevoer per specifiek hardware-onderdeel.
#[derive(Serialize, Deserialize, TS, Clone, Debug, PartialEq, Eq)]
#[ts(export)]
pub struct PowerComponentCheck {
    pub name: String,
    pub status: String,
    pub is_sufficient: bool,
    pub metric: String,
    pub details: String,
}

/// Volledig hardware-vermogensrapport over stroomtoevoer naar alle interne componenten.
#[derive(Serialize, Deserialize, TS, Clone, Debug)]
#[ts(export)]
pub struct HardwarePowerCheckReport {
    pub is_sufficient: bool,
    pub score: u32,
    pub summary: String,
    pub ac_connected: bool,
    pub is_laptop: bool,
    pub psu_or_adapter_verdict: String,
    pub checks: Vec<PowerComponentCheck>,
    pub dirty_shutdowns_count: u32,
    pub throttling_events_count: u32,
    pub usb_surge_count: u32,
    pub recommendations: Vec<String>,
}

// ===== Opslaggezondheid (SMART / Storage Reliability Counters) =====

#[derive(Serialize, Deserialize, TS, Clone, Debug, Default)]
#[ts(export)]
pub struct StorageHealthEntry {
    pub model: String,
    pub serial: String,
    /// "SSD" | "HDD" | "Onbekend"
    pub media_type: String,
    /// "NVMe" | "SATA" | "USB" | ...
    pub bus_type: String,
    pub size_bytes: u64,
    /// Ruwe Windows HealthStatus ("Healthy", "Warning", "Unhealthy").
    pub health_status: String,
    pub operational_status: String,
    pub temperature_celsius: Option<u32>,
    pub temperature_max_celsius: Option<u32>,
    /// Slijtage in procent (0 = nieuw, 100 = einde levensduur); alleen SSD's.
    pub wear_percent: Option<u32>,
    pub power_on_hours: Option<u64>,
    pub read_errors_uncorrected: Option<u64>,
    pub write_errors_uncorrected: Option<u64>,
    pub read_errors_total: Option<u64>,
    pub write_errors_total: Option<u64>,
    /// "Goed" | "Let op" | "Kritiek"
    pub verdict: String,
    pub findings: Vec<String>,
}

#[derive(Serialize, Deserialize, TS, Clone, Debug, Default)]
#[ts(export)]
pub struct StorageHealthReport {
    pub is_available: bool,
    pub scanned_at: String,
    /// Sommige tellers (temperatuur, slijtage) vereisen beheerdersrechten.
    pub is_elevated: bool,
    pub disks: Vec<StorageHealthEntry>,
    pub warning_count: usize,
    pub critical_count: usize,
    pub summary: String,
}

// ===== Historie over sessies heen =====

#[derive(Serialize, Deserialize, TS, Clone, Debug, PartialEq)]
#[ts(export)]
pub struct HealthHistoryEntry {
    pub at_epoch_ms: u64,
    pub score: u8,
    pub grade: String,
    pub top_issue: Option<String>,
}

#[derive(Serialize, Deserialize, TS, Clone, Debug, Default, PartialEq)]
#[ts(export)]
pub struct HistoryData {
    #[serde(default)]
    pub freezes: Vec<FreezeRecord>,
    #[serde(default)]
    pub health: Vec<HealthHistoryEntry>,
}

// ===== Beheerdersmodus =====

#[derive(Serialize, Deserialize, TS, Clone, Debug)]
#[ts(export)]
pub struct ElevationStatus {
    pub is_elevated: bool,
    /// Kan de app zichzelf opnieuw starten met verhoogde rechten (alleen Windows)?
    pub can_elevate: bool,
    pub platform: String,
}

// ===== Per-driver DPC/ISR-latency (ETW) =====

#[derive(Serialize, Deserialize, TS, Clone, Debug, Default, PartialEq)]
#[ts(export)]
pub struct DriverLatencyEntry {
    /// Bestandsnaam van de driver, bijv. "nvlddmkm.sys".
    pub driver: String,
    /// Bekende omschrijving ("NVIDIA-videodriver"), indien bekend.
    pub description: Option<String>,
    pub dpc_count: u64,
    pub dpc_max_us: f64,
    pub dpc_total_ms: f64,
    pub isr_count: u64,
    pub isr_max_us: f64,
    pub isr_total_ms: f64,
}

#[derive(Serialize, Deserialize, TS, Clone, Debug, Default)]
#[ts(export)]
pub struct DriverLatencyReport {
    /// `false` als ETW niet beschikbaar is (niet-Windows) of de trace niet kon starten.
    pub is_available: bool,
    /// De meting vereist beheerdersrechten (kernel-trace).
    pub requires_admin: bool,
    pub duration_ms: u64,
    pub dpc_count: u64,
    pub isr_count: u64,
    /// Door ETW weggegooide events (buffers vol); > 0 betekent een onvolledige meting.
    pub events_lost: u32,
    pub highest_dpc_us: f64,
    pub highest_isr_us: f64,
    pub highest_dpc_driver: Option<String>,
    pub highest_isr_driver: Option<String>,
    /// "Goed" | "Matig" | "Slecht" | "Niet getest"
    pub verdict: String,
    pub summary: String,
    /// Gesorteerd op hoogste uitvoertijd (DPC of ISR), aflopend.
    pub drivers: Vec<DriverLatencyEntry>,
    /// Uitleg en stappen voor de grootste veroorzaker (alleen bij "Matig"/"Slecht").
    pub fix: Option<Advice>,
    pub error: Option<String>,
}

// ===== Netwerkgezondheid =====

#[derive(Serialize, Deserialize, TS, Clone, Debug, Default, PartialEq)]
#[ts(export)]
pub struct WifiInfo {
    pub ssid: String,
    /// 0-100 % (Windows-signaalkwaliteit).
    pub signal_quality: u32,
    /// Signaalsterkte in dBm (bijv. -55), indien beschikbaar.
    pub rssi_dbm: Option<i32>,
    pub frequency_mhz: Option<u32>,
    pub channel: Option<u32>,
    /// "2.4 GHz" | "5 GHz" | "6 GHz" | "?"
    pub band: String,
    /// Bijv. "Wi-Fi 6E (802.11ax)".
    pub standard: String,
    pub rx_rate_mbps: f64,
    pub tx_rate_mbps: f64,
}

#[derive(Serialize, Deserialize, TS, Clone, Debug, Default, PartialEq)]
#[ts(export)]
pub struct NetworkAdapterHealth {
    pub name: String,
    pub description: String,
    /// "wifi" | "ethernet" | "other"
    pub kind: String,
    pub link_speed_mbps: Option<f64>,
    pub driver_version: String,
    pub driver_date: String,
    pub rx_packets: u64,
    pub tx_packets: u64,
    pub rx_errors: u64,
    pub rx_discards: u64,
    pub tx_errors: u64,
    pub tx_discards: u64,
    /// Ingeschakelde energiebesparende opties (weergavenaam), bijv. "Energy Efficient Ethernet".
    pub power_saving: Vec<String>,
    /// "Computer mag dit apparaat uitschakelen" (None = onbekend/niet ondersteund).
    pub allow_turn_off: Option<bool>,
    pub wifi: Option<WifiInfo>,
}

#[derive(Serialize, Deserialize, TS, Clone, Debug, Default, PartialEq)]
#[ts(export)]
pub struct NetworkIssue {
    /// "Hoog" | "Middel"
    pub severity: String,
    /// Naam van de adapter waar het om gaat.
    pub adapter: String,
    pub advice: Advice,
}

#[derive(Serialize, Deserialize, TS, Clone, Debug, Default)]
#[ts(export)]
pub struct NetworkHealthReport {
    pub is_available: bool,
    pub scanned_at: String,
    pub adapters: Vec<NetworkAdapterHealth>,
    pub issues: Vec<NetworkIssue>,
    pub summary: String,
}
