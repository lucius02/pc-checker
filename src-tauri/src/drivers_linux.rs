//! Driver Check voor Linux. Er is geen Apparaatbeheer of WMI; in plaats daarvan:
//!
//! * **PCI-apparaten** uit `/sys/bus/pci/devices` (klasse + welke driver eraan gekoppeld is),
//!   met leesbare namen en kandidaat-modules uit `lspci -vmmkD` als dat geïnstalleerd is.
//! * **Kernelmodules** uit `/sys/module/<naam>` (versie, en via `taint` of het een
//!   module van buiten de kernel is en of hij ondertekend is).
//! * **Kernel-log** van deze boot (`journalctl -k -b`, terugval `dmesg`): fouten en ernstige
//!   waarschuwingen die een driver over zijn eigen apparaat meldt (firmware ontbreekt,
//!   time-outs, GPU-hangs, NVIDIA Xid's).
//! * **Leeftijd**: drivers in de kernel worden met de kernel bijgewerkt, dus hun datum is de
//!   bouwdatum van de kernel; voor de NVIDIA-driver de bouwdatum uit `/proc/driver/nvidia/version`.
//!
//! Alles werkt zonder root-rechten. Het verzamelen (`collect_snapshot`) is gescheiden van de
//! pure beoordeling (`build_linux_report`), zodat die laatste met vaste invoer getest kan worden.

use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::time::Duration;

use chrono::NaiveDate;
use serde_json::Value;

use super::{age_years, class_rank, flatten_advice, max_age_for_class, status_rank};
use crate::models::{Advice, DriverEntry, DriverReport};

const PCI_DEVICES_DIR: &str = "/sys/bus/pci/devices";
const COMMAND_TIMEOUT: Duration = Duration::from_secs(15);
/// Bovengrens voor het aantal logregels dat we inlezen (de journal kan na lange uptime groot zijn).
const MAX_LOG_LINES: &str = "20000";
/// Maximaal aantal voorbeeldmeldingen per apparaat in het advies.
const MAX_SAMPLE_MESSAGES: usize = 2;
/// syslog-prioriteit: 0-3 = emerg/alert/crit/err, 4 = warning.
const PRIORITY_ERR: u8 = 3;
const PRIORITY_WARNING: u8 = 4;
/// Waarschuwingen (prioriteit 4) tellen alleen mee als ze op een echt probleem wijzen.
const SEVERE_WARNING_WORDS: &[&str] = &[
    "fail",
    "timeout",
    "timed out",
    "hang",
    "reset",
    "xid",
    "error",
];
/// Drivers die een apparaat bewust doorgeven aan een virtuele machine.
const PASSTHROUGH_DRIVERS: &[&str] = &["vfio-pci", "pci-stub"];

// ===== Ruwe gegevens =====

#[derive(Debug, Clone, Default)]
pub struct PciDevice {
    /// Volledig PCI-adres, bijv. "0000:01:00.0".
    pub slot: String,
    /// Klassecode uit sysfs, bijv. 0x030000 (VGA).
    pub class_code: u32,
    pub name: String,
    /// Naam van de gekoppelde driver; `None` = geen driver geladen.
    pub driver: Option<String>,
    /// Kernelmodule die de driver levert (`None` bij een ingebouwde driver).
    pub module: Option<String>,
    /// Modules die volgens `lspci -k` bij dit apparaat passen.
    pub candidate_modules: Vec<String>,
    /// Andere namen waarmee de kernel dit apparaat in logregels noemt (bijv. "nvme0", "ata1").
    pub aliases: Vec<String>,
}

#[derive(Debug, Clone, Default)]
pub struct ModuleInfo {
    pub version: Option<String>,
    /// Inhoud van `/sys/module/<m>/taint`; `None` als het bestand ontbreekt (ingebouwd).
    pub taint: Option<String>,
}

#[derive(Debug, Clone)]
pub struct KernelLogLine {
    pub priority: u8,
    pub message: String,
}

#[derive(Debug, Clone, Default)]
pub struct LinuxSnapshot {
    pub devices: Vec<PciDevice>,
    pub modules: HashMap<String, ModuleInfo>,
    pub kernel_release: String,
    pub kernel_build_date: Option<NaiveDate>,
    pub nvidia_build_date: Option<NaiveDate>,
    /// Of de kernel module-handtekeningen controleert (anders zegt `taint` niets over ondertekening).
    pub signing_enabled: bool,
    /// `None` als de kernel-log niet leesbaar was.
    pub kernel_log: Option<Vec<KernelLogLine>>,
}

// ===== Verzamelen (leest het systeem) =====

pub fn scan(today: NaiveDate, scanned_at: String) -> DriverReport {
    let snapshot = collect_snapshot();
    if snapshot.devices.is_empty() {
        return super::unavailable_report(
            scanned_at,
            crate::tr!(
                "Geen PCI-apparaten gevonden in /sys/bus/pci (draait de app in een container zonder toegang tot sysfs?).",
                "No PCI devices found in /sys/bus/pci (is the app running in a container without sysfs access?)."
            ),
        );
    }
    build_linux_report(&snapshot, today, scanned_at)
}

fn collect_snapshot() -> LinuxSnapshot {
    let mut devices = read_pci_devices();
    if let Some(raw) = crate::shell::run_command("lspci", &["-vmmkD"], COMMAND_TIMEOUT) {
        apply_lspci(&mut devices, &parse_lspci(&raw));
    }
    attach_aliases(&mut devices);

    let modules = devices
        .iter()
        .filter_map(|d| d.module.clone())
        .map(|m| {
            let info = read_module_info(&m);
            (m, info)
        })
        .collect();

    LinuxSnapshot {
        devices,
        modules,
        kernel_release: read_trimmed("/proc/sys/kernel/osrelease").unwrap_or_default(),
        kernel_build_date: read_trimmed("/proc/sys/kernel/version").and_then(|v| find_date(&v)),
        nvidia_build_date: read_trimmed("/proc/driver/nvidia/version").and_then(|v| find_date(&v)),
        signing_enabled: Path::new("/sys/module/module/parameters/sig_enforce").exists(),
        kernel_log: read_kernel_log(),
    }
}

fn read_trimmed(path: impl AsRef<Path>) -> Option<String> {
    fs::read_to_string(path).ok().map(|s| s.trim().to_string())
}

fn link_name(path: impl AsRef<Path>) -> Option<String> {
    fs::read_link(path)
        .ok()?
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
}

fn read_pci_devices() -> Vec<PciDevice> {
    let Ok(entries) = fs::read_dir(PCI_DEVICES_DIR) else {
        return Vec::new();
    };
    let mut devices: Vec<PciDevice> = entries
        .flatten()
        .map(|e| {
            let dir = e.path();
            let slot = e.file_name().to_string_lossy().into_owned();
            let hex = |file: &str| {
                read_trimmed(dir.join(file))
                    .and_then(|v| u32::from_str_radix(v.trim_start_matches("0x"), 16).ok())
                    .unwrap_or(0)
            };
            PciDevice {
                name: format!("PCI {:04x}:{:04x}", hex("vendor"), hex("device")),
                class_code: hex("class"),
                driver: link_name(dir.join("driver")),
                module: link_name(dir.join("driver/module")),
                slot,
                ..Default::default()
            }
        })
        .collect();
    devices.sort_by(|a, b| a.slot.cmp(&b.slot));
    devices
}

/// Koppelt de namen uit `/sys/class/{nvme,ata_port}` aan het PCI-apparaat waar ze onder hangen,
/// zodat logregels als "nvme nvme0: I/O timeout" of "ata1.00: failed command" bij de juiste
/// opslagcontroller terechtkomen.
fn attach_aliases(devices: &mut [PciDevice]) {
    for class_dir in ["/sys/class/nvme", "/sys/class/ata_port"] {
        let Ok(entries) = fs::read_dir(class_dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let Ok(real) = fs::canonicalize(entry.path()) else {
                continue;
            };
            let alias = entry.file_name().to_string_lossy().into_owned();
            // Het diepste PCI-adres in het pad is het apparaat zelf (ervoor staan bridges).
            let owner = real
                .components()
                .filter_map(|c| c.as_os_str().to_str())
                .rfind(|c| devices.iter().any(|d| d.slot == *c))
                .map(str::to_string);
            if let Some(dev) = owner.and_then(|slot| devices.iter_mut().find(|d| d.slot == slot)) {
                dev.aliases.push(alias);
            }
        }
    }
}

fn read_module_info(module: &str) -> ModuleInfo {
    let dir = Path::new("/sys/module").join(module);
    ModuleInfo {
        version: read_trimmed(dir.join("version")).filter(|v| !v.is_empty()),
        taint: read_trimmed(dir.join("taint")),
    }
}

/// Kernel-log van de huidige boot: eerst de journal (leesbaar voor groepen `wheel`, `adm` of
/// `systemd-journal`), anders `dmesg` (vaak afgeschermd via `kernel.dmesg_restrict`).
fn read_kernel_log() -> Option<Vec<KernelLogLine>> {
    let journal = crate::shell::run_command(
        "journalctl",
        &[
            "-k",
            "-b",
            "-p",
            "4",
            "-q",
            "--no-pager",
            "-n",
            MAX_LOG_LINES,
            "-o",
            "json",
            "--output-fields=PRIORITY,MESSAGE",
        ],
        COMMAND_TIMEOUT,
    );
    if let Some(raw) = journal {
        let lines = parse_journal_json(&raw);
        // Lege uitvoer kan ook "geen toegang" betekenen; dan proberen we dmesg nog.
        if !lines.is_empty() {
            return Some(lines);
        }
    }
    let dmesg = |levels: &str| {
        crate::shell::run_command("dmesg", &["-t", "--level", levels], COMMAND_TIMEOUT)
    };
    let errors = dmesg("emerg,alert,crit,err")?;
    let warnings = dmesg("warn").unwrap_or_default();
    let tag = |raw: String, priority: u8| {
        raw.lines()
            .filter(|l| !l.trim().is_empty())
            .map(|l| KernelLogLine {
                priority,
                message: l.trim().to_string(),
            })
            .collect::<Vec<_>>()
    };
    let mut lines = tag(errors, PRIORITY_ERR);
    lines.extend(tag(warnings, PRIORITY_WARNING));
    Some(lines)
}

// ===== Parsing (puur) =====

#[derive(Debug, Clone, Default, PartialEq)]
pub struct LspciRecord {
    pub slot: String,
    pub vendor: String,
    pub device: String,
    pub modules: Vec<String>,
}

/// Parseert `lspci -vmmkD`: blokken van `Sleutel:\tWaarde`-regels, gescheiden door lege regels.
pub fn parse_lspci(raw: &str) -> Vec<LspciRecord> {
    raw.split("\n\n")
        .filter_map(|block| {
            let mut rec = LspciRecord::default();
            for line in block.lines() {
                let Some((key, value)) = line.split_once(':') else {
                    continue;
                };
                let value = value.trim().to_string();
                match key {
                    "Slot" => rec.slot = value,
                    "Vendor" => rec.vendor = value,
                    "Device" => rec.device = value,
                    "Module" => rec.modules.push(value),
                    _ => {}
                }
            }
            (!rec.slot.is_empty()).then_some(rec)
        })
        .collect()
}

pub fn apply_lspci(devices: &mut [PciDevice], records: &[LspciRecord]) {
    for dev in devices.iter_mut() {
        let Some(rec) = records.iter().find(|r| r.slot == dev.slot) else {
            continue;
        };
        let name = format!("{} {}", rec.vendor, rec.device).trim().to_string();
        if !name.is_empty() {
            dev.name = name;
        }
        dev.candidate_modules = rec.modules.clone();
    }
}

/// Parseert `journalctl -o json`: één JSON-object per regel. Berichten met niet-UTF-8 bytes
/// (die journald als getallen-array opslaat) slaan we over.
pub fn parse_journal_json(raw: &str) -> Vec<KernelLogLine> {
    raw.lines()
        .filter_map(|line| {
            let v: Value = serde_json::from_str(line).ok()?;
            let message = v.get("MESSAGE")?.as_str()?.trim().to_string();
            let priority = v.get("PRIORITY")?.as_str()?.parse().ok()?;
            (!message.is_empty()).then_some(KernelLogLine { priority, message })
        })
        .collect()
}

const MONTHS: [&str; 12] = [
    "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec",
];

/// Haalt een datum uit een vrije tekst zoals de kernel- of NVIDIA-versieregel. Herkent
/// "Fri, 16 Oct 2026 00:28:58" (Arch), "Thu Oct 10 13:02:14 UTC 2024" (Ubuntu/Fedora/NVIDIA)
/// en "(2024-11-01)" (Debian).
pub fn find_date(text: &str) -> Option<NaiveDate> {
    let tokens: Vec<&str> = text
        .split(|c: char| c.is_whitespace() || matches!(c, ',' | '(' | ')'))
        .filter(|t| !t.is_empty())
        .collect();

    if let Some(d) = tokens
        .iter()
        .find_map(|t| NaiveDate::parse_from_str(t, "%Y-%m-%d").ok())
    {
        return Some(d);
    }

    let number = |t: &str| t.parse::<u32>().ok();
    for (i, tok) in tokens.iter().enumerate() {
        let Some(month) = MONTHS.iter().position(|m| tok.eq_ignore_ascii_case(m)) else {
            continue;
        };
        let day = i
            .checked_sub(1)
            .and_then(|p| number(tokens[p]))
            .filter(|d| (1..=31).contains(d))
            .or_else(|| tokens.get(i + 1).and_then(|t| number(t)))
            .filter(|d| (1..=31).contains(d));
        let year = tokens
            .iter()
            .skip(i + 1)
            .take(4)
            .filter(|t| t.len() == 4)
            .find_map(|t| t.parse::<i32>().ok())
            .filter(|y| (1991..=2200).contains(y));
        if let (Some(day), Some(year)) = (day, year) {
            return NaiveDate::from_ymd_opt(year, month as u32 + 1, day);
        }
    }
    None
}

// ===== Classificatie (puur) =====

/// Vertaalt een PCI-klassecode naar dezelfde klassenamen als de Windows-scan, zodat de
/// frontend en de gezondheidsscore er niets van hoeven te weten.
pub fn linux_class(code: u32) -> &'static str {
    let base = code >> 16;
    let sub = (code >> 8) & 0xff;
    match (base, sub) {
        (0x03, _) => "DISPLAY",
        (0x01, 0x01 | 0x06) => "HDC",
        (0x01, _) => "SCSIADAPTER",
        (0x02 | 0x0d, _) => "NET",
        (0x04, _) => "MEDIA",
        (0x0c, 0x03) => "USB",
        (0x05..=0x08 | 0x0c | 0x11, _) => "SYSTEM",
        _ => "OTHER",
    }
}

/// Apparaten die zonder driver niet werken. Bridges, geheugen- en systeemcontrollers draaien
/// vaak prima zonder eigen driver, dus die tellen we niet als probleem.
fn needs_driver(class: &str) -> bool {
    matches!(
        class,
        "DISPLAY" | "HDC" | "SCSIADAPTER" | "NET" | "MEDIA" | "USB"
    )
}

/// Is `needle` een los woord in `haystack` (niet omringd door letters/cijfers)?
fn contains_token(haystack: &str, needle: &str) -> bool {
    let is_word = |c: Option<char>| c.is_some_and(|c| c.is_ascii_alphanumeric());
    haystack.match_indices(needle).any(|(i, _)| {
        !is_word(haystack[..i].chars().next_back())
            && !is_word(haystack[i + needle.len()..].chars().next())
    })
}

/// Gaat deze logregel over dit apparaat? De kernel zet het apparaat vóór de eerste ": "
/// ("amdgpu 0000:03:00.0: ...", "nvme nvme0: ...", "ata1.00: ..."). NVIDIA gebruikt een eigen
/// vorm: "NVRM: Xid (PCI:0000:01:00): 79, ...".
fn mentions_device(message: &str, dev: &PciDevice, class: &str) -> bool {
    let subject = message.split(": ").next().unwrap_or("");
    if contains_token(subject, &dev.slot) || dev.aliases.iter().any(|a| contains_token(subject, a))
    {
        return true;
    }
    let bus_device = dev
        .slot
        .rsplit_once('.')
        .map_or(dev.slot.as_str(), |(bd, _)| bd);
    class == "DISPLAY" && message.contains(&format!("(PCI:{bus_device})"))
}

fn is_relevant_log_line(line: &KernelLogLine) -> bool {
    if line.priority <= PRIORITY_ERR {
        return true;
    }
    let lower = line.message.to_lowercase();
    line.priority == PRIORITY_WARNING && SEVERE_WARNING_WORDS.iter().any(|w| lower.contains(w))
}

fn is_firmware_failure(message: &str) -> bool {
    let lower = message.to_lowercase();
    lower.contains("firmware")
        && ["fail", "missing", "not found"]
            .iter()
            .any(|w| lower.contains(w))
}

pub fn build_linux_report(
    snap: &LinuxSnapshot,
    today: NaiveDate,
    scanned_at: String,
) -> DriverReport {
    let total_drivers = snap.devices.iter().filter(|d| d.driver.is_some()).count();
    let mut entries: Vec<DriverEntry> = snap
        .devices
        .iter()
        .filter_map(|d| {
            let class = linux_class(d.class_code);
            let entry = classify_linux(d, class, snap, today);
            let shown = entry.status != "OK" || (needs_driver(class) && d.driver.is_some());
            shown.then_some(entry)
        })
        .collect();

    entries.sort_by(|a, b| {
        status_rank(&a.status)
            .cmp(&status_rank(&b.status))
            .then(class_rank(&a.device_class).cmp(&class_rank(&b.device_class)))
            .then(
                a.device_name
                    .to_lowercase()
                    .cmp(&b.device_name.to_lowercase()),
            )
    });

    let problem_count = entries.iter().filter(|e| e.status == "Probleem").count();
    let outdated_count = entries.iter().filter(|e| e.status == "Verouderd").count();
    let summary = linux_summary(
        total_drivers,
        problem_count,
        outdated_count,
        snap.kernel_log.is_some(),
    );

    DriverReport {
        is_available: true,
        scanned_at,
        total_drivers,
        outdated_count,
        problem_count,
        // Ondertekening is op Linux informatief: DKMS-modules (bijv. NVIDIA) zijn vrijwel
        // altijd niet ondertekend, en dat is daar normaal.
        unsigned_count: 0,
        unsupported_count: 0,
        entries,
        summary,
    }
}

fn classify_linux(
    dev: &PciDevice,
    class: &str,
    snap: &LinuxSnapshot,
    today: NaiveDate,
) -> DriverEntry {
    let module_info = dev.module.as_ref().and_then(|m| snap.modules.get(m));
    let taint = module_info.and_then(|m| m.taint.as_deref());
    let out_of_tree = taint.is_some_and(|t| t.contains('O') || t.contains('P'));
    let is_nvidia = dev
        .module
        .as_deref()
        .is_some_and(|m| m.starts_with("nvidia"));

    let (version, date) = if out_of_tree {
        let version = module_info
            .and_then(|m| m.version.clone())
            .unwrap_or_default();
        let date = if is_nvidia {
            snap.nvidia_build_date
        } else {
            None
        };
        (version, date)
    } else if dev.driver.is_some() {
        (snap.kernel_release.clone(), snap.kernel_build_date)
    } else {
        (String::new(), None)
    };
    let date = date
        .map(|d| d.format("%Y-%m-%d").to_string())
        .unwrap_or_default();
    let age = age_years(&date, today);

    let log_lines: Vec<&KernelLogLine> = snap
        .kernel_log
        .iter()
        .flatten()
        .filter(|l| is_relevant_log_line(l) && mentions_device(&l.message, dev, class))
        .collect();

    let (status, advice) = match (&dev.driver, log_lines.is_empty()) {
        (None, _) if needs_driver(class) => ("Probleem", no_driver_advice(dev, class)),
        (Some(_), false) => ("Probleem", kernel_log_advice(dev, class, &log_lines)),
        (Some(driver), true) if PASSTHROUGH_DRIVERS.contains(&driver.as_str()) => (
            "OK",
            Advice {
                title: crate::tr!(
                    format!("Doorgegeven aan een virtuele machine ({driver})."),
                    format!("Passed through to a virtual machine ({driver}).")
                ),
                ..Default::default()
            },
        ),
        (Some(_), true) => match (age, max_age_for_class(class)) {
            (Some(a), Some(max)) if a > max => {
                ("Verouderd", outdated_advice(a, max, out_of_tree, is_nvidia))
            }
            _ => ("OK", no_action()),
        },
        (None, _) => ("OK", no_action()),
    };

    DriverEntry {
        device_name: dev.name.clone(),
        device_class: class.to_string(),
        provider: provider_label(dev, taint),
        version,
        date,
        age_years: age,
        is_signed: match taint {
            Some(t) if snap.signing_enabled => Some(!t.contains('E')),
            _ => None,
        },
        status: status.to_string(),
        problem_code: None,
        advice: flatten_advice(&advice),
        advice_detail: advice,
        support: None,
    }
}

fn provider_label(dev: &PciDevice, taint: Option<&str>) -> String {
    let Some(driver) = &dev.driver else {
        return String::new();
    };
    let source = match taint {
        Some(t) if t.contains('P') => crate::tr!("propriëtaire module", "proprietary module"),
        Some(t) if t.contains('O') => crate::tr!("module buiten de kernel", "out-of-tree module"),
        _ => crate::tr!("Linux-kernel", "Linux kernel"),
    };
    format!("{source} · {driver}")
}

fn no_action() -> Advice {
    Advice {
        title: crate::tr!("Geen actie nodig.", "No action needed.").to_string(),
        ..Default::default()
    }
}

fn t(nl: &str, en: &str) -> String {
    crate::tr!(nl, en).to_string()
}

fn update_system_step() -> String {
    t(
        "Werk je systeem bij via je pakketbeheerder, bijv. `sudo pacman -Syu`, `sudo apt update && sudo apt full-upgrade` of `sudo dnf upgrade`, en herstart daarna.",
        "Update your system with your package manager, e.g. `sudo pacman -Syu`, `sudo apt update && sudo apt full-upgrade` or `sudo dnf upgrade`, then reboot.",
    )
}

fn no_driver_advice(dev: &PciDevice, class: &str) -> Advice {
    let mut steps = vec![t(
        "Gebruik je dit apparaat bewust niet (bijv. een uitgeschakelde tweede videokaart)? Dan hoef je niets te doen.",
        "Not using this device on purpose (e.g. a disabled second GPU)? Then there is nothing to do.",
    )];
    let why = if let Some(module) = dev.candidate_modules.first() {
        steps.push(crate::tr!(
            format!("Laad de driver handmatig met `sudo modprobe {module}` en bekijk eventuele fouten met `journalctl -k -b | grep -i {module}`."),
            format!("Load the driver manually with `sudo modprobe {module}` and check for errors with `journalctl -k -b | grep -i {module}`.")
        ));
        steps.push(crate::tr!(
            format!("Controleer of `{module}` niet op een blacklist staat in `/etc/modprobe.d/`."),
            format!("Check that `{module}` is not blacklisted in `/etc/modprobe.d/`.")
        ));
        crate::tr!(
            format!(
                "Er is wel een passende kernelmodule ({}), maar die is niet geladen of kon het apparaat niet starten.",
                dev.candidate_modules.join(", ")
            ),
            format!(
                "A matching kernel module exists ({}), but it is not loaded or could not start the device.",
                dev.candidate_modules.join(", ")
            )
        )
    } else {
        if class == "DISPLAY" && dev.name.to_lowercase().contains("nvidia") {
            steps.push(t(
                "Installeer de NVIDIA-driver uit je distributie (bijv. het pakket `nvidia-open` of `nvidia`), niet de losse `.run`-installer van de website.",
                "Install the NVIDIA driver from your distribution (e.g. the `nvidia-open` or `nvidia` package), not the standalone `.run` installer from the website.",
            ));
        }
        steps.push(update_system_step());
        t(
            "Er is geen kernelmodule gevonden die dit apparaat ondersteunt. Een nieuwere kernel of het pakket `linux-firmware` lost dat vaak op.",
            "No kernel module was found that supports this device. A newer kernel or the `linux-firmware` package often fixes that.",
        )
    };
    Advice {
        title: t(
            "Er is geen driver geladen voor dit apparaat.",
            "No driver is loaded for this device.",
        ),
        why: Some(why),
        steps,
        ..Default::default()
    }
}

fn kernel_log_advice(dev: &PciDevice, class: &str, lines: &[&KernelLogLine]) -> Advice {
    let driver = dev.driver.as_deref().unwrap_or_default();
    let samples: Vec<String> = lines
        .iter()
        .rev()
        .take(MAX_SAMPLE_MESSAGES)
        .map(|l| format!("“{}”", truncate(&l.message, 160)))
        .collect();
    let look_step = crate::tr!(
        format!(
            "Bekijk alle meldingen met `journalctl -k -b -p 4 | grep -e {driver} -e {}`.",
            dev.slot
        ),
        format!(
            "See all messages with `journalctl -k -b -p 4 | grep -e {driver} -e {}`.",
            dev.slot
        )
    );

    if lines.iter().any(|l| is_firmware_failure(&l.message)) {
        return Advice {
            title: t(
                "Firmware voor dit apparaat ontbreekt of kon niet laden.",
                "Firmware for this device is missing or failed to load.",
            ),
            why: Some(samples.join(" ")),
            steps: vec![
                t(
                    "Installeer of werk het pakket `linux-firmware` bij (op Debian heet het deels `firmware-misc-nonfree`).",
                    "Install or update the `linux-firmware` package (on Debian it is partly called `firmware-misc-nonfree`).",
                ),
                update_system_step(),
                look_step,
            ],
            ..Default::default()
        };
    }

    let mut steps = match class {
        "DISPLAY" => vec![
            update_system_step(),
            t(
                "Gebruik je de NVIDIA-driver? Zorg dat het driverpakket bij je kernel past (bij DKMS: `dkms status`).",
                "Using the NVIDIA driver? Make sure the driver package matches your kernel (with DKMS: `dkms status`).",
            ),
            t(
                "Blijven GPU-hangs terugkomen? Controleer temperatuur en voeding van de videokaart (tabbladen Koeling en GPU).",
                "GPU hangs keep coming back? Check the graphics card's temperature and power (Cooling and GPU tabs).",
            ),
        ],
        "HDC" | "SCSIADAPTER" => vec![
            t(
                "Controleer de schijf zelf: SMART-status en eventuele sectorfouten (tabblad Schijf).",
                "Check the drive itself: SMART status and any sector errors (Disk tab).",
            ),
            t(
                "Controleer of de SATA-kabel en -stroomkabel goed vastzitten, of probeer een andere poort.",
                "Check that the SATA data and power cables are seated, or try another port.",
            ),
            t(
                "Zet de SATA-modus in het BIOS op AHCI (niet RAID/RST) als je geen RAID gebruikt.",
                "Set the SATA mode in the BIOS to AHCI (not RAID/RST) if you don't use RAID.",
            ),
            update_system_step(),
        ],
        _ => vec![update_system_step()],
    };
    steps.push(look_step);
    Advice {
        title: crate::tr!(
            format!(
                "De kernel meldde {} fout(en) voor dit apparaat sinds het opstarten.",
                lines.len()
            ),
            format!(
                "The kernel reported {} error(s) for this device since boot.",
                lines.len()
            )
        ),
        why: Some(samples.join(" ")),
        steps,
        ..Default::default()
    }
}

fn outdated_advice(age: f32, max: f32, out_of_tree: bool, is_nvidia: bool) -> Advice {
    if out_of_tree {
        let what = if is_nvidia {
            crate::tr!("NVIDIA-driver", "NVIDIA driver")
        } else {
            "driver"
        };
        return Advice {
            title: crate::tr!(
                format!(
                    "Mogelijk verouderd: deze {what} is {age:.1} jaar oud (grens voor dit type: {max} jaar)."
                ),
                format!(
                    "Possibly outdated: this {what} is {age:.1} years old (limit for this type: {max} years)."
                )
            ),
            steps: vec![
                update_system_step(),
                t(
                    "Installeer drivers via je distributie, niet met losse installers van internet.",
                    "Install drivers through your distribution, not with standalone installers from the internet.",
                ),
            ],
            ..Default::default()
        };
    }
    Advice {
        title: crate::tr!(
            format!(
                "Mogelijk verouderd: je kernel, en daarmee deze driver, is {age:.1} jaar oud (grens voor dit type: {max} jaar)."
            ),
            format!(
                "Possibly outdated: your kernel, and with it this driver, is {age:.1} years old (limit for this type: {max} years)."
            )
        ),
        why: Some(t(
            "Drivers in de kernel worden samen met de kernel bijgewerkt. Nieuwere kernels bevatten fixes voor hangs en freezes.",
            "In-kernel drivers are updated together with the kernel. Newer kernels contain fixes for hangs and freezes.",
        )),
        steps: vec![
            update_system_step(),
            t(
                "Biedt je distributie een nieuwere kernel aan (bijv. HWE op Ubuntu of backports op Debian)? Overweeg die.",
                "Does your distribution offer a newer kernel (e.g. HWE on Ubuntu or backports on Debian)? Consider it.",
            ),
        ],
        ..Default::default()
    }
}

fn truncate(text: &str, max_chars: usize) -> String {
    match text.char_indices().nth(max_chars) {
        Some((i, _)) => format!("{}…", &text[..i]),
        None => text.to_string(),
    }
}

fn linux_summary(total: usize, problems: usize, outdated: usize, log_readable: bool) -> String {
    let mut s = if problems == 0 && outdated == 0 {
        crate::tr!(
            format!(
                "{total} apparaten met driver gescand: geen ontbrekende drivers, driverfouten of verouderde drivers gevonden."
            ),
            format!(
                "{total} devices with a driver scanned: no missing drivers, driver errors or outdated drivers found."
            )
        )
    } else {
        let mut parts = Vec::new();
        if problems > 0 {
            parts.push(crate::tr!(
                format!("{problems} apparaat/apparaten zonder driver of met driverfouten"),
                format!("{problems} device(s) without a driver or with driver errors")
            ));
        }
        if outdated > 0 {
            parts.push(crate::tr!(
                format!("{outdated} mogelijk verouderde driver(s)"),
                format!("{outdated} possibly outdated driver(s)")
            ));
        }
        crate::tr!(
            format!(
                "{total} apparaten met driver gescand: {}.",
                parts.join(", ")
            ),
            format!(
                "{total} devices with a driver scanned: {}.",
                parts.join(", ")
            )
        )
    };
    if !log_readable {
        s.push_str(crate::tr!(
            " De kernel-log kon niet worden gelezen, dus driverfouten sinds het opstarten zijn niet meegenomen. Voeg je gebruiker toe aan de groep `systemd-journal` (of `adm`/`wheel`) en log opnieuw in.",
            " The kernel log could not be read, so driver errors since boot were not checked. Add your user to the `systemd-journal` group (or `adm`/`wheel`) and log in again."
        ));
    }
    s
}

#[cfg(test)]
#[path = "drivers_linux_tests.rs"]
mod tests;
