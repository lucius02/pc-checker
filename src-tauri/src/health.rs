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

use crate::models::{HealthCategoryScore, HealthInputs, HealthScore};

const W_STABILITY: f32 = 0.25;
const W_DRIVERS: f32 = 0.15;
const W_LATENCY: f32 = 0.15;
const W_THERMAL: f32 = 0.15;
const W_MEMORY: f32 = 0.10;
const W_STORAGE: f32 = 0.08;
const W_CPU: f32 = 0.07;
const W_BATTERY: f32 = 0.05;

const CAP_E: u8 = 59;
const CAP_D: u8 = 69;
const CAP_C: u8 = 79;
const CAP_B: u8 = 89;

const STATUS_GOOD: &str = "Goed";
const STATUS_WARN: &str = "Let op";
const STATUS_CRIT: &str = "Kritiek";
const STATUS_UNTESTED: &str = "Niet getest";

/// Interne evaluatie van één categorie (score + optionele bevinding).
struct Eval {
    cat: HealthCategoryScore,
    /// (ernst 1 = let op, 2 = kritiek, tekst)
    issue: Option<(u8, String)>,
}

fn status_from_score(score: f64) -> &'static str {
    if score >= 80.0 {
        STATUS_GOOD
    } else if score >= 50.0 {
        STATUS_WARN
    } else {
        STATUS_CRIT
    }
}

/// Strengste van twee statussen.
fn worst_status(a: &'static str, b: &'static str) -> &'static str {
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

fn severity(status: &str) -> u8 {
    match status {
        STATUS_CRIT => 2,
        STATUS_WARN => 1,
        _ => 0,
    }
}

/// Lineaire interpolatie van y0 (bij x0) naar y1 (bij x1), x afgekapt op [x0, x1].
fn lerp(x: f64, x0: f64, x1: f64, y0: f64, y1: f64) -> f64 {
    let t = ((x - x0) / (x1 - x0)).clamp(0.0, 1.0);
    y0 + (y1 - y0) * t
}

fn to_u8(score: f64) -> u8 {
    if !score.is_finite() {
        return 0;
    }
    score.round().clamp(0.0, 100.0) as u8
}

fn finite_f32(v: Option<f32>) -> Option<f64> {
    v.map(|x| x as f64).filter(|x| x.is_finite())
}

fn finite_f64(v: Option<f64>) -> Option<f64> {
    v.filter(|x| x.is_finite())
}

fn untested(key: &str, label: &str, weight: f32, detail: &str) -> Eval {
    Eval {
        cat: HealthCategoryScore {
            key: key.to_string(),
            label: label.to_string(),
            score: 0,
            weight,
            status: STATUS_UNTESTED.to_string(),
            detail: detail.to_string(),
        },
        issue: None,
    }
}

fn tested(
    key: &str,
    label: &str,
    weight: f32,
    score: f64,
    status: &'static str,
    detail: String,
    issue: Option<String>,
) -> Eval {
    let sev = severity(status);
    Eval {
        cat: HealthCategoryScore {
            key: key.to_string(),
            label: label.to_string(),
            score: to_u8(score),
            weight,
            status: status.to_string(),
            detail,
        },
        issue: if sev > 0 { issue.map(|t| (sev, t)) } else { None },
    }
}

// ---------------------------------------------------------------------------
// Categorieën
// ---------------------------------------------------------------------------

/// Temperatuur: <= 70 °C = 100, 80 °C = 85, 90 °C = 60, 95 °C = 35, 105 °C = 10.
/// `is_throttling_suspected` wordt in cooling.rs al bij >= 90 °C gezet, dus dat
/// overlapt met max_temp: geen dubbele straf, alleen een plafond van 55.
fn eval_thermal(i: &HealthInputs) -> Eval {
    let (key, label, w) = ("thermal", "Temperatuur & Koeling", W_THERMAL);
    let temp = finite_f32(i.max_temp_celsius);
    if temp.is_none() && !i.is_throttling_suspected {
        return untested(key, label, w, "Geen temperatuursensor uitgelezen.");
    }

    let mut score = match temp {
        Some(t) if t <= 70.0 => 100.0,
        Some(t) if t <= 80.0 => lerp(t, 70.0, 80.0, 100.0, 85.0),
        Some(t) if t <= 90.0 => lerp(t, 80.0, 90.0, 85.0, 60.0),
        Some(t) if t <= 95.0 => lerp(t, 90.0, 95.0, 60.0, 35.0),
        Some(t) => lerp(t, 95.0, 105.0, 35.0, 10.0),
        None => 55.0,
    };
    if i.is_throttling_suspected {
        score = score.min(55.0);
    }
    let status = status_from_score(score);

    let temp_txt = temp
        .map(|t| format!("Max {:.0} °C", t))
        .unwrap_or_else(|| "Temperatuur onbekend".to_string());
    let detail = if i.is_throttling_suspected {
        format!("{} — thermal throttling vermoed.", temp_txt)
    } else {
        format!("{}.", temp_txt)
    };

    let issue = match temp {
        Some(t) if t >= 95.0 => Some(format!(
            "De processor bereikt {:.0} °C: dit is kritiek heet en kan freezes of noodstops veroorzaken. Controleer koeling, ventilatoren en koelpasta.",
            t
        )),
        Some(t) if i.is_throttling_suspected => Some(format!(
            "Thermal throttling vermoed ({:.0} °C): de CPU klokt terug door hitte, wat haperingen kan geven.",
            t
        )),
        None if i.is_throttling_suspected => Some(
            "Thermal throttling vermoed: de CPU klokt terug door hitte, wat haperingen kan geven."
                .to_string(),
        ),
        Some(t) => Some(format!(
            "De temperatuur loopt op tot {:.0} °C; zorg voor betere luchtstroom of reinig de ventilatoren.",
            t
        )),
        None => None,
    };
    tested(key, label, w, score, status, detail, issue)
}

/// Stabiliteit: -15 per watchdog-freeze (max -60), -6 per event-log boosdoener
/// (max -36), minimum 5. Elke freeze dwingt minstens "Let op" af.
fn eval_stability(i: &HealthInputs) -> Eval {
    let (key, label, w) = ("stability", "Stabiliteit & Freezes", W_STABILITY);
    if !i.freeze_scanned {
        return untested(key, label, w, "Freeze-diagnose nog niet uitgevoerd.");
    }
    let fz = i.watchdog_freeze_count;
    let ev = i.event_log_culprit_count;
    let penalty_f = (fz as f64 * 15.0).min(60.0);
    let penalty_e = (ev as f64 * 6.0).min(36.0);
    let score = (100.0 - penalty_f - penalty_e).max(5.0);

    let mut status = status_from_score(score);
    if fz > 0 || ev > 0 {
        status = worst_status(status, STATUS_WARN);
    }
    if fz >= 3 {
        status = STATUS_CRIT;
    }

    let detail = if fz == 0 && ev == 0 {
        "Geen freezes of kritieke events gevonden.".to_string()
    } else {
        format!("{} freeze(s) gemeten, {} verdachte event(s) in het logboek.", fz, ev)
    };

    let issue = if fz > 0 && ev > 0 {
        Some(format!(
            "Er zijn {} freeze(s) gemeten en {} verdachte Windows-event(s) gevonden; bekijk de Freeze Detective voor de waarschijnlijke oorzaak.",
            fz, ev
        ))
    } else if fz > 0 {
        Some(format!(
            "De watchdog heeft {} freeze(s) van meer dan 1 seconde geregistreerd.",
            fz
        ))
    } else if ev > 0 {
        Some(format!(
            "{} verdachte event(s) (driver-/opslag-time-outs) in het Windows-logboek gevonden.",
            ev
        ))
    } else {
        None
    };
    tested(key, label, w, score, status, detail, issue)
}

/// Drivers: -25 per probleemapparaat (max -75), -3 per verouderde driver (max -24).
/// Een probleemapparaat is altijd "Kritiek"; >= 3 verouderd is minstens "Let op".
fn eval_drivers(i: &HealthInputs) -> Eval {
    let (key, label, w) = ("drivers", "Drivers", W_DRIVERS);
    if i.driver_problem_count.is_none() && i.driver_outdated_count.is_none() {
        return untested(key, label, w, "Driver-scan nog niet uitgevoerd.");
    }
    let p = i.driver_problem_count.unwrap_or(0);
    let o = i.driver_outdated_count.unwrap_or(0);
    let score = (100.0 - (p as f64 * 25.0).min(75.0) - (o as f64 * 3.0).min(24.0)).max(0.0);

    let status = if p > 0 {
        STATUS_CRIT
    } else if o >= 3 {
        worst_status(status_from_score(score), STATUS_WARN)
    } else {
        status_from_score(score)
    };

    let detail = if p == 0 && o == 0 {
        "Geen probleemapparaten of verouderde drivers.".to_string()
    } else {
        format!("{} probleemapparaat/-apparaten, {} verouderde driver(s).", p, o)
    };

    let issue = if p > 0 {
        Some(format!(
            "{} apparaat/apparaten met een driverprobleem in Apparaatbeheer; dit is een veelvoorkomende oorzaak van freezes.",
            p
        ))
    } else if o > 0 {
        Some(format!(
            "{} verouderde driver(s) gevonden; werk vooral chipset-, opslag-, netwerk- en GPU-drivers bij.",
            o
        ))
    } else {
        None
    };
    tested(key, label, w, score, status, detail, issue)
}

/// DPC-latency: score = minimum van de beschikbare deelscores.
/// - verdict: Goed 100, Matig 65, Slecht 30 (onbekend 70)
/// - max timer-gat: < 500 µs 100, < 1 ms 90, < 2 ms 75, < 4 ms 55, < 10 ms 35, anders 20
/// - max DPC-tijd: < 1 % 100, < 3 % 90, < 5 % 75, < 10 % 55, anders 35
fn eval_latency(i: &HealthInputs) -> Eval {
    let (key, label, w) = ("latency", "DPC Latency", W_LATENCY);
    let verdict = i.latency_verdict.as_deref().map(str::trim).filter(|v| !v.is_empty());
    let gap = finite_f64(i.latency_max_gap_us);
    let dpc = finite_f64(i.dpc_time_percent_max);
    if verdict.is_none() && gap.is_none() {
        return untested(key, label, w, "Latency-test nog niet uitgevoerd.");
    }

    let mut score: f64 = 100.0;
    if let Some(v) = verdict {
        score = score.min(match v {
            "Goed" => 100.0,
            "Matig" => 65.0,
            "Slecht" => 30.0,
            _ => 70.0,
        });
    }
    if let Some(g) = gap {
        score = score.min(if g < 500.0 {
            100.0
        } else if g < 1_000.0 {
            90.0
        } else if g < 2_000.0 {
            75.0
        } else if g < 4_000.0 {
            55.0
        } else if g < 10_000.0 {
            35.0
        } else {
            20.0
        });
    }
    if let Some(d) = dpc {
        score = score.min(if d < 1.0 {
            100.0
        } else if d < 3.0 {
            90.0
        } else if d < 5.0 {
            75.0
        } else if d < 10.0 {
            55.0
        } else {
            35.0
        });
    }
    let status = status_from_score(score);

    let mut parts: Vec<String> = Vec::new();
    if let Some(v) = verdict {
        parts.push(format!("Oordeel: {}", v));
    }
    if let Some(g) = gap {
        parts.push(format!("max gat {:.1} ms", g / 1000.0));
    }
    if let Some(d) = dpc {
        parts.push(format!("DPC max {:.1}%", d));
    }
    let detail = format!("{}.", parts.join(", "));

    let gap_txt = gap
        .map(|g| format!(" (max {:.1} ms vertraging)", g / 1000.0))
        .unwrap_or_default();
    let issue = Some(if status == STATUS_CRIT {
        format!(
            "Hoge DPC-latency{}: een driver blokkeert de CPU, wat stotteren, audio-tikken en korte freezes veroorzaakt.",
            gap_txt
        )
    } else {
        format!(
            "Verhoogde DPC-latency{}; controleer netwerk-, audio- en GPU-drivers.",
            gap_txt
        )
    });
    tested(key, label, w, score, status, detail, issue)
}

/// Opslag: >= 20 % vrij = 100, 10 % = 70, 5 % = 40, 0 % = 15.
/// Mislukte schijftest => max 35 en "Kritiek".
fn eval_storage(i: &HealthInputs) -> Eval {
    let (key, label, w) = ("storage", "Opslag", W_STORAGE);
    let free = finite_f32(i.min_disk_free_percent).map(|f| f.clamp(0.0, 100.0));
    if free.is_none() && i.disk_test_ok.is_none() {
        return untested(key, label, w, "Geen schijfgegevens beschikbaar.");
    }

    let mut score = match free {
        Some(f) if f >= 20.0 => 100.0,
        Some(f) if f >= 10.0 => lerp(f, 10.0, 20.0, 70.0, 100.0),
        Some(f) if f >= 5.0 => lerp(f, 5.0, 10.0, 40.0, 70.0),
        Some(f) => lerp(f, 0.0, 5.0, 15.0, 40.0),
        None => 100.0,
    };
    let disk_failed = i.disk_test_ok == Some(false);
    if disk_failed {
        score = score.min(35.0);
    }
    let status = if disk_failed {
        STATUS_CRIT
    } else {
        status_from_score(score)
    };

    let mut parts: Vec<String> = Vec::new();
    if let Some(f) = free {
        parts.push(format!("Minst vrije schijf: {:.0}% vrij", f));
    }
    match i.disk_test_ok {
        Some(true) => parts.push("schijftest geslaagd".to_string()),
        Some(false) => parts.push("schijftest mislukt".to_string()),
        None => parts.push("schijftest niet uitgevoerd".to_string()),
    }
    let detail = format!("{}.", parts.join(", "));

    let issue = if disk_failed {
        Some(
            "De schijftest is mislukt (schrijf-/leesfout of verificatiefout); controleer de schijf met CrystalDiskInfo en maak een back-up."
                .to_string(),
        )
    } else {
        free.map(|f| {
            format!(
                "Een schijf heeft nog maar {:.0}% vrije ruimte; weinig ruimte vertraagt Windows en de paginabestand-swap.",
                f
            )
        })
    };
    tested(key, label, w, score, status, detail, issue)
}

/// Geheugen: gebruik in banden (geen flikkeren bij 1 % verschil):
/// < 80 % = 100, < 90 % = 85, < 95 % = 65, anders 45.
/// RAM-integriteitstest met bitfouten => 15 en "Kritiek".
fn eval_memory(i: &HealthInputs) -> Eval {
    let (key, label, w) = ("memory", "Geheugen", W_MEMORY);
    let used = (i.ram_used_percent as f64).clamp(0.0, 100.0);
    let used = if used.is_finite() { used } else { 0.0 };

    let ram_failed = i.ram_test_ok == Some(false);
    let mut score: f64 = if used < 80.0 {
        100.0
    } else if used < 90.0 {
        85.0
    } else if used < 95.0 {
        65.0
    } else {
        45.0
    };
    if ram_failed {
        score = 15.0;
    }
    let status = if ram_failed {
        STATUS_CRIT
    } else {
        status_from_score(score)
    };

    let test_txt = match i.ram_test_ok {
        Some(true) => "integriteitstest geslaagd",
        Some(false) => "integriteitstest: FOUTEN gevonden",
        None => "integriteitstest niet uitgevoerd",
    };
    let detail = format!("{:.0}% in gebruik, {}.", used, test_txt);

    let issue = if ram_failed {
        Some(
            "De RAM-test heeft geheugenfouten (bitflips) gevonden: defect of instabiel geheugen veroorzaakt freezes en crashes. Zet XMP/EXPO uit en test de modules apart."
                .to_string(),
        )
    } else {
        Some(format!(
            "Het werkgeheugen is {:.0}% vol; bij een vol geheugen gaat Windows swappen, wat haperingen geeft.",
            used
        ))
    };
    tested(key, label, w, score, status, detail, issue)
}

/// Batterij: alleen als er een accu is (anders wordt de categorie weggelaten).
/// Gezondheid >= 80 % => 85-100, 60-80 % => 55-85, < 60 % => 0,9 × gezondheid.
fn eval_battery(health: f64) -> Eval {
    let (key, label, w) = ("battery", "Batterij", W_BATTERY);
    let h = if health.is_finite() {
        health.clamp(0.0, 100.0)
    } else {
        0.0
    };
    let score = if h >= 80.0 {
        lerp(h, 80.0, 100.0, 85.0, 100.0)
    } else if h >= 60.0 {
        lerp(h, 60.0, 80.0, 55.0, 85.0)
    } else {
        h * 0.9
    };
    let status = if h >= 80.0 {
        STATUS_GOOD
    } else if h >= 60.0 {
        STATUS_WARN
    } else {
        STATUS_CRIT
    };
    let detail = format!("Batterijgezondheid {:.0}% van de oorspronkelijke capaciteit.", h);
    let issue = Some(format!(
        "De batterij heeft nog {:.0}% van zijn oorspronkelijke capaciteit; overweeg vervanging.",
        h
    ));
    tested(key, label, w, score, status, detail, issue)
}

/// CPU: stresstest geslaagd = 100. `success == false` betekent in stress.rs dat
/// de test niet kon starten (threadpool), geen rekenfout => 45, "Kritiek", maar
/// zonder extra hard plafond.
fn eval_cpu(i: &HealthInputs) -> Eval {
    let (key, label, w) = ("cpu", "Processor", W_CPU);
    match i.cpu_stress_ok {
        None => untested(key, label, w, "CPU-stresstest nog niet uitgevoerd."),
        Some(true) => tested(
            key,
            label,
            w,
            100.0,
            STATUS_GOOD,
            "Stresstest zonder fouten voltooid.".to_string(),
            None,
        ),
        Some(false) => tested(
            key,
            label,
            w,
            45.0,
            STATUS_CRIT,
            "Stresstest kon niet voltooien.".to_string(),
            Some(
                "De CPU-stresstest kon niet voltooien; herhaal de test en controleer bij herhaling stabiliteit en overklok-instellingen."
                    .to_string(),
            ),
        ),
    }
}

fn grade_for(score: u8) -> &'static str {
    match score {
        90..=100 => "A",
        80..=89 => "B",
        70..=79 => "C",
        60..=69 => "D",
        50..=59 => "E",
        _ => "F",
    }
}

fn label_for(grade: &str) -> &'static str {
    match grade {
        "A" => "Uitstekend",
        "B" => "Goed",
        "C" => "Redelijk",
        "D" => "Aandacht nodig",
        "E" => "Slecht",
        _ => "Kritiek",
    }
}

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
mod tests {
    use super::*;

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
                .map(|c| if c.key == "cpu" { 0.0 } else { c.score as f64 * c.weight as f64 })
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
        assert!(h.top_issues.iter().any(|t| t.contains("nauwkeurigere score")));
        assert!(h.score <= CAP_B && GRADES.contains(&h.grade.as_str()));
        assert_eq!(h.grade, "B");
        // Ook na de (automatische) freeze-scan blijft het voorlopig.
        let h2 = compute_health_score(HealthInputs {
            freeze_scanned: true,
            ram_used_percent: 40.0,
            min_disk_free_percent: Some(50.0),
            ..Default::default()
        });
        assert!(h2.label.contains("voorlopig") && h2.score <= CAP_B, "{:?}", h2);
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
        assert!(h.top_issues[1].contains("verouderde driver"), "{:?}", h.top_issues);
    }

    #[test]
    fn health_is_deterministic() {
        let a = compute_health_score(all_good());
        let b = compute_health_score(all_good());
        assert_eq!(a.score, b.score);
        assert_eq!(a.top_issues, b.top_issues);
    }
}
