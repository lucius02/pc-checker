use chrono::Local;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

static WATCHDOG_ALERTS: Mutex<Vec<String>> = Mutex::new(Vec::new());
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
                    let timestamp = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
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
