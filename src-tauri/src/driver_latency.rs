//! Per-driver DPC/ISR-meting via ETW (Event Tracing for Windows), vergelijkbaar met LatencyMon.
//!
//! Hoe het werkt:
//! 1. We starten een eigen *system logger*-sessie (Windows 8+) met de kernelvlaggen
//!    `EVENT_TRACE_FLAG_DPC` en `EVENT_TRACE_FLAG_INTERRUPT`. Een eigen sessie i.p.v. de
//!    gedeelde "NT Kernel Logger" voorkomt conflicten met LatencyMon/Process Explorer.
//! 2. De kernel logt na elke DPC/ISR een event met de **starttijd** (`InitialTime`) en het
//!    **adres van de routine**. Event-tijdstip − starttijd = uitvoertijd (in QPC-ticks).
//! 3. Na de meting koppelen we elk routine-adres aan de driver waarin het ligt
//!    (`EnumDeviceDrivers`: basisadres van elke geladen driver).
//!
//! Vereist beheerdersrechten. De aggregatie en beoordeling zijn puur en worden los getest.

use std::collections::HashMap;

use crate::models::{DriverLatencyEntry, DriverLatencyReport};
use crate::tr;

pub const VERDICT_GOOD: &str = "Goed";
pub const VERDICT_WARN: &str = "Matig";
pub const VERDICT_BAD: &str = "Slecht";
pub const VERDICT_UNTESTED: &str = "Niet getest";

/// Eén DPC langer dan dit veroorzaakt al hoorbare audio-dropouts bij kleine buffers.
pub const DPC_WARN_US: f64 = 500.0;
pub const DPC_BAD_US: f64 = 2000.0;
/// ISR's horen nog veel korter te zijn dan DPC's.
pub const ISR_WARN_US: f64 = 100.0;
pub const ISR_BAD_US: f64 = 500.0;

/// Uitvoertijden boven deze grens zijn meetfouten (bijv. klok-sprong), geen echte DPC.
const MAX_PLAUSIBLE_TICKS_SECONDS: f64 = 1.0;
const TOP_DRIVERS: usize = 25;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind {
    Dpc,
    Isr,
}

#[derive(Default, Clone, Copy, Debug, PartialEq)]
pub struct Stat {
    pub count: u64,
    pub max_ticks: u64,
    pub total_ticks: u64,
}

impl Stat {
    fn add(&mut self, ticks: u64) {
        self.count += 1;
        self.total_ticks += ticks;
        self.max_ticks = self.max_ticks.max(ticks);
    }
    fn merge(&mut self, o: &Stat) {
        self.count += o.count;
        self.total_ticks += o.total_ticks;
        self.max_ticks = self.max_ticks.max(o.max_ticks);
    }
}

/// Ruwe tellers per routine-adres (zo licht mogelijk in de ETW-callback).
#[derive(Default, Debug)]
pub struct Accum {
    pub dpc: HashMap<u64, Stat>,
    pub isr: HashMap<u64, Stat>,
}

impl Accum {
    pub fn record(&mut self, kind: Kind, routine: u64, ticks: u64) {
        let map = match kind {
            Kind::Dpc => &mut self.dpc,
            Kind::Isr => &mut self.isr,
        };
        map.entry(routine).or_default().add(ticks);
    }
}

/// Leest `InitialTime` en `Routine` uit de payload van een PerfInfo DPC/ISR-event.
/// Layout: `u64 InitialTime`, gevolgd door een pointer (4 of 8 bytes).
pub fn parse_payload(data: &[u8], pointer_32bit: bool) -> Option<(u64, u64)> {
    let initial = u64::from_le_bytes(data.get(0..8)?.try_into().ok()?);
    let routine = if pointer_32bit {
        u32::from_le_bytes(data.get(8..12)?.try_into().ok()?) as u64
    } else {
        u64::from_le_bytes(data.get(8..16)?.try_into().ok()?)
    };
    Some((initial, routine))
}

/// Geladen drivers als (basisadres, naam), gesorteerd op adres.
#[derive(Default, Debug)]
pub struct DriverMap {
    bases: Vec<(u64, String)>,
}

impl DriverMap {
    pub fn new(mut bases: Vec<(u64, String)>) -> Self {
        bases.retain(|(b, _)| *b != 0);
        bases.sort_by_key(|(b, _)| *b);
        Self { bases }
    }

    /// De driver met het hoogste basisadres ≤ `addr` (zoals LatencyMon dat ook doet).
    pub fn resolve(&self, addr: u64) -> String {
        match self.bases.partition_point(|(b, _)| *b <= addr) {
            0 => tr!("Onbekend", "Unknown").to_string(),
            i => self.bases[i - 1].1.clone(),
        }
    }
}

/// Bekende drivers die vaak in latency-analyses opduiken, met een leesbare omschrijving.
pub fn describe_driver(name: &str) -> Option<String> {
    let n = name.to_ascii_lowercase();
    let (nl, en) = match n.as_str() {
        "nvlddmkm.sys" => ("NVIDIA-videodriver", "NVIDIA graphics driver"),
        "amdkmdag.sys" | "atikmdag.sys" => ("AMD-videodriver", "AMD graphics driver"),
        "igdkmd64.sys" | "igdkmdn64.sys" | "igdkmdnd64.sys" => {
            ("Intel-videodriver", "Intel graphics driver")
        }
        "dxgkrnl.sys" => ("DirectX-graphicskernel", "DirectX graphics kernel"),
        "ndis.sys" => ("Netwerkstack (NDIS)", "Network stack (NDIS)"),
        "tcpip.sys" => ("TCP/IP-protocoldriver", "TCP/IP protocol driver"),
        "storport.sys" => ("Opslagpoort (NVMe/RAID)", "Storage port (NVMe/RAID)"),
        "stornvme.sys" => ("NVMe-opslagdriver", "NVMe storage driver"),
        "storahci.sys" => ("SATA AHCI-opslagdriver", "SATA AHCI storage driver"),
        "iastora.sys" | "iastorac.sys" | "iastorvd.sys" => {
            ("Intel Rapid Storage", "Intel Rapid Storage")
        }
        "acpi.sys" => ("ACPI (energiebeheer/BIOS)", "ACPI (power management/BIOS)"),
        "wdf01000.sys" => (
            "Kernel Mode Driver Framework",
            "Kernel Mode Driver Framework",
        ),
        "usbxhci.sys" | "usbport.sys" | "usbhub3.sys" => ("USB-controller", "USB controller"),
        "hdaudbus.sys" | "hdaudio.sys" => ("HD Audio-bus", "HD Audio bus"),
        "portcls.sys" => ("Audio-klassedriver", "Audio class driver"),
        "ntoskrnl.exe" => (
            "Windows-kernel (timers/scheduler)",
            "Windows kernel (timers/scheduler)",
        ),
        "intelppm.sys" | "amdppm.sys" => ("CPU-energiebeheer", "CPU power management"),
        "wdiwifi.sys" => ("Wi-Fi-framework", "Wi-Fi framework"),
        _ if n.starts_with("netwtw") || n.starts_with("netwbw") => {
            ("Intel Wi-Fi-driver", "Intel Wi-Fi driver")
        }
        _ if n.starts_with("rt640") || n.starts_with("rtwlan") || n.starts_with("rtux64") => {
            ("Realtek netwerkdriver", "Realtek network driver")
        }
        _ if n.starts_with("e1") && n.ends_with(".sys") => {
            ("Intel ethernet-driver", "Intel Ethernet driver")
        }
        _ if n.starts_with("rtkvhd") || n.starts_with("rtkhdaud") => {
            ("Realtek audiodriver", "Realtek audio driver")
        }
        _ => return None,
    };
    Some(tr!(nl, en).to_string())
}

fn ticks_to_us(ticks: u64, freq: u64) -> f64 {
    if freq == 0 {
        0.0
    } else {
        ticks as f64 * 1_000_000.0 / freq as f64
    }
}

pub fn verdict_for(max_dpc_us: f64, max_isr_us: f64) -> &'static str {
    if max_dpc_us >= DPC_BAD_US || max_isr_us >= ISR_BAD_US {
        VERDICT_BAD
    } else if max_dpc_us >= DPC_WARN_US || max_isr_us >= ISR_WARN_US {
        VERDICT_WARN
    } else {
        VERDICT_GOOD
    }
}

/// Zet de ruwe tellers om in een rapport (per driver, gesorteerd, met oordeel).
pub fn build_report(
    acc: &Accum,
    map: &DriverMap,
    qpc_freq: u64,
    duration_ms: u64,
    events_lost: u32,
) -> DriverLatencyReport {
    let max_plausible = (qpc_freq as f64 * MAX_PLAUSIBLE_TICKS_SECONDS) as u64;
    let mut per_driver: HashMap<String, (Stat, Stat)> = HashMap::new();
    for (routine, s) in &acc.dpc {
        if s.max_ticks <= max_plausible {
            per_driver
                .entry(map.resolve(*routine))
                .or_default()
                .0
                .merge(s);
        }
    }
    for (routine, s) in &acc.isr {
        if s.max_ticks <= max_plausible {
            per_driver
                .entry(map.resolve(*routine))
                .or_default()
                .1
                .merge(s);
        }
    }

    let mut drivers: Vec<DriverLatencyEntry> = per_driver
        .into_iter()
        .map(|(driver, (d, i))| DriverLatencyEntry {
            description: describe_driver(&driver),
            driver,
            dpc_count: d.count,
            dpc_max_us: ticks_to_us(d.max_ticks, qpc_freq),
            dpc_total_ms: ticks_to_us(d.total_ticks, qpc_freq) / 1000.0,
            isr_count: i.count,
            isr_max_us: ticks_to_us(i.max_ticks, qpc_freq),
            isr_total_ms: ticks_to_us(i.total_ticks, qpc_freq) / 1000.0,
        })
        .collect();
    drivers.sort_by(|a, b| {
        b.dpc_max_us
            .max(b.isr_max_us)
            .partial_cmp(&a.dpc_max_us.max(a.isr_max_us))
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| a.driver.cmp(&b.driver))
    });

    let top_dpc = drivers
        .iter()
        .max_by(|a, b| a.dpc_max_us.total_cmp(&b.dpc_max_us))
        .filter(|d| d.dpc_count > 0);
    let top_isr = drivers
        .iter()
        .max_by(|a, b| a.isr_max_us.total_cmp(&b.isr_max_us))
        .filter(|d| d.isr_count > 0);
    let highest_dpc_us = top_dpc.map_or(0.0, |d| d.dpc_max_us);
    let highest_isr_us = top_isr.map_or(0.0, |d| d.isr_max_us);
    let top_dpc_name = top_dpc.map(|d| d.driver.clone());
    let top_isr_name = top_isr.map(|d| d.driver.clone());
    let dpc_count: u64 = drivers.iter().map(|d| d.dpc_count).sum();
    let isr_count: u64 = drivers.iter().map(|d| d.isr_count).sum();

    let verdict = if dpc_count + isr_count == 0 {
        VERDICT_UNTESTED
    } else {
        verdict_for(highest_dpc_us, highest_isr_us)
    };
    let name = |d: &Option<String>| d.clone().unwrap_or_else(|| "-".into());
    let summary = match verdict {
        VERDICT_UNTESTED => tr!(
            "Geen DPC/ISR-events ontvangen. Mogelijk blokkeert beveiligingssoftware kernel-tracing.".to_string(),
            "No DPC/ISR events received. Security software may be blocking kernel tracing.".to_string()
        ),
        VERDICT_GOOD => tr!(
            format!("Alle drivers blijven ruim binnen de grenzen. Langste DPC: {:.0} µs ({}), langste ISR: {:.0} µs.", highest_dpc_us, name(&top_dpc_name), highest_isr_us),
            format!("All drivers stay well within limits. Longest DPC: {:.0} µs ({}), longest ISR: {:.0} µs.", highest_dpc_us, name(&top_dpc_name), highest_isr_us)
        ),
        _ => tr!(
            format!("Langste DPC: {:.0} µs in {}, langste ISR: {:.0} µs in {}. Werk deze driver(s) bij of schakel het apparaat tijdelijk uit om te testen.", highest_dpc_us, name(&top_dpc_name), highest_isr_us, name(&top_isr_name)),
            format!("Longest DPC: {:.0} µs in {}, longest ISR: {:.0} µs in {}. Update these driver(s) or temporarily disable the device to test.", highest_dpc_us, name(&top_dpc_name), highest_isr_us, name(&top_isr_name))
        ),
    };

    drivers.truncate(TOP_DRIVERS);
    DriverLatencyReport {
        is_available: true,
        requires_admin: false,
        duration_ms,
        dpc_count,
        isr_count,
        events_lost,
        highest_dpc_us,
        highest_isr_us,
        highest_dpc_driver: top_dpc_name,
        highest_isr_driver: top_isr_name,
        verdict: verdict.to_string(),
        summary,
        drivers,
        error: None,
    }
}

pub fn unavailable(
    requires_admin: bool,
    summary: String,
    error: Option<String>,
) -> DriverLatencyReport {
    DriverLatencyReport {
        is_available: false,
        requires_admin,
        verdict: VERDICT_UNTESTED.to_string(),
        summary,
        error,
        ..Default::default()
    }
}

/// Voert de meting uit (blokkerend, `duration_secs` seconden).
pub fn run_driver_latency_trace(duration_secs: u64) -> DriverLatencyReport {
    let duration_secs = duration_secs.clamp(3, 120);
    if !cfg!(windows) {
        return unavailable(
            false,
            tr!(
                "Per-driver DPC-meting is alleen beschikbaar op Windows.",
                "Per-driver DPC measurement is only available on Windows."
            )
            .to_string(),
            None,
        );
    }
    if !crate::elevation::is_elevated() {
        return unavailable(
            true,
            tr!(
                "Deze meting gebruikt kernel-tracing (ETW) en vereist beheerdersrechten. Herstart de app als beheerder.",
                "This measurement uses kernel tracing (ETW) and requires administrator rights. Restart the app as administrator."
            )
            .to_string(),
            None,
        );
    }
    #[cfg(windows)]
    {
        etw::run(duration_secs)
    }
    #[cfg(not(windows))]
    {
        unreachable!()
    }
}

#[cfg(windows)]
mod etw {
    use std::sync::Mutex;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::time::{Duration, Instant};

    use windows::Win32::Foundation::{ERROR_ALREADY_EXISTS, ERROR_SUCCESS, WIN32_ERROR};
    use windows::Win32::System::Diagnostics::Etw::{
        CONTROLTRACE_HANDLE, CloseTrace, ControlTraceW, EVENT_RECORD, EVENT_TRACE_CONTROL_STOP,
        EVENT_TRACE_FLAG, EVENT_TRACE_FLAG_DPC, EVENT_TRACE_FLAG_INTERRUPT, EVENT_TRACE_LOGFILEW,
        EVENT_TRACE_PROPERTIES, EVENT_TRACE_REAL_TIME_MODE, EVENT_TRACE_SYSTEM_LOGGER_MODE,
        OpenTraceW, PROCESS_TRACE_MODE_EVENT_RECORD, PROCESS_TRACE_MODE_REAL_TIME, ProcessTrace,
        StartTraceW, WNODE_FLAG_TRACED_GUID,
    };
    use windows::Win32::System::Performance::QueryPerformanceFrequency;
    use windows::Win32::System::ProcessStatus::{EnumDeviceDrivers, GetDeviceDriverBaseNameW};
    use windows::core::{GUID, PCWSTR, PWSTR};

    use super::{Accum, DriverMap, Kind, build_report, parse_payload, unavailable};
    use crate::models::DriverLatencyReport;
    use crate::tr;

    const SESSION_NAME: &str = "PC-Checker-DPC-Trace";
    /// Eigen sessie-GUID (willekeurig gekozen, vast zodat een achtergebleven sessie herkenbaar is).
    const SESSION_GUID: GUID = GUID::from_u128(0x5c1b6a3e_8f2d_4c71_9a0e_7d3b2f9e4a11);
    /// Klasse-GUID van de kernel-"PerfInfo"-events (DPC, ISR, timers).
    const PERFINFO_GUID: GUID = GUID::from_u128(0xce1dbfb4_137e_4da6_87b0_3f59aa102cbc);
    const OPCODE_THREADED_DPC: u8 = 66;
    const OPCODE_ISR: u8 = 67;
    const OPCODE_DPC: u8 = 68;
    const OPCODE_TIMER_DPC: u8 = 69;
    /// Ontbreken in de `windows`-crate:
    const PROCESS_TRACE_MODE_RAW_TIMESTAMP: u32 = 0x0000_1000;
    const EVENT_HEADER_FLAG_32_BIT_HEADER: u16 = 0x0020;
    const INVALID_PROCESSTRACE_HANDLE: u64 = u64::MAX;
    /// `Wnode.ClientContext = 1` → tijdstempels in QPC-ticks (dezelfde klok als `InitialTime`).
    const CLOCK_QPC: u32 = 1;

    static ACC: Mutex<Option<Accum>> = Mutex::new(None);
    static RUNNING: AtomicBool = AtomicBool::new(false);

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    /// EVENT_TRACE_PROPERTIES met ruimte voor de sessienaam erachter (zoals de API vereist).
    struct Props {
        buf: Vec<u64>,
    }

    impl Props {
        fn new() -> Self {
            let size = std::mem::size_of::<EVENT_TRACE_PROPERTIES>() + 1024;
            let mut p = Self {
                buf: vec![0u64; size.div_ceil(8)],
            };
            let props = p.ptr();
            // SAFETY: de buffer is groot genoeg en 8-byte uitgelijnd.
            unsafe {
                (*props).Wnode.BufferSize = size as u32;
                (*props).Wnode.Guid = SESSION_GUID;
                (*props).Wnode.ClientContext = CLOCK_QPC;
                (*props).Wnode.Flags = WNODE_FLAG_TRACED_GUID;
                (*props).LoggerNameOffset = std::mem::size_of::<EVENT_TRACE_PROPERTIES>() as u32;
            }
            p
        }
        fn ptr(&mut self) -> *mut EVENT_TRACE_PROPERTIES {
            self.buf.as_mut_ptr() as *mut EVENT_TRACE_PROPERTIES
        }
    }

    fn stop_session(name: &[u16]) -> (WIN32_ERROR, u32) {
        let mut props = Props::new();
        // SAFETY: geldige, correct ingevulde properties-buffer en nul-getermineerde naam.
        let err = unsafe {
            ControlTraceW(
                CONTROLTRACE_HANDLE { Value: 0 },
                PCWSTR(name.as_ptr()),
                props.ptr(),
                EVENT_TRACE_CONTROL_STOP,
            )
        };
        // SAFETY: ControlTrace vult de properties in.
        let lost = unsafe { (*props.ptr()).EventsLost };
        (err, lost)
    }

    fn start_session(name: &[u16]) -> WIN32_ERROR {
        let mut props = Props::new();
        let p = props.ptr();
        // SAFETY: zie Props::new.
        unsafe {
            (*p).LogFileMode = EVENT_TRACE_REAL_TIME_MODE | EVENT_TRACE_SYSTEM_LOGGER_MODE;
            (*p).EnableFlags =
                EVENT_TRACE_FLAG(EVENT_TRACE_FLAG_DPC.0 | EVENT_TRACE_FLAG_INTERRUPT.0);
            (*p).BufferSize = 256; // KB per buffer: DPC's komen in hoge aantallen
            (*p).MinimumBuffers = 64;
            (*p).MaximumBuffers = 256;
            (*p).FlushTimer = 1;
            let mut handle = CONTROLTRACE_HANDLE { Value: 0 };
            StartTraceW(&mut handle, PCWSTR(name.as_ptr()), p)
        }
    }

    unsafe extern "system" fn on_event(record: *mut EVENT_RECORD) {
        // SAFETY: ETW geeft een geldige pointer voor de duur van de callback.
        let r = unsafe { &*record };
        if r.EventHeader.ProviderId != PERFINFO_GUID {
            return;
        }
        let kind = match r.EventHeader.EventDescriptor.Opcode {
            OPCODE_DPC | OPCODE_THREADED_DPC | OPCODE_TIMER_DPC => Kind::Dpc,
            OPCODE_ISR => Kind::Isr,
            _ => return,
        };
        if r.UserData.is_null() {
            return;
        }
        // SAFETY: UserData wijst naar UserDataLength bytes payload.
        let data = unsafe {
            std::slice::from_raw_parts(r.UserData as *const u8, r.UserDataLength as usize)
        };
        let is32 = r.EventHeader.Flags & EVENT_HEADER_FLAG_32_BIT_HEADER != 0;
        let Some((initial, routine)) = parse_payload(data, is32) else {
            return;
        };
        let ts = r.EventHeader.TimeStamp as u64;
        if ts < initial {
            return;
        }
        if let Ok(mut g) = ACC.lock()
            && let Some(acc) = g.as_mut()
        {
            acc.record(kind, routine, ts - initial);
        }
    }

    fn loaded_drivers() -> DriverMap {
        let mut bases = vec![std::ptr::null_mut(); 2048];
        let mut needed = 0u32;
        // SAFETY: buffer met de opgegeven grootte in bytes.
        let ok = unsafe {
            EnumDeviceDrivers(
                bases.as_mut_ptr(),
                (bases.len() * std::mem::size_of::<*mut core::ffi::c_void>()) as u32,
                &mut needed,
            )
        };
        if ok.is_err() {
            return DriverMap::default();
        }
        let n = (needed as usize / std::mem::size_of::<*mut core::ffi::c_void>()).min(bases.len());
        let mut list = Vec::with_capacity(n);
        let mut name = [0u16; 260];
        for &base in &bases[..n] {
            // SAFETY: base komt uit EnumDeviceDrivers.
            let len = unsafe { GetDeviceDriverBaseNameW(base, &mut name) } as usize;
            if len > 0 {
                list.push((base as u64, String::from_utf16_lossy(&name[..len])));
            }
        }
        DriverMap::new(list)
    }

    pub fn run(duration_secs: u64) -> DriverLatencyReport {
        if RUNNING.swap(true, Ordering::SeqCst) {
            return unavailable(
                false,
                tr!(
                    "Er loopt al een driver-meting.",
                    "A driver measurement is already running."
                )
                .into(),
                None,
            );
        }
        let report = run_inner(duration_secs);
        RUNNING.store(false, Ordering::SeqCst);
        report
    }

    fn run_inner(duration_secs: u64) -> DriverLatencyReport {
        let mut freq = 0i64;
        // SAFETY: schrijft één i64.
        if unsafe { QueryPerformanceFrequency(&mut freq) }.is_err() || freq <= 0 {
            return unavailable(
                false,
                tr!("QPC-klok niet beschikbaar.", "QPC clock not available.").into(),
                None,
            );
        }
        let mut name = wide(SESSION_NAME);

        // Een eerder (bijv. na een crash) achtergebleven sessie opruimen.
        let _ = stop_session(&name);
        let mut err = start_session(&name);
        if err == ERROR_ALREADY_EXISTS {
            let _ = stop_session(&name);
            err = start_session(&name);
        }
        if err != ERROR_SUCCESS {
            return unavailable(
                false,
                tr!(
                    "Kon de kernel-trace niet starten.",
                    "Could not start the kernel trace."
                )
                .into(),
                Some(format!("StartTraceW: Win32-fout {}", err.0)),
            );
        }

        *ACC.lock().unwrap_or_else(|e| e.into_inner()) = Some(Accum::default());

        let mut logfile = EVENT_TRACE_LOGFILEW {
            LoggerName: PWSTR(name.as_mut_ptr()),
            ..Default::default()
        };
        logfile.Anonymous1.ProcessTraceMode = PROCESS_TRACE_MODE_REAL_TIME
            | PROCESS_TRACE_MODE_EVENT_RECORD
            | PROCESS_TRACE_MODE_RAW_TIMESTAMP;
        logfile.Anonymous2.EventRecordCallback = Some(on_event);
        // SAFETY: logfile is volledig ingevuld; name leeft tot na CloseTrace.
        let trace = unsafe { OpenTraceW(&mut logfile) };
        if trace.Value == INVALID_PROCESSTRACE_HANDLE || trace.Value == u32::MAX as u64 {
            let _ = stop_session(&name);
            return unavailable(
                false,
                tr!("Kon de trace niet openen.", "Could not open the trace.").into(),
                Some("OpenTraceW".into()),
            );
        }

        // ProcessTrace blokkeert tot de sessie stopt → eigen thread.
        let consumer = std::thread::spawn(move || {
            // SAFETY: geldige trace-handle.
            unsafe { ProcessTrace(&[trace], None, None) }
        });

        let started = Instant::now();
        std::thread::sleep(Duration::from_secs(duration_secs));
        let (_, events_lost) = stop_session(&name);
        let _ = consumer.join();
        // SAFETY: handle uit OpenTraceW, hierna niet meer gebruikt.
        unsafe {
            let _ = CloseTrace(trace);
        }
        let elapsed_ms = started.elapsed().as_millis() as u64;

        let acc = ACC
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .take()
            .unwrap_or_default();
        build_report(
            &acc,
            &loaded_drivers(),
            freq as u64,
            elapsed_ms,
            events_lost,
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::i18n::with_language;

    const FREQ: u64 = 10_000_000; // 10 MHz = 0,1 µs per tick

    fn map() -> DriverMap {
        DriverMap::new(vec![
            (0xFFFF_F800_0000_0000, "ntoskrnl.exe".into()),
            (0xFFFF_F801_0000_0000, "nvlddmkm.sys".into()),
            (0xFFFF_F802_0000_0000, "ndis.sys".into()),
            (0, "ignored.sys".into()),
        ])
    }

    #[test]
    fn payload_parsing_64_and_32_bit() {
        let mut d = Vec::new();
        d.extend_from_slice(&123u64.to_le_bytes());
        d.extend_from_slice(&0xFFFF_F801_0000_1234u64.to_le_bytes());
        assert_eq!(parse_payload(&d, false), Some((123, 0xFFFF_F801_0000_1234)));
        assert_eq!(parse_payload(&d[..12], true), Some((123, 0x0000_1234)));
        assert_eq!(parse_payload(&d[..10], false), None);
    }

    #[test]
    fn addresses_resolve_to_containing_driver() {
        let m = map();
        assert_eq!(m.resolve(0xFFFF_F801_0000_0500), "nvlddmkm.sys");
        assert_eq!(m.resolve(0xFFFF_F802_0000_0000), "ndis.sys");
        assert_eq!(m.resolve(0xFFFF_F800_1000_0000), "ntoskrnl.exe");
        assert_eq!(with_language(false, || m.resolve(0x1000)), "Onbekend");
    }

    #[test]
    fn report_aggregates_per_driver_and_sorts() {
        let mut acc = Accum::default();
        // Twee routines in de NVIDIA-driver: 300 µs en 2500 µs.
        acc.record(Kind::Dpc, 0xFFFF_F801_0000_0100, 3_000);
        acc.record(Kind::Dpc, 0xFFFF_F801_0000_0200, 25_000);
        acc.record(Kind::Dpc, 0xFFFF_F802_0000_0100, 1_000);
        acc.record(Kind::Isr, 0xFFFF_F802_0000_0100, 400);
        let r = with_language(false, || build_report(&acc, &map(), FREQ, 10_000, 0));
        assert!(r.is_available);
        assert_eq!(r.dpc_count, 3);
        assert_eq!(r.isr_count, 1);
        assert_eq!(r.drivers[0].driver, "nvlddmkm.sys");
        assert_eq!(r.drivers[0].dpc_count, 2);
        assert!((r.drivers[0].dpc_max_us - 2500.0).abs() < 1e-6);
        assert!((r.drivers[0].dpc_total_ms - 2.8).abs() < 1e-9);
        assert_eq!(
            r.drivers[0].description.as_deref(),
            Some("NVIDIA-videodriver")
        );
        assert_eq!(r.highest_dpc_driver.as_deref(), Some("nvlddmkm.sys"));
        assert_eq!(r.highest_isr_driver.as_deref(), Some("ndis.sys"));
        assert_eq!(r.verdict, VERDICT_BAD);
        assert!(r.summary.contains("nvlddmkm.sys"));
    }

    #[test]
    fn implausible_durations_are_dropped() {
        let mut acc = Accum::default();
        acc.record(Kind::Dpc, 0xFFFF_F802_0000_0100, FREQ * 5); // 5 seconden: meetfout
        acc.record(Kind::Dpc, 0xFFFF_F802_0000_0200, 500); // 50 µs
        let r = build_report(&acc, &map(), FREQ, 1000, 0);
        assert_eq!(r.dpc_count, 1);
        assert_eq!(r.verdict, VERDICT_GOOD);
    }

    #[test]
    fn verdict_thresholds() {
        assert_eq!(verdict_for(100.0, 10.0), VERDICT_GOOD);
        assert_eq!(verdict_for(600.0, 10.0), VERDICT_WARN);
        assert_eq!(verdict_for(100.0, 150.0), VERDICT_WARN);
        assert_eq!(verdict_for(2500.0, 10.0), VERDICT_BAD);
        assert_eq!(verdict_for(100.0, 600.0), VERDICT_BAD);
    }

    #[test]
    fn empty_trace_is_untested_and_english_summary_works() {
        let r = with_language(true, || {
            build_report(&Accum::default(), &map(), FREQ, 1000, 0)
        });
        assert_eq!(r.verdict, VERDICT_UNTESTED);
        assert!(r.summary.starts_with("No DPC/ISR events"));
    }

    #[test]
    fn known_driver_descriptions() {
        assert_eq!(
            with_language(true, || describe_driver("NETwtw10.sys")).as_deref(),
            Some("Intel Wi-Fi driver")
        );
        assert!(describe_driver("something.sys").is_none());
    }

    /// Echte kernel-trace. Draai in een terminal **als administrator**:
    /// `cargo test --manifest-path src-tauri/Cargo.toml live_etw -- --ignored --nocapture`
    #[test]
    #[ignore = "vereist beheerdersrechten"]
    fn live_etw_trace() {
        let r = run_driver_latency_trace(3);
        println!("{:#?}", r);
        assert!(
            r.is_available,
            "trace niet beschikbaar: {:?} {:?}",
            r.summary, r.error
        );
        assert!(r.dpc_count > 0, "geen DPC-events ontvangen");
        assert!(r.drivers.iter().all(|d| !d.driver.is_empty()));
    }
}
