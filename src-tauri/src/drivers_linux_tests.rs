use super::*;

fn today() -> NaiveDate {
    NaiveDate::from_ymd_opt(2026, 11, 13).unwrap()
}

fn date(y: i32, m: u32, d: u32) -> Option<NaiveDate> {
    NaiveDate::from_ymd_opt(y, m, d)
}

/// Ingekorte `lspci -vmmkD`-uitvoer van een echte desktop (Z370, GTX 1060, Arch Linux).
const LSPCI: &str = "Slot:\t0000:00:00.0
Class:\tHost bridge
Vendor:\tIntel Corporation
Device:\tXeon E3-1200 v6/7th Gen Core Processor Host Bridge/DRAM Registers
SVendor:\tASUSTeK Computer Inc.
SDevice:\tDevice 8694
Rev:\t05
Driver:\tskl_uncore

Slot:\t0000:00:17.0
Class:\tRAID bus controller
Vendor:\tIntel Corporation
Device:\tSATA Controller (RAID 0/1/5/10) In-box Compatible ID (Desktop RST)
Driver:\tahci
Module:\tahci

Slot:\t0000:00:1f.6
Class:\tEthernet controller
Vendor:\tIntel Corporation
Device:\tEthernet Connection (2) I219-V
Driver:\te1000e
Module:\te1000e

Slot:\t0000:01:00.0
Class:\tVGA compatible controller
Vendor:\tNVIDIA Corporation
Device:\tGP106 [GeForce GTX 1060 6GB]
Driver:\tnvidia
Module:\tnouveau
Module:\tnvidia_drm
Module:\tnvidia
";

fn device(slot: &str, class_code: u32, driver: Option<&str>) -> PciDevice {
    PciDevice {
        slot: slot.into(),
        class_code,
        name: format!("Device {slot}"),
        driver: driver.map(str::to_string),
        module: driver.map(str::to_string),
        ..Default::default()
    }
}

/// Gezonde machine: actuele kernel, NVIDIA-driver van buiten de kernel, schone log.
fn healthy_snapshot() -> LinuxSnapshot {
    let mut devices = vec![
        device("0000:00:00.0", 0x060000, Some("skl_uncore")),
        device("0000:00:01.0", 0x060400, Some("pcieport")),
        device("0000:00:1f.0", 0x060100, None), // ISA-bridge zonder driver: normaal
        device("0000:00:17.0", 0x010400, Some("ahci")),
        device("0000:00:1f.6", 0x020000, Some("e1000e")),
        device("0000:01:00.0", 0x030000, Some("nvidia")),
    ];
    apply_lspci(&mut devices, &parse_lspci(LSPCI));
    devices[3].aliases = vec!["ata1".into(), "ata2".into()];

    let mut modules = HashMap::new();
    modules.insert(
        "ahci".into(),
        ModuleInfo {
            version: Some("3.0".into()),
            taint: Some(String::new()),
        },
    );
    modules.insert(
        "e1000e".into(),
        ModuleInfo {
            version: None,
            taint: Some(String::new()),
        },
    );
    modules.insert(
        "nvidia".into(),
        ModuleInfo {
            version: Some("580.178.04".into()),
            taint: Some("POE".into()),
        },
    );

    LinuxSnapshot {
        devices,
        modules,
        kernel_release: "7.2.11-arch1-1".into(),
        kernel_build_date: date(2026, 10, 16),
        nvidia_build_date: date(2026, 7, 7),
        signing_enabled: true,
        kernel_log: Some(vec![
            log(4, "MDS CPU bug present and SMT on, data leak possible."),
            log(
                4,
                "ata1.00: supports DRM functions and may not be fully accessible",
            ),
            log(3, "usb 1-3: 2:1: cannot get freq at ep 0x1"),
        ]),
    }
}

fn log(priority: u8, message: &str) -> KernelLogLine {
    KernelLogLine {
        priority,
        message: message.into(),
    }
}

fn report(snap: &LinuxSnapshot) -> DriverReport {
    build_linux_report(snap, today(), "test".into())
}

fn entry<'a>(r: &'a DriverReport, name_part: &str) -> &'a DriverEntry {
    r.entries
        .iter()
        .find(|e| e.device_name.contains(name_part))
        .unwrap_or_else(|| panic!("geen entry met '{name_part}'"))
}

#[test]
fn linux_pci_classes_map_to_windows_class_names() {
    assert_eq!(linux_class(0x030000), "DISPLAY");
    assert_eq!(linux_class(0x030200), "DISPLAY"); // 3D-controller (Optimus)
    assert_eq!(linux_class(0x010601), "HDC"); // AHCI
    assert_eq!(linux_class(0x010802), "SCSIADAPTER"); // NVMe
    assert_eq!(linux_class(0x020000), "NET");
    assert_eq!(linux_class(0x028000), "NET"); // Wi-Fi
    assert_eq!(linux_class(0x040300), "MEDIA");
    assert_eq!(linux_class(0x0c0330), "USB");
    assert_eq!(linux_class(0x0c0500), "SYSTEM"); // SMBus
    assert_eq!(linux_class(0x060400), "SYSTEM"); // PCI-bridge
    assert_eq!(linux_class(0xff0000), "OTHER");
}

#[test]
fn linux_find_date_handles_distro_formats() {
    // Arch
    assert_eq!(
        find_date("#1 SMP PREEMPT_DYNAMIC Fri, 16 Oct 2026 00:28:58 +0000"),
        date(2026, 10, 16)
    );
    // Ubuntu / Fedora
    assert_eq!(
        find_date("#58-Ubuntu SMP PREEMPT_DYNAMIC Thu Oct 10 13:02:14 UTC 2024"),
        date(2024, 10, 10)
    );
    // Debian
    assert_eq!(
        find_date("#1 SMP PREEMPT_DYNAMIC Debian 6.1.115-1 (2024-11-01)"),
        date(2024, 11, 1)
    );
    // NVIDIA
    assert_eq!(
        find_date(
            "NVRM version: NVIDIA UNIX x86_64 Kernel Module  580.178.04  Tue Jul  7 12:38:21 UTC 2026"
        ),
        date(2026, 7, 7)
    );
    assert_eq!(find_date("#1 SMP"), None);
}

#[test]
fn linux_parse_lspci_reads_names_and_candidate_modules() {
    let recs = parse_lspci(LSPCI);
    assert_eq!(recs.len(), 4);
    let gpu = recs.iter().find(|r| r.slot == "0000:01:00.0").unwrap();
    assert_eq!(gpu.vendor, "NVIDIA Corporation");
    assert_eq!(gpu.device, "GP106 [GeForce GTX 1060 6GB]");
    assert_eq!(gpu.modules, ["nouveau", "nvidia_drm", "nvidia"]);
}

#[test]
fn linux_parse_journal_json_skips_binary_messages() {
    let raw = r#"{"PRIORITY":"3","MESSAGE":"amdgpu 0000:03:00.0: ring gfx timeout"}
{"PRIORITY":"4","MESSAGE":[104,105]}
not json
{"PRIORITY":"4","MESSAGE":"  "}"#;
    let lines = parse_journal_json(raw);
    assert_eq!(lines.len(), 1);
    assert_eq!(lines[0].priority, 3);
    assert_eq!(lines[0].message, "amdgpu 0000:03:00.0: ring gfx timeout");
}

#[test]
fn linux_healthy_system_has_no_issues_and_hides_bridges() {
    let r = report(&healthy_snapshot());
    assert!(r.is_available);
    assert_eq!(r.total_drivers, 5);
    assert_eq!(
        (r.problem_count, r.outdated_count, r.unsigned_count),
        (0, 0, 0)
    );
    // Alleen GPU, opslag en netwerk; geen bridges of de ISA-bridge zonder driver.
    assert_eq!(r.entries.len(), 3);
    assert!(r.entries.iter().all(|e| e.status == "OK"));

    let gpu = entry(&r, "GTX 1060");
    assert_eq!(gpu.device_class, "DISPLAY");
    assert_eq!(gpu.version, "580.178.04");
    assert_eq!(gpu.date, "2026-07-07");
    assert_eq!(gpu.is_signed, Some(false));
    assert!(gpu.provider.contains("nvidia"));

    let nic = entry(&r, "I219-V");
    assert_eq!(nic.version, "7.2.11-arch1-1");
    assert_eq!(nic.date, "2026-10-16");
    assert_eq!(nic.is_signed, Some(true));
}

#[test]
fn linux_gpu_without_driver_is_problem_with_modprobe_hint() {
    let mut snap = healthy_snapshot();
    let gpu = snap
        .devices
        .iter_mut()
        .find(|d| d.slot == "0000:01:00.0")
        .unwrap();
    gpu.driver = None;
    gpu.module = None;
    let r = report(&snap);
    assert_eq!(r.problem_count, 1);
    let e = entry(&r, "GTX 1060");
    assert_eq!(e.status, "Probleem");
    assert_eq!(e.version, "");
    assert!(e.advice.contains("modprobe nouveau"), "{}", e.advice);
    // Problemen staan bovenaan.
    assert_eq!(r.entries[0].device_name, e.device_name);
}

#[test]
fn linux_kernel_log_errors_are_attributed_to_the_right_device() {
    let mut snap = healthy_snapshot();
    snap.kernel_log = Some(vec![
        log(3, "ata1.00: failed command: READ FPDMA QUEUED"),
        log(3, "ata10.00: failed command: READ FPDMA QUEUED"), // andere controller
        log(
            3,
            "NVRM: Xid (PCI:0000:01:00): 79, pid=1234, GPU has fallen off the bus.",
        ),
        log(
            4,
            "e1000e 0000:00:1f.6 enp0s31f6: NIC Link is Up 1000 Mbps Full Duplex",
        ), // geen probleem
    ]);
    let r = report(&snap);
    assert_eq!(r.problem_count, 2);

    let sata = entry(&r, "SATA Controller");
    assert_eq!(sata.status, "Probleem");
    assert!(sata.advice.contains("1 fout"), "{}", sata.advice);
    assert!(sata.advice.contains("AHCI"));

    let gpu = entry(&r, "GTX 1060");
    assert_eq!(gpu.status, "Probleem");
    assert!(gpu.advice.contains("fallen off the bus"));

    assert_eq!(entry(&r, "I219-V").status, "OK");
}

#[test]
fn linux_missing_firmware_gets_firmware_advice() {
    let mut snap = healthy_snapshot();
    snap.kernel_log = Some(vec![log(
        4,
        "e1000e 0000:00:1f.6: Direct firmware load for e1000e/foo.bin failed with error -2",
    )]);
    let e = report(&snap)
        .entries
        .into_iter()
        .find(|e| e.device_name.contains("I219-V"))
        .unwrap();
    assert_eq!(e.status, "Probleem");
    assert!(e.advice_detail.title.contains("Firmware"));
    assert!(e.advice.contains("linux-firmware"));
}

#[test]
fn linux_old_kernel_flags_gpu_driver_before_other_classes() {
    let mut snap = healthy_snapshot();
    snap.kernel_build_date = date(2024, 11, 1); // ~2 jaar oud
    // GPU via een in-tree driver, zodat de kernelleeftijd telt.
    let gpu = snap
        .devices
        .iter_mut()
        .find(|d| d.slot == "0000:01:00.0")
        .unwrap();
    gpu.driver = Some("nouveau".into());
    gpu.module = Some("nouveau".into());
    snap.modules.insert(
        "nouveau".into(),
        ModuleInfo {
            version: None,
            taint: Some(String::new()),
        },
    );

    let r = report(&snap);
    assert_eq!(entry(&r, "GTX 1060").status, "Verouderd"); // grens 1 jaar
    assert_eq!(entry(&r, "I219-V").status, "OK"); // grens 3 jaar
    assert_eq!(r.outdated_count, 1);
}

#[test]
fn linux_passthrough_device_is_ok() {
    let mut snap = healthy_snapshot();
    let gpu = snap
        .devices
        .iter_mut()
        .find(|d| d.slot == "0000:01:00.0")
        .unwrap();
    gpu.driver = Some("vfio-pci".into());
    gpu.module = Some("vfio_pci".into());
    let e = report(&snap)
        .entries
        .into_iter()
        .find(|e| e.device_name.contains("GTX"))
        .unwrap();
    assert_eq!(e.status, "OK");
    assert!(e.advice.contains("vfio-pci"));
}

#[test]
fn linux_unreadable_kernel_log_is_mentioned_in_summary() {
    let mut snap = healthy_snapshot();
    snap.kernel_log = None;
    assert!(report(&snap).summary.contains("systemd-journal"));
    assert!(
        !report(&healthy_snapshot())
            .summary
            .contains("systemd-journal")
    );
}

#[test]
fn linux_contains_token_respects_word_boundaries() {
    assert!(contains_token("ata1.00", "ata1"));
    assert!(!contains_token("ata10.00", "ata1"));
    assert!(contains_token("nvme nvme0", "nvme0"));
    assert!(contains_token("amdgpu 0000:03:00.0", "0000:03:00.0"));
    assert!(!contains_token("0000:03:00.01", "0000:03:00.0"));
}
