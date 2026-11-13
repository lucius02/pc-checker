//! Uitleg bij de DPC-latency-test: *waarom* het oordeel zo uitvalt (met de gemeten waarden en
//! de grenzen) en een stappenplan dat past bij wat er gemeten is. Ook uitleg bij de grootste
//! veroorzaker uit de per-driver ETW-meting.
//!
//! Alles hier is puur (geen I/O) en wordt los getest.

use crate::latency::{
    CounterStats, DPC_AVG_BAD_PCT, DPC_AVG_WARN_PCT, DPC_MAX_WARN_PCT, MAX_GAP_BAD_US,
    MAX_GAP_GOOD_US, SINGLE_SPIKE_BAD_US,
};
use crate::models::{Advice, DriverLatencyEntry, LatencyFinding};

/// Ernstcodes van een bevinding (Nederlands, net als de andere statuscodes).
pub const F_BAD: &str = "Slecht";
pub const F_WARN: &str = "Matig";
pub const F_GOOD: &str = "Goed";
pub const F_INFO: &str = "Info";

/// Vanaf deze p99 zijn onderbrekingen niet meer incidenteel maar structureel.
const P99_WARN_US: f64 = 250.0;
/// Zoveel pieken ≥ 1 ms maakt het "vaak" in plaats van "af en toe".
const MANY_SPIKES: u64 = 10;

type Pair<'a> = (&'a str, &'a str);

fn t(p: Pair) -> String {
    crate::tr!(p.0, p.1).to_string()
}

/// "850 µs" of "2,40 ms" (NL) / "2.40 ms" (EN).
pub fn fmt_us(us: f64) -> String {
    let s = if us >= 1000.0 {
        format!("{:.2} ms", us / 1000.0)
    } else {
        format!("{:.0} µs", us)
    };
    if crate::i18n::is_english() {
        s
    } else {
        s.replace('.', ",")
    }
}

fn pct(v: f64) -> String {
    let s = format!("{:.2} %", v);
    if crate::i18n::is_english() {
        s
    } else {
        s.replace('.', ",")
    }
}

fn finding(severity: &str, title: String, detail: Pair) -> LatencyFinding {
    LatencyFinding {
        severity: severity.to_string(),
        title,
        detail: t(detail),
    }
}

/// Alle invoer voor de uitleg (los van GapStats, zodat het makkelijk te testen is).
pub struct Measured<'a> {
    pub max_us: f64,
    pub p99_us: f64,
    pub gaps_over_1ms: u64,
    pub counters: &'a CounterStats,
    pub elevated: bool,
    pub driver_check_done: bool,
    /// Drivers die de Driver Check als probleem/verouderd/niet ondertekend markeerde
    /// in klassen die vaak latency veroorzaken.
    pub flagged_drivers: usize,
}

/// Waarom is het oordeel zo? Ernstigste bevindingen eerst.
pub fn explain(m: &Measured) -> Vec<LatencyFinding> {
    let mut out = Vec::new();

    // 1. De langste onderbreking (bepaalt het oordeel het sterkst).
    let max = fmt_us(m.max_us);
    if m.max_us >= MAX_GAP_BAD_US && m.gaps_over_1ms <= 1 && m.max_us < SINGLE_SPIKE_BAD_US {
        out.push(finding(
            F_WARN,
            crate::tr!(
                format!("Eén losse piek van {} (verder geen onderbrekingen boven 1 ms).", max),
                format!("A single spike of {} (no other interruptions above 1 ms).", max)
            ),
            ("Eén piek kan toeval zijn, bijvoorbeeld een achtergrondtaak die net startte. Herhaal de test: komt de piek terug, dan is het een echt probleem.", "One spike can be a coincidence, for example a background task that just started. Repeat the test: if the spike returns, it is a real problem."),
        ));
    } else if m.max_us >= MAX_GAP_BAD_US {
        out.push(finding(
            F_BAD,
            crate::tr!(
                format!("De langste onderbreking was {}; vanaf {} wordt het merkbaar.", max, fmt_us(MAX_GAP_BAD_US)),
                format!("The longest interruption was {}; from {} it becomes noticeable.", max, fmt_us(MAX_GAP_BAD_US))
            ),
            ("Zo lang mocht de meetthread niets doen. Op zo'n moment hapert audio (tikjes, krakend geluid), schokt beeld en reageert de muis traag. Bijna altijd is een driver de oorzaak die te lang een DPC of interrupt afhandelt, of een processorkern die uit een diepe energiebesparende slaapstand (C-state) moet ontwaken.", "For that long the measuring thread was not allowed to run. At such a moment audio glitches (clicks, crackling), video stutters and the mouse lags. The cause is almost always a driver that handles a DPC or interrupt for too long, or a processor core that has to wake from a deep power-saving sleep state (C-state)."),
        ));
    } else if m.max_us >= MAX_GAP_GOOD_US {
        out.push(finding(
            F_WARN,
            crate::tr!(
                format!("De langste onderbreking was {}; 'goed' is onder {}.", max, fmt_us(MAX_GAP_GOOD_US)),
                format!("The longest interruption was {}; 'good' is below {}.", max, fmt_us(MAX_GAP_GOOD_US))
            ),
            ("Bij gewoon gebruik merk je dit meestal niet, maar bij realtime audio met kleine buffers (muziek maken, streamen) kan het tot tikjes leiden.", "In normal use you usually won't notice this, but with real-time audio and small buffers (music production, streaming) it can cause clicks."),
        ));
    } else {
        out.push(finding(
            F_GOOD,
            crate::tr!(
                format!(
                    "De langste onderbreking was {}, ruim onder {}.",
                    max,
                    fmt_us(MAX_GAP_GOOD_US)
                ),
                format!(
                    "The longest interruption was {}, well below {}.",
                    max,
                    fmt_us(MAX_GAP_GOOD_US)
                )
            ),
            (
                "Drivers en energiebeheer houden de processor niet merkbaar bezig.",
                "Drivers and power management don't keep the processor noticeably busy.",
            ),
        ));
    }

    // 2. Hoe vaak het misging.
    if m.gaps_over_1ms >= 2 {
        let sev = if m.gaps_over_1ms >= MANY_SPIKES {
            F_BAD
        } else {
            F_WARN
        };
        out.push(finding(
            sev,
            crate::tr!(
                format!("{} keer een onderbreking van 1 ms of langer.", m.gaps_over_1ms),
                format!("{} interruptions of 1 ms or longer.", m.gaps_over_1ms)
            ),
            ("Herhaalde pieken wijzen op een vaste oorzaak in plaats van toeval: steeds dezelfde driver of dezelfde energie-instelling.", "Repeated spikes point to a fixed cause rather than coincidence: the same driver or the same power setting every time."),
        ));
    }

    // 3. Niet alleen pieken, maar vaak lang.
    if m.p99_us >= P99_WARN_US {
        out.push(finding(
            F_WARN,
            crate::tr!(
                format!("1 % van alle metingen duurde langer dan {}.", fmt_us(m.p99_us)),
                format!("1 % of all samples took longer than {}.", fmt_us(m.p99_us))
            ),
            ("De onderbrekingen zijn niet alleen af en toe lang, maar vaak. Dat past bij een driver die continu veel DPC's maakt (bijv. wifi) of bij agressieve energiebesparing.", "The interruptions aren't just occasionally long, but often. That fits a driver that constantly generates many DPCs (e.g. Wi-Fi) or aggressive power saving."),
        ));
    }

    // 4. Prestatiemeteritems: hoeveel CPU-tijd ging naar DPC's en interrupts.
    let c = m.counters;
    let mut counter = |avg: Option<f64>, peak: Option<f64>, dpc: bool| {
        let (Some(avg), peak) = (avg, peak.unwrap_or(0.0)) else {
            return;
        };
        let sev = if avg >= DPC_AVG_BAD_PCT {
            F_BAD
        } else if avg >= DPC_AVG_WARN_PCT || peak >= DPC_MAX_WARN_PCT {
            F_WARN
        } else {
            return;
        };
        let (title, detail) = if dpc {
            (
                crate::tr!(
                    format!(
                        "De processor besteedde gemiddeld {} (piek {}) aan DPC's; gezond is onder 1 %.",
                        pct(avg),
                        pct(peak)
                    ),
                    format!(
                        "The processor spent on average {} (peak {}) on DPCs; healthy is below 1 %.",
                        pct(avg),
                        pct(peak)
                    )
                ),
                (
                    "DPC's zijn uitgesteld driverwerk. Zoveel tijd betekent dat een driver te veel of te zwaar werk doet; meestal netwerk (wifi), audio of opslag.",
                    "DPCs are deferred driver work. This much time means a driver does too much or too heavy work; usually network (Wi-Fi), audio or storage.",
                ),
            )
        } else {
            (
                crate::tr!(
                    format!(
                        "De processor besteedde gemiddeld {} (piek {}) aan interrupts; gezond is onder 1 %.",
                        pct(avg),
                        pct(peak)
                    ),
                    format!(
                        "The processor spent on average {} (peak {}) on interrupts; healthy is below 1 %.",
                        pct(avg),
                        pct(peak)
                    )
                ),
                (
                    "Hardware vraagt heel vaak om aandacht. Bekende oorzaken: USB-apparaten of -hubs, een netwerkkaart, of een defect apparaat dat een 'interrupt storm' veroorzaakt.",
                    "Hardware asks for attention very often. Known causes: USB devices or hubs, a network card, or a faulty device causing an 'interrupt storm'.",
                ),
            )
        };
        out.push(LatencyFinding {
            severity: sev.to_string(),
            title,
            detail: t(detail),
        });
    };
    counter(c.dpc_avg, c.dpc_max, true);
    counter(c.irq_avg, c.irq_max, false);

    // 5. Driver Check
    if m.flagged_drivers > 0 {
        out.push(finding(
            F_WARN,
            crate::tr!(
                format!("De Driver Check markeerde {} driver(s) in klassen die vaak latency veroorzaken.", m.flagged_drivers),
                format!("The Driver Check flagged {} driver(s) in classes that often cause latency.", m.flagged_drivers)
            ),
            ("Verouderde, niet-ondertekende of foutmeldende netwerk-, audio-, video-, opslag- of USB-drivers zijn de eerste verdachten. Ze staan hieronder bij 'Waarschijnlijke verdachte drivers'.", "Outdated, unsigned or failing network, audio, graphics, storage or USB drivers are the first suspects. They are listed below under 'Likely suspect drivers'."),
        ));
    }

    // 6. Meetomstandigheden (info)
    if !m.elevated {
        out.push(finding(
            F_INFO,
            t(("De meting draaide zonder beheerdersrechten.", "The measurement ran without administrator rights.")),
            ("De meetthread kreeg dan geen realtime-prioriteit, dus een losse piek kan ook gewone Windows-planning zijn. Als beheerder is de meting zuiverder en kun je ook per driver meten.", "The measuring thread then didn't get real-time priority, so an isolated spike may also be ordinary Windows scheduling. As administrator the measurement is cleaner and you can also measure per driver."),
        ));
    }
    if !c.any() {
        out.push(finding(
            F_INFO,
            t((
                "De Windows-prestatiemeteritems (DPC-/interrupt-tijd) waren niet beschikbaar.",
                "The Windows performance counters (DPC/interrupt time) were not available.",
            )),
            (
                "Het oordeel is dan alleen op de timer-metingen gebaseerd.",
                "The verdict is then based on the timer samples only.",
            ),
        ));
    }
    let bad = out
        .iter()
        .any(|f| f.severity == F_BAD || f.severity == F_WARN);
    if bad && !m.driver_check_done {
        out.push(finding(
            F_INFO,
            t(("De Driver Check is nog niet uitgevoerd.", "The Driver Check hasn't been run yet.")),
            ("Voer die eerst uit en herhaal deze test; dan kan PC Checker verdachte drivers aanwijzen.", "Run it first and repeat this test; PC Checker can then point out suspect drivers."),
        ));
    }

    let rank = |s: &str| match s {
        F_BAD => 0,
        F_WARN => 1,
        F_GOOD => 2,
        _ => 3,
    };
    out.sort_by_key(|f| rank(&f.severity));
    out
}

/// Stappenplan dat past bij de bevindingen.
pub fn fix_plan(verdict: &str, m: &Measured) -> Advice {
    if verdict == F_GOOD {
        return Advice {
            title: t((
                "Je systeemlatency is in orde; je hoeft niets te doen.",
                "Your system latency is fine; there's nothing you need to do.",
            )),
            why: Some(t((
                "Krijg je toch haperingen? Herhaal de test terwijl het probleem optreedt (bijv. tijdens het afspelen van audio of een game).",
                "Still getting stutters? Repeat the test while the problem happens (e.g. while playing audio or a game).",
            ))),
            ..Default::default()
        };
    }
    let c = m.counters;
    let irq_high = c.irq_avg.unwrap_or(0.0) >= DPC_AVG_WARN_PCT
        || c.irq_max.unwrap_or(0.0) >= DPC_MAX_WARN_PCT;
    let mut steps: Vec<Pair> = Vec::new();
    if !m.elevated {
        steps.push(("Herstart PC Checker als beheerder en start hieronder de per-driver DPC/ISR-meting: die wijst de driver met de langste DPC's direct aan.", "Restart PC Checker as administrator and start the per-driver DPC/ISR measurement below: it points straight at the driver with the longest DPCs."));
    } else {
        steps.push(("Start hieronder de per-driver DPC/ISR-meting: die wijst de driver met de langste DPC's direct aan.", "Start the per-driver DPC/ISR measurement below: it points straight at the driver with the longest DPCs."));
    }
    steps.push(("Zet tijdelijk het energieplan op 'Hoge prestaties' en herhaal de test. Is het resultaat dan veel beter, dan ligt het aan energiebesparing (C-states, PCIe Link State Power Management).", "Temporarily set the power plan to 'High performance' and repeat the test. If the result is much better, power saving is the cause (C-states, PCIe Link State Power Management)."));
    steps.push(("Zet wifi en bluetooth even uit (of gebruik een netwerkkabel) en test opnieuw; wifi-drivers zijn de bekendste veroorzaker.", "Briefly turn off Wi-Fi and Bluetooth (or use a network cable) and test again; Wi-Fi drivers are the best-known culprit."));
    if irq_high {
        steps.push(("Koppel USB-apparaten één voor één los (hubs, dongles, webcams, headsets) en test na elke stap opnieuw.", "Disconnect USB devices one at a time (hubs, dongles, webcams, headsets) and test again after each step."));
    }
    steps.push(("Werk de netwerk-, audio- en videodrivers bij via de website van de fabrikant (niet via 'driver updater'-programma's).", "Update the network, audio and graphics drivers from the manufacturer's website (not with 'driver updater' programs)."));
    if !irq_high {
        steps.push(("Koppel USB-apparaten één voor één los (vooral hubs, dongles en webcams) en test opnieuw.", "Disconnect USB devices one at a time (especially hubs, dongles and webcams) and test again."));
    }
    Advice {
        title: t(("Zo vind je de veroorzaker en los je het op", "How to find the cause and fix it")),
        why: Some(t(("Werk de stappen van boven naar beneden af en herhaal na elke stap de test, zodat je ziet wat helpt.", "Work through the steps from top to bottom and repeat the test after each step, so you can see what helps."))),
        steps: steps.into_iter().map(t).collect(),
        fallback_title: Some(t(("Nog steeds hoog?", "Still high?"))),
        fallback_steps: [
            ("Update het BIOS en het chipsetpakket via de supportpagina van je moederbord- of laptopfabrikant.", "Update the BIOS and chipset package from your motherboard or laptop manufacturer's support page."),
            ("Zet als test in het BIOS de diepe C-states en ASPM uit; helpt dat, laat ze dan uit of zoek een BIOS-update.", "As a test, disable deep C-states and ASPM in the BIOS; if that helps, keep them off or look for a BIOS update."),
            ("Schakel ongebruikte apparaten uit in Apparaatbeheer (bijv. extra audio-apparaten, ongebruikte netwerkadapters).", "Disable unused devices in Device Manager (e.g. extra audio devices, unused network adapters)."),
        ]
        .into_iter()
        .map(t)
        .collect(),
    }
}

/// Soort driver op basis van de bestandsnaam, voor gericht advies.
fn driver_kind(name: &str) -> &'static str {
    let n = name.to_ascii_lowercase();
    if ["nvlddmkm", "amdkmdag", "atikmdag", "igdkmd", "dxgkrnl"]
        .iter()
        .any(|p| n.starts_with(p))
    {
        "gpu"
    } else if [
        "ndis", "tcpip", "netwtw", "netwbw", "rt640", "rtwlan", "rtux", "e1", "wdiwifi", "killer",
    ]
    .iter()
    .any(|p| n.starts_with(p))
    {
        "net"
    } else if ["storport", "stornvme", "storahci", "iastor", "nvme"]
        .iter()
        .any(|p| n.starts_with(p))
    {
        "storage"
    } else if [
        "portcls",
        "hdaudbus",
        "hdaudio",
        "rtkvhd",
        "rtkhdaud",
        "intcaudiobus",
        "intcbus",
    ]
    .iter()
    .any(|p| n.starts_with(p))
    {
        "audio"
    } else if ["usbxhci", "usbport", "usbhub", "ucx01000"]
        .iter()
        .any(|p| n.starts_with(p))
    {
        "usb"
    } else if ["acpi", "intelppm", "amdppm"]
        .iter()
        .any(|p| n.starts_with(p))
    {
        "power"
    } else if ["ntoskrnl", "wdf01000", "hal"]
        .iter()
        .any(|p| n.starts_with(p))
    {
        "kernel"
    } else {
        "other"
    }
}

/// Uitleg + stappen voor de grootste veroorzaker uit de per-driver ETW-meting.
pub fn driver_fix(top: &DriverLatencyEntry, is_isr: bool) -> Advice {
    let what = top.description.clone().unwrap_or_default();
    let name = if what.is_empty() {
        top.driver.clone()
    } else {
        format!("{} ({})", top.driver, what)
    };
    let value = if is_isr {
        top.isr_max_us
    } else {
        top.dpc_max_us
    };
    let title = crate::tr!(
        format!(
            "De grootste veroorzaker is {}: {} duurde maximaal {}.",
            name,
            if is_isr {
                "een interrupt (ISR)"
            } else {
                "een DPC"
            },
            fmt_us(value)
        ),
        format!(
            "The biggest cause is {}: {} took up to {}.",
            name,
            if is_isr {
                "an interrupt (ISR)"
            } else {
                "a DPC"
            },
            fmt_us(value)
        )
    );
    let (why, steps): (Pair, Vec<Pair>) = match driver_kind(&top.driver) {
        "gpu" => (
            (
                "Dit is de videodriver. Lange DPC's van de videodriver geven haperend beeld en tikkend geluid, vooral bij games en video.",
                "This is the graphics driver. Long DPCs from the graphics driver cause stuttering video and clicking audio, especially in games and video.",
            ),
            vec![
                (
                    "Doe een schone installatie van de nieuwste videodriver: verwijder de oude met DDU in Veilige modus en installeer daarna de nieuwe.",
                    "Do a clean install of the latest graphics driver: remove the old one with DDU in Safe Mode, then install the new one.",
                ),
                (
                    "Zet overlays en opnamesoftware uit (GeForce Experience/NVIDIA App-overlay, AMD Adrenalin-overlay, Xbox Game Bar).",
                    "Turn off overlays and recording software (GeForce Experience/NVIDIA App overlay, AMD Adrenalin overlay, Xbox Game Bar).",
                ),
                (
                    "Zet in het NVIDIA-/AMD-configuratiescherm energiebeheer op 'Maximale prestaties' en test opnieuw.",
                    "Set power management to 'Prefer maximum performance' in the NVIDIA/AMD control panel and test again.",
                ),
            ],
        ),
        "net" => (
            (
                "Dit is de netwerkdriver (vaak wifi). Netwerkdrivers zijn de bekendste bron van hoge DPC-latency.",
                "This is the network driver (often Wi-Fi). Network drivers are the best-known source of high DPC latency.",
            ),
            vec![
                (
                    "Download de nieuwste driver voor je netwerk-/wifi-kaart bij Intel, Realtek, Killer of je laptopfabrikant.",
                    "Download the latest driver for your network/Wi-Fi card from Intel, Realtek, Killer or your laptop manufacturer.",
                ),
                (
                    "Open Apparaatbeheer → de netwerkadapter → Geavanceerd en zet energiebesparende opties uit ('Energy Efficient Ethernet', 'Green Ethernet', 'Power Saving Mode'); zet op het tabblad Energiebeheer 'Computer mag dit apparaat uitschakelen' uit.",
                    "Open Device Manager → the network adapter → Advanced and turn off power-saving options ('Energy Efficient Ethernet', 'Green Ethernet', 'Power Saving Mode'); on the Power Management tab, untick 'Allow the computer to turn off this device'.",
                ),
                (
                    "Test met wifi uit en een netwerkkabel; is het probleem dan weg, dan ligt het aan de wifi-driver of -kaart.",
                    "Test with Wi-Fi off and a network cable; if the problem is gone, the Wi-Fi driver or card is to blame.",
                ),
            ],
        ),
        "storage" => (
            (
                "Dit is de opslagdriver (SSD/NVMe/SATA). Lange DPC's hier komen vaak door schijffirmware of energiebesparing van de schijf.",
                "This is the storage driver (SSD/NVMe/SATA). Long DPCs here often come from disk firmware or disk power saving.",
            ),
            vec![
                (
                    "Update de firmware van je SSD met de tool van de fabrikant.",
                    "Update your SSD firmware with the manufacturer's tool.",
                ),
                (
                    "Zet in Energiebeheer 'PCI Express → Link State Power Management' op Uit en 'Harde schijf uitschakelen na' op 0.",
                    "In Power Options set 'PCI Express → Link State Power Management' to Off and 'Turn off hard disk after' to 0.",
                ),
                (
                    "Update de opslagdriver (Intel RST / AMD chipset), of probeer juist de Microsoft-standaarddriver.",
                    "Update the storage driver (Intel RST / AMD chipset), or try the Microsoft standard driver instead.",
                ),
            ],
        ),
        "audio" => (
            (
                "Dit is de audiodriver. Dat geeft direct hoorbare tikjes en krakend geluid.",
                "This is the audio driver. That directly causes audible clicks and crackling.",
            ),
            vec![
                (
                    "Installeer de nieuwste audiodriver van je laptop- of moederbordfabrikant (Realtek/Intel Smart Sound).",
                    "Install the latest audio driver from your laptop or motherboard manufacturer (Realtek/Intel Smart Sound).",
                ),
                (
                    "Schakel ongebruikte audio-apparaten uit in Apparaatbeheer (bijv. HDMI-audio van de videokaart als je die niet gebruikt).",
                    "Disable unused audio devices in Device Manager (e.g. the graphics card's HDMI audio if you don't use it).",
                ),
                (
                    "Zet geluidsverbeteringen (enhancements, Sonic Studio, Nahimic) uit en test opnieuw.",
                    "Turn off audio enhancements (Sonic Studio, Nahimic and similar) and test again.",
                ),
            ],
        ),
        "usb" => (
            (
                "Dit is de USB-controller. Vaak zit de oorzaak in een aangesloten apparaat.",
                "This is the USB controller. The cause is often a connected device.",
            ),
            vec![
                (
                    "Koppel USB-apparaten één voor één los (hubs, dongles, webcams, headsets) en test na elke stap opnieuw.",
                    "Disconnect USB devices one at a time (hubs, dongles, webcams, headsets) and test after each step.",
                ),
                (
                    "Zet 'Selectief onderbreken van USB' uit in Energiebeheer → Geavanceerde instellingen.",
                    "Turn off 'USB selective suspend' in Power Options → Advanced settings.",
                ),
                (
                    "Update het chipsetpakket van de fabrikant (bevat de USB-controllerdriver).",
                    "Update the manufacturer's chipset package (it contains the USB controller driver).",
                ),
            ],
        ),
        "power" => (
            (
                "Dit is energiebeheer (ACPI/processor). De processor wordt dan vaak uit een diepe slaapstand gehaald of de firmware reageert traag.",
                "This is power management (ACPI/processor). The processor is often being woken from a deep sleep state, or the firmware responds slowly.",
            ),
            vec![
                (
                    "Zet het energieplan op 'Hoge prestaties' en test opnieuw.",
                    "Set the power plan to 'High performance' and test again.",
                ),
                (
                    "Update het BIOS en het chipsetpakket.",
                    "Update the BIOS and the chipset package.",
                ),
                (
                    "Zet als test diepe C-states uit in het BIOS.",
                    "As a test, disable deep C-states in the BIOS.",
                ),
            ],
        ),
        "kernel" => (
            (
                "Dit is een onderdeel van Windows zelf (kernel/framework). Dat is meestal de boodschapper: het werk wordt namens een andere driver gedaan.",
                "This is a part of Windows itself (kernel/framework). That's usually the messenger: the work is done on behalf of another driver.",
            ),
            vec![
                (
                    "Kijk naar de tweede en derde driver in de lijst; die zijn vaak de echte veroorzaker.",
                    "Look at the second and third driver in the list; those are often the real cause.",
                ),
                (
                    "Zet het energieplan op 'Hoge prestaties' en test opnieuw.",
                    "Set the power plan to 'High performance' and test again.",
                ),
                (
                    "Update het BIOS en het chipsetpakket.",
                    "Update the BIOS and the chipset package.",
                ),
            ],
        ),
        _ => (
            (
                "Zoek op bij welk apparaat of welke software dit driverbestand hoort (bijv. door de naam op te zoeken).",
                "Find out which device or software this driver file belongs to (e.g. by searching for its name).",
            ),
            vec![
                (
                    "Werk die driver of software bij via de fabrikant.",
                    "Update that driver or software from the manufacturer.",
                ),
                (
                    "Heb je het apparaat of de software niet nodig, schakel het dan uit in Apparaatbeheer of verwijder de software, en test opnieuw.",
                    "If you don't need the device or software, disable it in Device Manager or uninstall the software, and test again.",
                ),
            ],
        ),
    };
    Advice {
        title,
        why: Some(t(why)),
        steps: steps.into_iter().map(t).collect(),
        fallback_title: None,
        fallback_steps: Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::i18n::with_language;

    fn m(max: f64, p99: f64, spikes: u64, c: &CounterStats) -> Measured<'_> {
        Measured {
            max_us: max,
            p99_us: p99,
            gaps_over_1ms: spikes,
            counters: c,
            elevated: true,
            driver_check_done: true,
            flagged_drivers: 0,
        }
    }

    #[test]
    fn good_result_explains_why_good() {
        let c = CounterStats {
            dpc_avg: Some(0.2),
            dpc_max: Some(1.0),
            irq_avg: Some(0.1),
            irq_max: Some(0.5),
            dpcq_avg: Some(100.0),
            name_source: None,
        };
        let f = with_language(false, || explain(&m(180.0, 40.0, 0, &c)));
        assert_eq!(f.len(), 1);
        assert_eq!(f[0].severity, F_GOOD);
        assert!(f[0].title.contains("180 µs"));
        let plan = with_language(false, || fix_plan(F_GOOD, &m(180.0, 40.0, 0, &c)));
        assert!(plan.steps.is_empty());
    }

    #[test]
    fn bad_result_lists_causes_worst_first() {
        let c = CounterStats {
            dpc_avg: Some(4.2),
            dpc_max: Some(18.0),
            irq_avg: Some(0.2),
            irq_max: Some(1.0),
            dpcq_avg: None,
            name_source: None,
        };
        let mut input = m(5400.0, 600.0, 23, &c);
        input.elevated = false;
        input.flagged_drivers = 2;
        let f = with_language(true, || explain(&input));
        assert_eq!(f[0].severity, F_BAD);
        assert!(f.iter().any(|x| x.title.contains("5.40 ms")));
        assert!(f.iter().any(|x| x.title.contains("23 interruptions")));
        assert!(
            f.iter()
                .any(|x| x.title.contains("DPCs") && x.severity == F_BAD)
        );
        assert!(f.iter().any(|x| x.title.contains("flagged 2")));
        assert_eq!(f.last().unwrap().severity, F_INFO);
        let plan = with_language(true, || fix_plan("Slecht", &input));
        assert!(plan.steps[0].contains("administrator"));
        assert!(plan.steps.len() >= 4);
        assert!(!plan.fallback_steps.is_empty());
    }

    #[test]
    fn single_spike_is_explained_as_possible_coincidence() {
        let c = CounterStats::default();
        let f = with_language(true, || explain(&m(2600.0, 30.0, 1, &c)));
        assert_eq!(f[0].severity, F_WARN);
        assert!(f[0].title.starts_with("A single spike"));
        // Prestatiemeteritems ontbraken: dat wordt als info gemeld.
        assert!(f.iter().any(|x| x.severity == F_INFO));
    }

    #[test]
    fn driver_fix_is_specific_per_driver_kind() {
        let e = |d: &str| DriverLatencyEntry {
            driver: d.into(),
            description: None,
            dpc_max_us: 2500.0,
            ..Default::default()
        };
        let gpu = with_language(true, || driver_fix(&e("nvlddmkm.sys"), false));
        assert!(gpu.title.contains("nvlddmkm.sys") && gpu.title.contains("2.50 ms"));
        assert!(gpu.steps[0].contains("DDU"));
        let net = with_language(true, || driver_fix(&e("Netwtw10.sys"), false));
        assert!(net.why.unwrap().contains("network"));
        let k = with_language(false, || driver_fix(&e("ntoskrnl.exe"), false));
        assert!(k.why.unwrap().contains("boodschapper"));
        assert!(
            !with_language(false, || driver_fix(&e("foo.sys"), true))
                .steps
                .is_empty()
        );
    }

    #[test]
    fn microseconds_are_formatted_per_language() {
        assert_eq!(with_language(false, || fmt_us(2400.0)), "2,40 ms");
        assert_eq!(with_language(true, || fmt_us(2400.0)), "2.40 ms");
        assert_eq!(with_language(true, || fmt_us(850.4)), "850 µs");
    }

    /// Schrijft een voorbeeld-`LatencyTestResult` met een slecht resultaat naar het pad in
    /// `PCC_LATENCY_JSON`, om de UI zonder echte haperingen te bekijken (taal: `PCC_LANG`).
    #[test]
    #[ignore = "alleen voor het bekijken van de UI"]
    fn preview_bad_latency_json() {
        let english = std::env::var("PCC_LANG").is_ok_and(|l| l == "en");
        let c = CounterStats {
            dpc_avg: Some(4.2),
            dpc_max: Some(18.0),
            irq_avg: Some(0.3),
            irq_max: Some(1.2),
            dpcq_avg: Some(5200.0),
            name_source: None,
        };
        let input = Measured {
            max_us: 5400.0,
            p99_us: 610.0,
            gaps_over_1ms: 23,
            counters: &c,
            elevated: false,
            driver_check_done: true,
            flagged_drivers: 2,
        };
        let (reasons, fix) =
            with_language(english, || (explain(&input), fix_plan("Slecht", &input)));
        let r = crate::models::LatencyTestResult {
            success: true,
            duration_ms: 10_000,
            timer_samples: 4_200_000,
            timer_max_gap_us: 5400.0,
            timer_avg_gap_us: 2.4,
            timer_p99_gap_us: 610.0,
            histogram: vec![],
            dpc_time_percent_avg: c.dpc_avg,
            dpc_time_percent_max: c.dpc_max,
            interrupt_time_percent_avg: c.irq_avg,
            interrupt_time_percent_max: c.irq_max,
            dpcs_queued_per_sec_avg: c.dpcq_avg,
            verdict: "Slecht".into(),
            summary: String::new(),
            suspected_drivers: vec![],
            advice: vec![],
            reasons,
            fix,
            error: None,
        };
        if let Ok(path) = std::env::var("PCC_LATENCY_JSON") {
            std::fs::write(path, serde_json::to_string(&r).unwrap()).unwrap();
        }
    }
}
