//! Live Monitor: één achtergrond-thread die elke seconde een `MetricsSample` maakt,
//! deze in een ringbuffer (5 minuten) bewaart en als `live-metrics` event uitzendt.
//!
//! De sampler houdt één persistente `sysinfo::System` (+ `Components`, `Networks`,
//! `Disks`) in leven, zodat CPU-percentages (globaal, per kern en per proces) en
//! I/O-delta's kloppen. De volledige proceslijst van de laatste tick wordt gedeeld
//! met `processes.rs`, zodat de procesmonitor nooit een koude `System` nodig heeft.

use std::collections::{HashSet, VecDeque};
use std::ffi::OsString;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use sysinfo::{
    Components, CpuRefreshKind, DiskRefreshKind, Disks, MINIMUM_CPU_UPDATE_INTERVAL,
    MemoryRefreshKind, Networks, ProcessRefreshKind, ProcessesToUpdate, System,
};
use tauri::Emitter;

use crate::models::{MetricsHistory, MetricsSample, ProcessInfo};

/// Interval tussen twee metingen.
pub const SAMPLE_INTERVAL_MS: u64 = 1000;
/// Ringbuffer-capaciteit: 300 × 1 s = 5 minuten.
pub const HISTORY_CAPACITY: usize = 300;
/// Aantal processen dat in elke `MetricsSample` wordt meegestuurd.
pub const TOP_PROCESSES_PER_SAMPLE: usize = 5;
/// Temperatuursensoren (WMI op Windows) niet elke tick uitlezen.
const TEMP_REFRESH_EVERY_TICKS: u32 = 3;
/// Onder deze verstreken tijd zijn I/O-snelheden onbetrouwbaar (eerste meting).
const MIN_RATE_INTERVAL: Duration = Duration::from_millis(50);

pub const LIVE_METRICS_EVENT: &str = "live-metrics";

static STARTED: AtomicBool = AtomicBool::new(false);
static SAMPLES: Mutex<VecDeque<MetricsSample>> = Mutex::new(VecDeque::new());
static LATEST_PROCESSES: Mutex<Option<ProcessTable>> = Mutex::new(None);

/// Volledige proceslijst van de meest recente tick.
#[derive(Clone, Debug)]
pub struct ProcessTable {
    pub taken_at_epoch_ms: u64,
    pub processes: Vec<ProcessInfo>,
}

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

pub fn now_epoch_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Bytes sinds de vorige refresh omrekenen naar bytes per seconde.
fn per_sec(bytes: u64, elapsed: Duration) -> u64 {
    if elapsed < MIN_RATE_INTERVAL {
        return 0;
    }
    (bytes as f64 / elapsed.as_secs_f64()).round() as u64
}

fn percent(used: u64, total: u64) -> f32 {
    if total == 0 {
        0.0
    } else {
        ((used as f64 / total as f64) * 100.0).clamp(0.0, 100.0) as f32
    }
}

/// Houdt alle sysinfo-state warm tussen metingen. Heeft geen `AppHandle` nodig,
/// zodat hij direct testbaar is.
pub struct Sampler {
    sys: System,
    components: Option<Components>,
    networks: Option<Networks>,
    disks: Option<Disks>,
    last_refresh: Instant,
    tick: u32,
    last_temp: Option<f32>,
    last_processes: Vec<ProcessInfo>,
}

impl Sampler {
    /// Maakt de sampler en doet een eerste refresh, zodat de volgende
    /// `sample_once` (na ≥ `MINIMUM_CPU_UPDATE_INTERVAL`) echte delta's heeft.
    pub fn new() -> Option<Self> {
        let mut sys = System::new().ok()?;
        sys.refresh_cpu_specifics(cpu_refresh_kind());
        sys.refresh_memory_specifics(MemoryRefreshKind::everything());
        sys.refresh_processes_specifics(ProcessesToUpdate::All, true, process_refresh_kind());

        let components = Components::new_with_refreshed_list()
            .ok()
            .filter(|c| !c.is_empty());
        let networks = Networks::new_with_refreshed_list().ok();
        let disks =
            Disks::new_with_refreshed_list_specifics(DiskRefreshKind::nothing().with_io_usage())
                .ok();

        let last_temp = components.as_ref().and_then(max_temperature);

        Some(Self {
            sys,
            components,
            networks,
            disks,
            last_refresh: Instant::now(),
            tick: 0,
            last_temp,
            last_processes: Vec::new(),
        })
    }

    /// Volledige proceslijst van de laatste `sample_once` (ongesorteerd).
    pub fn processes(&self) -> &[ProcessInfo] {
        &self.last_processes
    }

    pub fn sample_once(&mut self) -> MetricsSample {
        self.sys.refresh_cpu_specifics(cpu_refresh_kind());
        self.sys
            .refresh_memory_specifics(MemoryRefreshKind::everything());
        self.sys
            .refresh_processes_specifics(ProcessesToUpdate::All, true, process_refresh_kind());
        if let Some(networks) = self.networks.as_mut() {
            networks.refresh(true);
        }
        if let Some(disks) = self.disks.as_mut() {
            disks.refresh_specifics(true, DiskRefreshKind::nothing().with_io_usage());
        }
        self.tick = self.tick.wrapping_add(1);
        if self.tick.is_multiple_of(TEMP_REFRESH_EVERY_TICKS)
            && let Some(components) = self.components.as_mut()
        {
            components.refresh(false);
            self.last_temp = max_temperature(components);
        }

        let now = Instant::now();
        let elapsed = now.duration_since(self.last_refresh);
        self.last_refresh = now;
        let at_epoch_ms = now_epoch_ms();

        // --- CPU ---
        let cpus = self.sys.cpus();
        let logical = cpus.len().max(1) as f32;
        let cpu_usage = self.sys.global_cpu_usage().clamp(0.0, 100.0);
        let freqs: Vec<u64> = cpus
            .iter()
            .map(|c| c.frequency())
            .filter(|f| *f > 0)
            .collect();
        let cpu_freq_avg_mhz = if freqs.is_empty() {
            0
        } else {
            freqs.iter().sum::<u64>() / freqs.len() as u64
        };

        // --- Geheugen ---
        let ram_used_percent = percent(self.sys.used_memory(), self.sys.total_memory());
        let swap_used_percent = percent(self.sys.used_swap(), self.sys.total_swap());

        // --- Processen ---
        let mut proc_read_total: u64 = 0;
        let mut proc_write_total: u64 = 0;
        let mut processes: Vec<ProcessInfo> = Vec::with_capacity(self.sys.processes().len());
        for (pid, p) in self.sys.processes() {
            let pid = pid.as_u32();
            // PID 0 = "System Idle Process" op Windows: zijn "CPU" is juist de idle-tijd.
            if pid == 0 {
                continue;
            }
            let du = p.disk_usage();
            proc_read_total = proc_read_total.saturating_add(du.read_bytes);
            proc_write_total = proc_write_total.saturating_add(du.written_bytes);
            processes.push(ProcessInfo {
                pid,
                name: p.name().to_string_lossy().into_owned(),
                cpu_usage: (p.cpu_usage() / logical).clamp(0.0, 100.0),
                memory_bytes: p.memory(),
                disk_read_bytes_per_sec: per_sec(du.read_bytes, elapsed),
                disk_write_bytes_per_sec: per_sec(du.written_bytes, elapsed),
            });
        }

        // --- Schijf-I/O: liefst fysieke schijftellers, anders som van processen ---
        let (disk_read, disk_write) = self
            .disks
            .as_ref()
            .and_then(disk_io_delta)
            .unwrap_or((proc_read_total, proc_write_total));

        // --- Netwerk ---
        let (rx, tx) = self
            .networks
            .as_ref()
            .map(|n| {
                n.iter().fold((0u64, 0u64), |(rx, tx), (_, data)| {
                    (
                        rx.saturating_add(data.received()),
                        tx.saturating_add(data.transmitted()),
                    )
                })
            })
            .unwrap_or((0, 0));

        let top_processes = crate::processes::sort_and_limit(
            processes.clone(),
            crate::processes::SortKey::Cpu,
            TOP_PROCESSES_PER_SAMPLE,
        );
        self.last_processes = processes;

        MetricsSample {
            at_epoch_ms,
            cpu_usage,
            cpu_freq_avg_mhz,
            ram_used_percent,
            swap_used_percent,
            max_temp_celsius: self.last_temp,
            disk_read_bytes_per_sec: per_sec(disk_read, elapsed),
            disk_write_bytes_per_sec: per_sec(disk_write, elapsed),
            net_rx_bytes_per_sec: per_sec(rx, elapsed),
            net_tx_bytes_per_sec: per_sec(tx, elapsed),
            top_processes,
        }
    }
}

/// Geen tasks/threads: duur op Linux en ze zouden als losse "processen" verschijnen.
fn process_refresh_kind() -> ProcessRefreshKind {
    ProcessRefreshKind::nothing()
        .with_memory()
        .with_cpu()
        .with_disk_usage()
        .without_tasks()
}

fn cpu_refresh_kind() -> CpuRefreshKind {
    CpuRefreshKind::nothing().with_usage().with_frequency()
}

fn max_temperature(components: &Components) -> Option<f32> {
    components
        .iter()
        .filter_map(|c| c.temperature())
        .filter(|t| t.is_finite() && *t > 0.0 && *t < 150.0)
        .fold(None, |acc: Option<f32>, t| {
            Some(acc.map_or(t, |a| a.max(t)))
        })
}

/// Som van de I/O sinds de vorige refresh over alle unieke schijven.
/// `None` als geen enkele schijf I/O-tellers levert (dan valt de sampler terug
/// op de som van de processen).
fn disk_io_delta(disks: &Disks) -> Option<(u64, u64)> {
    let mut seen: HashSet<OsString> = HashSet::new();
    let mut any_counters = false;
    let (mut read, mut written) = (0u64, 0u64);
    for disk in disks.iter() {
        // Linux: meerdere mounts van hetzelfde apparaat delen dezelfde naam.
        // Windows: elk volume heeft een eigen mountpoint (C:\, D:\ ...).
        let key: OsString = if cfg!(windows) {
            disk.mount_point().as_os_str().to_os_string()
        } else {
            disk.name().to_os_string()
        };
        if !key.is_empty() && !seen.insert(key) {
            continue;
        }
        let usage = disk.usage();
        if usage.total_read_bytes > 0 || usage.total_written_bytes > 0 {
            any_counters = true;
        }
        read = read.saturating_add(usage.read_bytes);
        written = written.saturating_add(usage.written_bytes);
    }
    any_counters.then_some((read, written))
}

/// Voegt een meting toe aan de ringbuffer en vervangt de gedeelde proceslijst.
pub(crate) fn record(sample: MetricsSample, processes: Vec<ProcessInfo>) {
    let taken_at_epoch_ms = sample.at_epoch_ms;
    {
        let mut buf = lock(&SAMPLES);
        push_bounded(&mut buf, sample, HISTORY_CAPACITY);
    }
    *lock(&LATEST_PROCESSES) = Some(ProcessTable {
        taken_at_epoch_ms,
        processes,
    });
}

fn push_bounded<T>(buf: &mut VecDeque<T>, item: T, capacity: usize) {
    while buf.len() >= capacity {
        buf.pop_front();
    }
    buf.push_back(item);
}

/// Laatste volledige proceslijst van de sampler, of `None` als die nog niet draait.
pub fn latest_process_table() -> Option<ProcessTable> {
    lock(&LATEST_PROCESSES).clone()
}

/// Start de achtergrond-sampler die elke seconde een `live-metrics` event uitzendt.
/// Meerdere aanroepen starten maar één thread.
pub fn start(app: tauri::AppHandle) {
    if STARTED
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return;
    }
    let spawned = std::thread::Builder::new()
        .name("pc-checker-monitor".into())
        .spawn(move || {
            let Some(mut sampler) = Sampler::new() else {
                return;
            };
            // CPU-percentages hebben minimaal één interval tussen twee refreshes nodig.
            std::thread::sleep(MINIMUM_CPU_UPDATE_INTERVAL.max(Duration::from_millis(250)));
            let interval = Duration::from_millis(SAMPLE_INTERVAL_MS);
            loop {
                let started = Instant::now();
                let sample = sampler.sample_once();
                record(sample.clone(), sampler.processes().to_vec());
                crate::processes::capture_new_freeze_contexts();
                let _ = app.emit(LIVE_METRICS_EVENT, &sample);
                std::thread::sleep(interval.saturating_sub(started.elapsed()));
            }
        });
    if spawned.is_err() {
        STARTED.store(false, Ordering::SeqCst);
    }
}

/// Recente metingen uit de ringbuffer (oudste eerst).
pub fn recent_samples() -> Vec<MetricsSample> {
    lock(&SAMPLES).iter().cloned().collect()
}

pub fn get_metrics_history() -> MetricsHistory {
    MetricsHistory {
        interval_ms: SAMPLE_INTERVAL_MS,
        samples: recent_samples(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn monitor_sample_once_twice_has_sane_ranges() {
        let mut sampler = Sampler::new().expect("sysinfo System moet beschikbaar zijn");
        let first = sampler.sample_once();
        std::thread::sleep(Duration::from_millis(300));
        let second = sampler.sample_once();

        for s in [&first, &second] {
            assert!((0.0..=100.0).contains(&s.cpu_usage), "cpu {}", s.cpu_usage);
            assert!(
                (0.0..=100.0).contains(&s.ram_used_percent),
                "ram {}",
                s.ram_used_percent
            );
            assert!(
                (0.0..=100.0).contains(&s.swap_used_percent),
                "swap {}",
                s.swap_used_percent
            );
            assert!(s.top_processes.len() <= TOP_PROCESSES_PER_SAMPLE);
            assert!(s.at_epoch_ms > 0);
            if let Some(t) = s.max_temp_celsius {
                assert!(t.is_finite() && t > 0.0 && t < 150.0, "temp {t}");
            }
            for p in &s.top_processes {
                assert!(
                    (0.0..=100.0).contains(&p.cpu_usage),
                    "proc cpu {}",
                    p.cpu_usage
                );
                assert_ne!(p.pid, 0);
            }
            // top_processes is gesorteerd op CPU, aflopend
            for w in s.top_processes.windows(2) {
                assert!(w[0].cpu_usage >= w[1].cpu_usage);
            }
        }
        assert!(second.at_epoch_ms >= first.at_epoch_ms);
        assert!(
            !sampler.processes().is_empty(),
            "er draait minstens één proces (deze test)"
        );
        assert!(
            sampler
                .processes()
                .iter()
                .any(|p| p.pid == std::process::id())
        );
    }

    #[test]
    fn monitor_ring_buffer_is_bounded_and_keeps_newest() {
        let mut buf: VecDeque<u32> = VecDeque::new();
        for i in 0..(HISTORY_CAPACITY as u32 + 25) {
            push_bounded(&mut buf, i, HISTORY_CAPACITY);
        }
        assert_eq!(buf.len(), HISTORY_CAPACITY);
        assert_eq!(*buf.front().unwrap(), 25);
        assert_eq!(*buf.back().unwrap(), HISTORY_CAPACITY as u32 + 24);
    }

    #[test]
    fn monitor_rates_and_percent_helpers() {
        assert_eq!(
            per_sec(1000, Duration::from_millis(10)),
            0,
            "te kort interval → 0"
        );
        assert_eq!(per_sec(1000, Duration::from_millis(500)), 2000);
        assert_eq!(per_sec(0, Duration::from_secs(1)), 0);
        assert_eq!(percent(5, 0), 0.0);
        assert_eq!(percent(50, 100), 50.0);
        assert_eq!(percent(200, 100), 100.0);
    }
}
