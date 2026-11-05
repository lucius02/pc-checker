use super::*;
use crate::models::HealthCategoryScore;

const GRADES: [&str; 6] = ["A", "B", "C", "D", "E", "F"];

fn all_good() -> HealthInputs {
    HealthInputs {
        max_temp_celsius: Some(55.0),
        is_throttling_suspected: false,
        freeze_scanned: true,
        watchdog_freeze_count: 0,
        event_log_culprit_count: 0,
        battery_health_percent: Some(95.0),
        ram_used_percent: 45.0,
        min_disk_free_percent: Some(60.0),
        driver_problem_count: Some(0),
        driver_outdated_count: Some(0),
        latency_verdict: Some("Goed".to_string()),
        latency_max_gap_us: Some(300.0),
        dpc_time_percent_max: Some(0.4),
        cpu_stress_ok: Some(true),
        ram_test_ok: Some(true),
        disk_test_ok: Some(true),
        storage_smart_warning_count: Some(0),
        storage_smart_critical_count: Some(0),
    }
}

fn cat<'a>(h: &'a HealthScore, key: &str) -> Option<&'a HealthCategoryScore> {
    h.categories.iter().find(|c| c.key == key)
}

#[test]
fn health_all_good_is_a() {
    let h = compute_health_score(all_good());
    assert_eq!(h.grade, "A", "{:?}", h);
    assert!(h.score >= 90);
    assert_eq!(h.label, "Uitstekend");
    assert!(h.top_issues.is_empty(), "{:?}", h.top_issues);
    assert!(h.categories.iter().all(|c| c.status == "Goed"));
}

#[test]
fn health_hot_freezing_problem_devices_is_low() {
    let h = compute_health_score(HealthInputs {
        max_temp_celsius: Some(95.0),
        is_throttling_suspected: true,
        watchdog_freeze_count: 4,
        event_log_culprit_count: 3,
        driver_problem_count: Some(2),
        ..all_good()
    });
    assert!(h.score <= CAP_E, "{:?}", h);
    assert!(["D", "E", "F"].contains(&h.grade.as_str()));
    assert_eq!(cat(&h, "thermal").unwrap().status, "Kritiek");
    assert_eq!(cat(&h, "drivers").unwrap().status, "Kritiek");
    assert_eq!(cat(&h, "stability").unwrap().status, "Kritiek");
    assert!(!h.top_issues.is_empty() && h.top_issues.len() <= 3);
}

#[test]
fn health_no_battery_omits_category() {
    let h = compute_health_score(HealthInputs {
        battery_health_percent: None,
        ..all_good()
    });
    assert!(cat(&h, "battery").is_none());
    let with = compute_health_score(all_good());
    assert!(cat(&with, "battery").is_some());
}

#[test]
fn health_untested_excluded_from_average() {
    // Basis met een matige categorie, zodat een "0" voor niet-getest
    // het gemiddelde zichtbaar zou omlaag trekken.
    let base = HealthInputs {
        ram_used_percent: 92.0,
        battery_health_percent: None,
        ..all_good()
    };
    let a = compute_health_score(base.clone());
    let b = compute_health_score(HealthInputs {
        cpu_stress_ok: None,
        ..base.clone()
    });
    let cpu = cat(&b, "cpu").expect("cpu blijft in de lijst");
    assert_eq!(cpu.status, "Niet getest");
    // Zonder de (perfecte) CPU-categorie is het gemiddelde iets lager,
    // maar zeker niet ingestort zoals bij een 0 met gewicht 0.07.
    let weighted_zero = {
        let tested: Vec<_> = a.categories.iter().collect();
        let s: f64 = tested
            .iter()
            .map(|c| {
                if c.key == "cpu" {
                    0.0
                } else {
                    c.score as f64 * c.weight as f64
                }
            })
            .sum();
        let w: f64 = tested.iter().map(|c| c.weight as f64).sum();
        (s / w).round() as u8
    };
    assert!(b.score > weighted_zero, "{} vs {}", b.score, weighted_zero);

    // Expliciet: score == gewogen gemiddelde van alleen de geteste categorieën.
    let (s, w) = b
        .categories
        .iter()
        .filter(|c| c.status != "Niet getest")
        .fold((0.0, 0.0), |(s, w), c| {
            (s + c.score as f64 * c.weight as f64, w + c.weight as f64)
        });
    assert_eq!(b.score, (s / w).round() as u8);
}

#[test]
fn health_only_basics_is_preliminary() {
    let h = compute_health_score(HealthInputs {
        max_temp_celsius: None,
        ram_used_percent: 40.0,
        min_disk_free_percent: Some(50.0),
        ..Default::default()
    });
    assert!(h.label.contains("voorlopig"), "{}", h.label);
    assert!(
        h.top_issues
            .iter()
            .any(|t| t.contains("nauwkeurigere score"))
    );
    assert!(h.score <= CAP_B && GRADES.contains(&h.grade.as_str()));
    assert_eq!(h.grade, "B");
    // Ook na de (automatische) freeze-scan blijft het voorlopig.
    let h2 = compute_health_score(HealthInputs {
        freeze_scanned: true,
        ram_used_percent: 40.0,
        min_disk_free_percent: Some(50.0),
        ..Default::default()
    });
    assert!(
        h2.label.contains("voorlopig") && h2.score <= CAP_B,
        "{:?}",
        h2
    );
    for key in ["stability", "drivers", "latency", "cpu", "thermal"] {
        assert_eq!(cat(&h, key).unwrap().status, "Niet getest", "{}", key);
    }
}

#[test]
fn health_caps_applied() {
    // Eén probleemapparaat, verder perfect => max D.
    let h = compute_health_score(HealthInputs {
        driver_problem_count: Some(1),
        ..all_good()
    });
    assert!(h.score <= CAP_D, "{:?}", h.score);
    assert_eq!(h.grade, "D");

    // RAM-fouten => max D.
    let h = compute_health_score(HealthInputs {
        ram_test_ok: Some(false),
        ..all_good()
    });
    assert!(h.score <= CAP_D);
    assert!(["D", "E", "F"].contains(&h.grade.as_str()));

    // 96 °C, verder perfect => max E.
    let h = compute_health_score(HealthInputs {
        max_temp_celsius: Some(96.0),
        ..all_good()
    });
    assert!(h.score <= CAP_E);
    assert!(["E", "F"].contains(&h.grade.as_str()));

    // Eén freeze => geen A/B meer.
    let h = compute_health_score(HealthInputs {
        watchdog_freeze_count: 1,
        ..all_good()
    });
    assert!(h.score <= CAP_C);
    assert_eq!(h.grade, "C");
}

#[test]
fn health_score_and_grade_always_in_range() {
    let extremes = vec![
        HealthInputs::default(),
        all_good(),
        HealthInputs {
            max_temp_celsius: Some(f32::NAN),
            ram_used_percent: f32::INFINITY,
            min_disk_free_percent: Some(-5.0),
            battery_health_percent: Some(f64::NAN),
            latency_max_gap_us: Some(f64::INFINITY),
            ..Default::default()
        },
        HealthInputs {
            max_temp_celsius: Some(150.0),
            is_throttling_suspected: true,
            freeze_scanned: true,
            watchdog_freeze_count: 1000,
            event_log_culprit_count: 1000,
            battery_health_percent: Some(0.0),
            ram_used_percent: 100.0,
            min_disk_free_percent: Some(0.0),
            driver_problem_count: Some(500),
            driver_outdated_count: Some(500),
            latency_verdict: Some("Slecht".to_string()),
            latency_max_gap_us: Some(1e9),
            dpc_time_percent_max: Some(100.0),
            cpu_stress_ok: Some(false),
            ram_test_ok: Some(false),
            disk_test_ok: Some(false),
            storage_smart_warning_count: Some(usize::MAX),
            storage_smart_critical_count: Some(usize::MAX),
        },
        HealthInputs {
            is_throttling_suspected: true,
            max_temp_celsius: None,
            latency_verdict: Some("???".to_string()),
            battery_health_percent: Some(250.0),
            ..Default::default()
        },
    ];
    for inp in extremes {
        let h = compute_health_score(inp);
        assert!(h.score <= 100);
        assert!(GRADES.contains(&h.grade.as_str()), "{}", h.grade);
        assert_eq!(h.grade, grade_for(h.score));
        assert!(h.top_issues.len() <= 3);
        for c in &h.categories {
            assert!(c.score <= 100);
            assert!(["Goed", "Let op", "Kritiek", "Niet getest"].contains(&c.status.as_str()));
        }
    }
}

#[test]
fn health_issues_ordered_by_severity() {
    let h = compute_health_score(HealthInputs {
        driver_outdated_count: Some(4), // Let op
        ram_test_ok: Some(false),       // Kritiek
        ..all_good()
    });
    assert!(h.top_issues[0].contains("RAM-test"), "{:?}", h.top_issues);
    assert!(
        h.top_issues[1].contains("verouderde driver"),
        "{:?}",
        h.top_issues
    );
}

#[test]
fn health_is_deterministic() {
    let a = compute_health_score(all_good());
    let b = compute_health_score(all_good());
    assert_eq!(a.score, b.score);
    assert_eq!(a.top_issues, b.top_issues);
}

#[test]
fn smart_critical_caps_storage_category() {
    let h = compute_health_score(HealthInputs {
        storage_smart_critical_count: Some(1),
        ..all_good()
    });
    let storage = cat(&h, "storage").unwrap();
    assert_eq!(storage.status, STATUS_CRIT);
    assert!(storage.score <= 25);
    assert!(h.top_issues.iter().any(|t| t.contains("SMART")));
}

#[test]
fn smart_warning_lowers_storage_to_warn() {
    let h = compute_health_score(HealthInputs {
        storage_smart_warning_count: Some(2),
        ..all_good()
    });
    assert_eq!(cat(&h, "storage").unwrap().status, STATUS_WARN);
}
