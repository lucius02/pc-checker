use std::process::Command;
use std::time::{Duration, Instant};

use crate::models::{FreezeDiagnosticReport, FreezeEventEntry};
use crate::watchdog::{ensure_watchdog_started, get_watchdog_alerts};

#[tauri::command]
pub fn scan_freeze_diagnostic() -> FreezeDiagnosticReport {
    ensure_watchdog_started();

    let watchdog_freezes = get_watchdog_alerts();

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

    let ps_cmd = r#"Get-WinEvent -FilterHashtable @{LogName='System'; ProviderName='storahci','disk','nvme','Display','nvlddmkm','amdkmdag','Microsoft-Windows-WHEA-Logger'; Level=1,2,3} -MaxEvents 30 -ErrorAction SilentlyContinue | Select-Object TimeCreated, ProviderName, Id, LevelDisplayName, Message | ConvertTo-Json -Compress"#;

    let output = Command::new("cmd")
        .args(&["/c", &format!("powershell -NoProfile -Command \"{}\"", ps_cmd)])
        .output();

    if let Ok(out) = output {
        let json_str = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if !json_str.is_empty() && (json_str.starts_with('[') || json_str.starts_with('{')) {
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&json_str) {
                let items: Vec<serde_json::Value> = if let Some(arr) = parsed.as_array() {
                    arr.clone()
                } else if parsed.is_object() {
                    vec![parsed]
                } else {
                    vec![]
                };

                for it in items {
                    let provider = it["ProviderName"].as_str().unwrap_or("").to_string();
                    let id = it["Id"].as_u64().unwrap_or(0) as u32;
                    let level = it["LevelDisplayName"].as_str().unwrap_or("Waarschuwing").to_string();
                    let msg = it["Message"].as_str().unwrap_or("").trim().to_string();
                    let time = it["TimeCreated"].as_str().unwrap_or("Onlangs").to_string();

                    let (category, suggestion) = if provider.contains("storahci") || provider.contains("disk") || provider.contains("nvme") {
                        (
                            "Opslag / Schijf Time-out".to_string(),
                            "DIT VEROORZAAKT VAAK DE 5-SEC FREEZE: De schijf ontwaakte te traag uit slaapstand of SATA reset. Schakel 'AHCI Link Power Management' (HIPM/DIPM) uit in Energiebeheer, vervang de SATA-kabel of controleer de SSD gezondheid.".to_string(),
                        )
                    } else if provider.contains("Display") || provider.contains("nvlddmkm") || provider.contains("amdkmdag") {
                        (
                            "Videokaart Driver Crash (TDR)".to_string(),
                            "De GPU reageerde niet binnen 2-5 sec; Windows heeft de driver herstart. Voer een schone driver-installatie uit met DDU of controleer PCIe voedingskabels.".to_string(),
                        )
                    } else if provider.contains("WHEA") {
                        (
                            "Hardware Bus / Pariteitsfout".to_string(),
                            "Hardwarefout (WHEA) op de PCIe bus of CPU cache. Controleer RAM XMP profiel of moederbord spanning.".to_string(),
                        )
                    } else {
                        (
                            "Systeem Waarschuwing".to_string(),
                            "Inspecteer het stuurprogramma of achtergrondservice.".to_string(),
                        )
                    };

                    culprits.push(FreezeEventEntry {
                        timestamp: time,
                        provider,
                        event_id: id,
                        level,
                        message: msg,
                        category,
                        suggestion,
                    });
                }
            }
        }
    }

    let mut actions: Vec<String> = Vec::new();
    let risk;

    if !watchdog_freezes.is_empty() || !culprits.is_empty() {
        risk = "Hoog".to_string();
        actions.push("1. Schakel 'Aggressive Link Power Management' (LPM) voor SATA schijven uit in Geavanceerd Energiebeheer.".to_string());
        actions.push("2. Zet in Windows Energiebeheer: 'Harde schijf uitschakelen na' op NOOIT (0 minuten).".to_string());
        actions.push("3. Schakel 'PCI Express Link State Power Management' uit (Zet op 'Uit' / Off).".to_string());
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
            "Gevonden: {} kritieke event(s) in Windows logboek die direct overeenkomen met de 5-seconden freeze (o.a. opslag/driver time-outs).",
            culprits.len()
        )
    } else if !watchdog_freezes.is_empty() {
        format!(
            "Watchdog heeft {} freeze-incident(en) van meer dan 1 seconde live geregistreerd!",
            watchdog_freezes.len()
        )
    } else {
        "Geen directe freeze-events aangetroffen in recente logs. Watchdog blijft live monitoren.".to_string()
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
