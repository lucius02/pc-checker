use super::*;
use crate::storage::{VERDICT_CRIT, VERDICT_GOOD, VERDICT_WARN, assess};

const SCAN: &str = r#"{"devices":[
  {"name":"/dev/sda","info_name":"/dev/sda [SAT]","type":"sat","protocol":"ATA"},
  {"name":"/dev/nvme0","info_name":"/dev/nvme0","type":"nvme","protocol":"NVMe"}
]}"#;

const NVME_HEALTHY: &str = r#"{
  "smartctl":{"exit_status":0},
  "device":{"name":"/dev/nvme0","type":"nvme","protocol":"NVMe"},
  "model_name":"Samsung SSD 980 PRO 1TB","serial_number":"S5GXNX0R123456",
  "nvme_total_capacity":1000204886016,
  "smart_status":{"passed":true,"nvme":{"value":0}},
  "nvme_smart_health_information_log":{
    "critical_warning":0,"temperature":41,"available_spare":100,"available_spare_threshold":10,
    "percentage_used":3,"data_units_written":45678901,"power_cycles":1234,"power_on_hours":5678,
    "unsafe_shutdowns":56,"media_errors":0,"num_err_log_entries":0
  },
  "temperature":{"current":41},"power_cycle_count":1234,"power_on_time":{"hours":5678}
}"#;

const NVME_READ_ONLY: &str = r#"{
  "device":{"name":"/dev/nvme1","type":"nvme","protocol":"NVMe"},
  "model_name":"Cheap NVMe 256GB",
  "smart_status":{"passed":false},
  "nvme_smart_health_information_log":{"critical_warning":9,"percentage_used":104,"available_spare":2,
    "available_spare_threshold":10,"media_errors":17,"temperature":0}
}"#;

const SATA_SSD_WORN: &str = r#"{
  "device":{"name":"/dev/sda","type":"sat","protocol":"ATA"},
  "model_name":"Samsung SSD 860 EVO 500GB","serial_number":"S3Z1NB0K",
  "user_capacity":{"blocks":976773168,"bytes":500107862016},
  "rotation_rate":0,
  "smart_status":{"passed":true},
  "temperature":{"current":34,"lifetime_max":61},
  "power_on_time":{"hours":21000},"power_cycle_count":900,
  "ata_smart_attributes":{"table":[
    {"id":5,"name":"Reallocated_Sector_Ct","value":100,"worst":100,"thresh":10,"when_failed":"","raw":{"value":3}},
    {"id":177,"name":"Wear_Leveling_Count","value":25,"worst":25,"thresh":0,"when_failed":"","raw":{"value":1700}},
    {"id":199,"name":"UDMA_CRC_Error_Count","value":100,"worst":100,"thresh":0,"when_failed":"","raw":{"value":2}}
  ]}
}"#;

const HDD_FAILING: &str = r#"{
  "device":{"name":"/dev/sdb","type":"sat","protocol":"ATA"},
  "model_name":"WDC WD10EZEX-08WN4A0","user_capacity":{"bytes":1000204886016},
  "rotation_rate":7200,
  "smart_status":{"passed":true},
  "temperature":{"current":45},
  "ata_smart_attributes":{"table":[
    {"id":5,"name":"Reallocated_Sector_Ct","value":140,"worst":140,"thresh":140,"when_failed":"now","raw":{"value":1500}},
    {"id":197,"name":"Current_Pending_Sector","value":200,"worst":200,"thresh":0,"when_failed":"","raw":{"value":24}},
    {"id":198,"name":"Offline_Uncorrectable","value":200,"worst":200,"thresh":0,"when_failed":"","raw":{"value":8}},
    {"id":187,"name":"Reported_Uncorrect","value":100,"worst":100,"thresh":0,"when_failed":"","raw":{"value":5}}
  ]}
}"#;

/// Echte uitvoer van smartctl 7.5 zonder root-rechten.
const PERMISSION_DENIED: &str = r#"{
  "smartctl":{"messages":[{"string":"Smartctl open device: /dev/sda failed: Permission denied","severity":"error"}],"exit_status":2},
  "local_time":{"time_t":1794558271}
}"#;

fn assessed(raw: &str) -> StorageHealthEntry {
    let (entry, findings) = parse_device(raw).expect("geldige smartctl-uitvoer");
    assess(entry, findings)
}

#[test]
fn smartctl_scan_lists_devices_with_type() {
    let devs = parse_scan(SCAN);
    assert_eq!(devs.len(), 2);
    assert_eq!(
        devs[1],
        ScannedDevice {
            name: "/dev/nvme0".into(),
            dev_type: "nvme".into()
        }
    );
    assert!(parse_scan("garbage").is_empty());
    assert!(parse_scan(r#"{"devices":[]}"#).is_empty());
}

#[test]
fn smartctl_healthy_nvme_is_good() {
    let d = assessed(NVME_HEALTHY);
    assert_eq!(d.model, "Samsung SSD 980 PRO 1TB");
    assert_eq!(
        (d.bus_type.as_str(), d.media_type.as_str()),
        ("NVMe", "SSD")
    );
    assert_eq!(d.size_bytes, 1_000_204_886_016);
    assert_eq!(d.health_status, "PASSED");
    assert_eq!(d.wear_percent, Some(3));
    assert_eq!(d.temperature_celsius, Some(41));
    assert_eq!(d.power_on_hours, Some(5678));
    assert_eq!(d.read_errors_uncorrected, Some(0));
    assert_eq!(d.verdict, VERDICT_GOOD, "{:?}", d.findings);
    assert!(d.findings.is_empty());
}

#[test]
fn smartctl_nvme_critical_warning_bits_are_decoded() {
    let d = assessed(NVME_READ_ONLY);
    assert_eq!(d.verdict, VERDICT_CRIT);
    assert_eq!(d.health_status, "FAILED");
    assert_eq!(d.wear_percent, Some(100), "104% wordt begrensd op 100%");
    assert_eq!(d.temperature_celsius, None, "0 °C betekent: niet gemeten");
    assert_eq!(d.read_errors_uncorrected, Some(17));
    let all = d.findings.join(" | ");
    assert!(all.contains("reserveblokken"), "{all}");
    assert!(all.contains("alleen-lezen"), "{all}");
    assert!(!all.contains("vluchtige"), "bit 4 staat niet aan: {all}");
    // Bronbevindingen (SMART faalt) komen vóór de algemene controles.
    assert!(d.findings[0].contains("SMART faalt"), "{all}");
}

#[test]
fn smartctl_nvme_warning_only_bits_give_let_op() {
    let findings = nvme_critical_warning_findings(0b1_0010);
    assert_eq!(findings.len(), 2);
    assert!(
        findings
            .iter()
            .all(|f| f.level == crate::storage::Level::Warning)
    );
    assert!(nvme_critical_warning_findings(0).is_empty());
}

#[test]
fn smartctl_sata_ssd_wear_from_normalized_attribute() {
    let d = assessed(SATA_SSD_WORN);
    assert_eq!(
        (d.bus_type.as_str(), d.media_type.as_str()),
        ("SATA", "SSD")
    );
    assert_eq!(d.wear_percent, Some(75)); // genormaliseerde waarde 25 = nog 25% over
    assert_eq!(d.reallocated_sectors, Some(3));
    assert_eq!(d.pending_sectors, None);
    assert_eq!(d.temperature_max_celsius, Some(61));
    assert_eq!(d.verdict, VERDICT_WARN);
    let all = d.findings.join(" | ");
    assert!(all.contains("3 omgewisselde"), "{all}");
    assert!(all.contains("75%"), "{all}");
}

#[test]
fn smartctl_failing_hdd_is_critical() {
    let d = assessed(HDD_FAILING);
    assert_eq!(d.media_type, "HDD");
    assert_eq!(d.reallocated_sectors, Some(1500));
    assert_eq!(d.pending_sectors, Some(24));
    assert_eq!(d.read_errors_uncorrected, Some(8), "hoogste van 187 en 198");
    assert_eq!(d.verdict, VERDICT_CRIT);
    let all = d.findings.join(" | ");
    assert!(all.contains("Reallocated_Sector_Ct (5)"), "{all}");
    assert!(all.contains("24 instabiele"), "{all}");
}

#[test]
fn smartctl_permission_denied_is_recognised() {
    assert!(matches!(
        parse_device(PERMISSION_DENIED),
        Err(DeviceError::PermissionDenied)
    ));
    assert!(matches!(parse_device("not json"), Err(DeviceError::Other)));
    assert!(matches!(
        parse_device(r#"{"smartctl":{"messages":[{"string":"Unknown USB bridge"}]}}"#),
        Err(DeviceError::Other)
    ));
}

#[test]
fn smartctl_findings_follow_language() {
    let d = crate::i18n::with_language(true, || assessed(HDD_FAILING));
    assert!(
        d.findings
            .iter()
            .any(|f| f.contains("pending") || f.contains("unstable"))
    );
    assert_eq!(d.verdict, VERDICT_CRIT, "oordeel blijft een code");
}
