/**
 * Informatie over een individuele logische CPU-core.
 */
export interface CpuCoreInfo {
  /** Identificatie van de processorcore (bijv. "CPU 0"). */
  name: string;
  /** Percentage processorgebruik tussen 0.0% en 100.0%. */
  usage: number;
  /** Actuele klokfrequentie in Megahertz (MHz). */
  frequency_mhz: number;
}

/**
 * Gedetailleerd overzicht van de processor (CPU).
 */
export interface CpuInfo {
  /** Commerciële modelnaam van de CPU. */
  brand: string;
  /** Hardware vendor identifier (bijv. "GenuineIntel", "AuthenticAMD"). */
  vendor_id: string;
  /** Aantal fysieke processorkernen. */
  physical_cores: number;
  /** Aantal logische threads (SMT / Hyper-Threading). */
  logical_cores: number;
  /** Gewogen gemiddelde CPU-belasting over alle kernen in procenten (0-100%). */
  global_usage: number;
  /** Telemetrie per afzonderlijke CPU-core. */
  cores: CpuCoreInfo[];
}

/**
 * Statistieken over het werkgeheugen (RAM) en virtueel geheugen (Swap).
 */
export interface RamInfo {
  /** Totale fysiek geïnstalleerde capaciteit in bytes. */
  total_bytes: number;
  /** In gebruik zijnd werkgeheugen in bytes. */
  used_bytes: number;
  /** Vrij beschikbaar werkgeheugen in bytes. */
  free_bytes: number;
  /** Totale wisselbestandcapaciteit in bytes. */
  total_swap_bytes: number;
  /** Gebruikt wisselbestand in bytes. */
  used_swap_bytes: number;
}

/**
 * Informatie over een aangesloten opslagmedium of partitie.
 */
export interface DiskInfo {
  /** Volumenaam of schijflabel. */
  name: string;
  /** Stationsletter of mount point (bijv. "C:\"). */
  mount_point: string;
  /** Type bestandssysteem (bijv. "NTFS", "FAT32"). */
  file_system: string;
  /** Totale volumecapaciteit in bytes. */
  total_bytes: number;
  /** Beschikbare vrije schijfruimte in bytes. */
  available_bytes: number;
  /** Geeft aan of de schijf verwisselbaar is (USB-drive). */
  is_removable: boolean;
  /** Type opslagmedium ("SSD", "HDD" of "Onbekend"). */
  disk_type: string;
}

/**
 * Specificaties van een grafische videokaart (GPU).
 */
export interface GpuInfo {
  /** Modelnaam van de grafische processor. */
  name: string;
  /** Geïnstalleerde driverversie. */
  driver_version: string;
  /** Dedicated videogeheugen (VRAM) in bytes. */
  vram_bytes: number;
}

/**
 * Specificaties van het moederbord en BIOS/UEFI.
 */
export interface MotherboardInfo {
  /** Fabrikant van het moederbord. */
  manufacturer: string;
  /** Model- of productaanduiding. */
  product: string;
  /** Leverancier van de BIOS firmware. */
  bios_vendor: string;
  /** Geïnstalleerde BIOS versie/datum. */
  bios_version: string;
}

/**
 * Compleet hardware- en systeemoverzicht.
 */
export interface SystemOverview {
  /** Naam van het besturingssysteem. */
  os_name: string;
  /** Versienummer en build van het OS. */
  os_version: string;
  /** Netwerkcomputernaam. */
  host_name: string;
  /** Kernelversie. */
  kernel_version: string;
  /** Totale tijd sinds de Windows kernel start in seconden. */
  kernel_uptime_secs: number;
  /** Actuele sessie-uptime in seconden sinds boot/login. */
  session_uptime_secs: number;
  /** Datum en tijd waarop de actuele sessie gestart is. */
  session_started_at: string;
  /** CPU specificaties en belasting. */
  cpu: CpuInfo;
  /** Werkgeheugen statistieken. */
  ram: RamInfo;
  /** Overzicht van opslagmedia. */
  disks: DiskInfo[];
  /** Geïnstalleerde grafische videokaarten. */
  gpus: GpuInfo[];
  /** Moederbord specificaties. */
  motherboard: MotherboardInfo;
}

/**
 * Voedingsstatus en batterijtelemetrie.
 */
export interface PowerInfo {
  /** Geeft aan of het apparaat een laptop met accu is. */
  is_laptop: boolean;
  /** `true` als de netstroomadapter aangesloten is. */
  ac_connected: boolean;
  /** `true` als een actieve batterij aanwezig is. */
  battery_present: boolean;
  /** Batterijpercentage (0 - 100%) of `null` bij een desktop. */
  battery_percent: number | null;
  /** Statusomschrijving (bijv. "Opladen via Netstroom (85%)"). */
  battery_status_desc: string;
  /** Actief energiebeheerschema (bijv. "Gebalanceerd"). */
  power_plan_name: string;
  /** Geschatte resterende accuduur in seconden, of `null`. */
  battery_life_time_secs: number | null;
  /** Aanvullende technische details over de stroomtoevoer. */
  details: string;
}

/**
 * Gedetailleerd batterijrapport en slijtageanalyse.
 */
export interface BatteryHealthReport {
  /** `true` als een batterij aanwezig en geanalyseerd is. */
  is_available: boolean;
  /** Resterende gezondheid ten opzichte van fabriekscapaciteit (0-100%). */
  health_percent: number;
  /** Percentage accuslijtage (0-100%). */
  wear_percent: number;
  /** Oorspronkelijke fabriekscapaciteit in milliwattuur (mWh). */
  design_capacity_mwh: number;
  /** Huidige maximale laadcapaciteit in milliwattuur (mWh). */
  full_charge_capacity_mwh: number;
  /** Aantal geregistreerde laadcycli. */
  cycle_count: number;
  /** Chemische samenstelling (bijv. "LION"). */
  chemistry: string;
  /** Fabrikant van de accucelmodule. */
  manufacturer: string;
  /** Geschatte accuduur bij volle lading (bijv. "4 uur 15 min"). */
  estimated_runtime: string;
  /** Kwaliteitsbeoordeling (bijv. "Uitmuntend (Graad A)"). */
  grade: string;
  /** Praktisch gebruiks- of vervangingsadvies. */
  advice: string;
}

/**
 * Meting van een temperatuursensor.
 */
export interface TemperatureSensorInfo {
  /** Locatie of naam van de sensor (bijv. "Core 0"). */
  label: string;
  /** Huidige temperatuur in graden Celsius (°C). */
  temperature_celsius: number;
  /** Hoogst gemeten temperatuur in °C, of `null`. */
  max_celsius: number | null;
  /** Kritieke throttling-grens in °C, of `null`. */
  critical_celsius: number | null;
}

/**
 * Status van een koelventilator.
 */
export interface FanInfo {
  /** Naam van de ventilator (bijv. "CPU Koeler"). */
  name: string;
  /** Statusomschrijving (bijv. "Draaiend"). */
  status: string;
  /** Toerental in toeren per minuut (RPM), of `null` indien PWM/niet uitgelezen. */
  speed_rpm: number | null;
}

/**
 * Thermisch overzicht van ventilatoren en sensoren.
 */
export interface CoolingOverview {
  /** Aangesloten koelventilatoren. */
  fans: FanInfo[];
  /** Temperatuursensoren. */
  temperatures: TemperatureSensorInfo[];
  /** `true` indien thermische throttling vermoed wordt (> 85°C). */
  is_throttling_suspected: boolean;
  /** Beoordeling van het koelprofiel. */
  summary: string;
}

/**
 * Freeze-gebeurtenis uit het Windows Event Logboek.
 */
export interface FreezeEventEntry {
  /** Tijdstip van de gebeurtenis in het logboek. */
  timestamp: string;
  /** Driver of bron (bijv. "storahci", "nvlddmkm"). */
  provider: string;
  /** Windows Event ID (bijv. 129). */
  event_id: number;
  /** Ernstniveau ("Kritiek", "Fout", "Waarschuwing"). */
  level: string;
  /** Logbericht met details. */
  message: string;
  /** Categorie van het probleem (bijv. "Opslag / Schijf Time-out"). */
  category: string;
  /** Oplossingsadvies. */
  suggestion: string;
}

/**
 * Freeze Detective diagnoserapport.
 */
export interface FreezeDiagnosticReport {
  /** Live door de Watchdog gedetecteerde freezes (> 1000ms vertraging). */
  watchdog_freezes_detected: string[];
  /** Verdachte logboek-events gecorreleerd aan freezes. */
  event_log_culprits: FreezeEventEntry[];
  /** Maximale scheduling-jitter in milliseconden. */
  max_scheduling_jitter_ms: number;
  /** Ingeschat risiconiveau ("Laag", "Middel", "Hoog"). */
  system_freeze_risk: string;
  /** Diagnoseconclusie. */
  diagnosis_summary: string;
  /** Aanbevolen stappen ter verhelping. */
  recommended_actions: string[];
}

/**
 * Resultaat van een hardware stresstest of benchmark.
 */
export interface StressTestResult {
  /** `true` als de test succesvol zonder fouten is afgerond. */
  success: boolean;
  /** Naam van de test. */
  test_name: string;
  /** Looptijd in milliseconden. */
  duration_ms: number;
  /** Aantal operaties of bytes verwerkt. */
  operations_or_bytes: number;
  /** Score of doorvoersnelheid. */
  score_or_speed: number;
  /** Eenheid van de score (bijv. "MOps/s", "MB/s"). */
  unit: string;
  /** Toelichting op het resultaat. */
  details: string;
  /** Foutmelding bij falen van de test. */
  error?: string | null;
}

export interface FreezeRecord {
  at_epoch_ms: number;
  duration_ms: number;
  timestamp: string;
}

export interface ProcessInfo {
  pid: number;
  name: string;
  /** Percentage van de totale machine (0-100), niet per kern */
  cpu_usage: number;
  memory_bytes: number;
  disk_read_bytes_per_sec: number;
  disk_write_bytes_per_sec: number;
}

export interface ProcessSnapshot {
  taken_at_epoch_ms: number;
  total_processes: number;
  processes: ProcessInfo[];
}

export interface MetricsSample {
  at_epoch_ms: number;
  cpu_usage: number;
  cpu_freq_avg_mhz: number;
  ram_used_percent: number;
  swap_used_percent: number;
  max_temp_celsius: number | null;
  disk_read_bytes_per_sec: number;
  disk_write_bytes_per_sec: number;
  net_rx_bytes_per_sec: number;
  net_tx_bytes_per_sec: number;
  top_processes: ProcessInfo[];
}

export interface MetricsHistory {
  interval_ms: number;
  samples: MetricsSample[];
}

export interface FreezeProcessContext {
  freeze: FreezeRecord;
  samples_before: MetricsSample[];
}

export interface DriverEntry {
  device_name: string;
  device_class: string;
  provider: string;
  version: string;
  date: string;
  age_years: number | null;
  is_signed: boolean | null;
  status: "OK" | "Verouderd" | "Probleem" | "Niet ondertekend" | string;
  problem_code: number | null;
  advice: string;
}

export interface DriverReport {
  is_available: boolean;
  scanned_at: string;
  total_drivers: number;
  outdated_count: number;
  problem_count: number;
  unsigned_count: number;
  entries: DriverEntry[];
  summary: string;
}

export interface LatencyBucket {
  label: string;
  count: number;
}

export interface LatencyTestResult {
  success: boolean;
  duration_ms: number;
  timer_samples: number;
  timer_max_gap_us: number;
  timer_avg_gap_us: number;
  timer_p99_gap_us: number;
  histogram: LatencyBucket[];
  dpc_time_percent_avg: number | null;
  dpc_time_percent_max: number | null;
  interrupt_time_percent_avg: number | null;
  interrupt_time_percent_max: number | null;
  dpcs_queued_per_sec_avg: number | null;
  verdict: "Goed" | "Matig" | "Slecht" | string;
  summary: string;
  suspected_drivers: string[];
  advice: string[];
  error: string | null;
}

export interface HealthInputs {
  max_temp_celsius: number | null;
  is_throttling_suspected: boolean;
  freeze_scanned: boolean;
  watchdog_freeze_count: number;
  event_log_culprit_count: number;
  battery_health_percent: number | null;
  ram_used_percent: number;
  min_disk_free_percent: number | null;
  driver_problem_count: number | null;
  driver_outdated_count: number | null;
  latency_verdict: string | null;
  latency_max_gap_us: number | null;
  dpc_time_percent_max: number | null;
  cpu_stress_ok: boolean | null;
  ram_test_ok: boolean | null;
  disk_test_ok: boolean | null;
}

export interface HealthCategoryScore {
  key: string;
  label: string;
  score: number;
  weight: number;
  status: "Goed" | "Let op" | "Kritiek" | "Niet getest" | string;
  detail: string;
}

export interface HealthScore {
  score: number;
  grade: "A" | "B" | "C" | "D" | "E" | "F" | string;
  label: string;
  categories: HealthCategoryScore[];
  top_issues: string[];
}

/**
 * Beschikbare navigatietabbladen in de applicatie.
 */
export type TabType =
  | "overview"
  | "live"
  | "processes"
  | "cpu"
  | "ram"
  | "disk"
  | "power"
  | "cooling"
  | "freeze"
  | "drivers"
  | "latency";
