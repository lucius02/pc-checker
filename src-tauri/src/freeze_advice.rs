//! Kennisbank voor freeze-gerelateerde Windows-events: per bron + event-ID een categorie,
//! ernst en concreet stappenplan.
//!
//! Bronnen van de kennis: de Windows-documentatie van deze events (WHEA, Kernel-Power,
//! storport/storahci, TDR, BugCheck-stopcodes) en de gangbare oplossingen daarvoor.
//! Onbekende events van een bekende bron krijgen een algemene, veilige aanpak.

use crate::models::Advice;

/// Ernstcodes (blijven Nederlands, net als andere statuscodes; de UI vertaalt ze).
pub const SEV_CRITICAL: &str = "Kritiek";
pub const SEV_HIGH: &str = "Hoog";
pub const SEV_MEDIUM: &str = "Middel";

pub fn severity_rank(sev: &str) -> u8 {
    match sev {
        SEV_CRITICAL => 3,
        SEV_HIGH => 2,
        SEV_MEDIUM => 1,
        _ => 0,
    }
}

pub struct Known {
    pub category: String,
    pub severity: &'static str,
    pub advice: Advice,
}

type Pair<'a> = (&'a str, &'a str);

fn t(p: Pair) -> String {
    crate::tr!(p.0, p.1).to_string()
}

fn advice(
    title: String,
    why: Option<Pair>,
    steps: &[Pair],
    fallback: Option<(Pair, &[Pair])>,
) -> Advice {
    Advice {
        title,
        why: why.map(t),
        steps: steps.iter().copied().map(t).collect(),
        fallback_title: fallback.map(|(h, _)| t(h)),
        fallback_steps: fallback
            .map(|(_, s)| s.iter().copied().map(t).collect())
            .unwrap_or_default(),
    }
}

fn known(category: Pair, severity: &'static str, advice: Advice) -> Known {
    Known {
        category: t(category),
        severity,
        advice,
    }
}

// ---------------------------------------------------------------------------------------------
// Gedeelde stappen
// ---------------------------------------------------------------------------------------------

const STEP_OC_RESET: Pair = (
    "Zet overklokken en undervolten terug: kies in het BIOS 'Load Optimized Defaults', zet XMP/EXPO tijdelijk uit en sluit tools als MSI Afterburner, Intel XTU, Ryzen Master of ThrottleStop.",
    "Undo overclocking and undervolting: choose 'Load Optimized Defaults' in the BIOS, temporarily disable XMP/EXPO and close tools such as MSI Afterburner, Intel XTU, Ryzen Master or ThrottleStop.",
);
const STEP_BIOS: Pair = (
    "Update het BIOS/UEFI en het chipsetpakket via de supportpagina van je moederbord- of laptopfabrikant (lost vaak microcode- en stabiliteitsbugs op).",
    "Update the BIOS/UEFI and the chipset package from your motherboard or laptop manufacturer's support page (this often fixes microcode and stability bugs).",
);
const STEP_RAM_TEST: Pair = (
    "Test het geheugen: draai de RAM-test in PC Checker met een grote omvang, of Windows Geheugendiagnose (mdsched.exe) of MemTest86.",
    "Test the memory: run the RAM test in PC Checker with a large size, or Windows Memory Diagnostic (mdsched.exe) or MemTest86.",
);
const STEP_TEMPS: Pair = (
    "Controleer de temperaturen onder belasting met de Burn-in-test in PC Checker; boven 90 °C moet de koeling beter (stof, koelpasta, airflow).",
    "Check temperatures under load with the Burn-in test in PC Checker; above 90 °C the cooling needs work (dust, thermal paste, airflow).",
);
const STEP_SMART: Pair = (
    "Bekijk het tabblad Schijfgezondheid (SMART) voor slijtage, temperatuur en leesfouten van je schijven.",
    "Check the Disk Health (SMART) tab for wear, temperature and read errors on your disks.",
);
const STEP_BACKUP: Pair = (
    "Maak nu een back-up van belangrijke bestanden; schijffouten kunnen erger worden.",
    "Back up important files now; disk errors can get worse.",
);
const STEP_DISK_POWER: Pair = (
    "Open Energiebeheer → Geavanceerde instellingen en zet 'Harde schijf uitschakelen na' op 0 (nooit) en 'PCI Express → Link State Power Management' op Uit.",
    "Open Power Options → Advanced settings and set 'Turn off hard disk after' to 0 (never) and 'PCI Express → Link State Power Management' to Off.",
);
const STEP_SSD_FW: Pair = (
    "Update de firmware van je SSD met de tool van de fabrikant (Samsung Magician, Crucial Storage Executive, WD Dashboard, Kingston SSD Manager, ...).",
    "Update your SSD firmware with the manufacturer's tool (Samsung Magician, Crucial Storage Executive, WD Dashboard, Kingston SSD Manager, ...).",
);
const STEP_CABLE: Pair = (
    "Desktop met SATA-schijven: vervang de SATA-datakabel, gebruik een andere SATA-poort en controleer of de voedingsstekker van de schijf goed vastzit.",
    "Desktop with SATA disks: replace the SATA data cable, use a different SATA port and check that the disk's power connector is seated properly.",
);
const STEP_DDU: Pair = (
    "Doe een schone installatie van de videodriver: download de nieuwste driver, verwijder de oude met DDU (Display Driver Uninstaller) in Veilige modus en installeer daarna de nieuwe.",
    "Do a clean graphics driver install: download the latest driver, remove the old one with DDU (Display Driver Uninstaller) in Safe Mode, then install the new one.",
);
const STEP_PSU: Pair = (
    "Controleer de voeding: gebruik voor de videokaart aparte PCIe-kabels per aansluiting (geen splitter) en sluit de pc direct op het stopcontact aan in plaats van via een goedkope stekkerdoos.",
    "Check the power supply: use separate PCIe cables for each graphics card connector (no splitter) and plug the PC straight into the wall instead of a cheap power strip.",
);
const STEP_EVENT_DETAILS: Pair = (
    "Wil je weten welk onderdeel het was? Open Logboeken (eventvwr.msc) → Windows-logboeken → Systeem, open dit event en kijk op het tabblad 'Details' naar 'ErrorSource' / 'Component'.",
    "Want to know which component it was? Open Event Viewer (eventvwr.msc) → Windows Logs → System, open this event and look at 'ErrorSource' / 'Component' on the 'Details' tab.",
);

// ---------------------------------------------------------------------------------------------
// Hulpfuncties voor de berichttekst
// ---------------------------------------------------------------------------------------------

/// Zoekt de eerste stopcode (`0x` + hex) in een BugCheck-bericht (werkt in elke Windows-taal).
pub fn parse_bugcheck_code(message: &str) -> Option<u32> {
    let lower = message.to_ascii_lowercase();
    let mut rest = lower.as_str();
    while let Some(i) = rest.find("0x") {
        let hex: String = rest[i + 2..]
            .chars()
            .take_while(|c| c.is_ascii_hexdigit())
            .collect();
        if !hex.is_empty()
            && hex.len() <= 16
            && let Ok(v) = u64::from_str_radix(&hex, 16)
        {
            return Some((v & 0xFFFF_FFFF) as u32);
        }
        rest = &rest[i + 2..];
    }
    None
}

/// Bekende stopcodes: naam + specifieke eerste aanwijzing.
pub fn bugcheck_info(code: u32) -> Option<(&'static str, Pair<'static>)> {
    Some(match code {
        0x0A => (
            "IRQL_NOT_LESS_OR_EQUAL",
            (
                "Bijna altijd een driver (vaak netwerk, audio of antivirus) of instabiel RAM.",
                "Almost always a driver (often network, audio or antivirus) or unstable RAM.",
            ),
        ),
        0x1A => (
            "MEMORY_MANAGEMENT",
            (
                "Wijst sterk op geheugenproblemen: test het RAM en zet XMP/EXPO uit.",
                "Strongly points to memory problems: test the RAM and disable XMP/EXPO.",
            ),
        ),
        0x3B => (
            "SYSTEM_SERVICE_EXCEPTION",
            (
                "Vaak een driver of beveiligingssoftware; ook beschadigde systeembestanden (sfc /scannow).",
                "Often a driver or security software; also corrupted system files (sfc /scannow).",
            ),
        ),
        0x50 => (
            "PAGE_FAULT_IN_NONPAGED_AREA",
            (
                "Vaak RAM-fouten of een defecte driver; test het geheugen.",
                "Often RAM errors or a faulty driver; test the memory.",
            ),
        ),
        0x7E => (
            "SYSTEM_THREAD_EXCEPTION_NOT_HANDLED",
            (
                "Een driver crashte; de minidump noemt meestal welke (.sys-bestand).",
                "A driver crashed; the minidump usually names which one (.sys file).",
            ),
        ),
        0x9F => (
            "DRIVER_POWER_STATE_FAILURE",
            (
                "Een driver reageerde niet bij slaapstand/ontwaken; update chipset-, netwerk-, USB- en videodrivers en zet Snel opstarten uit.",
                "A driver didn't respond during sleep/wake; update chipset, network, USB and graphics drivers and turn off Fast Startup.",
            ),
        ),
        0xD1 => (
            "DRIVER_IRQL_NOT_LESS_OR_EQUAL",
            (
                "Bijna altijd een driver (netwerk/wifi is de bekendste); de minidump noemt het .sys-bestand.",
                "Almost always a driver (network/Wi-Fi is the classic); the minidump names the .sys file.",
            ),
        ),
        0xEF => (
            "CRITICAL_PROCESS_DIED",
            (
                "Een essentieel Windows-proces stopte; controleer de schijf en herstel systeembestanden (sfc /scannow, DISM).",
                "An essential Windows process stopped; check the disk and repair system files (sfc /scannow, DISM).",
            ),
        ),
        0x116 | 0x117 => (
            "VIDEO_TDR_FAILURE",
            (
                "De videodriver herstelde niet na een time-out: schone driverinstallatie, GPU-overklok uit, voeding en temperaturen controleren.",
                "The graphics driver did not recover after a timeout: clean driver install, GPU overclock off, check power and temperatures.",
            ),
        ),
        0x124 => (
            "WHEA_UNCORRECTABLE_ERROR",
            (
                "Een hardwarefout (CPU, RAM of PCIe): overklok/undervolt terug, BIOS bijwerken, RAM en CPU testen.",
                "A hardware error (CPU, RAM or PCIe): undo overclock/undervolt, update the BIOS, test RAM and CPU.",
            ),
        ),
        0x133 => (
            "DPC_WATCHDOG_VIOLATION",
            (
                "Een driver hield de CPU te lang bezig; vaak opslag (SATA/NVMe-firmware) of netwerk. Gebruik de per-driver DPC-meting.",
                "A driver kept the CPU busy too long; often storage (SATA/NVMe firmware) or network. Use the per-driver DPC measurement.",
            ),
        ),
        0x139 => (
            "KERNEL_SECURITY_CHECK_FAILURE",
            (
                "Vaak een verouderde of beschadigde driver, soms RAM.",
                "Often an outdated or corrupted driver, sometimes RAM.",
            ),
        ),
        0x1E => (
            "KMODE_EXCEPTION_NOT_HANDLED",
            (
                "Een driver veroorzaakte een fout; update drivers en test het RAM.",
                "A driver caused an error; update drivers and test the RAM.",
            ),
        ),
        0xC2 => (
            "BAD_POOL_CALLER",
            (
                "Meestal een driver of beveiligingssoftware.",
                "Usually a driver or security software.",
            ),
        ),
        0x7A => (
            "KERNEL_DATA_INPAGE_ERROR",
            (
                "Windows kon geheugen niet van schijf lezen: controleer de schijf (SMART, kabels) en het RAM.",
                "Windows couldn't read memory back from disk: check the disk (SMART, cables) and the RAM.",
            ),
        ),
        0xF4 => (
            "CRITICAL_OBJECT_TERMINATION",
            (
                "Vaak een schijf- of kabelprobleem bij de systeemschijf.",
                "Often a disk or cable problem with the system drive.",
            ),
        ),
        _ => return None,
    })
}

/// LiveKernelEvent met P1 = 141 (VIDEO_ENGINE_TIMEOUT_DETECTED) of 117 (VIDEO_TDR_TIMEOUT_DETECTED)
/// is een echte GPU-hang. Andere codes (bijv. 193, VIDEO_DXGKRNL_LIVEDUMP) maakt Windows vaak
/// automatisch en zijn meestal onschuldig; die tonen we niet.
pub fn is_gpu_live_kernel_event(message: &str) -> bool {
    message.contains("LiveKernelEvent")
        && message.lines().any(|l| {
            l.trim()
                .strip_prefix("P1:")
                .is_some_and(|v| matches!(v.trim(), "141" | "117"))
        })
}

/// Leest de component uit een WHEA-bericht ("Component: Processor Core", NL "Onderdeel: ...").
pub fn parse_whea_component(message: &str) -> Option<String> {
    message.lines().find_map(|l| {
        let (k, v) = l.split_once(':')?;
        let k = k.trim().to_ascii_lowercase();
        (k == "component" || k == "onderdeel" || k == "komponente")
            .then(|| v.trim().to_string())
            .filter(|v| !v.is_empty())
    })
}

// ---------------------------------------------------------------------------------------------
// De kennisbank
// ---------------------------------------------------------------------------------------------

fn storage_reset() -> Known {
    known(
        (
            "Opslag: schijf-reset / time-out",
            "Storage: disk reset / timeout",
        ),
        SEV_HIGH,
        advice(
            t((
                "De opslagcontroller moest een schijf resetten omdat die niet op tijd reageerde.",
                "The storage controller had to reset a disk because it didn't respond in time.",
            )),
            Some((
                "Tijdens het wachten (vaak 30 seconden of langer) bevriest alles wat die schijf nodig heeft. Dit is een van de bekendste oorzaken van 'de pc hangt even'.",
                "While it waits (often 30 seconds or more), everything that needs that disk freezes. This is one of the best-known causes of 'the PC hangs for a moment'.",
            )),
            &[STEP_DISK_POWER, STEP_SSD_FW, STEP_CABLE, STEP_SMART],
            Some((
                ("Blijft het gebeuren?", "Still happening?"),
                &[
                    (
                        "Update de opslagdriver (Intel RST / AMD chipset), of probeer juist de Microsoft-standaarddriver (stornvme/storahci).",
                        "Update the storage driver (Intel RST / AMD chipset), or try the Microsoft standard driver (stornvme/storahci) instead.",
                    ),
                    STEP_BACKUP,
                ],
            )),
        ),
    )
}

fn disk_retry() -> Known {
    known(
        (
            "Opslag: herhaalde schijfbewerking",
            "Storage: retried disk operation",
        ),
        SEV_MEDIUM,
        advice(
            t((
                "Een schijfbewerking moest opnieuw worden geprobeerd.",
                "A disk operation had to be retried.",
            )),
            Some((
                "Af en toe is onschuldig. Gebeurt het vaak achter elkaar, dan wijst het op energiebesparing van de schijf, een slechte kabel of een schijf die begint te falen.",
                "Occasionally this is harmless. If it happens often in a row, it points to disk power saving, a bad cable or a disk that is starting to fail.",
            )),
            &[STEP_SMART, STEP_DISK_POWER, STEP_CABLE, STEP_SSD_FW],
            None,
        ),
    )
}

fn disk_bad() -> Known {
    known(
        ("Opslag: lees-/schrijffouten", "Storage: read/write errors"),
        SEV_CRITICAL,
        advice(
            t((
                "De schijf meldt beschadigde sectoren of fouten bij lezen/schrijven.",
                "The disk reports bad sectors or read/write errors.",
            )),
            Some((
                "Dit kan leiden tot freezes, vastlopende programma's en dataverlies.",
                "This can lead to freezes, hanging programs and data loss.",
            )),
            &[
                STEP_BACKUP,
                STEP_SMART,
                (
                    "Laat Windows de schijf controleren: open Opdrachtprompt als administrator en voer `chkdsk C: /r` uit (herstart nodig; vervang C: door de juiste schijf).",
                    "Let Windows check the disk: open Command Prompt as administrator and run `chkdsk C: /r` (restart needed; replace C: with the right drive).",
                ),
                STEP_CABLE,
            ],
            Some((
                ("Komen de fouten terug?", "Do the errors come back?"),
                &[(
                    "Vervang de schijf; herhaalde fouten worden zelden vanzelf beter.",
                    "Replace the disk; recurring errors rarely get better by themselves.",
                )],
            )),
        ),
    )
}

fn ntfs() -> Known {
    known(
        (
            "Opslag: bestandssysteem beschadigd",
            "Storage: file system corrupted",
        ),
        SEV_HIGH,
        advice(
            t((
                "Het bestandssysteem (NTFS) is beschadigd geraakt.",
                "The file system (NTFS) has become corrupted.",
            )),
            Some((
                "Vaak het gevolg van een harde reset tijdens een freeze, stroomuitval of een falende schijf.",
                "Often caused by a hard reset during a freeze, a power cut or a failing disk.",
            )),
            &[
                STEP_BACKUP,
                (
                    "Open Opdrachtprompt als administrator en voer `chkdsk C: /f` uit; Windows plant de reparatie bij de volgende herstart.",
                    "Open Command Prompt as administrator and run `chkdsk C: /f`; Windows schedules the repair for the next restart.",
                ),
                STEP_SMART,
            ],
            None,
        ),
    )
}

fn gpu_tdr() -> Known {
    known(
        (
            "Videokaart: driver-time-out (TDR)",
            "Graphics: driver timeout (TDR)",
        ),
        SEV_HIGH,
        advice(
            t((
                "De videodriver reageerde niet meer en is door Windows herstart.",
                "The graphics driver stopped responding and was restarted by Windows.",
            )),
            Some((
                "Het scherm bevriest dan een paar seconden of wordt even zwart. Oorzaken: driverproblemen, een GPU-overklok, te hoge temperatuur of onvoldoende stroom.",
                "The screen freezes for a few seconds or briefly goes black. Causes: driver problems, a GPU overclock, overheating or insufficient power.",
            )),
            &[
                STEP_DDU,
                (
                    "Zet een GPU-overklok of -undervolt terug (MSI Afterburner, AMD Adrenalin-tuning) naar de standaardwaarden.",
                    "Reset any GPU overclock or undervolt (MSI Afterburner, AMD Adrenalin tuning) to default values.",
                ),
                (
                    "Draai de GPU-stresstest in PC Checker en let op temperaturen en artefacten.",
                    "Run the GPU stress test in PC Checker and watch for temperatures and artifacts.",
                ),
                STEP_PSU,
            ],
            Some((
                ("Helpt dat niet?", "Didn't help?"),
                &[
                    (
                        "Zet als test 'Hardwareversnelde GPU-planning' uit (Instellingen → Systeem → Beeldscherm → Graphics).",
                        "As a test, turn off 'Hardware-accelerated GPU scheduling' (Settings → System → Display → Graphics).",
                    ),
                    (
                        "Laptop met twee GPU's: werk zowel de Intel/AMD-driver als de NVIDIA/AMD-driver bij.",
                        "Laptop with two GPUs: update both the Intel/AMD driver and the NVIDIA/AMD driver.",
                    ),
                    STEP_BIOS,
                ],
            )),
        ),
    )
}

fn whea_fatal(message: &str) -> Known {
    let component = parse_whea_component(message);
    let title = match &component {
        Some(c) => crate::tr!(
            format!("Fatale hardwarefout gemeld door: {}.", c),
            format!("Fatal hardware error reported by: {}.", c)
        ),
        None => t((
            "Fatale hardwarefout (WHEA): de pc is vastgelopen of gecrasht door een hardwareprobleem.",
            "Fatal hardware error (WHEA): the PC hung or crashed because of a hardware problem.",
        )),
    };
    known(
        (
            "Hardware: fatale fout (WHEA)",
            "Hardware: fatal error (WHEA)",
        ),
        SEV_CRITICAL,
        advice(
            title,
            Some((
                "De hardware zelf (meestal processor, geheugen of een PCIe-apparaat zoals videokaart of NVMe-SSD) meldde een fout die niet te herstellen was. Eén keer kan toeval zijn; komt het vaker voor, dan is er een echt probleem.",
                "The hardware itself (usually the processor, memory or a PCIe device such as the graphics card or NVMe SSD) reported an error that could not be corrected. Once can be a fluke; if it keeps happening, there is a real problem.",
            )),
            &[
                STEP_OC_RESET,
                STEP_BIOS,
                STEP_RAM_TEST,
                STEP_TEMPS,
                STEP_EVENT_DETAILS,
            ],
            Some((
                ("Komt het steeds terug?", "Does it keep coming back?"),
                &[
                    (
                        "Herplaats de RAM-modules en de videokaart en controleer alle voedingskabels.",
                        "Reseat the RAM modules and the graphics card, and check all power cables.",
                    ),
                    (
                        "Test met één RAM-module tegelijk om een defecte module te vinden.",
                        "Test with one RAM module at a time to find a faulty one.",
                    ),
                    (
                        "Blijven de fouten met standaardinstellingen? Laat processor of moederbord nakijken (garantie).",
                        "Errors persist on default settings? Have the processor or motherboard checked (warranty).",
                    ),
                ],
            )),
        ),
    )
}

fn whea_pcie_corrected() -> Known {
    known(
        (
            "Hardware: gecorrigeerde PCIe-fout",
            "Hardware: corrected PCIe error",
        ),
        SEV_MEDIUM,
        advice(
            t((
                "Een PCIe-apparaat had een verbindingsfout die automatisch is hersteld.",
                "A PCIe device had a link error that was corrected automatically.",
            )),
            Some((
                "Meestal de videokaart, NVMe-SSD of wifi-kaart. Een paar keer is onschuldig; honderden keren kan haperingen geven. De bekendste oorzaak is PCIe-energiebesparing (ASPM).",
                "Usually the graphics card, NVMe SSD or Wi-Fi card. A few times is harmless; hundreds of times can cause stutters. The best-known cause is PCIe power saving (ASPM).",
            )),
            &[
                (
                    "Zet in Energiebeheer → Geavanceerde instellingen → PCI Express 'Link State Power Management' op Uit (en ASPM uit in het BIOS als dat kan).",
                    "In Power Options → Advanced settings → PCI Express, set 'Link State Power Management' to Off (and disable ASPM in the BIOS if possible).",
                ),
                STEP_BIOS,
                (
                    "Herplaats de videokaart of NVMe-SSD; gebruik je een riser-kabel, zet het PCIe-slot in het BIOS vast op Gen 3 of Gen 4 in plaats van Auto.",
                    "Reseat the graphics card or NVMe SSD; if you use a riser cable, set the PCIe slot to Gen 3 or Gen 4 in the BIOS instead of Auto.",
                ),
                STEP_EVENT_DETAILS,
            ],
            None,
        ),
    )
}

fn whea_cpu_mem_corrected() -> Known {
    known(
        (
            "Hardware: gecorrigeerde CPU-/geheugenfout",
            "Hardware: corrected CPU/memory error",
        ),
        SEV_MEDIUM,
        advice(
            t((
                "De processor of het geheugen meldde een fout die nog kon worden gecorrigeerd.",
                "The processor or memory reported an error that could still be corrected.",
            )),
            Some((
                "Dit is een vroeg waarschuwingssignaal: vaak een te scherpe overklok/undervolt of geheugen dat net niet stabiel is.",
                "This is an early warning sign: often an overclock/undervolt that is too aggressive or memory that is just not stable.",
            )),
            &[STEP_OC_RESET, STEP_BIOS, STEP_RAM_TEST, STEP_TEMPS],
            None,
        ),
    )
}

fn unexpected_shutdown(severity: &'static str) -> Known {
    known(
        (
            "Stroom: onverwacht uitgeschakeld",
            "Power: unexpected shutdown",
        ),
        severity,
        advice(
            t((
                "De pc is onverwacht uitgeschakeld of herstart, zonder netjes af te sluiten.",
                "The PC shut down or restarted unexpectedly, without shutting down properly.",
            )),
            Some((
                "Dit gebeurt als je de aan/uit-knop ingedrukt houdt bij een volledige freeze, bij stroomuitval, bij oververhitting of bij een crash zonder blauw scherm.",
                "This happens when you hold the power button during a complete freeze, during a power cut, when overheating, or during a crash without a blue screen.",
            )),
            &[
                (
                    "Heb je zelf de aan/uit-knop gebruikt omdat de pc vastzat? Kijk dan vooral naar de andere gebeurtenissen vlak daarvoor in deze lijst; die wijzen de echte oorzaak aan.",
                    "Did you use the power button yourself because the PC was stuck? Then look mainly at the other events just before it in this list; they point to the real cause.",
                ),
                (
                    "Controleer de stroomvoorziening in het tabblad Stroom & batterij → Hardware-stroomtoevoer.",
                    "Check the power supply in the Power & battery tab → Hardware power delivery.",
                ),
                STEP_PSU,
                STEP_TEMPS,
                STEP_OC_RESET,
            ],
            Some((
                ("Laptop?", "Laptop?"),
                &[(
                    "Controleer de batterijgezondheid; een versleten accu kan bij piekbelasting de stroom laten wegvallen.",
                    "Check the battery health; a worn battery can cut power under peak load.",
                )],
            )),
        ),
    )
}

fn bugcheck(message: &str) -> Known {
    let code = parse_bugcheck_code(message);
    let info = code.and_then(bugcheck_info);
    let title = match (code, info) {
        (Some(c), Some((name, _))) => crate::tr!(
            format!(
                "Windows is gecrasht met een blauw scherm: {} (0x{:X}).",
                name, c
            ),
            format!("Windows crashed with a blue screen: {} (0x{:X}).", name, c)
        ),
        (Some(c), None) => crate::tr!(
            format!(
                "Windows is gecrasht met een blauw scherm (stopcode 0x{:X}).",
                c
            ),
            format!("Windows crashed with a blue screen (stop code 0x{:X}).", c)
        ),
        _ => t((
            "Windows is gecrasht met een blauw scherm (BSOD).",
            "Windows crashed with a blue screen (BSOD).",
        )),
    };
    let why = info.map(|(_, hint)| hint);
    known(
        ("Crash: blauw scherm", "Crash: blue screen"),
        SEV_CRITICAL,
        advice(
            title,
            why,
            &[
                (
                    "Zoek uit welke driver betrokken was: open de crashbestanden in C:\\Windows\\Minidump met BlueScreenView of WinDbg; die tonen het .sys-bestand.",
                    "Find out which driver was involved: open the crash files in C:\\Windows\\Minidump with BlueScreenView or WinDbg; they show the .sys file.",
                ),
                (
                    "Werk die driver bij (of verwijder de bijbehorende software) en draai de Driver Check in PC Checker.",
                    "Update that driver (or remove the related software) and run the Driver Check in PC Checker.",
                ),
                (
                    "Herstel systeembestanden: Opdrachtprompt als administrator → `sfc /scannow`, daarna `DISM /Online /Cleanup-Image /RestoreHealth`.",
                    "Repair system files: Command Prompt as administrator → `sfc /scannow`, then `DISM /Online /Cleanup-Image /RestoreHealth`.",
                ),
                STEP_RAM_TEST,
            ],
            Some((
                (
                    "Komt dezelfde stopcode terug?",
                    "Same stop code keeps coming back?",
                ),
                &[STEP_OC_RESET, STEP_BIOS],
            )),
        ),
    )
}

fn live_kernel_event() -> Known {
    let mut k = gpu_tdr();
    k.category = t((
        "Videokaart: vastgelopen (LiveKernelEvent)",
        "Graphics: hang (LiveKernelEvent)",
    ));
    k.advice.title = t((
        "Windows heeft een vastgelopen videokaart of driver gedetecteerd (LiveKernelEvent).",
        "Windows detected a hung graphics card or driver (LiveKernelEvent).",
    ));
    k
}

fn service_timeout() -> Known {
    known(
        (
            "Systeem: service reageerde niet",
            "System: service not responding",
        ),
        SEV_MEDIUM,
        advice(
            t((
                "Een Windows-service reageerde niet op tijd of stopte onverwacht.",
                "A Windows service didn't respond in time or stopped unexpectedly.",
            )),
            Some((
                "Dit kan het opstarten vertragen of het systeem kort laten hangen. De naam van de service staat in het bericht hierboven.",
                "This can slow down startup or make the system hang briefly. The service's name is in the message above.",
            )),
            &[
                (
                    "Kijk in het bericht welke service het is en bij welke software die hoort (vaak RGB-, monitoring-, VPN- of antivirussoftware).",
                    "Check in the message which service it is and which software it belongs to (often RGB, monitoring, VPN or antivirus software).",
                ),
                (
                    "Werk die software bij of verwijder hem als je hem niet nodig hebt.",
                    "Update that software, or uninstall it if you don't need it.",
                ),
                (
                    "Herstel systeembestanden: Opdrachtprompt als administrator → `sfc /scannow`.",
                    "Repair system files: Command Prompt as administrator → `sfc /scannow`.",
                ),
            ],
            None,
        ),
    )
}

fn resource_exhaustion() -> Known {
    known(
        ("Geheugen: bijna vol", "Memory: almost full"),
        SEV_HIGH,
        advice(
            t((
                "Windows had bijna geen (virtueel) geheugen meer.",
                "Windows was almost out of (virtual) memory.",
            )),
            Some((
                "Als het RAM én het wisselbestand vol raken, bevriest het systeem of worden programma's afgesloten. Het bericht noemt de programma's die het meeste geheugen gebruikten.",
                "When RAM and the page file are both full, the system freezes or programs get closed. The message names the programs that used the most memory.",
            )),
            &[
                (
                    "Kijk in het tabblad Processen (sorteer op RAM) welk programma steeds meer geheugen gebruikt; dat is vaak een geheugenlek. Herstart of update het.",
                    "Check the Processes tab (sort by RAM) for a program whose memory keeps growing; that's often a memory leak. Restart or update it.",
                ),
                (
                    "Laat Windows het wisselbestand beheren: Systeem → Geavanceerde systeeminstellingen → Prestaties → Virtueel geheugen → 'Automatisch beheren'.",
                    "Let Windows manage the page file: System → Advanced system settings → Performance → Virtual memory → 'Automatically manage'.",
                ),
                (
                    "Zorg voor minstens 15-20% vrije ruimte op de C:-schijf.",
                    "Keep at least 15-20% free space on the C: drive.",
                ),
            ],
            Some((
                (
                    "Gebeurt het bij normaal gebruik?",
                    "Happens during normal use?",
                ),
                &[(
                    "Dan is er structureel te weinig RAM; overweeg uitbreiding.",
                    "Then there isn't enough RAM for your workload; consider an upgrade.",
                )],
            )),
        ),
    )
}

fn app_hang() -> Known {
    known(
        (
            "Programma: reageerde niet meer",
            "Program: stopped responding",
        ),
        SEV_MEDIUM,
        advice(
            t((
                "Een programma reageerde niet meer en is afgesloten.",
                "A program stopped responding and was closed.",
            )),
            Some((
                "Dit is een freeze van één programma, niet van heel Windows. De programmanaam staat in het bericht hierboven.",
                "This is a freeze of one program, not of all of Windows. The program's name is in the message above.",
            )),
            &[
                (
                    "Werk het programma bij, of installeer het opnieuw als het vaak gebeurt.",
                    "Update the program, or reinstall it if it happens often.",
                ),
                (
                    "Gaat het vooral mis bij spellen of video? Werk dan ook de videodriver bij.",
                    "Does it mainly happen with games or video? Then also update the graphics driver.",
                ),
                (
                    "Kijk in het tabblad Processen of het programma veel CPU, RAM of schijf gebruikt vlak voor het vastloopt.",
                    "Check the Processes tab for heavy CPU, RAM or disk use by the program right before it hangs.",
                ),
            ],
            None,
        ),
    )
}

fn cpu_firmware_limited() -> Known {
    known(
        ("Processor: snelheid begrensd", "Processor: speed limited"),
        SEV_MEDIUM,
        advice(
            t((
                "De processorsnelheid werd door de firmware begrensd (warmte of stroom).",
                "The processor speed was limited by the firmware (heat or power).",
            )),
            Some((
                "Dat geeft haperingen en lagere prestaties, vooral onder belasting.",
                "That causes stutters and lower performance, especially under load.",
            )),
            &[
                STEP_TEMPS,
                (
                    "Kies het energieplan 'Gebalanceerd' of 'Beste prestaties'.",
                    "Choose the 'Balanced' or 'Best performance' power plan.",
                ),
                (
                    "Laptop: gebruik de originele oplader met het juiste wattage.",
                    "Laptop: use the original charger with the correct wattage.",
                ),
                STEP_BIOS,
            ],
            None,
        ),
    )
}

fn generic(provider: &str) -> Known {
    let p = provider.to_ascii_lowercase();
    if p.contains("whea") {
        return whea_cpu_mem_corrected();
    }
    if p.contains("display")
        || p.contains("nvlddmkm")
        || p.contains("amdkmdag")
        || p.contains("amdwddmg")
    {
        return gpu_tdr();
    }
    if p.contains("stor") || p.contains("nvme") || p.contains("disk") || p.contains("iastor") {
        return disk_retry();
    }
    known(
        ("Systeem: waarschuwing", "System: warning"),
        SEV_MEDIUM,
        advice(
            t((
                "Windows registreerde een fout bij dit onderdeel.",
                "Windows recorded an error for this component.",
            )),
            None,
            &[
                (
                    "Zoek het event-ID en de bron hierboven op bij de fabrikant of in de Microsoft-documentatie.",
                    "Look up the event ID and source above with the manufacturer or in the Microsoft documentation.",
                ),
                (
                    "Werk de bijbehorende driver of software bij.",
                    "Update the related driver or software.",
                ),
            ],
            None,
        ),
    )
}

/// Koppelt een event aan kennis. `None` = niet relevant voor freezes (wordt overgeslagen).
pub fn lookup(provider: &str, id: u32, message: &str) -> Option<Known> {
    let p = provider.to_ascii_lowercase();
    let k = match (p.as_str(), id) {
        (p, 129) if p.starts_with("stor") || p.starts_with("iastor") || p == "nvme" => {
            storage_reset()
        }
        ("disk", 153) => disk_retry(),
        ("disk", 7 | 11 | 51 | 52) => disk_bad(),
        ("ntfs", 55 | 98 | 137 | 140) => ntfs(),
        ("display", 4101) => gpu_tdr(),
        ("nvlddmkm" | "amdkmdag" | "amdwddmg", _) => gpu_tdr(),
        ("microsoft-windows-whea-logger", 1 | 18 | 20 | 46) => whea_fatal(message),
        ("microsoft-windows-whea-logger", 17) => whea_pcie_corrected(),
        ("microsoft-windows-whea-logger", 19 | 47) => whea_cpu_mem_corrected(),
        ("microsoft-windows-kernel-power", 41) => unexpected_shutdown(SEV_HIGH),
        ("microsoft-windows-kernel-power", _) => return None,
        ("eventlog", 6008) => unexpected_shutdown(SEV_MEDIUM),
        ("eventlog", _) => return None,
        ("bugcheck" | "microsoft-windows-wer-systemerrorreporting", 1001) => bugcheck(message),
        ("windows error reporting", _) if is_gpu_live_kernel_event(message) => live_kernel_event(),
        ("windows error reporting", _) => return None,
        ("service control manager", 7009 | 7011 | 7022 | 7031 | 7034) => service_timeout(),
        ("service control manager", _) => return None,
        ("microsoft-windows-resource-exhaustion-detector", 2004) => resource_exhaustion(),
        ("application hang", 1002) => app_hang(),
        ("microsoft-windows-kernel-processor-power", 37) => cpu_firmware_limited(),
        ("microsoft-windows-kernel-processor-power", _) => return None,
        _ => generic(provider),
    };
    Some(k)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::i18n::with_language;

    #[test]
    fn bugcheck_codes_are_parsed_and_named() {
        let en = "The computer has rebooted from a bugcheck.  The bugcheck was: 0x00000133 (0x0000000000000001, 0x0000000000001e00).";
        let nl = "De computer is opnieuw opgestart na een foutcontrole. De foutcontrole was: 0x0000009f (0x0000000000000003, ...).";
        assert_eq!(parse_bugcheck_code(en), Some(0x133));
        assert_eq!(parse_bugcheck_code(nl), Some(0x9F));
        assert_eq!(parse_bugcheck_code("geen code"), None);
        let k = with_language(true, || lookup("BugCheck", 1001, en).unwrap());
        assert!(k.advice.title.contains("DPC_WATCHDOG_VIOLATION"));
        assert!(k.advice.why.unwrap().contains("per-driver"));
        assert_eq!(k.severity, SEV_CRITICAL);
    }

    #[test]
    fn whea_component_is_shown_in_title() {
        let msg = "A fatal hardware error has occurred.\r\n\r\nReported by component: Processor Core\r\nError Source: Machine Check Exception\r\nComponent: Processor Core";
        assert_eq!(parse_whea_component(msg).as_deref(), Some("Processor Core"));
        let k = with_language(true, || {
            lookup("Microsoft-Windows-WHEA-Logger", 18, msg).unwrap()
        });
        assert!(k.advice.title.contains("Processor Core"));
        let plain = with_language(true, || {
            lookup(
                "Microsoft-Windows-WHEA-Logger",
                1,
                "A fatal hardware error has occurred.",
            )
            .unwrap()
        });
        assert!(
            plain
                .advice
                .title
                .starts_with("Fatal hardware error (WHEA)")
        );
        assert!(plain.advice.steps.len() >= 4);
    }

    #[test]
    fn severities_per_event() {
        let sev = |p: &str, id: u32| lookup(p, id, "").map(|k| k.severity);
        assert_eq!(sev("storahci", 129), Some(SEV_HIGH));
        assert_eq!(sev("stornvme", 129), Some(SEV_HIGH));
        assert_eq!(sev("disk", 7), Some(SEV_CRITICAL));
        assert_eq!(sev("disk", 153), Some(SEV_MEDIUM));
        assert_eq!(sev("Microsoft-Windows-WHEA-Logger", 17), Some(SEV_MEDIUM));
        assert_eq!(sev("Microsoft-Windows-Kernel-Power", 41), Some(SEV_HIGH));
        assert_eq!(sev("Application Hang", 1002), Some(SEV_MEDIUM));
        assert_eq!(
            sev("Microsoft-Windows-Resource-Exhaustion-Detector", 2004),
            Some(SEV_HIGH)
        );
    }

    #[test]
    fn noisy_events_are_skipped() {
        assert!(
            lookup(
                "Windows Error Reporting",
                1001,
                "Event Name: LiveKernelEvent
P1: 193
P2: 80e"
            )
            .is_none()
        );
        assert!(lookup("Service Control Manager", 7000, "").is_none());
        assert!(lookup("Microsoft-Windows-Kernel-Power", 109, "").is_none());
        assert!(lookup("EventLog", 6005, "").is_none());
        assert!(lookup("Windows Error Reporting", 1001, "Fault bucket AppCrash").is_none());
        assert!(
            lookup(
                "Windows Error Reporting",
                1001,
                "Event Name: LiveKernelEvent
P1: 141
P2: 0"
            )
            .is_some()
        );
    }

    #[test]
    fn every_advice_has_steps() {
        for (p, id) in [
            ("storahci", 129),
            ("disk", 153),
            ("disk", 7),
            ("Ntfs", 55),
            ("Display", 4101),
            ("Microsoft-Windows-WHEA-Logger", 1),
            ("Microsoft-Windows-WHEA-Logger", 17),
            ("Microsoft-Windows-WHEA-Logger", 19),
            ("Microsoft-Windows-Kernel-Power", 41),
            ("EventLog", 6008),
            ("BugCheck", 1001),
            ("Service Control Manager", 7011),
            ("Microsoft-Windows-Resource-Exhaustion-Detector", 2004),
            ("Application Hang", 1002),
            ("Microsoft-Windows-Kernel-Processor-Power", 37),
            ("SomethingElse", 1),
        ] {
            for en in [false, true] {
                let k = with_language(en, || lookup(p, id, "").unwrap());
                assert!(!k.advice.title.is_empty(), "{p} {id}");
                assert!(!k.advice.steps.is_empty(), "{p} {id}");
                assert!(!k.category.is_empty());
            }
        }
    }
}
