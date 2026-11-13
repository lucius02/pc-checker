//! Wordt de driver (of het apparaat) nog ondersteund door de fabrikant?
//!
//! Twee bronnen, allebei offline en voorspelbaar:
//! 1. Een korte lijst videochip-families waarvan de fabrikant publiek heeft gemeld dat er geen
//!    (of alleen nog beperkt) nieuwe drivers komen. Alleen families waarover dat vaststaat.
//! 2. Een vuistregel: een driver van een fabrikant (geen Microsoft-standaarddriver) die gemaakt
//!    is vóór Windows 10 bestond (29 juli 2015), is vrijwel zeker nooit voor Windows 10/11
//!    bijgewerkt.
//!
//! Geen ondersteuning betekent níet dat er iets mis is: de laatste driver blijft werken. Het
//! advies is daarom bewust "alleen iets doen als je er iets van merkt".

use chrono::NaiveDate;

use crate::models::{Advice, DriverSupport};

/// Fabrikant brengt geen drivers meer uit, ook geen beveiligingsupdates.
pub const SUPPORT_ENDED: &str = "ended";
/// Alleen nog beveiligings- of kritieke fixes; geen nieuwe functies of game-optimalisaties.
pub const SUPPORT_LEGACY: &str = "legacy";
/// Vuistregel: driver van vóór Windows 10, dus vrijwel zeker nooit meer bijgewerkt.
pub const SUPPORT_LIKELY_ENDED: &str = "likely_ended";

/// Release van Windows 10.
fn windows10_release() -> NaiveDate {
    NaiveDate::from_ymd_opt(2015, 7, 29).expect("geldige datum")
}

/// Klassen met echte hardware waarvoor de vuistregel zinvol is. SYSTEM (chipset-INF's) bewust
/// niet: die zijn vaak oud zonder dat dat iets uitmaakt.
const HARDWARE_CLASSES: &[&str] = &[
    "DISPLAY",
    "NET",
    "MEDIA",
    "AUDIOENDPOINT",
    "USB",
    "SCSIADAPTER",
    "HDC",
];

/// Eerste getal (alleen cijfers) direct na `marker` in `name`, bijv. ("geforce gtx 1060", "gtx ") → 1060.
fn number_after(name: &str, marker: &str) -> Option<u32> {
    let rest = &name[name.find(marker)? + marker.len()..];
    let digits: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
    digits.parse().ok()
}

/// Bekende videochip-families: (niveau, fabrikant, reden NL, reden EN).
fn gpu_family(name: &str) -> Option<(&'static str, &'static str, &'static str, &'static str)> {
    let n = name.to_lowercase();

    if n.contains("nvidia") || n.contains("geforce") {
        let model = number_after(&n, "gtx ")
            .or_else(|| number_after(&n, "gt "))
            .or_else(|| number_after(&n, "mx"));
        let is_mx = n.contains(" mx");
        // Maxwell / Pascal / Volta: GTX 745/750, 900-serie, 10-serie, MX100-300, Titan X/Xp/V.
        let legacy = match model {
            Some(m) if is_mx => (100..400).contains(&m),
            Some(m) => {
                m == 745 || m == 750 || (900..1000).contains(&m) || (1000..1100).contains(&m)
            }
            None => n.contains("titan x") || n.contains("titan v"),
        };
        if legacy {
            return Some((
                SUPPORT_LEGACY,
                "NVIDIA",
                "NVIDIA heeft gemeld dat de 580-driverreeks de laatste is met nieuwe functies en game-optimalisaties voor de GeForce 900- en 10-serie (Maxwell, Pascal, Volta). Daarna komen er alleen nog beveiligingsupdates.",
                "NVIDIA has announced that the 580 driver branch is the last with new features and game optimisations for the GeForce 900 and 10 series (Maxwell, Pascal, Volta). After that only security updates follow.",
            ));
        }
        // Fermi / Kepler: GeForce 400 t/m 700 (behalve 745/750 hierboven).
        if let Some(m) = model.filter(|_| !is_mx)
            && (400..800).contains(&m)
        {
            return Some((
                SUPPORT_ENDED,
                "NVIDIA",
                "NVIDIA brengt voor de GeForce 400- t/m 700-serie (Fermi, Kepler) geen drivers meer uit: nieuwe functies stopten in 2021, beveiligingsupdates in 2024.",
                "NVIDIA no longer releases drivers for the GeForce 400 to 700 series (Fermi, Kepler): new features stopped in 2021, security updates in 2024.",
            ));
        }
        return None;
    }

    if n.contains("radeon") {
        let hd = number_after(&n, "radeon hd ");
        let r_series = [
            "radeon r5",
            "radeon r7",
            "radeon r9",
            "radeon(tm) r5",
            "radeon(tm) r7",
            "radeon(tm) r9",
        ]
        .iter()
        .any(|p| n.contains(p));
        if hd.is_some_and(|m| (5000..9000).contains(&m)) || r_series || n.contains("fury") {
            return Some((
                SUPPORT_ENDED,
                "AMD",
                "AMD brengt voor de Radeon HD 5000 t/m 8000, R5/R7/R9 en Fury geen drivers meer uit (gestopt in 2021).",
                "AMD no longer releases drivers for the Radeon HD 5000 to 8000, R5/R7/R9 and Fury (stopped in 2021).",
            ));
        }
        let rx = number_after(&n, "rx ");
        if rx.is_some_and(|m| (400..600).contains(&m))
            || n.contains("vega")
            || n.contains("radeon vii")
        {
            return Some((
                SUPPORT_LEGACY,
                "AMD",
                "AMD heeft de RX 400/500-serie en Vega naar een aparte onderhoudsdriver verplaatst: alleen nog kritieke fixes, geen nieuwe game-optimalisaties.",
                "AMD has moved the RX 400/500 series and Vega to a separate maintenance driver: only critical fixes, no new game optimisations.",
            ));
        }
        return None;
    }

    if n.contains("intel") {
        // HD Graphics 2000-6200 en Iris (Pro) 5100-6200: 2e t/m 5e generatie Core.
        let hd = number_after(&n, "hd graphics ");
        let iris = number_after(&n, "graphics ").filter(|_| n.contains("iris"));
        if hd.is_some_and(|m| (2000..6300).contains(&m))
            || iris.is_some_and(|m| (5000..6300).contains(&m))
        {
            return Some((
                SUPPORT_ENDED,
                "Intel",
                "Intel brengt voor de graphics van 2e t/m 5e generatie Core-processors (HD Graphics 2000-6200) geen drivers meer uit.",
                "Intel no longer releases drivers for the graphics of 2nd to 5th generation Core processors (HD Graphics 2000-6200).",
            ));
        }
        // HD 5xx/6xx, UHD 6xx en Iris Plus 6xx: 6e t/m 10e generatie Core.
        let gen9 = hd
            .or_else(|| number_after(&n, "uhd graphics "))
            .or(iris)
            .is_some_and(|m| (500..700).contains(&m));
        if gen9 {
            return Some((
                SUPPORT_LEGACY,
                "Intel",
                "Intel geeft de graphics van 6e t/m 10e generatie Core-processors alleen nog beperkte (legacy) ondersteuning: af en toe een beveiligingsupdate, geen nieuwe functies.",
                "Intel only gives the graphics of 6th to 10th generation Core processors limited (legacy) support: an occasional security update, no new features.",
            ));
        }
    }
    None
}

/// Bepaalt of deze driver nog ondersteund wordt. `None` = geen aanwijzing dat dat niet zo is.
pub fn support_for(
    name: &str,
    class: &str,
    date: Option<NaiveDate>,
    is_inbox: bool,
) -> Option<DriverSupport> {
    let t = |nl: &str, en: &str| crate::tr!(nl, en).to_string();

    if class == "DISPLAY"
        && let Some((level, vendor, nl, en)) = gpu_family(name)
    {
        return Some(DriverSupport {
            level: level.to_string(),
            reason: t(nl, en),
            guide: gpu_guide(vendor, level),
        });
    }

    let old = date.is_some_and(|d| d < windows10_release());
    if old && !is_inbox && HARDWARE_CLASSES.contains(&class) {
        return Some(DriverSupport {
            level: SUPPORT_LIKELY_ENDED.to_string(),
            reason: t(
                "Deze driver is gemaakt vóór Windows 10 bestond (2015) en sindsdien niet bijgewerkt. De fabrikant ondersteunt dit apparaat waarschijnlijk niet meer.",
                "This driver was made before Windows 10 existed (2015) and has not been updated since. The manufacturer probably no longer supports this device.",
            ),
            guide: generic_guide(),
        });
    }
    None
}

/// Uitleg die bij elke handleiding voorop staat: je hoeft pas iets te doen als je iets merkt.
fn only_if_noticed() -> String {
    crate::tr!(
        "Zolang alles goed werkt hoef je niets te doen: de laatste driver blijft gewoon werken. Doe dit alleen als je klachten hebt met dit apparaat, zoals vastlopers, beeldfouten of programma's en games die niet (meer) starten.",
        "As long as everything works you don't need to do anything: the last driver keeps working. Only do this if you have problems with this device, such as freezes, display glitches or programs and games that won't start (any more)."
    )
    .to_string()
}

fn optional_updates_step() -> String {
    crate::tr!(
        "Werkt dat slechter, of vind je hem niet? Laat Windows een driver kiezen: Instellingen → Windows Update → Geavanceerde opties → Optionele updates → Driverupdates.",
        "Does that work worse, or can't you find it? Let Windows pick a driver: Settings → Windows Update → Advanced options → Optional updates → Driver updates."
    )
    .to_string()
}

fn gpu_guide(vendor: &str, level: &str) -> Advice {
    Advice {
        title: crate::tr!(
            "Merk je er iets van? Zo pak je het aan",
            "Noticing problems? Here's what to do"
        )
        .to_string(),
        why: Some(only_if_noticed()),
        steps: vec![
            crate::tr!(
                format!(
                    "Installeer de laatst uitgebrachte driver voor jouw model. Die blijft downloadbaar op de website van {vendor}: zoek op je exacte model (de naam hierboven). Een pc heeft vaak nog een oudere versie dan de laatste."
                ),
                format!(
                    "Install the last released driver for your model. It stays available on the {vendor} website: search for your exact model (the name above). A PC often still has an older version than the last one."
                )
            ),
            optional_updates_step(),
            if level == SUPPORT_LEGACY {
                crate::tr!(
                    "Weiger een nieuw spel of programma te starten omdat het een nieuwere driver eist? Dan helpt op termijn alleen nieuwere hardware: bij een desktop een andere videokaart. Ingebouwde graphics van een laptop zijn niet los te vervangen.",
                    "Does a new game or program refuse to start because it needs a newer driver? Then in the long run only newer hardware helps: in a desktop another graphics card. A laptop's built-in graphics can't be replaced separately."
                )
                .to_string()
            } else {
                crate::tr!(
                    "Blijven de klachten, of eist een programma een nieuwere driver? Dan helpt alleen andere hardware: bij een desktop is een eenvoudige nieuwere videokaart genoeg. Ingebouwde graphics van een laptop zijn niet los te vervangen.",
                    "Do the problems persist, or does a program require a newer driver? Then only other hardware helps: in a desktop a simple newer graphics card is enough. A laptop's built-in graphics can't be replaced separately."
                )
                .to_string()
            },
        ],
        ..Default::default()
    }
}

fn generic_guide() -> Advice {
    Advice {
        title: crate::tr!(
            "Merk je er iets van? Zo pak je het aan",
            "Noticing problems? Here's what to do"
        )
        .to_string(),
        why: Some(only_if_noticed()),
        steps: vec![
            crate::tr!(
                "Kijk op de supportpagina van je laptop- of moederbordfabrikant (of van het apparaat zelf) of er toch een driver voor Windows 10/11 is.",
                "Check the support page of your laptop or motherboard maker (or of the device itself) whether there is a driver for Windows 10/11 after all."
            )
            .to_string(),
            optional_updates_step(),
            crate::tr!(
                "Werkt het apparaat niet goed en is er geen nieuwere driver? Vervang het dan. Losse onderdelen zoals een wifi-adapter, geluidskaart of USB-kaart zijn meestal goedkoop.",
                "Does the device not work properly and is there no newer driver? Then replace it. Separate parts such as a Wi-Fi adapter, sound card or USB card are usually cheap."
            )
            .to_string(),
        ],
        ..Default::default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn level(name: &str) -> Option<String> {
        support_for(name, "DISPLAY", None, false).map(|s| s.level)
    }

    #[test]
    fn nvidia_families() {
        assert_eq!(
            level("NVIDIA GeForce GTX 770").as_deref(),
            Some(SUPPORT_ENDED)
        );
        assert_eq!(
            level("NVIDIA GeForce GT 710").as_deref(),
            Some(SUPPORT_ENDED)
        );
        assert_eq!(
            level("NVIDIA GeForce GTX 480").as_deref(),
            Some(SUPPORT_ENDED)
        );
        assert_eq!(
            level("NVIDIA GeForce GTX 750 Ti").as_deref(),
            Some(SUPPORT_LEGACY)
        );
        assert_eq!(
            level("NVIDIA GeForce GTX 1060 6GB").as_deref(),
            Some(SUPPORT_LEGACY)
        );
        assert_eq!(
            level("NVIDIA GeForce GT 1030").as_deref(),
            Some(SUPPORT_LEGACY)
        );
        assert_eq!(
            level("NVIDIA GeForce GTX 970").as_deref(),
            Some(SUPPORT_LEGACY)
        );
        assert_eq!(
            level("NVIDIA GeForce MX150").as_deref(),
            Some(SUPPORT_LEGACY)
        );
        assert_eq!(level("NVIDIA TITAN Xp").as_deref(), Some(SUPPORT_LEGACY));
        // Nog volledig ondersteund.
        assert_eq!(level("NVIDIA GeForce GTX 1660 SUPER"), None);
        assert_eq!(level("NVIDIA GeForce RTX 3060"), None);
        assert_eq!(level("NVIDIA GeForce MX450"), None);
    }

    #[test]
    fn amd_families() {
        assert_eq!(level("AMD Radeon HD 7970").as_deref(), Some(SUPPORT_ENDED));
        assert_eq!(level("AMD Radeon R9 290").as_deref(), Some(SUPPORT_ENDED));
        assert_eq!(
            level("AMD Radeon(TM) R7 Graphics").as_deref(),
            Some(SUPPORT_ENDED)
        );
        assert_eq!(
            level("AMD Radeon R9 Fury X").as_deref(),
            Some(SUPPORT_ENDED)
        );
        assert_eq!(
            level("Radeon RX 580 Series").as_deref(),
            Some(SUPPORT_LEGACY)
        );
        assert_eq!(
            level("AMD Radeon RX Vega 11 Graphics").as_deref(),
            Some(SUPPORT_LEGACY)
        );
        assert_eq!(level("AMD Radeon RX 6700 XT"), None);
        assert_eq!(level("AMD Radeon(TM) Graphics"), None);
    }

    #[test]
    fn intel_families() {
        assert_eq!(
            level("Intel(R) HD Graphics 4000").as_deref(),
            Some(SUPPORT_ENDED)
        );
        assert_eq!(
            level("Intel(R) Iris(TM) Pro Graphics 5200").as_deref(),
            Some(SUPPORT_ENDED)
        );
        assert_eq!(
            level("Intel(R) HD Graphics 620").as_deref(),
            Some(SUPPORT_LEGACY)
        );
        assert_eq!(
            level("Intel(R) UHD Graphics 630").as_deref(),
            Some(SUPPORT_LEGACY)
        );
        assert_eq!(
            level("Intel(R) Iris(R) Plus Graphics 655").as_deref(),
            Some(SUPPORT_LEGACY)
        );
        assert_eq!(level("Intel(R) Iris(R) Xe Graphics"), None);
        assert_eq!(level("Intel(R) Arc(TM) 140T GPU (32GB)"), None);
        assert_eq!(level("Intel(R) UHD Graphics"), None);
    }

    #[test]
    fn pre_windows10_rule() {
        let d = |s: &str| NaiveDate::parse_from_str(s, "%Y-%m-%d").ok();
        let old_wifi = support_for(
            "Realtek RTL8188 Wireless LAN",
            "NET",
            d("2013-05-02"),
            false,
        );
        assert_eq!(
            old_wifi.map(|s| s.level).as_deref(),
            Some(SUPPORT_LIKELY_ENDED)
        );
        // Na de release van Windows 10, Microsoft-standaarddriver of systeemklasse: niet melden.
        assert!(support_for("Realtek RTL8188", "NET", d("2016-01-01"), false).is_none());
        assert!(support_for("USB Root Hub", "USB", d("2013-05-02"), true).is_none());
        assert!(support_for("Intel SMBus", "SYSTEM", d("2013-05-02"), false).is_none());
        assert!(support_for("Realtek RTL8188", "NET", None, false).is_none());
    }

    #[test]
    fn guide_says_only_when_noticed() {
        let s = support_for("NVIDIA GeForce GTX 770", "DISPLAY", None, false).unwrap();
        assert!(s.guide.why.unwrap().contains("hoef je niets te doen"));
        assert!(s.guide.steps[0].contains("NVIDIA"));
    }
}
