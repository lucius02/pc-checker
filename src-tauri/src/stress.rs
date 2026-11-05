//! Stresstests: CPU (met rekenverificatie), RAM (meerdere patronen) en schijf (zonder OS-cache).
//!
//! Alle functies zijn blokkerend en worden vanuit `commands.rs` op een worker-thread gestart.

use std::alloc::{Layout, alloc_zeroed, dealloc};
use std::fs::OpenOptions;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::ptr::NonNull;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::{Duration, Instant};

use rayon::prelude::*;

use crate::models::StressTestResult;

// ============================================================================================
// CPU
// ============================================================================================

const CPU_BLOCK_ITERS: u32 = 10_000;

/// Eén deterministisch rekenblok. Op stabiele hardware geeft dit altijd exact hetzelfde
/// bitpatroon; een afwijking duidt op een rekenfout (instabiele overclock, te lage spanning,
/// oververhitting).
#[inline(never)]
pub fn cpu_block(seed: f64) -> (f64, f64) {
    let mut x: f64 = 1.000_000_1 + seed;
    let mut y: f64 = 1.000_000_2;
    for _ in 0..CPU_BLOCK_ITERS {
        x = (x * y + 0.12345).sin().abs() + 1.0;
        y = (y * x + 0.67891).cos().abs() + 1.0;
    }
    (x, y)
}

fn fail(
    test_name: &str,
    unit: &str,
    start: Instant,
    details: &str,
    err: String,
) -> StressTestResult {
    StressTestResult {
        success: false,
        test_name: test_name.to_string(),
        duration_ms: start.elapsed().as_millis(),
        operations_or_bytes: 0,
        score_or_speed: 0.0,
        unit: unit.to_string(),
        details: details.to_string(),
        error: Some(err),
    }
}

pub fn run_cpu_stress_test(duration_secs: u64, thread_count: Option<usize>) -> StressTestResult {
    let effective_threads = match thread_count.unwrap_or(0) {
        0 => std::thread::available_parallelism()
            .map(|p| p.get())
            .unwrap_or(4),
        n => n,
    };

    let stop_signal = Arc::new(AtomicBool::new(false));
    let total_ops = Arc::new(AtomicU64::new(0));
    let mismatches = Arc::new(AtomicU64::new(0));

    let start = Instant::now();
    let test_duration = Duration::from_secs(duration_secs.clamp(1, 3600));

    // Referentiewaarden (per seed) eenmalig berekenen.
    const SEEDS: usize = 8;
    let reference: Arc<Vec<(u64, u64)>> = Arc::new(
        (0..SEEDS)
            .map(|s| {
                let (x, y) = cpu_block(s as f64 * 0.001);
                (x.to_bits(), y.to_bits())
            })
            .collect(),
    );

    let pool = match rayon::ThreadPoolBuilder::new()
        .num_threads(effective_threads)
        .build()
    {
        Ok(p) => p,
        Err(e) => {
            return fail(
                "CPU Multi-Core Stress",
                "MOps/sec",
                start,
                crate::tr!(
                    "Kon threadpool niet initialiseren.",
                    "Could not initialise the thread pool."
                ),
                e.to_string(),
            );
        }
    };

    pool.scope(|s| {
        for t in 0..effective_threads {
            let stop = Arc::clone(&stop_signal);
            let ops = Arc::clone(&total_ops);
            let bad = Arc::clone(&mismatches);
            let reference = Arc::clone(&reference);
            s.spawn(move |_| {
                let mut local_ops: u64 = 0;
                let mut i = t;
                while !stop.load(Ordering::Relaxed) {
                    let seed_idx = i % SEEDS;
                    let (x, y) = cpu_block(std::hint::black_box(seed_idx as f64 * 0.001));
                    if (x.to_bits(), y.to_bits()) != reference[seed_idx] {
                        bad.fetch_add(1, Ordering::Relaxed);
                    }
                    local_ops += CPU_BLOCK_ITERS as u64;
                    i += 1;
                }
                ops.fetch_add(local_ops, Ordering::Relaxed);
            });
        }
        std::thread::sleep(test_duration);
        stop_signal.store(true, Ordering::Relaxed);
    });

    let elapsed = start.elapsed();
    let total = total_ops.load(Ordering::Relaxed);
    let errors = mismatches.load(Ordering::Relaxed);
    let score = total as f64 / elapsed.as_secs_f64().max(0.001) / 1_000_000.0;
    let test_name = format!("CPU Multi-Core Stress ({} threads)", effective_threads);

    if errors > 0 {
        return StressTestResult {
            success: false,
            test_name,
            duration_ms: elapsed.as_millis(),
            operations_or_bytes: total,
            score_or_speed: score,
            unit: "MOps/sec".to_string(),
            details: crate::tr!(
                format!(
                    "WAARSCHUWING: {} rekenblok(ken) gaven een afwijkend resultaat. De CPU rekent onder belasting niet betrouwbaar (instabiele overclock/undervolt, te lage spanning of oververhitting).",
                    errors
                ),
                format!(
                    "WARNING: {} block(s) of work returned a different result. The CPU does not compute reliably under load (unstable overclock/undervolt, too little voltage or overheating).",
                    errors
                )
            ),
            error: Some(crate::tr!(
                format!("{} rekenfouten gedetecteerd", errors),
                format!("{} calculation errors detected", errors)
            )),
        };
    }

    StressTestResult {
        success: true,
        test_name,
        duration_ms: elapsed.as_millis(),
        operations_or_bytes: total,
        score_or_speed: score,
        unit: "MOps/sec".to_string(),
        details: crate::tr!(
            format!(
                "Voltooid op {} threads. Alle rekenblokken geverifieerd tegen referentiewaarden: 0 rekenfouten. Score: {:.2} MOps/s.",
                effective_threads, score
            ),
            format!(
                "Completed on {} threads. All blocks of work verified against reference values: 0 calculation errors. Score: {:.2} MOps/s.",
                effective_threads, score
            )
        ),
        error: None,
    }
}

// ============================================================================================
// RAM
// ============================================================================================

/// Maximale testgrootte als fractie van het beschikbare geheugen.
const RAM_MAX_FRACTION_OF_AVAILABLE: f64 = 0.7;
const RAM_HARD_CAP_MB: usize = 32 * 1024;
const MAX_REPORTED_ERRORS: usize = 5;

#[derive(Default)]
pub struct RamErrors {
    pub count: u64,
    pub samples: Vec<String>,
}

impl RamErrors {
    fn merge(&mut self, other: RamErrors) {
        self.count += other.count;
        for s in other.samples {
            if self.samples.len() < MAX_REPORTED_ERRORS {
                self.samples.push(s);
            }
        }
    }
}

#[inline]
fn xorshift(mut x: u64) -> u64 {
    x ^= x << 13;
    x ^= x >> 7;
    x ^= x << 17;
    x
}

/// Seeded pseudo-random waarde voor woord `i` (stateless, dus parallel te genereren).
#[inline]
fn random_word(seed: u64, i: usize) -> u64 {
    xorshift(xorshift(seed ^ (i as u64).wrapping_mul(0x9E37_79B9_7F4A_7C15)) | 1)
}

const CHUNK_WORDS: usize = 1 << 16; // 512 KB per rayon-taak

fn fill_with(buf: &mut [u64], f: impl Fn(usize) -> u64 + Sync) {
    buf.par_chunks_mut(CHUNK_WORDS)
        .enumerate()
        .for_each(|(ci, chunk)| {
            let base = ci * CHUNK_WORDS;
            for (j, w) in chunk.iter_mut().enumerate() {
                *w = f(base + j);
            }
        });
    // Voorkomt dat de compiler "schrijven en direct teruglezen" wegoptimaliseert.
    std::hint::black_box(&mut *buf);
}

fn verify_with(buf: &[u64], pattern: &str, f: impl Fn(usize) -> u64 + Sync) -> RamErrors {
    std::hint::black_box(buf);
    buf.par_chunks(CHUNK_WORDS)
        .enumerate()
        .map(|(ci, chunk)| {
            let base = ci * CHUNK_WORDS;
            let mut e = RamErrors::default();
            for (j, w) in chunk.iter().enumerate() {
                let expected = f(base + j);
                if *w != expected {
                    e.count += 1;
                    if e.samples.len() < MAX_REPORTED_ERRORS {
                        e.samples.push(crate::tr!(format!(
                            "{}: offset 0x{:X}, verwacht {:016X}, gelezen {:016X} (bits {:016X})",
                            pattern,
                            (base + j) * 8,
                            expected,
                            w,
                            expected ^ w
                        ), format!("{}: offset 0x{:X}, expected {:016X}, read {:016X} (bits {:016X})",
                            pattern,
                            (base + j) * 8,
                            expected,
                            w,
                            expected ^ w
                        )));
                    }
                }
            }
            e
        })
        .reduce(RamErrors::default, |mut a, b| {
            a.merge(b);
            a
        })
}

/// Moving inversions (march-test): detecteert koppelingsfouten tussen naburige cellen.
fn moving_inversions(buf: &mut [u64], p: u64) -> RamErrors {
    let mut errs = RamErrors::default();
    fill_with(buf, |_| p);
    // Oplopend: lees p, schrijf !p
    for (i, w) in buf.iter_mut().enumerate() {
        if *w != p {
            errs.count += 1;
            if errs.samples.len() < MAX_REPORTED_ERRORS {
                errs.samples
                    .push(format!("Moving inversions ↑: offset 0x{:X}", i * 8));
            }
        }
        *w = !p;
    }
    std::hint::black_box(&mut *buf);
    // Aflopend: lees !p, schrijf p
    for (i, w) in buf.iter_mut().enumerate().rev() {
        if *w != !p {
            errs.count += 1;
            if errs.samples.len() < MAX_REPORTED_ERRORS {
                errs.samples
                    .push(format!("Moving inversions ↓: offset 0x{:X}", i * 8));
            }
        }
        *w = p;
    }
    errs.merge(verify_with(buf, "Moving inversions", |_| p));
    errs
}

/// Voert alle patronen één keer uit over `buf`. Retourneert (fouten, aantal patronen).
pub fn run_ram_patterns(buf: &mut [u64], seed: u64) -> (RamErrors, usize) {
    let mut errors = RamErrors::default();
    let mut patterns = 0usize;

    let solid = |buf: &mut [u64], v: u64, name: &str, errors: &mut RamErrors| {
        fill_with(buf, |_| v);
        errors.merge(verify_with(buf, name, |_| v));
    };

    // 1. Checkerboard
    solid(buf, 0xAAAA_AAAA_AAAA_AAAA, "Checkerboard 0xAA", &mut errors);
    solid(buf, 0x5555_5555_5555_5555, "Checkerboard 0x55", &mut errors);
    patterns += 2;

    // 2. Walking ones (per byte-positie)
    for bit in 0..8 {
        let v = 0x0101_0101_0101_0101u64 << bit;
        solid(buf, v, "Walking ones", &mut errors);
    }
    patterns += 8;

    // 3. Address-in-address (detecteert adresseringsfouten / kortgesloten adreslijnen)
    fill_with(buf, |i| i as u64);
    errors.merge(verify_with(buf, "Address-in-address", |i| i as u64));
    fill_with(buf, |i| !(i as u64));
    errors.merge(verify_with(buf, "Address-in-address (inv)", |i| {
        !(i as u64)
    }));
    patterns += 2;

    // 4. Moving inversions met pseudo-willekeurig patroon
    errors.merge(moving_inversions(buf, random_word(seed, 0)));
    patterns += 1;

    // 5. Willekeurige data
    fill_with(buf, |i| random_word(seed, i));
    errors.merge(verify_with(buf, "Random", |i| random_word(seed, i)));
    patterns += 1;

    (errors, patterns)
}

fn max_ram_test_mb() -> usize {
    let available = sysinfo::System::new_with_specifics(
        sysinfo::RefreshKind::nothing().with_memory(sysinfo::MemoryRefreshKind::everything()),
    )
    .map(|s| s.available_memory())
    .unwrap_or(0);
    if available == 0 {
        return 512;
    }
    (((available as f64 * RAM_MAX_FRACTION_OF_AVAILABLE) / (1024.0 * 1024.0)) as usize)
        .clamp(16, RAM_HARD_CAP_MB)
}

pub fn run_ram_stress_test(size_mb: usize, passes: Option<usize>) -> StressTestResult {
    let start = Instant::now();
    let num_passes = passes.unwrap_or(1).clamp(1, 20);
    let max_mb = max_ram_test_mb();
    let size_mb = size_mb.clamp(16, max_mb);
    let words = size_mb * 1024 * 1024 / 8;
    let test_name = crate::tr!(
        format!("RAM Geheugenintegriteit Test ({} MB)", size_mb),
        format!("RAM integrity test ({} MB)", size_mb)
    );

    let mut buffer: Vec<u64> = Vec::new();
    if buffer.try_reserve_exact(words).is_err() {
        return fail(
            &test_name,
            "MB/s",
            start,
            crate::tr!(
                "Onvoldoende vrij geheugen om de test te alloceren.",
                "Not enough free memory to allocate the test."
            ),
            crate::tr!(
                format!("Kon {} MB niet alloceren", size_mb),
                format!("Could not allocate {} MB", size_mb)
            ),
        );
    }
    buffer.resize(words, 0);

    let mut errors = RamErrors::default();
    let mut pattern_count = 0usize;
    for pass in 0..num_passes {
        let seed = 0x5EED_0000_0000_0000 ^ (pass as u64 + 1).wrapping_mul(0xA24B_AED4_963E_E407);
        let (e, n) = run_ram_patterns(&mut buffer, seed);
        errors.merge(e);
        pattern_count += n;
        if errors.count > 1_000_000 {
            break;
        }
    }

    let elapsed = start.elapsed();
    // Elk patroon = minimaal één volledige schrijf- + leesronde.
    let throughput =
        (size_mb as f64 * pattern_count as f64 * 2.0) / elapsed.as_secs_f64().max(0.001);
    let pattern_desc = crate::tr!(
        "checkerboard, walking ones, address-in-address, moving inversions en random",
        "checkerboard, walking ones, address-in-address, moving inversions and random"
    );

    if errors.count == 0 {
        StressTestResult {
            success: true,
            test_name,
            duration_ms: elapsed.as_millis(),
            operations_or_bytes: (size_mb * 1024 * 1024) as u64,
            score_or_speed: throughput,
            unit: "MB/s read+write".to_string(),
            details: crate::tr!(
                format!(
                    "Succesvol {} MB getest over {} pass(es) en {} patronen ({}). 0 bitflips gedetecteerd. Maximaal testbaar nu: {} MB.",
                    size_mb, num_passes, pattern_count, pattern_desc, max_mb
                ),
                format!(
                    "Successfully tested {} MB over {} pass(es) and {} patterns ({}). 0 bit flips detected. Maximum testable right now: {} MB.",
                    size_mb, num_passes, pattern_count, pattern_desc, max_mb
                )
            ),
            error: None,
        }
    } else {
        StressTestResult {
            success: false,
            test_name,
            duration_ms: elapsed.as_millis(),
            operations_or_bytes: (size_mb * 1024 * 1024) as u64,
            score_or_speed: 0.0,
            unit: "MB/s".to_string(),
            details: crate::tr!(
                format!(
                    "WAARSCHUWING: {} geheugenfouten / bit-flips gedetecteerd! RAM kan defect zijn of onstabiel draaien (XMP/EXPO-profiel?). Voorbeelden: {}",
                    errors.count,
                    errors.samples.join(" | ")
                ),
                format!(
                    "WARNING: {} memory errors / bit flips detected! RAM may be faulty or unstable (XMP/EXPO profile?). Examples: {}",
                    errors.count,
                    errors.samples.join(" | ")
                )
            ),
            error: Some(crate::tr!(
                format!("{} geheugen verificatiefouten gevonden", errors.count),
                format!("{} memory verification errors found", errors.count)
            )),
        }
    }
}

// ============================================================================================
// Schijf
// ============================================================================================

const DISK_BLOCK: usize = 1024 * 1024;
const DISK_ALIGN: usize = 4096;

/// Heap-buffer met sector-uitlijning (vereist voor ongebufferde I/O).
pub struct AlignedBuf {
    ptr: NonNull<u8>,
    layout: Layout,
}

impl AlignedBuf {
    pub fn new(len: usize, align: usize) -> Option<Self> {
        let layout = Layout::from_size_align(len, align).ok()?;
        if layout.size() == 0 {
            return None;
        }
        // SAFETY: layout heeft een niet-nul grootte.
        let ptr = unsafe { alloc_zeroed(layout) };
        NonNull::new(ptr).map(|ptr| Self { ptr, layout })
    }
    pub fn as_slice(&self) -> &[u8] {
        // SAFETY: ptr is geldig voor layout.size() bytes zolang self leeft.
        unsafe { std::slice::from_raw_parts(self.ptr.as_ptr(), self.layout.size()) }
    }
    pub fn as_mut_slice(&mut self) -> &mut [u8] {
        // SAFETY: idem, en &mut self garandeert exclusieve toegang.
        unsafe { std::slice::from_raw_parts_mut(self.ptr.as_ptr(), self.layout.size()) }
    }
}

impl Drop for AlignedBuf {
    fn drop(&mut self) {
        // SAFETY: gealloceerd met exact deze layout.
        unsafe { dealloc(self.ptr.as_ptr(), self.layout) }
    }
}

/// Vult een blok met een uniek, van de blokindex afgeleid patroon. Zo valt een blok dat op de
/// verkeerde plek is beland (of een verouderd cache-blok) direct op.
pub fn fill_disk_block(buf: &mut [u8], block_index: u64, seed: u64) {
    let block_seed = seed ^ block_index.wrapping_mul(0x9E37_79B9_7F4A_7C15);
    for (i, chunk) in buf.chunks_exact_mut(8).enumerate() {
        chunk.copy_from_slice(&random_word(block_seed, i).to_le_bytes());
    }
}

/// Opent een bestand zonder OS-cache (Windows: NO_BUFFERING; Linux: O_DIRECT; macOS: F_NOCACHE).
/// Retourneert (bestand, cache_omzeild).
fn open_uncached(path: &Path, write: bool) -> std::io::Result<(std::fs::File, bool)> {
    let mut opts = OpenOptions::new();
    if write {
        opts.write(true).create(true).truncate(true);
    } else {
        opts.read(true);
    }

    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        const FILE_FLAG_NO_BUFFERING: u32 = 0x2000_0000;
        const FILE_FLAG_WRITE_THROUGH: u32 = 0x8000_0000;
        let mut direct = opts.clone();
        direct
            .custom_flags(FILE_FLAG_NO_BUFFERING | if write { FILE_FLAG_WRITE_THROUGH } else { 0 });
        if let Ok(f) = direct.open(path) {
            return Ok((f, true));
        }
    }
    #[cfg(target_os = "linux")]
    {
        use std::os::unix::fs::OpenOptionsExt;
        let mut direct = opts.clone();
        direct.custom_flags(libc::O_DIRECT);
        if let Ok(f) = direct.open(path) {
            return Ok((f, true));
        }
    }
    let f = opts.open(path)?;
    #[cfg(target_os = "macos")]
    {
        use std::os::unix::io::AsRawFd;
        // SAFETY: geldige fd; F_NOCACHE schakelt de unified buffer cache uit voor deze fd.
        let ok = unsafe { libc::fcntl(f.as_raw_fd(), libc::F_NOCACHE, 1) } != -1;
        return Ok((f, ok));
    }
    #[allow(unreachable_code)]
    Ok((f, false))
}

pub fn run_disk_benchmark(
    target_dir: Option<String>,
    file_size_mb: Option<usize>,
) -> StressTestResult {
    let start = Instant::now();
    let size_mb = file_size_mb.unwrap_or(256).clamp(16, 4096);
    let total_bytes = (size_mb * DISK_BLOCK) as u64;
    let name = crate::tr!(
        "Schijf Schrijf & Lees Benchmark",
        "Disk write & read benchmark"
    );

    let dir = target_dir
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir);
    let test_file_path = dir.join(format!(".pc_checker_bench_{}.tmp", std::process::id()));
    let seed = chrono::Utc::now().timestamp_nanos_opt().unwrap_or(0) as u64 | 1;

    let (Some(mut wbuf), Some(mut rbuf), Some(mut expected)) = (
        AlignedBuf::new(DISK_BLOCK, DISK_ALIGN),
        AlignedBuf::new(DISK_BLOCK, DISK_ALIGN),
        AlignedBuf::new(DISK_BLOCK, DISK_ALIGN),
    ) else {
        return fail(
            name,
            "MB/s",
            start,
            crate::tr!(
                "Kon I/O-buffers niet alloceren.",
                "Could not allocate I/O buffers."
            ),
            crate::tr!("Geheugenallocatie mislukt", "Memory allocation failed").into(),
        );
    };

    // ---- Schrijven (alleen de I/O-aanroepen worden getimed) ----
    let mut write_time = Duration::ZERO;
    let write_result = (|| -> std::io::Result<bool> {
        let (mut file, bypassed) = open_uncached(&test_file_path, true)?;
        for block in 0..size_mb as u64 {
            fill_disk_block(wbuf.as_mut_slice(), block, seed);
            let t = Instant::now();
            file.write_all(wbuf.as_slice())?;
            write_time += t.elapsed();
        }
        let t = Instant::now();
        file.sync_all()?;
        write_time += t.elapsed();
        Ok(bypassed)
    })();

    let write_bypassed = match write_result {
        Ok(b) => b,
        Err(e) => {
            let _ = std::fs::remove_file(&test_file_path);
            return fail(
                name,
                "MB/s",
                start,
                crate::tr!(
                    "Kon testbestand niet schrijven.",
                    "Could not write the test file."
                ),
                e.to_string(),
            );
        }
    };
    let write_speed =
        (total_bytes as f64 / (1024.0 * 1024.0)) / write_time.as_secs_f64().max(0.001);

    // ---- Lezen + verificatie per blok ----
    let mut read_time = Duration::ZERO;
    let mut corrupt_blocks: Vec<u64> = Vec::new();
    let read_result = (|| -> std::io::Result<bool> {
        let (mut file, bypassed) = open_uncached(&test_file_path, false)?;
        for block in 0..size_mb as u64 {
            let t = Instant::now();
            file.read_exact(rbuf.as_mut_slice())?;
            read_time += t.elapsed();
            fill_disk_block(expected.as_mut_slice(), block, seed);
            if rbuf.as_slice() != expected.as_slice() {
                corrupt_blocks.push(block);
            }
        }
        Ok(bypassed)
    })();

    let _ = std::fs::remove_file(&test_file_path);

    let read_bypassed = match read_result {
        Ok(b) => b,
        Err(e) => {
            return fail(
                name,
                "MB/s",
                start,
                crate::tr!(
                    "Fout tijdens uitlezen van testbestand.",
                    "Error while reading the test file."
                ),
                e.to_string(),
            );
        }
    };
    let read_speed = (total_bytes as f64 / (1024.0 * 1024.0)) / read_time.as_secs_f64().max(0.001);
    let avg = (write_speed + read_speed) / 2.0;

    let cache_note = if write_bypassed && read_bypassed {
        crate::tr!(
            "OS-cache omzeild (directe I/O): de snelheden zijn echte schijfsnelheden.",
            "OS cache bypassed (direct I/O): these are real disk speeds."
        )
    } else {
        crate::tr!(
            "Let op: directe I/O werd niet ondersteund op dit volume; de leessnelheid kan door de OS-cache te hoog uitvallen.",
            "Note: direct I/O was not supported on this volume; the read speed may be inflated by the OS cache."
        )
    };

    if !corrupt_blocks.is_empty() {
        let shown: Vec<String> = corrupt_blocks
            .iter()
            .take(5)
            .map(|b| format!("#{}", b))
            .collect();
        return StressTestResult {
            success: false,
            test_name: crate::tr!("Schijf Integriteit & Snelheid", "Disk integrity & speed")
                .to_string(),
            duration_ms: start.elapsed().as_millis(),
            operations_or_bytes: total_bytes,
            score_or_speed: avg,
            unit: "MB/s".to_string(),
            details: crate::tr!(
                format!(
                    "WAARSCHUWING: {} van {} blokken (1 MB) kwamen niet overeen met de geschreven data (o.a. {}). Mogelijke schijf-, kabel- of bestandssysteemcorruptie.",
                    corrupt_blocks.len(),
                    size_mb,
                    shown.join(", ")
                ),
                format!(
                    "WARNING: {} of {} blocks (1 MB) did not match the written data (e.g. {}). Possible disk, cable or file system corruption.",
                    corrupt_blocks.len(),
                    size_mb,
                    shown.join(", ")
                )
            ),
            error: Some(
                crate::tr!(
                    "Data integriteit verificatie mislukt",
                    "Data integrity verification failed"
                )
                .to_string(),
            ),
        };
    }

    StressTestResult {
        success: true,
        test_name: crate::tr!(
            format!("Schijf Benchmark ({} MB Sequentieel)", size_mb),
            format!("Disk benchmark ({} MB sequential)", size_mb)
        ),
        duration_ms: start.elapsed().as_millis(),
        operations_or_bytes: total_bytes,
        score_or_speed: avg,
        unit: "MB/s avg".to_string(),
        details: crate::tr!(
            format!(
                "Schrijfsnelheid: {:.2} MB/s | Leessnelheid: {:.2} MB/s. Alle {} blokken met uniek patroon geverifieerd (0 bitfouten). {}",
                write_speed, read_speed, size_mb, cache_note
            ),
            format!(
                "Write speed: {:.2} MB/s | Read speed: {:.2} MB/s. All {} blocks with a unique pattern verified (0 bit errors). {}",
                write_speed, read_speed, size_mb, cache_note
            )
        ),
        error: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cpu_block_is_deterministic() {
        assert_eq!(cpu_block(0.0).0.to_bits(), cpu_block(0.0).0.to_bits());
        assert_ne!(cpu_block(0.0).0.to_bits(), cpu_block(0.001).0.to_bits());
    }

    #[test]
    fn ram_patterns_pass_on_healthy_buffer() {
        let mut buf = vec![0u64; 200_000];
        let (errs, n) = run_ram_patterns(&mut buf, 42);
        assert_eq!(errs.count, 0);
        assert_eq!(n, 14);
    }

    #[test]
    fn verify_detects_and_reports_flipped_bit() {
        let mut buf = vec![0u64; 1000];
        fill_with(&mut buf, |i| i as u64);
        buf[123] ^= 1 << 7;
        let e = verify_with(&buf, "test", |i| i as u64);
        assert_eq!(e.count, 1);
        assert!(e.samples[0].contains("0x3D8")); // 123 * 8
    }

    #[test]
    fn disk_blocks_differ_per_index() {
        let mut a = vec![0u8; 4096];
        let mut b = vec![0u8; 4096];
        fill_disk_block(&mut a, 0, 7);
        fill_disk_block(&mut b, 1, 7);
        assert_ne!(a, b);
        let mut a2 = vec![0u8; 4096];
        fill_disk_block(&mut a2, 0, 7);
        assert_eq!(a, a2);
    }

    #[test]
    fn aligned_buf_is_aligned() {
        let b = AlignedBuf::new(DISK_BLOCK, DISK_ALIGN).unwrap();
        assert_eq!(b.as_slice().as_ptr() as usize % DISK_ALIGN, 0);
        assert_eq!(b.as_slice().len(), DISK_BLOCK);
    }
}
