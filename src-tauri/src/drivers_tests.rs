use super::*;
use chrono::NaiveDate;

fn today() -> NaiveDate {
    NaiveDate::from_ymd_opt(2026, 10, 29).unwrap()
}

fn parse(raw: &str) -> DriverReport {
    parse_report(raw, today(), "test".to_string())
}

fn find<'a>(r: &'a DriverReport, name: &str) -> Option<&'a DriverEntry> {
    r.entries.iter().find(|e| e.device_name == name)
}

/// Echte regels van een Windows 11-laptop (Win32_PnPSignedDriver), aangevuld met een
/// synthetisch probleemapparaat (code 43), een oude GPU-driver en een niet-ondertekende driver.
const FIXTURE: &str = r#"{"Signed":[
{"DeviceName":"WAN Miniport (IP)","DeviceClass":"NET","DriverProviderName":"Microsoft","DriverVersion":"10.0.26100.1","DriverDate":"2006-06-21","IsSigned":true,"DeviceID":"SWD\\MSRRAS\\MS_NDISWANIP"},
{"DeviceName":"AAP Server","DeviceClass":null,"DriverProviderName":null,"DriverVersion":null,"DriverDate":"","IsSigned":null,"DeviceID":"BTHENUM\\{74EC2172-0BAD-4D01-8F77-997B2BE0722A}_VID&0001004C_PID&200F\\7&15C6D04F&2&201582531B4E_C00000000"},
{"DeviceName":"Intel(R) Iris(R) Xe Graphics","DeviceClass":"DISPLAY","DriverProviderName":"Intel Corporation","DriverVersion":"32.0.101.7085","DriverDate":"2026-03-03","IsSigned":true,"DeviceID":"PCI\\VEN_8086&DEV_9A49&SUBSYS_508817AA&REV_01\\3&11583659&1&10"},
{"DeviceName":"NVIDIA GeForce GTX 1060 6GB","DeviceClass":"DISPLAY","DriverProviderName":"NVIDIA","DriverVersion":"31.0.15.3623","DriverDate":"2023-06-02","IsSigned":true,"DeviceID":"PCI\\VEN_10DE&DEV_1C03&SUBSYS_85AE1043&REV_A1\\4&2B8C1A3&0&0008"},
{"DeviceName":"Realtek PCIe GbE Family Controller","DeviceClass":"NET","DriverProviderName":"Realtek","DriverVersion":"10.50.511.2021","DriverDate":"2021-05-11","IsSigned":true,"DeviceID":"PCI\\VEN_10EC&DEV_8168&SUBSYS_508717AA&REV_15\\01000000684CE00000"},
{"DeviceName":"Intel(R) PCI Express Root Port #9 - A0B0","DeviceClass":"SYSTEM","DriverProviderName":"INTEL","DriverVersion":"10.1.24.6","DriverDate":"1968-07-18","IsSigned":true,"DeviceID":"PCI\\VEN_8086&DEV_A0B0&SUBSYS_508717AA&REV_20\\3&11583659&1&E8"},
{"DeviceName":"Intel(R) Platform Monitoring Technology Driver","DeviceClass":"SYSTEM","DriverProviderName":"Intel(R) Platform Monitoring Technology Device","DriverVersion":"10.0.26100.8972","DriverDate":"2006-06-21","IsSigned":true,"DeviceID":"PCI\\VEN_8086&DEV_9A0D&SUBSYS_508717AA&REV_01\\3&11583659&1&50"},
{"DeviceName":"Standard NVM Express Controller","DeviceClass":"SCSIADAPTER","DriverProviderName":"Microsoft","DriverVersion":"10.0.26100.9549","DriverDate":"2006-06-21","IsSigned":true,"DeviceID":"PCI\\VEN_144D&DEV_A809&SUBSYS_A801144D&REV_00\\4&1B840BBE&0&00E8"},
{"DeviceName":"Microsoft Storage Spaces Controller","DeviceClass":"SCSIADAPTER","DriverProviderName":"Microsoft","DriverVersion":"10.0.26100.9711","DriverDate":"2006-06-21","IsSigned":true,"DeviceID":"ROOT\\SPACEPORT\\0000"},
{"DeviceName":"Intel® Smart Sound Technology for Digital Microphones","DeviceClass":"MEDIA","DriverProviderName":"Intel(R) Corporation","DriverVersion":"10.29.0.7767","DriverDate":"2022-05-30","IsSigned":true,"DeviceID":"INTELAUDIO\\CTLR_DEV_A0C8&LINKTYPE_02&DEVTYPE_00&VEN_8086&DEV_AE20&SUBSYS_508717AA&REV_0001\\4&2BE61CE6&0&0000"},
{"DeviceName":"USB Composite Device","DeviceClass":"USB","DriverProviderName":"Microsoft","DriverVersion":"10.0.26100.9711","DriverDate":"2006-06-21","IsSigned":true,"DeviceID":"USB\\VID_3554&PID_FA09\\5&C5FC33B&0&5"},
{"DeviceName":"Generic USB Hub","DeviceClass":"USB","DriverProviderName":"Microsoft","DriverVersion":"10.0.26100.9711","DriverDate":"2006-06-21","IsSigned":true,"DeviceID":"USB\\VID_05E3&PID_0610\\6&1A2B3C&0&1"},
{"DeviceName":"Cheap RGB Controller","DeviceClass":"HIDCLASS","DriverProviderName":"RGBSoft","DriverVersion":"1.0.0.1","DriverDate":"2019-01-01","IsSigned":false,"DeviceID":"ROOT\\RGBCTRL\\0000"}
],"Problems":[
{"Name":"Generic USB Hub","PNPClass":"USB","ConfigManagerErrorCode":43,"DeviceID":"usb\\vid_05e3&pid_0610\\6&1a2b3c&0&1"},
{"Name":"Onbekend apparaat","PNPClass":null,"ConfigManagerErrorCode":28,"DeviceID":"ACPI\\VEN_XYZ\\1"}
]}"#;

#[test]
fn drivers_problem_device_is_probleem() {
    let r = parse(FIXTURE);
    assert!(r.is_available);
    let hub = find(&r, "Generic USB Hub").expect("probleemapparaat ontbreekt");
    assert_eq!(hub.status, "Probleem");
    assert_eq!(hub.problem_code, Some(43));
    assert!(hub.advice.contains("Code 43"));
    // Gestructureerd: kop = foutcode, drie herstelstappen, daarna een vervolgplan.
    assert!(hub.advice_detail.title.starts_with("Code 43"));
    assert_eq!(hub.advice_detail.steps.len(), 3);
    assert!(hub.advice_detail.fallback_title.is_some());
    assert!(!hub.advice_detail.fallback_steps.is_empty());
    // Niet-gematcht probleemapparaat (code 28) komt ook in de lijst.
    let unk = find(&r, "Onbekend apparaat").expect("code 28 ontbreekt");
    assert_eq!(unk.status, "Probleem");
    assert_eq!(unk.problem_code, Some(28));
    assert_eq!(r.problem_count, 2);
    // Problemen staan bovenaan.
    assert_eq!(r.entries[0].status, "Probleem");
    assert_eq!(r.entries[1].status, "Probleem");
}

#[test]
fn drivers_old_gpu_is_verouderd() {
    let r = parse(FIXTURE);
    let gpu = find(&r, "NVIDIA GeForce GTX 1060 6GB").unwrap();
    assert_eq!(gpu.status, "Verouderd");
    assert!(gpu.advice.contains("DDU"));
    assert!(gpu.age_years.unwrap() > 3.0);
    // Recente Intel-GPU-driver (7 maanden) is OK.
    let iris = find(&r, "Intel(R) Iris(R) Xe Graphics").unwrap();
    assert_eq!(iris.status, "OK");
    // Realtek NIC uit 2021 (> 3 jaar) is verouderd.
    assert_eq!(
        find(&r, "Realtek PCIe GbE Family Controller")
            .unwrap()
            .status,
        "Verouderd"
    );
    // Intel SST uit 2022 (4,4 jaar) is verouderd en het ®-teken blijft intact.
    let sst = find(&r, "Intel® Smart Sound Technology for Digital Microphones").unwrap();
    assert_eq!(sst.status, "Verouderd");
}

#[test]
fn drivers_microsoft_inbox_2006_is_ok() {
    let r = parse(FIXTURE);
    let nvme = find(&r, "Standard NVM Express Controller").unwrap();
    assert_eq!(nvme.status, "OK");
    assert_eq!(nvme.age_years, None);
    assert_eq!(nvme.date, "2006-06-21");
    // Misleidende leveranciersnaam met 10.0.x + 2006-datum: inbox, niet in de lijst.
    assert!(find(&r, "Intel(R) Platform Monitoring Technology Driver").is_none());
}

#[test]
fn drivers_intel_1968_placeholder_is_ok() {
    let r = parse(FIXTURE);
    let rp = find(&r, "Intel(R) PCI Express Root Port #9 - A0B0").unwrap();
    assert_eq!(rp.status, "OK");
    assert_eq!(rp.age_years, None);
}

#[test]
fn drivers_unsigned_and_noise_filtering() {
    let r = parse(FIXTURE);
    let rgb = find(&r, "Cheap RGB Controller").unwrap();
    assert_eq!(rgb.status, "Niet ondertekend");
    assert_eq!(r.unsigned_count, 1);
    // Ruis: WAN Miniport, BTHENUM zonder driver, MS Storage Spaces, MS USB composite.
    assert!(find(&r, "WAN Miniport (IP)").is_none());
    assert!(find(&r, "AAP Server").is_none());
    assert!(find(&r, "Microsoft Storage Spaces Controller").is_none());
    assert!(find(&r, "USB Composite Device").is_none());
    // total_drivers telt alle echte drivers (13 regels minus 1 zonder driver).
    assert_eq!(r.total_drivers, 12);
    assert_eq!(r.outdated_count, 3);
}

#[test]
fn drivers_null_is_signed_is_not_unsigned() {
    let raw = r#"{"Signed":{"DeviceName":"Foo","DeviceClass":"NET","DriverProviderName":"Acme","DriverVersion":"1.0","DriverDate":"2026-01-01","IsSigned":null,"DeviceID":"PCI\\VEN_1\\1"},"Problems":[]}"#;
    let r = parse(raw);
    let e = find(&r, "Foo").unwrap();
    assert_eq!(e.status, "OK");
    assert_eq!(e.is_signed, None);
}

#[test]
fn drivers_single_object_json() {
    // "Signed" als los object i.p.v. array, "Problems" null.
    let raw = r#"{"Signed":{"DeviceName":"AMD Radeon RX 580","DeviceClass":"DISPLAY","DriverProviderName":"Advanced Micro Devices, Inc.","DriverVersion":"27.20.1000","DriverDate":"2020-11-05","IsSigned":true,"DeviceID":"PCI\\VEN_1002&DEV_67DF\\1"},"Problems":null}"#;
    let r = parse(raw);
    assert!(r.is_available);
    assert_eq!(r.total_drivers, 1);
    assert_eq!(r.entries.len(), 1);
    assert_eq!(r.entries[0].status, "Verouderd");

    // Helemaal los driver-object zonder wrapper, met BOM.
    let raw2 = "\u{feff}{\"DeviceName\":\"Realtek Audio\",\"DeviceClass\":\"MEDIA\",\"DriverProviderName\":\"Realtek\",\"DriverVersion\":\"6.0\",\"DriverDate\":\"2026-05-01\",\"IsSigned\":true,\"DeviceID\":\"HDAUDIO\\\\1\"}";
    let r2 = parse(raw2);
    assert!(r2.is_available);
    assert_eq!(r2.entries[0].status, "OK");
}

#[test]
fn drivers_empty_or_invalid_output_is_unavailable() {
    for raw in [
        "",
        "   \r\n",
        "Get-CimInstance : Toegang geweigerd",
        "{not json",
        "{\"Signed\":[],\"Problems\":[]}",
    ] {
        let r = parse(raw);
        assert!(
            !r.is_available,
            "verwacht is_available=false voor {:?}",
            raw
        );
        assert!(r.entries.is_empty());
        assert!(!r.summary.is_empty());
    }
}

#[test]
fn drivers_basic_display_adapter_flagged() {
    let raw = r#"{"Signed":[{"DeviceName":"Microsoft Basic Display Adapter","DeviceClass":"DISPLAY","DriverProviderName":"Microsoft","DriverVersion":"10.0.26100.1","DriverDate":"2006-06-21","IsSigned":true,"DeviceID":"PCI\\VEN_10DE&DEV_2484\\1"}],"Problems":[]}"#;
    let r = parse(raw);
    assert_eq!(r.entries[0].status, "Verouderd");
    assert!(r.entries[0].advice.contains("DDU"));
}

#[test]
fn drivers_last_report_is_cached_shape() {
    // last_report() moet zonder panic vanuit een andere thread te lezen zijn.
    let h = std::thread::spawn(last_report);
    let _ = h.join().unwrap();
}

#[test]
#[ignore]
fn drivers_live_scan() {
    let r = super::scan_drivers_blocking();
    println!(
        "available={} total={} entries={} problems={} outdated={} unsigned={}\n{}",
        r.is_available,
        r.total_drivers,
        r.entries.len(),
        r.problem_count,
        r.outdated_count,
        r.unsigned_count,
        r.summary
    );
    for e in &r.entries {
        println!(
            "[{}] {} | {} | {} | {} | {} | {:?}",
            e.status, e.device_class, e.device_name, e.provider, e.version, e.date, e.age_years
        );
    }
    assert!(super::last_report().is_some());
}

#[test]
fn advice_is_structured_into_title_and_steps() {
    use crate::i18n::with_language;
    let d = with_language(false, || {
        flatten_advice(&crate::models::DriverAdvice {
            title: "Kop.".into(),
            why: Some("Waarom.".into()),
            steps: vec!["Een".into(), "Twee".into()],
            fallback_title: Some("Blijft het?".into()),
            fallback_steps: vec!["Drie".into()],
        })
    });
    assert_eq!(d, "Kop. Waarom. 1. Een 2. Twee Blijft het? - Drie");
}
