use chrono::Local;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use crate::models::FreezeRecord;

static WATCHDOG_ALERTS: Mutex<Vec<String>> = Mutex::new(Vec::new());
static WATCHDOG_RECORDS: Mutex<Vec<FreezeRecord>> = Mutex::new(Vec::new());
static WATCHDOG_STARTED: AtomicBool = AtomicBool::new(false);

pub fn ensure_watchdog_started() {
    if WATCHDOG_STARTED.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst).is_ok() {
        std::thread::spawn(|| {
            let sleep_step = Duration::from_millis(100);
            loop {
                let start = Instant::now();
                std::thread::sleep(sleep_step);
                let elapsed = start.elapsed();

                // If scheduled 100ms sleep took >= 1200ms, the entire OS thread scheduling froze
                if elapsed >= Duration::from_millis(1200) {
                    let freeze_ms = elapsed.as_millis().saturating_sub(100);
                    let now = Local::now();
                    let timestamp = now.format("%Y-%m-%d %H:%M:%S").to_string();
                    let alert = format!(
                        "⚡ Systeem Freeze gedetecteerd: {} ms ({:.2}s) om {}",
                        freeze_ms,
                        freeze_ms as f64 / 1000.0,
                        timestamp
                    );
                    if let Ok(mut list) = WATCHDOG_ALERTS.lock() {
                        if list.len() >= 50 {
                            list.remove(0);
                        }
                        list.push(alert);
                    }
                    if let Ok(mut records) = WATCHDOG_RECORDS.lock() {
                        if records.len() >= 50 {
                            records.remove(0);
                        }
                        records.push(FreezeRecord {
                            // Begin van de freeze, niet het moment van detectie
                            at_epoch_ms: (now.timestamp_millis().max(0) as u64).saturating_sub(freeze_ms as u64),
                            duration_ms: freeze_ms as u64,
                            timestamp: timestamp.clone(),
                        });
                    }
                }
            }
        });
    }
}

pub fn get_watchdog_alerts() -> Vec<String> {
    WATCHDOG_ALERTS
        .lock()
        .map(|list| list.clone())
        .unwrap_or_default()
}

pub fn get_freeze_records() -> Vec<FreezeRecord> {
    WATCHDOG_RECORDS
        .lock()
        .map(|list| list.clone())
        .unwrap_or_default()
}
