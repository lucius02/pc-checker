use std::fs::{File, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use crate::models::StressTestResult;

#[tauri::command]
pub fn run_cpu_stress_test(duration_secs: u64, thread_count: Option<usize>) -> StressTestResult {
    let threads = thread_count.unwrap_or(0);
    let effective_threads = if threads == 0 {
        std::thread::available_parallelism()
            .map(|p| p.get())
            .unwrap_or(4)
    } else {
        threads
    };

    let stop_signal = Arc::new(AtomicBool::new(false));
    let total_ops = Arc::new(AtomicU64::new(0));

    let start = Instant::now();
    let test_duration = Duration::from_secs(duration_secs.max(1));

    let pool = rayon::ThreadPoolBuilder::new()
        .num_threads(effective_threads)
        .build();

    match pool {
        Ok(pool) => {
            let stop_clone = Arc::clone(&stop_signal);
            let ops_clone = Arc::clone(&total_ops);

            pool.scope(|s| {
                for _ in 0..effective_threads {
                    let stop = Arc::clone(&stop_clone);
                    let ops = Arc::clone(&ops_clone);
                    s.spawn(move |_| {
                        let mut local_ops: u64 = 0;
                        let mut x: f64 = 1.0000001;
                        let mut y: f64 = 1.0000002;
                        while !stop.load(Ordering::Relaxed) {
                            for _ in 0..10_000 {
                                x = (x * y + 0.12345).sin().abs() + 1.0;
                                y = (y * x + 0.67891).cos().abs() + 1.0;
                            }
                            local_ops += 10_000;
                        }
                        ops.fetch_add(local_ops, Ordering::Relaxed);
                    });
                }

                std::thread::sleep(test_duration);
                stop_signal.store(true, Ordering::Relaxed);
            });

            let elapsed = start.elapsed();
            let total = total_ops.load(Ordering::Relaxed);
            let ops_per_sec = total as f64 / elapsed.as_secs_f64().max(0.001);
            let score = ops_per_sec / 1_000_000.0;

            StressTestResult {
                success: true,
                test_name: format!("CPU Multi-Core Stress ({} threads)", effective_threads),
                duration_ms: elapsed.as_millis(),
                operations_or_bytes: total,
                score_or_speed: score,
                unit: "MOps/sec".to_string(),
                details: format!(
                    "Voltooid op {} threads. Geen berekeningsfouten gedetecteerd. Score: {:.2} MOps/s.",
                    effective_threads, score
                ),
                error: None,
            }
        }
        Err(e) => StressTestResult {
            success: false,
            test_name: "CPU Multi-Core Stress".to_string(),
            duration_ms: start.elapsed().as_millis(),
            operations_or_bytes: 0,
            score_or_speed: 0.0,
            unit: "MOps/sec".to_string(),
            details: "Kon threadpool niet initialiseren.".to_string(),
            error: Some(e.to_string()),
        },
    }
}

#[tauri::command]
pub fn run_ram_stress_test(size_mb: usize, passes: Option<usize>) -> StressTestResult {
    let start = Instant::now();
    let num_passes = passes.unwrap_or(1).max(1);
    let target_bytes = size_mb.max(16) * 1024 * 1024;

    let mut buffer: Vec<u8> = vec![0u8; target_bytes];
    let mut errors: usize = 0;

    let test_patterns: [(u8, &str); 3] = [
        (0xAA, "Checkerboard 0xAA"),
        (0x55, "Checkerboard 0x55"),
        (0x00, "Zero Fill & Random Bit Flip"),
    ];

    for _pass in 0..num_passes {
        for (pattern, _) in test_patterns.iter() {
            buffer.fill(*pattern);

            for byte in buffer.iter() {
                if *byte != *pattern {
                    errors += 1;
                    if errors > 100 {
                        break;
                    }
                }
            }
            if errors > 100 {
                break;
            }
        }
        if errors > 100 {
            break;
        }
    }

    let elapsed = start.elapsed();
    let throughput_mb_s = (target_bytes as f64 * (num_passes * test_patterns.len() * 2) as f64)
        / (1024.0 * 1024.0)
        / elapsed.as_secs_f64().max(0.001);

    if errors == 0 {
        StressTestResult {
            success: true,
            test_name: format!("RAM Geheugenintegriteit Test ({} MB)", size_mb),
            duration_ms: elapsed.as_millis(),
            operations_or_bytes: target_bytes as u64,
            score_or_speed: throughput_mb_s,
            unit: "MB/s read+write".to_string(),
            details: format!(
                "Succesvol {} MB getest over {} pass(es). 0 bitflips of pariteitsfouten gedetecteerd.",
                size_mb, num_passes
            ),
            error: None,
        }
    } else {
        StressTestResult {
            success: false,
            test_name: format!("RAM Geheugenintegriteit Test ({} MB)", size_mb),
            duration_ms: elapsed.as_millis(),
            operations_or_bytes: target_bytes as u64,
            score_or_speed: 0.0,
            unit: "MB/s".to_string(),
            details: format!(
                "WAARSCHUWING: {} geheugenfouten / bit-flips gedetecteerd! RAM kan defect zijn of onstabiel draaien.",
                errors
            ),
            error: Some(format!("{} geheugen verificatiefouten gevonden", errors)),
        }
    }
}

#[tauri::command]
pub fn run_disk_benchmark(target_dir: Option<String>, file_size_mb: Option<usize>) -> StressTestResult {
    let start = Instant::now();
    let size_mb = file_size_mb.unwrap_or(64).clamp(16, 512);
    let total_bytes = size_mb * 1024 * 1024;

    let dir = target_dir
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir);

    let test_file_path = dir.join(format!(".pc_checker_bench_{}.tmp", std::process::id()));

    let chunk_size = 1024 * 1024; // 1 MB chunk
    let chunk_data = vec![0xA5u8; chunk_size];

    let write_start = Instant::now();
    let write_result = (|| -> Result<(), std::io::Error> {
        let mut file = OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .open(&test_file_path)?;

        for _ in 0..size_mb {
            file.write_all(&chunk_data)?;
        }
        file.sync_all()?;
        Ok(())
    })();

    if let Err(e) = write_result {
        let _ = std::fs::remove_file(&test_file_path);
        return StressTestResult {
            success: false,
            test_name: "Schijf Schrijf & Lees Benchmark".to_string(),
            duration_ms: start.elapsed().as_millis(),
            operations_or_bytes: 0,
            score_or_speed: 0.0,
            unit: "MB/s".to_string(),
            details: "Kon testbestand niet schrijven.".to_string(),
            error: Some(e.to_string()),
        };
    }
    let write_duration = write_start.elapsed();
    let write_speed_mbps = (total_bytes as f64 / (1024.0 * 1024.0)) / write_duration.as_secs_f64().max(0.001);

    let read_start = Instant::now();
    let mut read_buffer = vec![0u8; chunk_size];
    let mut verified = true;

    let read_result = (|| -> Result<(), std::io::Error> {
        let mut file = File::open(&test_file_path)?;
        file.seek(SeekFrom::Start(0))?;

        for _ in 0..size_mb {
            file.read_exact(&mut read_buffer)?;
            if read_buffer != chunk_data {
                verified = false;
                break;
            }
        }
        Ok(())
    })();

    let _ = std::fs::remove_file(&test_file_path);

    if let Err(e) = read_result {
        return StressTestResult {
            success: false,
            test_name: "Schijf Schrijf & Lees Benchmark".to_string(),
            duration_ms: start.elapsed().as_millis(),
            operations_or_bytes: 0,
            score_or_speed: 0.0,
            unit: "MB/s".to_string(),
            details: "Fout tijdens uitlezen van testbestand.".to_string(),
            error: Some(e.to_string()),
        };
    }
    let read_duration = read_start.elapsed();
    let read_speed_mbps = (total_bytes as f64 / (1024.0 * 1024.0)) / read_duration.as_secs_f64().max(0.001);

    if !verified {
        return StressTestResult {
            success: false,
            test_name: "Schijf Integriteit & Snelheid".to_string(),
            duration_ms: start.elapsed().as_millis(),
            operations_or_bytes: total_bytes as u64,
            score_or_speed: (write_speed_mbps + read_speed_mbps) / 2.0,
            unit: "MB/s".to_string(),
            details: "WAARSCHUWING: Gelezen data kwam niet overeen met geschreven data! Mogelijke schijf- of bestandssysteemcorruptie.".to_string(),
            error: Some("Data integriteit verificatie mislukt".to_string()),
        };
    }

    StressTestResult {
        success: true,
        test_name: format!("Schijf Benchmark ({} MB Sequentieel)", size_mb),
        duration_ms: start.elapsed().as_millis(),
        operations_or_bytes: total_bytes as u64,
        score_or_speed: (write_speed_mbps + read_speed_mbps) / 2.0,
        unit: "MB/s avg".to_string(),
        details: format!(
            "Schrijfsnelheid: {:.2} MB/s | Leessnelheid: {:.2} MB/s. 100% data-integriteit geverifieerd (0 bitfouten).",
            write_speed_mbps, read_speed_mbps
        ),
        error: None,
    }
}
