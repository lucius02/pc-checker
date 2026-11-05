use std::time::{Duration, Instant};

use crate::models::{FreezeDiagnosticReport, FreezeEventEntry};
use crate::shell::{json_items, run_ps_json};
use crate::watchdog::{ensure_watchdog_started, get_watchdog_alerts};

const PS_EVENT_SCRIPT: &str = r#"Get-WinEvent -FilterHashtable @{LogName='System'; ProviderName='storahci','disk','nvme','stornvme','Display','nvlddmkm','amdkmdag','Microsoft-Windows-WHEA-Logger'; Level=1,2,3} -MaxEvents 30 | Select-Object @{n='TimeCreated';e={$_.TimeCreated.ToString('yyyy-MM-dd HH:mm:ss')}}, ProviderName, Id, LevelDisplayName, Message | ConvertTo-Json -Compress"#;

/// Koppelt een Windows event-provider aan een categorie en concreet advies.
pub fn classify_provider(provider: &str) -> (String, String) {
    let (c, s) = if provider.contains("storahci")
        || provider.contains("disk")
        || provider.contains("nvme")
    {
        (
            "Opslag / Schijf Time-out",
            "DIT VEROORZAAKT VAAK DE FREEZE: De schijf ontwaakte te traag uit slaapstand of SATA reset. Schakel 'AHCI Link Power Management' (HIPM/DIPM) uit in Energiebeheer, vervang de SATA-kabel of controleer de SSD gezondheid.",
        )
    } else if provider.contains("Display")
        || provider.contains("nvlddmkm")
        || provider.contains("amdkmdag")
    {
        (
            "Videokaart Driver Crash (TDR)",
            "De GPU reageerde niet op tijd (TDR time-out); Windows heeft de driver herstart. Voer een schone driver-installatie uit met DDU of controleer PCIe voedingskabels.",
        )
    } else if provider.contains("WHEA") {
        (
            "Hardware Bus / Pariteitsfout",
            "Hardwarefout (WHEA) op de PCIe bus of CPU cache. Controleer RAM XMP profiel of moederbord spanning.",
        )
    } else {
        (
            "Systeem Waarschuwing",
            "Inspecteer het stuurprogramma of achtergrondservice.",
        )
    };
    (c.to_string(), s.to_string())
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
        .unwrap_or("Onlangs")
        .replace('T', " ");
    let message = line
        .split_once("kernel:")
        .map(|(_, m)| m.trim())
        .unwrap_or(line)
        .to_string();
    let (category, suggestion) = classify_provider(provider);
    Some(FreezeEventEntry {
        timestamp: timestamp.chars().take(19).collect(),
        provider: format!("kernel ({})", provider),
        event_id: 0,
        level: "Fout".to_string(),
        message,
        category,
        suggestion,
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

    // 2. Windows: Event Logboek via PowerShell (verborgen venster, harde time-out).
    if cfg!(windows)
        && let Some(parsed) = run_ps_json(PS_EVENT_SCRIPT)
    {
        for it in json_items(&parsed) {
            let provider = it["ProviderName"].as_str().unwrap_or("").to_string();
            let (category, suggestion) = classify_provider(&provider);
            culprits.push(FreezeEventEntry {
                timestamp: it["TimeCreated"].as_str().unwrap_or("Onlangs").to_string(),
                provider,
                event_id: it["Id"].as_u64().unwrap_or(0) as u32,
                level: it["LevelDisplayName"]
                    .as_str()
                    .unwrap_or("Waarschuwing")
                    .to_string(),
                message: it["Message"].as_str().unwrap_or("").trim().to_string(),
                category,
                suggestion,
            });
        }
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

    let mut actions: Vec<String> = Vec::new();
    let risk;

    if !watchdog_freezes.is_empty() || !culprits.is_empty() {
        risk = "Hoog".to_string();
        actions.push("1. Schakel 'Aggressive Link Power Management' (LPM) voor SATA schijven uit in Geavanceerd Energiebeheer.".to_string());
        actions.push(
            "2. Zet in Windows Energiebeheer: 'Harde schijf uitschakelen na' op NOOIT (0 minuten)."
                .to_string(),
        );
        actions.push(
            "3. Schakel 'PCI Express Link State Power Management' uit (Zet op 'Uit' / Off)."
                .to_string(),
        );
        actions.push("4. Vervang de SATA-datakabel van extra HDD's/SSD's of test met CrystalDiskInfo op CRC/Pending errors.".to_string());
        actions.push("5. Verwijder conflicterende RGB/monitoring achtergrondsoftware (zoals Asus Armoury Crate, Razer Synapse of iCUE).".to_string());
    } else if max_jitter_ms > 200.0 {
        risk = "Middel".to_string();
        actions.push("Er zijn micro-hickups gedetecteerd in de thread scheduling. Sluit achtergrondprogramma's af.".to_string());
        actions.push("Controleer audio- en netwerkstuurprogramma's met LatencyMon.".to_string());
    } else {
        risk = "Laag".to_string();
        actions.push("Op dit specifieke moment vertoont het systeem stabiele lage latency en geen actieve driver timeouts.".to_string());
        actions.push("Laat deze Freeze Detective actief draaien tijdens je normale werk; zodra de freeze optreedt, zal de Watchdog het exact loggen.".to_string());
    }

    let diagnosis_summary = if !culprits.is_empty() {
        format!(
            "Gevonden: {} kritieke event(s) in Windows logboek die direct overeenkomen met systeem freezes (o.a. opslag/driver time-outs).",
            culprits.len()
        )
    } else if !watchdog_freezes.is_empty() {
        format!(
            "Watchdog heeft {} freeze-incident(en) van meer dan 1 seconde live geregistreerd!",
            watchdog_freezes.len()
        )
    } else {
        "Geen directe freeze-events aangetroffen in recente logs. Watchdog blijft live monitoren."
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

    #[test]
    fn providers_are_classified() {
        assert!(classify_provider("stornvme").0.contains("Opslag"));
        assert!(classify_provider("nvlddmkm").0.contains("TDR"));
        assert!(
            classify_provider("Microsoft-Windows-WHEA-Logger")
                .0
                .contains("Hardware")
        );
        assert_eq!(classify_provider("foo").0, "Systeem Waarschuwing");
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
}
