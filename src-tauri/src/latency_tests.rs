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
    for ns in [
        0u64,
        1,
        15,
        16,
        17,
        100,
        999,
        50_000,
        1_000_000,
        16_000_000,
        10_000_000_000,
        u64::MAX,
    ] {
        let idx = fine_index(ns);
        assert!(idx >= prev, "index niet monotoon bij {ns}");
        assert!(idx < FINE_BUCKETS);
        if ns < u64::MAX / 2 {
            assert!(
                fine_upper_ns(idx) >= ns,
                "bovengrens {} < {}",
                fine_upper_ns(idx),
                ns
            );
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
        49_999, 50_000, 249_999, 250_000, 999_999, 1_000_000, 3_999_999, 4_000_000, 15_999_999,
        16_000_000, 50_000_000,
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
    assert!(
        (99_000.0..=99_000.0 * 1.125).contains(&p99_ns),
        "p99 = {p99_ns}"
    );
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
    let c = CounterStats {
        irq_avg: Some(4.0),
        irq_max: Some(6.0),
        ..Default::default()
    };
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
    assert_eq!(
        c,
        CounterStats {
            name_source: Some("en".into()),
            ..Default::default()
        }
    );
    assert!(!c.any());
    assert_eq!(parse_counter_json(""), CounterStats::default());
    assert_eq!(
        parse_counter_json("Get-Counter : fout"),
        CounterStats::default()
    );
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
        advice_detail: Default::default(),
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
    let r = build_result(
        &bad,
        Duration::from_secs(5),
        true,
        &CounterStats::default(),
        None,
    );
    assert_eq!(r.verdict, "Slecht");
    assert!(r.suspected_drivers.is_empty());
    assert!(
        r.advice
            .iter()
            .any(|a| a.starts_with("Voer eerst de Driver Check uit"))
    );

    let r = build_result(
        &bad,
        Duration::from_secs(5),
        true,
        &CounterStats::default(),
        Some(&report),
    );
    assert_eq!(r.suspected_drivers.len(), 3);
    assert!(
        !r.advice
            .iter()
            .any(|a| a.starts_with("Voer eerst de Driver Check uit"))
    );

    let unavailable = DriverReport {
        is_available: false,
        ..report.clone()
    };
    let r = build_result(
        &bad,
        Duration::from_secs(5),
        true,
        &CounterStats::default(),
        Some(&unavailable),
    );
    assert!(r.suspected_drivers.is_empty());

    let good = stats_from(&[100, 200, 300]);
    let r = build_result(
        &good,
        Duration::from_secs(5),
        true,
        &CounterStats::default(),
        Some(&report),
    );
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
    let r = build_result(
        &s,
        Duration::from_secs(1),
        false,
        &CounterStats::default(),
        None,
    );
    assert!(r.success);
    assert!(["Goed", "Matig", "Slecht"].contains(&r.verdict.as_str()));
}

#[test]
#[ignore]
fn latency_host_counters() {
    let c = collect_counters(3);
    println!("{c:?}");
    assert!(c.any());
}
