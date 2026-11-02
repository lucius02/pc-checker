use crate::models::{HealthCategoryScore, HealthInputs};
use super::{severity, status_from_score, worst_status, STATUS_CRIT, STATUS_GOOD, STATUS_UNTESTED, STATUS_WARN};

pub const W_STABILITY: f32 = 0.25;
pub const W_DRIVERS: f32 = 0.15;
pub const W_LATENCY: f32 = 0.15;
pub const W_THERMAL: f32 = 0.15;
pub const W_MEMORY: f32 = 0.10;
pub const W_STORAGE: f32 = 0.08;
pub const W_CPU: f32 = 0.07;
pub const W_BATTERY: f32 = 0.05;

/// Interne evaluatie van één categorie (score + optionele bevinding).
pub struct Eval {
    pub cat: HealthCategoryScore,
    /// (ernst 1 = let op, 2 = kritiek, tekst)
    pub issue: Option<(u8, String)>,
}

/// Lineaire interpolatie van y0 (bij x0) naar y1 (bij x1), x afgekapt op [x0, x1].
pub fn lerp(x: f64, x0: f64, x1: f64, y0: f64, y1: f64) -> f64 {
    let t = ((x - x0) / (x1 - x0)).clamp(0.0, 1.0);
    y0 + (y1 - y0) * t
}

pub fn to_u8(score: f64) -> u8 {
    if !score.is_finite() {
        return 0;
    }
    score.round().clamp(0.0, 100.0) as u8
}

pub fn finite_f32(v: Option<f32>) -> Option<f64> {
    v.map(|x| x as f64).filter(|x| x.is_finite())
}

pub fn finite_f64(v: Option<f64>) -> Option<f64> {
    v.filter(|x| x.is_finite())
}

pub fn untested(key: &str, label: &str, weight: f32, detail: &str) -> Eval {
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

pub fn tested(
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

/// Temperatuur: <= 70 °C = 100, 80 °C = 85, 90 °C = 60, 95 °C = 35, 105 °C = 10.
pub fn eval_thermal(i: &HealthInputs) -> Eval {
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
pub fn eval_stability(i: &HealthInputs) -> Eval {
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
pub fn eval_drivers(i: &HealthInputs) -> Eval {
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
pub fn eval_latency(i: &HealthInputs) -> Eval {
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
pub fn eval_storage(i: &HealthInputs) -> Eval {
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

/// Geheugen: gebruik in banden.
pub fn eval_memory(i: &HealthInputs) -> Eval {
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

/// Batterij: alleen als er een accu is.
pub fn eval_battery(health: f64) -> Eval {
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

/// CPU: stresstest evaluatie.
pub fn eval_cpu(i: &HealthInputs) -> Eval {
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
