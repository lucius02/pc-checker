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
use std::time::{Duration, Instant};

#[path = "latency_counters.rs"]
mod latency_counters;
pub use latency_counters::*;

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

/// Zet de huidige thread op time-critical prioriteit (alleen Windows, alleen bij >= 2 cores).
#[cfg(windows)]
fn raise_thread_priority() -> bool {
    use std::ffi::c_void;
    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn GetCurrentThread() -> *mut c_void;
        fn SetThreadPriority(h_thread: *mut c_void, n_priority: i32) -> i32;
    }
    const THREAD_PRIORITY_TIME_CRITICAL: i32 = 15;
    let cores = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(1);
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
    } else if max_us < MAX_GAP_BAD_US || (gaps_over_1ms <= 1 && max_us < SINGLE_SPIKE_BAD_US) {
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
            push(
                format!("{} ({}, {})", e.device_name, e.device_class, e.status),
                &mut out,
            );
        }
    }
    // Daarna netwerk-, audio- en GPU-drivers die op zich OK lijken.
    for e in &report.entries {
        if in_class(&e.device_class, &PRIMARY_CLASSES) && e.status.eq_ignore_ascii_case("OK") {
            push(
                format!("{} ({}, {})", e.device_name, e.device_class, e.status),
                &mut out,
            );
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
        a.push(crate::tr!("Geen actie nodig: de systeemlatency is laag genoeg voor audio, gaming en video zonder haperingen.", "No action needed: system latency is low enough for audio, gaming and video without stutters.").to_string());
        if !c.any() {
            a.push(crate::tr!("De Windows-prestatiemeteritems waren niet beschikbaar; herhaal de test eventueel als beheerder voor DPC-/interrupt-percentages.", "The Windows performance counters were not available; repeat the test as administrator to get DPC/interrupt percentages.").to_string());
        }
        return a;
    }
    if !report_available {
        a.push(crate::tr!("Voer eerst de Driver Check uit en herhaal daarna deze test, zodat verdachte drivers (netwerk, audio, GPU, opslag, USB) kunnen worden aangewezen.", "Run the Driver Check first and then repeat this test, so suspect drivers (network, audio, GPU, storage, USB) can be identified.").to_string());
    }
    a.push(crate::tr!("Werk netwerkdrivers bij (vooral Wi-Fi) via de website van de fabrikant; test eventueel met Wi-Fi uitgeschakeld of met een kabel.", "Update network drivers (especially Wi-Fi) from the manufacturer's website; if needed, test with Wi-Fi disabled or with a cable.").to_string());
    a.push(crate::tr!("Werk audiodrivers bij (Realtek/Intel SST/USB-audio) en schakel ongebruikte audioapparaten uit in Apparaatbeheer.", "Update audio drivers (Realtek/Intel SST/USB audio) and disable unused audio devices in Device Manager.").to_string());
    a.push(crate::tr!("Installeer de nieuwste GPU-driver (schone installatie, bijv. met DDU) en schakel ongebruikte overlays uit.", "Install the latest GPU driver (clean install, e.g. with DDU) and disable unused overlays.").to_string());
    a.push(crate::tr!("Kies het energiebeheerschema 'Hoge prestaties' of 'Ultieme prestaties' tijdens de test en schakel 'Selectieve USB-onderbreking' en PCIe Link State Power Management uit.", "Choose the 'High performance' or 'Ultimate performance' power plan during the test, and disable 'USB selective suspend' and PCIe Link State Power Management.").to_string());
    a.push(crate::tr!("Controleer in het BIOS energiebesparende opties (C-states, ASPM, Intel SpeedStep/AMD Cool'n'Quiet) en update het BIOS/chipset-drivers.", "Check power-saving options in the BIOS (C-states, ASPM, Intel SpeedStep/AMD Cool'n'Quiet) and update the BIOS/chipset drivers.").to_string());
    a.push(crate::tr!("Koppel USB-apparaten één voor één los (vooral hubs, dongles en webcams) en herhaal de test om een verdachte te isoleren.", "Disconnect USB devices one at a time (especially hubs, dongles and webcams) and repeat the test to isolate a suspect.").to_string());
    if c.dpc_avg.unwrap_or(0.0) >= DPC_AVG_WARN_PCT || c.irq_avg.unwrap_or(0.0) >= DPC_AVG_WARN_PCT
    {
        a.push(crate::tr!("De CPU besteedt opvallend veel tijd aan DPC's/interrupts; dit wijst sterk op een driverprobleem in plaats van op normale belasting.", "The CPU spends a striking amount of time on DPCs/interrupts; this strongly points to a driver problem rather than normal load.").to_string());
    }
    a.push(
        crate::tr!("Start de per-driver DPC/ISR-meting (ETW, als beheerder) hieronder voor een exacte toewijzing van DPC/ISR-tijd per driver.", "Start the per-driver DPC/ISR measurement (ETW, as administrator) below for an exact attribution of DPC/ISR time per driver.")
            .to_string(),
    );
    a
}

fn build_summary(verdict: &str, stats: &GapStats, c: &CounterStats, elevated: bool) -> String {
    let mut s = match verdict {
        "Goed" => crate::tr!(
            format!(
                "Goed: de langste onderbreking was {} – ruim onder de {} grens. Geen DPC/ISR-problemen gemeten.",
                fmt_us(stats.max_us()),
                fmt_us(MAX_GAP_GOOD_US)
            ),
            format!(
                "Good: the longest interruption was {} – well below the {} limit. No DPC/ISR problems measured.",
                fmt_us(stats.max_us()),
                fmt_us(MAX_GAP_GOOD_US)
            )
        ),
        "Matig" => crate::tr!(
            format!(
                "Matig: de langste onderbreking was {} ({} keer ≥ 1 ms). Lichte kans op audio-crackles of micro-stutters.",
                fmt_us(stats.max_us()),
                stats.gaps_over_1ms()
            ),
            format!(
                "Fair: the longest interruption was {} ({} times ≥ 1 ms). Slight chance of audio crackles or micro-stutters.",
                fmt_us(stats.max_us()),
                stats.gaps_over_1ms()
            )
        ),
        _ => crate::tr!(
            format!(
                "Slecht: de langste onderbreking was {} ({} keer ≥ 1 ms). Drivers of energiebeheer houden de CPU te lang bezig; dit veroorzaakt haperingen en freezes.",
                fmt_us(stats.max_us()),
                stats.gaps_over_1ms()
            ),
            format!(
                "Poor: the longest interruption was {} ({} times ≥ 1 ms). Drivers or power management keep the CPU busy too long; this causes stutters and freezes.",
                fmt_us(stats.max_us()),
                stats.gaps_over_1ms()
            )
        ),
    };
    s.push_str(&crate::tr!(
        format!(
            " {:.1} miljoen timer-metingen uitgevoerd.",
            stats.samples as f64 / 1_000_000.0
        ),
        format!(
            " {:.1} million timer samples taken.",
            stats.samples as f64 / 1_000_000.0
        )
    ));
    if let Some(d) = c.dpc_avg {
        s.push_str(&format!(" Gemiddelde DPC-tijd {:.2} %", d));
        if let Some(i) = c.irq_avg {
            s.push_str(&format!(", interrupt-tijd {:.2} %", i));
        }
        s.push('.');
    } else {
        s.push_str(crate::tr!(
            " Windows-prestatiemeteritems (DPC/interrupt-%) niet beschikbaar.",
            " Windows performance counters (DPC/interrupt %) not available."
        ));
    }
    if !elevated {
        s.push_str(crate::tr!(" Let op: de meetthread draaide zonder verhoogde prioriteit, dus losse pieken kunnen ook gewone Windows-scheduling zijn.", " Note: the measuring thread ran without elevated priority, so isolated spikes may also be ordinary Windows scheduling."));
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
            summary: crate::tr!(
                "De latency-meting heeft geen metingen opgeleverd.",
                "The latency measurement produced no samples."
            )
            .to_string(),
            suspected_drivers: Vec::new(),
            advice: Vec::new(),
            reasons: Vec::new(),
            fix: Default::default(),
            error: Some(
                crate::tr!(
                    "Geen timer-metingen verzameld",
                    "No timer samples collected"
                )
                .to_string(),
            ),
        };
    }
    let verdict = overall_verdict(stats.max_us(), stats.gaps_over_1ms(), c);
    let report = report.filter(|r| r.is_available);
    let flagged_drivers = report
        .map(|r| {
            r.entries
                .iter()
                .filter(|e| {
                    ["NET", "MEDIA", "DISPLAY", "SCSIADAPTER", "HDC", "USB"]
                        .iter()
                        .any(|s| s.eq_ignore_ascii_case(e.device_class.trim()))
                        && !e.status.eq_ignore_ascii_case("OK")
                })
                .count()
        })
        .unwrap_or(0);
    let measured = crate::latency_explain::Measured {
        max_us: stats.max_us(),
        p99_us: stats.percentile_us(99.0),
        gaps_over_1ms: stats.gaps_over_1ms(),
        counters: c,
        elevated,
        driver_check_done: report.is_some(),
        flagged_drivers,
    };
    let reasons = crate::latency_explain::explain(&measured);
    let fix = crate::latency_explain::fix_plan(verdict, &measured);
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
        reasons,
        fix,
        error: None,
    }
}

pub fn run_latency_test_blocking(duration_secs: u64) -> LatencyTestResult {
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

#[cfg(test)]
#[path = "latency_tests.rs"]
mod tests;
