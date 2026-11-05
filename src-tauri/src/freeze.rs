use std::time::{Duration, Instant};

use crate::models::{FreezeDiagnosticReport, FreezeEventEntry};
use crate::shell::{json_items, run_ps_json};
use crate::watchdog::{ensure_watchdog_started, get_watchdog_alerts};

/// Systeem- en toepassingslogboek van de afgelopen 180 dagen, alleen bronnen die met freezes en
/// crashes te maken hebben. Ruisende bronnen worden al in PowerShell op event-ID gefilterd.
const PS_EVENT_SCRIPT: &str = r#"$since = (Get-Date).AddDays(-180)
# A: bronnen waarvan elke fout/waarschuwing relevant is.
$errProviders = @('storahci','stornvme','nvme','iaStorA','iaStorAC','iaStorAVC','disk','Ntfs','Display','nvlddmkm','amdkmdag','amdwddmg','Microsoft-Windows-WHEA-Logger')
$a = @(Get-WinEvent -FilterHashtable @{LogName='System'; ProviderName=$errProviders; Level=1,2,3; StartTime=$since} -MaxEvents 1000)
# B: drukke bronnen, alleen bepaalde event-ID's. Windows filtert hier zelf op ID, zodat duizenden
# routine-events (bijv. Kernel-Power 566/507) de limiet niet opsouperen.
$idProviders = @('Microsoft-Windows-Kernel-Power','EventLog','BugCheck','Microsoft-Windows-WER-SystemErrorReporting','Service Control Manager','Microsoft-Windows-Resource-Exhaustion-Detector','Microsoft-Windows-Kernel-Processor-Power')
$b = @(Get-WinEvent -FilterHashtable @{LogName='System'; ProviderName=$idProviders; Id=41,6008,1001,7009,7011,7022,7031,7034,2004,37; StartTime=$since} -MaxEvents 1000)
$sys = @($a + $b)
$app = @(Get-WinEvent -FilterHashtable @{LogName='Application'; ProviderName=@('Application Hang','Windows Error Reporting'); StartTime=$since} -MaxEvents 500 | Where-Object { $_.ProviderName -eq 'Application Hang' -or ($_.Message -match 'LiveKernelEvent' -and $_.Message -match 'P1:\s*(141|117)\b') })
@($sys + $app) | Select-Object @{n='TimeCreated';e={$_.TimeCreated.ToString('yyyy-MM-dd HH:mm:ss')}}, ProviderName, Id, LevelDisplayName, @{n='Message';e={ $m = [string]$_.Message; if ($m.Length -gt 800) { $m.Substring(0,800) } else { $m } }} | ConvertTo-Json -Compress -Depth 3"#;

/// Eén ruw event uit het logboek, vóór groeperen.
#[derive(Clone, Debug)]
pub struct RawEvent {
    pub timestamp: String,
    pub provider: String,
    pub id: u32,
    pub level: String,
    pub message: String,
}

/// Groepeert events per (bron, ID), koppelt kennis en sorteert op ernst en recentheid.
/// Events zonder relevante kennis worden overgeslagen.
/// `recent_since`: tijdstip ("yyyy-MM-dd HH:mm:ss") vanaf wanneer een event als recent telt.
pub fn group_events(mut events: Vec<RawEvent>, recent_since: &str) -> Vec<FreezeEventEntry> {
    // Nieuwste eerst (yyyy-MM-dd HH:mm:ss sorteert als tekst).
    events.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    let mut groups: Vec<FreezeEventEntry> = Vec::new();
    for e in events {
        if let Some(g) = groups
            .iter_mut()
            .find(|g| g.provider.eq_ignore_ascii_case(&e.provider) && g.event_id == e.id)
        {
            g.count += 1;
            g.first_seen = e.timestamp.clone();
            continue;
        }
        let Some(k) = crate::freeze_advice::lookup(&e.provider, e.id, &e.message) else {
            continue;
        };
        groups.push(FreezeEventEntry {
            timestamp: e.timestamp.clone(),
            first_seen: e.timestamp,
            provider: e.provider,
            event_id: e.id,
            level: e.level,
            message: e.message,
            category: k.category,
            suggestion: k.advice.flatten(),
            count: 1,
            severity: k.severity.to_string(),
            is_recent: false,
            advice: k.advice,
        });
    }
    for g in &mut groups {
        g.is_recent = g.timestamp.as_str() >= recent_since;
    }
    // Recente problemen eerst, daarna op ernst en tijd.
    groups.sort_by(|a, b| {
        b.is_recent
            .cmp(&a.is_recent)
            .then(
                crate::freeze_advice::severity_rank(&b.severity)
                    .cmp(&crate::freeze_advice::severity_rank(&a.severity)),
            )
            .then(b.timestamp.cmp(&a.timestamp))
    });
    groups
}

/// Risico: "Hoog" bij live freezes of kritieke/hoge events, "Middel" bij alleen middelzware
/// events of veel scheduling-jitter, anders "Laag".
pub fn freeze_risk(
    groups: &[FreezeEventEntry],
    watchdog_freezes: usize,
    max_jitter_ms: f64,
) -> &'static str {
    // Oudere events (> 30 dagen) tellen hooguit als "Middel".
    let worst = groups
        .iter()
        .map(|g| {
            let r = crate::freeze_advice::severity_rank(&g.severity);
            if g.is_recent { r } else { r.min(1) }
        })
        .max()
        .unwrap_or(0);
    if watchdog_freezes > 0 || worst >= 2 {
        "Hoog"
    } else if worst == 1 || max_jitter_ms > 200.0 {
        "Middel"
    } else {
        "Laag"
    }
}

/// Linux: herkent relevante kernel-foutregels (`journalctl -k -o short-iso`).
pub fn classify_linux_kernel_line(line: &str) -> Option<FreezeEventEntry> {
    let lower = line.to_lowercase();
    let provider = if lower.contains("nvme")
        || (lower.contains(" ata") || lower.contains(":ata"))
            && (lower.contains("reset") || lower.contains("failed"))
        || lower.contains("i/o error")
        || lower.contains("blk_update_request")
    {
        "disk"
    } else if lower.contains("amdgpu")
        || lower.contains("nvrm")
        || lower.contains("nouveau")
        || lower.contains("i915")
        || lower.contains("gpu hang")
        || lower.contains("ring timeout")
    {
        "Display"
    } else if lower.contains("mce")
        || lower.contains("machine check")
        || lower.contains("aer:")
        || lower.contains("hardware error")
    {
        "WHEA"
    } else {
        return None;
    };
    // Formaat: "2026-11-05T10:12:13+0100 host kernel: bericht"
    let timestamp = line
        .split_whitespace()
        .next()
        .unwrap_or(crate::tr!("Onlangs", "Recently"))
        .replace('T', " ");
    let message = line
        .split_once("kernel:")
        .map(|(_, m)| m.trim())
        .unwrap_or(line)
        .to_string();
    let k = crate::freeze_advice::lookup(provider, 0, &message)?;
    let ts: String = timestamp.chars().take(19).collect();
    Some(FreezeEventEntry {
        timestamp: ts.clone(),
        first_seen: ts,
        provider: format!("kernel ({})", provider),
        event_id: 0,
        level: "Fout".to_string(),
        message,
        category: k.category,
        suggestion: k.advice.flatten(),
        count: 1,
        severity: k.severity.to_string(),
        is_recent: true,
        advice: k.advice,
    })
}

/// Voert de Freeze Detective diagnose uit om eventuele freezes of driver crashes op te sporen.
pub fn scan_freeze_diagnostic() -> FreezeDiagnosticReport {
    ensure_watchdog_started();

    let watchdog_freezes = get_watchdog_alerts();

    // 1. Meet actuele thread scheduling jitter door middel van micro-slaap intervallen
    let mut max_jitter_ms: f64 = 0.0;
    for _ in 0..50 {
        let t0 = Instant::now();
        std::thread::sleep(Duration::from_millis(10));
        let delta = t0.elapsed().as_secs_f64() * 1000.0 - 10.0;
        if delta > max_jitter_ms {
            max_jitter_ms = delta;
        }
    }

    let mut culprits: Vec<FreezeEventEntry> = Vec::new();

    // 2. Windows: systeem- en toepassingslogboek via PowerShell (verborgen venster, time-out).
    if cfg!(windows)
        && let Some(parsed) = run_ps_json(PS_EVENT_SCRIPT)
    {
        let raw: Vec<RawEvent> = json_items(&parsed)
            .iter()
            .map(|it| RawEvent {
                timestamp: it["TimeCreated"].as_str().unwrap_or("").to_string(),
                provider: it["ProviderName"].as_str().unwrap_or("").to_string(),
                id: it["Id"].as_u64().unwrap_or(0) as u32,
                level: it["LevelDisplayName"].as_str().unwrap_or("").to_string(),
                message: it["Message"].as_str().unwrap_or("").trim().to_string(),
            })
            .collect();
        let recent_since = (chrono::Local::now() - chrono::Duration::days(30))
            .format("%Y-%m-%d %H:%M:%S")
            .to_string();
        culprits = group_events(raw, &recent_since);
    }

    // 2b. Linux: kernel-log (journalctl) op opslag-, GPU- en hardwarefouten.
    #[cfg(target_os = "linux")]
    if let Ok(out) = crate::shell::hidden_command("journalctl")
        .args([
            "-k",
            "-p",
            "3",
            "-n",
            "200",
            "--no-pager",
            "-o",
            "short-iso",
        ])
        .output()
    {
        let text = String::from_utf8_lossy(&out.stdout);
        culprits.extend(text.lines().filter_map(classify_linux_kernel_line).take(30));
    }

    let risk = freeze_risk(&culprits, watchdog_freezes.len(), max_jitter_ms).to_string();
    let mut actions: Vec<String> = Vec::new();
    if !culprits.is_empty() {
        actions.push(crate::tr!(
            "Werk de stappen per gebeurtenis hieronder af, te beginnen bij de bovenste (ernstigste).",
            "Work through the steps for each event below, starting at the top (most severe)."
        ).to_string());
        actions.extend(
            culprits
                .iter()
                .take(5)
                .map(|c| format!("{}: {}", c.category, c.advice.title)),
        );
    } else if !watchdog_freezes.is_empty() {
        actions.push(crate::tr!(
            "De Watchdog zag freezes, maar het logboek noemt geen oorzaak. Kijk in het tabblad Processen welke programma's vlak ervoor actief waren en draai de DPC-latency-meting.",
            "The Watchdog saw freezes, but the event log names no cause. Check the Processes tab for programs that were busy just before, and run the DPC latency measurement."
        ).to_string());
    } else if max_jitter_ms > 200.0 {
        actions.push(crate::tr!("Er zijn micro-hickups gedetecteerd in de thread scheduling. Sluit achtergrondprogramma's af.", "Micro-hiccups were detected in thread scheduling. Close background programs.").to_string());
        actions.push(
            crate::tr!(
                "Controleer audio- en netwerkstuurprogramma's met LatencyMon.",
                "Check audio and network drivers with the DPC Latency tab (per-driver measurement)."
            )
            .to_string(),
        );
    } else {
        actions.push(crate::tr!("Op dit specifieke moment vertoont het systeem stabiele lage latency en geen actieve driver timeouts.", "At this moment the system shows stable, low latency and no active driver timeouts.").to_string());
        actions.push(crate::tr!("Laat deze Freeze Detective actief draaien tijdens je normale werk; zodra de freeze optreedt, zal de Watchdog het exact loggen.", "Keep the Freeze Detective running during your normal work; when the freeze happens, the Watchdog will log it exactly.").to_string());
    }

    let total: u32 = culprits.iter().map(|c| c.count).sum();
    let diagnosis_summary = if !culprits.is_empty() {
        crate::tr!(
            format!(
                "Gevonden in de afgelopen 180 dagen: {} soort(en) probleem ({} gebeurtenis(sen) in totaal) die met freezes of crashes te maken hebben; {} daarvan in de laatste 30 dagen.",
                culprits.len(),
                total,
                culprits.iter().filter(|c| c.is_recent).count()
            ),
            format!(
                "Found in the last 180 days: {} kind(s) of problem ({} event(s) in total) related to freezes or crashes; {} of them in the last 30 days.",
                culprits.len(),
                total,
                culprits.iter().filter(|c| c.is_recent).count()
            )
        )
    } else if !watchdog_freezes.is_empty() {
        crate::tr!(
            format!(
                "Watchdog heeft {} freeze-incident(en) van meer dan 1 seconde live geregistreerd!",
                watchdog_freezes.len()
            ),
            format!(
                "The Watchdog recorded {} freeze incident(s) longer than 1 second live!",
                watchdog_freezes.len()
            )
        )
    } else {
        crate::tr!("Geen directe freeze-events aangetroffen in recente logs. Watchdog blijft live monitoren.", "No direct freeze events found in recent logs. The Watchdog keeps monitoring live.")
            .to_string()
    };

    FreezeDiagnosticReport {
        watchdog_freezes_detected: watchdog_freezes,
        event_log_culprits: culprits,
        max_scheduling_jitter_ms: max_jitter_ms,
        system_freeze_risk: risk,
        diagnosis_summary,
        recommended_actions: actions,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn raw(ts: &str, provider: &str, id: u32) -> RawEvent {
        RawEvent {
            timestamp: ts.into(),
            provider: provider.into(),
            id,
            level: "Fout".into(),
            message: String::new(),
        }
    }

    #[test]
    fn events_are_grouped_counted_and_sorted_by_severity() {
        let g = crate::i18n::with_language(false, || {
            group_events(
                vec![
                    raw("2026-05-01 10:00:00", "Microsoft-Windows-WHEA-Logger", 17),
                    raw("2026-05-18 08:52:22", "Microsoft-Windows-WHEA-Logger", 1),
                    raw("2026-05-03 10:00:00", "Microsoft-Windows-WHEA-Logger", 17),
                    raw("2026-05-02 10:00:00", "Microsoft-Windows-WHEA-Logger", 17),
                    raw("2026-05-04 10:00:00", "Service Control Manager", 7000),
                ],
                "2026-01-01 00:00:00",
            )
        });
        // 7000 is ruis en valt weg; WHEA 1 (kritiek) staat bovenaan.
        assert_eq!(g.len(), 2);
        assert_eq!(g[0].event_id, 1);
        assert_eq!(g[0].severity, "Kritiek");
        assert!(g[0].is_recent);
        assert_eq!(g[1].event_id, 17);
        assert_eq!(g[1].count, 3);
        assert_eq!(g[1].timestamp, "2026-05-03 10:00:00");
        assert_eq!(g[1].first_seen, "2026-05-01 10:00:00");
        assert!(!g[1].advice.steps.is_empty());
        assert!(g[1].suggestion.contains("1. "));
    }

    #[test]
    fn risk_follows_worst_severity() {
        let g = |p: &str, id: u32| {
            group_events(
                vec![raw("2026-05-01 10:00:00", p, id)],
                "2026-04-01 00:00:00",
            )
        };
        let old = |p: &str, id: u32| {
            group_events(
                vec![raw("2026-05-01 10:00:00", p, id)],
                "2026-10-01 00:00:00",
            )
        };
        // Een oude kritieke fout (> 30 dagen) telt hooguit als "Middel".
        assert!(!old("Microsoft-Windows-WHEA-Logger", 1)[0].is_recent);
        assert_eq!(
            freeze_risk(&old("Microsoft-Windows-WHEA-Logger", 1), 0, 0.0),
            "Middel"
        );
        assert_eq!(
            freeze_risk(&g("Microsoft-Windows-WHEA-Logger", 1), 0, 0.0),
            "Hoog"
        );
        assert_eq!(freeze_risk(&g("Application Hang", 1002), 0, 0.0), "Middel");
        assert_eq!(freeze_risk(&[], 0, 0.0), "Laag");
        assert_eq!(freeze_risk(&[], 2, 0.0), "Hoog");
        assert_eq!(freeze_risk(&[], 0, 350.0), "Middel");
    }

    #[test]
    fn linux_kernel_lines_are_classified() {
        let e = classify_linux_kernel_line("2026-11-05T10:12:13+0100 box kernel: nvme nvme0: I/O 12 QID 3 timeout, reset controller").unwrap();
        assert!(e.category.contains("Opslag"));
        assert_eq!(e.timestamp, "2026-11-05 10:12:13");
        assert!(e.message.starts_with("nvme nvme0"));
        let g = classify_linux_kernel_line(
            "2026-11-05T10:12:13+0100 box kernel: amdgpu 0000:03:00.0: ring gfx timeout",
        )
        .unwrap();
        assert!(g.category.contains("TDR"));
        assert!(
            classify_linux_kernel_line("2026-11-05T10:12:13+0100 box kernel: usb 1-1: new device")
                .is_none()
        );
    }

    /// Echte scan van de logboeken op deze pc; toont wat de Freeze Detective zou laten zien.
    /// `cargo test --manifest-path src-tauri/Cargo.toml live_freeze_scan -- --ignored --nocapture`
    #[test]
    #[ignore = "leest de echte Windows-logboeken"]
    fn live_freeze_scan() {
        let r = scan_freeze_diagnostic();
        if let Ok(path) = std::env::var("PCC_FREEZE_JSON") {
            std::fs::write(path, serde_json::to_string(&r).unwrap()).unwrap();
        }
        println!("Risico: {} | {}", r.system_freeze_risk, r.diagnosis_summary);
        for c in &r.event_log_culprits {
            println!(
                "- [{}{}] {} | {} #{} | {}x ({} .. {}) | {} stappen",
                c.severity,
                if c.is_recent { "" } else { ", ouder" },
                c.category,
                c.provider,
                c.event_id,
                c.count,
                c.first_seen,
                c.timestamp,
                c.advice.steps.len()
            );
            println!("    {}", c.advice.title);
        }
    }
}
