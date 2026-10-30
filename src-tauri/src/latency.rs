//! DPC / interrupt-latency test (LatencyMon-achtig, zonder admin / kernel-tracing).
//!
//! Meetopzet:
//! 1. **Timer/scheduling-latency** – een spin-loop op een eigen thread roept continu
//!    `Instant::now()` (QueryPerformanceCounter op Windows) aan en registreert de tijd
//!    tussen twee opeenvolgende aanroepen. Zonder onderbreking is die gap < 1 µs;
//!    elke grotere gap betekent dat de thread van de core werd gehaald door een
//!    ISR/DPC of door werk met hogere prioriteit. Op Windows wordt de thread
//!    (bij >= 2 cores) op `THREAD_PRIORITY_TIME_CRITICAL` gezet, zodat gewone
//!    threads hem niet verdringen en vooral DPC/ISR-onderbrekingen overblijven.
//!    Er worden géén individuele gaps opgeslagen: alleen een vaste array van
//!    log-buckets (8 sub-buckets per octaaf, ~6–12 % resolutie) voor p99 en de
//!    grove histogram-buckets.
//! 2. **Windows performance counters** – parallel via PowerShell `Get-Counter`
//!    (`% DPC Time`, `% Interrupt Time`, `DPCs Queued/sec` van `Processor(_Total)`).
//!    Counter-namen zijn gelokaliseerd op niet-Engelse Windows; ze worden daarom via
//!    hun vaste index (238/696/698/1334) opgezocht in
//!    `HKLM\...\Perflib\CurrentLanguage`, met de Engelse namen als terugval.
//!    Niet beschikbaar → `None`, geen fout.
//!
//! Per-driver DPC/ISR-toewijzing (zoals LatencyMon) vereist ETW kernel-tracing met
//! admin-rechten en valt buiten scope; `suspected_drivers` zijn waarschijnlijke
//! verdachten op basis van de Driver Check, geen meting per driver.

use crate::models::{DriverReport, LatencyBucket, LatencyTestResult};
use std::io::Read;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

// ===== Drempelwaarden (gebaseerd op LatencyMon) =====

/// Max. onderbreking onder deze waarde = "Goed" (LatencyMon: < ~500 µs geschikt voor realtime audio).
pub const MAX_GAP_GOOD_US: f64 = 500.0;
/// Max. onderbreking vanaf deze waarde = "Slecht" (LatencyMon: > ~2000 µs → drop-outs/haperingen).
pub const MAX_GAP_BAD_US: f64 = 2000.0;
/// Eén geïsoleerde piek boven `MAX_GAP_BAD_US` telt als "Matig" tenzij hij zo groot is.
pub const SINGLE_SPIKE_BAD_US: f64 = 4000.0;
/// Gemiddelde `% DPC Time` / `% Interrupt Time` (_Total, gemiddeld over alle cores):
/// gezond is < 1 %. Vanaf deze waarde "Matig".
pub const DPC_AVG_WARN_PCT: f64 = 1.0;
/// Gemiddeld vanaf deze waarde "Slecht" (aanhoudend veel CPU-tijd in DPC/ISR).
pub const DPC_AVG_BAD_PCT: f64 = 3.0;
/// Een seconde-sample met minstens zoveel DPC/ISR-tijd is een duidelijke piek → "Matig".
pub const DPC_MAX_WARN_PCT: f64 = 10.0;

pub const MIN_DURATION_SECS: u64 = 5;
pub const MAX_DURATION_SECS: u64 = 60;

/// Grove histogram-grenzen in nanoseconden (bovengrens exclusief).
const COARSE_EDGES_NS: [u64; 5] = [50_000, 250_000, 1_000_000, 4_000_000, 16_000_000];
const COARSE_LABELS: [&str; 6] = [
    "<50 µs",
    "50–250 µs",
    "250 µs–1 ms",
    "1–4 ms",
    "4–16 ms",
    ">16 ms",
];

/// Performance-counter-index (Perflib) → Engelse naam.
const COUNTER_IDS: [(&str, u32, &str); 4] = [
    ("obj", 238, "Processor"),
    ("dpc", 696, "% DPC Time"),
    ("irq", 698, "% Interrupt Time"),
    ("dpcq", 1334, "DPCs Queued/sec"),
];

// ===== Gap-statistiek =====

const FINE_BUCKETS: usize = 512;

/// Fijnmazige log-bucket-index: 0..15 exact (ns), daarna 8 sub-buckets per octaaf.
fn fine_index(ns: u64) -> usize {
    if ns < 16 {
        return ns as usize;
    }
    let e = 63 - ns.leading_zeros() as usize; // >= 4
    let sub = ((ns >> (e - 3)) & 7) as usize;
    (16 + (e - 4) * 8 + sub).min(FINE_BUCKETS - 1)
}

/// Inclusieve bovengrens (ns) van een fijnmazige bucket.
fn fine_upper_ns(idx: usize) -> u64 {
    if idx < 16 {
        return idx as u64;
    }
    let e = (idx - 16) / 8 + 4;
    let sub = ((idx - 16) % 8) as u64;
    let low = (8 + sub) << (e - 3);
    low + (1u64 << (e - 3)) - 1
}

fn coarse_index(ns: u64) -> usize {
    COARSE_EDGES_NS
        .iter()
        .position(|&edge| ns < edge)
        .unwrap_or(COARSE_EDGES_NS.len())
}

#[derive(Clone, Debug)]
pub struct GapStats {
    fine: Vec<u64>,
    coarse: [u64; 6],
    pub samples: u64,
    pub max_ns: u64,
    pub total_ns: u128,
}

impl Default for GapStats {
    fn default() -> Self {
        Self::new()
    }
}

impl GapStats {
    pub fn new() -> Self {
        GapStats {
            fine: vec![0; FINE_BUCKETS],
            coarse: [0; 6],
            samples: 0,
            max_ns: 0,
            total_ns: 0,
        }
    }

    #[inline(always)]
    pub fn record(&mut self, ns: u64) {
        self.samples += 1;
        self.total_ns += ns as u128;
        if ns > self.max_ns {
            self.max_ns = ns;
        }
        self.fine[fine_index(ns)] += 1;
        // Bijna alle gaps zijn < 50 µs: de vergelijkingsketen alleen voor de zeldzame rest.
        if ns < COARSE_EDGES_NS[0] {
            self.coarse[0] += 1;
        } else {
            self.coarse[coarse_index(ns)] += 1;
        }
    }

    pub fn avg_us(&self) -> f64 {
        if self.samples == 0 {
            0.0
        } else {
            self.total_ns as f64 / self.samples as f64 / 1000.0
        }
    }

    pub fn max_us(&self) -> f64 {
        self.max_ns as f64 / 1000.0
    }

    /// Percentiel (0–100) in µs; rapporteert de bovengrens van de bucket (begrensd door max).
    pub fn percentile_us(&self, pct: f64) -> f64 {
        if self.samples == 0 {
            return 0.0;
        }
        let target = ((pct / 100.0) * self.samples as f64).ceil().max(1.0) as u64;
        let mut cum = 0u64;
        for (idx, &c) in self.fine.iter().enumerate() {
            cum += c;
            if cum >= target {
                return fine_upper_ns(idx).min(self.max_ns) as f64 / 1000.0;
            }
        }
        self.max_us()
    }

    pub fn histogram(&self) -> Vec<LatencyBucket> {
        COARSE_LABELS
            .iter()
            .zip(self.coarse.iter())
            .map(|(label, &count)| LatencyBucket {
                label: label.to_string(),
                count,
            })
            .collect()
    }

    /// Aantal gaps >= 1 ms (grove buckets 3..).
    pub fn gaps_over_1ms(&self) -> u64 {
        self.coarse[3..].iter().sum()
    }
}

/// Zet de huidige thread op time-critical prioriteit (alleen Windows, alleen bij >= 2 cores,
/// zodat de spin-loop het systeem niet laat verhongeren).
#[cfg(windows)]
fn raise_thread_priority() -> bool {
    use std::ffi::c_void;
    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn GetCurrentThread() -> *mut c_void;
        fn SetThreadPriority(h_thread: *mut c_void, n_priority: i32) -> i32;
    }
    const THREAD_PRIORITY_TIME_CRITICAL: i32 = 15;
    let cores = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(1);
    if cores < 2 {
        return false;
    }
    unsafe { SetThreadPriority(GetCurrentThread(), THREAD_PRIORITY_TIME_CRITICAL) != 0 }
}

#[cfg(not(windows))]
fn raise_thread_priority() -> bool {
    false
}

/// De spin-loop zelf. Retourneert statistiek + of de prioriteit verhoogd is.
pub fn run_spin_loop(duration: Duration) -> (GapStats, bool) {
    let elevated = raise_thread_priority();
    let mut stats = GapStats::new();
    let start = Instant::now();
    let deadline = start + duration;
    let mut prev = start;
    loop {
        let now = Instant::now();
        if now >= deadline {
            break;
        }
        let gap = now.duration_since(prev).as_nanos() as u64;
        stats.record(gap);
        prev = now;
    }
    (stats, elevated)
}

// ===== Performance counters (PowerShell) =====

#[derive(Clone, Debug, Default, PartialEq)]
pub struct CounterStats {
    pub dpc_avg: Option<f64>,
    pub dpc_max: Option<f64>,
    pub irq_avg: Option<f64>,
    pub irq_max: Option<f64>,
    pub dpcq_avg: Option<f64>,
    /// "registry" (gelokaliseerde namen via index) of "en" (Engelse terugval)
    pub name_source: Option<String>,
}

impl CounterStats {
    pub fn any(&self) -> bool {
        self.dpc_avg.is_some() || self.irq_avg.is_some() || self.dpcq_avg.is_some()
    }
}

fn counter_script(samples: u64) -> String {
    let mut ids = String::new();
    let mut en = String::new();
    for (i, (key, idx, name)) in COUNTER_IDS.iter().enumerate() {
        if i > 0 {
            ids.push_str("; ");
            en.push_str("; ");
        }
        ids.push_str(&format!("{} = {}", key, idx));
        en.push_str(&format!("{} = '{}'", key, name.replace('\'', "''")));
    }
    format!(
        r#"$ErrorActionPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'
$ids = [ordered]@{{ {ids} }}
$names = @{{ {en} }}
$src = 'en'
try {{
  $loc = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Perflib\CurrentLanguage' -Name Counter -ErrorAction Stop).Counter
  $map = @{{}}
  for ($i = 0; $i -lt $loc.Count - 1; $i += 2) {{ $map[[string]$loc[$i]] = $loc[$i + 1] }}
  $ok = $true
  foreach ($k in $ids.Keys) {{ if (-not $map.ContainsKey([string]$ids[$k])) {{ $ok = $false }} }}
  if ($ok) {{ foreach ($k in $ids.Keys) {{ $names[$k] = $map[[string]$ids[$k]] }}; $src = 'registry' }}
}} catch {{}}
$keys = @('dpc', 'irq', 'dpcq')
$paths = $keys | ForEach-Object {{ '\' + $names['obj'] + '(_Total)\' + $names[$_] }}
$out = New-Object System.Collections.ArrayList
Get-Counter -Counter $paths -SampleInterval 1 -MaxSamples {samples} -ErrorAction SilentlyContinue | ForEach-Object {{
  foreach ($s in $_.CounterSamples) {{
    $p = $s.Path.ToLowerInvariant()
    foreach ($k in $keys) {{
      if ($p.EndsWith('\' + $names[$k].ToLowerInvariant())) {{ [void]$out.Add([pscustomobject]@{{ k = $k; v = [double]$s.CookedValue }}) }}
    }}
  }}
}}
[pscustomobject]@{{ source = $src; samples = @($out) }} | ConvertTo-Json -Compress -Depth 4
"#
    )
}

/// Minimale base64-encoder (voor `-EncodedCommand`, geen extra dependency).
fn base64_encode(data: &[u8]) -> String {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(data.len().div_ceil(3) * 4);
    for chunk in data.chunks(3) {
        let b = [
            chunk[0],
            *chunk.get(1).unwrap_or(&0),
            *chunk.get(2).unwrap_or(&0),
        ];
        let n = ((b[0] as u32) << 16) | ((b[1] as u32) << 8) | b[2] as u32;
        out.push(T[(n >> 18) as usize & 63] as char);
        out.push(T[(n >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 { T[(n >> 6) as usize & 63] as char } else { '=' });
        out.push(if chunk.len() > 2 { T[n as usize & 63] as char } else { '=' });
    }
    out
}

/// PowerShell `-EncodedCommand` verwacht base64 van UTF-16LE.
fn encode_ps_command(script: &str) -> String {
    let bytes: Vec<u8> = script.encode_utf16().flat_map(|u| u.to_le_bytes()).collect();
    base64_encode(&bytes)
}

/// Start PowerShell met het script en wacht maximaal `timeout`; daarna wordt het proces gekild.
fn run_powershell(script: &str, timeout: Duration) -> Option<String> {
    let encoded = encode_ps_command(script);
    for exe in ["powershell", "powershell.exe"] {
        let mut cmd = Command::new(exe);
        cmd.args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-EncodedCommand",
            &encoded,
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }
        let mut child = match cmd.spawn() {
            Ok(c) => c,
            Err(_) => continue, // probeer de volgende naam
        };
        let mut stdout = child.stdout.take()?;
        let reader = std::thread::spawn(move || {
            let mut s = String::new();
            let _ = stdout.read_to_string(&mut s);
            s
        });
        let started = Instant::now();
        loop {
            match child.try_wait() {
                Ok(Some(_)) => break,
                Ok(None) if started.elapsed() < timeout => {
                    std::thread::sleep(Duration::from_millis(100))
                }
                _ => {
                    let _ = child.kill();
                    let _ = child.wait();
                    break;
                }
            }
        }
        return reader.join().ok();
    }
    None
}

fn avg_max(values: &[f64]) -> (Option<f64>, Option<f64>) {
    if values.is_empty() {
        return (None, None);
    }
    let avg = values.iter().sum::<f64>() / values.len() as f64;
    let max = values.iter().cloned().fold(f64::MIN, f64::max);
    (Some(avg), Some(max))
}

/// Parseert de JSON-uitvoer van `counter_script`. Robuust voor object-vs-array
/// (PS 5.1 pakt arrays met één element soms uit), lege of ongeldige uitvoer.
pub fn parse_counter_json(raw: &str) -> CounterStats {
    let trimmed = raw.trim().trim_start_matches('\u{feff}');
    let Ok(parsed) = serde_json::from_str::<serde_json::Value>(trimmed) else {
        return CounterStats::default();
    };
    let samples: Vec<serde_json::Value> = match parsed.get("samples") {
        Some(serde_json::Value::Array(a)) => a.clone(),
        Some(v @ serde_json::Value::Object(_)) => vec![v.clone()],
        _ => Vec::new(),
    };
    let mut dpc = Vec::new();
    let mut irq = Vec::new();
    let mut dpcq = Vec::new();
    for s in &samples {
        let (Some(k), Some(v)) = (s.get("k").and_then(|k| k.as_str()), s.get("v").and_then(|v| v.as_f64())) else {
            continue;
        };
        if !v.is_finite() {
            continue;
        }
        match k {
            "dpc" => dpc.push(v),
            "irq" => irq.push(v),
            "dpcq" => dpcq.push(v),
            _ => {}
        }
    }
    let (dpc_avg, dpc_max) = avg_max(&dpc);
    let (irq_avg, irq_max) = avg_max(&irq);
    let (dpcq_avg, _) = avg_max(&dpcq);
    CounterStats {
        dpc_avg,
        dpc_max,
        irq_avg,
        irq_max,
        dpcq_avg,
        name_source: parsed
            .get("source")
            .and_then(|s| s.as_str())
            .map(|s| s.to_string()),
    }
}

pub fn collect_counters(duration_secs: u64) -> CounterStats {
    let script = counter_script(duration_secs.max(1));
    let timeout = Duration::from_secs(duration_secs + 20);
    match run_powershell(&script, timeout) {
        Some(out) => parse_counter_json(&out),
        None => CounterStats::default(),
    }
}

// ===== Oordeel =====

fn rank(v: &str) -> u8 {
    match v {
        "Slecht" => 2,
        "Matig" => 1,
        _ => 0,
    }
}

fn worst(a: &'static str, b: &'static str) -> &'static str {
    if rank(b) > rank(a) { b } else { a }
}

/// Oordeel op basis van de timer-gaps.
/// - max < 500 µs → Goed; 500–2000 µs → Matig; >= 2000 µs → Slecht.
/// - Uitzondering: precies één gap >= 1 ms (een geïsoleerde piek < 4 ms) → hooguit Matig.
pub fn timer_verdict(max_us: f64, gaps_over_1ms: u64) -> &'static str {
    if max_us < MAX_GAP_GOOD_US {
        "Goed"
    } else if max_us < MAX_GAP_BAD_US {
        "Matig"
    } else if gaps_over_1ms <= 1 && max_us < SINGLE_SPIKE_BAD_US {
        "Matig"
    } else {
        "Slecht"
    }
}

/// Oordeel op basis van `% DPC Time` / `% Interrupt Time` (None = geen invloed).
pub fn counter_verdict(avg_pct: Option<f64>, max_pct: Option<f64>) -> &'static str {
    let avg = avg_pct.unwrap_or(0.0);
    let max = max_pct.unwrap_or(0.0);
    if avg >= DPC_AVG_BAD_PCT {
        "Slecht"
    } else if avg >= DPC_AVG_WARN_PCT || max >= DPC_MAX_WARN_PCT {
        "Matig"
    } else {
        "Goed"
    }
}

pub fn overall_verdict(stats_max_us: f64, gaps_over_1ms: u64, c: &CounterStats) -> &'static str {
    let v = timer_verdict(stats_max_us, gaps_over_1ms);
    let v = worst(v, counter_verdict(c.dpc_avg, c.dpc_max));
    worst(v, counter_verdict(c.irq_avg, c.irq_max))
}

// ===== Verdachte drivers =====

const SUSPECT_CLASSES: [&str; 6] = ["NET", "MEDIA", "DISPLAY", "SCSIADAPTER", "HDC", "USB"];
/// Klassen die ook met status OK vermeld worden (meest voorkomende DPC-veroorzakers).
const PRIMARY_CLASSES: [&str; 3] = ["NET", "MEDIA", "DISPLAY"];
const MAX_SUSPECTS: usize = 8;

pub fn suspected_from_report(report: &DriverReport) -> Vec<String> {
    let in_class = |c: &str, set: &[&str]| set.iter().any(|s| s.eq_ignore_ascii_case(c.trim()));
    let mut out: Vec<String> = Vec::new();
    let push = |s: String, out: &mut Vec<String>| {
        if out.len() < MAX_SUSPECTS && !out.contains(&s) {
            out.push(s);
        }
    };
    // Eerst drivers met een probleem/verouderd/niet ondertekend in de relevante klassen.
    for e in &report.entries {
        if in_class(&e.device_class, &SUSPECT_CLASSES) && !e.status.eq_ignore_ascii_case("OK") {
            push(format!("{} ({}, {})", e.device_name, e.device_class, e.status), &mut out);
        }
    }
    // Daarna netwerk-, audio- en GPU-drivers die op zich OK lijken.
    for e in &report.entries {
        if in_class(&e.device_class, &PRIMARY_CLASSES) && e.status.eq_ignore_ascii_case("OK") {
            push(format!("{} ({}, {})", e.device_name, e.device_class, e.status), &mut out);
        }
    }
    out
}

fn fmt_us(us: f64) -> String {
    if us >= 1000.0 {
        format!("{:.2} ms", us / 1000.0)
    } else {
        format!("{:.0} µs", us)
    }
}

fn build_advice(verdict: &str, c: &CounterStats, report_available: bool) -> Vec<String> {
    let mut a = Vec::new();
    if verdict == "Goed" {
        a.push("Geen actie nodig: de systeemlatency is laag genoeg voor audio, gaming en video zonder haperingen.".to_string());
        if !c.any() {
            a.push("De Windows-prestatiemeteritems waren niet beschikbaar; herhaal de test eventueel als beheerder voor DPC-/interrupt-percentages.".to_string());
        }
        return a;
    }
    if !report_available {
        a.push("Voer eerst de Driver Check uit en herhaal daarna deze test, zodat verdachte drivers (netwerk, audio, GPU, opslag, USB) kunnen worden aangewezen.".to_string());
    }
    a.push("Werk netwerkdrivers bij (vooral Wi-Fi) via de website van de fabrikant; test eventueel met Wi-Fi uitgeschakeld of met een kabel.".to_string());
    a.push("Werk audiodrivers bij (Realtek/Intel SST/USB-audio) en schakel ongebruikte audioapparaten uit in Apparaatbeheer.".to_string());
    a.push("Installeer de nieuwste GPU-driver (schone installatie, bijv. met DDU) en schakel ongebruikte overlays uit.".to_string());
    a.push("Kies het energiebeheerschema 'Hoge prestaties' of 'Ultieme prestaties' tijdens de test en schakel 'Selectieve USB-onderbreking' en PCIe Link State Power Management uit.".to_string());
    a.push("Controleer in het BIOS energiebesparende opties (C-states, ASPM, Intel SpeedStep/AMD Cool'n'Quiet) en update het BIOS/chipset-drivers.".to_string());
    a.push("Koppel USB-apparaten één voor één los (vooral hubs, dongles en webcams) en herhaal de test om een verdachte te isoleren.".to_string());
    if c.dpc_avg.unwrap_or(0.0) >= DPC_AVG_WARN_PCT || c.irq_avg.unwrap_or(0.0) >= DPC_AVG_WARN_PCT {
        a.push("De CPU besteedt opvallend veel tijd aan DPC's/interrupts; dit wijst sterk op een driverprobleem in plaats van op normale belasting.".to_string());
    }
    a.push("Gebruik LatencyMon (Resplendence) voor een exacte toewijzing van DPC/ISR-tijd per driver.".to_string());
    a
}

fn build_summary(
    verdict: &str,
    stats: &GapStats,
    c: &CounterStats,
    elevated: bool,
) -> String {
    let mut s = match verdict {
        "Goed" => format!(
            "Goed: de langste onderbreking was {} – ruim onder de {} grens. Geen DPC/ISR-problemen gemeten.",
            fmt_us(stats.max_us()),
            fmt_us(MAX_GAP_GOOD_US)
        ),
        "Matig" => format!(
            "Matig: de langste onderbreking was {} ({} keer ≥ 1 ms). Lichte kans op audio-crackles of micro-stutters.",
            fmt_us(stats.max_us()),
            stats.gaps_over_1ms()
        ),
        _ => format!(
            "Slecht: de langste onderbreking was {} ({} keer ≥ 1 ms). Drivers of energiebeheer houden de CPU te lang bezig; dit veroorzaakt haperingen en freezes.",
            fmt_us(stats.max_us()),
            stats.gaps_over_1ms()
        ),
    };
    s.push_str(&format!(
        " {:.1} miljoen timer-metingen uitgevoerd.",
        stats.samples as f64 / 1_000_000.0
    ));
    if let Some(d) = c.dpc_avg {
        s.push_str(&format!(" Gemiddelde DPC-tijd {:.2} %", d));
        if let Some(i) = c.irq_avg {
            s.push_str(&format!(", interrupt-tijd {:.2} %", i));
        }
        s.push('.');
    } else {
        s.push_str(" Windows-prestatiemeteritems (DPC/interrupt-%) niet beschikbaar.");
    }
    if !elevated {
        s.push_str(" Let op: de meetthread draaide zonder verhoogde prioriteit, dus losse pieken kunnen ook gewone Windows-scheduling zijn.");
    }
    s
}

fn build_result(
    stats: &GapStats,
    elapsed: Duration,
    elevated: bool,
    c: &CounterStats,
    report: Option<&DriverReport>,
) -> LatencyTestResult {
    if stats.samples == 0 {
        return LatencyTestResult {
            success: false,
            duration_ms: elapsed.as_millis() as u64,
            timer_samples: 0,
            timer_max_gap_us: 0.0,
            timer_avg_gap_us: 0.0,
            timer_p99_gap_us: 0.0,
            histogram: stats.histogram(),
            dpc_time_percent_avg: c.dpc_avg,
            dpc_time_percent_max: c.dpc_max,
            interrupt_time_percent_avg: c.irq_avg,
            interrupt_time_percent_max: c.irq_max,
            dpcs_queued_per_sec_avg: c.dpcq_avg,
            verdict: "Matig".to_string(),
            summary: "De latency-meting heeft geen metingen opgeleverd.".to_string(),
            suspected_drivers: Vec::new(),
            advice: Vec::new(),
            error: Some("Geen timer-metingen verzameld".to_string()),
        };
    }
    let verdict = overall_verdict(stats.max_us(), stats.gaps_over_1ms(), c);
    let report = report.filter(|r| r.is_available);
    let suspected_drivers = match (verdict, report) {
        ("Goed", _) | (_, None) => Vec::new(),
        (_, Some(r)) => suspected_from_report(r),
    };
    LatencyTestResult {
        success: true,
        duration_ms: elapsed.as_millis() as u64,
        timer_samples: stats.samples,
        timer_max_gap_us: stats.max_us(),
        timer_avg_gap_us: stats.avg_us(),
        timer_p99_gap_us: stats.percentile_us(99.0),
        histogram: stats.histogram(),
        dpc_time_percent_avg: c.dpc_avg,
        dpc_time_percent_max: c.dpc_max,
        interrupt_time_percent_avg: c.irq_avg,
        interrupt_time_percent_max: c.irq_max,
        dpcs_queued_per_sec_avg: c.dpcq_avg,
        verdict: verdict.to_string(),
        summary: build_summary(verdict, stats, c, elevated),
        suspected_drivers,
        advice: build_advice(verdict, c, report.is_some()),
        error: None,
    }
}

fn run_latency_test_blocking(duration_secs: u64) -> LatencyTestResult {
    let secs = duration_secs.clamp(MIN_DURATION_SECS, MAX_DURATION_SECS);
    // Counters eerst starten (PowerShell heeft ~1 s opstarttijd), daarna de spin-loop.
    let counter_thread = std::thread::spawn(move || collect_counters(secs));
    let spin_thread = std::thread::Builder::new()
        .name("latency-spin".into())
        .spawn(move || {
            let start = Instant::now();
            let (stats, elevated) = run_spin_loop(Duration::from_secs(secs));
            (stats, elevated, start.elapsed())
        });
    let (stats, elevated, elapsed) = match spin_thread.map(|h| h.join()) {
        Ok(Ok(r)) => r,
        _ => (GapStats::new(), false, Duration::ZERO),
    };
    let counters = counter_thread.join().unwrap_or_default();
    let report = crate::drivers::last_report();
    build_result(&stats, elapsed, elevated, &counters, report.as_ref())
}

#[tauri::command]
pub async fn run_latency_test(duration_secs: u64) -> LatencyTestResult {
    match tauri::async_runtime::spawn_blocking(move || run_latency_test_blocking(duration_secs)).await {
        Ok(r) => r,
        Err(e) => {
            let mut r = build_result(
                &GapStats::new(),
                Duration::ZERO,
                false,
                &CounterStats::default(),
                None,
            );
            r.error = Some(format!("Latency-test mislukt: {}", e));
            r
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::DriverEntry;

    fn stats_from(gaps_ns: &[u64]) -> GapStats {
        let mut s = GapStats::new();
        for &g in gaps_ns {
            s.record(g);
        }
        s
    }

    #[test]
    fn latency_fine_buckets_are_monotonic_and_cover_values() {
        let mut prev = 0;
        for ns in [0u64, 1, 15, 16, 17, 100, 999, 50_000, 1_000_000, 16_000_000, 10_000_000_000, u64::MAX] {
            let idx = fine_index(ns);
            assert!(idx >= prev, "index niet monotoon bij {ns}");
            assert!(idx < FINE_BUCKETS);
            if ns < u64::MAX / 2 {
                assert!(fine_upper_ns(idx) >= ns, "bovengrens {} < {}", fine_upper_ns(idx), ns);
                if idx > 0 {
                    assert!(fine_upper_ns(idx - 1) < ns, "vorige bucket bevat {ns} al");
                }
            }
            prev = idx;
        }
    }

    #[test]
    fn latency_histogram_bucket_edges() {
        let s = stats_from(&[
            49_999, 50_000, 249_999, 250_000, 999_999, 1_000_000, 3_999_999, 4_000_000,
            15_999_999, 16_000_000, 50_000_000,
        ]);
        let h = s.histogram();
        let counts: Vec<u64> = h.iter().map(|b| b.count).collect();
        assert_eq!(counts, vec![1, 2, 2, 2, 2, 2]);
        assert_eq!(h[0].label, "<50 µs");
        assert_eq!(h[5].label, ">16 ms");
        assert_eq!(s.gaps_over_1ms(), 6);
    }

    #[test]
    fn latency_p99_on_synthetic_data() {
        // 9900 gaps van 100 ns, 100 gaps van 1 ms → p99 ≈ 0,1 µs, p99,5 ≈ 1 ms.
        let mut s = GapStats::new();
        for _ in 0..9_900 {
            s.record(100);
        }
        for _ in 0..100 {
            s.record(1_000_000);
        }
        let p99 = s.percentile_us(99.0);
        assert!((0.1..0.12).contains(&p99), "p99 = {p99}");
        let p995 = s.percentile_us(99.5);
        assert!((940.0..=1000.0).contains(&p995), "p99.5 = {p995}");
        assert_eq!(s.max_us(), 1000.0);
        assert!((s.avg_us() - (9_900.0 * 0.1 + 100.0 * 1000.0) / 10_000.0).abs() < 1e-9);
    }

    #[test]
    fn latency_p99_relative_error_bounded() {
        // Uniform 1..=100_000 ns → echte p99 = 99_000 ns; bucketfout max ~12,5 %.
        let gaps: Vec<u64> = (1..=100_000).collect();
        let s = stats_from(&gaps);
        let p99_ns = s.percentile_us(99.0) * 1000.0;
        assert!(p99_ns >= 99_000.0 && p99_ns <= 99_000.0 * 1.125, "p99 = {p99_ns}");
        assert_eq!(GapStats::new().percentile_us(99.0), 0.0);
    }

    #[test]
    fn latency_timer_verdict_thresholds() {
        assert_eq!(timer_verdict(100.0, 0), "Goed");
        assert_eq!(timer_verdict(499.9, 0), "Goed");
        assert_eq!(timer_verdict(500.0, 0), "Matig");
        assert_eq!(timer_verdict(1999.0, 0), "Matig");
        assert_eq!(timer_verdict(2000.0, 5), "Slecht");
        // Eén geïsoleerde piek onder 4 ms → Matig
        assert_eq!(timer_verdict(3000.0, 1), "Matig");
        assert_eq!(timer_verdict(4000.0, 1), "Slecht");
        assert_eq!(timer_verdict(3000.0, 2), "Slecht");
    }

    #[test]
    fn latency_counter_verdict_thresholds() {
        assert_eq!(counter_verdict(None, None), "Goed");
        assert_eq!(counter_verdict(Some(0.5), Some(2.0)), "Goed");
        assert_eq!(counter_verdict(Some(1.0), Some(2.0)), "Matig");
        assert_eq!(counter_verdict(Some(0.3), Some(10.0)), "Matig");
        assert_eq!(counter_verdict(Some(3.0), Some(4.0)), "Slecht");
        let c = CounterStats { irq_avg: Some(4.0), irq_max: Some(6.0), ..Default::default() };
        assert_eq!(overall_verdict(100.0, 0, &c), "Slecht");
        assert_eq!(overall_verdict(100.0, 0, &CounterStats::default()), "Goed");
        assert_eq!(overall_verdict(800.0, 0, &CounterStats::default()), "Matig");
    }

    #[test]
    fn latency_parse_counters_multiple_samples() {
        let raw = r#"{"source":"registry","samples":[{"k":"dpc","v":0.4},{"k":"irq","v":0.0},{"k":"dpcq","v":2000.0},{"k":"dpc","v":1.6},{"k":"irq","v":0.4},{"k":"dpcq","v":1000.0}]}"#;
        let c = parse_counter_json(raw);
        assert!((c.dpc_avg.unwrap() - 1.0).abs() < 1e-9);
        assert_eq!(c.dpc_max, Some(1.6));
        assert!((c.irq_avg.unwrap() - 0.2).abs() < 1e-9);
        assert_eq!(c.irq_max, Some(0.4));
        assert_eq!(c.dpcq_avg, Some(1500.0));
        assert_eq!(c.name_source.as_deref(), Some("registry"));
        assert!(c.any());
    }

    #[test]
    fn latency_parse_counters_single_sample_object() {
        // PS 5.1 kan een array met één element uitpakken tot een object.
        let raw = "\u{feff}{\"source\":\"en\",\"samples\":{\"k\":\"dpc\",\"v\":2.5}}\r\n";
        let c = parse_counter_json(raw);
        assert_eq!(c.dpc_avg, Some(2.5));
        assert_eq!(c.dpc_max, Some(2.5));
        assert_eq!(c.irq_avg, None);
        assert_eq!(c.dpcq_avg, None);
    }

    #[test]
    fn latency_parse_counters_empty_and_malformed() {
        let c = parse_counter_json(r#"{"source":"en","samples":[]}"#);
        assert_eq!(c, CounterStats { name_source: Some("en".into()), ..Default::default() });
        assert!(!c.any());
        assert_eq!(parse_counter_json(""), CounterStats::default());
        assert_eq!(parse_counter_json("Get-Counter : fout"), CounterStats::default());
        let c = parse_counter_json(r#"{"samples":[{"k":"dpc"},{"v":1.0},{"k":"zzz","v":1.0}]}"#);
        assert!(!c.any());
    }

    #[test]
    fn latency_base64_vectors() {
        assert_eq!(base64_encode(b""), "");
        assert_eq!(base64_encode(b"f"), "Zg==");
        assert_eq!(base64_encode(b"fo"), "Zm8=");
        assert_eq!(base64_encode(b"foo"), "Zm9v");
        assert_eq!(base64_encode(b"foobar"), "Zm9vYmFy");
        assert_eq!(encode_ps_command("a"), "YQA=");
    }

    #[test]
    fn latency_script_contains_indices_and_samples() {
        let s = counter_script(7);
        assert!(s.contains("obj = 238"));
        assert!(s.contains("dpcq = 1334"));
        assert!(s.contains("dpc = '% DPC Time'"));
        assert!(s.contains("-MaxSamples 7"));
    }

    fn entry(name: &str, class: &str, status: &str) -> DriverEntry {
        DriverEntry {
            device_name: name.into(),
            device_class: class.into(),
            provider: "X".into(),
            version: "1".into(),
            date: String::new(),
            age_years: None,
            is_signed: Some(true),
            status: status.into(),
            problem_code: None,
            advice: String::new(),
        }
    }

    #[test]
    fn latency_suspected_drivers_ordering_and_fallback() {
        let report = DriverReport {
            is_available: true,
            scanned_at: String::new(),
            total_drivers: 5,
            outdated_count: 1,
            problem_count: 0,
            unsigned_count: 0,
            entries: vec![
                entry("Intel Wi-Fi 6", "Net", "OK"),
                entry("Generic USB Hub", "USB", "OK"),
                entry("Realtek Audio", "MEDIA", "Verouderd"),
                entry("Toetsenbord", "Keyboard", "Probleem"),
                entry("NVIDIA GeForce", "Display", "OK"),
            ],
            summary: String::new(),
        };
        let s = suspected_from_report(&report);
        assert_eq!(
            s,
            vec![
                "Realtek Audio (MEDIA, Verouderd)".to_string(),
                "Intel Wi-Fi 6 (Net, OK)".to_string(),
                "NVIDIA GeForce (Display, OK)".to_string(),
            ]
        );

        let mut bad = GapStats::new();
        for _ in 0..10 {
            bad.record(5_000_000);
        }
        let r = build_result(&bad, Duration::from_secs(5), true, &CounterStats::default(), None);
        assert_eq!(r.verdict, "Slecht");
        assert!(r.suspected_drivers.is_empty());
        assert!(r.advice.iter().any(|a| a.starts_with("Voer eerst de Driver Check uit")));

        let r = build_result(&bad, Duration::from_secs(5), true, &CounterStats::default(), Some(&report));
        assert_eq!(r.suspected_drivers.len(), 3);
        assert!(!r.advice.iter().any(|a| a.starts_with("Voer eerst de Driver Check uit")));

        let unavailable = DriverReport { is_available: false, ..report.clone() };
        let r = build_result(&bad, Duration::from_secs(5), true, &CounterStats::default(), Some(&unavailable));
        assert!(r.suspected_drivers.is_empty());

        let good = stats_from(&[100, 200, 300]);
        let r = build_result(&good, Duration::from_secs(5), true, &CounterStats::default(), Some(&report));
        assert_eq!(r.verdict, "Goed");
        assert!(r.suspected_drivers.is_empty());
        assert!(r.success);
    }

    #[test]
    fn latency_real_spin_loop_short_run() {
        let (s, _elevated) = run_spin_loop(Duration::from_millis(1000));
        assert!(s.samples > 0);
        assert!(s.max_us() >= s.avg_us());
        assert!(s.percentile_us(99.0) <= s.max_us());
        let total: u64 = s.histogram().iter().map(|b| b.count).sum();
        assert_eq!(total, s.samples);
        let r = build_result(&s, Duration::from_secs(1), false, &CounterStats::default(), None);
        assert!(r.success);
        assert!(["Goed", "Matig", "Slecht"].contains(&r.verdict.as_str()));
    }

    /// Handmatig tegen de echte Windows-host (WSL interop): `cargo test latency_host -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn latency_host_counters() {
        let c = collect_counters(3);
        println!("{c:?}");
        assert!(c.any());
    }
}
