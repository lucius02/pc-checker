import { describe, expect, it } from "vitest";
import { buildHealthInputs } from "./healthInputs";
import type { StorageHealthReport, SystemOverview } from "../types";

const overview = (): SystemOverview => ({
  os_name: "Windows",
  os_version: "11",
  host_name: "pc",
  kernel_version: "26200",
  kernel_uptime_secs: 100,
  session_uptime_secs: 100,
  session_started_at: "",
  cpu: { brand: "CPU", vendor_id: "", physical_cores: 4, logical_cores: 8, global_usage: 5, cores: [] },
  ram: { total_bytes: 1000, used_bytes: 456, free_bytes: 544, total_swap_bytes: 0, used_swap_bytes: 0 },
  disks: [
    { name: "C", mount_point: "C:\\", file_system: "NTFS", total_bytes: 100, available_bytes: 40, is_removable: false, disk_type: "SSD", storage_id: "C:\\" },
    { name: "D", mount_point: "D:\\", file_system: "NTFS", total_bytes: 100, available_bytes: 12.4, is_removable: false, disk_type: "HDD", storage_id: "D:\\" },
  ],
  gpus: [],
  motherboard: { manufacturer: "", product: "", bios_vendor: "", bios_version: "" },
});

const base = {
  coolingData: null,
  freezeData: null,
  batteryReport: null,
  driverReport: null,
  latencyResult: null,
  cpuResult: null,
  ramResult: null,
  diskResult: null,
};

describe("buildHealthInputs", () => {
  it("rounds live values and marks untested inputs as null", () => {
    const i = buildHealthInputs({ data: overview(), ...base });
    expect(i.ram_used_percent).toBe(46);
    expect(i.min_disk_free_percent).toBe(12);
    expect(i.max_temp_celsius).toBeNull();
    expect(i.freeze_scanned).toBe(false);
    expect(i.cpu_stress_ok).toBeNull();
    expect(i.storage_smart_warning_count).toBeNull();
    expect(i.storage_smart_critical_count).toBeNull();
  });

  it("passes SMART counts only when the scan was available", () => {
    const report: StorageHealthReport = {
      is_available: true,
      scanned_at: "",
      is_elevated: false,
      disks: [],
      warning_count: 2,
      critical_count: 1,
      summary: "",
    };
    const i = buildHealthInputs({ data: overview(), ...base, storageReport: report });
    expect(i.storage_smart_warning_count).toBe(2);
    expect(i.storage_smart_critical_count).toBe(1);

    const off = buildHealthInputs({ data: overview(), ...base, storageReport: { ...report, is_available: false } });
    expect(off.storage_smart_critical_count).toBeNull();
  });

  it("uses the hottest valid sensor and ignores zero readings", () => {
    const i = buildHealthInputs({
      data: overview(),
      ...base,
      coolingData: {
        fans: [],
        is_throttling_suspected: false,
        summary: "",
        temperatures: [
          { label: "a", temperature_celsius: 0, max_celsius: null, critical_celsius: null },
          { label: "b", temperature_celsius: 71.6, max_celsius: null, critical_celsius: null },
          { label: "c", temperature_celsius: 55, max_celsius: null, critical_celsius: null },
        ],
      },
    });
    expect(i.max_temp_celsius).toBe(72);
  });
});
