//! Procesmonitor: top-processen op CPU/RAM/schijf en de processen die vlak vóór
//! een door de watchdog gedetecteerde freeze actief waren.
//!
//! Gebruikt de warme state van de Live Monitor-sampler (`monitor.rs`): er wordt hier
//! nooit een nieuwe `sysinfo::System` aangemaakt.

use std::cmp::Ordering;
use std::sync::Mutex;

use crate::models::{
    FreezeProcessContext, FreezeRecord, MetricsSample, ProcessInfo, ProcessSnapshot,
};
use crate::monitor;
use crate::watchdog::get_freeze_records;

pub const DEFAULT_LIMIT: usize = 15;
pub const MAX_LIMIT: usize = 500;
/// Hoe ver vóór de start van een freeze we metingen meenemen. Iets ruimer dan 5 s:
/// de sampler-tick loopt niet in fase met de freeze, en `at_epoch_ms` van de
/// freeze wordt teruggerekend vanaf het detectiemoment.
pub const FREEZE_WINDOW_MS: u64 = 7_000;
const FREEZE_CACHE_CAPACITY: usize = 50;

/// Freeze-contexten worden vastgelegd zodra de watchdog ze meldt, zodat ze de
/// ringbuffer (5 min) overleven.
static FREEZE_CACHE: Mutex<Vec<FreezeProcessContext>> = Mutex::new(Vec::new());

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SortKey {
    Cpu,
    Memory,
    Disk,
}

impl SortKey {
    pub fn parse(s: Option<&str>) -> Self {
        match s.map(|v| v.trim().to_ascii_lowercase()).as_deref() {
            Some("memory") | Some("mem") | Some("ram") => SortKey::Memory,
            Some("disk") | Some("io") => SortKey::Disk,
            _ => SortKey::Cpu,
        }
    }
}

fn disk_total(p: &ProcessInfo) -> u64 {
    p.disk_read_bytes_per_sec
        .saturating_add(p.disk_write_bytes_per_sec)
}

fn cmp_f32_desc(a: f32, b: f32) -> Ordering {
    b.partial_cmp(&a).unwrap_or(Ordering::Equal)
}

/// Sorteert aflopend op de gekozen sleutel (met stabiele tie-breakers) en kapt af op `limit`.
pub fn sort_and_limit(mut list: Vec<ProcessInfo>, key: SortKey, limit: usize) -> Vec<ProcessInfo> {
    list.sort_by(|a, b| {
        let primary = match key {
            SortKey::Cpu => cmp_f32_desc(a.cpu_usage, b.cpu_usage),
            SortKey::Memory => b.memory_bytes.cmp(&a.memory_bytes),
            SortKey::Disk => disk_total(b).cmp(&disk_total(a)),
        };
        primary
            .then_with(|| cmp_f32_desc(a.cpu_usage, b.cpu_usage))
            .then_with(|| b.memory_bytes.cmp(&a.memory_bytes))
            .then_with(|| a.pid.cmp(&b.pid))
    });
    list.truncate(limit);
    list
}

pub fn get_process_snapshot(sort_by: Option<String>, limit: Option<usize>) -> ProcessSnapshot {
    let key = SortKey::parse(sort_by.as_deref());
    let limit = limit.unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT);
    // Synchrone commands draaien op de main thread: hier niets meten of slapen,
    // alleen de laatste tick van de sampler sorteren.
    match monitor::latest_process_table() {
        Some(table) => ProcessSnapshot {
            taken_at_epoch_ms: table.taken_at_epoch_ms,
            total_processes: table.processes.len(),
            processes: sort_and_limit(table.processes, key, limit),
        },
        None => ProcessSnapshot {
            taken_at_epoch_ms: 0,
            total_processes: 0,
            processes: Vec::new(),
        },
    }
}

/// Metingen in het venster `[freeze_at - window_ms, freeze_at]`, oudste eerst.
/// De sampler-thread stond tijdens de freeze zelf ook stil, dus alles ná de start
/// van de freeze hoort er niet bij.
pub fn samples_before(
    samples: &[MetricsSample],
    freeze_at: u64,
    window_ms: u64,
) -> Vec<MetricsSample> {
    let from = freeze_at.saturating_sub(window_ms);
    let mut out: Vec<MetricsSample> = samples
        .iter()
        .filter(|s| s.at_epoch_ms >= from && s.at_epoch_ms <= freeze_at)
        .cloned()
        .collect();
    out.sort_by_key(|s| s.at_epoch_ms);
    out
}

fn same_freeze(a: &FreezeRecord, b: &FreezeRecord) -> bool {
    a.at_epoch_ms == b.at_epoch_ms && a.duration_ms == b.duration_ms
}

/// Koppelt elke freeze aan zijn metingen: eerst uit de cache (vastgelegd op het
/// moment van detectie), anders live uit de huidige ringbuffer. Volgorde = `records`.
pub fn build_contexts(
    records: &[FreezeRecord],
    cache: &[FreezeProcessContext],
    samples: &[MetricsSample],
) -> Vec<FreezeProcessContext> {
    records
        .iter()
        .map(|rec| {
            let cached = cache
                .iter()
                .find(|c| same_freeze(&c.freeze, rec))
                .filter(|c| !c.samples_before.is_empty());
            match cached {
                Some(c) => c.clone(),
                None => FreezeProcessContext {
                    freeze: rec.clone(),
                    samples_before: samples_before(samples, rec.at_epoch_ms, FREEZE_WINDOW_MS),
                },
            }
        })
        .collect()
}

/// Wordt elke tick door de sampler-thread aangeroepen: legt nieuwe freezes vast
/// terwijl hun voorafgaande metingen nog in de ringbuffer zitten.
pub(crate) fn capture_new_freeze_contexts() {
    let records = get_freeze_records();
    if records.is_empty() {
        return;
    }
    let mut cache = FREEZE_CACHE.lock().unwrap_or_else(|p| p.into_inner());
    let new: Vec<&FreezeRecord> = records
        .iter()
        .filter(|r| !cache.iter().any(|c| same_freeze(&c.freeze, r)))
        .collect();
    if new.is_empty() {
        return;
    }
    let samples = monitor::recent_samples();
    for rec in new {
        cache.push(FreezeProcessContext {
            freeze: rec.clone(),
            samples_before: samples_before(&samples, rec.at_epoch_ms, FREEZE_WINDOW_MS),
        });
    }
    let overflow = cache.len().saturating_sub(FREEZE_CACHE_CAPACITY);
    if overflow > 0 {
        cache.drain(0..overflow);
    }
}

pub fn get_freeze_process_context() -> Vec<FreezeProcessContext> {
    let records = get_freeze_records();
    if records.is_empty() {
        return Vec::new();
    }
    let cache = FREEZE_CACHE
        .lock()
        .map(|c| c.clone())
        .unwrap_or_else(|p| p.into_inner().clone());
    build_contexts(&records, &cache, &monitor::recent_samples())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn proc(pid: u32, cpu: f32, mem: u64, read: u64, write: u64) -> ProcessInfo {
        ProcessInfo {
            pid,
            name: format!("proc{pid}"),
            cpu_usage: cpu,
            memory_bytes: mem,
            disk_read_bytes_per_sec: read,
            disk_write_bytes_per_sec: write,
        }
    }

    fn sample(at: u64) -> MetricsSample {
        MetricsSample {
            at_epoch_ms: at,
            cpu_usage: 10.0,
            cpu_freq_avg_mhz: 3000,
            ram_used_percent: 50.0,
            swap_used_percent: 0.0,
            max_temp_celsius: None,
            disk_read_bytes_per_sec: 0,
            disk_write_bytes_per_sec: 0,
            net_rx_bytes_per_sec: 0,
            net_tx_bytes_per_sec: 0,
            top_processes: vec![proc(at as u32, 1.0, 1, 0, 0)],
        }
    }

    fn freeze(at: u64, dur: u64) -> FreezeRecord {
        FreezeRecord {
            at_epoch_ms: at,
            duration_ms: dur,
            timestamp: String::new(),
        }
    }

    fn sample_list() -> Vec<ProcessInfo> {
        vec![
            proc(1, 5.0, 100, 10, 0),
            proc(2, 50.0, 10, 0, 0),
            proc(3, 20.0, 1_000, 0, 5_000),
            proc(4, f32::NAN, 50, 300, 300),
            proc(5, 20.0, 2_000, 1, 1),
        ]
    }

    #[test]
    fn processes_sort_key_parse_defaults_to_cpu() {
        assert_eq!(SortKey::parse(None), SortKey::Cpu);
        assert_eq!(SortKey::parse(Some("cpu")), SortKey::Cpu);
        assert_eq!(SortKey::parse(Some("onzin")), SortKey::Cpu);
        assert_eq!(SortKey::parse(Some("memory")), SortKey::Memory);
        assert_eq!(SortKey::parse(Some(" Disk ")), SortKey::Disk);
    }

    #[test]
    fn processes_sort_by_cpu_desc_with_tiebreak() {
        let out = sort_and_limit(sample_list(), SortKey::Cpu, 10);
        let pids: Vec<u32> = out.iter().map(|p| p.pid).collect();
        // 50 > 20 (pid 5 heeft meer RAM dan pid 3) > 5; NaN mag niet crashen
        assert_eq!(pids.len(), 5);
        assert_eq!(&pids[..2], &[2, 5]);
        assert!(pids.contains(&3) && pids.contains(&1) && pids.contains(&4));
    }

    #[test]
    fn processes_sort_by_memory_and_disk() {
        let mem: Vec<u32> = sort_and_limit(sample_list(), SortKey::Memory, 10)
            .iter()
            .map(|p| p.pid)
            .collect();
        assert_eq!(mem, vec![5, 3, 1, 4, 2]);

        let disk: Vec<u32> = sort_and_limit(sample_list(), SortKey::Disk, 3)
            .iter()
            .map(|p| p.pid)
            .collect();
        assert_eq!(disk, vec![3, 4, 1]);
    }

    #[test]
    fn processes_limit_is_applied() {
        assert_eq!(sort_and_limit(sample_list(), SortKey::Cpu, 2).len(), 2);
        assert_eq!(sort_and_limit(sample_list(), SortKey::Cpu, 0).len(), 0);
        assert_eq!(sort_and_limit(Vec::new(), SortKey::Disk, 15).len(), 0);
    }

    #[test]
    fn processes_snapshot_respects_limit_and_order() {
        // Werkt ook als de sampler (nog) niet draait: dan leeg.
        let snap = get_process_snapshot(Some("memory".into()), Some(3));
        assert!(snap.processes.len() <= 3);
        assert!(snap.processes.len() <= snap.total_processes || snap.total_processes == 0);
        for w in snap.processes.windows(2) {
            assert!(w[0].memory_bytes >= w[1].memory_bytes);
        }
    }

    #[test]
    fn processes_freeze_window_takes_only_samples_before_start() {
        let freeze_at = 100_000;
        // metingen elke seconde van 90 s t/m 110 s, ongesorteerd aangeleverd
        let mut samples: Vec<MetricsSample> = (90..=110).map(|s| sample(s * 1000)).collect();
        samples.reverse();
        let out = samples_before(&samples, freeze_at, 5_000);
        let ats: Vec<u64> = out.iter().map(|s| s.at_epoch_ms).collect();
        assert_eq!(ats, vec![95_000, 96_000, 97_000, 98_000, 99_000, 100_000]);
        assert!(out.iter().all(|s| s.at_epoch_ms <= freeze_at));
    }

    #[test]
    fn processes_freeze_window_handles_edges() {
        assert!(samples_before(&[], 10_000, 5_000).is_empty());
        // freeze vroeg na epoch: geen underflow
        let out = samples_before(&[sample(0), sample(500), sample(2_000)], 1_000, 5_000);
        assert_eq!(out.len(), 2);
        // alle metingen na de freeze → leeg
        assert!(samples_before(&[sample(20_000)], 10_000, 5_000).is_empty());
    }

    #[test]
    fn processes_build_contexts_prefers_cache_then_live_buffer() {
        let records = vec![freeze(10_000, 1_500), freeze(50_000, 2_000)];
        // cache bevat freeze 1 met een eigen meting (buffer is inmiddels doorgerold)
        let cache = vec![FreezeProcessContext {
            freeze: freeze(10_000, 1_500),
            samples_before: vec![sample(9_000)],
        }];
        let live: Vec<MetricsSample> = (40..=60).map(|s| sample(s * 1000)).collect();
        let ctx = build_contexts(&records, &cache, &live);
        assert_eq!(ctx.len(), 2);
        assert_eq!(ctx[0].freeze.at_epoch_ms, 10_000);
        assert_eq!(ctx[0].samples_before.len(), 1);
        assert_eq!(ctx[0].samples_before[0].at_epoch_ms, 9_000);
        assert_eq!(ctx[1].freeze.at_epoch_ms, 50_000);
        let ats: Vec<u64> = ctx[1]
            .samples_before
            .iter()
            .map(|s| s.at_epoch_ms)
            .collect();
        assert_eq!(ats.first(), Some(&(50_000 - FREEZE_WINDOW_MS)));
        assert_eq!(ats.last(), Some(&50_000));
    }
}
