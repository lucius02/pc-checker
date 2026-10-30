use serde::{Deserialize, Serialize};

/// Informatie over een individuele logische CPU-core.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CpuCoreInfo {
    /// Identificatie of naam van de kern (bijv. "CPU 0", "CPU 1").
    pub name: String,
    /// Percentage processorgebruik tussen 0.0% en 100.0%.
    pub usage: f32,
    /// Actuele klokfrequentie van de kern in Megahertz (MHz).
    pub frequency_mhz: u64,
}

/// Gedetailleerd overzicht van de centrale processor (CPU).
#[derive(Serialize, Deserialize, Clone, Debug)]
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
#[derive(Serialize, Deserialize, Clone, Debug)]
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
#[derive(Serialize, Deserialize, Clone, Debug)]
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
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct GpuInfo {
    /// Commerciële naam van de grafische kaart (bijv. "NVIDIA GeForce RTX 4070").
    pub name: String,
    /// Geïnstalleerde driver-versie gerapporteerd door het besturingssysteem.
    pub driver_version: String,
    /// Dedicated video-werkgeheugen (VRAM) in bytes (0 indien gedeeld/onbekend).
    pub vram_bytes: u64,
}

/// Specificaties van het moederbord en de systeemfirmware (BIOS/UEFI).
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
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
#[derive(Serialize, Deserialize, Clone, Debug)]
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

/// Resultaat van een uitgevoerde synthetische hardwarestresstest of benchmark.
#[derive(Serialize, Deserialize, Clone, Debug)]
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
}

/// Telemetrie over de stroomvoorziening en netstroom/accu-status.
#[derive(Serialize, Deserialize, Clone, Debug)]
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
#[derive(Serialize, Deserialize, Clone, Debug)]
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
#[derive(Serialize, Deserialize, Clone, Debug)]
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
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct FanInfo {
    /// Naam van de ventilator (bijv. "CPU Koeler", "Chassis Fan 1").
    pub name: String,
    /// Operationele status (bijv. "Draaiend", "Gestopt", "Geregeld via BIOS/PWM").
    pub status: String,
    /// Gemeten rotatiesnelheid in toeren per minuut (RPM), of `None` indien niet direct meetbaar.
    pub speed_rpm: Option<u32>,
}

/// Samenvattend overzicht van het thermische profiel en ventilatoren.
#[derive(Serialize, Deserialize, Clone, Debug)]
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
#[derive(Serialize, Deserialize, Clone, Debug)]
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
    /// Concrete oplossingsrichting of instelling om de freeze te verhelpen.
    pub suggestion: String,
}

/// Compleet diagnoserapport van de Freeze Detective.
#[derive(Serialize, Deserialize, Clone, Debug)]
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
}
