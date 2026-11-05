//! Historie over sessies heen: freezes (van de Watchdog) en gezondheidsscores worden in
//! `<app data dir>/history.json` bewaard, zodat trends zichtbaar worden
//! ("3 freezes deze week, allemaal na een GPU TDR").

use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

use crate::models::{FreezeRecord, HealthHistoryEntry, HealthScore, HistoryData};

pub const MAX_FREEZES: usize = 500;
pub const MAX_HEALTH: usize = 1000;
/// Een nieuwe score wordt minimaal elke 15 minuten opgeslagen, of direct bij een duidelijke wijziging.
pub const HEALTH_MIN_INTERVAL_MS: u64 = 15 * 60 * 1000;
pub const HEALTH_MIN_DELTA: i16 = 5;

static PATH: OnceLock<PathBuf> = OnceLock::new();
static LOCK: Mutex<()> = Mutex::new(());

pub fn init(dir: PathBuf) {
    let _ = std::fs::create_dir_all(&dir);
    let _ = PATH.set(dir.join("history.json"));
}

fn now_ms() -> u64 {
    chrono::Utc::now().timestamp_millis().max(0) as u64
}

fn read_file() -> HistoryData {
    PATH.get()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn write_file(data: &HistoryData) -> Result<(), String> {
    let Some(path) = PATH.get() else {
        return Err("Historie is niet geïnitialiseerd.".into());
    };
    let json = serde_json::to_string(data).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, json).map_err(|e| format!("Kon historie niet opslaan: {e}"))?;
    std::fs::rename(&tmp, path).map_err(|e| format!("Kon historie niet opslaan: {e}"))
}

/// Voegt een freeze toe als hij nog niet bestaat (zelfde starttijd = zelfde freeze).
pub fn push_freeze(data: &mut HistoryData, rec: FreezeRecord, cap: usize) -> bool {
    if data
        .freezes
        .iter()
        .any(|f| f.at_epoch_ms == rec.at_epoch_ms)
    {
        return false;
    }
    data.freezes.push(rec);
    if data.freezes.len() > cap {
        let excess = data.freezes.len() - cap;
        data.freezes.drain(0..excess);
    }
    true
}

pub fn should_record_health(
    last: Option<&HealthHistoryEntry>,
    now: u64,
    score: u8,
    grade: &str,
) -> bool {
    match last {
        None => true,
        Some(l) => {
            l.grade != grade
                || (l.score as i16 - score as i16).abs() >= HEALTH_MIN_DELTA
                || now.saturating_sub(l.at_epoch_ms) >= HEALTH_MIN_INTERVAL_MS
        }
    }
}

pub fn record_freeze(rec: FreezeRecord) {
    if PATH.get().is_none() {
        return;
    }
    let _g = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let mut data = read_file();
    if push_freeze(&mut data, rec, MAX_FREEZES) {
        let _ = write_file(&data);
    }
}

pub fn record_health(h: &HealthScore) {
    if PATH.get().is_none() {
        return;
    }
    let _g = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let mut data = read_file();
    let now = now_ms();
    if !should_record_health(data.health.last(), now, h.score, &h.grade) {
        return;
    }
    data.health.push(HealthHistoryEntry {
        at_epoch_ms: now,
        score: h.score,
        grade: h.grade.clone(),
        top_issue: h.top_issues.first().cloned(),
    });
    if data.health.len() > MAX_HEALTH {
        let excess = data.health.len() - MAX_HEALTH;
        data.health.drain(0..excess);
    }
    let _ = write_file(&data);
}

pub fn load() -> HistoryData {
    let _g = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    read_file()
}

pub fn clear() -> Result<(), String> {
    let _g = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    write_file(&HistoryData::default())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rec(at: u64) -> FreezeRecord {
        FreezeRecord {
            at_epoch_ms: at,
            duration_ms: 1500,
            timestamp: String::new(),
        }
    }

    #[test]
    fn freezes_are_deduplicated_and_capped() {
        let mut d = HistoryData::default();
        assert!(push_freeze(&mut d, rec(1), 3));
        assert!(!push_freeze(&mut d, rec(1), 3));
        for i in 2..=5 {
            push_freeze(&mut d, rec(i), 3);
        }
        assert_eq!(
            d.freezes.iter().map(|f| f.at_epoch_ms).collect::<Vec<_>>(),
            [3, 4, 5]
        );
    }

    #[test]
    fn health_is_throttled() {
        let last = HealthHistoryEntry {
            at_epoch_ms: 1_000,
            score: 80,
            grade: "B".into(),
            top_issue: None,
        };
        assert!(should_record_health(None, 0, 80, "B"));
        assert!(!should_record_health(Some(&last), 2_000, 82, "B"));
        assert!(should_record_health(Some(&last), 2_000, 85, "B"));
        assert!(should_record_health(Some(&last), 2_000, 79, "C"));
        assert!(should_record_health(
            Some(&last),
            1_000 + HEALTH_MIN_INTERVAL_MS,
            80,
            "B"
        ));
    }
}
