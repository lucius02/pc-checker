//! Netwerkgezondheid: wifi-kwaliteit (signaal, band, standaard, snelheid) en adaptergezondheid
//! (link-snelheid, fout-/weggegooide pakketten, energiebesparing). Problemen worden uitgelegd met
//! een stappenplan, net als bij de Driver Check en de Freeze Detective.
//!
//! - Windows: wifi via de Native Wifi API (wlanapi, taalonafhankelijk), adapters via
//!   `Get-NetAdapter*` (alleen fysieke adapters die verbonden zijn).
//! - Linux: `/sys/class/net` en `/proc/net/wireless`.
//!
//! De analyse ([`analyze`]) is puur en wordt los getest.

use serde_json::Value;

use crate::models::{Advice, NetworkAdapterHealth, NetworkHealthReport, NetworkIssue, WifiInfo};

pub const SEV_HIGH: &str = "Hoog";
pub const SEV_MEDIUM: &str = "Middel";

/// dBm-grenzen: vanaf -67 betrouwbaar voor bellen/streamen/gamen, onder -75 instabiel.
const RSSI_OK: i32 = -67;
const RSSI_BAD: i32 = -75;
const SLOW_LINK_MBPS: f64 = 50.0;

type Pair<'a> = (&'a str, &'a str);

fn t(p: Pair) -> String {
    crate::tr!(p.0, p.1).to_string()
}

fn steps(list: &[Pair]) -> Vec<String> {
    list.iter().copied().map(t).collect()
}

// ---------------------------------------------------------------------------------------------
// Pure hulpfuncties
// ---------------------------------------------------------------------------------------------

/// Band uit de middenfrequentie (MHz).
pub fn band_for_mhz(mhz: u32) -> &'static str {
    match mhz {
        0 => "?",
        1..=2999 => "2.4 GHz",
        3000..=5924 => "5 GHz",
        _ => "6 GHz",
    }
}

/// Kanaal uit de frequentie (MHz).
pub fn channel_for_mhz(mhz: u32) -> Option<u32> {
    match mhz {
        2484 => Some(14),
        2412..=2472 => Some((mhz - 2407) / 5),
        5000..=5924 => Some((mhz - 5000) / 5),
        5955..=7115 => Some((mhz - 5950) / 5),
        _ => None,
    }
}

/// Leesbare naam van de wifi-standaard (DOT11_PHY_TYPE).
pub fn standard_name(phy: i32, band: &str) -> String {
    match phy {
        11 => "Wi-Fi 7 (802.11be)".into(),
        10 if band == "6 GHz" => "Wi-Fi 6E (802.11ax)".into(),
        10 => "Wi-Fi 6 (802.11ax)".into(),
        8 => "Wi-Fi 5 (802.11ac)".into(),
        7 => "Wi-Fi 4 (802.11n)".into(),
        6 => "802.11g".into(),
        5 => "802.11b".into(),
        4 => "802.11a".into(),
        _ => t(("Onbekend", "Unknown")),
    }
}

fn is_legacy_standard(s: &str) -> bool {
    s.starts_with("802.11")
}

/// Signaalkwaliteit 0-100 % omgezet naar een geschatte dBm (Windows-mapping: 0 % ≈ -100, 100 % ≈ -50).
pub fn quality_to_dbm(q: u32) -> i32 {
    (q.min(100) as i32) / 2 - 100
}

fn fmt_mbps(v: f64) -> String {
    if v >= 1000.0 {
        let s = format!("{:.1} Gbit/s", v / 1000.0);
        if crate::i18n::is_english() {
            s
        } else {
            s.replace('.', ",")
        }
    } else {
        format!("{:.0} Mbit/s", v)
    }
}

// ---------------------------------------------------------------------------------------------
// Analyse
// ---------------------------------------------------------------------------------------------

fn issue(severity: &str, adapter: &str, advice: Advice) -> NetworkIssue {
    NetworkIssue {
        severity: severity.to_string(),
        adapter: adapter.to_string(),
        advice,
    }
}

fn wifi_issues(a: &NetworkAdapterHealth, w: &WifiInfo, out: &mut Vec<NetworkIssue>) {
    let dbm = w
        .rssi_dbm
        .unwrap_or_else(|| quality_to_dbm(w.signal_quality));
    let weak = dbm < RSSI_OK;
    if weak {
        let sev = if dbm < RSSI_BAD { SEV_HIGH } else { SEV_MEDIUM };
        out.push(issue(
            sev,
            &a.name,
            Advice {
                title: crate::tr!(
                    format!("Zwak wifi-signaal: {} dBm ({} %).", dbm, w.signal_quality),
                    format!("Weak Wi-Fi signal: {} dBm ({} %).", dbm, w.signal_quality)
                ),
                why: Some(t((
                    "Onder -67 dBm worden bellen, streamen en gamen onbetrouwbaar; onder -75 dBm vallen pakketjes weg en schiet de ping omhoog. Muren, vloeren, metaal en afstand verzwakken het signaal.",
                    "Below -67 dBm, calls, streaming and gaming become unreliable; below -75 dBm packets get lost and ping spikes. Walls, floors, metal and distance weaken the signal.",
                ))),
                steps: steps(&[
                    ("Ga dichter bij de router zitten, of zet de router hoger en centraler in huis (niet in een kast of achter de tv).", "Sit closer to the router, or place the router higher and more central in your home (not in a cabinet or behind the TV)."),
                    ("Gebruik voor een pc of spelcomputer op vaste plek een netwerkkabel; dat is altijd stabieler dan wifi.", "Use a network cable for a PC or console in a fixed spot; that's always more stable than Wi-Fi."),
                    ("Groot huis of meerdere verdiepingen? Gebruik een mesh-systeem of een access point in plaats van een losse versterker (repeater).", "Large home or multiple floors? Use a mesh system or an access point instead of a simple range extender (repeater)."),
                ]),
                ..Default::default()
            },
        ));
    }

    if w.band == "2.4 GHz" {
        out.push(issue(
            SEV_MEDIUM,
            &a.name,
            Advice {
                title: crate::tr!(
                    format!("Verbonden via 2,4 GHz (kanaal {}).", w.channel.map(|c| c.to_string()).unwrap_or_else(|| "?".into())),
                    format!("Connected over 2.4 GHz (channel {}).", w.channel.map(|c| c.to_string()).unwrap_or_else(|| "?".into()))
                ),
                why: Some(t((
                    "2,4 GHz reikt verder, maar is traag en vol: buren, bluetooth, magnetrons en draadloze camera's zitten op dezelfde band. Dat geeft wisselende ping en haperingen.",
                    "2.4 GHz reaches further, but it is slow and crowded: neighbours, Bluetooth, microwaves and wireless cameras share the same band. That causes fluctuating ping and stutters.",
                ))),
                steps: steps(&[
                    ("Maak verbinding met het 5 GHz-netwerk van je router (soms een aparte naam, bijv. met '5G' erin).", "Connect to your router's 5 GHz network (sometimes a separate name, e.g. containing '5G')."),
                    ("Heeft de router één naam voor beide banden? Zet in Apparaatbeheer → wifi-adapter → Geavanceerd de 'Preferred Band' / 'Voorkeursband' op 5 GHz.", "Does the router use one name for both bands? In Device Manager → Wi-Fi adapter → Advanced, set 'Preferred Band' to 5 GHz."),
                    ("Moet je op 2,4 GHz blijven (groot bereik nodig)? Kies in de router kanaal 1, 6 of 11 en een kanaalbreedte van 20 MHz.", "Have to stay on 2.4 GHz (need the range)? Choose channel 1, 6 or 11 and a 20 MHz channel width in the router."),
                ]),
                ..Default::default()
            },
        ));
    }

    if is_legacy_standard(&w.standard) {
        out.push(issue(
            SEV_MEDIUM,
            &a.name,
            Advice {
                title: crate::tr!(
                    format!("Verouderde wifi-standaard: {}.", w.standard),
                    format!("Outdated Wi-Fi standard: {}.", w.standard)
                ),
                why: Some(t(("Deze standaard is traag en gevoelig voor storing. Meestal komt het door een oude router of een router in 'compatibiliteitsmodus'.", "This standard is slow and sensitive to interference. It's usually caused by an old router or a router in 'compatibility mode'."))),
                steps: steps(&[
                    ("Zet in de router de wifi-modus op 'n/ac/ax' (of 'auto') in plaats van 'b/g'.", "Set the router's Wi-Fi mode to 'n/ac/ax' (or 'auto') instead of 'b/g'."),
                    ("Is de router ouder dan zo'n 6 jaar? Overweeg een nieuwe (Wi-Fi 6 of nieuwer).", "Is the router older than about 6 years? Consider a new one (Wi-Fi 6 or newer)."),
                ]),
                ..Default::default()
            },
        ));
    }

    if !weak && w.rx_rate_mbps > 0.0 && w.rx_rate_mbps < SLOW_LINK_MBPS {
        out.push(issue(
            SEV_MEDIUM,
            &a.name,
            Advice {
                title: crate::tr!(
                    format!("Lage wifi-verbindingssnelheid: {}.", fmt_mbps(w.rx_rate_mbps)),
                    format!("Low Wi-Fi link speed: {}.", fmt_mbps(w.rx_rate_mbps))
                ),
                why: Some(t(("Het signaal is redelijk, maar de verbinding loopt toch traag. Vaak door storing van andere netwerken of een smalle kanaalbreedte.", "The signal is reasonable, but the link is still slow. Often caused by interference from other networks or a narrow channel width."))),
                steps: steps(&[
                    ("Kies in de router een minder druk kanaal (of laat de router automatisch kiezen) en gebruik 5 GHz met 80 MHz kanaalbreedte.", "Choose a less crowded channel in the router (or let it choose automatically) and use 5 GHz with 80 MHz channel width."),
                    ("Werk de wifi-driver bij via de fabrikant (Intel, Realtek, MediaTek, Qualcomm).", "Update the Wi-Fi driver from the manufacturer (Intel, Realtek, MediaTek, Qualcomm)."),
                ]),
                ..Default::default()
            },
        ));
    }
}

/// Zet de gemeten adapters om in uitgelegde problemen (ernstigste eerst).
pub fn analyze(adapters: &[NetworkAdapterHealth]) -> Vec<NetworkIssue> {
    let mut out = Vec::new();
    for a in adapters {
        if let Some(w) = &a.wifi {
            wifi_issues(a, w, &mut out);
        }

        // Ethernet die maar 10/100 Mbit/s haalt.
        if a.kind == "ethernet" && a.link_speed_mbps.is_some_and(|s| s > 0.0 && s <= 100.0) {
            out.push(issue(
                SEV_MEDIUM,
                &a.name,
                Advice {
                    title: crate::tr!(
                        format!("De netwerkkabel maakt maar {} verbinding.", fmt_mbps(a.link_speed_mbps.unwrap_or(0.0))),
                        format!("The network cable only links at {}.", fmt_mbps(a.link_speed_mbps.unwrap_or(0.0)))
                    ),
                    why: Some(t(("Bijna alle netwerkkaarten en routers kunnen 1 Gbit/s of meer. 100 Mbit/s wijst meestal op een beschadigde kabel of stekker (gebroken aderparen), een oude switch, of een te lange/goedkope kabel.", "Almost all network cards and routers can do 1 Gbit/s or more. 100 Mbit/s usually points to a damaged cable or connector (broken wire pairs), an old switch, or a too long/cheap cable."))),
                    steps: steps(&[
                        ("Vervang de netwerkkabel door een Cat5e- of Cat6-kabel en controleer of beide stekkers goed klikken.", "Replace the network cable with a Cat5e or Cat6 cable and check that both plugs click in properly."),
                        ("Probeer een andere poort op de router of switch.", "Try a different port on the router or switch."),
                        ("Zit er een oude switch of stopcontact-adapter (powerline) tussen? Die beperken vaak tot 100 Mbit/s.", "Is there an old switch or powerline adapter in between? Those often limit the link to 100 Mbit/s."),
                    ]),
                    ..Default::default()
                },
            ));
        }

        // Fout- en weggegooide pakketten.
        let bad = a.rx_errors + a.tx_errors + a.rx_discards + a.tx_discards;
        let total = a.rx_packets + a.tx_packets;
        if total > 1000 && bad > 0 {
            let ratio = bad as f64 / total as f64;
            let sev = if ratio >= 0.01 {
                Some(SEV_HIGH)
            } else if ratio >= 0.001 && bad >= 100 {
                Some(SEV_MEDIUM)
            } else {
                None
            };
            if let Some(sev) = sev {
                let pct = format!("{:.2} %", ratio * 100.0);
                let pct = if crate::i18n::is_english() {
                    pct
                } else {
                    pct.replace('.', ",")
                };
                out.push(issue(
                    sev,
                    &a.name,
                    Advice {
                        title: crate::tr!(
                            format!("{} pakketten met fouten of weggegooid ({} van het verkeer).", bad, pct),
                            format!("{} packets with errors or dropped ({} of traffic).", bad, pct)
                        ),
                        why: Some(t(("De netwerkadapter zelf telt deze fouten. Ze geven haperingen, hogere ping en opnieuw verzonden data. Oorzaken: een slechte kabel of stekker, storing, of een driverprobleem.", "The network adapter itself counts these errors. They cause stutters, higher ping and resent data. Causes: a bad cable or connector, interference, or a driver problem."))),
                        steps: steps(&[
                            ("Kabel: vervang de netwerkkabel en probeer een andere poort op de router.", "Cable: replace the network cable and try a different port on the router."),
                            ("Wifi: verbeter het signaal (dichter bij de router, 5 GHz) en kies in de router een rustiger kanaal.", "Wi-Fi: improve the signal (closer to the router, 5 GHz) and choose a quieter channel in the router."),
                            ("Werk de netwerkdriver bij via de fabrikant.", "Update the network driver from the manufacturer."),
                            ("Herstart de router; tellers in Windows lopen door tot je de pc herstart, dus kijk na een herstart of het aantal weer oploopt.", "Restart the router; Windows keeps counting until you restart the PC, so check after a restart whether the number grows again."),
                        ]),
                        ..Default::default()
                    },
                ));
            }
        }

        // Energiebesparing van de adapter.
        if !a.power_saving.is_empty() || a.allow_turn_off == Some(true) {
            let mut list = a.power_saving.clone();
            if a.allow_turn_off == Some(true) {
                list.push(t((
                    "'Computer mag dit apparaat uitschakelen'",
                    "'Allow the computer to turn off this device'",
                )));
            }
            out.push(issue(
                SEV_MEDIUM,
                &a.name,
                Advice {
                    title: crate::tr!(
                        format!("Energiebesparing van de netwerkadapter staat aan: {}.", list.join(", ")),
                        format!("The network adapter's power saving is on: {}.", list.join(", "))
                    ),
                    why: Some(t(("Deze functies zetten de adapter kort in een spaarstand. Dat is een bekende oorzaak van korte verbindingsonderbrekingen, ping-pieken en hoge DPC-latency.", "These features briefly put the adapter into a power-saving state. That is a known cause of short connection drops, ping spikes and high DPC latency."))),
                    steps: steps(&[
                        ("Open Apparaatbeheer → Netwerkadapters → dubbelklik op deze adapter → tabblad 'Geavanceerd'.", "Open Device Manager → Network adapters → double-click this adapter → 'Advanced' tab."),
                        ("Zet de genoemde opties (bijv. 'Energy Efficient Ethernet', 'Green Ethernet', 'Power Saving Mode') op Uit / Disabled.", "Set the listed options (e.g. 'Energy Efficient Ethernet', 'Green Ethernet', 'Power Saving Mode') to Off / Disabled."),
                        ("Haal op het tabblad 'Energiebeheer' het vinkje weg bij 'De computer mag dit apparaat uitschakelen om energie te besparen'.", "On the 'Power Management' tab, untick 'Allow the computer to turn off this device to save power'."),
                        ("Laptop met wifi: zet in Energiebeheer → Geavanceerde instellingen → 'Instellingen draadloze adapter' de energiebesparing op 'Maximale prestaties'.", "Laptop on Wi-Fi: in Power Options → Advanced settings → 'Wireless Adapter Settings', set power saving to 'Maximum Performance'."),
                    ]),
                    ..Default::default()
                },
            ));
        }
    }
    out.sort_by_key(|i| if i.severity == SEV_HIGH { 0 } else { 1 });
    out
}

pub fn summarize(adapters: &[NetworkAdapterHealth], issues: &[NetworkIssue]) -> String {
    if adapters.is_empty() {
        return t((
            "Geen actieve fysieke netwerkverbinding gevonden.",
            "No active physical network connection found.",
        ));
    }
    if issues.is_empty() {
        return crate::tr!(
            format!(
                "{} actieve verbinding(en) gecontroleerd: geen problemen gevonden.",
                adapters.len()
            ),
            format!(
                "{} active connection(s) checked: no problems found.",
                adapters.len()
            )
        );
    }
    crate::tr!(
        format!(
            "{} punt(en) gevonden die haperingen of een hoge ping kunnen veroorzaken.",
            issues.len()
        ),
        format!(
            "Found {} item(s) that can cause stutters or high ping.",
            issues.len()
        )
    )
}

// ---------------------------------------------------------------------------------------------
// Windows: adapters (PowerShell) + wifi (wlanapi)
// ---------------------------------------------------------------------------------------------

/// Energiebesparende geavanceerde eigenschappen (RegistryKeyword → "aan" als waarde 1).
const POWER_KEYWORDS: [&str; 6] = [
    "*EEE",
    "EnableGreenEthernet",
    "AdvancedEEE",
    "PowerSavingMode",
    "GigaLite",
    "*SelectiveSuspend",
];

const PS_ADAPTERS: &str = r#"$kw = @('*EEE','EnableGreenEthernet','AdvancedEEE','PowerSavingMode','GigaLite','*SelectiveSuspend')
$out = foreach ($a in @(Get-NetAdapter -Physical | Where-Object Status -eq 'Up')) {
  $st = Get-NetAdapterStatistics -Name $a.Name
  $adv = @(Get-NetAdapterAdvancedProperty -Name $a.Name | Where-Object { $kw -contains $_.RegistryKeyword } | Select-Object RegistryKeyword, DisplayName, @{n='Value';e={ [string]($_.RegistryValue -join ',') }})
  $pm = Get-NetAdapterPowerManagement -Name $a.Name
  [pscustomobject]@{
    Name = $a.Name; Description = $a.InterfaceDescription; Medium = [int]$a.NdisPhysicalMedium; MediaType = [string]$a.PhysicalMediaType
    LinkBps = [double]$a.ReceiveLinkSpeed; DriverVersion = $a.DriverVersionString; DriverDate = [string]$a.DriverDate
    RxPackets = [double]($st.ReceivedUnicastPackets + $st.ReceivedMulticastPackets + $st.ReceivedBroadcastPackets)
    TxPackets = [double]($st.SentUnicastPackets + $st.SentMulticastPackets + $st.SentBroadcastPackets)
    RxErrors = [double]$st.ReceivedPacketErrors; RxDiscards = [double]$st.ReceivedDiscardedPackets
    TxErrors = [double]$st.OutboundPacketErrors; TxDiscards = [double]$st.OutboundDiscardedPackets
    Advanced = $adv; AllowTurnOff = [string]$pm.AllowComputerToTurnOffDevice
  }
}
ConvertTo-Json -InputObject @($out) -Depth 4 -Compress"#;

fn num(v: &Value, k: &str) -> u64 {
    v.get(k)
        .and_then(|x| x.as_f64())
        .map(|f| f.max(0.0) as u64)
        .unwrap_or(0)
}

/// Eén adapter uit de PowerShell-uitvoer (zonder wifi-details).
pub fn parse_adapter(v: &Value) -> NetworkAdapterHealth {
    let s = |k: &str| crate::shell::str_field(v, k).unwrap_or_default();
    let medium = v.get("Medium").and_then(|x| x.as_i64()).unwrap_or(-1);
    let media_type = s("MediaType");
    // NdisPhysicalMedium: 9 = 802.11 (wifi), 14 = 802.3 (ethernet), 0 = onbekend (vaak ook ethernet).
    let kind = if medium == 9 || media_type.contains("802.11") {
        "wifi"
    } else if medium == 14 || medium == 0 || media_type.contains("802.3") {
        "ethernet"
    } else {
        "other"
    };
    let power_saving = crate::shell::json_items(v.get("Advanced").unwrap_or(&Value::Null))
        .iter()
        .filter(|p| {
            let kw = p
                .get("RegistryKeyword")
                .and_then(|x| x.as_str())
                .unwrap_or("");
            let val = p.get("Value").and_then(|x| x.as_str()).unwrap_or("");
            POWER_KEYWORDS.contains(&kw) && val.trim() == "1"
        })
        .map(|p| {
            crate::shell::str_field(p, "DisplayName").unwrap_or_else(|| {
                p.get("RegistryKeyword")
                    .and_then(|x| x.as_str())
                    .unwrap_or("?")
                    .to_string()
            })
        })
        .collect();
    let link = v
        .get("LinkBps")
        .and_then(|x| x.as_f64())
        .filter(|b| *b > 0.0)
        .map(|b| b / 1_000_000.0);
    NetworkAdapterHealth {
        name: s("Name"),
        description: s("Description"),
        kind: kind.to_string(),
        link_speed_mbps: link,
        driver_version: s("DriverVersion"),
        driver_date: s("DriverDate").chars().take(10).collect(),
        rx_packets: num(v, "RxPackets"),
        tx_packets: num(v, "TxPackets"),
        rx_errors: num(v, "RxErrors"),
        rx_discards: num(v, "RxDiscards"),
        tx_errors: num(v, "TxErrors"),
        tx_discards: num(v, "TxDiscards"),
        power_saving,
        allow_turn_off: match s("AllowTurnOff").as_str() {
            "Enabled" => Some(true),
            "Disabled" => Some(false),
            _ => None,
        },
        wifi: None,
    }
}

#[cfg(windows)]
mod wlan {
    use windows::Win32::Foundation::HANDLE;
    use windows::Win32::NetworkManagement::WiFi::{
        WLAN_BSS_LIST, WLAN_CONNECTION_ATTRIBUTES, WLAN_INTERFACE_INFO_LIST, WlanCloseHandle,
        WlanEnumInterfaces, WlanFreeMemory, WlanGetNetworkBssList, WlanOpenHandle,
        WlanQueryInterface, dot11_BSS_type_infrastructure, wlan_interface_state_connected,
        wlan_intf_opcode_current_connection, wlan_intf_opcode_rssi,
    };

    use super::{band_for_mhz, channel_for_mhz, standard_name};
    use crate::models::WifiInfo;

    fn wide(s: &[u16]) -> String {
        let end = s.iter().position(|c| *c == 0).unwrap_or(s.len());
        String::from_utf16_lossy(&s[..end])
    }

    /// (adapterbeschrijving, wifi-info) per verbonden wifi-interface.
    pub fn connected() -> Vec<(String, WifiInfo)> {
        let mut out = Vec::new();
        let mut handle = HANDLE::default();
        let mut ver = 0u32;
        // SAFETY: alle pointers zijn geldig; geheugen van wlanapi wordt met WlanFreeMemory vrijgegeven.
        unsafe {
            if WlanOpenHandle(2, None, &mut ver, &mut handle) != 0 {
                return out;
            }
            let mut list: *mut WLAN_INTERFACE_INFO_LIST = std::ptr::null_mut();
            if WlanEnumInterfaces(handle, None, &mut list) == 0 && !list.is_null() {
                let n = (*list).dwNumberOfItems as usize;
                let infos = std::slice::from_raw_parts((*list).InterfaceInfo.as_ptr(), n);
                for info in infos {
                    if info.isState != wlan_interface_state_connected {
                        continue;
                    }
                    let guid = info.InterfaceGuid;
                    let desc = wide(&info.strInterfaceDescription);

                    let mut size = 0u32;
                    let mut data: *mut core::ffi::c_void = std::ptr::null_mut();
                    if WlanQueryInterface(
                        handle,
                        &guid,
                        wlan_intf_opcode_current_connection,
                        None,
                        &mut size,
                        &mut data,
                        None,
                    ) != 0
                        || data.is_null()
                    {
                        continue;
                    }
                    let conn = &*(data as *const WLAN_CONNECTION_ATTRIBUTES);
                    let assoc = conn.wlanAssociationAttributes;
                    let ssid_len = (assoc.dot11Ssid.uSSIDLength as usize).min(32);
                    let ssid =
                        String::from_utf8_lossy(&assoc.dot11Ssid.ucSSID[..ssid_len]).to_string();
                    let bssid = assoc.dot11Bssid;
                    let ssid_struct = assoc.dot11Ssid;
                    let quality = assoc.wlanSignalQuality;
                    let phy = assoc.dot11PhyType.0;
                    let rx = assoc.ulRxRate as f64 / 1000.0;
                    let tx = assoc.ulTxRate as f64 / 1000.0;
                    WlanFreeMemory(data);

                    // RSSI (dBm) van de huidige verbinding.
                    let mut rssi = None;
                    let mut p: *mut core::ffi::c_void = std::ptr::null_mut();
                    if WlanQueryInterface(
                        handle,
                        &guid,
                        wlan_intf_opcode_rssi,
                        None,
                        &mut size,
                        &mut p,
                        None,
                    ) == 0
                        && !p.is_null()
                    {
                        let v = *(p as *const i32);
                        if (-120..0).contains(&v) {
                            rssi = Some(v);
                        }
                        WlanFreeMemory(p);
                    }

                    // Frequentie via de BSS-lijst (exacte band, ook voor 6 GHz).
                    let mut mhz = 0u32;
                    let mut bss: *mut WLAN_BSS_LIST = std::ptr::null_mut();
                    if WlanGetNetworkBssList(
                        handle,
                        &guid,
                        Some(&ssid_struct),
                        dot11_BSS_type_infrastructure,
                        true,
                        None,
                        &mut bss,
                    ) == 0
                        && !bss.is_null()
                    {
                        let m = (*bss).dwNumberOfItems as usize;
                        let entries = std::slice::from_raw_parts((*bss).wlanBssEntries.as_ptr(), m);
                        if let Some(e) = entries.iter().find(|e| e.dot11Bssid == bssid) {
                            mhz = e.ulChCenterFrequency / 1000;
                            if rssi.is_none() {
                                rssi = Some(e.lRssi);
                            }
                        }
                        WlanFreeMemory(bss as *const _);
                    }

                    let band = band_for_mhz(mhz).to_string();
                    out.push((
                        desc,
                        WifiInfo {
                            ssid,
                            signal_quality: quality,
                            rssi_dbm: rssi,
                            frequency_mhz: (mhz > 0).then_some(mhz),
                            channel: channel_for_mhz(mhz),
                            standard: standard_name(phy, &band),
                            band,
                            rx_rate_mbps: rx,
                            tx_rate_mbps: tx,
                        },
                    ));
                }
                WlanFreeMemory(list as *const _);
            }
            WlanCloseHandle(handle, None);
        }
        out
    }
}

#[cfg(target_os = "linux")]
fn linux_adapters() -> Vec<NetworkAdapterHealth> {
    let read = |p: std::path::PathBuf| {
        std::fs::read_to_string(p)
            .ok()
            .map(|s| s.trim().to_string())
    };
    let wireless = std::fs::read_to_string("/proc/net/wireless").unwrap_or_default();
    let mut out = Vec::new();
    let Ok(dir) = std::fs::read_dir("/sys/class/net") else {
        return out;
    };
    for e in dir.flatten() {
        let p = e.path();
        let name = e.file_name().to_string_lossy().to_string();
        // Alleen fysieke, verbonden adapters.
        if !p.join("device").exists() || read(p.join("operstate")).as_deref() != Some("up") {
            continue;
        }
        let st = |f: &str| {
            read(p.join("statistics").join(f))
                .and_then(|s| s.parse().ok())
                .unwrap_or(0u64)
        };
        let is_wifi = p.join("wireless").exists() || p.join("phy80211").exists();
        let wifi = is_wifi.then(|| {
            // /proc/net/wireless: "wlan0: 0000   54.  -56.  -256 ..."
            let line = wireless
                .lines()
                .find(|l| l.trim_start().starts_with(&format!("{name}:")));
            let cols: Vec<&str> = line
                .map(|l| l.split_whitespace().collect())
                .unwrap_or_default();
            let q: f64 = cols
                .get(2)
                .and_then(|s| s.trim_end_matches('.').parse().ok())
                .unwrap_or(0.0);
            let lvl: i32 = cols
                .get(3)
                .and_then(|s| s.trim_end_matches('.').parse().ok())
                .unwrap_or(0);
            WifiInfo {
                ssid: String::new(),
                signal_quality: ((q / 70.0) * 100.0).round().clamp(0.0, 100.0) as u32,
                rssi_dbm: (lvl < 0).then_some(lvl),
                frequency_mhz: None,
                channel: None,
                band: "?".into(),
                standard: t(("Onbekend", "Unknown")),
                rx_rate_mbps: 0.0,
                tx_rate_mbps: 0.0,
            }
        });
        out.push(NetworkAdapterHealth {
            description: name.clone(),
            kind: if is_wifi { "wifi" } else { "ethernet" }.to_string(),
            link_speed_mbps: read(p.join("speed"))
                .and_then(|s| s.parse::<f64>().ok())
                .filter(|s| *s > 0.0),
            rx_packets: st("rx_packets"),
            tx_packets: st("tx_packets"),
            rx_errors: st("rx_errors"),
            rx_discards: st("rx_dropped"),
            tx_errors: st("tx_errors"),
            tx_discards: st("tx_dropped"),
            name,
            wifi,
            ..Default::default()
        });
    }
    out
}

pub fn scan_network_health() -> NetworkHealthReport {
    let scanned_at = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    #[allow(unused_mut)]
    let mut adapters: Vec<NetworkAdapterHealth> = Vec::new();
    #[allow(unused_mut)]
    let mut available = false;

    #[cfg(windows)]
    if let Some(v) = crate::shell::run_ps_json(PS_ADAPTERS) {
        available = true;
        adapters = crate::shell::json_items(&v)
            .iter()
            .map(parse_adapter)
            .collect();
        let wifi = wlan::connected();
        for a in adapters.iter_mut().filter(|a| a.kind == "wifi") {
            if let Some((_, w)) = wifi
                .iter()
                .find(|(d, _)| d == &a.description)
                .or_else(|| wifi.first())
            {
                a.wifi = Some(w.clone());
            }
        }
    }
    #[cfg(target_os = "linux")]
    {
        available = true;
        adapters = linux_adapters();
    }

    if !available {
        return NetworkHealthReport {
            is_available: false,
            scanned_at,
            summary: t((
                "Netwerkgezondheid kon niet worden uitgelezen op dit systeem.",
                "Network health could not be read on this system.",
            )),
            ..Default::default()
        };
    }
    let issues = analyze(&adapters);
    let summary = summarize(&adapters, &issues);
    NetworkHealthReport {
        is_available: true,
        scanned_at,
        adapters,
        issues,
        summary,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::i18n::with_language;
    use serde_json::json;

    fn wifi(rssi: Option<i32>, q: u32, mhz: u32, phy: i32, rx: f64) -> NetworkAdapterHealth {
        let band = band_for_mhz(mhz).to_string();
        NetworkAdapterHealth {
            name: "WiFi".into(),
            kind: "wifi".into(),
            rx_packets: 100_000,
            tx_packets: 50_000,
            wifi: Some(WifiInfo {
                ssid: "Thuis".into(),
                signal_quality: q,
                rssi_dbm: rssi,
                frequency_mhz: Some(mhz),
                channel: channel_for_mhz(mhz),
                standard: standard_name(phy, &band),
                band,
                rx_rate_mbps: rx,
                tx_rate_mbps: rx,
            }),
            ..Default::default()
        }
    }

    #[test]
    fn bands_channels_and_standards() {
        assert_eq!(band_for_mhz(2437), "2.4 GHz");
        assert_eq!(channel_for_mhz(2437), Some(6));
        assert_eq!(band_for_mhz(5180), "5 GHz");
        assert_eq!(channel_for_mhz(5180), Some(36));
        assert_eq!(band_for_mhz(6115), "6 GHz");
        assert_eq!(channel_for_mhz(6115), Some(33));
        assert_eq!(standard_name(10, "6 GHz"), "Wi-Fi 6E (802.11ax)");
        assert_eq!(standard_name(8, "5 GHz"), "Wi-Fi 5 (802.11ac)");
        assert_eq!(quality_to_dbm(100), -50);
        assert_eq!(quality_to_dbm(30), -85);
    }

    #[test]
    fn healthy_5ghz_wifi_has_no_issues() {
        let issues = analyze(&[wifi(Some(-55), 90, 5500, 10, 866.0)]);
        assert!(issues.is_empty());
        assert!(
            with_language(true, || summarize(
                &[wifi(Some(-55), 90, 5500, 10, 866.0)],
                &issues
            ))
            .contains("no problems")
        );
    }

    #[test]
    fn weak_signal_and_24ghz_are_reported() {
        let issues = with_language(true, || analyze(&[wifi(Some(-79), 30, 2437, 7, 72.0)]));
        assert_eq!(issues[0].severity, SEV_HIGH);
        assert!(issues[0].advice.title.contains("-79 dBm"));
        assert!(
            issues
                .iter()
                .any(|i| i.advice.title.contains("2.4 GHz (channel 6)"))
        );
        // Bij een zwak signaal geen aparte melding "lage snelheid" (dat is het gevolg).
        assert!(
            !issues
                .iter()
                .any(|i| i.advice.title.starts_with("Low Wi-Fi link speed"))
        );
        let medium = analyze(&[wifi(Some(-70), 60, 5500, 10, 400.0)]);
        assert_eq!(medium[0].severity, SEV_MEDIUM);
    }

    #[test]
    fn slow_link_and_legacy_standard() {
        let issues = with_language(true, || analyze(&[wifi(Some(-60), 80, 2412, 6, 24.0)]));
        assert!(
            issues
                .iter()
                .any(|i| i.advice.title.starts_with("Outdated Wi-Fi standard"))
        );
        assert!(
            issues
                .iter()
                .any(|i| i.advice.title.starts_with("Low Wi-Fi link speed"))
        );
    }

    #[test]
    fn ethernet_100mbit_errors_and_power_saving() {
        let a = NetworkAdapterHealth {
            name: "Ethernet".into(),
            kind: "ethernet".into(),
            link_speed_mbps: Some(100.0),
            rx_packets: 50_000,
            tx_packets: 50_000,
            rx_errors: 1_500,
            power_saving: vec!["Energy Efficient Ethernet".into()],
            allow_turn_off: Some(true),
            ..Default::default()
        };
        let issues = with_language(true, || analyze(&[a]));
        assert_eq!(issues[0].severity, SEV_HIGH); // 1,5 % fouten
        assert!(issues.iter().any(|i| i.advice.title.contains("100 Mbit/s")));
        let ps = issues
            .iter()
            .find(|i| i.advice.title.contains("power saving"))
            .unwrap();
        assert!(
            ps.advice.title.contains("Energy Efficient Ethernet")
                && ps.advice.title.contains("turn off")
        );
        assert!(ps.advice.steps.len() >= 3);
    }

    #[test]
    fn a_few_errors_are_not_reported() {
        let a = NetworkAdapterHealth {
            kind: "ethernet".into(),
            rx_packets: 3_000_000,
            tx_packets: 1_000_000,
            rx_discards: 40,
            ..Default::default()
        };
        assert!(analyze(&[a]).is_empty());
    }

    #[test]
    fn powershell_adapter_is_parsed() {
        let v = json!({
            "Name": "Ethernet", "Description": "Intel(R) Ethernet Controller I225-V", "Medium": 14, "MediaType": "802.3",
            "LinkBps": 1_000_000_000.0, "DriverVersion": "2.1.3.3", "DriverDate": "2023-04-12",
            "RxPackets": 1000.0, "TxPackets": 900.0, "RxErrors": 0.0, "RxDiscards": 2.0, "TxErrors": 0.0, "TxDiscards": 0.0,
            "Advanced": [
                {"RegistryKeyword": "*EEE", "DisplayName": "Energy Efficient Ethernet", "Value": "1"},
                {"RegistryKeyword": "EnableGreenEthernet", "DisplayName": "Green Ethernet", "Value": "0"}
            ],
            "AllowTurnOff": "Disabled"
        });
        let a = parse_adapter(&v);
        assert_eq!(a.kind, "ethernet");
        assert_eq!(a.link_speed_mbps, Some(1000.0));
        assert_eq!(
            a.power_saving,
            vec!["Energy Efficient Ethernet".to_string()]
        );
        assert_eq!(a.allow_turn_off, Some(false));
        assert_eq!(a.rx_discards, 2);
        let w = parse_adapter(&json!({"Name": "WiFi", "Medium": 9, "MediaType": "Native 802.11"}));
        assert_eq!(w.kind, "wifi");
    }

    /// Echte meting op deze pc: `cargo test live_network -- --ignored --nocapture`
    #[test]
    #[ignore = "leest de echte netwerkadapters"]
    fn live_network_health() {
        let r = scan_network_health();
        println!("{:#?}", r.adapters);
        println!("{}", r.summary);
        for i in &r.issues {
            println!("[{}] {}", i.severity, i.advice.title);
        }
        if let Ok(path) = std::env::var("PCC_NETWORK_JSON") {
            std::fs::write(path, serde_json::to_string(&r).unwrap()).unwrap();
        }
        assert!(r.is_available);
    }

    /// Schrijft een voorbeeldrapport met problemen naar `PCC_NETWORK_JSON` (alleen om de UI te bekijken).
    #[test]
    #[ignore = "alleen voor het bekijken van de UI"]
    fn preview_problem_network_json() {
        let mut w = wifi(Some(-78), 34, 2437, 7, 58.0);
        w.power_saving = vec!["Power Saving Mode".into()];
        let e = NetworkAdapterHealth {
            name: "Ethernet".into(),
            description: "Realtek PCIe GbE Family Controller".into(),
            kind: "ethernet".into(),
            link_speed_mbps: Some(100.0),
            driver_version: "10.45.928.2020".into(),
            driver_date: "2020-09-28".into(),
            rx_packets: 80_000,
            tx_packets: 40_000,
            rx_errors: 1_450,
            rx_discards: 210,
            power_saving: vec!["Energy Efficient Ethernet".into(), "Green Ethernet".into()],
            allow_turn_off: Some(true),
            ..Default::default()
        };
        let adapters = vec![w, e];
        let issues = with_language(false, || analyze(&adapters));
        let summary = with_language(false, || summarize(&adapters, &issues));
        let r = NetworkHealthReport {
            is_available: true,
            scanned_at: String::new(),
            adapters,
            issues,
            summary,
        };
        if let Ok(path) = std::env::var("PCC_NETWORK_JSON") {
            std::fs::write(path, serde_json::to_string(&r).unwrap()).unwrap();
        }
    }
}
