//! Gezondheidsscore: één totaalscore (0-100) + cijfer A-F, berekend uit data
//! die de frontend al heeft opgehaald.
//!
//! Dit is een PURE, deterministische functie: geen PowerShell, geen sysinfo,
//! geen IO. Zelfde invoer => zelfde uitvoer.
//!
//! ## Ontwerp
//!
//! De app is gericht op het vinden van oorzaken van systeemfreezes, daarom
//! wegen stabiliteit, drivers, DPC-latency en temperatuur het zwaarst:
//!
//! | categorie  | gewicht | bron                                           |
//! |------------|---------|------------------------------------------------|
//! | stability  | 0.25    | watchdog-freezes + event-log boosdoeners       |
//! | drivers    | 0.15    | probleemapparaten / verouderde drivers         |
//! | latency    | 0.15    | verdict, max timer-gat, max DPC-tijd           |
//! | thermal    | 0.15    | max temperatuur + throttling                   |
//! | memory     | 0.10    | RAM-gebruik + RAM-integriteitstest             |
//! | storage    | 0.08    | min. vrije ruimte + schijftest                 |
//! | cpu        | 0.07    | CPU-stresstest                                 |
//! | battery    | 0.05    | batterijgezondheid (alleen als er een accu is) |
//!
//! Totaal = gewogen gemiddelde over de categorieën die écht getest zijn
//! ("Niet getest" telt niet mee in het gemiddelde, maar staat wel in de lijst).
//!
//! Daarna worden harde plafonds op de SCORE toegepast (het cijfer volgt uit de
//! afgetopte score, zodat score en cijfer altijd consistent zijn):
//! - temperatuur >= 95 °C                         -> max 59 (E)
//! - probleemapparaat / RAM-fouten / schijftest mislukt / >= 3 freezes -> max 69 (D)
//! - >= 1 freeze, throttling of een categorie "Kritiek" -> max 79 (C)
//! - alleen basisgegevens (geen driver-/latency-/stresstest gedraaid) -> max 89 (B):
//!   zonder tests kan het systeem niet "Uitstekend" heten; label krijgt "(voorlopig)".
//!
//! Cijfergrenzen: A >= 90, B >= 80, C >= 70, D >= 60, E >= 50, F < 50.
//! Categoriestatus: "Goed" (>= 80), "Let op" (>= 50), "Kritiek" (< 50),
//! tenzij een specifieke bevinding een strengere status afdwingt.

use crate::models::{HealthInputs, HealthScore};

pub const STATUS_GOOD: &str = "Goed";
pub const STATUS_WARN: &str = "Let op";
pub const STATUS_CRIT: &str = "Kritiek";
pub const STATUS_UNTESTED: &str = "Niet getest";

pub const CAP_E: u8 = 59;
pub const CAP_D: u8 = 69;
pub const CAP_C: u8 = 79;
pub const CAP_B: u8 = 89;

pub fn status_from_score(score: f64) -> &'static str {
    if score >= 80.0 {
        STATUS_GOOD
    } else if score >= 50.0 {
        STATUS_WARN
    } else {
        STATUS_CRIT
    }
}

/// Strengste van twee statussen.
pub fn worst_status(a: &'static str, b: &'static str) -> &'static str {
    fn rank(s: &str) -> u8 {
        match s {
            STATUS_CRIT => 2,
            STATUS_WARN => 1,
            _ => 0,
        }
    }
    if rank(b) > rank(a) {
        b
    } else {
        a
    }
}

pub fn severity(status: &str) -> u8 {
    match status {
        STATUS_CRIT => 2,
        STATUS_WARN => 1,
        _ => 0,
    }
}

pub fn grade_for(score: u8) -> &'static str {
    match score {
        90..=100 => "A",
        80..=89 => "B",
        70..=79 => "C",
        60..=69 => "D",
        50..=59 => "E",
        _ => "F",
    }
}

pub fn label_for(grade: &str) -> &'static str {
    match grade {
        "A" => "Uitstekend",
        "B" => "Goed",
        "C" => "Redelijk",
        "D" => "Aandacht nodig",
        "E" => "Slecht",
        _ => "Kritiek",
    }
}

#[path = "health_eval.rs"]
mod health_eval;
use health_eval::*;

#[tauri::command]
pub fn compute_health_score(inputs: HealthInputs) -> HealthScore {
    let i = &inputs;

    let mut evals: Vec<Eval> = vec![
        eval_stability(i),
        eval_drivers(i),
        eval_latency(i),
        eval_thermal(i),
        eval_memory(i),
        eval_storage(i),
        eval_cpu(i),
    ];
    if let Some(h) = i.battery_health_percent {
        evals.push(eval_battery(h));
    }

    // Gewogen gemiddelde over geteste categorieën.
    let (sum, wsum) = evals
        .iter()
        .filter(|e| e.cat.status != STATUS_UNTESTED)
        .fold((0.0f64, 0.0f64), |(s, ws), e| {
            (s + e.cat.score as f64 * e.cat.weight as f64, ws + e.cat.weight as f64)
        });
    // Praktisch onbereikbaar (geheugen is altijd getest), maar nooit NaN casten.
    let mut score = if wsum > 0.0 { to_u8(sum / wsum) } else { 50 };

    // Harde plafonds voor kritieke bevindingen.
    let max_temp = finite_f32(i.max_temp_celsius);
    if max_temp.map_or(false, |t| t >= 95.0) {
        score = score.min(CAP_E);
    }
    if i.driver_problem_count.unwrap_or(0) > 0
        || i.ram_test_ok == Some(false)
        || i.disk_test_ok == Some(false)
        || (i.freeze_scanned && i.watchdog_freeze_count >= 3)
    {
        score = score.min(CAP_D);
    }
    let any_critical = evals.iter().any(|e| e.cat.status == STATUS_CRIT);
    if any_critical
        || i.is_throttling_suspected
        || (i.freeze_scanned && i.watchdog_freeze_count >= 1)
    {
        score = score.min(CAP_C);
    }

    // "Alleen basisgegevens": geen enkele door de gebruiker gestarte test gedraaid
    // (driver-scan, latency-test, stresstests). De freeze-scan telt hier niet mee,
    // omdat App.tsx die automatisch bij het opstarten uitvoert.
    let only_basics = i.driver_problem_count.is_none()
        && i.driver_outdated_count.is_none()
        && i.latency_verdict.is_none()
        && i.latency_max_gap_us.is_none()
        && i.cpu_stress_ok.is_none()
        && i.ram_test_ok.is_none()
        && i.disk_test_ok.is_none();
    if only_basics {
        score = score.min(CAP_B);
    }

    let grade = grade_for(score);

    // Top-issues: op ernst, daarna op gewicht (volgorde in `evals` is al op gewicht).
    let mut issues: Vec<(u8, f32, usize, String)> = evals
        .iter()
        .enumerate()
        .filter_map(|(idx, e)| {
            e.issue
                .as_ref()
                .map(|(sev, txt)| (*sev, e.cat.weight, idx, txt.clone()))
        })
        .collect();
    issues.sort_by(|a, b| {
        b.0.cmp(&a.0)
            .then(b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal))
            .then(a.2.cmp(&b.2))
    });
    let mut top_issues: Vec<String> = issues.into_iter().take(3).map(|x| x.3).collect();

    let untested_labels: Vec<&str> = evals
        .iter()
        .filter(|e| e.cat.status == STATUS_UNTESTED)
        .map(|e| e.cat.label.as_str())
        .collect();

    if top_issues.len() < 3 && !untested_labels.is_empty() {
        top_issues.push(format!(
            "Nog niet getest: {}. Voer deze tests uit voor een nauwkeurigere score.",
            untested_labels.join(", ")
        ));
    } else if only_basics {
        // Altijd melden, desnoods ten koste van de minst ernstige bevinding.
        top_issues.truncate(2);
        top_issues.push(
            "Score is gebaseerd op basisgegevens; voer de freeze-, driver- en latency-tests uit voor een nauwkeurigere score."
                .to_string(),
        );
    }

    let label = if only_basics {
        format!("{} (voorlopig)", label_for(grade))
    } else {
        label_for(grade).to_string()
    };

    HealthScore {
        score,
        grade: grade.to_string(),
        label,
        categories: evals.into_iter().map(|e| e.cat).collect(),
        top_issues,
    }
}

#[cfg(test)]
#[path = "health_tests.rs"]
mod tests;
